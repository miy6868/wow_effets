// 대검 「염화」 — slow, crushing, fire-rune greatsword.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MeleeWeapon, SwingMove, trailDef } from './melee.js';
import { greatswordModel } from './models.js';
import { WeaponTrail } from '../vfx/fx.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { bladeQuat, clamp01, easing } from '../entities/pose.js';
import { hit } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const C = [1.9, 0.55, 0.1];
const CORE = [3.4, 2.4, 1.2];

function layers(extra = {}) {
  const sc = extra.scale ?? 1;
  return [
    { ink: true, rIn: 1.6 * sc, rOut: 2.85 * sc, width: 0.36, color: [0.06, 0.02, 0.02], alpha: 0.7, tail: 0.8, fade: 0.18, streak: 0.6, cone: 0.15, da0: -0.25 },
    { width: 0.5, tail: 1.1, streak: 0.9, fade: 0.28, ...extra },
    { rIn: 2.45 * sc, rOut: 3.0 * sc, width: 0.3, color: [1.6, 0.8, 0.25], core: [2.6, 2, 1.3], tail: 0.5, fade: 0.14, streak: 0.3, cone: 0.06 },
    { rIn: 0.4, rOut: 2.2 * sc, width: 0.9, color: [0.5, 0.08, 0.015], core: [0.9, 0.25, 0.06], alpha: 0.55, tail: 1.6, fade: 0.4, streak: 1 },
  ];
}

/** Ground cracks + rock spray + dust ring at a point. */
export function groundImpact(pos, s = 1, color = [3, 1.0, 0.25]) {
  const fx = G.fx;
  const p = pos.clone(); p.y = 0.05;
  fx.decal({ pos: p, size: 3.4 * s, type: 1, color, glow: 1.6, life: 5, reveal: 0.16, glowPow: 2 });
  fx.decal({ pos: p, size: 2.2 * s, type: 0, color, glow: 0.5, life: 5, alpha: 0.55 });
  fx.ring({ pos: p.clone().setY(0.1), normal: UP, r0: 0.4 * s, r1: 5.0 * s, w0: 0.1, w1: 0.012, color: [1.8, 1.1, 0.5], life: 0.38, sharp: 1 });
  fx.ring({ pos: p.clone().setY(0.15), normal: UP, r0: 0.3 * s, r1: 3.2 * s, w0: 0.35, w1: 0.05, color: [0.6, 0.22, 0.06], life: 0.45, noise: 0.25 });
  fx.add.emit({ pos: p.clone().setY(0.6), shape: SHAPE.SPIKES, size: 3.4 * s, sizeEnd: 4.6 * s, life: 0.12, color: [1.6, 0.9, 0.35], alphaEnd: 0 });
  fx.add.emit({ pos: p.clone().setY(0.4), shape: SHAPE.GLOW, size: 1.8 * s, sizeEnd: 2.6 * s, life: 0.16, color: [1.0, 0.4, 0.1], alpha: 0.8, alphaEnd: 0 });
  // erupting rock shards
  for (let i = 0; i < 16 * s; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(0.3, 1.6) * s;
    fx.debris.rock.emit({ pos: p.clone().add(_v.set(Math.cos(a) * r, 0.2, Math.sin(a) * r)), vel: _v2.set(Math.cos(a) * rand(2, 6), rand(6, 13), Math.sin(a) * rand(2, 6)), scale: rand(0.08, 0.2) * s, life: rand(1.2, 2.0) });
  }
  // dust ring rolling outward
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rand(-0.1, 0.1);
    fx.puffs.emit({ pos: p.clone().add(_v.set(Math.cos(a) * 0.9 * s, 0.2, Math.sin(a) * 0.9 * s)), vel: _v2.set(Math.cos(a) * rand(6, 9) * s, rand(0.5, 1.5), Math.sin(a) * rand(6, 9) * s), size: rand(0.16, 0.26) * s, sizeEnd: rand(0.45, 0.65) * s, life: rand(0.45, 0.7), mode: PUFF.SMOKE, color: [0.66, 0.62, 0.68], shade: [0.38, 0.35, 0.48], drag: 5, rise: 0.8, dissolveStart: 0.12, stretch: 0.8 });
  }
  // embers
  for (let i = 0; i < 26 * s; i++) {
    randUnit(_v2); _v2.y = Math.abs(_v2.y) + 0.2;
    fx.add.emit({ pos: p.clone().setY(0.3), vel: _v2.normalize().multiplyScalar(rand(4, 14)), shape: SHAPE.STREAK, size: 0.06, stretch: 0.03, life: rand(0.3, 0.7), color: [4, 2, 0.6], colorEnd: [1.6, 0.25, 0.04], alphaEnd: 0, drag: 2.5, gravity: 16 });
  }
  fx.light(p.clone().setY(1.2), [1, 0.5, 0.2], 3, 7 * s, 0.3);
  G.rig.shake(0.5 * s);
  G.rig.kick(UP.clone().multiplyScalar(-1), 1.5 * s);
  G.audio?.play('slam', { pos: p, vol: 1 });
}

