// Central effect manager: owns particle pools, puffs, debris, dynamic lights,
// and short-lived mesh effects (slashes, rings, spheres, ribbons, decals...).
import * as THREE from 'three';
import { ParticlePool } from './particles.js';
import { PuffPool } from './puffs.js';
import { DebrisPool } from './debris.js';
import { toonGlobals, MAX_PLIGHTS } from '../render/shaders/toon.js';
import {
  basicVertex, slashVertex, slashFragment, ringFragment, fresnelFragment,
  ribbonVertex, ribbonFragment, decalFragment, ghostVertex, ghostFragment, distortVertex, distortFragment, beamFragment, diskFragment,
} from '../render/shaders/vfx.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();

function additive(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendEquation = THREE.AddEquation;
  return mat;
}
function premultiplied(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  return mat;
}
const col3 = (c) => (c instanceof THREE.Color ? c.clone() : Array.isArray(c) ? new THREE.Color(c[0], c[1], c[2]) : new THREE.Color(c));
export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
};

// ── shared geometries ─────────────────────────────────────────────────────────
const GEO = {};
function geo(name) {
  if (GEO[name]) return GEO[name];
  let g;
  switch (name) {
    case 'slash': g = new THREE.PlaneGeometry(1, 1, 64, 6); g.translate(0.5, 0.5, 0); break;
    case 'quadXZ': g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); break;
    case 'quad': g = new THREE.PlaneGeometry(2, 2); break;
    case 'sphere': g = new THREE.SphereGeometry(1, 32, 20); break;
    case 'cyl': g = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); g.translate(0, 0.5, 0); break;
  }
  GEO[name] = g;
  return g;
}

// ── light pool ────────────────────────────────────────────────────────────────
class LightPool {
  constructor() { this.items = []; }
  add(pos, color, intensity, radius, life, follow) {
    const c = col3(color);
    const it = { p: pos.clone(), c, i: intensity, r: radius, life: 0, max: life, follow };
    this.items.push(it);
    if (this.items.length > 24) this.items.shift();
    return it;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      if (it.max > 0 && it.life >= it.max) this.items.splice(i, 1);
      else if (it.follow) it.follow(it);
    }
    // pick the strongest MAX_PLIGHTS
    const scored = this.items.map((it) => {
      const k = it.max > 0 ? 1 - it.life / it.max : 1;
      return { it, k: k * k, s: it.i * k * k * it.r };
    }).sort((a, b) => b.s - a.s);
    for (let i = 0; i < MAX_PLIGHTS; i++) {
      const P = toonGlobals.uPLPos.value[i], C = toonGlobals.uPLCol.value[i];
      const e = scored[i];
      if (!e) { C.w = 0; continue; }
      P.set(e.it.p.x, e.it.p.y, e.it.p.z, e.it.r);
      C.set(e.it.c.r, e.it.c.g, e.it.c.b, e.it.i * e.k);
    }
  }
}

