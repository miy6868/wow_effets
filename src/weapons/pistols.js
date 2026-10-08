// 쌍권총 「쌍성」 — alternating rapid fire, gun-kata spin.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { GunWeapon, fireBullet } from './gun.js';
import { pistolModel } from './models.js';
import { FXP, rand, cone } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { bladeQuat, clamp01, easing } from '../entities/pose.js';
import { softTarget } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Pistols extends GunWeapon {
  constructor() {
    super();
    this.id = 'pistols';
    this.name = '쌍권총 「쌍성」';
    this.short = '쌍권총';
    this.icon = '雙';
    this.desc = '<b>좌클릭 (꾹)</b> 좌우 교대 연사 · <b>우클릭</b> 건카타 회전 난사';
    this.modelR = pistolModel(0xf2c35a);
    this.modelL = pistolModel(0x7fe8ff);
    this.cool = 0;
    this.side = 0;
    this.slideR = 0; this.slideL = 0;
  }

  press(p, btn) {
    if (btn === 1) {
      if (p.action && !p.action.cancelable?.('attack')) return;
      p.startAction(new GunKata(this));
    } else this.trigger = true;
  }
  release(p, btn) { if (btn === 0) this.trigger = false; }
  hold(p, btn) { if (btn === 0) this.trigger = true; }

  tick(p, dt) {
    this.cool -= dt;
    if (this.trigger && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot') || p.action.allowShoot)) {
      if (p.action && !p.action.allowShoot) p.endAction();
      this.cool = 0.082;
      this.shoot(p, this.side);
      this.side ^= 1;
    }
    if (!G.input.isDown('Mouse0')) this.trigger = false;
    // slide blowback anim
    this.slideR *= Math.exp(-dt * 30); this.slideL *= Math.exp(-dt * 30);
    this.modelR.userData.slide.position.y = 0.13 - this.slideR * 0.07;
    this.modelL.userData.slide.position.y = 0.13 - this.slideL * 0.07;
  }

  shoot(p, side, dirOverride = null, scale = 1) {
    const model = side === 0 ? this.modelR : this.modelL;
    const from = this.muzzle(model, new THREE.Vector3());
    let dir;
    if (dirOverride) dir = dirOverride.clone();
    else {
      dir = _v.subVectors(this.aimPoint, from).normalize().clone();
      // tiny spread
      cone(dir, 0.012, dir);
    }
    this.aimT = 0.7;
    if (side === 0) { this.recoilR = 1; this.slideR = 1; } else { this.recoilL = 1; this.slideL = 1; }
    FXP.muzzleFlash(from, dir, 0.85 * scale, side === 0 ? [4, 2.8, 1.2] : [2.4, 3.4, 4.2]);
    const right = p.right(new THREE.Vector3());
    FXP.casing(this.ejectPort(model, new THREE.Vector3()), side === 0 ? right : right.clone().negate(), p.forward(new THREE.Vector3()));
    fireBullet({ from, dir, speed: 190, dmg: 34 * scale, kb: 1.5, color: side === 0 ? [4, 2.8, 1.2] : [2, 3.5, 4.5], hitColor: side === 0 ? [1, 0.8, 0.4] : [0.5, 0.9, 1] });
    G.rig.shake(0.03);
    G.rig.kick(dir.clone().negate(), 0.12);
    G.audio?.play('gun', { pitch: side ? 1.08 : 1, vol: 0.7 });
  }

  restPose(P, p) {
    if (this.aimT > 0 && !p.action) {
      this.aimPose(P, p, 'RL', 1);
      return;
    }
    // guns low and ready
    P.handR.set(-0.3, 0.92, 0.22);
    P.handL.set(0.3, 0.92, 0.22);
    bladeQuat(P.wR, _v.set(-0.1, -0.5, 1), UP);
    bladeQuat(P.wL, _v.set(0.1, -0.5, 1), UP);
  }
}

