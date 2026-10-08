// Layered composite effects. Each preset stacks several primitives:
// anticipation/flash → impact (spark, ring, light) → lingering debris/smoke.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { SHAPE, CURVE } from './particles.js';
import { PUFF } from './puffs.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export function randUnit(out = new THREE.Vector3()) {
  const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(th), u, r * Math.sin(th));
}
/** random direction inside a cone around dir (spread in radians) */
export function cone(dir, spread, out = new THREE.Vector3()) {
  randUnit(_v3);
  out.copy(dir).normalize();
  const perp = _v3.addScaledVector(out, -_v3.dot(out)).normalize();
  const ang = Math.random() * spread;
  return out.multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
}
/** screen-space angle of a world direction at a point (for orienting billboards) */
export function screenAngle(pos, dir) {
  const cam = G.rig.camera;
  const a = _v.copy(pos).project(cam);
  const b = _v2.copy(pos).addScaledVector(dir, 0.5).project(cam);
  const asp = G.pipeline ? G.pipeline.width / G.pipeline.height : 16 / 9;
  return Math.atan2(b.y - a.y, (b.x - a.x) * asp);
}
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const COL = {
  white: [1, 1, 1],
  hot: [1.0, 0.85, 0.55],
  orange: [1.0, 0.45, 0.1],
  red: [1.0, 0.15, 0.08],
  cyan: [0.3, 0.85, 1.0],
  blue: [0.25, 0.45, 1.0],
  violet: [0.65, 0.3, 1.0],
  gold: [1.0, 0.8, 0.3],
  green: [0.4, 1.0, 0.5],
  ice: [0.6, 0.9, 1.0],
};

