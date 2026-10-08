// Melee framework. A swing is an analytic arc in a (rotated) plane around a
// pivot near the chest. The same arc parameters drive the arm/blade pose, the
// weapon trail sub-sampling, the crescent slash VFX and the hit sector, so the
// effect always matches the motion.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { bladeQuat, easing, clamp01, remap01 } from '../entities/pose.js';
import { hit, sectorQuery, softTarget } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export function planeQuat(pl = {}) {
  // order: yaw (around up), then roll (tilt around forward), then pitch
  _e.set(pl.pitch ?? 0, pl.yaw ?? 0, pl.roll ?? 0, 'YZX');
  return new THREE.Quaternion().setFromEuler(_e);
}

/** Reflect a rotation across the body's YZ plane (left/right mirror). */
export function mirrorQ(q) { return new THREE.Quaternion(q.x, -q.y, -q.z, q.w); }

// swing easing: very fast start, soft end (anime snap)
export const snapEase = (t) => 1 - Math.pow(1 - t, 3.2);

/**
 * spec: {
 *   dur, cancel, dashCancel, swing:[t0,t1], follow (s), over (rad), antic (rad),
 *   plane:{yaw,roll,pitch}, center:[x,y,z], radius, a0, a1, twoHanded, offHand:[x,y,z],
 *   lunge, maxLunge, stopDist, lean, crouch, stance,
 *   hits:[{t, range, arc, dmg, kb, lift, stop, atkStop, shake, kick, kind, color, launch}],
 *   slash: {...fx.slash overrides} | [..] | null, onStart(move), onEvent:[{t, fn(move)}],
 *   air: bool, airLift, gravity, spinTurns, flipTurns
 * }
 */
export class SwingMove {
  constructor(weapon, spec, comboIdx = 0) {
    this.w = weapon;
    this.s = spec;
    this.comboIdx = comboIdx;
    this.isMelee = true;
    this.dur = spec.dur;
    this.moveScale = spec.moveScale ?? 0.0;
    this.ownsVelocity = true;
    this.legs = true;
    this.faceMove = false;
    this.planeQ = planeQuat(spec.plane);
    this.dir = Math.sign((spec.a1 ?? 0) - (spec.a0 ?? 0)) || 1;
    this.events = [];
    for (const h of spec.hits ?? []) this.events.push({ t: h.t, hit: h });
    for (const e of spec.onEvent ?? []) this.events.push(e);
    this.slashDone = false;
    this.hitAny = false;
    this.startPos = new THREE.Vector3();
    this.lungeDist = 0;
    this.cam = spec.cam ?? null;
  }

  start() {
    const p = this.player, s = this.s;
    const dir = p.intentDir(new THREE.Vector3());
    const tgt = softTarget(p.pos, dir, s.lockRange ?? 7.5, s.lockArc ?? 150);
    this.target = tgt;
    if (tgt) {
      _v.subVectors(tgt.pos, p.pos); _v.y = 0;
      p.yaw = Math.atan2(_v.x, _v.z);
      const dist = _v.length() - tgt.radius - (s.stopDist ?? 0.9);
      this.lungeDist = THREE.MathUtils.clamp(dist, s.minLunge ?? 0, s.maxLunge ?? 3.6);
    } else {
      if (p.wishDir.lengthSq() > 0) p.yaw = Math.atan2(p.wishDir.x, p.wishDir.z);
      this.lungeDist = s.lunge ?? 0.6;
    }
    this.startPos.copy(p.pos);
    this.fwd = p.forward(new THREE.Vector3());
    this.air = !p.grounded;
    if (this.air) {
      p.vel.y = s.airLift ?? Math.max(1.5, p.vel.y * 0.2);
      p.gravityScale = s.gravity ?? 0.12;
    } else {
      p.gravityScale = 1;
      if (s.jumpVel) { p.vel.y = s.jumpVel; p.grounded = false; p.gravityScale = s.gravity ?? 1; }
    }
    p.vel.x = 0; p.vel.z = 0;
    this.trailOn = false;
    G.audio?.play(s.whoosh ?? 'whoosh', { vol: s.whooshVol ?? 0.8, pitch: s.whooshPitch ?? 1, delay: Math.max(0, (s.swing?.[0] ?? 0) - 0.02) });
    s.onStart?.(this);
  }

