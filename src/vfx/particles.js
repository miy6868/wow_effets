// CPU-simulated, GPU-instanced particle pools.
import * as THREE from 'three';
import { particleVertex, particleFragment, SHAPE } from '../render/shaders/particles.js';

export { SHAPE };

const EASE_LINEAR = 0, EASE_OUT = 1, EASE_POP = 2, EASE_IN = 3;
export const CURVE = { LINEAR: EASE_LINEAR, OUT: EASE_OUT, POP: EASE_POP, IN: EASE_IN };

function curve(kind, t) {
  switch (kind) {
    case EASE_OUT: return 1 - (1 - t) * (1 - t) * (1 - t);
    case EASE_POP: return t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    case EASE_IN: return t * t;
    default: return t;
  }
}

export class ParticlePool {
  constructor(max, { additive = true, renderOrder = 10 } = {}) {
    this.max = max;
    this.count = 0;
    const F = (n) => new Float32Array(max * n);
    this.p = F(3); this.v = F(3);
    this.life = F(1); this.maxLife = F(1);
    this.s0 = F(2); this.s1 = F(2);
    this.c0 = F(4); this.c1 = F(4);
    this.rot = F(1); this.rotV = F(1);
    this.drag = F(1); this.grav = F(1);
    this.shape = F(1); this.stretch = F(1); this.anchor = F(1);
    this.seed = F(1); this.flags = F(1);
    this.sizeCurve = F(1); this.colorCurve = F(1); this.fadeIn = F(1);
    this.bounce = F(1); this.floorY = F(1);
    this.orbit = F(4); // cx, cz, angular speed, radial pull

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const IA = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = IA(3); this.aVel = IA(3); this.aColor = IA(4); this.aSize = IA(4); this.aMisc = IA(4);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iMisc', this.aMisc);
    geo.instanceCount = 0;
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uAlphaMode: { value: additive ? 0 : 1 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    if (additive) {
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendEquation = THREE.AddEquation;
    } else {
      mat.blending = THREE.NormalBlending;
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  /**
   * Emit one particle.
   * o: { pos, vel, life, size, sizeEnd, w (width ratio), color:[r,g,b], alpha, colorEnd, alphaEnd,
   *      shape, rot, rotVel, drag, gravity, stretch, anchor, sizeCurve, colorCurve, fadeIn,
   *      bounce, floorY, orbit:{cx,cz,spin,pull} }
   */
  emit(o) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    const p = o.pos, v = o.vel;
    this.p[i * 3] = p.x; this.p[i * 3 + 1] = p.y; this.p[i * 3 + 2] = p.z;
    if (v) { this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z; }
    else { this.v[i * 3] = 0; this.v[i * 3 + 1] = 0; this.v[i * 3 + 2] = 0; }
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 0.5;
    const s = o.size ?? 0.3;
    const se = o.sizeEnd ?? s;
    const w = o.w ?? 1;
    this.s0[i * 2] = s * w; this.s0[i * 2 + 1] = s;
    this.s1[i * 2] = se * w; this.s1[i * 2 + 1] = se;
    const c = o.color ?? [1, 1, 1];
    const ce = o.colorEnd ?? c;
    this.c0[i * 4] = c[0]; this.c0[i * 4 + 1] = c[1]; this.c0[i * 4 + 2] = c[2]; this.c0[i * 4 + 3] = o.alpha ?? 1;
    this.c1[i * 4] = ce[0]; this.c1[i * 4 + 1] = ce[1]; this.c1[i * 4 + 2] = ce[2]; this.c1[i * 4 + 3] = o.alphaEnd ?? 0;
    this.rot[i] = o.rot ?? Math.random() * 6.283;
    this.rotV[i] = o.rotVel ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.shape[i] = o.shape ?? SHAPE.GLOW;
    this.stretch[i] = o.stretch ?? 0;
    this.anchor[i] = o.anchor ?? 1;
    this.seed[i] = Math.random();
    this.sizeCurve[i] = o.sizeCurve ?? EASE_OUT;
    this.colorCurve[i] = o.colorCurve ?? EASE_LINEAR;
    this.fadeIn[i] = o.fadeIn ?? 0;
    this.bounce[i] = o.bounce ?? -1;
    this.floorY[i] = o.floorY ?? 0.02;
    const ob = o.orbit;
    if (ob) { this.orbit[i * 4] = ob.cx; this.orbit[i * 4 + 1] = ob.cz; this.orbit[i * 4 + 2] = ob.spin ?? 0; this.orbit[i * 4 + 3] = ob.pull ?? 0; }
    else { this.orbit[i * 4 + 2] = 0; this.orbit[i * 4 + 3] = 0; }
    return i;
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    const cp = (arr, n) => { for (let k = 0; k < n; k++) arr[i * n + k] = arr[j * n + k]; };
    cp(this.p, 3); cp(this.v, 3); cp(this.life, 1); cp(this.maxLife, 1); cp(this.s0, 2); cp(this.s1, 2);
    cp(this.c0, 4); cp(this.c1, 4); cp(this.rot, 1); cp(this.rotV, 1); cp(this.drag, 1); cp(this.grav, 1);
    cp(this.shape, 1); cp(this.stretch, 1); cp(this.anchor, 1); cp(this.seed, 1); cp(this.sizeCurve, 1);
    cp(this.colorCurve, 1); cp(this.fadeIn, 1); cp(this.bounce, 1); cp(this.floorY, 1); cp(this.orbit, 4);
  }

  update(dt) {
    const P = this.p, V = this.v;
    const aP = this.aPos.array, aV = this.aVel.array, aC = this.aColor.array, aS = this.aSize.array, aM = this.aMisc.array;
    for (let i = 0; i < this.count; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) { this._kill(i); i--; continue; }
      const i3 = i * 3;
      const dr = this.drag[i];
      if (dr > 0) {
        const k = Math.exp(-dr * dt);
        V[i3] *= k; V[i3 + 1] *= k; V[i3 + 2] *= k;
      }
      V[i3 + 1] -= this.grav[i] * dt;
      const spin = this.orbit[i * 4 + 2], pull = this.orbit[i * 4 + 3];
      if (spin !== 0 || pull !== 0) {
        const dx = P[i3] - this.orbit[i * 4], dz = P[i3 + 2] - this.orbit[i * 4 + 1];
        const r = Math.hypot(dx, dz) + 1e-4;
        // tangential + radial acceleration
        V[i3] += (-dz / r * spin - dx / r * pull) * dt;
        V[i3 + 2] += (dx / r * spin - dz / r * pull) * dt;
      }
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      const b = this.bounce[i];
      if (b >= 0 && P[i3 + 1] < this.floorY[i]) {
        P[i3 + 1] = this.floorY[i];
        if (V[i3 + 1] < 0) V[i3 + 1] *= -b;
        V[i3] *= 0.7; V[i3 + 2] *= 0.7;
      }
      this.rot[i] += this.rotV[i] * dt;
    }
    // write GPU buffers
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.maxLife[i];
      const i2 = i * 2, i3 = i * 3, i4 = i * 4;
      aP[i3] = P[i3]; aP[i3 + 1] = P[i3 + 1]; aP[i3 + 2] = P[i3 + 2];
      aV[i3] = V[i3]; aV[i3 + 1] = V[i3 + 1]; aV[i3 + 2] = V[i3 + 2];
      const ts = curve(this.sizeCurve[i], t);
      let sx, sy;
      if (this.sizeCurve[i] === EASE_POP) {
        sx = this.s1[i2] + (this.s0[i2] - this.s1[i2]) * ts;
        sy = this.s1[i2 + 1] + (this.s0[i2 + 1] - this.s1[i2 + 1]) * ts;
      } else {
        sx = this.s0[i2] + (this.s1[i2] - this.s0[i2]) * ts;
        sy = this.s0[i2 + 1] + (this.s1[i2 + 1] - this.s0[i2 + 1]) * ts;
      }
      aS[i4] = sx; aS[i4 + 1] = sy; aS[i4 + 2] = this.stretch[i]; aS[i4 + 3] = this.anchor[i];
      const tc = curve(this.colorCurve[i], t);
      const C0 = this.c0, C1 = this.c1;
      let al = C0[i4 + 3] + (C1[i4 + 3] - C0[i4 + 3]) * tc;
      const fi = this.fadeIn[i];
      if (fi > 0 && t < fi) al *= t / fi;
      aC[i4] = C0[i4] + (C1[i4] - C0[i4]) * tc;
      aC[i4 + 1] = C0[i4 + 1] + (C1[i4 + 1] - C0[i4 + 1]) * tc;
      aC[i4 + 2] = C0[i4 + 2] + (C1[i4 + 2] - C0[i4 + 2]) * tc;
      aC[i4 + 3] = al;
      aM[i4] = this.rot[i]; aM[i4 + 1] = this.shape[i]; aM[i4 + 2] = t; aM[i4 + 3] = this.seed[i];
    }
    this.geo.instanceCount = this.count;
    for (const a of [this.aPos, this.aVel, this.aColor, this.aSize, this.aMisc]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear() { this.count = 0; this.geo.instanceCount = 0; }
}
