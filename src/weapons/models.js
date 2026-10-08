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

export function shotgunModel() {
  const g = new THREE.Group();
  const dark = 0x2b2e3f, wood = 0x8a5236;
  const recv = toonMesh(new THREE.BoxGeometry(0.075, 0.32, 0.11), { color: dark, spec: 0.5, outlineWidth: 1.5 });
  recv.position.set(0, 0.12, 0.07); g.add(recv);
  const barrel = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 10), { color: 0x3b3f52, spec: 0.8, outlineWidth: 1.5 });
  barrel.position.set(0, 0.62, 0.1); g.add(barrel);
  const tube = toonMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.56, 8), { color: dark, outlineWidth: 1.3 });
  tube.position.set(0, 0.54, 0.045); g.add(tube);
  const fore = toonMesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), { color: wood, outlineWidth: 1.5 });
  fore.position.set(0, 0.52, 0.045); g.add(fore);
  g.userData.fore = fore;
  const stock = toonMesh(new THREE.BoxGeometry(0.06, 0.34, 0.11), { color: wood, outlineWidth: 1.5 });
  stock.position.set(0, -0.18, 0.02); stock.rotation.x = 0.18; g.add(stock);
  const grip = toonMesh(new THREE.BoxGeometry(0.055, 0.08, 0.15), { color: wood, outlineWidth: 1.3 });
  grip.position.set(0, -0.02, -0.03); grip.rotation.x = -0.3; g.add(grip);
  const band = toonMesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 10), { color: 0xffb347, emissive: 0.7, outline: false });
  band.position.set(0, 0.95, 0.1); g.add(band);
  g.userData.muzzle = new THREE.Vector3(0, 1.0, 0.1);
  g.userData.eject = new THREE.Vector3(0.05, 0.16, 0.1);
  g.userData.foreGrip = new THREE.Vector3(0, 0.52, 0.0);
  return g;
}

export function rocketModel() {
  const g = new THREE.Group();
  const tube = toonMesh(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 14), { color: 0x4f6b4a, spec: 0.3, outlineWidth: 1.8 });
  tube.position.set(0, 0.3, 0.16); g.add(tube);
  const front = toonMesh(new THREE.CylinderGeometry(0.135, 0.12, 0.16, 14), { color: 0x2b2e3f, outlineWidth: 1.6 });
  front.position.set(0, 0.95, 0.16); g.add(front);
  const back = toonMesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 14), { color: 0x2b2e3f, outlineWidth: 1.6 });
  back.position.set(0, -0.35, 0.16); g.add(back);
  const stripe = toonMesh(new THREE.CylinderGeometry(0.113, 0.113, 0.06, 14), { color: 0xffc94a, emissive: 0.6, outline: false });
  stripe.position.set(0, 0.62, 0.16); g.add(stripe);
  const sight = toonMesh(new THREE.BoxGeometry(0.04, 0.16, 0.08), { color: 0x2b2e3f, outlineWidth: 1.3 });
  sight.position.set(-0.1, 0.45, 0.28); g.add(sight);
  const grip = toonMesh(new THREE.BoxGeometry(0.05, 0.07, 0.16), { color: 0x2b2e3f, outlineWidth: 1.3 });
  grip.position.set(0, 0.0, 0.0); g.add(grip);
  const warhead = toonMesh(new THREE.ConeGeometry(0.09, 0.2, 10), { color: 0xd8473f, outlineWidth: 1.4 });
  warhead.position.set(0, 1.1, 0.16); g.add(warhead);
  g.userData.warhead = warhead;
  g.userData.muzzle = new THREE.Vector3(0, 1.05, 0.16);
  g.userData.back = new THREE.Vector3(0, -0.45, 0.16);
  g.userData.foreGrip = new THREE.Vector3(0, 0.55, 0.02);
  return g;
}

