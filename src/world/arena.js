// The training arena: stone plaza, grass field, pillars, distant hills, sky.
import * as THREE from 'three';
import { makeGroundMaterial, toonGlobals } from '../render/shaders/toon.js';
import { skyVertex, skyFragment } from '../render/shaders/sky.js';
import { toonMesh } from '../render/toon.js';

export const ARENA_R = 26;

export class Arena {
  constructor(scene) {
    this.scene = scene;
    const L = toonGlobals;
    L.uLightDir.value.set(-0.5, 0.75, 0.42).normalize();
    L.uLightColor.value.setRGB(1.0, 0.95, 0.88);
    L.uSkyAmb.value.setRGB(1.0, 0.98, 1.02);
    L.uGroundAmb.value.setRGB(0.82, 0.8, 0.95);
    L.uRimColor.value.setRGB(1.0, 0.85, 0.7);
    L.uFogColor.value.set(0xb7a4c4);
    L.uFog.value.set(50, 260);

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(0x2c3a78) },
        uMid: { value: new THREE.Color(0x7a7fc0) },
        uHorizon: { value: new THREE.Color(0xf3b59a) },
        uSunDir: { value: new THREE.Vector3(-0.55, 0.16, 0.82).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.75, 0.5) },
        uCloudLit: { value: new THREE.Color(0xfbe3e0) },
        uCloudShade: { value: new THREE.Color(0x9a8fc4) },
        uTime: toonGlobals.uTime,
        uWorldDim: toonGlobals.uWorldDim,
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat);
    sky.renderOrder = -100;
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;

    // ground
    const groundGeo = new THREE.CircleGeometry(220, 96);
    groundGeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(groundGeo, makeGroundMaterial({ arenaR: ARENA_R }));
    this.ground.renderOrder = -50;
    scene.add(this.ground);

    this.buildPillars();
    this.buildHills();
  }

  buildPillars() {
    const g = new THREE.Group();
    const n = 12;
    const stone = 0xa6a9bd;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.13;
      const r = ARENA_R + 3.2;
      const broken = i % 4 === 2;
      const h = broken ? 2.2 + (i % 3) * 0.6 : 5.2;
      const p = new THREE.Group();
      const shaft = toonMesh(new THREE.CylinderGeometry(0.62, 0.7, h, 10), { color: stone, outlineWidth: 2.4 });
      shaft.position.y = h / 2 + 0.35;
      p.add(shaft);
      const base = toonMesh(new THREE.BoxGeometry(1.8, 0.7, 1.8), { color: 0x8f92a8, outlineWidth: 2.4 });
      base.position.y = 0.35;
      p.add(base);
      if (!broken) {
        const cap = toonMesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), { color: 0x8f92a8, outlineWidth: 2.4 });
        cap.position.y = h + 0.6;
        p.add(cap);
        // glowing rune band
        const band = toonMesh(new THREE.CylinderGeometry(0.66, 0.66, 0.18, 10), { color: 0x8fe8ff, emissive: 1.6, outline: false, rim: 0 });
        band.position.y = h * 0.62;
        p.add(band);
      } else {
        const top = toonMesh(new THREE.CylinderGeometry(0.0, 0.62, 0.7, 10), { color: stone });
        top.position.y = h + 0.7;
        top.rotation.z = 0.4;
        p.add(top);
      }
      p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      p.rotation.y = -a;
      g.add(p);
    }
    this.scene.add(g);
  }

  buildHills() {
    const g = new THREE.Group();
    const cols = [0x6d70a8, 0x7a74ad, 0x62689c];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 0.15;
      const r = 150 + Math.random() * 40;
      const h = 14 + Math.random() * 22;
      const m = toonMesh(new THREE.ConeGeometry(h * 1.8, h, 9), { color: cols[i % 3], outline: false, rim: 0.0 });
      m.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r);
      m.rotation.y = Math.random() * 3;
      g.add(m);
    }
    this.scene.add(g);
  }
}
