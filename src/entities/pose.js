// A character pose in root-local space (feet at origin, facing +Z, left = +X).
import * as THREE from 'three';

export class Pose {
  constructor() {
    this.hip = new THREE.Vector3(0, 0.94, 0);
    this.lean = 0;       // forward pitch (rad)
    this.roll = 0;       // sideways tilt
    this.twist = 0;      // torso yaw vs hips
    this.squash = 1;     // vertical scale of body (1 = rest)
    this.handR = new THREE.Vector3(-0.32, 0.8, 0.1);
    this.handL = new THREE.Vector3(0.32, 0.8, 0.1);
    this.wR = new THREE.Quaternion(); // weapon orientation (root space) – blade +Y, edge +Z
    this.wL = new THREE.Quaternion();
    this.footR = new THREE.Vector3(-0.13, 0, 0);
    this.footL = new THREE.Vector3(0.13, 0, 0);
    this.headYaw = 0;
    this.headPitch = 0;
    this.elbowOut = 0.0; // extra outward elbow pole bias
    this.flip = 0;       // whole-body pitch around the hips (flips)
    this.spin = 0;       // whole-body yaw around the hips (spins)
  }
  copy(p) {
    this.hip.copy(p.hip); this.lean = p.lean; this.roll = p.roll; this.twist = p.twist; this.squash = p.squash;
    this.handR.copy(p.handR); this.handL.copy(p.handL); this.wR.copy(p.wR); this.wL.copy(p.wL);
    this.footR.copy(p.footR); this.footL.copy(p.footL);
    this.headYaw = p.headYaw; this.headPitch = p.headPitch; this.elbowOut = p.elbowOut;
    this.flip = p.flip; this.spin = p.spin;
    return this;
  }
  lerp(p, t) {
    this.hip.lerp(p.hip, t);
    this.lean += (p.lean - this.lean) * t; this.roll += (p.roll - this.roll) * t;
    this.twist += (p.twist - this.twist) * t; this.squash += (p.squash - this.squash) * t;
    this.handR.lerp(p.handR, t); this.handL.lerp(p.handL, t);
    this.wR.slerp(p.wR, t); this.wL.slerp(p.wL, t);
    this.footR.lerp(p.footR, t); this.footL.lerp(p.footL, t);
    this.headYaw += (p.headYaw - this.headYaw) * t; this.headPitch += (p.headPitch - this.headPitch) * t;
    this.elbowOut += (p.elbowOut - this.elbowOut) * t;
    this.flip += (p.flip - this.flip) * t; this.spin += (p.spin - this.spin) * t;
    return this;
  }
  /** Only blend the upper body (arms/weapons/torso) */
  lerpUpper(p, t) {
    this.lean += (p.lean - this.lean) * t; this.roll += (p.roll - this.roll) * t;
    this.twist += (p.twist - this.twist) * t;
    this.handR.lerp(p.handR, t); this.handL.lerp(p.handL, t);
    this.wR.slerp(p.wR, t); this.wL.slerp(p.wL, t);
    this.headYaw += (p.headYaw - this.headYaw) * t; this.headPitch += (p.headPitch - this.headPitch) * t;
    this.elbowOut += (p.elbowOut - this.elbowOut) * t;
    return this;
  }
}

// ── weapon orientation helpers ───────────────────────────────────────────────
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

/** Orientation whose +Y = blade direction and +Z = edge (leading) direction. */
export function bladeQuat(out, bladeDir, edgeDir) {
  _y.copy(bladeDir).normalize();
  _z.copy(edgeDir);
  _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

export const easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
};

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const remap01 = (x, a, b) => clamp01((x - a) / (b - a));
