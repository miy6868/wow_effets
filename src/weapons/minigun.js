// 기관총 「폭풍」 — spin up, hold the storm, barrel heat, steam vent.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { GunWeapon, fireBullet } from './gun.js';
import { minigunModel } from './models.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { bladeQuat } from '../entities/pose.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Minigun extends GunWeapon {
  constructor() {
    super();
    this.id = 'minigun';
    this.name = '기관총 「폭풍」';
    this.short = '기관총';
    this.icon = '嵐';
    this.desc = '<b>좌클릭 (꾹)</b> 회전 → 난사 (총열 과열) · <b>우클릭 (꾹)</b> 예열 회전 · 놓으면 증기 배출';
    this.modelR = minigunModel();
    this.spin = 0;        // 0..1
    this.angle = 0;
    this.heat = 0;
    this.shotT = 0;
    this.recoil = 0;
    this.camDist = 4.8;
    this.hazeE = null;
    this.whirT = 0;
  }
  press() {}
  unequip(p) { super.unequip(p); p.moveMul = 1; if (this.hazeE) { this.hazeE.t = this.hazeE.life; this.hazeE = null; } this.spin = 0; this.heat = 0; }
  tick(p, dt) {
    const firing = G.input.isDown('Mouse0') && (!p.action || p.action.cancelable?.('shoot'));
    const spinning = firing || G.input.isDown('Mouse2');
    if (firing && p.action) p.endAction();
    this.spin += ((spinning ? 1 : 0) - this.spin) * (1 - Math.exp(-dt * (spinning ? 5 : 2.2)));
    this.angle += this.spin * dt * 50;
    this.modelR.userData.spin.rotation.y = this.angle;
    this.recoil *= Math.exp(-dt * 20);
    if (spinning) this.aimT = 0.6;
    // whirr sound
    this.whirT -= dt;
    if (this.spin > 0.05 && this.whirT <= 0) { this.whirT = 0.09; G.audio?.play('whirr', { pitch: 0.6 + this.spin * 0.9, vol: 0.25 + this.spin * 0.25 }); }
    // fire
    this.shotT -= dt;
    if (firing && this.spin > 0.82) {
      while (this.shotT <= 0) {
        this.shotT += 1 / 24;
        this.shoot(p);
      }
      this.heat = Math.min(1, this.heat + dt * 0.3);
    } else {
      this.shotT = Math.max(this.shotT, 0);
      // steam vent when releasing a hot barrel
      if (this.heat > 0.3 && !firing && this.wasFiring) this.vent(p);
      this.heat = Math.max(0, this.heat - dt * (firing ? 0 : 0.35));
    }
    this.wasFiring = firing && this.spin > 0.82;
    p.moveMul = spinning ? 0.45 : 1;
    // heat glow + haze at the barrels
    const h = this.modelR.userData.heat;
    h.material.uniforms.uEmissive.value = Math.pow(this.heat, 1.5) * 2.4;
    h.visible = this.heat > 0.02;
    if (this.heat > 0.35) {
      if (!this.hazeE || this.hazeE.t >= this.hazeE.life) this.hazeE = G.fx.distort({ pos: new THREE.Vector3(), mode: 'haze', r0: 0.5, r1: 0.5, strength: 0.022, life: 99, strengthCurve: () => this.heat });
      this.hazeE.obj.position.copy(this.muzzle(this.modelR, _v)).y += 0.25;
    } else if (this.hazeE) { this.hazeE.t = this.hazeE.life; this.hazeE = null; }
    // sparks off the spinning barrels during spin-up
    if (spinning && this.spin < 0.82 && Math.random() < 0.4) {
      const m = this.muzzle(this.modelR, new THREE.Vector3());
      G.fx.add.emit({ pos: m, vel: randUnit(_v2).multiplyScalar(3), shape: SHAPE.STREAK, size: 0.025, stretch: 0.03, life: 0.1, color: [4, 3, 1.5], alphaEnd: 0 });
    }
  }

  shoot(p) {
    const from = this.muzzle(this.modelR, new THREE.Vector3());
    // the muzzle point rotates around the barrel cluster
    const a = this.angle;
    const right = p.right(new THREE.Vector3());
    from.addScaledVector(right, Math.cos(a) * 0.06).addScaledVector(UP, Math.sin(a) * 0.06);
    const dir = _v.subVectors(this.aimPoint, from).normalize().clone();
    cone(dir, 0.03, dir);
    FXP.muzzleFlash(from, dir, rand(0.9, 1.25), [4, 2.8, 1.2]);
    fireBullet({ from, dir, speed: 200, dmg: 22, kb: 1.1, stop: 0.025, shake: 0.0, kick: 0.05, width: 0.08, stretch: 0.012, color: [4, 2.6, 1.0], airLift: 1.8, sound: 'hitBullet' });
    // casing stream (left side port)
    const port = this.ejectPort(this.modelR, new THREE.Vector3());
    _v2.copy(right).multiplyScalar(-rand(2, 3.5)).add(_v.set(rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5)));
    G.fx.debris.casing.emit({ pos: port, vel: _v2.clone(), scale: new THREE.Vector3(0.03, 0.045, 0.03), spin: rand(15, 30), life: 1.6, bounce: 0.4, onBounce: (it, v) => { if (v > 2 && Math.random() < 0.3) G.audio?.play('casing', { pos: it.p, vol: 0.25 }); } });
    this.recoil = 1;
    G.rig.shake(0.035);
    G.rig.kick(dir.clone().negate(), 0.06);
    G.audio?.play('gun', { pitch: rand(1.05, 1.2), vol: 0.5 });
  }

  vent(p) {
    const m = this.muzzle(this.modelR, new THREE.Vector3());
    const dir = _v.subVectors(this.aimPoint, m).normalize().clone();
    for (let i = 0; i < 10; i++) {
      const d = cone(UP.clone().addScaledVector(dir, 0.6), 0.5, new THREE.Vector3());
      G.fx.alpha.emit({ pos: m.clone().addScaledVector(dir, -0.4 + Math.random() * 0.4), vel: d.multiplyScalar(rand(1.5, 4)), shape: SHAPE.SMOKE, size: rand(0.12, 0.2), sizeEnd: rand(0.5, 0.75), life: rand(0.6, 1.0), color: [0.92, 0.93, 0.98], alpha: 0.6, alphaEnd: 0, drag: 3 });
    }
    G.audio?.play('steam', { pos: m });
  }

  restPose(P, p) {
    // held at the hip, pointing at the aim
    _v.subVectors(this.aimPoint, p.pos).applyAxisAngle(UP, -p.yaw);
    const anchor = new THREE.Vector3(-0.22, 1.0, 0.18);
    const d = _v.sub(anchor).normalize();
    if (!(this.aimT > 0)) d.set(0.1, -0.15, 1).normalize();
    const r = this.recoil;
    P.handR.copy(anchor).addScaledVector(d, -r * 0.03);
    P.handR.x += (Math.random() - 0.5) * 0.01 * r; P.handR.y += (Math.random() - 0.5) * 0.01 * r;
    bladeQuat(P.wR, d, UP);
    this.foreHand(P);
    P.lean = Math.max(P.lean, 0.1); P.twist = 0.2;
    P.hip.y -= 0.04;
  }
}
