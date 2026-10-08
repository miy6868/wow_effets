// Training dummies: they take hits, stagger, get launched, tumble, bounce,
// lie down, get back up and walk home. Pure feedback targets – they never die.
import * as THREE from 'three';
import { toonMesh } from '../render/toon.js';
import { G } from '../ctx.js';
import { ARENA_R } from '../world/arena.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function wrapPi(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export class Dummy {
  constructor(pos, { heavy = false } = {}) {
    this.heavy = heavy;
    const s = heavy ? 1.65 : 1;
    this.s = s;
    this.mass = heavy ? 4.5 : 1;
    this.radius = 0.48 * s;
    this.height = 1.95 * s;
    this.home = pos.clone();
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.atan2(-pos.x, -pos.z);
    this.state = 'idle';
    this.stateT = 0;
    this.hitstop = 0; this.hitstopMax = 0.0001;
    this.shakeDir = new THREE.Vector3();
    this.pending = null;
    this.flash = { value: new THREE.Vector4(1, 1, 1, 0) };
    this.flashT = 0; this.hurtT = 0;
    this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0;
    this.squash = 1; this.squashV = 0;
    this.spin = 0;
    this.bounces = 0;
    this.lastHit = -10;
    this.stunEyes = 0;
    this.airTime = 0;
    this.status = { burn: 0, freeze: 0, shock: 0, gravity: 0 };
    this.juggleGrav = 1;
    this.build();
  }

  build() {
    const s = this.s;
    const F = this.flash;
    const heavy = this.heavy;
    const C = heavy
      ? { body: 0x7d87a8, wood: 0x4a4e66, head: 0x8c95b5, rope: 0xe0b450, tA: 0xff5a4a, tB: 0xfff3e0, eye: 0x1a1426 }
      : { body: 0xe3b77d, wood: 0x7a5640, head: 0xe8c08a, rope: 0x9a6440, tA: 0xe9483f, tB: 0xfff6e8, eye: 0x241a20 };
    const T = (g, c, extra = {}) => toonMesh(g, { color: c, flash: F, outlineWidth: 2.4, rim: 0.5, ...extra });

    this.root = new THREE.Group();
    this.yawG = new THREE.Group();
    this.root.add(this.yawG);
    this.pivot = new THREE.Group();       // rotation center (center of mass)
    this.cy = 0.95 * s;
    this.pivot.position.y = this.cy;
    this.yawG.add(this.pivot);
    this.shakeG = new THREE.Group();
    this.pivot.add(this.shakeG);
    this.bodyG = new THREE.Group();
    this.bodyG.position.y = -this.cy;
    this.shakeG.add(this.bodyG);
    const B = this.bodyG;

    for (const x of [-0.18, 0.18]) {
      const leg = T(new THREE.CapsuleGeometry(0.12, 0.22, 4, 8), C.wood);
      leg.position.set(x * s, 0.24 * s, 0);
      leg.scale.setScalar(s);
      B.add(leg);
      const foot = T(new THREE.SphereGeometry(0.15, 10, 8), C.wood);
      foot.scale.set(s, 0.6 * s, 1.3 * s);
      foot.position.set(x * s, 0.07 * s, 0.05 * s);
      B.add(foot);
    }
    const body = T(new THREE.CapsuleGeometry(0.42, 0.5, 6, 14), C.body);
    body.position.y = 0.98 * s; body.scale.setScalar(s);
    B.add(body);
    const belt = T(new THREE.TorusGeometry(0.42, 0.045, 6, 20), C.rope);
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.72 * s; belt.scale.setScalar(s);
    B.add(belt);
    // chest target
    const disc = (r, c, z) => {
      const d = T(new THREE.CylinderGeometry(r, r, 0.04, 24), c, { outline: false, rim: 0.2 });
      d.rotation.x = Math.PI / 2;
      d.position.set(0, 1.04 * s, z * s);
      d.scale.setScalar(s);
      B.add(d);
    };
    disc(0.27, C.tA, 0.40); disc(0.185, C.tB, 0.415); disc(0.09, C.tA, 0.43);
    // scarecrow arms
    const arms = T(new THREE.CapsuleGeometry(0.1, 1.15, 4, 8), C.wood);
    arms.rotation.z = Math.PI / 2; arms.position.y = 1.2 * s; arms.scale.setScalar(s);
    B.add(arms);
    for (const x of [-0.72, 0.72]) {
      const hand = T(new THREE.SphereGeometry(0.13, 10, 8), C.body);
      hand.position.set(x * s, 1.2 * s, 0); hand.scale.setScalar(s);
      B.add(hand);
    }
    // head
    this.headG = new THREE.Group();
    this.headG.position.y = 1.62 * s;
    B.add(this.headG);
    const head = T(new THREE.SphereGeometry(0.3, 16, 12), C.head);
    head.scale.setScalar(s);
    this.headG.add(head);
    if (heavy) {
      const helm = T(new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0x5b6385, { spec: 0.6 });
      helm.scale.setScalar(s); helm.position.y = 0.03 * s;
      this.headG.add(helm);
      const crest = T(new THREE.BoxGeometry(0.06, 0.2, 0.5), C.rope, { spec: 0.6 });
      crest.position.y = 0.33 * s; crest.scale.setScalar(s);
      this.headG.add(crest);
      for (const x of [-0.62, 0.62]) {
        const pad = T(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x5b6385, { spec: 0.6 });
        pad.position.set(x * s, 1.3 * s, 0); pad.scale.setScalar(s);
        B.add(pad);
      }
    } else {
      const tuft = T(new THREE.ConeGeometry(0.1, 0.22, 6), 0xf2d68e);
      tuft.position.set(0, 0.32 * s, 0); tuft.scale.setScalar(s);
      this.headG.add(tuft);
    }
    // eyes (normal + X)
    this.eyesN = new THREE.Group();
    this.eyesX = new THREE.Group();
    this.headG.add(this.eyesN, this.eyesX);
    for (const x of [-0.11, 0.11]) {
      const e = T(new THREE.CapsuleGeometry(0.035, 0.07, 4, 8), C.eye, { outline: false, rim: 0 });
      e.position.set(x * s, 0.02 * s, 0.27 * s); e.scale.setScalar(s);
      this.eyesN.add(e);
      for (const r of [0.8, -0.8]) {
        const b = T(new THREE.BoxGeometry(0.035, 0.13, 0.03), C.eye, { outline: false, rim: 0 });
        b.position.set(x * s, 0.03 * s, 0.275 * s); b.rotation.z = r; b.scale.setScalar(s);
        this.eyesX.add(b);
      }
    }
    this.eyesX.visible = false;
    this.root.traverse((o) => { o.frustumCulled = false; });
  }

  get airborne() { return this.state === 'air'; }

  /** Center of mass in world space. */
  center(out = new THREE.Vector3()) {
    this.pivot.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.pivot.matrixWorld);
  }

  /** Surface point facing `from`, around chest height – for spawning hit effects. */
  surfacePoint(from, out = new THREE.Vector3()) {
    this.center(out);
    _v.subVectors(from, out); _v.y = 0;
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
    _v.normalize();
    out.addScaledVector(_v, this.radius * 0.9);
    out.y = THREE.MathUtils.clamp(from.y, this.pos.y + 0.4 * this.s, this.pos.y + this.height * 0.85);
    if (this.state === 'down' || this.state === 'getup') out.y = this.pos.y + this.radius * 0.8;
    return out;
  }

  /**
   * h: { dir (unit, world), kb (m/s horizontal), lift (m/s up), hitstop (s), stun (s),
   *      launch (bool), spin, flash: [r,g,b] }
   */
  takeHit(h) {
    G.iceHit?.(this, h);
    const T = G.time;
    this.lastHit = T;
    this.hitstop = Math.max(this.hitstop, h.hitstop ?? 0.06);
    this.hitstopMax = this.hitstop;
    this.shakeDir.copy(h.dir);
    this.flashT = 0.045;
    this.hurtT = 0.3;
    this.stunEyes = 0.6;
    const frozen = this.status.freeze > 0;
    let kb = (h.kb ?? 3) / this.mass;
    let lift = (h.lift ?? 0) / (this.heavy ? 3.5 : 1);
    if (frozen && !h.shatter) { kb *= 0.2; lift *= 0.1; }
    if (this.heavy && lift < 6) lift = 0;
    const toAtt = Math.atan2(-h.dir.x, -h.dir.z);
    if (this.state !== 'air') this.yaw = toAtt;
    this.pending = { kb, lift, dir: h.dir.clone(), spin: h.spin ?? 1, pull: h.pull, set: h.set };
    // stagger lean (away from the hit, i.e. backward)
    const lean = Math.min(1.4, 0.25 + kb * 0.06) * (this.heavy ? 0.5 : 1);
    this.pitchV -= lean * 14;
    this.rollV += (Math.random() - 0.5) * lean * 10;
    this.squashV -= 2.6 * (h.squash ?? 1);
  }

  update(dt) {
    const T = G.time;
    this.stateT += dt;
    // flash / hurt tint
    if (this.flashT > 0) { this.flashT -= dt; this.flash.value.set(1, 0.97, 0.94, 0.9); }
    else if (this.hurtT > 0) { this.hurtT -= dt; this.flash.value.set(1, 0.3, 0.25, (this.hurtT / 0.3) * 0.45); }
    else if (this.status.freeze > 0) this.flash.value.set(0.6, 0.9, 1.2, 0.45);
    else this.flash.value.w = 0;
    this.stunEyes -= dt;
    this.updateStatus(dt);
    this.eyesX.visible = this.stunEyes > 0 || this.state === 'down';
    this.eyesN.visible = !this.eyesX.visible;

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      const k = Math.max(0, this.hitstop / this.hitstopMax);
      const sh = Math.sin(T * 110) * 0.07 * k * this.s;
      this.shakeG.position.set(0, 0, 0).addScaledVector(this.shakeDir, sh);
      this.shakeG.position.applyAxisAngle(UP, -this.yaw);
      this.syncVisual();
      return;
    }
    if (!(this.status.shock > 0)) this.shakeG.position.set(0, 0, 0);

    if (this.status.freeze > 0) {
      this.status.freeze -= dt;
      if (this.pending) { this.pending = null; }
      this.syncVisual();
      return;
    }

    if (this.pending) {
      const p = this.pending; this.pending = null;
      if (p.set) {
        this.vel.copy(p.set);
        if (p.set.y > 0.5) this.enterAir(p.spin);
      } else if (this.state === 'air' || p.lift > 3.5) {
        // juggle: replace vertical, add horizontal
        this.vel.x = this.vel.x * 0.3 + p.dir.x * p.kb;
        this.vel.z = this.vel.z * 0.3 + p.dir.z * p.kb;
        this.vel.y = Math.max(p.lift, this.state === 'air' ? 2.5 : 0);
        if (this.state !== 'air') this.enterAir(p.spin);
        else this.spin += p.spin * 3;
      } else {
        this.vel.x += p.dir.x * p.kb; this.vel.z += p.dir.z * p.kb;
        if (this.state === 'down') { /* hit while down: slide */ }
        else if (p.kb > 9 && !this.heavy) { this.vel.y = 3 + p.kb * 0.15; this.enterAir(p.spin * 0.6); }
        else this.setState('stagger');
      }
    }

    const grounded = this.state !== 'air';
    if (this.state === 'air') {
      this.airTime += dt;
      const g = (this.vel.y > -2 && this.vel.y < 3 ? 18 : 30) * this.juggleGrav;
      this.vel.y -= g * dt;
      this.vel.x *= Math.exp(-dt * 0.6); this.vel.z *= Math.exp(-dt * 0.6);
      this.pos.addScaledVector(this.vel, dt);
      this.pitch -= this.spin * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        const impact = -this.vel.y;
        if (impact > 8 && this.bounces < 1) {
          this.bounces++;
          this.vel.y = impact * 0.32;
          this.vel.x *= 0.55; this.vel.z *= 0.55;
          this.spin *= 0.5;
          this.onGroundImpact(impact, true);
        } else {
          this.onGroundImpact(impact, false);
          this.vel.y = 0;
          this.setState('down');
          // settle into lying on the back
          this.pitch = wrapPi(this.pitch);
        }
      }
    } else {
      const fr = this.state === 'down' ? 5 : 7.5;
      this.vel.x *= Math.exp(-dt * fr); this.vel.z *= Math.exp(-dt * fr);
      this.vel.y = 0;
      this.pos.addScaledVector(this.vel, dt);
      // sliding dust
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 4 && Math.random() < dt * 40) G.fxp?.slideDust(this.pos, this.vel, this.s);
    }

    // arena wall
    const r = Math.hypot(this.pos.x, this.pos.z);
    const lim = ARENA_R + 1.6;
    if (r > lim) {
      _v.set(this.pos.x / r, 0, this.pos.z / r);
      this.pos.x = _v.x * lim; this.pos.z = _v.z * lim;
      const vn = this.vel.dot(_v);
      if (vn > 0) {
        this.vel.addScaledVector(_v, -vn * 1.5);
        if (vn > 6) G.fxp?.wallSplat(this.pos.clone().setY(this.pos.y + this.cy), _v, vn);
      }
    }

    // state logic
    switch (this.state) {
      case 'stagger':
        if (this.stateT > 0.35) this.setState('idle');
        break;
      case 'down':
        this.pitch += (-Math.PI / 2 - this.pitch) * Math.min(1, dt * 18);
        if (this.stateT > 1.05) this.setState('getup');
        break;
      case 'getup':
        this.pitch += (0 - this.pitch) * Math.min(1, dt * 9);
        if (this.stateT > 0.45) { this.pitch = 0; this.setState('idle'); }
        break;
      case 'idle': {
        _v.subVectors(this.home, this.pos); _v.y = 0;
        const d = _v.length();
        if (d > 0.6 && T - this.lastHit > 1.6) {
          _v.normalize();
          const sp = Math.min(3.2, d * 2.5);
          this.pos.addScaledVector(_v, sp * dt);
          this.yaw = this.turnTo(this.yaw, Math.atan2(_v.x, _v.z), dt * 8);
          this.hop = (this.hop ?? 0) + dt * 9;
        } else {
          const p = G.player?.pos;
          if (p && T - this.lastHit > 0.8) this.yaw = this.turnTo(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), dt * 2);
          this.hop = 0;
        }
        break;
      }
    }

    // springs (stagger lean, squash)
    if (this.state === 'idle' || this.state === 'stagger') {
      this.pitchV += (-this.pitch * 160) * dt; this.pitchV *= Math.exp(-dt * 11);
      this.pitch += this.pitchV * dt;
      this.rollV += (-this.roll * 160) * dt; this.rollV *= Math.exp(-dt * 11);
      this.roll += this.rollV * dt;
    } else if (this.state === 'air') {
      this.roll *= Math.exp(-dt * 4);
    }
    this.squashV += (1 - this.squash) * 260 * dt; this.squashV *= Math.exp(-dt * 13);
    this.squash += this.squashV * dt;
    this.syncVisual();
  }

  updateStatus(dt) {
    const st = this.status;
    G.iceTick?.(this, dt);
    if (st.shock > 0 && dt > 0) {
      st.shock -= dt;
      this.shockFx = (this.shockFx ?? 0) - dt;
      if (this.shockFx <= 0) {
        this.shockFx = 0.08 + Math.random() * 0.06;
        G.arcs?.(this.center(_v), this.radius * 1.3 * this.s, 1, 0.07);
      }
      if (this.flashT <= 0 && Math.random() < 0.3) this.flash.value.set(0.7, 0.9, 1.6, 0.35);
      this.shakeG.position.set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
    }
    if (st.burn > 0 && dt > 0) {
      st.burn -= dt;
      this.burnT = (this.burnT ?? 0) - dt;
      this.burnFx = (this.burnFx ?? 0) - dt;
      if (this.burnFx <= 0) {
        this.burnFx = 0.05;
        const c = this.center(_v);
        const q = c.add(_v2.set((Math.random() - 0.5) * this.radius * 1.6, (Math.random() - 0.3) * this.height * 0.6, (Math.random() - 0.5) * this.radius * 1.6));
        G.fx.puffs.emit({ pos: q, vel: new THREE.Vector3((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), size: 0.12 * this.s, sizeEnd: 0.03, life: 0.45, mode: 1, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: 1.05, drag: 2, rise: 3, dissolveStart: 0.3, grow: 'in' });
        if (Math.random() < 0.3) G.fx.add.emit({ pos: q, vel: new THREE.Vector3(0, 2.5, 0), shape: 1, size: 0.05, sizeEnd: 0, life: 0.6, color: [4, 1.8, 0.4], alphaEnd: 0.3 });
      }
      if (this.burnT <= 0) {
        this.burnT = 0.4;
        if (this.flashT <= 0) this.hurtT = Math.max(this.hurtT, 0.12);
        G.hud?.damage(this.center(_v), 8 + Math.round(Math.random() * 6));
      }
    }
  }

  turnTo(a, b, k) { return a + wrapPi(b - a) * Math.min(1, k); }

  enterAir(spin = 1) {
    this.setState('air');
    this.bounces = 0;
    this.airTime = 0;
    this.spin = (5 + Math.random() * 4) * spin;
  }

  setState(s) { this.state = s; this.stateT = 0; }

  onGroundImpact(speed, bounce) {
    const p = this.pos.clone();
    G.fxp?.bodyLand(p, speed, this.s);
    if (speed > 10) G.rig?.shake(0.12 * Math.min(2, speed / 14));
    G.audio?.play('thud', { pos: p, vol: Math.min(1, speed / 14) });
  }

  syncVisual() {
    this.root.position.copy(this.pos);
    this.yawG.rotation.y = this.yaw;
    // lying: lower the pivot so the body rests on the ground
    const lie = Math.min(1, Math.abs(Math.sin(this.pitch)));
    const hop = this.hop ? Math.abs(Math.sin(this.hop)) * 0.18 * this.s : 0;
    this.pivot.position.y = this.cy * (1 - lie) + this.radius * 0.85 * lie + hop;
    this.pivot.rotation.set(this.pitch, 0, this.roll);
    const sq = this.squash;
    this.shakeG.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  }

  reset() {
    this.pos.copy(this.home); this.vel.set(0, 0, 0);
    this.state = 'idle'; this.pitch = 0; this.roll = 0; this.pending = null; this.hitstop = 0;
    this.status.freeze = 0; this.status.burn = 0; this.status.shock = 0;
    if (this.iceMesh) { this.root.remove(this.iceMesh); this.iceMesh = null; }
    this.syncVisual();
  }
}

export class DummyManager {
  constructor(scene) {
    this.list = [];
    const spots = [
      [0, 0, 6.5], [-3.2, 0, 7.8], [3.2, 0, 7.8], [-6.0, 0, 10.5], [6.0, 0, 10.5], [0, 0, 22],
    ];
    for (const [x, y, z] of spots) this.add(scene, new THREE.Vector3(x, y, z));
    this.add(scene, new THREE.Vector3(0, 0, 12.5), { heavy: true });
  }
  add(scene, pos, opts) {
    const d = new Dummy(pos, opts);
    this.list.push(d);
    scene.add(d.root);
    d.syncVisual();
    return d;
  }
  update(dt) {
    for (const d of this.list) d.update(dt);
    // soft separation
    const L = this.list;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = a.radius + b.radius;
      if (d < min && d > 1e-4 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
        const push = (min - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        a.pos.x -= nx * push * 2 * wa; a.pos.z -= nz * push * 2 * wa;
        b.pos.x += nx * push * 2 * wb; b.pos.z += nz * push * 2 * wb;
      }
    }
  }
  reset() { for (const d of this.list) d.reset(); }
}
