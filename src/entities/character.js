// Stylized character built from simple shapes. Arms/legs are 2-bone IK
// "noodles" so animations only need hand/foot targets.
import * as THREE from 'three';
import { toonMesh, limbGeo, placeLimb, computeOutlineNormals } from '../render/toon.js';

const _S = new THREE.Vector3();
const _E = new THREE.Vector3();
const _T = new THREE.Vector3();
const _P = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export function solveIK(S, T, a, b, pole, outE) {
  _d.subVectors(T, S);
  let dist = _d.length();
  if (dist < 1e-5) { outE.copy(S).add(pole.clone().multiplyScalar(a)); return; }
  _d.multiplyScalar(1 / dist);
  const dd = Math.min(dist, (a + b) * 0.999);
  const cosA = (a * a + dd * dd - b * b) / (2 * a * dd);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _P.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0).addScaledVector(_d, _d.y);
  _P.normalize();
  outE.copy(S).addScaledVector(_d, a * cosA).addScaledVector(_P, a * sinA);
}

export class CharacterModel {
  constructor(opts = {}) {
    const c = {
      coat: 0x27407e, coatTrim: 0xe7c46a, pants: 0x2b2d42, skin: 0xffdcc4,
      hair: 0xeef1ff, scarf: 0xe2333f, eye: 0x6ff6ff, boots: 0x3a2f3f, glove: 0x30324a,
      ...opts.colors,
    };
    this.colors = c;
    this.flash = { value: new THREE.Vector4(1, 1, 1, 0) };
    const F = this.flash;
    const ow = opts.outlineWidth ?? 2.3;
    const T = (geo, color, extra = {}) => toonMesh(geo, { color, flash: F, outlineWidth: ow, rim: 0.7, ...extra });

    this.root = new THREE.Group();
    this.spinG = new THREE.Group();  // flips / spins around the hips
    this.spinG.position.y = 0.9;
    this.root.add(this.spinG);
    this.inner = new THREE.Group();
    this.inner.position.y = -0.9;
    this.spinG.add(this.inner);
    this.body = new THREE.Group();   // hip pivot
    this.inner.add(this.body);
    this.torso = new THREE.Group();  // chest pivot (twist/lean)
    this.body.add(this.torso);

    // pelvis + torso
    const pelvis = T(new THREE.SphereGeometry(0.2, 14, 10), c.pants);
    pelvis.scale.set(1.05, 0.8, 0.85);
    this.body.add(pelvis);
    const chest = T(new THREE.CapsuleGeometry(0.215, 0.3, 6, 14), c.coat, { spec: 0.15 });
    chest.position.y = 0.33;
    chest.scale.set(1.08, 1, 0.82);
    this.torso.add(chest);
    // coat tails (gives a sense of facing from behind)
    const tail = T(new THREE.ConeGeometry(0.26, 0.55, 10, 1, true), c.coat, { side: THREE.DoubleSide });
    tail.position.set(0, 0.0, -0.02);
    tail.rotation.x = Math.PI; // open downward
    tail.scale.set(1.0, 1, 0.85);
    this.body.add(tail);
    this.coatTail = tail;
    const belt = T(new THREE.CylinderGeometry(0.205, 0.205, 0.07, 14), c.coatTrim, { spec: 0.4 });
    belt.position.y = 0.12;
    belt.scale.set(1.08, 1, 0.85);
    this.torso.add(belt);

    // head
    this.head = new THREE.Group();
    this.head.position.y = 0.86;
    this.torso.add(this.head);
    const headM = T(new THREE.SphereGeometry(0.235, 18, 14), c.skin);
    this.head.add(headM);
    // hair cap + spikes
    const hairCap = T(new THREE.SphereGeometry(0.255, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), c.hair, { spec: 0.35 });
    hairCap.position.set(0, 0.02, -0.03);
    hairCap.rotation.x = -0.35;
    this.head.add(hairCap);
    const spikeGeo = new THREE.ConeGeometry(0.09, 0.32, 6);
    const spikes = [
      [0, 0.12, -0.2, -2.1, 0], [0.13, 0.08, -0.17, -2.0, -0.5], [-0.13, 0.08, -0.17, -2.0, 0.5],
      [0.07, 0.2, -0.12, -1.6, -0.3], [-0.07, 0.2, -0.12, -1.6, 0.3], [0, 0.0, -0.22, -2.5, 0],
    ];
    for (const [x, y, z, rx, rz] of spikes) {
      const s = T(spikeGeo, c.hair, { spec: 0.35 });
      s.position.set(x, y, z);
      s.rotation.set(rx, 0, rz);
      this.head.add(s);
    }
    // bangs
    const bangGeo = new THREE.ConeGeometry(0.07, 0.2, 5);
    for (const [x, rz] of [[0.1, 0.35], [-0.02, -0.1], [-0.12, -0.45]]) {
      const b = T(bangGeo, c.hair, { spec: 0.35 });
      b.position.set(x, 0.12, 0.17);
      b.rotation.set(2.6, 0, rz);
      this.head.add(b);
    }
    // eyes (glowing, show facing clearly)
    const eyeGeo = new THREE.CapsuleGeometry(0.03, 0.05, 4, 8);
    const glintGeo = new THREE.SphereGeometry(0.011, 6, 4);
    for (const x of [-0.085, 0.085]) {
      const e = toonMesh(eyeGeo, { color: 0x24305e, outline: false, rim: 0, flash: F, spec: 0 });
      e.position.set(x, 0.0, 0.215);
      e.rotation.x = -0.15;
      e.scale.set(1, 1, 0.6);
      this.head.add(e);
      const g = toonMesh(glintGeo, { color: c.eye, emissive: 1.4, outline: false, rim: 0 });
      g.position.set(x + 0.012, 0.022, 0.236);
      this.head.add(g);
    }
    // headband
    const band = T(new THREE.TorusGeometry(0.235, 0.025, 6, 20), c.scarf);
    band.rotation.x = Math.PI / 2 - 0.25;
    band.position.y = 0.07;
    this.head.add(band);

    // scarf collar
    const collar = T(new THREE.TorusGeometry(0.15, 0.075, 8, 16), c.scarf);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.66;
    this.torso.add(collar);
    this.collar = collar;

    // limbs (in root space so IK is simple)
    this.limbs = new THREE.Group();
    this.inner.add(this.limbs);
    const arm = limbGeo(0.068, 0.058);
    const leg = limbGeo(0.085, 0.07);
    computeOutlineNormals(arm); computeOutlineNormals(leg);
    const joint = new THREE.SphereGeometry(1, 10, 8);
    this.uArmR = T(arm, c.coat); this.fArmR = T(arm, c.coat);
    this.uArmL = T(arm, c.coat); this.fArmL = T(arm, c.coat);
    this.thighR = T(leg, c.pants); this.shinR = T(leg, c.pants);
    this.thighL = T(leg, c.pants); this.shinL = T(leg, c.pants);
    this.elbowR = T(joint, c.coat); this.elbowL = T(joint, c.coat);
    this.kneeR = T(joint, c.pants); this.kneeL = T(joint, c.pants);
    this.shR = T(joint, c.coat); this.shL = T(joint, c.coat);
    for (const j of [this.elbowR, this.elbowL]) j.scale.setScalar(0.064);
    for (const j of [this.kneeR, this.kneeL]) j.scale.setScalar(0.08);
    for (const j of [this.shR, this.shL]) j.scale.setScalar(0.1);
    this.handR = T(new THREE.SphereGeometry(0.078, 10, 8), c.glove);
    this.handL = T(new THREE.SphereGeometry(0.078, 10, 8), c.glove);
    const footGeo = new THREE.CapsuleGeometry(0.075, 0.13, 4, 8);
    footGeo.rotateX(Math.PI / 2);
    this.footRM = T(footGeo, c.boots);
    this.footLM = T(footGeo, c.boots);
    for (const m of [this.uArmR, this.fArmR, this.uArmL, this.fArmL, this.thighR, this.shinR, this.thighL, this.shinL,
      this.elbowR, this.elbowL, this.kneeR, this.kneeL, this.shR, this.shL, this.handR, this.handL, this.footRM, this.footLM]) this.limbs.add(m);

    // weapon sockets (root space)
    this.sockR = new THREE.Group();
    this.sockL = new THREE.Group();
    this.inner.add(this.sockR, this.sockL);

    this.upperLen = 0.29; this.foreLen = 0.29;
    this.thighLen = 0.43; this.shinLen = 0.43;
    this._poleR = new THREE.Vector3();
    this._poleL = new THREE.Vector3();
    this.shoulderR = new THREE.Vector3();
    this.shoulderL = new THREE.Vector3();

    this.root.traverse((o) => { o.frustumCulled = false; });
  }