// ── ribbon (camera-facing or edge strip) ──────────────────────────────────────
export class Ribbon {
  constructor(maxPts, mat) {
    this.max = maxPts;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxPts * 2 * 3);
    this.uvs = new Float32Array(maxPts * 2 * 2);
    this.fade = new Float32Array(maxPts * 2).fill(1);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.disposeGeo = true;
  }
  /** Camera-facing strip through pts (Vector3[]), widths number|number[] */
  setFacing(pts, widths, camPos, fades) {
    const n = Math.min(pts.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      _v.subVectors(b, a);
      if (_v.lengthSq() < 1e-10) _v.set(0, 1, 0);
      _v.normalize();
      _v2.subVectors(camPos, p).normalize();
      _v3.crossVectors(_v, _v2);
      if (_v3.lengthSq() < 1e-10) _v3.set(1, 0, 0);
      _v3.normalize();
      const w = (Array.isArray(widths) ? widths[i] : widths) * 0.5;
      const o = i * 6;
      this.pos[o] = p.x - _v3.x * w; this.pos[o + 1] = p.y - _v3.y * w; this.pos[o + 2] = p.z - _v3.z * w;
      this.pos[o + 3] = p.x + _v3.x * w; this.pos[o + 4] = p.y + _v3.y * w; this.pos[o + 5] = p.z + _v3.z * w;
      const u = n > 1 ? i / (n - 1) : 0;
      this.uvs[i * 4] = u; this.uvs[i * 4 + 1] = 0; this.uvs[i * 4 + 2] = u; this.uvs[i * 4 + 3] = 1;
      const f = fades ? fades[i] : 1;
      this.fade[i * 2] = f; this.fade[i * 2 + 1] = f;
    }
    this._commit(n);
  }
  /** Strip between two edges (weapon trails). */
  setEdges(A, B, fades) {
    const n = Math.min(A.length, this.max);
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      this.pos[o] = A[i].x; this.pos[o + 1] = A[i].y; this.pos[o + 2] = A[i].z;
      this.pos[o + 3] = B[i].x; this.pos[o + 4] = B[i].y; this.pos[o + 5] = B[i].z;
      const u = n > 1 ? i / (n - 1) : 0;
      this.uvs[i * 4] = u; this.uvs[i * 4 + 1] = 0; this.uvs[i * 4 + 2] = u; this.uvs[i * 4 + 3] = 1;
      const f = fades ? fades[i] : 1;
      this.fade[i * 2] = f; this.fade[i * 2 + 1] = f;
    }
    this._commit(n);
  }
  _commit(n) {
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.attributes.aFade.needsUpdate = true;
  }
}

export function ribbonMaterial(o = {}) {
  return additive(new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: col3(o.color ?? [1, 0.6, 0.2]) },
      uCore: { value: col3(o.core ?? [4, 4, 4]) },
      uAlpha: { value: o.alpha ?? 1 },
      uCoreWidth: { value: o.coreWidth ?? 0.25 },
      uHeadFade: { value: o.headFade ?? 0.02 },
      uTailFade: { value: o.tailFade ?? 0.3 },
      uNoise: { value: o.noise ?? 0 },
      uTime: toonGlobals.uTime,
      uMode: { value: o.mode ?? 0 },
    },
    vertexShader: ribbonVertex,
    fragmentShader: ribbonFragment,
    side: THREE.DoubleSide,
  }));
}

// ── weapon trail ──────────────────────────────────────────────────────────────
function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out;
}

export class WeaponTrail {
  constructor(fx, o = {}) {
    this.fx = fx;
    this.maxAge = o.maxAge ?? 0.12;
    this.samples = [];
    this.emitting = false;
    this.mat = ribbonMaterial({ color: o.color ?? [0.4, 0.8, 2.0], core: o.core ?? [3, 3.5, 4], coreWidth: o.coreWidth ?? 0.22, headFade: 0.0, tailFade: 0.9, mode: 1, noise: o.noise ?? 0.1, alpha: o.alpha ?? 1 });
    this.ribbon = new Ribbon(256, this.mat);
    this.ribbon.mesh.renderOrder = 12;
    fx.scene.add(this.ribbon.mesh);
    this.A = []; this.B = []; this.F = [];
    for (let i = 0; i < 256; i++) { this.A.push(new THREE.Vector3()); this.B.push(new THREE.Vector3()); }
  }
  push(base, tip, time) {
    if (!this.emitting) return;
    const last = this.samples[this.samples.length - 1];
    if (last && last.t === time) { last.a.copy(base); last.b.copy(tip); return; }
    this.samples.push({ a: base.clone(), b: tip.clone(), t: time });
    if (this.samples.length > 80) this.samples.shift();
  }
  update(time) {
    while (this.samples.length && time - this.samples[0].t > this.maxAge) this.samples.shift();
    const s = this.samples;
    if (s.length < 2) { this.ribbon.geo.setDrawRange(0, 0); return; }
    let n = 0;
    const SUB = 4;
    this.F.length = 0;
    for (let i = 0; i < s.length - 1 && n < 250; i++) {
      const p0 = s[Math.max(0, i - 1)], p1 = s[i], p2 = s[i + 1], p3 = s[Math.min(s.length - 1, i + 2)];
      for (let k = 0; k < SUB && n < 250; k++) {
        const t = k / SUB;
        catmull(p0.a, p1.a, p2.a, p3.a, t, this.A[n]);
        catmull(p0.b, p1.b, p2.b, p3.b, t, this.B[n]);
        const age = time - (p1.t + (p2.t - p1.t) * t);
        this.F[n] = Math.max(0, 1 - age / this.maxAge);
        n++;
      }
    }
    const L = s[s.length - 1];
    this.A[n].copy(L.a); this.B[n].copy(L.b); this.F[n] = 1; n++;
    this.ribbon.setEdges(this.A.slice(0, n), this.B.slice(0, n), this.F);
  }
  clear() { this.samples.length = 0; this.ribbon.geo.setDrawRange(0, 0); }
}

