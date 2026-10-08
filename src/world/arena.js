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
        uStars: { value: 0 },
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

    this.colliders = []; // {x, z, r} vertical props the camera boom must not pass through
    this.buildPillars();
    this.buildHills();
    this.buildGrass();
    this.buildLanterns();
    this.buildTorii();
    this.buildTrees();
    this.buildBirds();
    this.buildPagoda();
  }

  /** A five-storey pagoda far out on the plain: a hazy silhouette that gives the
   *  shrine grounds a place in a larger world (fog does the aerial perspective). */
  buildPagoda() {
    const g = new THREE.Group();
    // colours are pre-hazed toward the fog: at ~100 m the global fog alone is too thin
    const T = (geo, color) => toonMesh(geo, { color, outlineWidth: 1.0, outlineColor: 0x4a3f52, rim: 0.3, castShadow: false });
    const base = T(new THREE.BoxGeometry(9, 1.2, 9), 0x8c7f88); base.position.y = 0.6; g.add(base);
    let y = 1.2;
    const widths = [6.2, 5.4, 4.6, 3.8, 3.0];
    widths.forEach((w, i) => {
      const h = i === 0 ? 3.0 : 2.3;
      const body = T(new THREE.BoxGeometry(w * 0.72, h, w * 0.72), 0x9a625c); body.position.y = y + h / 2; g.add(body);
      y += h;
      // flared eaves: a flat four-sided cone, corners slightly upturned by the outline
      const roof = T(new THREE.ConeGeometry(w * 0.86, 1.25, 4, 1), 0x5f5566);
      roof.rotation.y = Math.PI / 4; roof.position.y = y + 0.35; roof.scale.y = 0.8;
      g.add(roof);
      y += 0.6;
    });
    const spire = T(new THREE.CylinderGeometry(0.12, 0.2, 4.2, 6), 0xa08a68); spire.position.y = y + 2.0; g.add(spire);
    for (let k = 0; k < 5; k++) {
      const ring = T(new THREE.TorusGeometry(0.32, 0.07, 5, 10), 0xa08a68);
      ring.rotation.x = Math.PI / 2; ring.position.y = y + 0.8 + k * 0.55; g.add(ring);
    }
    const a = 1.18, r = 96;
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.rotation.y = 0.4;
    this.scene.add(g);
  }

  /** A small flock that crosses the sunset sky every so often (pure ambience). */
  buildBirds() {
    const g = new THREE.BufferGeometry();
    // a flat "V": two wings sweeping back from the body; flapping = animated Y scale
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.25, -1, 0.35, -0.25, 0, 0, -0.15,
      0, 0, 0.25, 0, 0, -0.15, 1, 0.35, -0.25,
    ], 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b3252, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
    this.birdN = 9;
    this.birds = new THREE.InstancedMesh(g, mat, this.birdN);
    this.birds.frustumCulled = false;
    this.birds.renderOrder = -60;
    this.scene.add(this.birds);
    this.birdT = 8; // first pass soon after start
    this.birdM = new THREE.Matrix4();
  }

  updateBirds(dt) {
    if (!this.birds) return;
    this.birdT -= dt;
    const T = 26; // seconds to cross
    if (this.birdT < -T) {
      this.birdT = 25 + Math.random() * 30;
      const a = Math.random() * Math.PI * 2;
      this.birdPath = { a, h: 38 + Math.random() * 18, r: 110 + Math.random() * 20, dir: Math.random() < 0.5 ? 1 : -1 };
    }
    this.birdPath ??= { a: 2.0, h: 44, r: 115, dir: 1 };
    const live = this.birdT < 0;
    this.birds.visible = live;
    if (!live) return;
    const k = -this.birdT / T;
    const P = this.birdPath;
    const ang = P.a + P.dir * (k - 0.5) * 1.6;
    const head = new THREE.Vector3(Math.cos(ang) * P.r, P.h + Math.sin(k * 3) * 2, Math.sin(ang) * P.r);
    const fwd = new THREE.Vector3(-Math.sin(ang) * P.dir, 0, Math.cos(ang) * P.dir);
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
    const t = (this.birdClock = (this.birdClock ?? 0) + dt);
    for (let i = 0; i < this.birdN; i++) {
      const row = Math.ceil(i / 2), s = i % 2 ? 1 : -1;
      const p = head.clone().addScaledVector(fwd, -row * 2.2).addScaledVector(side, i ? s * row * 2.0 : 0).add(new THREE.Vector3(0, Math.sin(t * 0.7 + i) * 0.4, 0));
      const flap = Math.sin(t * 7 + i * 1.3);
      this.birdM.compose(p, q, new THREE.Vector3(1.1, 1.1 * flap, 1.1));
      this.birds.setMatrixAt(i, this.birdM);
    }
    this.birds.instanceMatrix.needsUpdate = true;
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
    g.updateMatrixWorld(true);
    for (const sx of [-1, 1]) {
      const q = new THREE.Vector3(sx * 2.7, 0, 0).applyMatrix4(g.matrixWorld);
      this.colliders.push({ x: q.x, z: q.z, r: 0.75 });
    }
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
    const blobGeo = new THREE.IcosahedronGeometry(1, 2);
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
    spots.forEach((ang, ti) => {
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
        blobs.push([tip.clone().add(new THREE.Vector3(0, 0.3, 0)), 1.3 + rnd() * 0.5, ti]);
      }
      blobs.push([crown.clone().add(new THREE.Vector3(0, 0.5, 0)), 2.0 + rnd() * 0.4, ti]);
      for (let k = 0; k < 4; k++) {
        const ba = rnd() * Math.PI * 2;
        blobs.push([crown.clone().add(new THREE.Vector3(Math.cos(ba) * 1.5, rnd() * 0.8 - 0.2, Math.sin(ba) * 1.5)), 1.2 + rnd() * 0.5, ti]);
      }
    });
    const inst = (geo, mats, color, o) => {
      computeOutlineNormals(geo);
      const mesh = new THREE.InstancedMesh(geo, makeToonMaterial({ color, ...o }), mats.length);
      const ol = new THREE.InstancedMesh(geo, makeOutlineMaterial({ color: o.outlineColor, width: o.outlineWidth ?? 2.2 }), mats.length);
      ol.renderOrder = -1;
      mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); ol.setMatrixAt(i, mm); });
      if (o.tints) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.tints), 3); }
      this.scene.add(mesh, ol);
    };
    inst(trunkGeo, trunks, 0x4a3a44, { outlineColor: 0x1c1420, outlineWidth: 2.0, rim: 0.4 });
    // canopies: every blob and blossom cluster of a tree is merged into one mesh
    // whose normals are bent toward "away from the crown centre", so each crown
    // shades as one soft volume while its silhouette stays lumpy (stylised-tree trick)
    const centers = [];
    for (const [p, s, t] of blobs) {
      const c = (centers[t] ??= { v: new THREE.Vector3(), w: 0 });
      c.v.addScaledVector(p, s); c.w += s;
    }
    for (const c of centers) c.v.multiplyScalar(1 / c.w);
    const P = [], N = [];
    const v = new THREE.Vector3(), nn = new THREE.Vector3(), d = new THREE.Vector3(), nm = new THREE.Matrix3();
    const addPart = (geo, mat, C) => {
      const pa = geo.attributes.position, na = geo.attributes.normal;
      nm.getNormalMatrix(mat);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(mat);
        nn.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
        d.subVectors(v, C); d.y *= 1.3; d.normalize();
        nn.multiplyScalar(0.3).addScaledVector(d, 0.7).normalize();
        P.push(v.x, v.y, v.z); N.push(nn.x, nn.y, nn.z);
      }
    };
    const clusterGeo = new THREE.IcosahedronGeometry(1, 1);
    const nrm = new THREE.Vector3();
    for (const [p, s, t] of blobs) {
      const C = centers[t].v;
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      addPart(blobGeo, new THREE.Matrix4().compose(p, q, sc.set(s * 1.1, s * 0.85, s * 1.1)), C);
      // small blossom clusters half-buried in the blob: scalloped silhouette
      for (let k = 0; k < 5; k++) {
        nrm.set(rnd() * 2 - 1, rnd() * 1.6 - 0.35, rnd() * 2 - 1).normalize();
        const pos = p.clone().add(new THREE.Vector3(nrm.x * s * 0.98, nrm.y * s * 0.8, nrm.z * s * 0.98));
        const r = s * (0.22 + rnd() * 0.12);
        q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
        addPart(clusterGeo, new THREE.Matrix4().compose(pos, q, sc.set(r, r * 0.85, r)), C);
      }
    }
    const canopy = new THREE.BufferGeometry();
    canopy.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    canopy.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    // (trees stand outside the ±22 m shadow range, so they skip the shadow pass)
    const canopyMesh = toonMesh(canopy, { color: 0xf5b4ca, outlineColor: 0x6e3354, outlineWidth: 2.0, rim: 1.0, emissive: 0.06, castShadow: false });
    this.scene.add(canopyMesh);
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
      this.colliders.push({ x: g.position.x, z: g.position.z, r: 0.75 });
    }
    // warm pools of lantern light on the stone (one additive mesh, gentle flicker)
    const quads = new THREE.BufferGeometry();
    const P = [], U = [], S = [], I = [];
    this.lanterns.forEach((lp, i) => {
      const R = 2.6, b = i * 4;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(lp.x + u * R, 0.025, lp.z + v * R); U.push(u, v); S.push(i * 1.7); }
      I.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    quads.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    quads.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    quads.setAttribute('seed', new THREE.Float32BufferAttribute(S, 1));
    quads.setIndex(I);
    const pool = new THREE.Mesh(quads, new THREE.ShaderMaterial({
      uniforms: { uTime: toonGlobals.uTime, uWorldDim: toonGlobals.uWorldDim, uColor: { value: new THREE.Color(1.0, 0.55, 0.22) }, uGain: { value: 1 } },
      vertexShader: `attribute float seed; varying vec2 vUv; varying float vSeed;
        void main() { vUv = uv; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uWorldDim; uniform vec3 uColor; uniform float uGain; varying vec2 vUv; varying float vSeed;
        void main() {
          float r = length(vUv);
          float k = (1.0 - smoothstep(0.0, 1.0, r)); k *= k;
          // two soft cel steps so the pool reads as toon light, not a gradient blob
          float c = k * 0.55 + smoothstep(0.42, 0.46, k) * 0.12;
          float fl = 0.9 + 0.1 * sin(uTime * 7.0 + vSeed) * sin(uTime * 3.3 + vSeed * 2.0);
          gl_FragColor = vec4(uColor * c * fl * 0.32 * uGain * (1.0 - uWorldDim * 0.9), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.poolMat = pool.material;
    pool.renderOrder = -40;
    pool.frustumCulled = false;
    this.scene.add(pool);
  }

  /** Lantern glow motes. */
  update(dt, fx, playerPos) {
    if (this.grassMat) this.grassMat.uniforms.uPlayer.value.copy(playerPos);
    this.updateBirds(dt);
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
      this.colliders.push({ x: p.position.x, z: p.position.z, r: 1.45 });
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
    this.ridgeMats = [];
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
      this.ridgeMats.push(m.material);
    }
  }

  /** 'dusk' (default) or 'night': swaps sky, light, haze and set-dressing colours. */
  setTimeOfDay(mode, pipeline) {
    const P = TIMES[mode] ?? TIMES.dusk;
    this.time = mode;
    const L = toonGlobals, S = this.skyMat.uniforms;
    L.uLightDir.value.set(...P.lightDir).normalize();
    L.uLightColor.value.setRGB(...P.light);
    L.uSkyAmb.value.setRGB(...P.skyAmb); L.uGroundAmb.value.setRGB(...P.groundAmb);
    L.uRimColor.value.setRGB(...P.rim);
    L.uFogColor.value.set(P.fog); L.uFog.value.set(...P.fogRange);
    S.uZenith.value.set(P.zenith); S.uMid.value.set(P.mid); S.uHorizon.value.set(P.horizon);
    S.uSunDir.value.set(...P.sunDir).normalize();
    S.uSunColor.value.setRGB(...P.sun);
    S.uCloudLit.value.set(P.cloudLit); S.uCloudShade.value.set(P.cloudShade);
    S.uStars.value = P.stars;
    this.ground.material.uniforms.uSheen.value.set(P.sheen).multiplyScalar(P.sheenK);
    this.ridgeMats.forEach((m, i) => {
      m.uniforms.uColor.value.set(P.ridges[i]); m.uniforms.uHaze.value.set(P.ridgeHaze); m.uniforms.uRim.value.setRGB(...P.ridgeRim);
    });
    if (this.grassMat) {
      const u = this.grassMat.uniforms;
      u.uBase.value.set(P.grass[0]); u.uTip.value.set(P.grass[1]); u.uSunTint.value.setRGB(...P.grassTint);
    }
    if (this.poolMat) this.poolMat.uniforms.uGain.value = P.pools;
    if (pipeline) pipeline.u.uSunColor.value.setRGB(...P.rays);
  }
}

const TIMES = {
  dusk: {
    lightDir: [-0.62, 0.5, 0.62], light: [1.0, 0.88, 0.74], skyAmb: [0.98, 0.98, 1.04], groundAmb: [0.74, 0.76, 0.92], rim: [1.0, 0.72, 0.45],
    fog: 0xb8978f, fogRange: [55, 240],
    zenith: 0x13204a, mid: 0x3a5d9c, horizon: 0xf2a274, sunDir: [-0.62, 0.13, 0.77], sun: [1.0, 0.66, 0.36],
    cloudLit: 0xffd6b0, cloudShade: 0x7d7aa6, stars: 0,
    sheen: 0xf2a274, sheenK: 0.7,
    ridges: [0x7d7fa8, 0x5d6390, 0x434b74], ridgeHaze: 0xc39a90, ridgeRim: [1.0, 0.62, 0.32],
    grass: [0x3f5e3a, 0x86a25a], grassTint: [1.0, 0.7, 0.4], pools: 1, rays: [1.0, 0.7, 0.42],
  },
  night: {
    lightDir: [0.3, 0.62, 0.72], light: [0.46, 0.5, 0.7], skyAmb: [0.6, 0.62, 0.8], groundAmb: [0.38, 0.4, 0.55], rim: [0.5, 0.62, 1.0],
    fog: 0x1a2038, fogRange: [40, 210],
    zenith: 0x03050c, mid: 0x0a1229, horizon: 0x1e2a48, sunDir: [0.33, 0.36, 0.87], sun: [0.46, 0.52, 0.72],
    cloudLit: 0x283350, cloudShade: 0x0d1224, stars: 1,
    sheen: 0x4a5a86, sheenK: 0.4,
    ridges: [0x222a44, 0x181f38, 0x10162a], ridgeHaze: 0x1f2742, ridgeRim: [0.2, 0.25, 0.45],
    grass: [0x1c302e, 0x3c5848], grassTint: [0.45, 0.55, 0.95], pools: 2.8, rays: [0.45, 0.55, 0.85],
  },
};

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
    if (this.night && Math.random() < 0.6) {
      // fireflies: slow, low, blinking (fade in and out over a few seconds)
      p.y = 0.3 + Math.random() * 2.2;
      fx.add.emit({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.25, (Math.random() - 0.5) * 0.5), shape: 0, size: 0.07 + Math.random() * 0.04, sizeEnd: 0.05, life: 2.5 + Math.random() * 2.5, color: [1.1, 1.7, 0.5], alpha: 1.4, alphaEnd: 0, fadeIn: 0.45, drag: 0.2 });
    } else if (!this.night && Math.random() < 0.75) {
      // dust mote catching the low sun
      fx.add.emit({ pos: p, vel: new THREE.Vector3(0.25 + Math.random() * 0.3, (Math.random() - 0.3) * 0.15, 0.1), shape: 0, size: 0.06 + Math.random() * 0.05, sizeEnd: 0.06, life: 4 + Math.random() * 3, color: [1.5, 1.1, 0.65], alpha: 0.9, alphaEnd: 0, fadeIn: 0.35 });
    } else {
      // a falling petal (alpha pool, small cel shard)
      fx.alpha.emit({ pos: p.setY(3 + Math.random() * 3), vel: new THREE.Vector3(0.6 + Math.random() * 0.4, -0.35, 0.2), shape: 6, size: 0.07, sizeEnd: 0.07, life: 6, color: [1.0, 0.78, 0.82], colorEnd: [1.0, 0.78, 0.82], alpha: 0.9, alphaEnd: 0, colorCurve: 3, fadeIn: 0.1, rot: Math.random() * 6, rotVel: 2 + Math.random() * 2, bounce: 0, floorY: 0.03 });
    }
  }
}
