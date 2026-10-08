// Procedural weapon meshes. Convention: origin = grip, +Y = blade / barrel
// direction, +Z = cutting edge (blades) or top side (guns).
import * as THREE from 'three';
import { toonMesh } from '../render/toon.js';

function extrudeBlade(shape, depth, opts = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: opts.bevel ?? true, bevelThickness: opts.bt ?? depth * 0.4, bevelSize: opts.bs ?? depth * 0.35, bevelSegments: 1, curveSegments: opts.curve ?? 8 });
  // shape is in XY (x = edge side, y = along blade); map x → +Z (edge), depth → X
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export function katanaModel(color = 0x8fe6ff) {
  const g = new THREE.Group();
  // curved blade (back edge at -x, cutting edge at +x)
  const L = 1.02;
  const s = new THREE.Shape();
  s.moveTo(-0.018, 0.0);
  s.quadraticCurveTo(-0.03, L * 0.55, -0.075, L);       // back
  s.lineTo(-0.035, L + 0.02);
  s.quadraticCurveTo(0.03, L * 0.86, 0.022, L * 0.5);  // edge
  s.lineTo(0.026, 0.0);
  s.closePath();
  const blade = toonMesh(extrudeBlade(s, 0.014, { curve: 12 }), { color: 0xdfe8f6, spec: 1.0, rim: 1.0, outlineWidth: 1.6, outlineColor: 0x1b2440 });
  blade.position.y = 0.17;
  g.add(blade);
  // glowing edge
  const e = new THREE.Shape();
  e.moveTo(0.012, 0.02);
  e.quadraticCurveTo(0.017, L * 0.5, 0.0, L * 0.86);
  e.quadraticCurveTo(-0.03, L * 0.97, -0.05, L * 0.995);
  e.lineTo(-0.04, L * 1.0);
  e.quadraticCurveTo(0.024, L * 0.86, 0.026, L * 0.5);
  e.lineTo(0.027, 0.02);
  e.closePath();
  const edge = toonMesh(extrudeBlade(e, 0.018, { bevel: false, curve: 12 }), { color, emissive: 2.2, outline: false, rim: 0 });
  edge.position.y = 0.17;
  g.add(edge);
  // tsuba
  const tsuba = toonMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12), { color: 0xd8b24a, spec: 0.8, outlineWidth: 1.4 });
  tsuba.position.y = 0.16;
  tsuba.scale.set(1, 1, 0.8);
  g.add(tsuba);
  // handle
  const handle = toonMesh(new THREE.CylinderGeometry(0.026, 0.024, 0.28, 8), { color: 0x2a2440, outlineWidth: 1.4 });
  handle.position.y = 0.02;
  g.add(handle);
  const pommel = toonMesh(new THREE.SphereGeometry(0.03, 8, 6), { color: 0xd8b24a, spec: 0.8, outlineWidth: 1.4 });
  pommel.position.y = -0.12;
  g.add(pommel);
  g.userData.bladeLen = L + 0.17;
  return g;
}

export function greatswordModel(runeColor = 0xff8a3a) {
  const g = new THREE.Group();
  const L = 1.75, W = 0.16;
  const s = new THREE.Shape();
  s.moveTo(-W, 0); s.lineTo(-W * 1.05, L * 0.8); s.lineTo(-W * 0.3, L); s.lineTo(W * 0.35, L * 1.02);
  s.lineTo(W * 1.1, L * 0.78); s.lineTo(W, 0); s.closePath();
  const blade = toonMesh(extrudeBlade(s, 0.06), { color: 0x6d7390, spec: 0.7, rim: 0.9, outlineWidth: 2.2, outlineColor: 0x12131f });
  blade.position.y = 0.28;
  g.add(blade);
  // bright cutting edges
  const e = new THREE.Shape();
  e.moveTo(W * 0.78, 0.02); e.lineTo(W * 0.85, L * 0.77); e.lineTo(W * 0.3, L * 0.99);
  e.lineTo(W * 0.35, L * 1.02); e.lineTo(W * 1.1, L * 0.78); e.lineTo(W * 1.0, 0.02); e.closePath();
  const edge = toonMesh(extrudeBlade(e, 0.064, { bevel: false }), { color: 0xe8ecf8, spec: 1, outline: false, rim: 1 });
  edge.position.y = 0.28;
  g.add(edge);
  // fuller rune slit (emissive)
  const rune = toonMesh(new THREE.BoxGeometry(0.075, L * 0.62, 0.04), { color: runeColor, emissive: 2.0, outline: false, rim: 0 });
  rune.position.set(0, 0.28 + L * 0.4, 0);
  g.add(rune);
  // guard
  const guard = toonMesh(new THREE.BoxGeometry(0.12, 0.1, 0.62), { color: 0x3a3550, spec: 0.5, outlineWidth: 1.8 });
  guard.position.y = 0.24;
  g.add(guard);
  for (const z of [-0.32, 0.32]) {
    const k = toonMesh(new THREE.SphereGeometry(0.065, 8, 6), { color: 0xd9a548, spec: 0.8, outlineWidth: 1.6 });
    k.position.set(0, 0.24, z);
    g.add(k);
  }
  const gem = toonMesh(new THREE.OctahedronGeometry(0.06), { color: runeColor, emissive: 1.5, outlineWidth: 1.2 });
  gem.position.set(0, 0.24, 0); gem.rotation.y = 0.8;
  g.add(gem);
  const handle = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 8), { color: 0x2c2032, outlineWidth: 1.5 });
  handle.position.y = -0.0;
  g.add(handle);
  const pommel = toonMesh(new THREE.OctahedronGeometry(0.06), { color: 0xd9a548, spec: 0.8, outlineWidth: 1.5 });
  pommel.position.y = -0.25;
  g.add(pommel);
  g.userData.bladeLen = L + 0.28;
  return g;
}

export function pistolModel(accent = 0xf2c35a) {
  const g = new THREE.Group();
  const body = toonMesh(new THREE.BoxGeometry(0.06, 0.34, 0.1), { color: 0x2b2e3f, spec: 0.6, outlineWidth: 1.5 });
  body.position.set(0, 0.11, 0.06);
  g.add(body);
  const slide = toonMesh(new THREE.BoxGeometry(0.064, 0.36, 0.05), { color: 0xc9cede, spec: 1, outlineWidth: 1.5 });
  slide.position.set(0, 0.13, 0.115);
  g.add(slide);
  g.userData.slide = slide;
  const barrel = toonMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8), { color: 0x1a1b26, outlineWidth: 1.2 });
  barrel.position.set(0, 0.32, 0.11);
  g.add(barrel);
  const grip = toonMesh(new THREE.BoxGeometry(0.056, 0.09, 0.2), { color: 0x3b2a2a, outlineWidth: 1.5 });
  grip.position.set(0, -0.02, -0.04);
  grip.rotation.x = -0.25;
  g.add(grip);
  const stripe = toonMesh(new THREE.BoxGeometry(0.066, 0.2, 0.012), { color: accent, emissive: 0.6, outline: false });
  stripe.position.set(0, 0.12, 0.142);
  g.add(stripe);
  g.userData.muzzle = new THREE.Vector3(0, 0.37, 0.11);
  g.userData.eject = new THREE.Vector3(0.04, 0.1, 0.13);
  return g;
}