/** Erupting ring of fire pillars (charged slam). */
function flameRing(pos, s, n = 10) {
  const fx = G.fx;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
    const r = 1.9 * s;
    const q = pos.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r));
    for (let k = 0; k < 3; k++) {
      fx.puffs.emit({ pos: q.clone().setY(0.2 + k * 0.35), vel: _v2.set(Math.cos(a) * 1.2, rand(6, 10), Math.sin(a) * 1.2), size: rand(0.2, 0.3) * s, sizeEnd: rand(0.06, 0.12), life: rand(0.4, 0.6), mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: rand(0.8, 1.0), drag: 3, rise: 3, dissolveStart: 0.35, grow: 'in', stretch: 1.5 });
    }
  }
}

export class Greatsword extends MeleeWeapon {
  constructor() {
    super();
    this.id = 'greatsword';
    this.name = '대검 「염화」';
    this.short = '대검';
    this.icon = '劍';
    this.color = C;
    this.core = CORE;
    this.hitSound = 'hitHeavy';
    this.desc = '<b>좌클릭</b> 3연 강타 · <b>우클릭 꾹</b> 차지 → 도약 내려찍기 · <b>공중 좌클릭</b> 낙하 강타';
    this.modelR = greatswordModel(0xff7a2a);
    this.bladeLen = this.modelR.userData.bladeLen;
    this.trail = new WeaponTrail(G.fx, { color: [2.2, 0.6, 0.1], core: [4, 2.5, 1], maxAge: 0.16, coreWidth: 0.2, noise: 0.1 });
    this.trails = [this.trail];
    this.trailDefs = [trailDef(this.trail, [0, 0.45, 0], [0, 2.0, 0])];
    this.charging = null;

    const H = (o) => ({ range: 3.6, arc: 180, kb: 7, stop: 0.13, atkStop: 0.12, shake: 0.32, kick: 1.4, dmg: 280, kind: 'heavy', fxScale: 1.1, ...o });

    this.combo = [
      { // 1: wide right→left sweep
        dur: 0.78, cancel: 0.5, dashCancel: 0.42, swing: [0.22, 0.34], follow: 0.18, over: 0.4, antic: 0.55,
        plane: { roll: -0.12 }, a0: -2.2, a1: 1.9, radius: 0.42, twoHanded: true, lunge: 1.0, maxLunge: 2.5, stopDist: 1.4,
        center: [-0.05, 1.2, 0.15], lean: 0.35, crouch: 0.1, stance: 'low', windLean: -0.05,
        hits: [H({ t: 0.28, dmg: 260 })], slash: layers(), whoosh: 'whooshBig', whooshPitch: 0.8,
        onEvent: [{ t: 0.06, fn: (m) => chargeGlint(m) }],
      },
      { // 2: overhead chop into the ground
        dur: 0.9, cancel: 0.6, dashCancel: 0.5, swing: [0.26, 0.35], follow: 0.12, over: 0.15, antic: 0.5,
        plane: { roll: Math.PI / 2, yaw: 0.08 }, a0: 2.5, a1: -1.0, radius: 0.45, twoHanded: true, lunge: 1.2, maxLunge: 2.5, stopDist: 1.6,
        center: [-0.05, 1.3, 0.1], lean: 0.55, crouch: 0.18, stance: 'low', windLean: -0.25,
        hits: [H({ t: 0.32, dmg: 340, kb: 3, lift: 10, stop: 0.16, atkStop: 0.15, shake: 0.4, arc: 90, range: 3.8, fxScale: 1.25, sound: 'hitHeavy' })],
        slash: layers({ scale: 1.05 }), whoosh: 'whooshBig', whooshPitch: 0.7,
        onEvent: [
          { t: 0.08, fn: (m) => chargeGlint(m) },
          { t: 0.345, fn: (m) => { const tip = m.player.toWorld(new THREE.Vector3(-0.05, 0, 2.1)); groundImpact(tip, 0.9); } },
        ],
      },
      { // 3: tornado spin
        dur: 1.15, cancel: 0.85, dashCancel: 0.75, swing: [0.24, 0.6], follow: 0.16, over: 0.2, antic: 0.4,
        plane: { roll: -0.1 }, a0: -1.0, a1: 1.0, radius: 0.45, twoHanded: true, spinTurns: 1.5, spinWin: [0.22, 0.62],
        lunge: 1.5, lungeWin: [0.2, 0.6], maxLunge: 3, center: [-0.05, 1.15, 0.1], lean: 0.2, stance: 'low', crouch: 0.15, cam: { dist: 6.6 },
        hits: [
          H({ t: 0.33, arc: 360, dmg: 150, kb: 2, stop: 0.07, atkStop: 0.06, shake: 0.18, fxScale: 0.9 }),
          H({ t: 0.45, arc: 360, dmg: 150, kb: 2, stop: 0.07, atkStop: 0.06, shake: 0.18, fxScale: 0.9 }),
          H({ t: 0.58, arc: 360, dmg: 420, kb: 17, lift: 8, stop: 0.18, atkStop: 0.17, shake: 0.6, kick: 2, fxScale: 1.5, flash: [1, 0.8, 0.5], flashA: 0.2, chroma: 0.015, fov: 5, slowmo: [0.2, 0.12, 0.3] }),
        ],
        slash: [
          { da0: -0.3, da1: Math.PI * 3 - 2 + 0.3, sweep: 0.38, width: 0.4, tail: 0.5, scale: 1.1, rIn: 1.0, rOut: 2.9, fade: 0.25, cone: 0.25 },
          { da0: -0.3, da1: Math.PI * 3 - 2 + 0.3, sweep: 0.36, rIn: 2.7, rOut: 3.2, width: 0.3, color: [1.6, 0.8, 0.25], core: [2.6, 2, 1.3], tail: 0.35, fade: 0.14, cone: 0.06 },
          { da0: -0.3, da1: Math.PI * 3 - 2 + 0.3, sweep: 0.4, rIn: 0.6, rOut: 2.3, width: 0.8, color: [0.45, 0.07, 0.01], core: [0.8, 0.2, 0.05], alpha: 0.4, tail: 0.8, fade: 0.35, cone: 0.25 },
        ],
        whoosh: 'whooshBig', whooshPitch: 0.75,
        onEvent: [
          { t: 0.2, fn: (m) => { FXP.dust(m.player.pos, 1.2, 10); } },
          { t: 0.3, fn: (m) => flameSwirl(m) }, { t: 0.42, fn: (m) => flameSwirl(m) }, { t: 0.54, fn: (m) => flameSwirl(m) },
        ],
      },
    ];
    this.airCombo = [this.plungeSpec(1)];
  }

