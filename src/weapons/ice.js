// 얼음 마법 「빙화」 — crystal lances, freezing, glacial spike wave, shatter.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MagicWeapon, after } from './magic.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { hit } from '../combat/combat.js';
import { toonMesh } from '../render/toon.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const ICE = 0xbfeeff;

const crystalGeo = (() => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.32, 1, 0.32); return g; })();
const spikeGeo = (() => { const g = new THREE.ConeGeometry(0.5, 1, 5, 1); g.translate(0, 0.5, 0); return g; })();

function crystalMesh(color = ICE, s = 1, emissive = 0.35) {
  const m = toonMesh(crystalGeo, { color, emissive, spec: 1.2, rim: 1.2, outlineWidth: 1.6, outlineColor: 0x1e3a66 });
  m.scale.setScalar(s);
  return m;
}

/** Frost burst + shards (used on hits and shatters). */
export function frostBurst(pos, s = 1, shards = 8) {
  const fx = G.fx;
  fx.add.emit({ pos, shape: SHAPE.STAR, size: 1.6 * s, sizeEnd: 0.1, life: 0.12, color: [2.2, 3, 3.6], alphaEnd: 0, rot: Math.random() });
  fx.add.emit({ pos, shape: SHAPE.GLOW, size: 1.1 * s, sizeEnd: 1.5 * s, life: 0.14, color: [0.6, 1.1, 1.8], alpha: 0.7, alphaEnd: 0 });
  fx.ring({ pos, billboard: true, r0: 0.1, r1: 1.2 * s, w0: 0.08, w1: 0.015, color: [1.0, 1.6, 2.4], life: 0.16, sharp: 1 });
  for (let i = 0; i < shards; i++) {
    randUnit(_v2); _v2.y = Math.abs(_v2.y) + 0.2;
    fx.debris.shard.emit({ pos: pos.clone(), vel: _v2.normalize().multiplyScalar(rand(3, 8) * s), scale: rand(0.05, 0.12) * s, life: rand(0.8, 1.4), bounce: 0.3, spin: rand(8, 16) });
  }
  for (let i = 0; i < 12; i++) {
    randUnit(_v2);
    fx.add.emit({ pos, vel: _v2.multiplyScalar(rand(2, 7) * s), shape: SHAPE.DIAMOND, size: rand(0.05, 0.1), sizeEnd: 0, life: rand(0.3, 0.6), color: [1.6, 2.4, 3.2], alphaEnd: 0, drag: 3, gravity: 3 });
  }
  for (let i = 0; i < 4; i++) {
    randUnit(_v2);
    fx.puffs.emit({ pos: pos.clone().addScaledVector(_v2, 0.2), vel: _v2.multiplyScalar(rand(1, 2.5)), size: rand(0.15, 0.25) * s, sizeEnd: rand(0.4, 0.6) * s, life: rand(0.5, 0.8), mode: PUFF.MIST, color: [0.85, 0.95, 1.05], shade: [0.55, 0.7, 0.9], drag: 3, rise: 0.4, dissolveStart: 0.15 });
  }
  fx.light(pos, [0.6, 0.85, 1.2], 1.6, 4, 0.15);
}

/** Encase a dummy in ice for `sec` seconds. */
export function freeze(d, sec = 2.6) {
  d.status.freeze = sec;
  d.status.burn = 0;
  if (d.iceMesh) return;
  const g = new THREE.Group();
  const s = d.s;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const c = crystalMesh(0x8fdcff, rand(0.7, 1.05) * s, 0.4);
    c.position.set(Math.cos(a) * 0.4 * s, rand(0.35, 1.3) * s, Math.sin(a) * 0.4 * s);
    c.rotation.set(Math.sin(a) * 0.6, rand(0, 6), -Math.cos(a) * 0.6);
    g.add(c);
  }
  const big = crystalMesh(0xc6f0ff, 1.3 * s, 0.3);
  big.position.y = 1.05 * s; big.scale.set(1.55 * s, 1.35 * s, 1.55 * s);
  big.material.transparent = true; big.material.uniforms.uOpacity.value = 0.42; big.material.depthWrite = false;
  big.renderOrder = 5;
  g.add(big);
  g.scale.setScalar(0.01);
  d.root.add(g);
  d.iceMesh = g;
  d.iceT = 0;
  const c = d.center(new THREE.Vector3());
  frostBurst(c, 1.2 * s, 6);
  G.fx.decal({ pos: d.pos.clone(), size: 2.2 * s, type: 2, color: [0.3, 0.55, 0.9], dark: [0.5, 0.72, 0.92], alpha: 0.6, life: sec + 1, fadeStart: 0.7 });
  G.audio?.play('freeze', { pos: c });
}