export const FXP = {
  // ── melee hits ──────────────────────────────────────────────────────────────
  /** Clean sharp slash hit. tangent = swing direction at contact. */
  hitSlash(p, dir, tangent, color = COL.cyan, s = 1) {
    const fx = G.fx;
    const hot = mix(color, COL.white, 0.6);
    const ang = screenAngle(p, tangent);
    // tight flash core
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 1.5 * s, sizeEnd: 0.1, life: 0.1, color: mul(hot, 4), alphaEnd: 0, rot: ang + Math.PI / 4 });
    fx.add.emit({ pos: p, shape: SHAPE.GLOW, size: 0.9 * s, sizeEnd: 1.3 * s, life: 0.09, color: mul(color, 1.4), alpha: 0.8, alphaEnd: 0 });
    fx.add.emit({ pos: p, shape: SHAPE.FLARE, size: 2.6 * s, w: 1, sizeEnd: 1.2 * s, life: 0.09, color: mul(hot, 2.2), alphaEnd: 0, rot: ang });
    // cut line across the target
    const len = 1.6 * s;
    _v.copy(tangent).normalize();
    fx.line({ a: p.clone().addScaledVector(_v, -len), b: p.clone().addScaledVector(_v, len * 0.8), width: 0.14 * s, color: mul(color, 2.2), core: [5, 5, 5], coreWidth: 0.35, life: 0.15, headFade: 0.3, tailFade: 0.3 });
    // sparks spray along swing + outward
    for (let i = 0; i < 16; i++) {
      _v2.copy(tangent).multiplyScalar(0.9).addScaledVector(dir, 0.55);
      cone(_v2, 0.75, _v2);
      const sp = rand(8, 20) * s;
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(sp), shape: SHAPE.STREAK, size: 0.055 * s, w: 1, stretch: 0.026, life: rand(0.12, 0.28), color: mul(hot, 3.5), colorEnd: mul(color, 1.6), alphaEnd: 0, drag: 4, gravity: 16, sizeCurve: CURVE.LINEAR });
    }
    for (let i = 0; i < 6; i++) {
      cone(dir, 1.2, _v2);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(3, 8) * s), shape: SHAPE.DIAMOND, size: rand(0.07, 0.13) * s, sizeEnd: 0, life: rand(0.25, 0.5), color: mul(color, 2.5), alphaEnd: 0.6, drag: 2, gravity: 6 });
    }
    fx.ring({ pos: p, billboard: true, r0: 0.1 * s, r1: 0.85 * s, w0: 0.07, w1: 0.015, color: mul(color, 1.6), life: 0.13, sharp: 0.7 });
    fx.light(p, color, 1.8, 4 * s, 0.12);
  },

  /** Heavy blunt impact (greatsword, hammer-like). */
  hitHeavy(p, dir, color = COL.orange, s = 1) {
    const fx = G.fx;
    const hot = mix(color, COL.white, 0.55);
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 2.1 * s, sizeEnd: 0.2, life: 0.12, color: mul(hot, 3.5), alphaEnd: 0, rot: Math.random() });
    fx.add.emit({ pos: p, shape: SHAPE.SPIKES, size: 2.6 * s, sizeEnd: 3.4 * s, life: 0.1, color: mul(hot, 1.6), alphaEnd: 0, rot: Math.random() * 6 });
    fx.add.emit({ pos: p, shape: SHAPE.GLOW, size: 1.3 * s, sizeEnd: 1.9 * s, life: 0.12, color: mul(color, 1.1), alpha: 0.7, alphaEnd: 0 });
    fx.ring({ pos: p, billboard: true, r0: 0.15 * s, r1: 1.4 * s, w0: 0.07, w1: 0.012, color: mul(hot, 1.3), life: 0.13, sharp: 0.8 });
    fx.ring({ pos: p, billboard: true, r0: 0.1 * s, r1: 1.0 * s, w0: 0.22, w1: 0.05, color: mul(color, 0.5), life: 0.2, noise: 0.15 });
    for (let i = 0; i < 22; i++) {
      cone(dir, 1.1, _v2);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(7, 20) * s), shape: SHAPE.STREAK, size: 0.075 * s, stretch: 0.028, life: rand(0.15, 0.4), color: mul(hot, 3.2), colorEnd: mul(color, 1.2), alphaEnd: 0, drag: 3.5, gravity: 18 });
    }
    for (let i = 0; i < 3; i++) {
      cone(dir, 1.3, _v2);
      fx.puffs.emit({ pos: p.clone().addScaledVector(_v2, 0.3), vel: _v2.multiplyScalar(rand(3, 5)), size: rand(0.12, 0.2) * s, sizeEnd: rand(0.3, 0.45) * s, life: rand(0.3, 0.45), mode: PUFF.SMOKE, color: [0.66, 0.62, 0.68], shade: [0.38, 0.35, 0.48], drag: 6, rise: 1.2, dissolveStart: 0.1 });
    }
    fx.light(p, color, 2.5, 5 * s, 0.16);
  },

  /** Pierce (spear / bullet into body). */
  hitPierce(p, dir, color = COL.gold, s = 1) {
    const fx = G.fx;
    const hot = mix(color, COL.white, 0.6);
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 1.8 * s, sizeEnd: 0.1, life: 0.1, color: mul(hot, 6), alphaEnd: 0 });
    fx.add.emit({ pos: p, shape: SHAPE.FLARE, size: 3.0 * s, w: 1, sizeEnd: 0.5, life: 0.12, color: mul(color, 3), alphaEnd: 0, rot: screenAngle(p, dir) + Math.PI / 2 });
    // exit spray behind the target
    for (let i = 0; i < 14; i++) {
      cone(dir, 0.45, _v2);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(10, 26) * s), shape: SHAPE.STREAK, size: 0.06 * s, stretch: 0.03, life: rand(0.1, 0.25), color: mul(hot, 5), colorEnd: mul(color, 2), alphaEnd: 0, drag: 4, gravity: 10 });
    }
    // cone shock in thrust direction
    fx.ring({ pos: p.clone().addScaledVector(dir, 0.3), normal: dir, r0: 0.1, r1: 1.0 * s, w0: 0.2, w1: 0.02, color: mul(color, 2), life: 0.15, sharp: 0.5 });
    fx.ring({ pos: p.clone().addScaledVector(dir, 0.9), normal: dir, r0: 0.05, r1: 0.6 * s, w0: 0.2, w1: 0.02, color: mul(color, 1.5), life: 0.18, sharp: 0.5 });
    fx.light(p, color, 3, 4, 0.1);
  },

  /** Bullet hitting a body: small, fast, readable. */
  hitBullet(p, dir, color = COL.hot, s = 1) {
    const fx = G.fx;
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 0.9 * s, sizeEnd: 0.05, life: 0.07, color: mul(COL.white, 5), alphaEnd: 0, rot: Math.random() });
    fx.add.emit({ pos: p, shape: SHAPE.GLOW, size: 0.9 * s, sizeEnd: 1.2 * s, life: 0.08, color: mul(color, 2), alphaEnd: 0 });
    _v.copy(dir).negate();
    for (let i = 0; i < 7; i++) {
      cone(_v, 0.9, _v2);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(6, 14)), shape: SHAPE.STREAK, size: 0.045, stretch: 0.025, life: rand(0.08, 0.18), color: mul(COL.hot, 5), colorEnd: mul(COL.orange, 2), alphaEnd: 0, drag: 5, gravity: 14 });
    }
    fx.ring({ pos: p, billboard: true, r0: 0.05, r1: 0.5 * s, w0: 0.15, w1: 0.03, color: mul(color, 2), life: 0.09, sharp: 0.8 });
    // fluff chunks (dummy stuffing)
    for (let i = 0; i < 3; i++) {
      cone(_v, 1.0, _v2);
      fx.alpha.emit({ pos: p, vel: _v2.multiplyScalar(rand(2, 5)), shape: SHAPE.DOT, size: rand(0.06, 0.1), sizeEnd: 0.02, life: rand(0.3, 0.5), color: [0.95, 0.85, 0.6], colorEnd: [0.9, 0.8, 0.55], alpha: 1, alphaEnd: 1, gravity: 9, drag: 2 });
    }
  },

  /** Bullet hitting the ground/environment. */
  hitGround(p, dir, s = 1) {
    const fx = G.fx;
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 0.6 * s, sizeEnd: 0.05, life: 0.06, color: [5, 4.5, 3.5], alphaEnd: 0 });
    for (let i = 0; i < 5; i++) {
      cone(UP, 0.7, _v2);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(4, 10)), shape: SHAPE.STREAK, size: 0.04, stretch: 0.025, life: rand(0.08, 0.2), color: [5, 4, 2.5], colorEnd: [2, 0.6, 0.1], alphaEnd: 0, drag: 4, gravity: 18 });
    }
    for (let i = 0; i < 2; i++) {
      cone(UP, 0.6, _v2);
      fx.alpha.emit({ pos: p, vel: _v2.multiplyScalar(rand(0.8, 2)), shape: SHAPE.SMOKE, size: rand(0.3, 0.5) * s, sizeEnd: rand(0.8, 1.1) * s, life: rand(0.4, 0.7), color: [0.78, 0.76, 0.82], alpha: 0.9, alphaEnd: 0, drag: 3 });
    }
    for (let i = 0; i < 2; i++) {
      cone(UP, 0.9, _v2);
      fx.debris.rock.emit({ pos: p.clone().setY(0.1), vel: _v2.multiplyScalar(rand(2, 5)), scale: rand(0.03, 0.06), life: rand(0.5, 1) });
    }
  },

  // ── movement / body ────────────────────────────────────────────────────────
  dust(p, s = 1, n = 4, dirBias = null) {
    const fx = G.fx;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      _v2.set(Math.cos(a), 0.15, Math.sin(a));
      if (dirBias) _v2.addScaledVector(dirBias, 1.0);
      _v2.normalize().multiplyScalar(rand(2.5, 5) * s);
      const r = rand(0.25, 0.45) * s;
      fx.puffs.emit({ pos: p.clone().add(_v.set(Math.cos(a) * r, 0.1, Math.sin(a) * r)), vel: _v2, size: rand(0.1, 0.17) * s, sizeEnd: rand(0.26, 0.38) * s, life: rand(0.32, 0.5), mode: PUFF.SMOKE, color: [0.74, 0.7, 0.74], shade: [0.42, 0.39, 0.52], drag: 6, rise: 0.9, dissolveStart: 0.08, stretch: 0.75 });
    }
  },

  slideDust(p, vel, s = 1) {
    _v.copy(vel).setY(0).normalize().negate();
    G.fx.puffs.emit({ pos: p.clone().setY(0.12), vel: _v.multiplyScalar(rand(0.5, 1.5)).setY(rand(0.5, 1.2)), size: rand(0.1, 0.16) * s, sizeEnd: rand(0.25, 0.36) * s, life: rand(0.3, 0.45), mode: PUFF.SMOKE, color: [0.74, 0.7, 0.74], shade: [0.42, 0.39, 0.52], drag: 4, rise: 0.6, dissolveStart: 0.08, stretch: 0.75 });
  },

  bodyLand(p, speed, s = 1) {
    const k = Math.min(1.6, speed / 12);
    FXP.dust(p, s * (0.8 + k * 0.5), 6 + (k * 4) | 0);
    G.fx.ring({ pos: p.clone().setY(0.06), normal: UP, r0: 0.4 * s, r1: (1.8 + k) * s, w0: 0.12, w1: 0.02, color: [1.2, 1.15, 1.3], alpha: 0.5, life: 0.3, sharp: 1 });
    for (let i = 0; i < 4 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      G.fx.debris.rock.emit({ pos: p.clone().setY(0.1), vel: _v.set(Math.cos(a) * rand(1, 3), rand(3, 6), Math.sin(a) * rand(1, 3)), scale: rand(0.05, 0.1), life: rand(0.8, 1.4) });
    }
  },

  wallSplat(p, normal, speed) {
    G.fx.ring({ pos: p, normal: normal.clone().negate(), r0: 0.4, r1: 2.4, w0: 0.15, w1: 0.03, color: [2, 2, 2.2], life: 0.25, sharp: 1 });
    G.fx.add.emit({ pos: p, shape: SHAPE.SPIKES, size: 3, sizeEnd: 4, life: 0.12, color: [3, 3, 3], alphaEnd: 0 });
    FXP.dust(p.clone().setY(0.2), 1.2, 6, normal.clone().negate());
    G.rig?.shake(0.25);
    G.audio?.play('thud', { pos: p, vol: 1 });
  },

  jumpRing(p, color = [0.6, 0.9, 2.0]) {
    const fx = G.fx;
    fx.ring({ pos: p, normal: UP, r0: 0.2, r1: 1.4, w0: 0.2, w1: 0.02, color, life: 0.28, sharp: 0.9 });
    fx.ring({ pos: p.clone().setY(p.y - 0.15), normal: UP, r0: 0.1, r1: 0.9, w0: 0.25, w1: 0.04, color: mul(color, 0.6), life: 0.35, sharp: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      fx.add.emit({ pos: p, vel: _v.set(Math.cos(a) * 4, -1.5, Math.sin(a) * 4), shape: SHAPE.STREAK, size: 0.05, stretch: 0.04, life: 0.2, color: mul(color, 2), alphaEnd: 0, drag: 6 });
    }
  },

  // ── explosions ─────────────────────────────────────────────────────────────
  /** Big anime explosion. */
  explosion(p, s = 1, opts = {}) {
    const fx = G.fx;
    const fire = opts.fire ?? [1.7, 0.85, 0.18];
    const deep = opts.deep ?? [0.95, 0.22, 0.04];
    // 1. flash core (tight, very short)
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 3.6 * s, sizeEnd: 0.5, life: 0.12, color: [4, 3.4, 2.4], alphaEnd: 0, rot: Math.random() });
    fx.add.emit({ pos: p, shape: SHAPE.GLOW, size: 2.6 * s, sizeEnd: 3.6 * s, life: 0.12, color: [1.8, 1.2, 0.6], alpha: 0.85, alphaEnd: 0 });
    fx.add.emit({ pos: p, shape: SHAPE.SPIKES, size: 4.2 * s, sizeEnd: 5.6 * s, life: 0.1, color: [1.8, 1.3, 0.7], alphaEnd: 0, rot: Math.random() * 6 });
    fx.sphere({ pos: p, r0: 0.4 * s, r1: 2.4 * s, color: [1.5, 0.9, 0.4], coreColor: [2.2, 1.8, 1.2], life: 0.12, power: 1.4, core: 0.6 });
    // 2. shock rings
    fx.ring({ pos: p.clone().setY(0.08), normal: UP, r0: 0.5 * s, r1: 6.5 * s, w0: 0.06, w1: 0.008, color: [1.1, 0.8, 0.5], life: 0.4, sharp: 1 });
    fx.ring({ pos: p, billboard: true, r0: 0.5 * s, r1: 4.2 * s, w0: 0.06, w1: 0.01, color: [1.3, 1.0, 0.7], life: 0.26, sharp: 1 });
    // 3. fireball core (cel fire puffs)
    for (let i = 0; i < 14; i++) {
      randUnit(_v2); _v2.y = Math.abs(_v2.y) * 0.8 + 0.1;
      fx.puffs.emit({ pos: p.clone().addScaledVector(_v2, rand(0.2, 0.7) * s), vel: _v2.clone().multiplyScalar(rand(4, 9) * s), size: rand(0.4, 0.65) * s, sizeEnd: rand(0.95, 1.4) * s, life: rand(0.45, 0.7), mode: PUFF.FIRE, color: fire, shade: deep, heat: rand(0.95, 1.15), drag: 6, rise: 2.5, dissolveStart: 0.3 });
    }
    // 4. smoke that lingers and rises
    for (let i = 0; i < 8; i++) {
      randUnit(_v2); _v2.y = Math.abs(_v2.y) * 0.6 + 0.3;
      fx.puffs.emit({ pos: p.clone().addScaledVector(_v2, rand(0.5, 1.2) * s), vel: _v2.clone().multiplyScalar(rand(2, 4) * s), size: rand(0.45, 0.7) * s, sizeEnd: rand(1.0, 1.45) * s, life: rand(1.0, 1.6), mode: PUFF.SMOKE, color: [0.4, 0.36, 0.42], shade: [0.2, 0.17, 0.25], drag: 3, rise: 1.6, dissolveStart: 0.3 });
    }
    // 5. sparks & embers
    for (let i = 0; i < 40; i++) {
      randUnit(_v2); _v2.y = Math.abs(_v2.y);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(10, 30) * s), shape: SHAPE.STREAK, size: 0.08 * s, stretch: 0.03, life: rand(0.3, 0.75), color: [4, 2.6, 1.2], colorEnd: [1.6, 0.35, 0.05], alphaEnd: 0, drag: 2.5, gravity: 14 });
    }
    for (let i = 0; i < 20; i++) {
      randUnit(_v2); _v2.y = Math.abs(_v2.y) + 0.3;
      fx.add.emit({ pos: p.clone().addScaledVector(_v2, s), vel: _v2.multiplyScalar(rand(1, 4) * s), shape: SHAPE.DOT, size: rand(0.05, 0.09), sizeEnd: 0.0, life: rand(1, 2), color: [3.5, 1.8, 0.45], colorEnd: [1.6, 0.35, 0.05], alpha: 1, alphaEnd: 0.5, drag: 1.5, gravity: -1.5 });
    }
    // 6. rocks
    for (let i = 0; i < 12 * s; i++) {
      randUnit(_v2); _v2.y = Math.abs(_v2.y) * 1.2 + 0.4;
      fx.debris.rock.emit({ pos: p.clone().setY(Math.max(0.2, p.y)), vel: _v2.normalize().multiplyScalar(rand(6, 15)), scale: rand(0.08, 0.22) * s, life: rand(1.5, 2.5) });
    }
    // 7. scorch
    if (p.y < 2.5) fx.decal({ pos: p, size: 3.4 * s, type: 0, color: [3, 1.0, 0.2], glow: 1.4, life: 7, fadeStart: 0.5 });
    fx.light(p, [1, 0.6, 0.25], 3.5, 10 * s, 0.5);
    G.rig?.shake(0.5 * Math.min(1.3, s));
    G.screen?.chroma(0.01 * s, 0.25);
  },

  // ── weapons ─────────────────────────────────────────────────────────────────
  muzzleFlash(p, dir, s = 1, color = [4, 2.8, 1.2]) {
    const fx = G.fx;
    const ang = screenAngle(p, dir);
    const fwd = p.clone().addScaledVector(dir, 0.16 * s);
    // crisp petals: forward flame + 4-point star + side flare
    fx.add.emit({ pos: fwd, shape: SHAPE.FLAME, size: 0.55 * s, w: 0.55, sizeEnd: 0.75 * s, life: 0.045, color: mul(color, 1.1), alphaEnd: 0.3, rot: ang - Math.PI / 2, sizeCurve: CURVE.LINEAR });
    fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 0.75 * s, sizeEnd: 0.3 * s, life: 0.04, color: mul(color, 1.4), alphaEnd: 0, rot: ang + Math.PI / 4 });
    fx.add.emit({ pos: p, shape: SHAPE.FLARE, size: 1.1 * s, w: 1, sizeEnd: 0.4 * s, life: 0.04, color: mul(color, 0.7), alphaEnd: 0, rot: ang + Math.PI / 2 });
    fx.add.emit({ pos: p, shape: SHAPE.GLOW, size: 0.45 * s, sizeEnd: 0.6 * s, life: 0.04, color: mul(color, 0.6), alphaEnd: 0 });
    for (let i = 0; i < 4; i++) {
      cone(dir, 0.35, _v2);
      fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(10, 20)), shape: SHAPE.STREAK, size: 0.035, stretch: 0.02, life: rand(0.05, 0.12), color: [4, 3.2, 1.6], colorEnd: [2.5, 0.8, 0.15], alphaEnd: 0, drag: 6 });
    }
    cone(dir, 0.5, _v2);
    fx.alpha.emit({ pos: p.clone().addScaledVector(dir, 0.15), vel: _v2.multiplyScalar(rand(0.8, 1.6)).add(_v.set(0, 0.5, 0)), shape: SHAPE.SMOKE, size: 0.16 * s, sizeEnd: 0.45 * s, life: rand(0.35, 0.55), color: [0.78, 0.76, 0.82], alpha: 0.5, alphaEnd: 0, drag: 2.5 });
    fx.light(p, [1, 0.7, 0.35], 1.3 * s, 3.2, 0.05);
  },

  /** Ejected brass casing. side: world right vector */
  casing(p, side, fwd, s = 1) {
    _v.copy(side).multiplyScalar(rand(2.5, 4)).addScaledVector(UP, rand(2.5, 4)).addScaledVector(fwd, rand(-0.8, 0.4));
    G.fx.debris.casing.emit({
      pos: p, vel: _v, scale: new THREE.Vector3(0.035, 0.035, 0.035).multiplyScalar(s), radius: 0.02, spin: rand(15, 30), life: 2.2, bounce: 0.45, friction: 0.7,
      onBounce: (it, v) => { if (v > 2) G.audio?.play('casing', { pos: it.p, vol: Math.min(0.5, v / 10) }); },
    });
  },
};
