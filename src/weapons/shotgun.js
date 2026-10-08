// 샷건 「굉뢰」 — devastating close-range blasts, pump action, dragon's breath.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { GunWeapon, fireBullet } from './gun.js';
import { shotgunModel } from './models.js';
import { FXP, rand, cone, screenAngle } from '../vfx/presets.js';
import { SHAPE, CURVE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { bladeQuat, clamp01 } from '../entities/pose.js';
import { hit } from '../combat/combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Shotgun extends GunWeapon {
  constructor() {
    super();
    this.id = 'shotgun';
    this.name = '샷건 「굉뢰」';
    this.short = '샷건';
    this.icon = '轟';
    this.desc = '<b>좌클릭</b> 산탄 (가까울수록 강하게 날림) · <b>우클릭</b> 용의 숨결 (화염탄)';
    this.modelR = shotgunModel();
    this.cool = 0;
    this.pumpT = 1;
    this.recoil = 0;
    this.want = 0;
  }
  press(p, btn) { this.want = btn === 0 ? 1 : 2; this.wantT = 0.3; }
  tick(p, dt) {
    this.cool -= dt;
    this.wantT -= dt;
    this.pumpT += dt;
    this.recoil *= Math.exp(-dt * 9);
    if (this.want && this.wantT > 0 && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot'))) {
      if (p.action) p.endAction();
      if (this.want === 1) this.fire(p); else this.dragon(p);
      this.want = 0;
    }
    // pump animation
    const fore = this.modelR.userData.fore;
    const k = this.pumpT;
    const pump = k > 0.16 && k < 0.42 ? Math.sin(((k - 0.16) / 0.26) * Math.PI) : 0;
    fore.position.y = 0.52 - pump * 0.13;
    if (k > 0.24 && !this.ejected) {
      this.ejected = true;
      const right = p.right(new THREE.Vector3());
      G.fx.debris.casing.emit({ pos: this.ejectPort(this.modelR, new THREE.Vector3()), vel: right.multiplyScalar(rand(2.5, 3.5)).add(_v.set(0, rand(3, 4), 0)), scale: new THREE.Vector3(0.055, 0.075, 0.055), spin: 18, life: 2.5, bounce: 0.4, tint: [1.4, 0.35, 0.3], onBounce: (it, v) => { if (v > 2) G.audio?.play('casing', { pos: it.p, vol: 0.5, pitch: 0.6 }); } });
      G.audio?.play('pump');
    }
  }

  aimDir(from) { return _v.subVectors(this.aimPoint, from).normalize().clone(); }

  fire(p) {
    this.cool = 0.62; this.pumpT = 0; this.ejected = false;
    this.aimT = 0.9; this.recoil = 1;
    const from = this.muzzle(this.modelR, new THREE.Vector3());
    const dir = this.aimDir(from);
    blast(from, dir, 1.0, [4, 2.6, 1.0]);
    // pellets — knockback is aggregated per target
    const tally = new Map();
    for (let i = 0; i < 11; i++) {
      const d = cone(dir, 0.075, new THREE.Vector3());
      fireBullet({
        from, dir: d, speed: 150, life: 0.32, noHit: true, width: 0.06, stretch: 0.006, glowSize: 0.18,
        color: [4, 2.6, 1.1], onHit: (pr, dummy) => tally.set(dummy, (tally.get(dummy) ?? 0) + 1),
      });
    }
    // resolve after pellets travel
    G.fx.spawn(new THREE.Object3D(), 0.12, null, G.scene, {
      onEnd: () => {
        for (const [d, n] of tally) {
          const close = n >= 4;
          const dd = new THREE.Vector3().subVectors(d.pos, p.pos).setY(0).normalize();
          hit(d, { dir: dd, kb: 2 + n * 1.5, lift: n >= 7 ? 7 : n >= 4 ? 3 : 0, hitstop: close ? 0.09 : 0.04, shake: close ? 0.18 : 0.05, kind: close ? 'heavy' : 'none', color: [1, 0.6, 0.2], fxScale: 0.8, sound: close ? 'hitHeavy' : null, spin: 1.3, dmg: Math.round(n * 21 * (0.9 + Math.random() * 0.2)), crit: n >= 7 });
        }
      },
    });
    p.vel.addScaledVector(dir.clone().setY(0).normalize(), -5);
    G.rig.shake(0.24);
    G.rig.kick(dir.clone().negate(), 1.0);
    G.rig.fovPunch(2.5);
    G.screen.chroma(0.004, 0.12);
    G.audio?.play('shotgun');
  }

  dragon(p) {
    G.hud?.skill('용의 숨결', "DRAGON'S BREATH");
    this.cool = 1.0; this.pumpT = 0; this.ejected = false;
    this.aimT = 1.0; this.recoil = 1.2;
    const from = this.muzzle(this.modelR, new THREE.Vector3());
    const dir = this.aimDir(from);
    blast(from, dir, 1.2, [4, 1.8, 0.4]);
    // flame cone
    for (let i = 0; i < 26; i++) {
      const d = cone(dir, 0.22, new THREE.Vector3());
      G.fx.puffs.emit({ pos: from.clone().addScaledVector(d, 0.3), vel: d.multiplyScalar(rand(14, 24)), size: rand(0.12, 0.2), sizeEnd: rand(0.5, 0.8), life: rand(0.35, 0.55), mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: rand(1.0, 1.25), drag: 4.5, rise: 2.5, dissolveStart: 0.3 });
    }
    for (let i = 0; i < 9; i++) {
      const d = cone(dir, 0.12, new THREE.Vector3());
      fireBullet({
        from, dir: d, speed: 75, life: 0.45, dmg: 18, kb: 1.6, stop: 0.04, shake: 0.02, width: 0.1, stretch: 0.02, glowSize: 0.4,
        color: [4, 1.6, 0.3], kind: 'none', onHit: (pr, dummy, point) => { dummy.status.burn = 2.5; FXP.hitBullet(point, pr.vel.clone().normalize(), [1, 0.5, 0.1]); },
        onGround: (pr, point) => { G.fx.decal({ pos: point, size: 0.8, type: 0, color: [3, 1.0, 0.2], glow: 1.5, life: 3 }); for (let k = 0; k < 2; k++) G.fx.puffs.emit({ pos: point.clone().setY(0.2), vel: new THREE.Vector3(0, rand(2, 4), 0), size: 0.15, sizeEnd: 0.05, life: 0.5, mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: 1, rise: 2, dissolveStart: 0.3 }); },
      });
    }
    G.fx.distort({ pos: from.clone().addScaledVector(dir, 3), mode: 'haze', r0: 2, r1: 4, strength: 0.025, life: 0.8 });
    p.vel.addScaledVector(dir.clone().setY(0).normalize(), -6);
    G.rig.shake(0.28); G.rig.kick(dir.clone().negate(), 1.2); G.rig.fovPunch(3);
    G.audio?.play('shotgun', { pitch: 0.8 }); G.audio?.play('fireWhoosh');
  }

  restPose(P, p) {
    const aiming = this.aimT > 0 && !p.action;
    if (aiming) this.aimPose2H(P, p, this.recoil, 0.3);
    else {
      P.handR.set(-0.24, 1.0, 0.18);
      bladeQuat(P.wR, _v.set(0.25, 0.75, 1), UP);
      this.foreHand(P, 0.52);
    }
  }
}