  plungeSpec(s = 1) {
    return {
      dur: 1.4, cancel: 1.4, dashCancel: 1.4, swing: [0.16, 0.24], follow: 0.12, over: 0.1, antic: 0.6,
      plane: { roll: Math.PI / 2 }, a0: 2.6, a1: -1.1, radius: 0.45, twoHanded: true, air: true, gravity: 0, airLift: 3,
      lunge: 0.8, vy: -34, vyUntil: 9, center: [-0.05, 1.3, 0.1], lean: 0.5,
      hits: [{ t: 0.2, range: 3.4, arc: 140, kb: 1, stop: 0.08, atkStop: 0.06, shake: 0.2, dmg: 200, kind: 'heavy', yMin: -4, yMax: 3, set: (d, m) => m.fwd.clone().multiplyScalar(2).setY(-26) }],
      slash: layers(),
      update: (m) => { if (m.t > 0.18 && m.player.vel.y > -34) m.player.vel.y = -34; },
      onLand: (m) => { groundImpact(m.player.pos.clone().addScaledVector(m.fwd, 1.2), 1.0 * s); slamKnock(m.player.pos, 3.5 * s, 8, 9); m.dur = m.t + 0.35; },
      posePost: (P, t) => { if (t > 0.22) { P.hip.y = 0.62; P.footR.set(-0.22, 0, -0.4); P.footL.set(0.22, 0, 0.42); } },
    };
  }

