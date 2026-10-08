// 화염 마법 「홍련」 — fireballs and an erupting crimson pillar.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MagicWeapon, after } from './magic.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { clamp01, easing } from '../entities/pose.js';
import { hit, softTarget } from '../combat/combat.js';
import { blastDamage } from './rocket.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FIRE = [1.7, 0.85, 0.18], DEEP = [0.95, 0.22, 0.04];

export class FireMagic extends MagicWeapon {
  constructor() {
    super([2.2, 0.9, 0.2], 0xff7a2a);
    this.id = 'fire';
    this.name = '화염 마법 「홍련」';
    this.short = '화염';
    this.icon = '炎';
    this.desc = '<b>좌클릭</b> 화염구 · <b>우클릭 꾹</b> 마법진 차지 → 홍련주(불기둥) 분출';
    this.cool = 0;
    this.side = 0;
  }
  press(p, btn) {
    if (btn === 0) this.want = true;
    else if (!p.action || p.action.cancelable?.('shoot')) { if (p.action) p.endAction(); p.startAction(new PillarCharge(this)); }
  }
  release(p, btn) { if (btn === 1 && p.action instanceof PillarCharge) p.action.release(); }
  hold(p, btn) { if (btn === 0) this.want = true; }
  tick(p, dt) {
    this.cool -= dt;
    if (this.want && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot'))) {
      if (p.action) p.endAction();
      this.fireball(p);
    }
    this.want = false;
  }

  fireball(p) {
    this.cool = 0.32;
    this.aimT = 0.8;
    this.castK = 1; this.castSide = this.side;
    const side = this.side; this.side ^= 1;
    const from = this.castPalm(p, side);
    const tgt = this.aimTarget();
    const dir = _v.subVectors(tgt ? tgt.center(new THREE.Vector3()) : this.aimPoint, from).normalize().clone();
    // cast burst at the palm: small magic circle + flash
    G.fx.add.emit({ pos: from, shape: SHAPE.STAR, size: 0.9, sizeEnd: 0, life: 0.1, color: [3, 1.6, 0.5], alphaEnd: 0 });
    G.fx.ring({ pos: from, normal: dir, r0: 0.1, r1: 0.55, w0: 0.12, w1: 0.03, color: [1.6, 0.6, 0.12], life: 0.18, sharp: 1 });
    for (let i = 0; i < 5; i++) G.fx.puffs.emit({ pos: from, vel: cone(dir, 0.6, new THREE.Vector3()).multiplyScalar(rand(2, 4)), size: 0.1, sizeEnd: 0.2, life: 0.25, mode: PUFF.FIRE, color: FIRE, shade: DEEP, heat: 1, drag: 6, dissolveStart: 0.2 });
    const light = G.fx.light(from, [1, 0.5, 0.15], 1.6, 5, 0);
    const haze = G.fx.distort({ pos: from, mode: 'haze', r0: 0.7, r1: 0.7, strength: 0.018, life: 3, strengthCurve: () => 1 });
    let emitT = 0;
    G.projectiles.spawn({
      pos: from, vel: dir.clone().multiplyScalar(26), life: 2.2, radius: 0.32,
      steer: (pr, dt) => {
        if (tgt) {
          const want = _v.subVectors(tgt.center(_v2), pr.pos).normalize();
          pr.vel.lerp(want.multiplyScalar(pr.vel.length()), Math.min(1, dt * 3));
        }
      },
      render: (pr, dt) => {
        light.p.copy(pr.pos);
        haze.obj.position.copy(pr.pos);
        // burning core: freshly emitted bright puffs that trail behind
        emitT -= dt;
        if (emitT <= 0) {
          emitT = 0.012;
          G.fx.puffs.emit({ pos: pr.pos.clone().add(randUnit(_v2).multiplyScalar(0.06)), vel: randUnit(_v2).multiplyScalar(0.6).addScaledVector(pr.vel, 0.05), size: rand(0.28, 0.36), sizeEnd: 0.06, life: rand(0.22, 0.32), mode: PUFF.FIRE, color: FIRE, shade: DEEP, heat: 1.2, drag: 3, rise: 1, dissolveStart: 0.2, grow: 'in' });
        }
        G.fx.add.emit({ pos: pr.pos, shape: SHAPE.GLOW, size: 1.0, life: 1 / 50, color: [1.4, 0.55, 0.12], alpha: 0.8, alphaEnd: 0.8 });
        G.fx.add.emit({ pos: pr.pos, shape: SHAPE.DOT, size: 0.26, life: 1 / 50, color: [3, 2.4, 1.4], alpha: 1, alphaEnd: 1 });
        if (Math.random() < 0.6) G.fx.add.emit({ pos: pr.pos.clone().add(randUnit(_v2).multiplyScalar(0.2)), vel: randUnit(_v2).multiplyScalar(1.5).addScaledVector(pr.vel, -0.1), shape: SHAPE.DOT, size: rand(0.04, 0.07), sizeEnd: 0, life: rand(0.3, 0.6), color: [3.5, 1.6, 0.35], alphaEnd: 0.3, gravity: -1 });
      },
      onHit: (pr, d, point) => this.burst(pr.pos.clone().addScaledVector(pr.vel.clone().normalize(), -0.4), d),
      onGround: (pr, point) => this.burst(point.clone().setY(0.4)),
      onExpire: (pr) => this.burst(pr.pos.clone()),
      onDead: () => { light.max = 0.001; light.life = 1; haze.t = haze.life; },
    });
    G.rig.shake(0.04);
    G.audio?.play('fireball');
  }

