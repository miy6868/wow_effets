// 번개 마법 「뇌명」 — chain lightning and a triple thunder strike.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MagicWeapon, lightning, after } from './magic.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { clamp01, easing } from '../entities/pose.js';
import { hit } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BOLT = [0.55, 0.85, 3.2];
const CORE = [3.5, 4, 6];

/** Electric impact: sparks, star, ring, shock status. */
export function zapHit(point, s = 1) {
  const fx = G.fx;
  fx.add.emit({ pos: point, shape: SHAPE.STAR, size: 1.4 * s, sizeEnd: 0.2, life: 0.1, color: [2, 2.4, 4], alphaEnd: 0, rot: Math.random() });
  fx.add.emit({ pos: point, shape: SHAPE.GLOW, size: 0.9 * s, sizeEnd: 1.3 * s, life: 0.12, color: [0.4, 0.65, 1.7], alpha: 0.8, alphaEnd: 0 });
  for (let i = 0; i < 14; i++) {
    randUnit(_v2);
    fx.add.emit({ pos: point, vel: _v2.multiplyScalar(rand(5, 14) * s), shape: SHAPE.STREAK, size: 0.04, stretch: 0.03, life: rand(0.1, 0.3), color: [2.5, 3.2, 6], colorEnd: [0.4, 0.6, 2], alphaEnd: 0, drag: 5, gravity: 6 });
  }
  fx.ring({ pos: point, billboard: true, r0: 0.1, r1: 0.8 * s, w0: 0.06, w1: 0.012, color: [0.4, 0.6, 1.5], life: 0.12, sharp: 1 });
  fx.light(point, [0.5, 0.7, 1.4], 2.5, 6, 0.15);
}

/** Small crawling arcs around a point (for shocked bodies / ground). */
export function arcs(center, radius, n = 3, life = 0.12) {
  for (let i = 0; i < n; i++) {
    const a = center.clone().add(randUnit(_v).multiplyScalar(radius * rand(0.3, 1)));
    const b = center.clone().add(randUnit(_v2).multiplyScalar(radius * rand(0.3, 1)));
    lightning({ a, b, width: 0.12, life, branches: 0, depth: 3, jag: 0.3, color: [0.5, 0.8, 2.6], core: [2.5, 3, 4.5] });
  }
}

G.arcs = arcs;

