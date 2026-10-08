// 쌍검 「홍아」 — crimson twin daggers: fast mirrored combos and a blade storm.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MeleeWeapon, SwingMove, trailDef, juggleSet } from './melee.js';
import { daggerModel } from './models.js';
import { WeaponTrail } from '../vfx/fx.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { bladeQuat, clamp01, easing } from '../entities/pose.js';
import { hit } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const C = [2.4, 0.22, 0.5];
const CORE = [4, 2.6, 3];

function L(extra = {}) {
  return [
    { ink: true, width: 0.34, rIn: 0.8, rOut: 1.75, color: [0.05, 0.01, 0.04], alpha: 0.65, tail: 0.7, fade: 0.12, streak: 0.6, cone: 0.1, da0: -0.25 },
    { width: 0.45, tail: 0.9, streak: 0.8, rIn: 0.5, rOut: 1.65, fade: 0.16, ...extra },
    { width: 0.3, rIn: 1.45, rOut: 1.85, color: [2.2, 0.8, 1.2], core: [3, 2.4, 2.6], tail: 0.45, fade: 0.08, cone: 0.04 },
  ];
}

export class DualBlades extends MeleeWeapon {
  constructor() {
    super();
    this.id = 'dual';
    this.name = '쌍검 「홍아」';
    this.short = '쌍검';
    this.icon = '双';
    this.color = C; this.core = CORE;
    this.hitSound = 'hitSlash';
    this.desc = '<b>좌클릭</b> 6연격 (좌우 교차 · 회전 · 공중제비) · <b>우클릭</b> 칼날 폭풍 (회오리 돌진)';
    this.modelR = daggerModel(0xff3a5a);
    this.modelL = daggerModel(0xff3a5a);
    this.bladeLen = 0.72;
    this.trailR = new WeaponTrail(G.fx, { color: [2.0, 0.15, 0.4], core: [3.4, 2, 2.6], maxAge: 0.11, coreWidth: 0.25, noise: 0.05 });
    this.trailL = new WeaponTrail(G.fx, { color: [2.0, 0.15, 0.4], core: [3.4, 2, 2.6], maxAge: 0.11, coreWidth: 0.25, noise: 0.05 });
    this.trails = [this.trailR, this.trailL];
    this.trailDefs = [trailDef(this.trailR, [0, 0.2, 0], [0, 0.72, -0.03], 'R'), trailDef(this.trailL, [0, 0.2, 0], [0, 0.72, -0.03], 'L')];
    const H = (o) => ({ range: 2.5, arc: 170, kb: 2.2, stop: 0.05, atkStop: 0.045, shake: 0.1, kick: 0.4, dmg: 70, kind: 'slash', color: [1, 0.25, 0.4], fxScale: 0.85, ...o });
    const base = { radius: 0.42, center: [-0.12, 1.2, 0.12], lunge: 0.7, maxLunge: 2.6, stopDist: 0.8, whooshPitch: 1.4, whooshVol: 0.6 };
    this.combo = [
      { ...base, hand: 'R', dur: 0.26, cancel: 0.13, swing: [0.04, 0.09], follow: 0.08, antic: 0.25, plane: { roll: -0.2 }, a0: -2.0, a1: 1.6, offHand: [0.4, 1.05, -0.15], hits: [H({ t: 0.07 })], slash: L() },
      { ...base, hand: 'L', dur: 0.26, cancel: 0.13, swing: [0.04, 0.09], follow: 0.08, antic: 0.25, plane: { roll: -0.2 }, a0: -2.0, a1: 1.6, offHand: [0.4, 1.05, -0.15], hits: [H({ t: 0.07 })], slash: L() },
      { ...base, hand: 'both', dur: 0.36, cancel: 0.2, swing: [0.07, 0.13], follow: 0.1, antic: 0.4, plane: { roll: -0.9 }, a0: -2.2, a1: 1.3, hits: [H({ t: 0.11, dmg: 120, kb: 3.5, stop: 0.07 })], slash: L({ width: 0.5 }), whooshPitch: 1.2 },
      { ...base, hand: 'both', dur: 0.46, cancel: 0.28, swing: [0.06, 0.24], follow: 0.08, antic: 0.2, plane: { roll: -0.05 }, a0: -1.2, a1: 1.2, spinTurns: 1, spinWin: [0.05, 0.26], radius: 0.5,
        hits: [H({ t: 0.12, arc: 360, dmg: 60, stop: 0.035 }), H({ t: 0.2, arc: 360, dmg: 60, stop: 0.035 })],
        slash: [{ da0: -0.2, da1: Math.PI * 2 - 2.4 + 0.2, sweep: 0.2, width: 0.4, rIn: 0.6, rOut: 1.9, tail: 0.6, fade: 0.15 }], whoosh: 'whooshBig', whooshPitch: 1.5 },
      { ...base, hand: 'both', dur: 0.4, cancel: 0.24, swing: [0.07, 0.14], follow: 0.1, antic: 0.35, plane: { roll: Math.PI / 2 - 0.35 }, a0: -1.8, a1: 1.9, center: [-0.18, 1.1, 0.2],
        hits: [H({ t: 0.11, dmg: 110, kb: 1.5, lift: 9, stop: 0.07 })], slash: L({ width: 0.5 }) },
      { ...base, hand: 'both', dur: 0.7, cancel: 0.5, dashCancel: 0.42, swing: [0.14, 0.32], follow: 0.1, antic: 0.5, plane: { roll: Math.PI / 2, yaw: 0.15 }, a0: 2.4, a1: -1.4, flipTurns: 1, jumpVel: 6, gravity: 0.8, lunge: 1.4,
        hits: [H({ t: 0.29, dmg: 260, kb: 9, lift: 4, stop: 0.13, atkStop: 0.12, shake: 0.35, kick: 1.2, fxScale: 1.3, flash: [1, 0.6, 0.7], flashA: 0.14, chroma: 0.01, slowmo: [0.3, 0.08, 0.2], sound: 'hitSlashBig', yMin: -3, yMax: 3 })],
        slash: L({ width: 0.6, scale: 1.3, rOut: 2.2 }), whoosh: 'whooshBig', whooshPitch: 1.1, cam: { dist: 6.2 } },
    ];
    this.airCombo = [
      { ...base, hand: 'both', dur: 0.36, cancel: 0.18, swing: [0.05, 0.12], follow: 0.08, antic: 0.3, plane: { roll: -0.9 }, a0: -2.2, a1: 1.3, gravity: 0.06, airLift: 1.2, hits: [H({ t: 0.09, dmg: 100, kb: 1.5, lift: 5.5, yMin: -2.5, yMax: 4.5, set: juggleSet })], slash: L() },
      { ...base, hand: 'both', dur: 0.46, cancel: 0.28, swing: [0.06, 0.24], follow: 0.08, antic: 0.2, plane: { roll: -0.05 }, a0: -1.2, a1: 1.2, spinTurns: 1, gravity: 0.06, airLift: 1.2,
        hits: [H({ t: 0.12, arc: 360, dmg: 60, lift: 4, yMin: -2.5, yMax: 4.5, set: juggleSet }), H({ t: 0.2, arc: 360, dmg: 60, lift: 4, yMin: -2.5, yMax: 4.5, set: juggleSet })],
        slash: [{ da0: -0.2, da1: Math.PI * 2 - 2.4 + 0.2, sweep: 0.2, width: 0.4, rIn: 0.6, rOut: 1.9, tail: 0.6, fade: 0.15 }] },
    ];
  }