  aimTarget() {
    // dummy closest to the crosshair ray
    const cam = G.rig.camera;
    const o = cam.position, d = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bestA = 0.1;
    for (const du of G.dummies.list) {
      const c = du.center(new THREE.Vector3()).sub(o);
      const dist = c.length();
      if (dist > 40) continue;
      const ang = 1 - c.normalize().dot(d);
      if (ang < bestA) { bestA = ang; best = du; }
    }
    return best;
  }

  burst(pos, direct) {
    FXP.explosion(pos, 0.8);
    G.fx.distort({ pos, r0: 0.3, r1: 4, strength: 0.03, life: 0.35 });
    blastDamage(pos, 2.4, 160, 6, 5.5, { onHit: (d) => { d.status.burn = 3; } });
    G.audio?.play('explosion', { pos, vol: 0.6, pitch: 1.3 });
  }
}

// ── Crimson pillar: hold to grow the circle, release to erupt ─────────────────
class PillarCharge {
  constructor(w) { this.w = w; this.dur = 99; this.moveScale = 0.2; this.legs = false; this.faceMove = false; }
  start() {
    const w = this.w;
    this.pos = w.aimPoint.clone(); this.pos.y = 0.03;
    this.circle = G.fx.decal({ pos: this.pos, size: 1.6, type: 3, color: [1.5, 0.55, 0.1], life: 99, spin: 0.8, reveal: 0.25, additive: true });
    this.circle2 = G.fx.decal({ pos: this.pos, size: 1.0, type: 3, color: [1.1, 0.36, 0.07], life: 99, spin: -1.4, reveal: 0.25, additive: true });
    this.glow = G.fx.decal({ pos: this.pos, size: 1.6, type: 4, color: [0.45, 0.13, 0.03], life: 99, additive: true });
    G.audio?.play('charge', { pitch: 0.7 });
    this.emitT = 0;
  }
  get size() { return 1.4 + Math.min(1, this.t / 1.1) * 1.6; }
  update(dt) {
    const w = this.w, p = this.player;
    w.aimT = 0.5;
    // the circle follows the crosshair while charging
    const tp = w.aimPoint.clone(); tp.y = 0.03;
    const r = Math.hypot(tp.x - p.pos.x, tp.z - p.pos.z);
    if (r < 22) this.pos.lerp(tp, 1 - Math.exp(-dt * 12));
    const s = this.size;
    for (const [d, k] of [[this.circle, 1], [this.circle2, 0.62], [this.glow, 1.1]]) { d.obj.position.set(this.pos.x, d.obj.position.y, this.pos.z); d.obj.scale.set(s * k, 1, s * k); }
    this.emitT -= dt;
    if (this.emitT <= 0) {
      this.emitT = 0.02;
      const a = Math.random() * Math.PI * 2, rr = Math.random() * s;
      G.fx.add.emit({ pos: this.pos.clone().add(_v.set(Math.cos(a) * rr, 0.05, Math.sin(a) * rr)), vel: _v2.set(0, rand(1.5, 4), 0), shape: SHAPE.DOT, size: rand(0.04, 0.08), sizeEnd: 0, life: rand(0.5, 0.9), color: [3, 1.3, 0.3], alphaEnd: 0.2 });
      // gathering streaks into the palm
      const palm = w.palm(p, 0);
      const q = palm.clone().add(randUnit(_v).multiplyScalar(rand(0.6, 1.0)));
      G.fx.add.emit({ pos: q, vel: palm.clone().sub(q).multiplyScalar(1 / 0.15), shape: SHAPE.STREAK, size: 0.03, stretch: 0.04, life: 0.15, color: [2.5, 1.0, 0.2], alpha: 0, alphaEnd: 1 });
    }
    if (this.t > 1.4) this.release();
  }
  pose(P, t) {
    const w = this.w;
    w.castPose(P, this.player, easing.outCubic(clamp01(t / 0.15)), 0);
    P.handR.y += 0.15; // palm raised
  }
  cancelable(kind) { return kind === 'dash'; }
  release() {
    const p = this.player;
    const pos = this.pos.clone(), s = this.size;
    this.end();
    p.action = null;
    eruption(pos, s / 2.0);
    this.w.castK = 1;
  }
  end() {
    for (const d of [this.circle, this.circle2, this.glow]) if (d) d.t = d.life;
  }
}