  /** Apply a pose (root-local). */
  apply(pose) {
    this.spinG.rotation.set(pose.flip, pose.spin, 0, 'YXZ');
    const b = this.body;
    b.position.copy(pose.hip);
    b.rotation.set(pose.lean * 0.35, 0, pose.roll * 0.5);
    b.scale.set(1 / Math.sqrt(pose.squash), pose.squash, 1 / Math.sqrt(pose.squash));
    this.torso.rotation.set(pose.lean * 0.65, pose.twist, pose.roll * 0.5, 'YXZ');
    this.head.rotation.set(pose.headPitch - pose.lean * 0.5, pose.headYaw - pose.twist * 0.5, -pose.roll * 0.4, 'YXZ');
    this.coatTail.rotation.x = Math.PI - Math.max(-0.4, Math.min(0.5, pose.lean * 0.6));

    b.updateMatrix();
    this.torso.updateMatrix();
    _m4.multiplyMatrices(b.matrix, this.torso.matrix);
    this.shoulderR.set(-0.27, 0.58, 0).applyMatrix4(_m4);
    this.shoulderL.set(0.27, 0.58, 0).applyMatrix4(_m4);

    // arms
    this._poleR.set(-0.7 - pose.elbowOut, -1, -0.45);
    this._poleL.set(0.7 + pose.elbowOut, -1, -0.45);
    this._arm(this.shoulderR, pose.handR, this._poleR, this.uArmR, this.fArmR, this.elbowR, this.handR, this.shR);
    this._arm(this.shoulderL, pose.handL, this._poleL, this.uArmL, this.fArmL, this.elbowL, this.handL, this.shL);

    // legs
    _S.set(-0.115, -0.04, 0).applyMatrix4(b.matrix);
    _P.set(-0.15, 0, 1);
    this._leg(_S, pose.footR, _P, this.thighR, this.shinR, this.kneeR, this.footRM);
    _S.set(0.115, -0.04, 0).applyMatrix4(b.matrix);
    _P.set(0.15, 0, 1);
    this._leg(_S, pose.footL, _P, this.thighL, this.shinL, this.kneeL, this.footLM);

    // weapon sockets
    this.sockR.position.copy(pose.handR);
    this.sockR.quaternion.copy(pose.wR);
    this.sockL.position.copy(pose.handL);
    this.sockL.quaternion.copy(pose.wL);
  }