  restPose(P, p) {
    // resting on the right shoulder
    P.handR.set(-0.2, 1.22 + Math.sin(p.runPhase * 2) * 0.02 * p.speed01, 0.22);
    P.handL.set(0.05, 1.0, 0.32);
    bladeQuat(P.wR, _v.set(-0.25, 0.35, -1), _v2.set(0.4, 1, 0.2));
  }

  // ── charged leap slam ──────────────────────────────────────────────────────
  press(p, btn) {
    if (btn === 1) {
      if (p.action && !p.action.cancelable?.('attack')) { this.buffer = { btn: 1, t: G.time }; return; }
      p.startAction(new ChargeAction(this));
      return;
    }
    super.press(p, btn);
  }
  consume(p) {
    const b = this.buffer;
    if (b && b.btn === 1) {
      if (G.time - b.t > 0.45) { this.buffer = null; return; }
      if (p.action && !p.action.cancelable?.('attack')) return;
      this.buffer = null;
      if (G.input.isDown('Mouse2')) p.startAction(new ChargeAction(this));
      else this.leap(p, 0);
      return;
    }
    super.consume(p);
  }
  release(p, btn) {
    if (btn === 1 && p.action instanceof ChargeAction && p.action.w === this) p.action.release();
  }

  leap(p, level) {
    const s = 0.85 + level * 0.3;
    const spec = {
      dur: 1.6, cancel: 1.6, dashCancel: 1.6, swing: [0.4, 0.5], follow: 0.12, over: 0.1, antic: 0.8,
      plane: { roll: Math.PI / 2 }, a0: 2.7, a1: -1.15, radius: 0.48, twoHanded: true, gravity: 1, jumpVel: 0,
      lunge: 4.5 + level * 0.8, minLunge: 2, maxLunge: 6 + level, stopDist: 1.0, lungeWin: [0.05, 0.5], lockRange: 11,
      center: [-0.05, 1.35, 0.1], lean: 0.5, stance: 'air', cam: { dist: 7.2 + level * 0.6 },
      hits: [],
      slash: layers({ scale: 1.15 + level * 0.1 }),
      whoosh: 'whooshBig', whooshPitch: 0.65,
      onStart: (m) => {
        m.player.vel.y = 13; m.player.grounded = false; m.player.gravityScale = 1.15;
        FXP.dust(m.player.pos, 1.0, 8); G.audio?.play('jump2', { pitch: 0.7 });
      },
      update: (m) => {
        if (m.t > 0.38 && m.t < 0.5) m.player.vel.y = Math.min(m.player.vel.y, -26);
        // ember trail while airborne
        if (Math.random() < 0.7) {
          const tip = m.player.toWorld(new THREE.Vector3(-0.1, 1.6, 0));
          G.fx.add.emit({ pos: tip.add(_v.set(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3))), vel: _v2.set(rand(-1, 1), rand(0, 2), rand(-1, 1)), shape: SHAPE.DOT, size: rand(0.05, 0.1), sizeEnd: 0, life: rand(0.3, 0.6), color: [4, 1.6, 0.3], alphaEnd: 0.3, drag: 2 });
        }
      },
      onLand: (m) => {
        const p2 = m.player.pos.clone().addScaledVector(m.fwd, 1.6);
        groundImpact(p2, s);
        if (level >= 1) flameRing(p2, s, 8 + level * 3);
        if (level >= 2) {
          G.screen.impact(0.05, true, [1, 0.85, 0.7]);
          G.slowmo(0.15, 0.1, 0.35);
          G.fx.sphere({ pos: p2.clone().setY(0.5), r0: 0.5, r1: 4.2 * s, color: [0.9, 0.3, 0.06], coreColor: [0.6, 0.35, 0.15], life: 0.26, power: 2.4, core: 0.0, squashY: 0.4 });
        }
        G.screen.flash([1, 0.75, 0.5], 0.08 + level * 0.03, 0.08);
        G.screen.chroma(0.01 + level * 0.006, 0.3);
        G.rig.fovPunch(3 + level * 2);
        slamKnock(p2, (3.6 + level * 0.9) * s, 6 + level * 2, 11 + level * 2, 300 + level * 160);
        m.dur = m.t + 0.45;
      },
      posePost: (P, t) => { if (t > 0.48) { P.hip.y = 0.6; P.footR.set(-0.22, 0, -0.4); P.footL.set(0.22, 0, 0.42); } },
    };
    p.startAction(new SwingMove(this, spec, 0));
  }
}