export function eruption(pos, s = 1) {
  const fx = G.fx;
  // anticipation: circle flares, ground cracks glow
  fx.decal({ pos, size: 2.2 * s, type: 3, color: [1.6, 0.6, 0.12], life: 1.0, spin: 2.5, additive: true, fadeStart: 0.25 });
  fx.decal({ pos, size: 3.0 * s, type: 1, color: [3, 1.0, 0.2], glow: 2, life: 4, reveal: 0.15 });
  fx.add.emit({ pos: pos.clone().setY(0.3), shape: SHAPE.GLOW, size: 2.0 * s, sizeEnd: 2.6 * s, life: 0.2, color: [0.9, 0.3, 0.06], alpha: 0.7, alphaEnd: 0 });
  G.rig.shake(0.2);
  after(0.12, () => {
    // eruption
    fx.add.emit({ pos: pos.clone().setY(1.2), shape: SHAPE.STAR, size: 3.2 * s, sizeEnd: 0.6, life: 0.12, color: [2.6, 1.6, 0.7], alphaEnd: 0 });
    fx.ring({ pos: pos.clone().setY(0.1), normal: UP, r0: 0.5, r1: 4.5 * s, w0: 0.06, w1: 0.01, color: [1.1, 0.5, 0.18], life: 0.38, sharp: 1 });
    fx.distort({ pos: pos.clone().setY(0.5), r0: 0.5, r1: 7 * s, strength: 0.04, life: 0.4 });
    fx.distort({ pos: pos.clone().setY(3), mode: 'haze', r0: 3.5 * s, r1: 4 * s, strength: 0.035, life: 1.6 });
    // the column: a fresnel cylinder of light + stacked fire puffs shooting up
    fx.sphere({ pos: pos.clone().setY(3.5), r0: 0.5 * s, r1: 1.2 * s, color: [1.0, 0.32, 0.06], coreColor: [0.6, 0.3, 0.1], life: 0.7, power: 2.6, core: 0.0, squashY: 4.2, alphaCurve: (k) => (1 - k) * (1 - k) });
    // column: a dense core of cel fire puffs wrapped in licking flame tongues
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.8 * s;
      const q = pos.clone().add(_v.set(Math.cos(a) * r, rand(0, 0.8), Math.sin(a) * r));
      fx.puffs.emit({ pos: q, vel: _v2.set(Math.cos(a) * 0.6, rand(10, 22) * Math.sqrt(s), Math.sin(a) * 0.6), size: rand(0.32, 0.5) * s, sizeEnd: rand(0.1, 0.25) * s, life: rand(0.5, 0.8), mode: PUFF.FIRE, color: FIRE, shade: DEEP, heat: rand(0.85, 1.05), drag: 1.6, rise: 2, dissolveStart: 0.3, stretch: 1.25 });
    }
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, r = (0.7 + Math.random() * 0.6) * s;
      const q = pos.clone().add(_v.set(Math.cos(a) * r, rand(0.2, 1.5), Math.sin(a) * r));
      fx.add.emit({ pos: q, vel: _v2.set(Math.cos(a) * 0.5, rand(8, 16) * Math.sqrt(s), Math.sin(a) * 0.5), shape: SHAPE.FLAME, size: rand(0.8, 1.4) * s, w: 0.5, sizeEnd: rand(0.2, 0.4),
        life: rand(0.35, 0.6), color: [2.2, 0.95, 0.22], colorEnd: [1.0, 0.16, 0.03], alpha: 1, alphaEnd: 0, fadeIn: 0.06, drag: 1.2, rot: rand(-0.15, 0.15) });
    }
    // base swirl
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      fx.puffs.emit({ pos: pos.clone().add(_v.set(Math.cos(a) * 1.2 * s, 0.3, Math.sin(a) * 1.2 * s)), vel: _v2.set(Math.cos(a) * 5 * s, rand(0.5, 2), Math.sin(a) * 5 * s), size: rand(0.25, 0.4) * s, sizeEnd: rand(0.4, 0.6) * s, life: rand(0.4, 0.6), mode: PUFF.FIRE, color: FIRE, shade: DEEP, heat: 0.9, drag: 4, rise: 1, dissolveStart: 0.25 });
    }
    for (let i = 0; i < 40; i++) {
      fx.add.emit({ pos: pos.clone().add(_v.set(rand(-1, 1) * s, rand(0, 4), rand(-1, 1) * s)), vel: _v2.set(rand(-3, 3), rand(8, 20), rand(-3, 3)), shape: SHAPE.STREAK, size: 0.06, stretch: 0.03, life: rand(0.4, 0.9), color: [4, 2, 0.5], colorEnd: [1.6, 0.3, 0.04], alphaEnd: 0, drag: 1.5, gravity: 8 });
    }
    fx.light(pos.clone().setY(2), [1, 0.5, 0.15], 2.6, 10 * s, 0.9);
    G.rig.shake(0.45); G.rig.fovPunch(2.5);
    G.screen.flash([1, 0.7, 0.4], 0.06, 0.07);
    G.audio?.play('pillar', { pos });
    // hits: launch up, then two more ticks while airborne
    for (const [dt, lift, dmg] of [[0, 15, 220], [0.22, 5, 90], [0.44, 5, 90]]) {
      after(dt, () => {
        for (const d of G.dummies.list) {
          const dx = d.pos.x - pos.x, dz = d.pos.z - pos.z;
          if (Math.hypot(dx, dz) < 1.6 * s + d.radius && d.pos.y < 7) {
            hit(d, { dir: new THREE.Vector3(dx || 0.01, 0, dz), kb: 0.8, lift, hitstop: 0.06, shake: 0.05, kind: 'none', dmg, sound: null, spin: 1.2 });
            d.status.burn = 3;
          }
        }
      });
    }
  });
}
