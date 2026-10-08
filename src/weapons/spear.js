// 창 「청룡」 — jade wind spear: piercing thrusts, phantom flurry, dragon lunge.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MeleeWeapon, SwingMove, trailDef } from './melee.js';
import { spearModel } from './models.js';
import { WeaponTrail } from '../vfx/fx.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { bladeQuat, clamp01, easing } from '../entities/pose.js';
import { hit, sectorQuery, softTarget, segmentQuery } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const C = [0.3, 1.9, 0.9];
const CORE = [2.4, 4, 3];

/** Wind burst at the spear tip (along `dir`). */
export function thrustFx(tip, dir, s = 1) {
  const fx = G.fx;
  fx.ring({ pos: tip, normal: dir, r0: 0.05, r1: 0.7 * s, w0: 0.16, w1: 0.03, color: [0.5, 1.6, 1.0], life: 0.14, sharp: 1 });
  fx.ring({ pos: tip.clone().addScaledVector(dir, 0.7 * s), normal: dir, r0: 0.03, r1: 0.45 * s, w0: 0.2, w1: 0.04, color: [0.35, 1.2, 0.7], life: 0.16, sharp: 1 });
  fx.line({ a: tip, b: tip.clone().addScaledVector(dir, 2.4 * s), width: 0.16 * s, color: [0.4, 1.8, 1.0], core: [2.5, 4, 3], coreWidth: 0.3, life: 0.12, headFade: 0.5, tailFade: 0.1 });
  fx.add.emit({ pos: tip, shape: SHAPE.STAR, size: 0.8 * s, sizeEnd: 0.05, life: 0.08, color: [2.2, 3.6, 2.8], alphaEnd: 0 });
  for (let i = 0; i < 6; i++) {
    const v = cone(dir, 0.35, new THREE.Vector3()).multiplyScalar(rand(8, 16) * s);
    fx.add.emit({ pos: tip, vel: v, shape: SHAPE.STREAK, size: 0.035, stretch: 0.03, life: rand(0.08, 0.16), color: [1, 3, 2], alphaEnd: 0, drag: 5 });
  }
  fx.distort({ pos: tip, r0: 0.1, r1: 1.0 * s, strength: 0.02, life: 0.15, normal: dir });
}

/**
 * Linear thrust move. spec: { dur, cancel, dashCancel, lunge, maxLunge, stopDist, lungeWin,
 *   thrusts: [{ t, ext, hold, ret, yaw, pitch, reach, hit:{...}, big }], ghost (phantom spears) }
 */