  lungeK(t) {
    const s = this.s;
    const [l0, l1] = s.lungeWin ?? [s.swing?.[0] * 0.5 ?? 0, s.swing?.[1] ?? 0.1];
    return easing.outCubic(remap01(t, l0, l1));
  }

  update(dt, prevT) {
    const p = this.player, s = this.s;
    const t = this.t;
    // root motion
    const dk = this.lungeK(t) - this.lungeK(prevT);
    if (dk !== 0) {
      p.pos.addScaledVector(this.fwd, dk * this.lungeDist);
    }
    if (this.air || s.jumpVel) {
      if (s.vy !== undefined && t < (s.vyUntil ?? 1)) p.vel.y = s.vy;
    }
    // trail window
    const [w0, w1] = s.swing ?? [0, 0];
    const on = t >= w0 - 0.015 && t <= w1 + (s.trailHold ?? 0.05);
    for (const d of this.w.trailDefs ?? []) d.trail.emitting = on && this.usesSide(d.socket);
    // slash fx at swing start
    if (!this.slashDone && t >= w0 - 0.001 && s.slash !== null) {
      this.slashDone = true;
      this.spawnSlash();
    }
    // events
    for (const e of this.events) {
      if (e.t > prevT && e.t <= t) {
        if (e.hit) this.doHit(e.hit);
        if (e.fn) e.fn(this);
      }
    }
    s.update?.(this, dt);
  }

  usesSide(side) {
    const h = this.s.hand ?? 'R';
    if (h === 'both') return true;
    if (side === 'R') return h === 'R';
    return h === 'L' || (this.s.twoHanded && false);
  }

  /** Arc angle at time t. */
  theta(t) {
    const s = this.s;
    const [w0, w1] = s.swing;
    const antic = (s.antic ?? 0.25) * -this.dir;
    if (t < w0) {
      const k = easing.outCubic(clamp01(t / Math.max(w0, 1e-3)));
      return s.a0 + antic * k;
    }
    if (t < w1) {
      const k = (s.ease ?? snapEase)(clamp01((t - w0) / (w1 - w0)));
      return s.a0 + antic * (1 - k) + (s.a1 - s.a0) * k;
    }
    const k = easing.outCubic(clamp01((t - w1) / (s.follow ?? 0.12)));
    return s.a1 + (s.over ?? 0.2) * this.dir * k;
  }