/** Big muzzle blast shared by shotgun shots. */
export function blast(from, dir, s, color) {
  const fx = G.fx;
  FXP.muzzleFlash(from, dir, 2.0 * s, color);
  const ang = screenAngle(from, dir);
  // flame petals fanning forward
  for (let i = 0; i < 5; i++) {
    const d = cone(dir, 0.25, new THREE.Vector3());
    fx.add.emit({ pos: from.clone().addScaledVector(d, 0.35 * s), vel: d.clone().multiplyScalar(4), shape: SHAPE.FLAME, size: rand(0.5, 0.8) * s, w: 0.5, sizeEnd: rand(0.8, 1.1) * s, life: 0.07, color, alphaEnd: 0, rot: screenAngle(from, d) - Math.PI / 2, sizeCurve: CURVE.LINEAR });
  }
  fx.ring({ pos: from.clone().addScaledVector(dir, 0.5), normal: dir, r0: 0.1, r1: 0.85 * s, w0: 0.1, w1: 0.02, color: [color[0] * 0.25, color[1] * 0.25, color[2] * 0.25], life: 0.12, sharp: 1 });
  fx.distort({ pos: from.clone().addScaledVector(dir, 0.6), r0: 0.3, r1: 2.6 * s, strength: 0.03, life: 0.25 });
  // smoke cloud
  for (let i = 0; i < 6; i++) {
    const d = cone(dir, 0.4, new THREE.Vector3());
    fx.alpha.emit({ pos: from.clone().addScaledVector(d, rand(0.2, 0.8)), vel: d.multiplyScalar(rand(2, 5)).add(_v2.set(0, 0.6, 0)), shape: SHAPE.SMOKE, size: rand(0.3, 0.5) * s, sizeEnd: rand(1.0, 1.5) * s, life: rand(0.6, 1.0), color: [0.75, 0.72, 0.78], alpha: 0.65, alphaEnd: 0, drag: 3.5 });
  }
  for (let i = 0; i < 10; i++) {
    const d = cone(dir, 0.3, new THREE.Vector3());
    fx.add.emit({ pos: from, vel: d.multiplyScalar(rand(15, 30)), shape: SHAPE.STREAK, size: 0.05, stretch: 0.02, life: rand(0.08, 0.18), color: [5, 3.5, 1.5], colorEnd: [2.5, 0.6, 0.1], alphaEnd: 0, drag: 5, gravity: 6 });
  }
  fx.light(from, [1, 0.6, 0.3], 2.5 * s, 5, 0.08);
}
