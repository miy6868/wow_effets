// Physical chunks: rocks, shell casings, ice shards… instanced toon meshes
// with simple rigid-ish physics (gravity, bounce, spin, settle, shrink out).
import * as THREE from 'three';
import { makeToonMaterial, makeOutlineMaterial, deriveOutline } from '../render/shaders/toon.js';
import { computeOutlineNormals } from '../render/toon.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class DebrisPool {
  constructor(geo, { color = 0xffffff, max = 200, emissive = 0, spec = 0, outline = true, outlineWidth = 1.6, rim = 0.5 } = {}) {
    computeOutlineNormals(geo);
    this.max = max;
    this.items = [];
    const mat = makeToonMaterial({ color, emissive, spec, rim });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    if (outline) {
      const om = makeOutlineMaterial({ color: deriveOutline(color), width: outlineWidth });
      this.outline = new THREE.InstancedMesh(geo, om, max);
      this.outline.instanceMatrix = this.mesh.instanceMatrix;
      this.outline.count = 0;
      this.outline.frustumCulled = false;
      this.outline.renderOrder = -1;
      this.group.add(this.outline);
    }
  }

  /** o: { pos, vel, scale (Vector3|number), spin (rad/s), life, bounce, friction, gravity, tint:[r,g,b], onBounce } */
  emit(o) {
    if (this.items.length >= this.max) this.items.shift();
    const sc = o.scale ?? 0.2;
    this.items.push({
      p: o.pos.clone(), v: o.vel ? o.vel.clone() : new THREE.Vector3(),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: o.spin ?? (5 + Math.random() * 10),
      s: typeof sc === 'number' ? new THREE.Vector3(sc, sc, sc) : sc.clone(),
      life: 0, max: o.life ?? 2.0, bounce: o.bounce ?? 0.35, friction: o.friction ?? 0.6,
      gravity: o.gravity ?? 22, tint: o.tint ?? [1, 1, 1], onBounce: o.onBounce, bounced: 0,
      radius: o.radius ?? (typeof sc === 'number' ? sc * 0.5 : sc.y * 0.5), grow: o.grow ?? 0,
    });
  }

  update(dt) {
    let n = 0;
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].life >= items[i].max) items.splice(i, 1);
    }
    for (const it of items) {
      it.life += dt;
      it.v.y -= it.gravity * dt;
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < it.radius) {
        it.p.y = it.radius;
        if (it.v.y < -1.0) {
          if (it.onBounce && it.bounced < 2) it.onBounce(it, -it.v.y);
          it.bounced++;
          it.v.y = -it.v.y * it.bounce;
          it.v.x *= it.friction; it.v.z *= it.friction;
          it.spin *= 0.6;
        } else {
          it.v.y = 0;
          it.v.x *= Math.exp(-dt * 8); it.v.z *= Math.exp(-dt * 8);
          it.spin *= Math.exp(-dt * 6);
        }
      }
      _q.setFromAxisAngle(it.axis, it.spin * dt);
      it.q.premultiply(_q);
      const t = it.life / it.max;
      let k = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      if (it.grow > 0 && it.life < it.grow) k *= it.life / it.grow;
      _s.copy(it.s).multiplyScalar(Math.max(k, 0.001));
      _m.compose(it.p, it.q, _s);
      this.mesh.setMatrixAt(n, _m);
      _c.setRGB(it.tint[0], it.tint[1], it.tint[2]);
      this.mesh.setColorAt(n, _c);
      n++;
    }
    this.mesh.count = n;
    if (this.outline) this.outline.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.mesh.count = 0; if (this.outline) this.outline.count = 0; }
}