// ── FX manager ────────────────────────────────────────────────────────────────
export class FX {
  constructor(scene, pipeline, camera) {
    this.scene = scene;
    this.pipeline = pipeline;
    this.camera = camera;
    this.add = new ParticlePool(9000, { additive: true, renderOrder: 20 });
    this.alpha = new ParticlePool(3000, { additive: false, renderOrder: 15 });
    this.puffs = new PuffPool(700);
    this.lights = new LightPool();
    this.effects = [];
    this.time = 0;
    scene.add(this.alpha.mesh, this.add.mesh, this.puffs.group);

    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const casingGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.6, 8);
    const shardGeo = new THREE.OctahedronGeometry(1, 0); shardGeo.scale(0.5, 1.4, 0.5);
    const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
    this.debris = {
      rock: new DebrisPool(rockGeo, { color: 0x8d90a6, max: 260, outlineWidth: 1.8 }),
      casing: new DebrisPool(casingGeo, { color: 0xf0c060, max: 200, spec: 1, outline: true, outlineWidth: 1.0, rim: 0.8 }),
      shard: new DebrisPool(shardGeo, { color: 0xbdf3ff, max: 260, emissive: 0.35, spec: 1, outlineWidth: 1.4, rim: 1 }),
      chunk: new DebrisPool(chunkGeo, { color: 0xd8b07a, max: 160, outlineWidth: 1.6 }),
    };
    for (const k in this.debris) scene.add(this.debris[k].group);
  }

  update(dt) {
    this.time += dt;
    this.add.update(dt);
    this.alpha.update(dt);
    this.puffs.update(dt);
    for (const k in this.debris) this.debris[k].update(dt);
    this.lights.update(dt);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt * (e.speed ?? 1);
      const k = Math.min(1, e.t / e.life);
      if (e.update) e.update(e, k, dt);
      if (e.t >= e.life) {
        e.obj.parent?.remove(e.obj);
        // NOTE: materials are intentionally NOT disposed. three.js destroys a shader program when
        // its last material is disposed, which would force a recompile (a visible hitch) the next
        // time that effect spawns. Dropped materials are garbage collected.
        if (e.dispose !== false) e.obj.traverse((o) => { if (o.userData.disposeGeo) o.geometry.dispose(); });
        if (e.onEnd) e.onEnd(e);
        this.effects.splice(i, 1);
      }
    }
  }

  spawn(obj, life, update, parent = this.scene, extra = {}) {
    parent.add(obj);
    const e = { obj, t: 0, life, update, ...extra };
    this.effects.push(e);
    if (update) update(e, 0, 0);
    return e;
  }

  light(pos, color, intensity, radius, life, follow) { return this.lights.add(pos, color, intensity, radius, life, follow); }

  // ── primitives ──────────────────────────────────────────────────────────────

  /**
   * Crescent slash arc.
   * o: pos, quat (arc plane: local XZ, angle measured from +Z toward +X), a0, a1,
   *    rIn, rOut, color, core, width, sweep (s), hold, fade, tail, streak, alpha, expand
   */
  slash(o) {
    const mat = additive(new THREE.ShaderMaterial({
      uniforms: {
        uA0: { value: o.a0 }, uA1: { value: o.a1 },
        uRin: { value: o.rIn ?? 0.6 }, uRout: { value: o.rOut ?? 2.2 }, uCone: { value: o.cone ?? ((o.rOut ?? 2.2) - (o.rIn ?? 0.6)) * 0.45 },
        uHead: { value: 0 }, uTail: { value: o.tail ?? 1.2 }, uFade: { value: 0 },
        uSeed: { value: Math.random() * 10 }, uWidth: { value: o.width ?? 0.8 },
        uColor: { value: col3(o.color ?? [0.5, 1.2, 3.0]) },
        uCore: { value: col3(o.core ?? [4, 4.5, 5]) },
        uAlpha: { value: o.alpha ?? 1 }, uStreak: { value: o.streak ?? 0.7 },
      },
      vertexShader: slashVertex, fragmentShader: slashFragment, side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(geo('slash'), mat);
    m.frustumCulled = false;
    m.renderOrder = o.renderOrder ?? 14;
    m.position.copy(o.pos);
    m.quaternion.copy(o.quat);
    const sweep = o.sweep ?? 0.08, hold = o.hold ?? 0.04, fade = o.fade ?? 0.22;
    const rIn = o.rIn ?? 0.6, rOut = o.rOut ?? 2.2, expand = o.expand ?? 0.12;
    const life = sweep + hold + fade;
    const u = mat.uniforms;
    return this.spawn(m, life, (e, k, dt) => {
      const t = e.t;
      u.uHead.value = t < sweep ? ease.outCubic(t / sweep) * 1.02 : 1.02 + (t - sweep) * 0.6;
      u.uFade.value = t < sweep + hold ? 0 : (t - sweep - hold) / fade;
      const g = 1 + expand * ease.outCubic(Math.min(1, t / life));
      u.uRin.value = rIn * g; u.uRout.value = rOut * g;
      if (o.drift && dt) m.position.addScaledVector(o.drift, dt);
    }, o.parent);
  }

  /** Flat/billboard expanding ring. o: pos, normal|quat|billboard, r0, r1, w0, w1, color, alpha, life, fill, noise, sharp, easing */
  ring(o) {
    const mat = additive(new THREE.ShaderMaterial({
      uniforms: {
        uR: { value: 0.8 }, uW: { value: o.w0 ?? 0.08 }, uFill: { value: o.fill ?? 0 },
        uColor: { value: col3(o.color ?? [2, 2, 2]) }, uAlpha: { value: o.alpha ?? 1 },
        uNoise: { value: o.noise ?? 0.0 }, uSeed: { value: Math.random() * 10 }, uSharp: { value: o.sharp ?? 0 },
      },
      vertexShader: basicVertex, fragmentShader: ringFragment, side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(geo('quad'), mat);
    m.renderOrder = o.renderOrder ?? 13;
    m.frustumCulled = false;
    m.position.copy(o.pos);
    if (o.quat) m.quaternion.copy(o.quat);
    else if (o.normal) m.quaternion.setFromUnitVectors(_v.set(0, 0, 1), o.normal);
    const r0 = o.r0 ?? 0.2, r1 = o.r1 ?? 3, w0 = o.w0 ?? 0.1, w1 = o.w1 ?? 0.02;
    const life = o.life ?? 0.35, a0 = o.alpha ?? 1;
    const ez = o.easing ?? ease.outExpo;
    const u = mat.uniforms;
    return this.spawn(m, life, (e, k) => {
      const r = (r0 + (r1 - r0) * ez(k)) / 0.8;
      m.scale.set(r, r, r);
      u.uW.value = w0 + (w1 - w0) * k;
      u.uAlpha.value = a0 * (1 - ease.inQuad(k));
      if (o.billboard) m.quaternion.copy(this.camera.quaternion);
    }, o.parent);
  }

  /** Fresnel sphere. o: pos, r0, r1, color, coreColor, alpha, life, power, core, noise, dissolve, follow */
  sphere(o) {
    const mat = additive(new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col3(o.color ?? [2, 1.2, 0.4]) },
        uCoreColor: { value: col3(o.coreColor ?? o.color ?? [3, 3, 3]) },
        uAlpha: { value: o.alpha ?? 1 }, uPower: { value: o.power ?? 2.0 }, uCore: { value: o.core ?? 0.3 },
        uNoise: { value: o.noise ?? 0 }, uTime: { value: 0 }, uDissolve: { value: 0 },
      },
      vertexShader: basicVertex, fragmentShader: fresnelFragment,
      side: o.side ?? THREE.FrontSide,
    }));
    const m = new THREE.Mesh(geo('sphere'), mat);
    m.renderOrder = o.renderOrder ?? 13;
    m.position.copy(o.pos);
    const r0 = o.r0 ?? 0.2, r1 = o.r1 ?? 2, life = o.life ?? 0.3, a0 = o.alpha ?? 1;
    const ez = o.easing ?? ease.outExpo;
    const u = mat.uniforms;
    if (o.scale) m.scale.copy(o.scale);
    const sy = o.squashY ?? 1;
    return this.spawn(m, life, (e, k) => {
      const r = r0 + (r1 - r0) * ez(k);
      m.scale.set(r, r * sy, r);
      u.uTime.value = e.t;
      u.uAlpha.value = a0 * (o.alphaCurve ? o.alphaCurve(k) : 1 - k * k);
      if (o.dissolve) u.uDissolve.value = Math.max(0, (k - o.dissolve) / (1 - o.dissolve));
      if (o.follow) o.follow(m, k);
    }, o.parent);
  }

  /** Straight glowing line a→b. o: a, b, width, color, core, alpha, life, coreWidth, shrink */
  line(o) {
    const mat = ribbonMaterial({ color: o.color, core: o.core, coreWidth: o.coreWidth ?? 0.3, headFade: o.headFade ?? 0.1, tailFade: o.tailFade ?? 0.1, noise: o.noise ?? 0 });
    const r = new Ribbon(o.segments ?? 2, mat);
    r.mesh.renderOrder = o.renderOrder ?? 16;
    const a = o.a.clone(), b = o.b.clone();
    const pts = [];
    const segs = o.segments ?? 2;
    for (let i = 0; i < segs; i++) pts.push(new THREE.Vector3().lerpVectors(a, b, i / (segs - 1)));
    const w0 = o.width ?? 0.1, life = o.life ?? 0.2, a0 = o.alpha ?? 1;
    return this.spawn(r.mesh, life, (e, k) => {
      const w = w0 * (o.shrink === false ? 1 : 1 - ease.inQuad(k) * 0.9) * (o.grow ? 1 + o.grow * ease.outCubic(k) : 1);
      mat.uniforms.uAlpha.value = a0 * (1 - ease.inQuad(k));
      if (o.travel) {
        // a moving segment: head/tail travel from a to b
        const h = Math.min(1, k * o.travel), tl = Math.max(0, h - (o.segLen ?? 0.3));
        for (let i = 0; i < segs; i++) pts[i].lerpVectors(a, b, tl + (h - tl) * (i / (segs - 1)));
      }
      r.setFacing(pts, w, this.camera.position);
    });
  }

  /** Ground decal. o: pos, size, type (0 scorch,1 crack,2 frost,3 magic,4 glow), color, dark, alpha, glow, life, rot, spin, reveal (s), fadeStart */
  decal(o) {
    const mat = premultiplied(new THREE.ShaderMaterial({
      uniforms: {
        uType: { value: o.type ?? 0 }, uColor: { value: col3(o.color ?? [3, 1.2, 0.3]) },
        uDark: { value: col3(o.dark ?? [0.05, 0.04, 0.06]) }, uAlpha: { value: o.alpha ?? 1 },
        uGlow: { value: o.glow ?? 1 }, uSeed: { value: Math.random() * 10 }, uTime: { value: 0 },
        uSpin: { value: o.spin ?? 0 }, uReveal: { value: o.reveal ? 0 : 1 },
      },
      vertexShader: basicVertex, fragmentShader: decalFragment, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    if (o.additive) additive(mat);
    const m = new THREE.Mesh(geo('quadXZ'), mat);
    m.renderOrder = o.renderOrder ?? 2;
    m.position.copy(o.pos); m.position.y = o.y ?? 0.015;
    m.rotation.y = o.rot ?? Math.random() * 6.28;
    const s = o.size ?? 2;
    m.scale.set(s, 1, s);
    const life = o.life ?? 4, a0 = o.alpha ?? 1, g0 = o.glow ?? 1;
    const fs = o.fadeStart ?? 0.6;
    const u = mat.uniforms;
    return this.spawn(m, life, (e, k) => {
      u.uTime.value = e.t;
      if (o.reveal) u.uReveal.value = Math.min(1, ease.outCubic(e.t / o.reveal));
      u.uAlpha.value = a0 * (k < fs ? 1 : 1 - (k - fs) / (1 - fs));
      u.uGlow.value = g0 * Math.pow(1 - k, o.glowPow ?? 3);
      if (o.grow) { const gs = s * (1 + o.grow * ease.outCubic(k)); m.scale.set(gs, 1, gs); }
      if (o.update) o.update(e, k, m);
    });
  }

  /**
   * Screen distortion. o: pos, mode ('ring'|'haze'|'lens'), r0, r1 (world radius of the quad),
   * strength, life, billboard (default true), normal, width (ring width 0..1), follow(m, k)
   */
  distort(o) {
    const mode = o.mode === 'haze' ? 1 : o.mode === 'lens' ? 2 : 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMode: { value: mode }, uStrength: { value: o.strength ?? 0.02 }, uR: { value: 0.6 }, uW: { value: o.width ?? 0.12 }, uTime: { value: 0 } },
      vertexShader: distortVertex, fragmentShader: distortFragment,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const m = new THREE.Mesh(geo('quad'), mat);
    m.frustumCulled = false;
    m.position.copy(o.pos);
    if (o.normal) m.quaternion.setFromUnitVectors(_v.set(0, 0, 1), o.normal);
    const r0 = o.r0 ?? 0.5, r1 = o.r1 ?? 4, life = o.life ?? 0.4, s0 = o.strength ?? 0.02;
    const u = mat.uniforms;
    return this.spawn(m, life, (e, k) => {
      const r = mode === 0 ? (r0 + (r1 - r0) * ease.outCubic(k)) / 0.6 : r0 + (r1 - r0) * k;
      m.scale.set(r, r, r);
      u.uTime.value = e.t;
      u.uStrength.value = s0 * (mode === 0 ? (1 - k) : o.strengthCurve ? o.strengthCurve(k) : Math.sin(Math.PI * Math.min(1, k * 1.2)));
      if (o.billboard !== false && !o.normal) m.quaternion.copy(this.camera.quaternion);
      if (o.follow) o.follow(m, k);
    }, this.pipeline.distortScene);
  }

  /** Persistent beam material + mesh (caller animates). Returns {mesh, u}. */
  beamMesh(o = {}) {
    const mat = additive(new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col3(o.color ?? [2, 1.4, 0.4]) }, uCore: { value: col3(o.core ?? [4, 4, 3.5]) },
        uAlpha: { value: o.alpha ?? 1 }, uTime: { value: 0 }, uScroll: { value: o.scroll ?? 30 },
        uNoise: { value: o.noise ?? 0.7 }, uLen: { value: 10 }, uPower: { value: o.power ?? 1.5 },
      },
      vertexShader: basicVertex, fragmentShader: beamFragment, side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(geo('cyl'), mat);
    m.frustumCulled = false;
    m.renderOrder = o.renderOrder ?? 16;
    return { mesh: m, u: mat.uniforms };
  }

  /** Swirling disk (accretion ring). Returns {mesh, u}. */
  diskMesh(o = {}) {
    const mat = additive(new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col3(o.color ?? [1.2, 0.3, 2.2]) }, uHot: { value: col3(o.hot ?? [3, 2, 4]) },
        uAlpha: { value: o.alpha ?? 1 }, uTime: { value: 0 }, uIn: { value: o.inner ?? 0.3 }, uOut: { value: o.outer ?? 1.0 },
      },
      vertexShader: basicVertex, fragmentShader: diskFragment, side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(geo('quad'), mat);
    m.frustumCulled = false;
    m.renderOrder = o.renderOrder ?? 14;
    return { mesh: m, u: mat.uniforms };
  }

  /** Afterimage of a character model. */
  ghost(root, o = {}) {
    root.updateMatrixWorld(true);
    const mat = additive(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(o.color ?? [0.3, 0.6, 1.5]) }, uRim: { value: col3(o.rim ?? [0.6, 1.4, 3]) }, uAlpha: { value: o.alpha ?? 0.8 } },
      vertexShader: ghostVertex, fragmentShader: ghostFragment,
    }));
    const g = new THREE.Group();
    root.traverse((c) => {
      if (!c.isMesh || c.name === 'outline' || !c.visible) return;
      if (c.material?.userData?.isOutline) return;
      let vis = true; let p = c;
      while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      const m = new THREE.Mesh(c.geometry, mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(c.matrixWorld);
      m.renderOrder = 11;
      g.add(m);
    });
    g.matrixAutoUpdate = false;
    const life = o.life ?? 0.35, a0 = o.alpha ?? 0.8;
    return this.spawn(g, life, (e, k) => {
      mat.uniforms.uAlpha.value = a0 * (1 - k) * (1 - k);
    }, this.scene, { dispose: false });
  }

  /** Compile every effect shader up front (spawned invisibly for one frame). */
  prewarm(root) {
    const p = new THREE.Vector3(0, -30, 0);
    const q = new THREE.Quaternion();
    this.slash({ pos: p, quat: q, a0: 0, a1: 1, alpha: 0, sweep: 0.01, hold: 0.01, fade: 0.01 });
    this.ring({ pos: p, alpha: 0, life: 0.02 });
    this.sphere({ pos: p, alpha: 0, life: 0.02 });
    this.line({ a: p, b: p.clone().setX(1), alpha: 0, life: 0.02 });
    this.decal({ pos: p, y: -30, alpha: 0, glow: 0, life: 0.02 });
    this.distort({ pos: p, strength: 0, life: 0.02 });
    const b = this.beamMesh({ alpha: 0 }); b.mesh.position.copy(p); this.spawn(b.mesh, 0.02);
    const d = this.diskMesh({ alpha: 0 }); d.mesh.position.copy(p); this.spawn(d.mesh, 0.02);
    if (root) this.ghost(root, { alpha: 0, life: 0.02 });
    for (const k in this.debris) this.debris[k].emit({ pos: p, life: 0.02 });
    this.puffs.emit({ pos: p, life: 0.02 });
  }

  clearAll() {
    for (const e of this.effects) e.obj.parent?.remove(e.obj);
    this.effects.length = 0;
    this.add.clear(); this.alpha.clear(); this.puffs.clear();
    for (const k in this.debris) this.debris[k].clear();
    this.lights.items.length = 0;
  }
}