export function sniperModel() {
  const g = new THREE.Group();
  const dark = 0x272a38;
  const body = toonMesh(new THREE.BoxGeometry(0.07, 0.5, 0.1), { color: dark, spec: 0.5, outlineWidth: 1.5 });
  body.position.set(0, 0.18, 0.07); g.add(body);
  const barrel = toonMesh(new THREE.CylinderGeometry(0.022, 0.026, 1.0, 10), { color: 0x3a3e52, spec: 0.8, outlineWidth: 1.4 });
  barrel.position.set(0, 0.92, 0.09); g.add(barrel);
  const brake = toonMesh(new THREE.BoxGeometry(0.06, 0.1, 0.06), { color: dark, outlineWidth: 1.4 });
  brake.position.set(0, 1.44, 0.09); g.add(brake);
  const scope = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), { color: 0x1d1f2a, spec: 0.6, outlineWidth: 1.4 });
  scope.position.set(0, 0.24, 0.19); g.add(scope);
  const lens = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), { color: 0x7fe8ff, emissive: 1.5, outline: false });
  lens.position.set(0, 0.415, 0.19); g.add(lens);
  const stock = toonMesh(new THREE.BoxGeometry(0.06, 0.36, 0.13), { color: 0x5b6b8a, outlineWidth: 1.5 });
  stock.position.set(0, -0.24, 0.04); g.add(stock);
  const grip = toonMesh(new THREE.BoxGeometry(0.05, 0.08, 0.14), { color: dark, outlineWidth: 1.3 });
  grip.position.set(0, -0.01, -0.03); grip.rotation.x = -0.3; g.add(grip);
  const bolt = toonMesh(new THREE.SphereGeometry(0.03, 8, 6), { color: 0xc9cede, spec: 1, outlineWidth: 1.2 });
  bolt.position.set(0.07, 0.1, 0.1); g.add(bolt);
  g.userData.bolt = bolt;
  g.userData.muzzle = new THREE.Vector3(0, 1.5, 0.09);
  g.userData.eject = new THREE.Vector3(0.05, 0.14, 0.1);
  g.userData.foreGrip = new THREE.Vector3(0, 0.5, 0.0);
  return g;
}

export function minigunModel() {
  const g = new THREE.Group();
  const dark = 0x2b2e3f;
  const housing = toonMesh(new THREE.CylinderGeometry(0.13, 0.15, 0.36, 12), { color: 0x5a6172, spec: 0.5, outlineWidth: 1.6 });
  housing.position.set(0, 0.2, 0.12); g.add(housing);
  const motor = toonMesh(new THREE.BoxGeometry(0.2, 0.2, 0.24), { color: dark, outlineWidth: 1.6 });
  motor.position.set(0, -0.05, 0.12); g.add(motor);
  const spin = new THREE.Group();
  spin.position.set(0, 0.38, 0.12);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = toonMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 8), { color: 0x3c4152, spec: 0.8, outlineWidth: 1.2 });
    b.position.set(Math.cos(a) * 0.065, 0.39, Math.sin(a) * 0.065);
    spin.add(b);
  }
  const clamp1 = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), { color: dark, outlineWidth: 1.3 });
  clamp1.position.y = 0.6; spin.add(clamp1);
  const clamp2 = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), { color: dark, outlineWidth: 1.3 });
  clamp2.position.y = 0.2; spin.add(clamp2);
  g.add(spin);
  g.userData.spin = spin;
  // heat glow sleeve (emissive amount driven at runtime)
  const heat = toonMesh(new THREE.CylinderGeometry(0.105, 0.105, 0.3, 12, 1, true), { color: 0xff6a2a, emissive: 0, outline: false, side: THREE.DoubleSide });
  heat.position.set(0, 0.95, 0.12); g.add(heat);
  g.userData.heat = heat;
  const handle = toonMesh(new THREE.BoxGeometry(0.05, 0.3, 0.06), { color: dark, outlineWidth: 1.3 });
  handle.position.set(0, 0.25, 0.32); g.add(handle);
  const box = toonMesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), { color: 0x4f6b4a, outlineWidth: 1.5 });
  box.position.set(0.18, 0.0, 0.05); g.add(box);
  g.userData.muzzle = new THREE.Vector3(0, 1.18, 0.12);
  g.userData.eject = new THREE.Vector3(-0.15, 0.05, 0.12);
  g.userData.foreGrip = new THREE.Vector3(0, 0.28, 0.33);
  return g;
}
