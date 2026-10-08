// 어둠 마법 「심연」 — homing void orbs and a black hole that collapses into a blast.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MagicWeapon, after } from './magic.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { clamp01, easing } from '../entities/pose.js';
import { hit } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const VIO = [1.2, 0.35, 2.4];
const VOID_SMOKE = [0.22, 0.14, 0.3], VOID_SHADE = [0.08, 0.04, 0.12];

const darkMat = new THREE.MeshBasicMaterial({ color: 0x050208 });
darkMat.userData.shared = true;
const sphereGeo = new THREE.SphereGeometry(1, 24, 16);

/** Void burst: implode then explode in dark cel smoke with violet rims. */
export function voidBurst(p, s = 1) {
  const fx = G.fx;
  fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 1.8 * s, sizeEnd: 0.1, life: 0.12, color: [1.8, 0.8, 3], alphaEnd: 0 });
  fx.add.emit({ pos: p, shape: SHAPE.SPIKES, size: 2.4 * s, sizeEnd: 3.2 * s, life: 0.1, color: [0.9, 0.3, 1.8], alphaEnd: 0 });
  fx.ring({ pos: p, billboard: true, r0: 0.1, r1: 1.6 * s, w0: 0.08, w1: 0.015, color: [1.1, 0.4, 2.2], life: 0.2, sharp: 1 });
  fx.ring({ pos: p, billboard: true, r0: 1.4 * s, r1: 0.1, w0: 0.03, w1: 0.1, color: [0.8, 0.3, 1.6], life: 0.12, sharp: 1, easing: (k) => k });
  for (let i = 0; i < 9; i++) {
    randUnit(_v2);
    fx.puffs.emit({ pos: p.clone().addScaledVector(_v2, 0.2 * s), vel: _v2.clone().multiplyScalar(rand(3, 6) * s), size: rand(0.2, 0.3) * s, sizeEnd: rand(0.45, 0.65) * s, life: rand(0.4, 0.65), mode: PUFF.MIST, color: [0.5, 0.2, 0.8], shade: VOID_SHADE, drag: 5, rise: 0.4, dissolveStart: 0.2 });
  }
  for (let i = 0; i < 12; i++) {
    randUnit(_v2);
    fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(5, 12) * s), shape: SHAPE.STREAK, size: 0.045, stretch: 0.03, life: rand(0.15, 0.3), color: [1.8, 0.7, 3], alphaEnd: 0, drag: 4 });
  }
  fx.distort({ pos: p, r0: 0.2, r1: 3 * s, strength: 0.03, life: 0.25 });
  fx.light(p, [0.6, 0.25, 1.0], 2.2, 5 * s, 0.18);
}