class ThrustMove {
  constructor(w, spec, comboIdx) {
    this.w = w; this.s = spec; this.comboIdx = comboIdx;
    this.isMelee = true;
    this.dur = spec.dur;
    this.moveScale = 0; this.ownsVelocity = true; this.legs = true; this.faceMove = false;
    this.fired = new Set();
    this.cam = spec.cam ?? null;
  }
  start() {
    const p = this.player, s = this.s;
    const tgt = softTarget(p.pos, p.intentDir(new THREE.Vector3()), 8, 140);
    this.target = tgt;
    if (tgt) {
      _v.subVectors(tgt.pos, p.pos); _v.y = 0;
      p.yaw = Math.atan2(_v.x, _v.z);
      this.lungeDist = THREE.MathUtils.clamp(_v.length() - tgt.radius - (s.stopDist ?? 1.9), 0, s.maxLunge ?? 3);
    } else {
      if (p.wishDir.lengthSq() > 0) p.yaw = Math.atan2(p.wishDir.x, p.wishDir.z);
      this.lungeDist = s.lunge ?? 0.6;
    }
    this.fwd = p.forward(new THREE.Vector3());
    p.vel.set(0, p.grounded ? 0 : 1, 0);
    p.gravityScale = p.grounded ? 1 : 0.1;
    G.audio?.play('whoosh', { pitch: 1.3, vol: 0.6 });
  }
  lungeK(t) { const [a, b] = this.s.lungeWin ?? [0.02, 0.12]; return easing.outCubic(clamp01((t - a) / (b - a))); }
  update(dt, prevT) {
    const p = this.player, s = this.s;
    const dk = this.lungeK(this.t) - this.lungeK(prevT);
    p.pos.addScaledVector(this.fwd, dk * this.lungeDist);
    s.thrusts.forEach((th, i) => {
      const peak = th.t + (th.ext ?? 0.05);
      if (!this.fired.has(i) && this.t >= peak) {
        this.fired.add(i);
        this.fire(th);
      }
    });
    const active = s.thrusts.some((th) => this.t >= th.t && this.t <= th.t + (th.ext ?? 0.05) + (th.hold ?? 0.04));
    this.w.trail.emitting = active;
  }
  ext(th, t) {
    const e = th.ext ?? 0.05, h = th.hold ?? 0.04, r = th.ret ?? 0.1;
    if (t < th.t - 0.06) return -1;
    if (t < th.t) return -0.25 * clamp01((t - th.t + 0.06) / 0.06);       // pull back (anticipation)
    if (t < th.t + e) return easing.outCubic((t - th.t) / e);
    if (t < th.t + e + h) return 1;
    if (t < th.t + e + h + r) return 1 - easing.inOutQuad((t - th.t - e - h) / r);
    return -1;
  }
  dirOf(th) {
    return new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), -(th.pitch ?? 0)).applyAxisAngle(UP, th.yaw ?? 0);
  }
  socketAt(t) {
    // the most recent thrust governs the pose
    let th = null, k = -1;
    for (const x of this.s.thrusts) { const e = this.ext(x, t); if (e > -1) { th = x; k = e; } }
    if (!th) return null;
    const d = this.dirOf(th);
    const base = new THREE.Vector3(-0.16, 1.12, -0.12);
    const hand = base.clone().addScaledVector(d, Math.max(-0.1, k) * (th.reach ?? 0.62));
    const q = new THREE.Quaternion();
    bladeQuat(q, d, UP);
    return { p: hand, q, d, k };
  }
  sampleSocket(t, side) {
    if (side !== 'R') return null;
    const sk = this.socketAt(t);
    if (!sk) return null;
    return { p: sk.p, q: sk.q, pose: { flip: 0, spin: 0 } };
  }
  pose(P, t) {
    const sk = this.socketAt(t);
    if (sk) {
      P.handR.copy(sk.p);
      P.wR.copy(sk.q);
      P.handL.copy(sk.p).addScaledVector(sk.d, 0.5);
      P.wL.copy(sk.q);
      P.lean = 0.15 + Math.max(0, sk.k) * 0.25;
      P.twist = 0.55 - Math.max(0, sk.k) * 0.25;
    }
    P.hip.y = 0.76;
    P.footR.set(-0.17, 0, -0.32); P.footL.set(0.2, 0, 0.36);
    P.elbowOut = 0.15;
  }
  poseWeight(t) { const end = this.dur; return 1 - easing.inOutQuad(clamp01((t - (end - 0.1)) / 0.1)); }
  cancelable(kind) { return kind === 'attack' ? this.t >= this.s.cancel : this.t >= (this.s.dashCancel ?? this.s.cancel); }
  fire(th) {
    const p = this.player;
    const sk = this.socketAt(th.t + (th.ext ?? 0.05));
    const dW = p.dirToWorld(sk.d, new THREE.Vector3());
    const tip = p.toWorld(sk.p.clone().addScaledVector(sk.d, this.w.bladeLen), new THREE.Vector3());
    thrustFx(tip, dW, th.big ? 1.6 : 1);
    if (this.s.ghost) G.fx.ghost(this.w.modelR, { color: [0.15, 0.8, 0.45], rim: [0.6, 3, 1.6], life: 0.22, alpha: 0.9 });
    const h = th.hit;
    if (!h) return;
    const origin = p.pos.clone();
    const targets = sectorQuery(origin, p.forward(new THREE.Vector3()), h.range ?? 3.4, h.arc ?? 50, -1.5, 2.6);
    for (const d of targets) {
      const dir = p.forward(new THREE.Vector3());
      hit(d, { dir, from: p.pos.clone().setY(1.2), kb: h.kb ?? 3, lift: h.lift ?? 0, hitstop: h.stop ?? 0.06, atkStop: h.atkStop ?? h.stop ?? 0.05, shake: h.shake ?? 0.12, kick: 0.6, kind: 'pierce', color: [0.4, 1, 0.6], dmg: Math.round((h.dmg ?? 90) * rand(0.9, 1.1)), sound: 'hitPierce', fxScale: h.fx ?? 1, spin: 0.7 });
    }
    if (targets.length && h.slowmo) G.slowmo(...h.slowmo);
    if (targets.length && h.chroma) G.screen.chroma(h.chroma, 0.2);
  }
  end() { this.w.trail.emitting = false; this.player.gravityScale = 1; this.w.lastMoveEnd = G.time; this.w.lastMove = this; }
}