  _arm(S, T, pole, up, fo, elbow, hand, sh) {
    solveIK(S, T, this.upperLen, this.foreLen, pole, _E);
    placeLimb(up, S, _E);
    // forearm reaches the hand target even if stretched
    placeLimb(fo, _E, T);
    elbow.position.copy(_E);
    hand.position.copy(T);
    sh.position.copy(S);
  }

  _leg(S, foot, pole, th, sh, knee, footM) {
    _T.copy(foot); _T.y += 0.075;
    solveIK(S, _T, this.thighLen, this.shinLen, pole, _E);
    placeLimb(th, S, _E);
    placeLimb(sh, _E, _T);
    knee.position.copy(_E);
    footM.position.copy(_T);
    footM.position.z += 0.03;
  }

  setFlash(r, g, b, a) { this.flash.value.set(r, g, b, a); }
}

// ── Scarf: verlet rope rendered as a flattened cel-shaded tube ─────────────────
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class Scarf {
  constructor({ color = 0xe2333f, flash, n = 10, seg = 0.11, width = 0.13, thick = 0.035, offset = 0 } = {}) {
    this.n = n; this.seg = seg; this.w = width; this.th = thick; this.offset = offset;
    this.R = 8;
    this.p = []; this.q = [];
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3(0, 1.5 - i * seg, -0.2)); this.q.push(this.p[i].clone()); }
    const verts = n * this.R;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('outlineNormal', g.attributes.normal);
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let r = 0; r < this.R; r++) {
      const a = i * this.R + r, b = i * this.R + (r + 1) % this.R, c = a + this.R, d = b + this.R;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    this.geo = g;
    this.mesh = toonMesh(g, { color, flash, outlineWidth: 1.8, rim: 0.6, side: THREE.DoubleSide });
    this.mesh.frustumCulled = false;
    this.mesh.userData.outline.frustumCulled = false;
    this.init = false;
  }

  /** anchor: world position of the knot; back: world "behind" direction; body: chest sphere center */
  update(dt, anchor, back, body, bodyR = 0.3) {
    const P = this.p, Q = this.q, n = this.n;
    if (!this.init || dt > 0.2) {
      this.init = true;
      for (let i = 0; i < n; i++) { P[i].copy(anchor).addScaledVector(back, i * this.seg * 0.7).y -= i * this.seg * 0.7; Q[i].copy(P[i]); }
    }
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      P[0].copy(anchor); Q[0].copy(anchor);
      for (let i = 1; i < n; i++) {
        const v = _a.subVectors(P[i], Q[i]).multiplyScalar(0.985);
        Q[i].copy(P[i]);
        P[i].add(v);
        P[i].y -= 9.8 * h * h;
        // gentle flutter
        const t = performance.now() * 0.001;
        P[i].addScaledVector(back, 3.2 * h * h * (1 + 0.6 * Math.sin(t * 6 + i * 0.9)));
        P[i].y += 1.8 * h * h;
      }
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < n; i++) {
          const d = _a.subVectors(P[i], P[i - 1]);
          const L = d.length() || 1e-5;
          const k = (L - this.seg) / L;
          if (i === 1) P[i].addScaledVector(d, -k);
          else { P[i].addScaledVector(d, -k * 0.5); P[i - 1].addScaledVector(d, k * 0.5); }
        }
        P[0].copy(anchor);
      }
      for (let i = 1; i < n; i++) {
        const d = _a.subVectors(P[i], body);
        const L = d.length();
        if (L < bodyR) P[i].addScaledVector(d, (bodyR - L) / Math.max(L, 1e-4));
        if (P[i].y < 0.03) P[i].y = 0.03;
      }
    }
    this.rebuild(back);
  }

  rebuild(back) {
    const P = this.p, n = this.n, R = this.R;
    _n.copy(back).negate();
    for (let i = 0; i < n; i++) {
      _t.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      // side axis: perpendicular to the tube and roughly horizontal
      _s.crossVectors(_t, _up);
      if (_s.lengthSq() < 1e-4) _s.crossVectors(_t, _n);
      _s.normalize();
      _b.crossVectors(_s, _t).normalize();
      const taper = i === n - 1 ? 0.55 : 1;
      const w = this.w * (0.75 + 0.25 * (i / n)) * taper, th = this.th;
      for (let r = 0; r < R; r++) {
        const a = (r / R) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        const o = (i * R + r) * 3;
        this.pos[o] = P[i].x + _s.x * cs * w + _b.x * sn * th;
        this.pos[o + 1] = P[i].y + _s.y * cs * w + _b.y * sn * th;
        this.pos[o + 2] = P[i].z + _s.z * cs * w + _b.z * sn * th;
        // ellipse normal
        _a.copy(_s).multiplyScalar(cs / w).addScaledVector(_b, sn / th).normalize();
        this.nrm[o] = _a.x; this.nrm[o + 1] = _a.y; this.nrm[o + 2] = _a.z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}
