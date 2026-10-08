// Gun framework: crosshair aim, over-the-shoulder camera, upper-body aim pose,
// recoil springs, bullet projectiles with tracers.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { bladeQuat, clamp01 } from '../entities/pose.js';
import { hit, segmentQuery } from '../combat/combat.js';
import { FXP, rand, cone } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class GunWeapon {
  constructor() {
    this.category = 'gun';
    this.aimPoint = new THREE.Vector3();
    this.aimT = 0;           // > 0 while recently shooting → face aim
    this.recoilR = 0; this.recoilL = 0;
    this.camDist = 4.4; this.camShoulder = 1.05;
    this.trails = [];
  }
  equip(p) {
    if (this.modelR) p.model.sockR.add(this.modelR);
    if (this.modelL) p.model.sockL.add(this.modelL);
  }
  unequip(p) {
    this.modelR?.parent?.remove(this.modelR);
    this.modelL?.parent?.remove(this.modelL);
    p.aimYawOverride = null;
  }
  cameraOpts() { return { dist: this.camDist, shoulder: this.camShoulder, fov: this.camFov }; }

  /** Where the crosshair points in the world. */
  computeAim() {
    const cam = G.rig.camera;
    const o = cam.position;
    const d = cam.getWorldDirection(_v);
    const far = _v2.copy(o).addScaledVector(d, 140);
    let best = far.clone();
    let bestT = 1;
    const res = segmentQuery(o, far, 0.1);
    if (res) { bestT = res.t; best = res.point.clone(); }
    if (d.y < -1e-3) {
      const t = -o.y / (d.y * 140);
      if (t > 0 && t < bestT) { bestT = t; best = o.clone().addScaledVector(d, t * 140); }
    }
    // don't aim behind the player
    this.aimPoint.copy(best);
    return this.aimPoint;
  }

  update(p, dt) {
    this.computeAim();
    this.aimT -= dt;
    this.recoilR *= Math.exp(-dt * 16);
    this.recoilL *= Math.exp(-dt * 16);
    if (this.aimT > 0 && !p.action?.ownsFacing) {
      _v.subVectors(this.aimPoint, p.pos);
      p.aimYawOverride = Math.atan2(_v.x, _v.z);
    } else p.aimYawOverride = null;
    this.tick?.(p, dt);
  }

  /** Arms aiming at aimPoint (root space pose). */
  aimPose(P, p, hands = 'R', k = 1) {
    const m = p.model;
    const inv = -p.yaw;
    const aimLocal = (sh, out) => {
      // world aim point → root space
      _v3.subVectors(this.aimPoint, p.pos).applyAxisAngle(UP, inv);
      return out.subVectors(_v3, sh).normalize();
    };
    const shR = _v.set(-0.24, 1.42, 0.02);
    const shL = new THREE.Vector3(0.24, 1.42, 0.02);
    P.twist = 0.0; P.lean = Math.max(P.lean, 0.05);
    if (hands.includes('R')) {
      const d = aimLocal(shR, new THREE.Vector3());
      const r = this.recoilR;
      const hand = shR.clone().addScaledVector(d, 0.52 - r * 0.12);
      hand.y += r * 0.06;
      P.handR.lerp(hand, k);
      const bd = d.clone(); bd.y += r * 0.9; bd.normalize();
      bladeQuat(_q, bd, UP);
      P.wR.slerp(_q, k);
    }
    if (hands.includes('L')) {
      const d = aimLocal(shL, new THREE.Vector3());
      const r = this.recoilL;
      const hand = shL.clone().addScaledVector(d, 0.52 - r * 0.12);
      hand.y += r * 0.06;
      P.handL.lerp(hand, k);
      const bd = d.clone(); bd.y += r * 0.9; bd.normalize();
      bladeQuat(_q, bd, UP);
      P.wL.slerp(_q, k);
    }
    P.headYaw = 0; P.headPitch = 0;
  }

  /** Two-handed aim: right hand on the grip, left hand on the fore grip. */
  aimPose2H(P, p, recoil = 0, kick = 0.3, shoulderMount = false) {
    _v3.subVectors(this.aimPoint, p.pos).applyAxisAngle(UP, -p.yaw);
    const anchor = shoulderMount ? new THREE.Vector3(-0.21, 1.3, 0.12) : new THREE.Vector3(-0.17, 1.28, 0.26);
    const d = _v3.sub(anchor).normalize();
    d.y += recoil * kick; d.normalize();
    const hand = anchor.clone().addScaledVector(d, 0.06 - recoil * 0.14);
    P.handR.copy(hand);
    bladeQuat(P.wR, d, UP);
    this.foreHand(P);
    P.twist = 0.3; P.lean = Math.max(P.lean, 0.06) - recoil * 0.12;
    P.headYaw = -0.25; P.headPitch = 0;
    P.elbowOut = 0.4;
  }
  /** Put the left hand on the weapon's fore grip. */
  foreHand(P) {
    const fg = this.modelR?.userData.foreGrip;
    if (!fg) return;
    P.handL.copy(fg).applyQuaternion(P.wR).add(P.handR);
  }

  /** World muzzle position of a gun model. */
  muzzle(model, out = new THREE.Vector3()) {
    model.updateWorldMatrix(true, false);
    return out.copy(model.userData.muzzle).applyMatrix4(model.matrixWorld);
  }
  ejectPort(model, out = new THREE.Vector3()) {
    model.updateWorldMatrix(true, false);
    return out.copy(model.userData.eject ?? model.userData.muzzle).applyMatrix4(model.matrixWorld);
  }
}