export class Spear extends MeleeWeapon {
  constructor() {
    super();
    this.id = 'spear';
    this.name = '창 「청룡」';
    this.short = '창';
    this.icon = '槍';
    this.color = C; this.core = CORE;
    this.hitSound = 'hitPierce';
    this.desc = '<b>좌클릭</b> 찌르기 → 휘두르기 → 환영 난격 · <b>우클릭</b> 청룡 돌격 (관통 돌진)';
    this.modelR = spearModel();
    this.bladeLen = 1.95;
    this.trail = new WeaponTrail(G.fx, { color: [0.2, 1.4, 0.7], core: [2, 3.6, 2.6], maxAge: 0.1, coreWidth: 0.25, noise: 0.05 });
    this.trails = [this.trail];
    this.trailDefs = [trailDef(this.trail, [0, 1.55, 0], [0, 2.1, 0])];
    const T = (t, o = {}) => ({ t, ext: 0.045, hold: 0.04, ret: 0.09, reach: 0.62, ...o });
    this.combo = [
      { kind: 'thrust', dur: 0.34, cancel: 0.17, maxLunge: 2.4, thrusts: [T(0.07, { hit: { dmg: 95, kb: 3 } })] },
      { kind: 'thrust', dur: 0.34, cancel: 0.17, maxLunge: 2.2, thrusts: [T(0.06, { pitch: 0.12, yaw: 0.08, hit: { dmg: 100, kb: 3 } })] },
      { kind: 'swing', spec: { // shaft sweep
        dur: 0.5, cancel: 0.3, swing: [0.09, 0.19], follow: 0.12, over: 0.25, antic: 0.4, plane: { roll: -0.15 }, a0: -2.2, a1: 1.8,
        radius: 0.35, twoHanded: true, lunge: 0.8, center: [0.0, 1.15, 0.0], lean: 0.25, stance: 'low',
        hits: [{ t: 0.14, range: 3.6, arc: 200, dmg: 140, kb: 6.5, lift: 3, stop: 0.09, shake: 0.2, kind: 'slash', color: [0.4, 1.2, 0.6] }],
        slash: [{ width: 0.4, rIn: 1.4, rOut: 2.6, tail: 0.8 }, { width: 0.8, rIn: 0.5, rOut: 2.0, color: [0.04, 0.4, 0.18], core: [0.1, 0.9, 0.4], alpha: 0.6, tail: 1.2, fade: 0.3 }],
        whoosh: 'whooshBig', whooshPitch: 1.1,
      } },
      { kind: 'thrust', dur: 0.95, cancel: 0.8, dashCancel: 0.7, maxLunge: 2.0, ghost: true, cam: { dist: 6 },
        thrusts: [
          ...[0, 1, 2, 3, 4, 5, 6].map((i) => T(0.06 + i * 0.075, { ext: 0.03, hold: 0.015, ret: 0.03, yaw: rand(-0.3, 0.3), pitch: rand(-0.15, 0.25), hit: { dmg: 55, kb: 0.6, lift: 0.8, stop: 0.035, atkStop: 0.025, shake: 0.06, range: 3.6, arc: 70 } })),
          T(0.66, { ext: 0.05, hold: 0.08, ret: 0.12, reach: 0.72, big: true, hit: { dmg: 260, kb: 14, lift: 5, stop: 0.14, atkStop: 0.12, shake: 0.4, range: 4, arc: 50, fx: 1.5, slowmo: [0.25, 0.08, 0.2], chroma: 0.012 } }),
        ] },
    ];
  }

