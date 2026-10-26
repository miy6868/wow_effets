// Magic framework: aim like guns, cast poses, element orb + hand aura,
// lightning bolt geometry, timed helpers.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { GunWeapon } from './gun.js';
import { bladeQuat, clamp01, easing } from '../entities/pose.js';
import { toonMesh } from '../render/toon.js';
import { Ribbon, ribbonMaterial } from '../vfx/fx.js';
import { rand, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class MagicWeapon extends GunWeapon {
  constructor(color, emissiveHex) {
    super();
    this.category = 'magic';
    this.color = color;          // HDR element color [r,g,b]
    this.camDist = 5.2; this.camShoulder = 0.8;
    // floating element crystal that orbits the right hand
    this.orb = new THREE.Group();
    const crystal = toonMesh(new THREE.OctahedronGeometry(0.09, 0), { color: emissiveHex, emissive: 1.6, outlineWidth: 1.3, rim: 1 });
    crystal.scale.set(1, 1.6, 1);
    this.orb.add(crystal);
    this.crystal = crystal;
    this.auraT = 0;
    this.castK = 0;   // 0..1 cast arm extension
    this.castSide = 0;
  }
  equip(p) { G.scene.add(this.orb); }
  unequip(p) { this.orb.parent?.remove(this.orb); p.aimYawOverride = null; }

  update(p, dt) {
    super.update(p, dt);
    // orb follows the off-hand
    const hand = p.model.handL.getWorldPosition(_v);
    const t = G.time * 2.4;
    const target = hand.add(_v2.set(Math.cos(t) * 0.28, 0.32 + Math.sin(t * 1.3) * 0.06, Math.sin(t) * 0.28));
    this.orb.position.lerp(target, 1 - Math.exp(-dt * 14));
    this.crystal.rotation.y += dt * 3;
    // hand aura sparkles
    this.auraT -= dt;
    if (this.auraT <= 0) {
      this.auraT = 0.06;
      const c = this.color;
      G.fx.add.emit({ pos: this.orb.position.clone().add(randUnit(_v2).multiplyScalar(0.12)), vel: randUnit(_v2).multiplyScalar(0.3).add(_v.set(0, 0.4, 0)), shape: SHAPE.DIAMOND, size: rand(0.03, 0.06), sizeEnd: 0, life: rand(0.4, 0.7), color: [c[0] * 1.5, c[1] * 1.5, c[2] * 1.5], alphaEnd: 0 });
    }
    this.castK = Math.max(0, this.castK - dt * 3.5);
  }

  /** Palm-forward casting pose. side 0 = right hand, 1 = left / both */
  castPose(P, p, k, side = 0, both = false) {
    _v.subVectors(this.aimPoint, p.pos).applyAxisAngle(UP, -p.yaw);
    const shR = new THREE.Vector3(-0.24, 1.42, 0.02), shL = new THREE.Vector3(0.24, 1.42, 0.02);
    const dR = _v.clone().sub(shR).normalize(), dL = _v.clone().sub(shL).normalize();
    if (side === 0 || both) P.handR.lerp(shR.clone().addScaledVector(dR, 0.56), k);
    if (side === 1 || both) P.handL.lerp(shL.clone().addScaledVector(dL, 0.56), k);
    P.twist = (both ? 0 : side === 0 ? 0.35 : -0.35) * k;
    P.lean = Math.max(P.lean, 0.1 * k);
    P.elbowOut = 0.2;
  }

  restPose(P, p) {
    // relaxed ready stance: right hand open, left hand near the orb
    P.handL.set(0.32, 1.0, 0.25);
    if (this.castK > 0 && !p.action) this.castPose(P, p, easing.outCubic(Math.min(1, this.castK * 1.6)), this.castSide);
  }

  /** world position the palm reaches when fully extended toward the aim point */
  castPalm(p, side = 0, out = new THREE.Vector3()) {
    _v.subVectors(this.aimPoint, p.pos).applyAxisAngle(UP, -p.yaw);
    const sh = new THREE.Vector3(side === 0 ? -0.24 : 0.24, 1.42, 0.02);
    const d = _v.sub(sh).normalize();
    out.copy(sh).addScaledVector(d, 0.66);
    return p.toWorld(out, out);
  }

  /** world position of the casting palm */
  palm(p, side = 0, out = new THREE.Vector3()) {
    (side === 0 ? p.model.handR : p.model.handL).getWorldPosition(out);
    return out;
  }
}

// ── Lightning bolt ────────────────────────────────────────────────────────────
/** Jagged path from a to b (midpoint displacement). */
export function boltPath(a, b, jag = 0.18, depth = 5) {
  let pts = [a.clone(), b.clone()];
  const len = a.distanceTo(b);
  let amp = len * jag;
  const dir = _v.subVectors(b, a).normalize().clone();
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const m = pts[i].clone().lerp(pts[i + 1], 0.5 + rand(-0.1, 0.1));
      const off = randUnit(_v2);
      off.addScaledVector(dir, -off.dot(dir));
      m.addScaledVector(off, amp * rand(0.4, 1));
      next.push(m, pts[i + 1]);
    }
    pts = next;
    amp *= 0.52;
  }
  return pts;
}