function slamKnock(pos, radius, kb, lift, dmg = 260) {
  for (const d of G.dummies.list) {
    const dx = d.pos.x - pos.x, dz = d.pos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < radius + d.radius && d.pos.y < 2.5) {
      const dir = new THREE.Vector3(dx, 0, dz);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      const k = 1 - Math.min(1, dist / (radius + d.radius)) * 0.5;
      hit(d, { dir, kb: kb * k, lift: lift * k, hitstop: 0.14, atkStop: 0.1, shake: 0, kind: 'heavy', fxScale: 0.9, dmg: Math.round(dmg * k), sound: 'hitHeavy' });
    }
  }
}

/** Glint on the blade during windup (anticipation). */
function chargeGlint(m) {
  const p = m.player;
  const sk = m.socketAt(m.s.swing[0] - 0.02);
  const tip = p.toWorld(sk.p.clone().addScaledVector(sk.blade, 1.6));
  G.fx.add.emit({ pos: tip, shape: SHAPE.STAR, size: 1.6, sizeEnd: 0, life: 0.2, color: [5, 3, 1.5], alphaEnd: 0, rot: 0.3 });
  G.fx.add.emit({ pos: tip, shape: SHAPE.GLOW, size: 0.9, sizeEnd: 0.2, life: 0.2, color: [2.5, 1, 0.3], alphaEnd: 0 });
}

function flameSwirl(m) {
  const p = m.player;
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(1.2, 2.6);
    const q = p.pos.clone().add(_v.set(Math.cos(a) * r, rand(0.6, 1.4), Math.sin(a) * r));
    G.fx.puffs.emit({ pos: q, vel: _v2.set(-Math.sin(a) * 4, rand(1, 3), Math.cos(a) * 4), size: rand(0.25, 0.4), sizeEnd: 0.1, life: rand(0.35, 0.55), mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: 1.1, drag: 3, rise: 2, dissolveStart: 0.3 });
  }
}