/**
 * Standard bullet with a tracer.
 * o: { from, dir, speed, dmg, kb, lift, color, width, len, stop, shake, kind, onHit, pierce, size }
 */
export function fireBullet(o) {
  const color = o.color ?? [4, 2.8, 1.2];
  const speed = o.speed ?? 180;
  const dir = o.dir.clone().normalize();
  G.projectiles.spawn({
    pos: o.from, vel: dir.clone().multiplyScalar(speed), life: o.life ?? 0.7, radius: o.radius ?? 0.06, pierce: o.pierce ?? 0,
    render: (pr) => {
      // tracer streak (one frame particle) + head glow
      G.fx.add.emit({ pos: pr.pos, vel: pr.vel, shape: SHAPE.STREAK, size: o.width ?? 0.09, stretch: Math.min(o.stretch ?? 0.012, pr.age + 0.002), anchor: 1, life: 1 / 40, color, alpha: 1, alphaEnd: 1 });
      if (o.headGlow !== false) G.fx.add.emit({ pos: pr.pos, shape: SHAPE.GLOW, size: o.glowSize ?? 0.3, life: 1 / 40, color: [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5], alpha: 1, alphaEnd: 1 });
      o.render?.(pr);
    },
    onHit: (pr, d, point) => {
      if (o.noHit) { FXP.hitBullet(point, pr.vel.clone().normalize(), o.hitColor, o.fxScale ?? 0.8); o.onHit?.(pr, d, point); return; }
      hit(d, {
        dir: pr.vel.clone().setY(0).normalize(), fxDir: pr.vel.clone().normalize(), point, kb: o.kb ?? 1.4, lift: d.airborne ? (o.airLift ?? 2.6) : (o.lift ?? 0),
        hitstop: o.stop ?? 0.03, atkStop: 0, shake: o.shake ?? 0.03, kick: o.kick ?? 0.15, kind: o.kind ?? 'bullet', color: o.hitColor,
        dmg: o.dmg === null ? undefined : Math.round((o.dmg ?? 30) * (0.85 + Math.random() * 0.3)), sound: o.sound ?? 'hitBullet', fxScale: o.fxScale ?? 1, crit: o.crit,
      });
      o.onHit?.(pr, d, point);
    },
    onGround: (pr, point) => { FXP.hitGround(point, pr.vel.clone().normalize(), o.groundScale ?? 1); o.onGround?.(pr, point); },
  });
}