/**
 * Animated lightning bolt with glow + core + branches. Re-randomizes its shape
 * every `flicker` seconds. o: a, b (Vector3 or fn), width, color, core, life, branches, jag
 */
export function lightning(o) {
  const fx = G.fx;
  const glowMat = ribbonMaterial({ color: o.color ?? [0.6, 0.9, 3], core: [0, 0, 0], coreWidth: 0.01, headFade: 0.02, tailFade: 0.02 });
  const coreMat = ribbonMaterial({ color: [0, 0, 0], core: o.core ?? [4, 4.5, 6], coreWidth: 0.9, headFade: 0.01, tailFade: 0.01 });
  const glow = new Ribbon(80, glowMat), core = new Ribbon(80, coreMat);
  const group = new THREE.Group();
  group.add(glow.mesh, core.mesh);
  glow.mesh.renderOrder = 17; core.mesh.renderOrder = 18;
  const branches = [];
  const nb = o.branches ?? 3;
  for (let i = 0; i < nb; i++) {
    const g2 = new Ribbon(24, glowMat), c2 = new Ribbon(24, coreMat);
    group.add(g2.mesh, c2.mesh);
    branches.push({ g: g2, c: c2 });
  }
  const life = o.life ?? 0.25, flick = o.flicker ?? 0.045, w = o.width ?? 0.45;
  let ft = 0;
  const get = (v) => (typeof v === 'function' ? v() : v);
  const rebuild = () => {
    const a = get(o.a), b = get(o.b);
    const pts = boltPath(a, b, o.jag ?? 0.16, o.depth ?? 5);
    const cam = fx.camera.position;
    glow.setFacing(pts, w, cam);
    core.setFacing(pts, w * 0.22, cam);
    for (const br of branches) {
      const i0 = Math.floor(rand(0.15, 0.7) * pts.length);
      const s = pts[i0];
      const dir = _v.subVectors(b, a).normalize().add(randUnit(_v2).multiplyScalar(1.1)).normalize();
      const e = s.clone().addScaledVector(dir, a.distanceTo(b) * rand(0.12, 0.3));
      const bp = boltPath(s, e, 0.22, 3);
      br.g.setFacing(bp, w * 0.5, cam);
      br.c.setFacing(bp, w * 0.12, cam);
    }
  };
  rebuild();
  return fx.spawn(group, life, (e, k, dt) => {
    ft += dt;
    if (ft > flick) { ft = 0; rebuild(); }
    const a = (1 - k) * (0.7 + Math.random() * 0.3);
    glowMat.uniforms.uAlpha.value = a;
    coreMat.uniforms.uAlpha.value = a;
  });
}

export function after(sec, fn) {
  G.fx.spawn(new THREE.Object3D(), Math.max(0.0001, sec), null, G.scene, { onEnd: fn });
}
