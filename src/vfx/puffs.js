// Cel-shaded volumetric-looking puffs (fire balls, smoke, mist) – instanced
// lumpy spheres with hard dissolve edges and an inverted-hull outline.
import * as THREE from 'three';
import { puffVertex, puffFragment } from '../render/shaders/vfx.js';
import { toonGlobals } from '../render/shaders/toon.js';

export const PUFF = { SMOKE: 0, FIRE: 1, MIST: 2 };

export class PuffPool {
  constructor(max = 600) {
    this.max = max;
    this.count = 0;
    this.items = [];
    const base = new THREE.IcosahedronGeometry(1, 3);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const IA = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aA = IA(); this.aB = IA(); this.aC = IA(); this.aD = IA();
    geo.setAttribute('iA', this.aA); geo.setAttribute('iB', this.aB);
    geo.setAttribute('iC', this.aC); geo.setAttribute('iD', this.aD);
    geo.instanceCount = 0;
    this.geo = geo;
    const mk = (outline) => new THREE.ShaderMaterial({
      uniforms: {
        uLightDir: toonGlobals.uLightDir,
        uResolution: toonGlobals.uResolution,
        uWorldDim: toonGlobals.uWorldDim,
        uOutline: { value: outline },
        uOutlineColor: { value: new THREE.Color(0x1d1a2c) },
      },
      vertexShader: puffVertex,
      fragmentShader: puffFragment,
      side: outline > 0 ? THREE.BackSide : THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(geo, mk(0));
    this.outline = new THREE.Mesh(geo, mk(2.0));
    for (const m of [this.mesh, this.outline]) { m.frustumCulled = false; }
    this.outline.renderOrder = -1;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.outline);
  }

  /**
   * o: { pos, vel, size, sizeEnd, life, mode, color, shade, heat, drag, rise (up accel),
   *      dissolveStart (0..1 of life when it starts eroding), stretch }
   */
  emit(o) {
    if (this.items.length >= this.max) return null;
    const it = {
      p: o.pos.clone(), v: o.vel ? o.vel.clone() : new THREE.Vector3(),
      s0: o.size ?? 0.5, s1: o.sizeEnd ?? (o.size ?? 0.5) * 1.6,
      life: 0, max: o.life ?? 1.0, mode: o.mode ?? PUFF.SMOKE,
      color: o.color ?? [0.8, 0.8, 0.85], shade: o.shade ?? [0.45, 0.45, 0.55],
      heat: o.heat ?? 1.0, drag: o.drag ?? 2.0, rise: o.rise ?? 0.0,
      dis0: o.dissolveStart ?? 0.35, seed: Math.random(), stretch: o.stretch ?? 1,
      grow: o.grow ?? 'out', gravity: o.gravity ?? 0,
    };
    this.items.push(it);
    return it;
  }

  update(dt) {
    const A = this.aA.array, B = this.aB.array, C = this.aC.array, D = this.aD.array;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      if (it.life >= it.max) { this.items[i] = this.items[this.items.length - 1]; this.items.pop(); continue; }
    }
    for (const it of this.items) {
      const t = it.life / it.max;
      it.v.multiplyScalar(Math.exp(-it.drag * dt));
      it.v.y += (it.rise - it.gravity) * dt;
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.05) { it.p.y = 0.05; if (it.v.y < 0) it.v.y = 0; }
      const g = it.grow === 'out' ? 1 - Math.pow(1 - t, 3) : t;
      const s = it.s0 + (it.s1 - it.s0) * g;
      const dis = t < it.dis0 ? 0 : (t - it.dis0) / (1 - it.dis0);
      const i4 = n * 4;
      A[i4] = it.p.x; A[i4 + 1] = it.p.y; A[i4 + 2] = it.p.z; A[i4 + 3] = s;
      B[i4] = it.color[0]; B[i4 + 1] = it.color[1]; B[i4 + 2] = it.color[2]; B[i4 + 3] = it.mode;
      C[i4] = it.shade[0]; C[i4 + 1] = it.shade[1]; C[i4 + 2] = it.shade[2]; C[i4 + 3] = it.seed;
      D[i4] = t; D[i4 + 1] = dis * 1.15; D[i4 + 2] = it.heat * (1 - t * 0.9); D[i4 + 3] = it.stretch;
      n++;
    }
    this.geo.instanceCount = n;
    for (const a of [this.aA, this.aB, this.aC, this.aD]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true;
    }
  }

  clear() { this.items.length = 0; this.geo.instanceCount = 0; }
}