// ── Gun-kata: spinning barrage ────────────────────────────────────────────────
class GunKata {
  constructor(w) {
    this.w = w;
    this.dur = 1.05;
    this.moveScale = 0.25;
    this.legs = true;
    this.fullBody = false;
    this.ownsFacing = true;
    this.shotT = 0;
    this.side = 0;
    this.turns = 2;
    this.n = 0;
  }
  start() {
    const p = this.player;
    this.yaw0 = p.yaw;
    if (p.grounded) { p.vel.y = 4.5; p.grounded = false; }
    p.gravityScale = 0.45;
    FXP.dust(p.pos, 0.8, 6);
    G.audio?.play('whooshBig', { pitch: 1.3 });
  }
  spin(t) { return easing.inOutQuad(clamp01((t - 0.05) / 0.8)) * Math.PI * 2 * this.turns; }
  update(dt) {
    const p = this.player;
    this.shotT -= dt;
    const sp = this.spin(this.t);
    if (this.t > 0.08 && this.t < 0.86 && this.shotT <= 0) {
      this.shotT = 0.034;
      // gun points sideways (arms out); direction in world
      const side = this.side; this.side ^= 1;
      const ang = this.yaw0 + sp + (side === 0 ? -Math.PI / 2 : Math.PI / 2);
      let dir = new THREE.Vector3(Math.sin(ang), -0.04, Math.cos(ang));
      // auto-target dummies near the barrel direction
      for (const d of G.dummies.list) {
        _v.subVectors(d.center(_v2), p.pos.clone().setY(p.pos.y + 1.3));
        const dist = _v.length();
        if (dist < 14) { _v.normalize(); if (_v.dot(dir) > 0.94) { dir = _v.clone(); break; } }
      }
      this.w.shoot(p, side, dir, 0.85);
      this.n++;
    }
    if (this.t > 0.88 && !this.fin) {
      this.fin = true;
      // final double shot at nearest target
      const tgt = softTarget(p.pos, p.forward(new THREE.Vector3()), 18, 360);
      const aim = tgt ? tgt.center(new THREE.Vector3()) : p.pos.clone().add(p.forward(new THREE.Vector3()).multiplyScalar(10)).setY(1.2);
      p.yaw = Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z);
      for (const side of [0, 1]) {
        const m = side === 0 ? this.w.modelR : this.w.modelL;
        const from = this.w.muzzle(m, new THREE.Vector3());
        const dir = aim.clone().sub(from).normalize();
        this.w.shoot(p, side, dir, 1.8);
      }
      G.rig.shake(0.18);
      G.screen.chroma(0.008, 0.15);
    }
  }
  pose(P, t) {
    const sp = this.spin(t);
    P.spin = sp;
    // arms extended to both sides
    P.handR.set(-0.78, 1.36, 0.08);
    P.handL.set(0.78, 1.36, 0.08);
    bladeQuat(P.wR, _v.set(-1, -0.04, 0.1), UP);
    bladeQuat(P.wL, _v.set(1, -0.04, 0.1), UP);
    if (t > 0.86) {
      const k = clamp01((t - 0.86) / 0.06);
      P.spin = sp;
      P.handR.lerp(_v.set(-0.2, 1.4, 0.55), k);
      P.handL.lerp(_v2.set(0.2, 1.4, 0.55), k);
      bladeQuat(P.wR, _v.set(0, 0, 1), UP);
      bladeQuat(P.wL, _v.set(0, 0, 1), UP);
    }
    P.footR.set(-0.14, 0.32, 0.1); P.footL.set(0.14, 0.22, -0.1); P.hip.y = 0.88;
    P.lean = 0.05;
  }
  poseWeight(t) { return t < this.dur - 0.12 ? 1 : 1 - (t - (this.dur - 0.12)) / 0.12; }
  cancelable(kind) { return this.t > 0.95; }
  end() { this.player.gravityScale = 1; }
}