export function shatter(d, strong = false) {
  if (!d.iceMesh) return;
  const c = d.center(new THREE.Vector3());
  d.root.remove(d.iceMesh);
  d.iceMesh = null;
  d.status.freeze = 0;
  frostBurst(c, strong ? 1.8 : 1.3, strong ? 22 : 14);
  G.fx.distort({ pos: c, r0: 0.3, r1: 3.5, strength: 0.03, life: 0.3 });
  G.audio?.play('shatter', { pos: c });
}

// dummy hooks (frozen visuals tick + auto-shatter, hit while frozen)
G.iceTick = (d, dt) => {
  if (!d.iceMesh) return;
  d.iceT += dt;
  const k = Math.min(1, d.iceT / 0.12);
  d.iceMesh.scale.setScalar(0.01 + k * 0.99);
  if (d.status.freeze <= 0) shatter(d);
};
G.iceHit = (d, h) => {
  if (!d.iceMesh) return;
  const strong = (h.kb ?? 0) >= 6 || (h.lift ?? 0) >= 6 || h.kind === 'heavy';
  if (strong || h.shatter) { shatter(d, true); G.hud?.damage(d.center(new THREE.Vector3()), 320, true); }
};

export class IceMagic extends MagicWeapon {
  constructor() {
    super([1.0, 1.7, 2.6], 0xaef0ff);
    this.id = 'ice';
    this.name = '얼음 마법 「빙화」';
    this.short = '얼음';
    this.icon = '氷';
    this.desc = '<b>좌클릭</b> 빙창 3연사 (3회 적중 시 빙결) · <b>우클릭</b> 빙결 가시 파도 · 얼어붙은 적을 강타하면 파쇄';
    this.cool = 0;
  }
  press(p, btn) {
    if (btn === 0) { this.want = true; return; }
    if (this.cool > 0 || (p.action && !p.action.cancelable?.('shoot'))) return;
    if (p.action) p.endAction();
    this.spikes(p);
  }
  hold(p, btn) { if (btn === 0) this.want = true; }
  tick(p, dt) {
    this.cool -= dt;
    if (this.want && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot'))) { if (p.action) p.endAction(); this.lances(p); }
    this.want = false;
  }

  lances(p) {
    this.cool = 0.5; this.aimT = 0.8; this.castK = 1; this.castSide = 0;
    const palm = this.castPalm(p, 0);
    const dir0 = _v.subVectors(this.aimPoint, palm).normalize().clone();
    const right = p.right(new THREE.Vector3());
    G.fx.ring({ pos: palm, normal: dir0, r0: 0.1, r1: 0.6, w0: 0.1, w1: 0.02, color: [0.8, 1.4, 2.2], life: 0.18, sharp: 1 });
    G.audio?.play('ice');
    [-1, 0, 1].forEach((k, i) => after(i * 0.06 + 0.0001, () => {
      const from = this.castPalm(p, 0).addScaledVector(right, k * 0.25).add(_v.set(0, Math.abs(k) * 0.12, 0));
      const target = this.aimPoint.clone().addScaledVector(right, k * 0.5);
      const dir = target.sub(from).normalize();
      const mesh = crystalMesh(0xd8f6ff, 0.42, 0.6);
      G.scene.add(mesh);
      G.projectiles.spawn({
        pos: from, vel: dir.multiplyScalar(48), life: 1.2, radius: 0.12,
        render: (pr) => {
          mesh.position.copy(pr.pos);
          mesh.quaternion.setFromUnitVectors(Y, _v.copy(pr.vel).normalize());
          G.fx.add.emit({ pos: pr.pos, vel: pr.vel, shape: SHAPE.STREAK, size: 0.12, stretch: 0.012, life: 1 / 50, color: [0.6, 1.1, 2], alpha: 1, alphaEnd: 1 });
          if (Math.random() < 0.7) G.fx.add.emit({ pos: pr.pos.clone().add(randUnit(_v2).multiplyScalar(0.1)), vel: randUnit(_v2).multiplyScalar(0.5), shape: SHAPE.DIAMOND, size: rand(0.04, 0.08), sizeEnd: 0, life: rand(0.3, 0.5), color: [1.4, 2.2, 3], alphaEnd: 0 });
          if (Math.random() < 0.5) G.fx.alpha.emit({ pos: pr.pos.clone(), vel: randUnit(_v2).multiplyScalar(0.3), shape: SHAPE.SMOKE, size: 0.12, sizeEnd: 0.35, life: 0.4, color: [0.92, 0.97, 1.0], alpha: 0.45, alphaEnd: 0 });
        },
        onHit: (pr, d, point) => {
          frostBurst(point, 0.7, 5);
          hit(d, { dir: pr.vel.clone().setY(0).normalize(), point, kb: 1.6, lift: d.airborne ? 2.5 : 0, hitstop: 0.06, atkStop: 0, shake: 0.05, kind: 'none', dmg: 70 + Math.round(Math.random() * 15), sound: 'iceHit' });
          d.chill = (d.chill ?? 0) + 0.34;
          if (d.chill >= 1 && !d.iceMesh) { d.chill = 0; freeze(d); }
        },
        onGround: (pr, point) => { frostBurst(point.clone().setY(0.1), 0.6, 4); G.fx.decal({ pos: point, size: 1.0, type: 2, color: [0.3, 0.55, 0.9], dark: [0.5, 0.72, 0.92], alpha: 0.6, life: 3 }); },
        onDead: () => mesh.parent?.remove(mesh),
      });
    }));
  }

  spikes(p) {
    G.hud?.skill('빙결 파도', 'GLACIAL WAVE');
    this.cool = 1.2; this.aimT = 1.3; this.castK = 1.3; this.castSide = 0;
    const start = p.pos.clone().addScaledVector(p.forward(_v), 1.2);
    const tgt = this.aimPoint.clone(); tgt.y = 0;
    const dir = tgt.sub(p.pos).setY(0);
    if (dir.lengthSq() < 0.01) dir.copy(p.forward(_v));
    dir.normalize();
    const N = 16, step = 0.75;
    G.fx.add.emit({ pos: this.palm(p, 0), shape: SHAPE.STAR, size: 1.4, sizeEnd: 0, life: 0.15, color: [2, 2.8, 3.6], alphaEnd: 0 });
    G.audio?.play('iceWave');
    const hitSet = new Set();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < N; i++) {
      after(0.02 + i * 0.03, () => {
        const pos = start.clone().addScaledVector(dir, i * step).addScaledVector(side, rand(-0.25, 0.25));
        const big = 1 + i * 0.035;
        spikeCluster(pos, dir, big);
        for (const d of G.dummies.list) {
          if (hitSet.has(d)) continue;
          if (Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z) < 1.1 + d.radius && d.pos.y < 2) {
            hitSet.add(d);
            hit(d, { dir: dir.clone(), kb: 2.5, lift: 11, hitstop: 0.1, shake: 0.15, kind: 'none', dmg: 210, sound: 'iceHit', spin: 1.1 });
            after(0.1, () => freeze(d, 2.4));
          }
        }
        if (i % 3 === 0) G.rig.shake(0.08);
      });
    }
  }
}