  restPose(P, p) {
    // reverse grip, blades along the forearms
    const sw = Math.cos(p.runPhase) * 0.15 * p.speed01;
    P.handR.set(-0.33, 0.9, 0.12 - sw); P.handL.set(0.33, 0.9, 0.12 + sw);
    bladeQuat(P.wR, _v.set(-0.2, -0.6, -1), _v2.set(-1, 0, 0));
    bladeQuat(P.wL, _v.set(0.2, -0.6, -1), _v2.set(1, 0, 0));
  }

  heavy(p) { p.startAction(new BladeStorm(this)); }
}

// ── Blade storm: a moving tornado of crimson slashes ──────────────────────────
class BladeStorm {
  constructor(w) {
    this.w = w; this.dur = 1.25; this.moveScale = 0.55; this.ownsVelocity = false; this.legs = true; this.faceMove = false;
    this.isMelee = true; this.s = { cancel: 1.1 };
    this.cam = { dist: 6.4 };
    this.tick = 0; this.slashT = 0;
  }
  start() {
    const p = this.player;
    this.fwd = p.intentDir(new THREE.Vector3());
    p.yaw = Math.atan2(this.fwd.x, this.fwd.z);
    if (p.grounded) { p.vel.y = 3; p.grounded = false; }
    p.gravityScale = 0.2;
    FXP.dust(p.pos, 1.0, 8);
    G.audio?.play('whooshBig', { pitch: 1.4 });
    this.windT = 0;
  }
  update(dt) {
    const p = this.player;
    const fx = G.fx;
    // forward drift
    if (p.wishDir.lengthSq() === 0) { p.vel.x = this.fwd.x * 5; p.vel.z = this.fwd.z * 5; }
    if (p.pos.y > 1.2) p.vel.y = Math.min(p.vel.y, 0);
    const c = p.pos.clone().setY(p.pos.y + 1.0);
    this.w.trailR.emitting = true; this.w.trailL.emitting = true;
    // slash rings around the body
    this.slashT -= dt;
    if (this.slashT <= 0 && this.t < this.dur - 0.15) {
      this.slashT = 0.07;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.35, 0.35), rand(0, 6.28), rand(-0.35, 0.35)));
      fx.slash({ pos: c.clone().add(_v.set(0, rand(-0.4, 0.5), 0)), quat: q, a0: 0, a1: Math.PI * 1.4, rIn: 0.9, rOut: rand(2.0, 2.6), sweep: 0.08, hold: 0.02, fade: 0.14, color: C, core: CORE, width: 0.35, tail: 0.6, streak: 0.8, cone: 0.1 });
    }
    // wind funnel particles orbiting
    this.windT -= dt;
    if (this.windT <= 0) {
      this.windT = 0.01;
      const a = Math.random() * Math.PI * 2, r = rand(0.8, 2.6), y = rand(0, 2.6);
      fx.add.emit({ pos: p.pos.clone().add(_v.set(Math.cos(a) * r, y, Math.sin(a) * r)), vel: _v2.set(-Math.sin(a) * 14, rand(1, 4), Math.cos(a) * 14), shape: SHAPE.STREAK, size: 0.035, stretch: 0.04, life: rand(0.15, 0.3), color: [1.6, 0.3, 0.55], alphaEnd: 0, orbit: { cx: p.pos.x, cz: p.pos.z, spin: 40, pull: 25 } });
      if (Math.random() < 0.3) fx.alpha.emit({ pos: p.pos.clone().add(_v.set(Math.cos(a) * r, 0.1, Math.sin(a) * r)), vel: _v2.set(-Math.sin(a) * 5, rand(1, 3), Math.cos(a) * 5), shape: SHAPE.SMOKE, size: 0.25, sizeEnd: 0.6, life: 0.5, color: [0.78, 0.74, 0.78], alpha: 0.5, alphaEnd: 0, drag: 2 });
    }
    // multi-hit: pull in and up
    this.tick -= dt;
    if (this.tick <= 0 && this.t < this.dur - 0.2) {
      this.tick = 0.1;
      for (const d of G.dummies.list) {
        const dc = d.center(_v);
        if (dc.distanceTo(c) < 2.8 + d.radius) {
          const toC = new THREE.Vector3(c.x - d.pos.x, 0, c.z - d.pos.z);
          const dir = new THREE.Vector3(-toC.z, 0, toC.x).normalize();
          hit(d, { dir, kb: 1.5, lift: 3.6, hitstop: 0.035, atkStop: 0.012, shake: 0.05, kind: 'slash', color: [1, 0.25, 0.4], tangent: dir, dmg: 38 + Math.round(Math.random() * 10), sound: 'hitSlash', fxScale: 0.6, vol: 0.5 });
          if (toC.length() > 0.5) d.vel.addScaledVector(toC.normalize(), 1.5);
        }
      }
    }
    if (this.t >= this.dur - 0.2 && !this.fin) {
      this.fin = true;
      fx.ring({ pos: c, normal: UP, r0: 0.5, r1: 4.5, w0: 0.07, w1: 0.012, color: [1.3, 0.22, 0.45], life: 0.28, sharp: 1 });
      fx.distort({ pos: c, r0: 0.5, r1: 5, strength: 0.03, life: 0.3 });
      for (const d of G.dummies.list) {
        const dc = d.center(_v);
        if (dc.distanceTo(c) < 3.3 + d.radius) {
          const dir = new THREE.Vector3(d.pos.x - c.x, 0, d.pos.z - c.z).normalize();
          hit(d, { dir, kb: 11, lift: 6, hitstop: 0.12, atkStop: 0.1, shake: 0.35, kind: 'slash', color: [1, 0.25, 0.4], tangent: new THREE.Vector3(-dir.z, 0, dir.x), dmg: 220, sound: 'hitSlashBig', fxScale: 1.2 });
        }
      }
      G.slowmo(0.35, 0.06, 0.2);
    }
  }
  pose(P, t) {
    const spin = t * Math.PI * 2 * 4.2;
    P.spin = spin;
    P.handR.set(-0.72, 1.25, 0.15); P.handL.set(0.72, 1.25, -0.15);
    bladeQuat(P.wR, _v.set(-1, 0.1, 0.4), _v2.set(0, 0, 1));
    bladeQuat(P.wL, _v.set(1, 0.1, -0.4), _v2.set(0, 0, -1));
    P.footR.set(-0.14, 0.35, 0.1); P.footL.set(0.14, 0.25, -0.1); P.hip.y = 0.88; P.lean = 0.05;
  }
  sampleSocket(t, side) {
    const spin = t * Math.PI * 2 * 4.2;
    const res = side === 'R'
      ? { p: new THREE.Vector3(-0.72, 1.25, 0.15), q: bladeQuat(new THREE.Quaternion(), _v.set(-1, 0.1, 0.4), _v2.set(0, 0, 1)) }
      : { p: new THREE.Vector3(0.72, 1.25, -0.15), q: bladeQuat(new THREE.Quaternion(), _v.set(1, 0.1, -0.4), _v2.set(0, 0, -1)) };
    res.pose = { flip: 0, spin };
    return res;
  }
  poseWeight(t) { return 1 - clamp01((t - (this.dur - 0.12)) / 0.12); }
  cancelable(kind) { return this.t > this.dur - 0.15; }
  end() { this.player.gravityScale = 1; this.w.trailR.emitting = false; this.w.trailL.emitting = false; }
}
