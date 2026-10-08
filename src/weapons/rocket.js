// 로켓런처 「천붕」 — rockets with smoke trails, huge explosions, Itano-circus missile swarm.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { GunWeapon } from './gun.js';
import { rocketModel } from './models.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { bladeQuat } from '../entities/pose.js';
import { hit } from '../combat/combat.js';
import { toonMesh } from '../render/toon.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);

let rocketGeo = null;
function rocketMesh(scale = 1) {
  const g = new THREE.Group();
  const body = toonMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), { color: 0x5a6b55, outlineWidth: 1.3 });
  g.add(body);
  const nose = toonMesh(new THREE.ConeGeometry(0.07, 0.16, 10), { color: 0xd8473f, outlineWidth: 1.3 });
  nose.position.y = 0.29; g.add(nose);
  for (let i = 0; i < 4; i++) {
    const fin = toonMesh(new THREE.BoxGeometry(0.01, 0.12, 0.1), { color: 0x2b2e3f, outlineWidth: 1 });
    fin.position.set(Math.cos(i * Math.PI / 2) * 0.08, -0.17, Math.sin(i * Math.PI / 2) * 0.08);
    fin.rotation.y = -i * Math.PI / 2;
    g.add(fin);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Radial damage + knockback. */
export function blastDamage(pos, radius, dmg, kb, lift, opts = {}) {
  for (const d of G.dummies.list) {
    const c = d.center(new THREE.Vector3());
    const dist = c.distanceTo(pos);
    if (dist < radius + d.radius) {
      const k = 1 - Math.min(1, dist / (radius + d.radius)) * 0.6;
      const dir = new THREE.Vector3(d.pos.x - pos.x, 0, d.pos.z - pos.z);
      if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      hit(d, { dir, kb: kb * k, lift: lift * k, hitstop: opts.stop ?? 0.08, shake: 0, kind: opts.kind ?? 'none', color: opts.color, dmg: Math.round(dmg * k), sound: opts.sound ?? null, spin: 1.5, fxScale: 0.8 });
      opts.onHit?.(d);
    }
  }
}

export class RocketLauncher extends GunWeapon {
  constructor() {
    super();
    this.id = 'rocket';
    this.name = '로켓런처 「천붕」';
    this.short = '로켓';
    this.icon = '砲';
    this.desc = '<b>좌클릭</b> 로켓 (대폭발) · <b>우클릭</b> 마이크로 미사일 난무';
    this.modelR = rocketModel();
    this.cool = 0;
    this.recoil = 0;
    this.camDist = 5.0; this.camShoulder = 1.15;
  }
  press(p, btn) {
    if (this.cool > 0 || (p.action && !p.action.cancelable?.('shoot'))) return;
    if (p.action) p.endAction();
    if (btn === 0) this.fire(p); else this.swarm(p);
  }
  tick(p, dt) {
    this.cool -= dt;
    this.recoil *= Math.exp(-dt * 6);
    this.modelR.userData.warhead.visible = this.cool < 0.35;
  }

  backblast(p) {
    const back = this.muzzle(this.modelR, new THREE.Vector3());
    this.modelR.updateWorldMatrix(true, false);
    const tail = this.modelR.userData.back.clone().applyMatrix4(this.modelR.matrixWorld);
    const bdir = tail.clone().sub(back).normalize();
    for (let i = 0; i < 6; i++) {
      const d = cone(bdir, 0.45, new THREE.Vector3());
      G.fx.alpha.emit({ pos: tail.clone().addScaledVector(d, 0.2), vel: d.multiplyScalar(rand(5, 11)), shape: SHAPE.SMOKE, size: rand(0.2, 0.3), sizeEnd: rand(0.7, 1.0), life: rand(0.35, 0.55), color: [0.72, 0.7, 0.76], alpha: 0.75, alphaEnd: 0, drag: 5 });
    }
    G.fx.add.emit({ pos: tail, shape: SHAPE.GLOW, size: 1.0, sizeEnd: 1.4, life: 0.08, color: [2.4, 1.3, 0.4], alpha: 0.8, alphaEnd: 0 });
    G.fx.add.emit({ pos: tail, shape: SHAPE.STAR, size: 1.2, sizeEnd: 0.2, life: 0.08, color: [3, 2, 1], alphaEnd: 0 });
    return back;
  }

  fire(p) {
    this.cool = 0.9; this.aimT = 1.2; this.recoil = 1;
    const from = this.backblast(p);
    const dir = _v.subVectors(this.aimPoint, from).normalize().clone();
    FXP.muzzleFlash(from, dir, 1.6, [4, 2.4, 0.9]);
    G.fx.ring({ pos: from.clone().addScaledVector(dir, 0.3), normal: dir, r0: 0.1, r1: 0.6, w0: 0.1, w1: 0.02, color: [0.5, 0.4, 0.3], life: 0.14, sharp: 1 });
    this.launch(from, dir, { speed: 26, accel: 60, maxSpeed: 60, scale: 1, blast: 1 });
    G.rig.shake(0.22); G.rig.kick(dir.clone().negate(), 1.3); G.rig.fovPunch(2);
    p.vel.addScaledVector(dir.clone().setY(0).normalize(), -3);
    G.audio?.play('rocket');
  }

  swarm(p) {
    G.hud?.skill('미사일 난무', 'MISSILE CIRCUS');
    this.cool = 1.6; this.aimT = 1.6; this.recoil = 0.6;
    const from = this.backblast(p);
    const dir = _v.subVectors(this.aimPoint, from).normalize().clone();
    // targets: dummies in front (or the aim point)
    const fwd = p.forward(new THREE.Vector3());
    const targets = G.dummies.list.filter((d) => { _v2.subVectors(d.pos, p.pos); const dist = _v2.length(); _v2.y = 0; _v2.normalize(); return dist < 30 && _v2.dot(fwd) > 0.2; });
    const N = 12;
    for (let i = 0; i < N; i++) {
      setTimeoutGame(i * 0.045, () => {
        const f = this.muzzle(this.modelR, new THREE.Vector3());
        // launch up and outward in a fan
        const side = ((i % 2) * 2 - 1) * rand(0.6, 1.4);
        const r = p.right(new THREE.Vector3());
        const v0 = dir.clone().multiplyScalar(6).addScaledVector(UP, rand(7, 11)).addScaledVector(r, side * 5).addScaledVector(randUnit(_v2), 2);
        const tgt = targets.length ? targets[i % targets.length] : null;
        const aimPt = tgt ? null : this.aimPoint.clone().add(_v2.set(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)));
        this.launch(f, v0.clone().normalize(), { speed: v0.length(), homing: tgt, aimPt, scale: 0.55, blast: 0.5, swirl: true, seed: Math.random() * 10 });
        G.fx.add.emit({ pos: f, shape: SHAPE.STAR, size: 0.8, sizeEnd: 0, life: 0.06, color: [4, 3, 1.5], alphaEnd: 0 });
        G.audio?.play('missile', { vol: 0.6, pitch: rand(0.9, 1.2) });
      });
    }
    G.rig.shake(0.15);
  }

  launch(from, dir, o) {
    const mesh = rocketMesh(o.scale);
    G.scene.add(mesh);
    const light = G.fx.light(from, [1, 0.6, 0.3], 1.4 * o.scale, 4, 0);
    const self = this;
    let trailT = 0;
    G.projectiles.spawn({
      pos: from, vel: dir.clone().multiplyScalar(o.speed), life: 4, radius: 0.18 * o.scale,
      steer: (pr, dt) => {
        if (o.accel) { const sp = pr.vel.length(); pr.vel.multiplyScalar(Math.min(o.maxSpeed, sp + o.accel * dt) / sp); }
        if (o.homing || o.aimPt) {
          const tgt = o.homing ? o.homing.center(_v2) : o.aimPt;
          const want = _v.subVectors(tgt, pr.pos).normalize();
          const k = Math.min(1, pr.age * 1.6);
          const sp = Math.min(42, pr.vel.length() + 40 * dt);
          const cur = pr.vel.clone().normalize();
          // curly anime missile paths: add a spiral component early on
          if (o.swirl && pr.age < 0.5) {
            const perp = new THREE.Vector3().crossVectors(cur, UP).normalize();
            cur.addScaledVector(perp, Math.sin(pr.age * 14 + o.seed) * 0.12);
          }
          cur.lerp(want, Math.min(1, dt * (2 + k * 9))).normalize();
          pr.vel.copy(cur).multiplyScalar(sp);
        }
      },
      render: (pr, dt) => {
        mesh.position.copy(pr.pos);
        _q.setFromUnitVectors(Y, _v.copy(pr.vel).normalize());
        mesh.quaternion.copy(_q);
        light.p.copy(pr.pos);
        const back = _v.copy(pr.vel).normalize().multiplyScalar(-0.3 * o.scale).add(pr.pos);
        // exhaust flame + glow
        G.fx.add.emit({ pos: back, shape: SHAPE.GLOW, size: 0.5 * o.scale, life: 1 / 50, color: [2.5, 1.3, 0.4], alpha: 0.9, alphaEnd: 0.9 });
        G.fx.add.emit({ pos: back, vel: pr.vel.clone().multiplyScalar(-0.15), shape: SHAPE.STREAK, size: 0.18 * o.scale, stretch: 0.06, anchor: 0, life: 1 / 50, color: [3, 2, 1], alpha: 1, alphaEnd: 1 });
        // smoke trail (dense, then expanding)
        trailT += dt;
        const n = Math.ceil(pr.vel.length() * dt / (0.18 * o.scale));
        for (let i = 0; i < n; i++) {
          const q = back.clone().addScaledVector(pr.vel, -dt * (i / n));
          G.fx.alpha.emit({ pos: q.add(_v2.set(rand(-0.03, 0.03), rand(-0.03, 0.03), rand(-0.03, 0.03))), vel: randUnit(_v2).multiplyScalar(0.4).add(_v.set(0, 0.25, 0)), shape: SHAPE.SMOKE, size: 0.24 * o.scale, sizeEnd: rand(0.65, 0.95) * o.scale, life: rand(0.9, 1.5) * (o.scale < 1 ? 0.7 : 1), color: [0.88, 0.86, 0.9], colorEnd: [0.7, 0.68, 0.74], alpha: 0.8, alphaEnd: 0, drag: 1.5 });
        }
        if (Math.random() < 0.5) G.fx.add.emit({ pos: back, vel: randUnit(_v2).multiplyScalar(2).addScaledVector(pr.vel, -0.1), shape: SHAPE.STREAK, size: 0.04, stretch: 0.03, life: rand(0.1, 0.25), color: [4, 2.5, 0.8], colorEnd: [2, 0.4, 0.05], alphaEnd: 0, gravity: 8 });
      },
      onHit: (pr, d, point) => self.explode(pr.pos.clone(), o.blast),
      onGround: (pr, point) => self.explode(point.clone().setY(0.3), o.blast),
      onExpire: (pr) => self.explode(pr.pos.clone(), o.blast),
      onDead: () => { mesh.parent?.remove(mesh); light.max = 0.001; light.life = 1; },
    });
  }

  explode(pos, s = 1) {
    FXP.explosion(pos, s);
    G.fx.distort({ pos, r0: 0.5, r1: 9 * s, strength: 0.05 * Math.sqrt(s), life: 0.5, width: 0.1 });
    G.fx.distort({ pos: pos.clone().setY(pos.y + 1), mode: 'haze', r0: 3 * s, r1: 4 * s, strength: 0.02, life: 1.4 });
    blastDamage(pos, 4.2 * s, 360 * s, 10 * s + 3, 9 * s + 2, { stop: 0.1 });
    if (s >= 1) { G.screen.flash([1, 0.85, 0.6], 0.12, 0.07); G.rig.fovPunch(3); }
    G.audio?.play('explosion', { pos, vol: Math.min(1, 0.5 + s * 0.5), pitch: s < 1 ? 1.3 : 1 });
  }

  restPose(P, p) {
    const aiming = this.aimT > 0 && !p.action;
    if (aiming) this.aimPose2H(P, p, this.recoil, 0.6, true);
    else {
      P.handR.set(-0.2, 1.22, 0.22);
      bladeQuat(P.wR, _v.set(0, 0.3, 1), UP);
      this.foreHand(P, 0.55);
    }
  }
}

// timer driven by game time (respects slow-mo / pause)
export function setTimeoutGame(sec, fn) {
  G.fx.spawn(new THREE.Object3D(), Math.max(0.0001, sec), null, G.scene, { onEnd: fn });
}
