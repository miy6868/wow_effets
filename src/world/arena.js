// The training arena: stone plaza, grass field, pillars, distant hills, sky.
import * as THREE from 'three';
import { makeGroundMaterial, toonGlobals, makeToonMaterial, makeOutlineMaterial } from '../render/shaders/toon.js';
import { skyVertex, skyFragment, ridgeVertex, ridgeFragment, grassVertex, grassFragment } from '../render/shaders/sky.js';
import { toonMesh, computeOutlineNormals } from '../render/toon.js';

export const ARENA_R = 26;

export class Arena {
  constructor(scene) {
    this.scene = scene;
    const L = toonGlobals;
    L.uLightDir.value.set(-0.62, 0.5, 0.62).normalize();
    L.uLightColor.value.setRGB(1.0, 0.88, 0.74);
    L.uSkyAmb.value.setRGB(0.98, 0.98, 1.04);
    L.uGroundAmb.value.setRGB(0.74, 0.76, 0.92);
    L.uRimColor.value.setRGB(1.0, 0.72, 0.45);
    L.uFogColor.value.set(0xb8978f);
    L.uFog.value.set(55, 240);

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(0x13204a) },
        uMid: { value: new THREE.Color(0x3a5d9c) },
        uHorizon: { value: new THREE.Color(0xf2a274) },
        uSunDir: { value: new THREE.Vector3(-0.62, 0.13, 0.77).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.66, 0.36) },
        uCloudLit: { value: new THREE.Color(0xffd6b0) },
        uCloudShade: { value: new THREE.Color(0x7d7aa6) },
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
    this.ground.material.uniforms.uTime = toonGlobals.uTime;
    this.ground.material.uniforms.uSunDir.value = this.skyMat.uniforms.uSunDir.value;
    this.ground.renderOrder = -50;
    scene.add(this.ground);

    this.buildPillars();
    this.buildHills();
    this.buildGrass();
    this.buildLanterns();
    this.buildTorii();
    this.buildTrees();
  }

  /** A vermilion torii just outside the pillar ring, backlit by the low sun. */
  buildTorii() {
    const g = new THREE.Group();
    const RED = 0xc8432c, BLACK = 0x2a2630;
    const T = (geo, color, o = {}) => toonMesh(geo, { color, outlineWidth: 2.4, rim: 0.9, ...o });
    for (const sx of [-1, 1]) {
      const post = T(new THREE.CylinderGeometry(0.26, 0.32, 6.2, 12), RED);
      post.position.set(sx * 2.7, 3.1, 0); post.rotation.z = sx * 0.035;
      g.add(post);
      const sleeve = T(new THREE.CylinderGeometry(0.38, 0.4, 0.55, 12), BLACK);
      sleeve.position.set(sx * 2.71, 0.27, 0);
      g.add(sleeve);
    }
    const nuki = T(new THREE.BoxGeometry(7.0, 0.34, 0.26), RED); nuki.position.y = 4.55; g.add(nuki);
    const strut = T(new THREE.BoxGeometry(0.34, 0.8, 0.24), RED); strut.position.y = 5.1; g.add(strut);
    const plaque = T(new THREE.BoxGeometry(0.62, 0.86, 0.12), BLACK); plaque.position.set(0, 5.05, 0.16); g.add(plaque);
    const gold = toonMesh(new THREE.BoxGeometry(0.46, 0.7, 0.04), { color: 0xffcf8a, emissive: 0.6, outline: false, rim: 0 });
    gold.position.set(0, 5.05, 0.23); g.add(gold);
    // upper lintels: the top one sweeps upward at both ends
    const bent = (w, h, d, lift) => {
      const geo = new THREE.BoxGeometry(w, h, d, 24, 1, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) / (w / 2);
        pos.setY(i, pos.getY(i) + lift * x * x * x * x + lift * 0.25 * x * x);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const shimaki = T(bent(7.6, 0.34, 0.42, 0.18), RED); shimaki.position.y = 5.55; g.add(shimaki);
    const kasagi = T(bent(8.8, 0.32, 0.56, 0.42), BLACK); kasagi.position.y = 5.86; g.add(kasagi);
    const a = 1.963, r = ARENA_R + 5.2;
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.rotation.y = Math.PI / 2 - a;
    this.scene.add(g);
    // stepping stones leading to it
    for (let i = 0; i < 3; i++) {
      const st = toonMesh(new THREE.CylinderGeometry(0.75 - i * 0.05, 0.8 - i * 0.05, 0.12, 9), { color: 0x7c7f93, outlineWidth: 1.8 });
      const rr = ARENA_R + 1.6 + i * 1.2;
      st.position.set(Math.cos(a) * rr, 0.06, Math.sin(a) * rr);
      this.scene.add(st);
    }
  }

  /** Cherry trees in the grass ring: instanced trunks + lumpy cel canopies. */
  buildTrees() {
    const rnd = mulberry(7);
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 7, 1); trunkGeo.translate(0, 0.5, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1, 3);
    {
      const pos = blobGeo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = Math.sin(v.x * 2.3 + 1.3) * Math.sin(v.y * 2.1 + 0.4) * Math.sin(v.z * 2.5 + 2.1);
        v.multiplyScalar(1 + n * 0.2);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      blobGeo.computeVertexNormals();
    }
    const trunks = [], blobs = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const seg = (a, b, r) => {
      const d = new THREE.Vector3().subVectors(b, a);
      q.setFromUnitVectors(up, d.clone().normalize());
      trunks.push(m.clone().compose(a, q, sc.set(r, d.length(), r)));
    };
    const spots = [0.55, 1.05, 1.72, 2.42, 3.25, 3.95, 4.6, 5.3, 5.95];
    for (const ang of spots) {
      const a = ang + (rnd() - 0.5) * 0.2;
      const r = ARENA_R + 7 + rnd() * 6;
      const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      const H = 3.2 + rnd() * 1.4;
      const lean = new THREE.Vector3((rnd() - 0.5) * 1.4, 0, (rnd() - 0.5) * 1.4);
      const mid = base.clone().add(new THREE.Vector3(0, H * 0.55, 0)).addScaledVector(lean, 0.5);
      const top = base.clone().add(new THREE.Vector3(0, H, 0)).add(lean);
      seg(base, mid, 0.34); seg(mid, top, 0.24);
      const crown = top.clone();
      const nb = 3 + Math.floor(rnd() * 2);
      for (let k = 0; k < nb; k++) {
        const ba = rnd() * Math.PI * 2;
        const tip = mid.clone().add(new THREE.Vector3(Math.cos(ba) * (1.4 + rnd()), H * 0.35 + rnd() * 0.8, Math.sin(ba) * (1.4 + rnd())));
        seg(mid, tip, 0.12);
        blobs.push([tip.clone().add(new THREE.Vector3(0, 0.3, 0)), 1.3 + rnd() * 0.5]);
      }
      blobs.push([crown.clone().add(new THREE.Vector3(0, 0.5, 0)), 2.0 + rnd() * 0.4]);
      for (let k = 0; k < 4; k++) {
        const ba = rnd() * Math.PI * 2;
        blobs.push([crown.clone().add(new THREE.Vector3(Math.cos(ba) * 1.5, rnd() * 0.8 - 0.2, Math.sin(ba) * 1.5)), 1.2 + rnd() * 0.5]);
      }
    }
    const inst = (geo, mats, color, o) => {
      computeOutlineNormals(geo);
      const mesh = new THREE.InstancedMesh(geo, makeToonMaterial({ color, ...o }), mats.length);
      const ol = new THREE.InstancedMesh(geo, makeOutlineMaterial({ color: o.outlineColor, width: o.outlineWidth ?? 2.2 }), mats.length);
      ol.renderOrder = -1;
      mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); ol.setMatrixAt(i, mm); });
      if (o.tints) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.tints), 3); }
      mesh.layers.enable(1);
      this.scene.add(mesh, ol);
    };
    inst(trunkGeo, trunks, 0x4a3a44, { outlineColor: 0x1c1420, outlineWidth: 2.0, rim: 0.4 });
    const bm = [], tints = [];
    for (const [p, s] of blobs) {
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      bm.push(new THREE.Matrix4().compose(p, q, sc.set(s * 1.1, s * 0.85, s * 1.1)));
      const k = 0.92 + rnd() * 0.14;
      tints.push(k, k * (0.96 + rnd() * 0.06), k);
    }
    inst(blobGeo, bm, 0xf5b2c9, { outlineColor: 0x6e3354, outlineWidth: 2.2, rim: 1.0, emissive: 0.06, tints });
    this.treeTops = blobs.map(([p]) => p);
  }

  buildGrass() {
    // one clump = 5 tapered blades
    const pos = [];
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + Math.random() * 0.6;
      const r = 0.05 + Math.random() * 0.07;
      const h = 0.38 + Math.random() * 0.25;
      const lean = 0.08 + Math.random() * 0.1;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const tx = Math.cos(a + 1.57) * 0.035, tz = Math.sin(a + 1.57) * 0.035;
      pos.push(cx - tx, 0, cz - tz, cx + tx, 0, cz + tz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
    }
    const base = new THREE.BufferGeometry();
    base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', base.attributes.position);
    const N = 7000;
    const off = new Float32Array(N * 4), tint = new Float32Array(N);
    let n = 0;
    while (n < N) {
      const r = ARENA_R + 0.6 + Math.pow(Math.random(), 1.6) * 48;
      const a = Math.random() * Math.PI * 2;
      // patchy distribution
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const patch = Math.sin(x * 0.21) * Math.sin(z * 0.17) + Math.sin(x * 0.07 + z * 0.05);
      if (patch < -0.6 && Math.random() < 0.8) continue;
      off.set([x, z, 0.8 + Math.random() * 0.9 * (r < ARENA_R + 6 ? 0.8 : 1.2), Math.random() * 6.28], n * 4);
      tint[n] = Math.random();
      n++;
    }
    g.setAttribute('iOff', new THREE.InstancedBufferAttribute(off, 4));
    g.setAttribute('iTint', new THREE.InstancedBufferAttribute(tint, 1));
    g.instanceCount = N;
    this.grassMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: toonGlobals.uTime, uPlayer: { value: new THREE.Vector3() },
        uBase: { value: new THREE.Color(0x3f5e3a) }, uTip: { value: new THREE.Color(0x86a25a) },
        uSunTint: { value: new THREE.Color(1.0, 0.7, 0.4) },
        uFogColor: toonGlobals.uFogColor, uFog: toonGlobals.uFog, uWorldDim: toonGlobals.uWorldDim,
      },
      vertexShader: grassVertex, fragmentShader: grassFragment, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, this.grassMat);
    m.frustumCulled = false;
    this.scene.add(m);
  }

  buildLanterns() {
    const stone = 0x8a8c9e;
    const n = 8;
    this.lanterns = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      const r = ARENA_R - 0.9;
      const g = new THREE.Group();
      const T = (geo, color, o = {}) => toonMesh(geo, { color, outlineWidth: 2.0, ...o });
      const base = T(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 6), stone); base.position.y = 0.125; g.add(base);
      const post = T(new THREE.CylinderGeometry(0.13, 0.16, 0.95, 8), stone); post.position.y = 0.72; g.add(post);
      const tray = T(new THREE.CylinderGeometry(0.38, 0.3, 0.12, 6), stone); tray.position.y = 1.24; g.add(tray);
      const box = T(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 6), 0xffd79a, { emissive: 1.25, rim: 0 }); box.position.y = 1.51; g.add(box);
      for (let k = 0; k < 6; k++) {
        const bar = T(new THREE.BoxGeometry(0.05, 0.44, 0.05), 0x5c5f72, { outline: false });
        const ka = (k / 6) * Math.PI * 2;
        bar.position.set(Math.cos(ka) * 0.245, 1.51, Math.sin(ka) * 0.245);
        g.add(bar);
      }
      const roof = T(new THREE.ConeGeometry(0.58, 0.36, 6), 0x6f7286); roof.position.y = 1.9; g.add(roof);
      const knob = T(new THREE.SphereGeometry(0.08, 8, 6), 0x6f7286); knob.position.y = 2.12; g.add(knob);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.rotation.y = -a;
      this.scene.add(g);
      this.lanterns.push(g.position.clone().setY(1.51));
    }
  }

  /** Lantern glow motes. */
  update(dt, fx, playerPos) {
    if (this.grassMat) this.grassMat.uniforms.uPlayer.value.copy(playerPos);
    if (!fx || dt <= 0) return;
    this._lt = (this._lt ?? 0) - dt;
    if (this._lt > 0) return;
    this._lt = 0.12;
    // now and then a petal lets go of a cherry tree and drifts downwind
    if (this.treeTops && Math.random() < 0.35) {
      const t = this.treeTops[(Math.random() * this.treeTops.length) | 0];
      fx.alpha.emit({ pos: t.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, -0.6, (Math.random() - 0.5) * 2)), vel: new THREE.Vector3(0.6 + Math.random() * 0.4, -0.45, 0.2), shape: 6, size: 0.08, sizeEnd: 0.08, life: 7, color: [1.0, 0.74, 0.8], colorEnd: [1.0, 0.74, 0.8], alpha: 0.95, alphaEnd: 0, colorCurve: 3, fadeIn: 0.1, rot: Math.random() * 6, rotVel: 2 + Math.random() * 2, bounce: 0, floorY: 0.03 });
    }
    const p = this.lanterns[(Math.random() * this.lanterns.length) | 0];
    fx.add.emit({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2), shape: 0, size: 0.06, sizeEnd: 0.02, life: 2 + Math.random(), color: [1.6, 0.9, 0.4], alpha: 0.9, alphaEnd: 0, fadeIn: 0.2 });
  }

  /** Project the sun into screen space for the god-ray pass. */
  updateSun(camera, pipeline) {
    const d = this.skyMat.uniforms.uSunDir.value;
    const p = camera.position.clone().addScaledVector(d, 200);
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const facing = Math.max(0, fwd.dot(d));
    p.project(camera);
    const vis = facing > 0 ? Math.pow(facing, 3) * (1 - Math.min(1, Math.max(0, Math.abs(p.x) - 1) * 2)) : 0;
    pipeline.u.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, Math.max(0, vis));
  }

  buildPillars() {
    const g = new THREE.Group();
    const n = 12;
    const stone = 0x8e90a3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.13;
      const r = ARENA_R + 3.2;
      const broken = i % 4 === 2;
      const h = broken ? 2.2 + (i % 3) * 0.6 : 5.2;
      const p = new THREE.Group();
      const shaft = toonMesh(new THREE.CylinderGeometry(0.62, 0.7, h, 10), { color: stone, outlineWidth: 2.4 });
      shaft.position.y = h / 2 + 0.35;
      p.add(shaft);
      const base = toonMesh(new THREE.BoxGeometry(1.8, 0.7, 1.8), { color: 0x777a8f, outlineWidth: 2.4 });
      base.position.y = 0.35;
      p.add(base);
      if (!broken) {
        const cap = toonMesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), { color: 0x777a8f, outlineWidth: 2.4 });
        cap.position.y = h + 0.6;
        p.add(cap);
        // glowing rune band
        const band = toonMesh(new THREE.CylinderGeometry(0.655, 0.655, 0.07, 10), { color: 0xffc27a, emissive: 1.1, outline: false, rim: 0 });
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
    // three ridge layers: near (darker, more contrast) → far (lighter, hazier)
    const sun = this.skyMat.uniforms.uSunDir.value;
    const layers = [
      { r: 230, h: 46, rough: 1.0, color: 0x7d7fa8, haze: 0.55, seed: 3.1 },
      { r: 175, h: 30, rough: 1.3, color: 0x5d6390, haze: 0.38, seed: 7.7 },
      { r: 128, h: 16, rough: 1.7, color: 0x434b74, haze: 0.22, seed: 1.9 },
    ];
    for (const L of layers) {
      const N = 360;
      const pos = new Float32Array((N + 1) * 2 * 3);
      const v = new Float32Array((N + 1) * 2);
      const idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        // layered sines → ridge profile with peaks and saddles
        let h = 0;
        h += Math.sin(a * 3 + L.seed) * 0.35 + Math.sin(a * 7 + L.seed * 2.3) * 0.22;
        h += Math.sin(a * 17 + L.seed * 5.1) * 0.12 * L.rough + Math.sin(a * 41 + L.seed) * 0.05 * L.rough;
        h += Math.abs(Math.sin(a * 5.5 + L.seed * 1.7)) * 0.45;
        const y = L.h * (0.35 + Math.max(0, h) * 0.8);
        const x = Math.cos(a) * L.r, z = Math.sin(a) * L.r;
        pos.set([x, -8, z, x, y, z], i * 6);
        v.set([0, 1], i * 2);
        if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aV', new THREE.BufferAttribute(v, 1));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(L.color) },
          uHaze: { value: new THREE.Color(0xc39a90) },
          uRim: { value: new THREE.Color(1.0, 0.62, 0.32) },
          uSunDir: { value: sun },
          uHazeAmt: { value: L.haze },
          uWorldDim: toonGlobals.uWorldDim,
        },
        vertexShader: ridgeVertex, fragmentShader: ridgeFragment, side: THREE.DoubleSide,
      }));
      m.frustumCulled = false;
      m.renderOrder = -60;
      this.scene.add(m);
    }
  }
}