  light(p, a) {
    const list = this.combo;
    const i = this.chainIdx(p, a, list);
    const c = list[i];
    c.list = list;
    if (c.kind === 'swing') { c.spec.list = list; p.startAction(new SwingMove(this, c.spec, i)); }
    else p.startAction(new ThrustMove(this, c, i));
  }
  chainIdx(p, a, list) {
    const last = a?.isMelee && a.w === this ? a : this.lastMove;
    const recent = (a?.isMelee && a.w === this) || G.time - this.lastMoveEnd < 0.32;
    if (last && recent && (last.s.list === list || last.s === list[last.comboIdx]?.spec)) return (last.comboIdx + 1) % list.length;
    return 0;
  }

  heavy(p) { G.hud?.skill('청룡 돌격', 'AZURE DRAGON'); p.startAction(new DragonLunge(this)); }

  restPose(P, p) {
    P.handR.set(-0.3, 0.95, 0.05);
    bladeQuat(P.wR, _v.set(0.05, 0.85, 0.5), _v2.set(0, 0, 1));
    P.handL.copy(P.handR).add(_v.set(0.05, 0.85, 0.5).normalize().multiplyScalar(0.45));
    P.handL.x += 0.12;
  }
}

// ── Dragon lunge: charge, then pierce through everything in a line ───────────
class DragonLunge {
  constructor(w) {
    this.w = w; this.dur = 0.85; this.moveScale = 0; this.ownsVelocity = true; this.legs = true; this.faceMove = false;
    this.isMelee = true; this.s = { list: null, cancel: 0.7 };
    this.cam = { dist: 6.4 };
  }
  start() {
    const p = this.player;
    const tgt = softTarget(p.pos, p.intentDir(new THREE.Vector3()), 12, 120);
    if (tgt) { _v.subVectors(tgt.pos, p.pos); p.yaw = Math.atan2(_v.x, _v.z); }
    else if (p.wishDir.lengthSq() > 0) p.yaw = Math.atan2(p.wishDir.x, p.wishDir.z);
    this.fwd = p.forward(new THREE.Vector3());
    this.from = p.pos.clone();
    this.dist = tgt ? Math.min(11, _v.length() + 2.5) : 8;
    this.hitSet = new Set();
    p.vel.set(0, 0, 0);
    G.audio?.play('charge', { pitch: 1.2 });
    this.emitT = 0;
  }
  update(dt) {
    const p = this.player;
    const W0 = 0.24, W1 = 0.38;
    if (this.t < W0) {
      // gather wind into the spear tip
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = 0.015;
        const tip = p.toWorld(new THREE.Vector3(-0.16, 1.12, -0.45).addScaledVector(new THREE.Vector3(0, 0, 1), 1.9));
        const q = tip.clone().add(randUnit(_v).multiplyScalar(rand(0.8, 1.4)));
        G.fx.add.emit({ pos: q, vel: tip.clone().sub(q).multiplyScalar(1 / 0.14), shape: SHAPE.STREAK, size: 0.03, stretch: 0.05, life: 0.14, color: [0.6, 2.4, 1.4], alpha: 0, alphaEnd: 1 });
        if (Math.random() < 0.3) FXP.slideDust(p.pos, this.fwd, 0.5);
      }
    } else if (this.t < W1) {
      if (!this.go) {
        this.go = true;
        G.rig.fovPunch(8); G.screen.speedLines(1, 0.3); G.screen.radial(0.8, 0.25);
        G.audio?.play('dash', { pitch: 0.8 }); G.audio?.play('whooshBig', { pitch: 1.2 });
        FXP.dust(p.pos, 1.0, 8, this.fwd.clone().negate());
        G.fx.ring({ pos: p.pos.clone().setY(1.1), normal: this.fwd, r0: 0.3, r1: 2.2, w0: 0.15, w1: 0.02, color: [0.4, 1.6, 0.9], life: 0.25, sharp: 1 });
      }
      const k = (this.t - W0) / (W1 - W0);
      const prev = p.pos.clone();
      p.pos.copy(this.from).addScaledVector(this.fwd, easing.outCubic(Math.min(1, k)) * this.dist);
      // spiral drill around the spear tip
      const tip = p.toWorld(new THREE.Vector3(-0.1, 1.15, 0.5).addScaledVector(new THREE.Vector3(0, 0, 1), 1.9));
      for (let i = 0; i < 4; i++) {
        const a = G.time * 50 + i * Math.PI / 2;
        const right = new THREE.Vector3(-this.fwd.z, 0, this.fwd.x);
        const off = right.multiplyScalar(Math.cos(a) * 0.45).add(_v.set(0, Math.sin(a) * 0.45, 0));
        G.fx.add.emit({ pos: tip.clone().add(off), vel: this.fwd.clone().multiplyScalar(-6).add(off.clone().multiplyScalar(4)), shape: SHAPE.STREAK, size: 0.05, stretch: 0.05, life: 0.18, color: [0.5, 2.6, 1.4], alphaEnd: 0, drag: 3 });
      }
      G.fx.ring({ pos: tip, normal: this.fwd, r0: 0.1, r1: 0.8, w0: 0.2, w1: 0.04, color: [0.3, 1.4, 0.8], life: 0.12, sharp: 1 });
      G.fx.ghost(p.model.root, { color: [0.1, 0.7, 0.4], rim: [0.5, 2.8, 1.5], life: 0.25, alpha: 0.7 });
      // pierce everything we pass
      for (const d of G.dummies.list) {
        if (this.hitSet.has(d)) continue;
        _v.subVectors(d.pos, this.from); _v.y = 0;
        const along = _v.dot(this.fwd);
        const perp = _v.addScaledVector(this.fwd, -along).length();
        if (along > 0 && along < p.pos.distanceTo(this.from) + 1.5 && perp < 1.3 + d.radius) {
          this.hitSet.add(d);
          hit(d, { dir: this.fwd.clone(), kb: 1, hitstop: 0.12, shake: 0.12, kind: 'pierce', color: [0.4, 1, 0.6], dmg: 180, sound: 'hitPierce' });
        }
      }
    } else if (!this.done) {
      this.done = true;
      // delayed wind burst on everything pierced
      const pierced = [...this.hitSet];
      G.fx.line({ a: this.from.clone().setY(1.15), b: p.pos.clone().setY(1.15), width: 0.6, color: [0.3, 1.8, 0.9], core: [2.5, 4, 3], coreWidth: 0.2, life: 0.35, noise: 0.5, segments: 16 });
      FXP.dust(p.pos, 1.1, 8, this.fwd);
      setTimeout0(0.12, () => {
        for (const d of pierced) {
          const c = d.center(new THREE.Vector3());
          thrustFx(c.clone().addScaledVector(this.fwd, -0.6), this.fwd, 1.8);
          G.fx.ring({ pos: c, billboard: true, r0: 0.3, r1: 1.8, w0: 0.06, w1: 0.01, color: [0.3, 1.2, 0.65], life: 0.22, sharp: 1 });
          hit(d, { dir: this.fwd.clone(), kb: 12, lift: 7, hitstop: 0.12, shake: 0.0, kind: 'none', dmg: 320, sound: null, spin: 1.5 });
        }
        if (pierced.length) { G.rig.shake(0.4); G.screen.flash([0.7, 1, 0.8], 0.12, 0.08); G.slowmo(0.3, 0.1, 0.25); G.audio?.play('hitSlashBig', { pitch: 1.2 }); }
      });
    }
  }
  pose(P, t) {
    const W0 = 0.24;
    const back = t < W0;
    const d = new THREE.Vector3(0, 0, 1);
    const hand = new THREE.Vector3(-0.16, 1.1, back ? -0.45 : 0.4);
    P.handR.copy(hand);
    bladeQuat(P.wR, d, UP);
    P.handL.copy(hand).addScaledVector(d, 0.5);
    P.wL.copy(P.wR);
    P.hip.y = back ? 0.64 : 0.74;
    P.lean = back ? 0.3 : 0.55;
    P.twist = back ? 0.7 : 0.25;
    P.footR.set(-0.2, 0, back ? -0.45 : -0.55); P.footL.set(0.22, 0, back ? 0.35 : 0.5);
  }
  poseWeight(t) { return 1 - clamp01((t - 0.7) / 0.15); }
  cancelable(kind) { return this.t > 0.6; }
  end() { this.player.gravityScale = 1; }
}

function setTimeout0(sec, fn) { G.fx.spawn(new THREE.Object3D(), sec, null, G.scene, { onEnd: fn }); }
