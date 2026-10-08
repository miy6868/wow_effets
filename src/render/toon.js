// Helpers to build cel-shaded meshes with inverted-hull outlines.
import * as THREE from 'three';
import { makeToonMaterial, makeOutlineMaterial, deriveOutline } from './shaders/toon.js';

/**
 * Adds an `outlineNormal` attribute: per-vertex normals averaged over all
 * vertices sharing a position, so the hull does not split at hard edges.
 */
export function computeOutlineNormals(geo) {
  if (geo.attributes.outlineNormal) return geo;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const acc = [];
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let a = map.get(k);
    if (!a) { a = [0, 0, 0]; map.set(k, a); }
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
    acc.push(a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc[i];
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

/**
 * A toon mesh with an outline child. `flash` (a shared uniform {value: Vector4})
 * lets an entity flash all of its parts at once.
 */
export function toonMesh(geo, opts = {}) {
  const mat = makeToonMaterial(opts);
  const mesh = new THREE.Mesh(geo, mat);
  if (opts.outline !== false) {
    computeOutlineNormals(geo);
    const om = makeOutlineMaterial({
      color: opts.outlineColor ?? deriveOutline(opts.color ?? 0xffffff),
      width: opts.outlineWidth ?? 2.2,
      flash: opts.flash,
    });
    const o = new THREE.Mesh(geo, om);
    o.name = 'outline';
    o.renderOrder = -1;
    mesh.add(o);
    mesh.userData.outline = o;
  }
  mesh.userData.toon = true;
  return mesh;
}

/** Geometry for a capsule standing on Y, centered at origin. */
export function capsuleGeo(radius, length, cap = 6, radial = 12) {
  return new THREE.CapsuleGeometry(radius, length, cap, radial);
}

/** Unit-length limb along +Y (0..1), for stretch-scaling between two points.
 *  Caps are hidden by joint spheres placed at both ends. */
export function limbGeo(radiusA, radiusB = radiusA, radial = 10) {
  const g = new THREE.CylinderGeometry(radiusB, radiusA, 1, radial, 1);
  g.translate(0, 0.5, 0);
  return g;
}

const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Places a +Y unit limb mesh so it spans from a to b (in parent space). */
export function placeLimb(mesh, a, b, thick = 1) {
  _d.subVectors(b, a);
  const len = Math.max(_d.length(), 1e-4);
  mesh.position.copy(a);
  _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  mesh.quaternion.copy(_q);
  mesh.scale.set(thick, len, thick);
}

/** Set a shared flash uniform. */
export function setFlash(flashUniform, r, g, b, a) {
  flashUniform.value.set(r, g, b, a);
}