export class LightningMagic extends MagicWeapon {
  constructor() {
    super([0.8, 1.2, 3.2], 0x8fd8ff);
    this.id = 'lightning';
    this.name = '번개 마법 「뇌명」';
    this.short = '번개';
    this.icon = '雷';
    this.desc = '<b>좌클릭</b> 연쇄 번개 (최대 5체) · <b>우클릭</b> 낙뢰 3연격';
    this.cool = 0;
  }
  press(p, btn) {
    if (this.cool > 0 || (p.action && !p.action.cancelable?.('shoot'))) { if (btn === 0) this.want = true; return; }
    if (p.action) p.endAction();
    if (btn === 0) this.chain(p); else this.thunder(p);
  }
  hold(p, btn) { if (btn === 0) this.want = true; }
  tick(p, dt) {
    this.cool -= dt;
    if (this.want && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot'))) { if (p.action) p.endAction(); this.chain(p); }
    this.want = false;
  }

  chain(p) {
    this.cool = 0.42; this.aimT = 0.8; this.castK = 1; this.castSide = 0;
    const palm = this.castPalm(p, 0);
    // first target near the crosshair
    const cam = G.rig.camera, o = cam.position, d = cam.getWorldDirection(new THREE.Vector3());
    let first = null, bestA = 0.06;
    for (const du of G.dummies.list) {
      const c = du.center(new THREE.Vector3());
      if (c.distanceTo(p.pos) > 26) continue;
      const ang = 1 - c.sub(o).normalize().dot(d);
      if (ang < bestA) { bestA = ang; first = du; }
    }
    G.fx.add.emit({ pos: palm, shape: SHAPE.STAR, size: 1.3, sizeEnd: 0.1, life: 0.12, color: [2.5, 3, 5], alphaEnd: 0 });
    G.fx.light(palm, [0.5, 0.7, 1.4], 2, 5, 0.12);
    G.audio?.play('zap');
    if (!first) {
      // bolt to the aim point, ground burst
      const end = this.aimPoint.clone();
      if (end.distanceTo(palm) > 22) end.copy(palm).addScaledVector(_v.subVectors(end, palm).normalize(), 22);
      lightning({ a: palm, b: end, width: 0.4, life: 0.2, color: BOLT, core: CORE });
      zapHit(end, 0.8);
      if (end.y < 0.2) { G.fx.decal({ pos: end, size: 1.2, type: 0, color: [0.6, 0.9, 3], glow: 1.5, life: 3 }); arcs(end.clone().setY(0.2), 0.8, 2); }
      return;
    }
    // chain up to 5 targets, each link a little later
    const chainList = [first];
    let cur = first;
    while (chainList.length < 5) {
      let next = null, bd = 8;
      for (const du of G.dummies.list) {
        if (chainList.includes(du)) continue;
        const dist = du.center(_v).distanceTo(cur.center(_v2));
        if (dist < bd) { bd = dist; next = du; }
      }
      if (!next) break;
      chainList.push(next); cur = next;
    }
    let prevPt = () => palm;
    chainList.forEach((du, i) => {
      const from = prevPt;
      const to = () => du.center(new THREE.Vector3());
      after(i * 0.05 + 0.0001, () => {
        lightning({ a: from(), b: to, width: i === 0 ? 0.45 : 0.36, life: 0.26, color: BOLT, core: CORE });
        const pt = to();
        zapHit(pt, 0.9);
        hit(du, { dir: _v.subVectors(du.pos, p.pos).setY(0).normalize(), point: pt, kb: 2.2, lift: du.airborne ? 3 : 0, hitstop: 0.09, atkStop: i === 0 ? 0.03 : 0, shake: 0.08, kind: 'none', dmg: 95 + Math.round(Math.random() * 20), sound: 'zap', spin: 0.5 });
        du.status.shock = 1.0;
      });
      const fixed = du;
      prevPt = () => fixed.center(new THREE.Vector3());
    });
  }

  thunder(p) {
    this.cool = 1.4; this.aimT = 1.4; this.castK = 1.4; this.castSide = 0;
    const base = this.aimPoint.clone(); base.y = 0.03;
    if (base.distanceTo(p.pos) > 26) base.copy(p.pos).addScaledVector(_v.subVectors(base, p.pos).setY(0).normalize(), 26);
    // warning circle
    G.fx.decal({ pos: base, size: 4.2, type: 3, color: [0.4, 0.7, 2.2], life: 1.3, spin: 1.5, reveal: 0.2, additive: true, fadeStart: 0.7 });
    G.fx.decal({ pos: base, size: 4.2, type: 4, color: [0.08, 0.14, 0.45], life: 1.3, additive: true, fadeStart: 0.6 });
    G.audio?.play('charge', { pitch: 1.4 });
    // gathering clouds of sparks above
    const sky = base.clone().setY(16);
    for (let i = 0; i < 30; i++) G.fx.add.emit({ pos: sky.clone().add(randUnit(_v).multiplyScalar(4)), vel: randUnit(_v2).multiplyScalar(2), shape: SHAPE.GLOW, size: rand(0.8, 1.6), sizeEnd: 0, life: 0.5, color: [0.2, 0.3, 0.9], alpha: 0, alphaEnd: 0.8, fadeIn: 0.6 });
    const offsets = [[0, 0], [1.6, 0.8], [-1.4, -1.0]];
    offsets.forEach(([ox, oz], i) => after(0.35 + i * 0.16, () => strike(base.clone().add(_v.set(ox, 0, oz)), i === 2 ? 1.25 : 1)));
  }
}

export function strike(pos, s = 1) {
  const fx = G.fx;
  const top = pos.clone().add(_v.set(rand(-2, 2), 30, rand(-2, 2)));
  lightning({ a: top, b: pos.clone(), width: 1.1 * s, life: 0.32, branches: 5, jag: 0.12, depth: 6, color: [0.6, 0.9, 3.4], core: [4, 4.5, 6.5] });
  lightning({ a: top.clone().add(_v.set(rand(-3, 3), 0, rand(-3, 3))), b: pos.clone(), width: 0.5 * s, life: 0.2, branches: 2, jag: 0.15, color: [0.5, 0.7, 2.6], core: [2.5, 3, 4.5] });
  // ground burst
  fx.add.emit({ pos: pos.clone().setY(0.5), shape: SHAPE.STAR, size: 3.2 * s, sizeEnd: 0.4, life: 0.12, color: [2, 2.4, 3.6], alphaEnd: 0 });
  fx.add.emit({ pos: pos.clone().setY(0.4), shape: SHAPE.GLOW, size: 1.8 * s, sizeEnd: 2.6 * s, life: 0.16, color: [0.35, 0.55, 1.4], alpha: 0.8, alphaEnd: 0 });
  fx.add.emit({ pos: pos.clone().setY(0.4), shape: SHAPE.SPIKES, size: 3.4 * s, sizeEnd: 4.6 * s, life: 0.09, color: [1.0, 1.3, 2.4], alphaEnd: 0 });
  fx.ring({ pos: pos.clone().setY(0.08), normal: UP, r0: 0.3, r1: 5 * s, w0: 0.06, w1: 0.01, color: [0.6, 0.9, 2.1], life: 0.35, sharp: 1 });
  fx.distort({ pos: pos.clone().setY(0.6), r0: 0.3, r1: 5 * s, strength: 0.035, life: 0.3 });
  fx.decal({ pos, size: 2.6 * s, type: 0, color: [0.6, 0.9, 3], glow: 2, life: 6 });
  fx.decal({ pos, size: 3.2 * s, type: 1, color: [0.6, 1.0, 3.2], glow: 1.6, life: 3, reveal: 0.1 });
  for (let i = 0; i < 36; i++) {
    randUnit(_v2); _v2.y = Math.abs(_v2.y) * 0.8 + 0.2;
    fx.add.emit({ pos: pos.clone().setY(0.3), vel: _v2.multiplyScalar(rand(6, 18)), shape: SHAPE.STREAK, size: 0.05, stretch: 0.03, life: rand(0.2, 0.5), color: [2.5, 3.2, 6], colorEnd: [0.4, 0.6, 2], alphaEnd: 0, drag: 3, gravity: 14 });
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.debris.rock.emit({ pos: pos.clone().setY(0.2), vel: _v.set(Math.cos(a) * rand(2, 5), rand(4, 9), Math.sin(a) * rand(2, 5)), scale: rand(0.06, 0.14), life: rand(1, 1.6) });
  }
  // ground-crawling arcs radiating out
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand(-0.3, 0.3);
    const e = pos.clone().add(_v.set(Math.cos(a) * rand(2, 3.5) * s, 0.1, Math.sin(a) * rand(2, 3.5) * s));
    lightning({ a: pos.clone().setY(0.15), b: e, width: 0.18, life: 0.3, branches: 1, depth: 4, jag: 0.25, color: [0.5, 0.8, 2.6], core: [2.5, 3, 4.5] });
  }
  fx.light(pos.clone().setY(2), [0.55, 0.75, 1.5], 2.6, 9, 0.22);
  G.screen.flash([0.8, 0.88, 1], 0.16, 0.06);
  G.rig.shake(0.4);
  G.audio?.play('thunder', { pos });
  for (const d of G.dummies.list) {
    const dist = Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z);
    if (dist < 2.4 * s + d.radius) {
      const dir = new THREE.Vector3(d.pos.x - pos.x, 0, d.pos.z - pos.z);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      hit(d, { dir: dir.normalize(), kb: 4, lift: 9, hitstop: 0.12, shake: 0, kind: 'none', dmg: 260 + Math.round(Math.random() * 40), sound: null, spin: 1 });
      zapHit(d.center(new THREE.Vector3()), 1);
      d.status.shock = 1.4;
    }
  }
}