// ── Charge action: hold RMB, 3 levels ─────────────────────────────────────────
class ChargeAction {
  constructor(w) {
    this.w = w;
    this.dur = 99;
    this.moveScale = 0.15;
    this.ownsVelocity = false;
    this.faceMove = true;
    this.legs = true;
    this.level = 0;
    this.emitT = 0;
  }
  start() {
    this.player.gravityScale = 1;
    G.audio?.play('charge');
    this.aura = G.fx.decal({ pos: this.player.pos, size: 2.2, type: 4, color: [1.5, 0.5, 0.1], life: 99, additive: true, update: (e, k, m) => { m.position.x = this.player.pos.x; m.position.z = this.player.pos.z; const s = 1.8 + this.level * 0.5 + Math.sin(G.time * 20) * 0.08; m.scale.set(s, 1, s); } });
  }
  update(dt) {
    const p = this.player;
    const T = [0.45, 1.0, 1.6];
    const prev = this.level;
    this.level = this.t >= T[2] ? 3 : this.t >= T[1] ? 2 : this.t >= T[0] ? 1 : 0;
    G.hud.setCharge(Math.min(1, this.t / T[2]), this.level);
    if (this.level > prev) {
      G.audio?.play('chargeLvl', { pitch: 0.8 + this.level * 0.2 });
      const c = p.pos.clone().setY(1.0);
      G.fx.ring({ pos: c, billboard: true, r0: 2.2, r1: 0.3, w0: 0.04, w1: 0.1, color: [1.6, 0.8, 0.2], life: 0.22, sharp: 1, easing: (k) => k });
      G.fx.add.emit({ pos: c, shape: SHAPE.STAR, size: 1.6 + this.level * 0.6, sizeEnd: 0, life: 0.22, color: [2.6, 1.6, 0.7], alphaEnd: 0 });
      G.fx.ring({ pos: p.pos.clone().setY(0.08), normal: UP, r0: 0.5, r1: 2.6 + this.level * 0.8, w0: 0.08, w1: 0.015, color: [1.6, 0.6, 0.15], life: 0.32, sharp: 1 });
      G.rig.shake(0.1 + this.level * 0.05);
      if (this.level === 3) this.release();
    }
    // gathering embers spiraling in
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.016;
      const n = 1 + this.level;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(1.6, 2.6);
        const q = p.pos.clone().add(_v.set(Math.cos(a) * r, rand(0.1, 2), Math.sin(a) * r));
        const to = p.pos.clone().setY(1.1).sub(q);
        G.fx.add.emit({ pos: q, vel: to.multiplyScalar(1 / 0.3), shape: SHAPE.STREAK, size: 0.05, stretch: 0.05, life: 0.3, color: [3, 1.3, 0.3], alpha: 0, alphaEnd: 1, drag: 0, fadeIn: 0 });
      }
      if (this.level >= 1 && Math.random() < 0.5) {
        const q = p.pos.clone().add(_v.set(rand(-0.6, 0.6), 0.2, rand(-0.6, 0.6)));
        G.fx.puffs.emit({ pos: q, vel: _v2.set(0, rand(2, 4), 0), size: rand(0.12, 0.22), sizeEnd: 0.05, life: 0.5, mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: 1, drag: 2, rise: 2, dissolveStart: 0.3 });
      }
      // blade runes flare
      const tip = p.toWorld(new THREE.Vector3(-0.35, 0.9 + Math.random() * 1.5, -0.6));
      G.fx.add.emit({ pos: tip, shape: SHAPE.GLOW, size: 0.4 + this.level * 0.15, sizeEnd: 0, life: 0.15, color: [2.5, 0.8, 0.15], alphaEnd: 0 });
    }
    if (Math.random() < dt * 4) G.audio?.play('charge', { pitch: 0.8 + this.level * 0.15, vol: 0.5 });
  }
  pose(P, t) {
    // sword dragged low behind, body coiled
    const k = clamp01(t / 0.2);
    const sh = Math.sin(G.time * 40) * 0.01 * this.level;
    P.handR.lerp(_v.set(-0.38 + sh, 0.75, -0.25), k);
    P.handL.lerp(_v.set(-0.2, 0.72, -0.12), k);
    bladeQuat(_q, _v.set(-0.4, -0.35, -1), _v2.set(0, -1, 0));
    P.wR.slerp(_q, k); P.wL.copy(P.wR);
    P.hip.y = 0.74; P.lean = 0.25; P.twist = -0.5 * k;
    P.footR.set(-0.2, 0, -0.35); P.footL.set(0.22, 0, 0.35);
  }
  cancelable(kind) { return kind === 'dash'; }
  release() {
    const lvl = this.level;
    const p = this.player;
    this.end();
    p.action = null;
    this.w.leap(p, lvl);
  }
  end() {
    G.hud.setCharge(0);
    if (this.aura) this.aura.t = this.aura.life;
  }
}
const _q = new THREE.Quaternion();
