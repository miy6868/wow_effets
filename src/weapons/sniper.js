// 저격총 「섬광」 — scoped, piercing, a single devastating shot.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { GunWeapon } from './gun.js';
import { sniperModel } from './models.js';
import { FXP, rand, cone, randUnit, screenAngle } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { bladeQuat } from '../entities/pose.js';
import { hit, segmentQuery } from '../combat/combat.js';
import { Ribbon, ribbonMaterial } from '../vfx/fx.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Sniper extends GunWeapon {
  constructor() {
    super();
    this.id = 'sniper';
    this.name = '저격총 「섬광」';
    this.short = '저격';
    this.icon = '狙';
    this.desc = '<b>우클릭 (꾹)</b> 조준경 · <b>좌클릭</b> 관통 저격 (일직선상의 모든 적)';
    this.modelR = sniperModel();
    this.cool = 0;
    this.recoil = 0;
    this.scope = 0;      // 0..1 blend
    this.scoping = false;
    this.boltT = 9;
    this.laserMat = ribbonMaterial({ color: [1.6, 0.3, 0.2], core: [2.5, 0.8, 0.6], coreWidth: 0.3, headFade: 0.05, tailFade: 0.05 });
    this.laser = new Ribbon(2, this.laserMat);
    this.laser.mesh.userData.disposeGeo = false;
  }
  equip(p) { super.equip(p); G.scene.add(this.laser.mesh); }
  unequip(p) { super.unequip(p); this.laser.mesh.parent?.remove(this.laser.mesh); this.setScope(false); }
  cameraOpts() {
    const s = this.scope;
    return { dist: 4.4 + (2.2 - 4.4) * s, shoulder: 1.05 + (0.62 - 1.05) * s, fov: 58 + (20 - 58) * s };
  }
  setScope(on) {
    this.scoping = on;
    document.body.classList.toggle('scoped', on);
    G.input.sensScale = on ? 0.4 : 1;
    if (G.player) G.player.moveMul = on ? 0.35 : 1;
  }
  press(p, btn) {
    if (btn === 1) { this.setScope(true); return; }
    if (this.cool > 0 || (p.action && !p.action.cancelable?.('shoot'))) return;
    if (p.action) p.endAction();
    this.fire(p);
  }
  release(p, btn) { if (btn === 1) this.setScope(false); }
  tick(p, dt) {
    this.cool -= dt;
    this.boltT += dt;
    this.recoil *= Math.exp(-dt * 7);
    if (this.scoping && !G.input.isDown('Mouse2')) this.setScope(false);
    this.scope += ((this.scoping ? 1 : 0) - this.scope) * (1 - Math.exp(-dt * 14));
    if (this.scoping) this.aimT = 0.5;
    // laser sight while aiming
    const show = this.aimT > 0 && this.cool < 0.3;
    this.laser.mesh.visible = show;
    if (show) {
      const m = this.muzzle(this.modelR, new THREE.Vector3());
      this.laser.setFacing([m, this.aimPoint.clone()], 0.025 + this.scope * 0.01, G.rig.camera.position);
      this.laserMat.uniforms.uAlpha.value = 0.55 + Math.sin(G.time * 30) * 0.1;
    }
    // bolt cycle animation
    const b = this.modelR.userData.bolt;
    const k = this.boltT;
    const pull = k > 0.25 && k < 0.65 ? Math.sin(((k - 0.25) / 0.4) * Math.PI) : 0;
    b.position.y = 0.1 - pull * 0.12;
    if (k > 0.4 && !this.ejected) {
      this.ejected = true;
      const right = p.right(new THREE.Vector3());
      G.fx.debris.casing.emit({ pos: this.ejectPort(this.modelR, new THREE.Vector3()), vel: right.multiplyScalar(rand(2.5, 3.5)).add(_v.set(0, rand(3, 4), 0)), scale: new THREE.Vector3(0.045, 0.08, 0.045), spin: 20, life: 2.5, bounce: 0.45, onBounce: (it, v) => { if (v > 2) G.audio?.play('casing', { pos: it.p, vol: 0.6, pitch: 0.8 }); } });
      G.audio?.play('pump', { pitch: 1.3 });
    }
  }

  fire(p) {
    this.cool = 1.0; this.boltT = 0; this.ejected = false;
    this.aimT = 1.2; this.recoil = 1;
    const from = this.muzzle(this.modelR, new THREE.Vector3());
    const dir = _v.subVectors(this.aimPoint, from).normalize().clone();
    const range = 140;
    // pierce through every dummy on the line
    const end = from.clone().addScaledVector(dir, range);
    const hits = [];
    const ex = new Set();
    let r = segmentQuery(from, end, 0.08, ex);
    while (r) { hits.push(r); ex.add(r.d); r = segmentQuery(from, end, 0.08, ex); }
    hits.sort((a, b) => a.t - b.t);
    // ground hit point
    let stop = end.clone();
    if (dir.y < -1e-3) {
      const t = -from.y / dir.y;
      if (t < range) stop = from.clone().addScaledVector(dir, t);
    }
    // muzzle: flash, side vents, shock ring, dust
    FXP.muzzleFlash(from, dir, 1.8, [3.4, 2.6, 1.4]);
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const d = side.clone().multiplyScalar(sgn).addScaledVector(dir, 0.3).normalize();
        G.fx.add.emit({ pos: from.clone().addScaledVector(dir, -0.05), vel: d.clone().multiplyScalar(rand(5, 9)), shape: SHAPE.FLAME, size: rand(0.35, 0.5), w: 0.5, sizeEnd: 0.6, life: 0.06, color: [3, 2, 0.9], alphaEnd: 0, rot: screenAngle(from, d) - Math.PI / 2 });
        G.fx.alpha.emit({ pos: from.clone(), vel: d.multiplyScalar(rand(2, 4)), shape: SHAPE.SMOKE, size: 0.2, sizeEnd: 0.7, life: rand(0.6, 0.9), color: [0.8, 0.78, 0.82], alpha: 0.55, alphaEnd: 0, drag: 3 });
      }
    }
    G.fx.ring({ pos: from.clone().addScaledVector(dir, 0.4), normal: dir, r0: 0.1, r1: 0.7, w0: 0.08, w1: 0.02, color: [0.35, 0.3, 0.25], life: 0.14, sharp: 1 });
    G.fx.distort({ pos: from.clone().addScaledVector(dir, 0.5), r0: 0.2, r1: 3.0, strength: 0.04, life: 0.3 });
    FXP.dust(p.pos, 0.7, 6);
    // the trail: hot core line that cools and fades, plus vapor rings and lingering smoke
    const trailEnd = hits.length ? (hits.length && stop.distanceTo(from) < hits[hits.length - 1].point.distanceTo(from) ? hits[hits.length - 1].point : stop) : stop;
    G.fx.line({ a: from, b: trailEnd, width: 0.13, color: [2.0, 1.2, 0.45], core: [3.4, 3.1, 2.5], coreWidth: 0.3, life: 0.4, headFade: 0.02, tailFade: 0.02, segments: 2 });
    G.fx.line({ a: from, b: trailEnd, width: 0.45, color: [0.45, 0.26, 0.1], core: [0, 0, 0], coreWidth: 0.01, life: 0.22, headFade: 0.02, tailFade: 0.02, segments: 2 });
    const L = from.distanceTo(trailEnd);
    for (let x = 2.0; x < Math.min(L, 40); x += 2.4) {
      const q = from.clone().addScaledVector(dir, x);
      G.fx.ring({ pos: q, normal: dir, r0: 0.05, r1: 0.32 + x * 0.004, w0: 0.1, w1: 0.03, color: [0.32, 0.29, 0.26], alpha: Math.max(0.2, 0.9 - x * 0.02), life: 0.5 + x * 0.004, sharp: 0.4, easing: (k) => 1 - Math.pow(1 - k, 2) });
      G.fx.alpha.emit({ pos: q, vel: randUnit(_v2).multiplyScalar(0.15).add(_v.set(0, 0.15, 0)), shape: SHAPE.SMOKE, size: 0.2, sizeEnd: 0.55, life: rand(0.8, 1.3), color: [0.88, 0.86, 0.9], alpha: 0.35, alphaEnd: 0, drag: 1 });
    }
    // impacts (pierce)
    hits.forEach((h, i) => {
      const d = h.d;
      hit(d, { dir: dir.clone().setY(0).normalize(), fxDir: dir, point: h.point, kb: 15, lift: 5, hitstop: 0.16, atkStop: 0, shake: 0.2, kick: 0.8, kind: 'pierce', color: [1, 0.8, 0.4], fxScale: 1.4, dmg: 680 + Math.round(Math.random() * 120), crit: true, sound: 'hitPierce', spin: 1.6 });
      // exit wound spray
      const exit = h.point.clone().addScaledVector(dir, d.radius * 1.6);
      for (let k = 0; k < 14; k++) {
        const v = cone(dir, 0.35, new THREE.Vector3()).multiplyScalar(rand(8, 22));
        G.fx.add.emit({ pos: exit, vel: v, shape: SHAPE.STREAK, size: 0.06, stretch: 0.03, life: rand(0.15, 0.3), color: [4, 3, 1.5], colorEnd: [2, 0.5, 0.1], alphaEnd: 0, drag: 4, gravity: 10 });
      }
      for (let k = 0; k < 5; k++) G.fx.alpha.emit({ pos: exit, vel: cone(dir, 0.6, new THREE.Vector3()).multiplyScalar(rand(2, 5)), shape: SHAPE.DOT, size: rand(0.07, 0.11), sizeEnd: 0.02, life: rand(0.4, 0.6), color: [0.95, 0.85, 0.6], colorEnd: [0.9, 0.8, 0.55], alpha: 1, alphaEnd: 1, gravity: 9, drag: 1.5 });
    });
    if (hits.length) {
      G.slowmo(0.22, 0.14, 0.3);
      G.screen.chroma(0.012, 0.3);
      G.rig.fovPunch(-3);
    } else {
      FXP.hitGround(stop.clone().setY(0.05), dir, 2);
      G.fx.decal({ pos: stop, size: 0.8, type: 0, color: [3, 1.5, 0.4], glow: 1, life: 4 });
    }
    G.rig.shake(0.3);
    G.rig.kick(dir.clone().negate(), 1.5);
    G.rig.pitch -= 0.04 * (1 - this.scope * 0.5);
    G.audio?.play('sniper');
  }

  restPose(P, p) {
    const aiming = this.aimT > 0 && !p.action;
    if (aiming) this.aimPose2H(P, p, this.recoil, 0.35);
    else {
      P.handR.set(-0.24, 0.98, 0.16);
      bladeQuat(P.wR, _v.set(0.2, 0.8, 1), UP);
      this.foreHand(P);
    }
  }
}