/** One eruption point: a main spike + 2-3 smaller ones, rising fast, lingering, then shattering. */
function spikeCluster(pos, dir, s = 1) {
  const fx = G.fx;
  const g = new THREE.Group();
  g.position.copy(pos);
  const spikes = [];
  const n = 3;
  for (let k = 0; k < n; k++) {
    const m = toonMesh(spikeGeo, { color: k === 0 ? 0x9fe0ff : 0x7fd0ff, emissive: 0.28, spec: 1.2, rim: 1.2, outlineWidth: 1.8, outlineColor: 0x1e3a66 });
    const h = (k === 0 ? rand(1.8, 2.4) : rand(0.8, 1.4)) * s;
    const r = (k === 0 ? 0.42 : 0.26) * s;
    m.position.set(k === 0 ? 0 : rand(-0.45, 0.45), 0, k === 0 ? 0 : rand(-0.45, 0.45));
    m.rotation.set(rand(-0.35, 0.35) + dir.z * 0.25, rand(0, 6), rand(-0.35, 0.35) - dir.x * 0.25);
    m.userData.h = h; m.userData.r = r;
    m.scale.set(r, 0.01, r);
    g.add(m);
    spikes.push(m);
  }
  // burst at the base
  fx.add.emit({ pos: pos.clone().setY(0.4), shape: SHAPE.STAR, size: 1.6 * s, sizeEnd: 0.2, life: 0.1, color: [1.8, 2.6, 3.4], alphaEnd: 0 });
  fx.ring({ pos: pos.clone().setY(0.06), normal: UP, r0: 0.2, r1: 1.6 * s, w0: 0.1, w1: 0.015, color: [0.8, 1.3, 2.1], life: 0.25, sharp: 1 });
  fx.decal({ pos, size: 1.8 * s, type: 2, color: [0.22, 0.42, 0.75], dark: [0.4, 0.52, 0.7], alpha: 0.42, life: 2.6, fadeStart: 0.5 });
  for (let i = 0; i < 6; i++) {
    randUnit(_v2); _v2.y = Math.abs(_v2.y) + 0.5;
    fx.debris.shard.emit({ pos: pos.clone().setY(0.2), vel: _v2.normalize().multiplyScalar(rand(3, 7)), scale: rand(0.04, 0.09), life: rand(0.6, 1.0) });
  }
  for (let i = 0; i < 1; i++) fx.puffs.emit({ pos: pos.clone().add(_v.set(rand(-0.4, 0.4), 0.2, rand(-0.4, 0.4))), vel: _v2.set(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)), size: 0.2 * s, sizeEnd: 0.5 * s, life: rand(0.6, 0.9), mode: PUFF.MIST, color: [0.85, 0.95, 1.05], shade: [0.55, 0.7, 0.9], drag: 2, rise: 0.2, dissolveStart: 0.2 });
  const life = 1.5;
  fx.spawn(g, life, (e, k) => {
    const t = e.t;
    for (const m of spikes) {
      const grow = Math.min(1, t / 0.07);
      const over = grow < 1 ? grow * 1.15 : 1.15 - Math.min(0.15, (t - 0.07) * 1.5);
      const sink = t > 1.2 ? (t - 1.2) / 0.3 : 0;
      m.scale.set(m.userData.r * (1 - sink * 0.5), m.userData.h * over * (1 - sink), m.userData.r * (1 - sink * 0.5));
    }
  }, G.scene, {
    dispose: false,
    onEnd: () => {
      // shatter into fragments + mist
      for (let i = 0; i < 6; i++) {
        randUnit(_v2); _v2.y = Math.abs(_v2.y) + 0.3;
        fx.debris.shard.emit({ pos: pos.clone().setY(rand(0.3, 1.2)), vel: _v2.normalize().multiplyScalar(rand(2, 5)), scale: rand(0.05, 0.12), life: rand(0.7, 1.2) });
      }
      fx.puffs.emit({ pos: pos.clone().setY(0.4), vel: new THREE.Vector3(0, 0.5, 0), size: 0.3, sizeEnd: 0.7, life: 0.7, mode: PUFF.MIST, color: [0.85, 0.95, 1.05], shade: [0.55, 0.7, 0.9], drag: 2, dissolveStart: 0.1 });
    },
  });
}