  /** Socket (hand) position + weapon orientation at time t in root space. */
  socketAt(t, P = null) {
    const s = this.s;
    const th = this.theta(t);
    const c = s.center ?? [-0.08, 1.28, 0.12];
    const r = s.radius ?? 0.5;
    const radial = _v.set(Math.sin(th), 0, Math.cos(th)).applyQuaternion(this.planeQ);
    const tangent = _v2.set(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(this.dir).applyQuaternion(this.planeQ);
    const hand = new THREE.Vector3(c[0], c[1], c[2]).addScaledVector(radial, r);
    // blade leans slightly along the motion for a dynamic look
    const blade = _v3.copy(radial).addScaledVector(tangent, -(s.bladeLag ?? 0.15)).normalize();
    const q = new THREE.Quaternion();
    bladeQuat(q, blade, tangent);
    if (s.bladeRoll) { _q.setFromAxisAngle(_v.set(0, 1, 0), s.bladeRoll); q.multiply(_q); }
    return { p: hand, q, radial: radial.clone(), tangent: tangent.clone(), blade: blade.clone() };
  }

  sampleSocket(t, side) {
    const h = this.s.hand ?? 'R';
    if (side === 'L' && h === 'R' && !this.s.twoHanded) return null;
    if (side === 'R' && h === 'L') return null;
    const res = this.socketAt(t);
    if (side === 'L') {
      if (h === 'L' || h === 'both') { res.p.x = -res.p.x; res.q = mirrorQ(res.q); }
      else res.p.addScaledVector(res.blade, -0.2);
    }
    // pose flip/spin at time t
    const P = this._tmpPose ?? (this._tmpPose = { flip: 0, spin: 0 });
    P.flip = this.flipAt(t); P.spin = this.spinAt(t);
    res.pose = P;
    return res;
  }

  flipAt(t) { const s = this.s; return s.flipTurns ? -Math.PI * 2 * s.flipTurns * easing.inOutQuad(remap01(t, s.swing[0] - 0.05, s.swing[1] + 0.05)) : 0; }
  spinAt(t) { const s = this.s; return s.spinTurns ? Math.PI * 2 * s.spinTurns * easing.outCubic(remap01(t, s.spinWin?.[0] ?? s.swing[0], s.spinWin?.[1] ?? s.swing[1])) * this.dir : 0; }

  pose(P, t) {
    const s = this.s;
    const [w0, w1] = s.swing;
    const sk = this.socketAt(t);
    // windup blend from rest → swing
    const inK = easing.outCubic(clamp01(t / Math.max(w0 * 0.7, 0.02)));
    const hand = s.hand ?? 'R';
    if (hand === 'L' || hand === 'both') {
      const mp = sk.p.clone(); mp.x = -mp.x;
      P.handL.lerp(mp, inK);
      P.wL.slerp(mirrorQ(sk.q), inK);
    }
    if (hand === 'R' || hand === 'both') {
      P.handR.lerp(sk.p, inK);
      P.wR.slerp(sk.q, inK);
    } else if (s.offHand) {
      const oh = s.offHand;
      P.handR.lerp(_v.set(-oh[0], oh[1], oh[2]), clamp01((t - w0 * 0.5) / 0.08));
    }
    if (hand !== 'R') {
      // mirrored torso twist handled below via sign
    } else if (s.twoHanded) {
      P.handL.copy(sk.p).addScaledVector(sk.blade, -0.2);
      P.wL.copy(sk.q);
    } else if (s.offHand) {
      const oh = s.offHand;
      const k = clamp01((t - w0 * 0.5) / 0.08);
      P.handL.lerp(_v.set(oh[0], oh[1], oh[2]), k);
    }
    // torso follows the blade's horizontal direction
    const hz = Math.atan2(sk.radial.x, Math.max(0.2, sk.radial.z + 0.6));
    const tw = hand === 'L' ? -1 : hand === 'both' ? 0.3 : 1;
    P.twist = THREE.MathUtils.clamp(hz * (s.twistAmt ?? 0.45) * tw, -0.9, 0.9);
    const swingK = clamp01((t - w0) / (w1 - w0 + 1e-3));
    P.lean = t < w0 ? -0.12 * inK + (s.windLean ?? 0) : (s.lean ?? 0.3) * easing.outCubic(swingK);
    P.roll = (s.roll ?? 0) * swingK;
    P.elbowOut = s.elbowOut ?? 0.3;
    // stance
    if (!this.air || s.stance === 'air') {
      const st = s.stance ?? 'normal';
      if (this.air) {
        P.footR.set(-0.14, 0.38, 0.15); P.footL.set(0.14, 0.2, -0.12); P.hip.y = 0.9;
      } else if (st === 'low') {
        P.hip.y = 0.68; P.footR.set(-0.2, 0, -0.42); P.footL.set(0.22, 0, 0.42);
      } else {
        P.hip.y = 0.8 - (s.crouch ?? 0) * swingK;
        P.footR.set(-0.17, 0, -0.26); P.footL.set(0.19, 0, 0.3);
      }
    } else {
      P.footR.set(-0.14, 0.38, 0.15); P.footL.set(0.14, 0.2, -0.12); P.hip.y = 0.9;
    }
    P.flip = this.flipAt(t);
    P.spin = this.spinAt(t);
    s.posePost?.(P, t, this, sk);
  }

  poseWeight(t) {
    const s = this.s;
    const rec = s.recover ?? (s.swing[1] + (s.follow ?? 0.12) + 0.05);
    return 1 - easing.inOutQuad(clamp01((t - rec) / Math.max(this.dur - rec, 0.01)));
  }

  cancelable(kind) {
    const s = this.s;
    if (kind === 'attack') return this.t >= s.cancel;
    return this.t >= (s.dashCancel ?? s.swing[1]);
  }

  spawnSlash() {
    const s = this.s;
    const p = this.player;
    const list = Array.isArray(s.slash) ? s.slash : [s.slash ?? {}];
    const [w0, w1] = s.swing;
    // where will we be at swing end (lunge)
    const pos = this.startPos.clone().addScaledVector(this.fwd, this.lungeK(w1) * this.lungeDist);
    pos.y = p.pos.y;
    const c = s.center ?? [-0.08, 1.28, 0.12];
    const r = s.radius ?? 0.5;
    const rootQ = _q.setFromAxisAngle(UP, p.yaw).clone();
    const baseColor = this.w.color ?? [0.5, 1.2, 3];
    const hand = s.hand ?? 'R';
    const sides = hand === 'both' ? [1, -1] : hand === 'L' ? [-1] : [1];
    for (const mir of sides) for (const sl of list) {
      const center = new THREE.Vector3(c[0] * mir, c[1], c[2]);
      const world = center.applyQuaternion(rootQ).add(pos);
      if (sl.offset) world.add(new THREE.Vector3(sl.offset[0] * mir, sl.offset[1], sl.offset[2]).applyQuaternion(rootQ));
      let pq = this.planeQ.clone();
      if (sl.extraRot) pq.multiply(planeQuat(sl.extraRot));
      if (mir < 0) pq = mirrorQ(pq);
      const q = rootQ.clone().multiply(pq);
      const bl = this.w.bladeLen ?? 1.0;
      const A0 = s.a0 + (sl.da0 ?? -0.15) * this.dir, A1 = s.a1 + (sl.da1 ?? (s.over ?? 0.2)) * this.dir;
      G.fx.slash({
        pos: world, quat: q,
        a0: A0 * mir, a1: A1 * mir,
        rIn: (sl.rIn ?? r + 0.1) * (sl.scale ?? 1), rOut: (sl.rOut ?? r + bl + 0.45) * (sl.scale ?? 1),
        sweep: sl.sweep ?? (w1 - w0) * 1.05, hold: sl.hold ?? 0.03, fade: sl.fade ?? 0.2,
        color: sl.color ?? baseColor, core: sl.core ?? this.w.core ?? [4, 4.5, 5],
        width: sl.width ?? 0.75, tail: sl.tail ?? 1.0, streak: sl.streak ?? 0.75, alpha: sl.alpha ?? 1,
        expand: sl.expand ?? 0.1, renderOrder: sl.renderOrder, cone: sl.cone,
      });
    }
  }

  doHit(h) {
    const p = this.player;
    const fwd = p.forward(new THREE.Vector3());
    const origin = p.pos.clone();
    const yMin = h.yMin ?? -1.5, yMax = h.yMax ?? 2.6;
    const targets = h.sphere
      ? null
      : sectorQuery(origin, fwd, h.range ?? 2.6, h.arc ?? 160, yMin, yMax);
    if (!targets || !targets.length) { h.miss?.(this); return; }
    const sk = this.socketAt(h.t);
    const tangentW = p.dirToWorld(sk.tangent, new THREE.Vector3());
    let n = 0;
    for (const d of targets) {
      if (h.max && n >= h.max) break;
      n++;
      _v.subVectors(d.pos, p.pos); _v.y = 0;
      if (_v.lengthSq() < 1e-6) _v.copy(fwd);
      _v.normalize();
      const dir = h.dirMode === 'forward' ? fwd.clone() : h.dirMode === 'tangent' ? tangentW.clone().setY(0).normalize() : _v.clone();
      const from = p.pos.clone().setY(p.pos.y + (h.fromY ?? 1.2));
      hit(d, {
        dir, from, kb: h.kb ?? 4, lift: h.lift ?? 0, hitstop: h.stop ?? 0.07, atkStop: h.atkStop ?? h.stop ?? 0.07,
        shake: h.shake ?? 0.16, kick: h.kick ?? 0.8, kind: h.kind ?? 'slash', color: h.color ?? this.w.color,
        tangent: tangentW, dmg: Math.round((h.dmg ?? 100) * (0.9 + Math.random() * 0.2)), spin: h.spin ?? 1,
        fxScale: h.fxScale ?? 1, sound: h.sound ?? this.w.hitSound, pitch: h.pitch, set: h.set ? h.set(d, this) : undefined,
        fx: h.fx, crit: h.crit,
      });
      this.hitAny = true;
    }
    if (h.onHit) h.onHit(this, targets);
    if (n > 0) {
      if (h.flash) G.screen.flash(h.flash, h.flashA ?? 0.25, 0.07);
      if (h.chroma) G.screen.chroma(h.chroma, 0.2);
      if (h.radial) G.screen.radial(h.radial, 0.2);
      if (h.fov) G.rig.fovPunch(h.fov);
      if (h.slowmo) G.slowmo(...h.slowmo);
    }
  }

  onLand(speed) { this.s.onLand?.(this, speed); }

  end() {
    for (const d of this.w.trailDefs ?? []) d.trail.emitting = false;
    this.player.gravityScale = 1;
    this.w.lastMoveEnd = G.time;
    this.w.lastMove = this;
  }
}

/** Base melee weapon with light combo / heavy / air combo & input buffer. */
export class MeleeWeapon {
  constructor() {
    this.category = 'melee';
    this.combo = [];
    this.airCombo = [];
    this.buffer = null;
    this.lastMoveEnd = -10;
    this.lastMove = null;
    this.trails = [];
    this.trailDefs = [];
  }
  equip(p) {
    p.model.sockR.add(this.modelR);
    if (this.modelL) p.model.sockL.add(this.modelL);
    for (const d of this.trailDefs) p.trails.push(d);
  }
  unequip(p) {
    this.modelR.parent?.remove(this.modelR);
    this.modelL?.parent?.remove(this.modelL);
    p.trails = p.trails.filter((d) => !this.trailDefs.includes(d));
    for (const d of this.trailDefs) d.trail.clear();
    this.buffer = null;
  }
  press(p, btn) { this.buffer = { btn, t: G.time }; this.consume(p); }
  update(p) { this.consume(p); }
  consume(p) {
    const b = this.buffer;
    if (!b) return;
    if (G.time - b.t > 0.45) { this.buffer = null; return; }
    const a = p.action;
    if (a && !a.cancelable?.('attack')) return;
    this.buffer = null;
    if (b.btn === 0) this.light(p, a);
    else this.heavy(p, a);
  }
  chainIdx(p, a, list) {
    const last = a?.isMelee && a.w === this ? a : this.lastMove;
    const recent = (a?.isMelee && a.w === this) || G.time - this.lastMoveEnd < 0.32;
    if (last && recent && last.s.list === list) return (last.comboIdx + 1) % list.length;
    return 0;
  }
  light(p, a) {
    const list = !p.grounded && this.airCombo.length ? this.airCombo : this.combo;
    const i = this.chainIdx(p, a, list);
    const spec = list[i];
    spec.list = list;
    p.startAction(new SwingMove(this, spec, i));
  }
  heavy(p, a) {}
}

/** Builds a weapon trail registration. */
export function trailDef(trail, base, tip, socket = 'R') {
  return { trail, base: new THREE.Vector3(...base), tip: new THREE.Vector3(...tip), socket };
}