/** Drifting sunlit motes and a few petals around the camera — quiet ambient life. */
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Ambience {
  constructor(fx) { this.fx = fx; this.t = 0; }
  update(dt, center) {
    if (dt <= 0) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.05;
    const fx = this.fx;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 16;
    const p = new THREE.Vector3(center.x + Math.cos(a) * r, 0.4 + Math.random() * 4.5, center.z + Math.sin(a) * r);
    if (Math.random() < 0.75) {
      // dust mote catching the low sun
      fx.add.emit({ pos: p, vel: new THREE.Vector3(0.25 + Math.random() * 0.3, (Math.random() - 0.3) * 0.15, 0.1), shape: 0, size: 0.06 + Math.random() * 0.05, sizeEnd: 0.06, life: 4 + Math.random() * 3, color: [1.5, 1.1, 0.65], alpha: 0.9, alphaEnd: 0, fadeIn: 0.35 });
    } else {
      // a falling petal (alpha pool, small cel shard)
      fx.alpha.emit({ pos: p.setY(3 + Math.random() * 3), vel: new THREE.Vector3(0.6 + Math.random() * 0.4, -0.35, 0.2), shape: 6, size: 0.07, sizeEnd: 0.07, life: 6, color: [1.0, 0.78, 0.82], colorEnd: [1.0, 0.78, 0.82], alpha: 0.9, alphaEnd: 0, colorCurve: 3, fadeIn: 0.1, rot: Math.random() * 6, rotVel: 2 + Math.random() * 2, bounce: 0, floorY: 0.03 });
    }
  }
}