export class DarkMagic extends MagicWeapon {
  constructor() {
    super([1.2, 0.4, 2.2], 0xb36bff);
    this.id = 'dark';
    this.name = '어둠 마법 「심연」';
    this.short = '어둠';
    this.icon = '闇';
    this.desc = '<b>좌클릭</b> 공허탄 (유도) · <b>우클릭</b> 블랙홀 (끌어당긴 뒤 붕괴 폭발)';
    this.cool = 0; this.side = 0; this.holeCool = 0;
  }
  press(p, btn) {
    if (btn === 0) { this.want = true; return; }
    if (this.holeCool > 0) return;
    if (p.action && !p.action.cancelable?.('shoot')) return;
    if (p.action) p.endAction();
    this.blackHole(p);
  }
  hold(p, btn) { if (btn === 0) this.want = true; }
  tick(p, dt) {
    this.cool -= dt; this.holeCool -= dt;
    if (this.want && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot'))) { if (p.action) p.endAction(); this.voidBolt(p); }
    this.want = false;
  }

  voidBolt(p) {
    this.cool = 0.3; this.aimT = 0.8; this.castK = 1;
    const side = this.side; this.side ^= 1; this.castSide = side;
    const from = this.castPalm(p, side);
    const tgt = this.aimDummy();
    const dir = _v.subVectors(tgt ? tgt.center(_v2) : this.aimPoint, from).normalize().clone();
    // launch sideways first, then curve in (homing)
    const r = p.right(new THREE.Vector3()).multiplyScalar(side === 0 ? -1 : 1);
    const v0 = dir.clone().multiplyScalar(14).addScaledVector(r, 6).addScaledVector(UP, 3);
    const core = new THREE.Mesh(sphereGeo, darkMat);
    core.scale.setScalar(0.17);
    G.scene.add(core);
    const rim = G.fx.sphere({ pos: from, r0: 0.3, r1: 0.3, color: [1.2, 0.35, 2.4], coreColor: [0.2, 0.05, 0.4], life: 99, power: 2.2, core: 0, alphaCurve: () => 1, noise: 0.4 });
    G.fx.add.emit({ pos: from, shape: SHAPE.STAR, size: 0.9, sizeEnd: 0, life: 0.1, color: [1.6, 0.6, 2.8], alphaEnd: 0 });
    G.audio?.play('void');
    let trailT = 0;
    G.projectiles.spawn({
      pos: from, vel: v0, life: 2.5, radius: 0.22,
      steer: (pr, dt) => {
        const goal = tgt ? tgt.center(_v2) : this.aimPoint;
        const want = _v.subVectors(goal, pr.pos).normalize().multiplyScalar(26);
        pr.vel.lerp(want, Math.min(1, dt * (2 + pr.age * 8)));
      },
      render: (pr, dt) => {
        core.position.copy(pr.pos);
        rim.obj.position.copy(pr.pos);
        trailT -= dt;
        if (trailT <= 0) {
          trailT = 0.016;
          G.fx.puffs.emit({ pos: pr.pos.clone().add(randUnit(_v2).multiplyScalar(0.08)), vel: randUnit(_v2).multiplyScalar(0.4), size: rand(0.12, 0.17), sizeEnd: 0.02, life: rand(0.3, 0.45), mode: PUFF.MIST, color: [0.45, 0.15, 0.7], shade: VOID_SHADE, drag: 2, dissolveStart: 0.1 });
          G.fx.add.emit({ pos: pr.pos.clone().add(randUnit(_v2).multiplyScalar(0.25)), vel: randUnit(_v2).multiplyScalar(0.8), shape: SHAPE.DIAMOND, size: rand(0.04, 0.07), sizeEnd: 0, life: rand(0.3, 0.5), color: [1.6, 0.6, 2.8], alphaEnd: 0 });
        }
      },
      onHit: (pr, d, point) => {
        voidBurst(pr.pos.clone(), 0.9);
        hit(d, { dir: pr.vel.clone().setY(0).normalize(), point, kb: 3.5, lift: d.airborne ? 3 : 1, hitstop: 0.07, atkStop: 0, shake: 0.08, kind: 'none', dmg: 115 + Math.round(Math.random() * 20), sound: 'voidHit' });
      },
      onGround: (pr, point) => { voidBurst(point.clone().setY(0.3), 0.7); G.fx.decal({ pos: point, size: 1.4, type: 1, color: [1.2, 0.4, 2.4], dark: [0.04, 0.02, 0.06], glow: 1.5, life: 3, reveal: 0.1 }); },
      onExpire: (pr) => voidBurst(pr.pos.clone(), 0.7),
      onDead: () => { core.parent?.remove(core); rim.t = rim.life; },
    });
  }

  aimDummy() {
    const cam = G.rig.camera, o = cam.position, d = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bestA = 0.1;
    for (const du of G.dummies.list) {
      const c = du.center(new THREE.Vector3());
      if (c.distanceTo(G.player.pos) > 40) continue;
      const ang = 1 - c.sub(o).normalize().dot(d);
      if (ang < bestA) { bestA = ang; best = du; }
    }
    return best;
  }

  blackHole(p) {
    this.holeCool = 3.2; this.aimT = 1.4; this.castK = 1.6; this.castSide = 0;
    const at = this.aimPoint.clone();
    const flat = at.clone().sub(p.pos).setY(0);
    if (flat.length() > 18) at.copy(p.pos).add(flat.setLength(18));
    if (flat.length() < 3) at.copy(p.pos).addScaledVector(p.forward(_v), 6);
    at.y = 2.2;
    singularity(at);
  }
}

export function singularity(c) {
  const fx = G.fx;
  const FORM = 0.35, ACTIVE = 2.1, COLLAPSE = 0.18;
  const total = FORM + ACTIVE + COLLAPSE;
  const core = new THREE.Mesh(sphereGeo, darkMat);
  core.position.copy(c);
  core.scale.setScalar(0.01);
  G.scene.add(core);
  const rim = fx.sphere({ pos: c, r0: 0.1, r1: 0.1, color: [1.6, 0.5, 3.0], coreColor: [0.1, 0.02, 0.2], life: total, power: 2.6, core: 0, alphaCurve: () => 1, noise: 0.3, follow: (m) => m.scale.setScalar(core.scale.x * 1.18) });
  const disk = fx.diskMesh({ color: [1.0, 0.25, 2.0], hot: [2.6, 1.6, 3.4], inner: 0.28, outer: 1.0 });
  disk.mesh.position.copy(c);
  disk.mesh.rotation.set(-Math.PI / 2 + 0.35, 0, 0.2);
  G.scene.add(disk.mesh);
  const disk2 = fx.diskMesh({ color: [0.5, 0.12, 1.1], hot: [1.4, 0.7, 2.0], inner: 0.5, outer: 1.0, alpha: 0.6 });
  disk2.mesh.position.copy(c);
  disk2.mesh.rotation.set(-Math.PI / 2 - 0.25, 0.4, -0.3);
  G.scene.add(disk2.mesh);
  const lens = fx.distort({ pos: c, mode: 'lens', r0: 4.2, r1: 4.2, strength: 0.06, life: total, strengthCurve: () => 1 });
  const light = fx.light(c, [0.6, 0.2, 1.0], 2.5, 9, 0);
  fx.decal({ pos: c.clone().setY(0), size: 6, type: 3, color: [0.6, 0.15, 1.2], life: total + 0.3, spin: -1.2, reveal: 0.3, additive: true });
  fx.decal({ pos: c.clone().setY(0), size: 7, type: 0, color: [0.8, 0.2, 1.5], dark: [0.02, 0.0, 0.04], glow: 0.6, life: total + 2, alpha: 0.7 });
  G.audio?.play('blackhole');
  const pulled = new Set();
  let emitT = 0, hitT = 0;
  fx.spawn(new THREE.Object3D(), total, (e, k, dt) => {
    const t = e.t;
    // size curve
    let s;
    if (t < FORM) s = easing.outBack(t / FORM) * 0.95;
    else if (t < FORM + ACTIVE) s = 0.95 + Math.sin((t - FORM) * 9) * 0.04;
    else s = 0.95 * (1 - easing.inQuad((t - FORM - ACTIVE) / COLLAPSE));
    core.scale.setScalar(Math.max(0.01, s));
    const ds = Math.max(0.01, s) * 3.4;
    disk.mesh.scale.setScalar(ds); disk2.mesh.scale.setScalar(ds * 1.25);
    disk.u.uTime.value = t; disk2.u.uTime.value = t * 0.7;
    disk.mesh.rotation.z += dt * 0.6; disk2.mesh.rotation.z -= dt * 0.4;
    lens.obj.scale.setScalar(4.2 * Math.max(0.2, s));
    // particles spiraling in
    emitT -= dt;
    if (emitT <= 0 && t < FORM + ACTIVE) {
      emitT = 0.008;
      const a = Math.random() * Math.PI * 2, r = rand(4, 8), y = rand(-1.8, 2.5);
      const q = c.clone().add(_v.set(Math.cos(a) * r, y, Math.sin(a) * r));
      fx.add.emit({ pos: q, vel: _v2.set(-Math.sin(a) * 6, -y * 0.8, Math.cos(a) * 6), shape: SHAPE.STREAK, size: 0.035, stretch: 0.04, life: rand(0.5, 0.8), color: [1.4, 0.5, 2.6], alpha: 0.2, alphaEnd: 1, orbit: { cx: c.x, cz: c.z, spin: 10, pull: 22 }, drag: 0.5 });
      if (Math.random() < 0.25) fx.puffs.emit({ pos: q, vel: _v2.set(c.x - q.x, c.y - q.y, c.z - q.z).multiplyScalar(0.5), size: rand(0.15, 0.25), sizeEnd: 0.02, life: 0.8, mode: PUFF.MIST, color: [0.35, 0.12, 0.55], shade: VOID_SHADE, drag: 0.5, dissolveStart: 0.5, grow: 'in' });
      if (Math.random() < 0.05) fx.debris.rock.emit({ pos: c.clone().add(_v.set(Math.cos(a) * r * 0.8, -c.y + 0.2, Math.sin(a) * r * 0.8)), vel: _v2.set(c.x - q.x, 6, c.z - q.z).multiplyScalar(0.8), scale: rand(0.06, 0.14), gravity: 2, life: 1.0 });
    }
    // pull dummies
    if (t > FORM * 0.5 && t < FORM + ACTIVE) {
      for (const d of G.dummies.list) {
        const dc = d.center(_v);
        const to = _v2.subVectors(c, dc);
        const dist = to.length();
        if (dist < 9) {
          if (!pulled.has(d)) { pulled.add(d); }
          if (d.state !== 'air') { d.vel.y = 3; d.enterAir(0.3); }
          d.juggleGrav = 0.05;
          to.normalize();
          const sp = Math.min(9, 2 + (9 - dist) * 1.2);
          d.vel.lerp(to.multiplyScalar(dist > 1.2 ? sp : 0.5).add(_v.set(-to.z, 0, to.x).multiplyScalar(2)), Math.min(1, dt * 3));
          d.stunEyes = 0.5;
        }
      }
      hitT -= dt;
      if (hitT <= 0) {
        hitT = 0.25;
        for (const d of pulled) {
          if (d.center(_v).distanceTo(c) < 3.5) { G.hud?.damage(d.center(_v), 24 + Math.round(Math.random() * 8)); G.hud?.combo(); d.flashT = 0.03; }
        }
      }
      G.rig.shake(0.01);
    }
    light.p.copy(c);
    light.i = 2.5 * Math.max(0.2, s);
  }, G.scene, {
    onEnd: () => {
      core.parent?.remove(core);
      disk.mesh.parent?.remove(disk.mesh); disk.mesh.material.dispose();
      disk2.mesh.parent?.remove(disk2.mesh); disk2.mesh.material.dispose();
      light.max = 0.001; light.life = 1;
      for (const d of pulled) d.juggleGrav = 1;
      collapseBlast(c, pulled);
    },
  });
}

function collapseBlast(c, pulled) {
  const fx = G.fx;
  G.screen.impact(0.06, true, [0.95, 0.85, 1]);
  G.slowmo(0.2, 0.12, 0.35);
  fx.add.emit({ pos: c, shape: SHAPE.STAR, size: 6, sizeEnd: 0.5, life: 0.2, color: [2.2, 1.2, 3.4], alphaEnd: 0 });
  fx.add.emit({ pos: c, shape: SHAPE.SPIKES, size: 6, sizeEnd: 9, life: 0.16, color: [1.0, 0.35, 2.0], alphaEnd: 0 });
  fx.sphere({ pos: c, r0: 0.3, r1: 6, color: [1.0, 0.3, 2.0], coreColor: [0.3, 0.1, 0.6], life: 0.35, power: 2.2, core: 0.0 });
  fx.ring({ pos: c, billboard: true, r0: 0.3, r1: 9, w0: 0.06, w1: 0.01, color: [1.4, 0.6, 2.4], life: 0.4, sharp: 1 });
  fx.ring({ pos: c.clone().setY(0.1), normal: UP, r0: 0.5, r1: 11, w0: 0.06, w1: 0.008, color: [1.0, 0.4, 2.0], life: 0.5, sharp: 1 });
  fx.distort({ pos: c, r0: 0.3, r1: 12, strength: 0.07, life: 0.5, width: 0.1 });
  for (let i = 0; i < 26; i++) {
    randUnit(_v2);
    fx.puffs.emit({ pos: c.clone().addScaledVector(_v2, 0.5), vel: _v2.clone().multiplyScalar(rand(8, 16)), size: rand(0.35, 0.55), sizeEnd: rand(0.8, 1.2), life: rand(0.5, 0.85), mode: PUFF.MIST, color: [0.45, 0.16, 0.75], shade: VOID_SHADE, drag: 5, rise: 0.3, dissolveStart: 0.25 });
  }
  for (let i = 0; i < 50; i++) {
    randUnit(_v2);
    fx.add.emit({ pos: c, vel: _v2.multiplyScalar(rand(12, 30)), shape: SHAPE.STREAK, size: 0.06, stretch: 0.03, life: rand(0.25, 0.55), color: [2, 0.8, 3.2], colorEnd: [0.6, 0.15, 1.2], alphaEnd: 0, drag: 2.5 });
  }
  fx.light(c, [0.7, 0.3, 1.2], 4, 14, 0.5);
  G.rig.shake(0.7); G.rig.fovPunch(5);
  G.screen.chroma(0.02, 0.4);
  G.audio?.play('voidBoom', { pos: c });
  for (const d of G.dummies.list) {
    const dc = d.center(new THREE.Vector3());
    const dist = dc.distanceTo(c);
    if (dist < 7 || pulled.has(d)) {
      const dir = new THREE.Vector3(d.pos.x - c.x, 0, d.pos.z - c.z);
      if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      d.juggleGrav = 1;
      hit(d, { dir, kb: 18, lift: 9, hitstop: 0.14, shake: 0, kind: 'none', dmg: 480 + Math.round(Math.random() * 60), sound: null, spin: 2, crit: true });
      voidBurst(dc, 0.8);
    }
  }
}
