// 빛 마법 「성광」 — a fan of holy lances, and a charged holy beam.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MagicWeapon, after } from './magic.js';
import { FXP, rand, cone, randUnit } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { clamp01, easing } from '../entities/pose.js';
import { hit, segmentQuery } from '../combat/combat.js';
import { toonMesh } from '../render/toon.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
const GOLD = [2.2, 1.6, 0.6];
const lanceGeo = (() => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.09, 0.95, 0.09); return g; })();

/** Holy impact: gold star + cross + ring + drifting feathers of light. */
export function holyBurst(p, s = 1) {
  const fx = G.fx;
  fx.add.emit({ pos: p, shape: SHAPE.CROSS, size: 2.6 * s, sizeEnd: 1.2 * s, life: 0.2, color: [3, 2.6, 1.6], alphaEnd: 0 });
  fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 1.6 * s, sizeEnd: 0.1, life: 0.12, color: [3.2, 2.8, 1.8], alphaEnd: 0, rot: 0.785 });
  fx.add.emit({ pos: p, shape: SHAPE.GLOW, size: 1.2 * s, sizeEnd: 1.8 * s, life: 0.16, color: [1.4, 1.0, 0.4], alpha: 0.8, alphaEnd: 0 });
  fx.ring({ pos: p, billboard: true, r0: 0.1, r1: 1.4 * s, w0: 0.08, w1: 0.012, color: [1.8, 1.4, 0.7], life: 0.2, sharp: 1 });
  for (let i = 0; i < 10; i++) {
    randUnit(_v2);
    fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(2, 5) * s), shape: SHAPE.DIAMOND, size: rand(0.06, 0.12), sizeEnd: 0, life: rand(0.6, 1.1), color: [2.4, 2, 1], alphaEnd: 0, drag: 3, gravity: -0.6, rotVel: rand(-4, 4) });
  }
  for (let i = 0; i < 8; i++) {
    randUnit(_v2);
    fx.add.emit({ pos: p, vel: _v2.multiplyScalar(rand(6, 14) * s), shape: SHAPE.STREAK, size: 0.04, stretch: 0.03, life: rand(0.12, 0.25), color: [3, 2.4, 1.2], alphaEnd: 0, drag: 5 });
  }
  fx.light(p, [1, 0.85, 0.5], 2.2, 5 * s, 0.18);
}

export class LightMagic extends MagicWeapon {
  constructor() {
    super([2.0, 1.6, 0.7], 0xffe27a);
    this.id = 'light';
    this.name = '빛 마법 「성광」';
    this.short = '빛';
    this.icon = '光';
    this.desc = '<b>좌클릭</b> 성창 일제 투척 (5연) · <b>우클릭 꾹</b> 차지 → 성광포 (관통 빔)';
    this.cool = 0;
  }
  press(p, btn) {
    if (btn === 0) { this.want = true; return; }
    if (p.action && !p.action.cancelable?.('shoot')) return;
    if (p.action) p.endAction();
    p.startAction(new BeamAction(this));
  }
  hold(p, btn) { if (btn === 0) this.want = true; }
  release(p, btn) { if (btn === 1 && p.action instanceof BeamAction) p.action.release(); }
  tick(p, dt) {
    this.cool -= dt;
    if (this.want && this.cool <= 0 && (!p.action || p.action.cancelable?.('shoot'))) { if (p.action) p.endAction(); this.lances(p); }
    this.want = false;
  }

  lances(p) {
    this.cool = 0.75; this.aimT = 1.0; this.castK = 1.2; this.castSide = 0;
    const tgt = this.aimTargetDummy();
    const fwd = p.forward(new THREE.Vector3()), right = p.right(new THREE.Vector3());
    G.audio?.play('holy');
    for (let i = 0; i < 5; i++) {
      const k = i - 2;
      const off = new THREE.Vector3().addScaledVector(right, k * 0.95).addScaledVector(UP, 2.3 + (2 - Math.abs(k)) * 0.4).addScaledVector(fwd, -0.6 + Math.abs(k) * 0.15);
      const mesh = toonMesh(lanceGeo, { color: 0xffe9a0, emissive: 1.4, rim: 1, outlineWidth: 1.3, outlineColor: 0x5a3a10 });
      const halo = toonMesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), { color: 0xffe27a, emissive: 1.2, outline: false });
      halo.position.y = -0.5; halo.rotation.x = Math.PI / 2;
      mesh.add(halo);
      mesh.scale.setScalar(0.01);
      G.scene.add(mesh);
      const spawnT = i * 0.035, launchT = 0.22 + i * 0.06;
      const state = { t: 0, launched: false };
      const home = () => p.pos.clone().add(off);
      // appear
      after(spawnT + 0.0001, () => {
        const h = home();
        G.fx.add.emit({ pos: h, shape: SHAPE.STAR, size: 1.0, sizeEnd: 0, life: 0.15, color: [3, 2.5, 1.4], alphaEnd: 0 });
        G.fx.ring({ pos: h, billboard: true, r0: 0.05, r1: 0.35, w0: 0.1, w1: 0.02, color: [1.0, 0.75, 0.35], life: 0.14, sharp: 1 });
      });
      G.fx.spawn(new THREE.Object3D(), launchT, (e) => {
        if (e.t < spawnT) return;
        const h = home();
        mesh.position.copy(h);
        const k2 = Math.min(1, (e.t - spawnT) / 0.08);
        mesh.scale.setScalar(Math.max(0.01, easing.outBack(k2)));
        const aim = tgt ? tgt.center(_v2) : this.aimPoint;
        _v.subVectors(aim, h).normalize();
        mesh.quaternion.setFromUnitVectors(Y, _v);
      }, G.scene, {
        onEnd: () => {
          const from = mesh.position.clone();
          const aim = tgt ? tgt.center(new THREE.Vector3()) : this.aimPoint.clone();
          const dir = aim.sub(from).normalize();
          G.fx.add.emit({ pos: from, shape: SHAPE.FLARE, size: 1.4, w: 1, sizeEnd: 0.3, life: 0.08, color: [2.4, 2, 1], alphaEnd: 0 });
          G.audio?.play('lance', { pitch: 1 + i * 0.05 });
          G.projectiles.spawn({
            pos: from, vel: dir.multiplyScalar(58), life: 1.2, radius: 0.16, pierce: 1,
            steer: (pr, dt) => { if (tgt && pr.age < 0.3) { const w = _v.subVectors(tgt.center(_v2), pr.pos).normalize(); pr.vel.lerp(w.multiplyScalar(pr.vel.length()), Math.min(1, dt * 8)); } },
            render: (pr) => {
              mesh.position.copy(pr.pos);
              mesh.quaternion.setFromUnitVectors(Y, _v.copy(pr.vel).normalize());
              G.fx.add.emit({ pos: pr.pos, vel: pr.vel, shape: SHAPE.STREAK, size: 0.22, stretch: 0.02, life: 1 / 50, color: [1.8, 1.3, 0.5], alpha: 1, alphaEnd: 1 });
              if (Math.random() < 0.8) G.fx.add.emit({ pos: pr.pos.clone().add(randUnit(_v2).multiplyScalar(0.15)), vel: randUnit(_v2).multiplyScalar(0.6), shape: SHAPE.DIAMOND, size: rand(0.05, 0.09), sizeEnd: 0, life: rand(0.3, 0.6), color: [2.4, 2, 1], alphaEnd: 0, gravity: -0.5 });
            },
            onHit: (pr, d, point) => {
              holyBurst(point, 0.9);
              hit(d, { dir: pr.vel.clone().setY(0).normalize(), point, kb: 2.5, lift: d.airborne ? 3 : 1.2, hitstop: 0.06, atkStop: 0, shake: 0.08, kind: 'none', dmg: 105 + Math.round(Math.random() * 20), sound: 'lanceHit' });
            },
            onGround: (pr, point) => { holyBurst(point.clone().setY(0.2), 0.7); G.fx.decal({ pos: point, size: 1.2, type: 4, color: [1.4, 1.1, 0.4], life: 1.2, additive: true }); },
            onDead: () => mesh.parent?.remove(mesh),
          });
        },
      });
    }
  }

  aimTargetDummy() {
    const cam = G.rig.camera, o = cam.position, d = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bestA = 0.08;
    for (const du of G.dummies.list) {
      const c = du.center(new THREE.Vector3());
      if (c.distanceTo(G.player.pos) > 40) continue;
      const ang = 1 - c.sub(o).normalize().dot(d);
      if (ang < bestA) { bestA = ang; best = du; }
    }
    return best;
  }
}

// ── Holy beam ─────────────────────────────────────────────────────────────────
class BeamAction {
  constructor(w) {
    this.w = w; this.dur = 99; this.moveScale = 0.12; this.legs = false; this.faceMove = false;
    this.phase = 'charge'; this.charge = 0; this.emitT = 0; this.tick = 0;
    this.cam = { dist: 6.0 };
  }
  start() {
    this.ballPos = this.hands(); this.ballR = 0.05;
    this.ball = G.fx.sphere({ pos: this.ballPos, r0: 0.05, r1: 0.05, color: [1.6, 1.1, 0.4], coreColor: [3, 2.7, 2], life: 99, power: 1.2, core: 1.4, noise: 0.5, alphaCurve: () => 1, follow: (m) => { m.position.copy(this.ballPos); m.scale.setScalar(this.ballR); } });
    this.circles = [];
    G.audio?.play('charge', { pitch: 1.2 });
  }
  hands() {
    const p = this.player;
    return p.model.handR.getWorldPosition(new THREE.Vector3()).add(p.model.handL.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5).addScaledVector(p.forward(_v2), 0.25);
  }
  aimDir(from) { return _v.subVectors(this.w.aimPoint, from).normalize().clone(); }
  update(dt) {
    const p = this.player, w = this.w, fx = G.fx;
    w.aimT = 0.5;
    const hp = this.hands();
    if (this.phase === 'charge') {
      this.charge = Math.min(1, this.t / 1.1);
      const r = 0.1 + this.charge * 0.18 + Math.sin(G.time * 30) * 0.015;
      this.ballPos.copy(hp); this.ballR = r;
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = 0.012;
        const q = hp.clone().add(randUnit(_v).multiplyScalar(rand(1.0, 1.8)));
        fx.add.emit({ pos: q, vel: hp.clone().sub(q).multiplyScalar(1 / 0.2), shape: SHAPE.STREAK, size: 0.035, stretch: 0.04, life: 0.2, color: [2.4, 1.8, 0.8], alpha: 0, alphaEnd: 1 });
        if (Math.random() < 0.4) fx.add.emit({ pos: hp, shape: SHAPE.GLOW, size: 0.5 + this.charge * 0.5, sizeEnd: 0.15, life: 0.12, color: [0.8, 0.6, 0.25], alphaEnd: 0 });
      }
      // magic circles appear in front as charge grows
      const dir = this.aimDir(hp);
      const need = this.charge > 0.75 ? 3 : this.charge > 0.4 ? 2 : this.charge > 0.05 ? 1 : 0;
      while (this.circles.length < need) {
        const i = this.circles.length;
        const c = fx.decal({ pos: new THREE.Vector3(), size: 0.42 + i * 0.2, type: 3, color: [1.3, 0.95, 0.38], life: 99, spin: i % 2 ? -2 : 2, reveal: 0.15, additive: true });
        c.obj.rotation.set(0, 0, 0);
        this.circles.push(c);
        G.audio?.play('chargeLvl', { pitch: 1 + i * 0.25 });
      }
      this.placeCircles(hp, dir);
      if (this.t > 1.5) this.release();
    } else if (this.phase === 'fire') {
      this.fireT += dt;
      const dir = this.aimDir(hp);
      this.ballPos.copy(hp);
      this.placeCircles(hp, dir);
      const len = this.beamLen(hp, dir);
      const pulse = 1 + Math.sin(G.time * 45) * 0.06;
      const kOut = this.fireT > this.fireDur - 0.15 ? Math.max(0, (this.fireDur - this.fireT) / 0.15) : Math.min(1, this.fireT / 0.06);
      const R = this.R * kOut * pulse;
      _q.setFromUnitVectors(Y, dir);
      for (const [b, rs] of this.beams) {
        b.mesh.position.copy(hp);
        b.mesh.quaternion.copy(_q);
        b.mesh.scale.set(R * rs, len, R * rs);
        b.u.uTime.value = G.time;
        b.u.uLen.value = len;
      }
      const end = hp.clone().addScaledVector(dir, len);
      // traveling rings + end splash
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = 0.045;
        fx.ring({ pos: hp.clone().addScaledVector(dir, 0.6), normal: dir, r0: R * 0.9, r1: R * 2.2, w0: 0.06, w1: 0.015, color: [0.7, 0.5, 0.2], life: 0.25, sharp: 1, easing: (k) => k });
        fx.add.emit({ pos: end, shape: SHAPE.STAR, size: 2.0 * this.R, sizeEnd: 0.4, life: 0.08, color: [2.2, 1.9, 1.2], alphaEnd: 0, rot: Math.random() });
        for (let i = 0; i < 4; i++) {
          randUnit(_v2).addScaledVector(dir, -1.2).normalize();
          fx.add.emit({ pos: end, vel: _v2.multiplyScalar(rand(8, 18)), shape: SHAPE.STREAK, size: 0.05, stretch: 0.03, life: rand(0.15, 0.35), color: [3, 2.4, 1], alphaEnd: 0, drag: 3, gravity: 8 });
        }
        for (let i = 0; i < 3; i++) {
          const q = hp.clone().addScaledVector(dir, rand(0.5, len));
          fx.add.emit({ pos: q.add(randUnit(_v2).multiplyScalar(R * 1.5)), vel: dir.clone().multiplyScalar(rand(6, 14)), shape: SHAPE.DIAMOND, size: rand(0.06, 0.12), sizeEnd: 0, life: rand(0.3, 0.6), color: [2.4, 2, 1], alphaEnd: 0, drag: 2 });
        }
        if (end.y < 0.3) fx.decal({ pos: end, size: 1.6 * this.R, type: 0, color: [3, 2.2, 0.8], glow: 1.5, life: 3 });
      }
      this.splash.p.copy(end);
      this.srcLight.p.copy(hp);
      G.rig.shake(0.012 + this.R * 0.012);
      // hits along the beam
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = 0.08;
        const ex = new Set();
        let r = segmentQuery(hp, end, R * 0.9, ex);
        while (r) {
          ex.add(r.d);
          hit(r.d, { dir: dir.clone().setY(0).normalize(), fxDir: dir, point: r.point, kb: 4 + this.R * 2, lift: 1.5, hitstop: 0.03, shake: 0, kind: 'none', dmg: 40 + Math.round(Math.random() * 10), sound: null });
          holyBurst(r.point, 0.6);
          r = segmentQuery(hp, end, R * 0.9, ex);
        }
      }
      if (this.fireT >= this.fireDur) this.finish();
    }
  }
  beamLen(hp, dir) {
    let len = 45;
    if (dir.y < -1e-3) len = Math.min(len, -hp.y / dir.y);
    return Math.max(0.5, len);
  }
  placeCircles(hp, dir) {
    _q.setFromUnitVectors(Y, dir);
    this.circles.forEach((c, i) => {
      c.obj.position.copy(hp).addScaledVector(dir, 0.45 + i * 0.5);
      c.obj.quaternion.copy(_q);
    });
  }
  release() {
    if (this.phase !== 'charge') return;
    const c = Math.max(0.25, this.charge);
    this.phase = 'fire';
    this.fireT = 0;
    this.fireDur = 0.6 + c * 0.9;
    this.R = 0.25 + c * 0.3;
    this.w.castK = 2;
    this.beams = [
      [G.fx.beamMesh({ color: [1.8, 1.4, 0.6], core: [2.6, 2.4, 2.0], power: 0.8, noise: 0.4, scroll: 40 }), 0.38],
      [G.fx.beamMesh({ color: [1.2, 0.75, 0.2], core: [1.6, 1.2, 0.6], power: 1.5, noise: 0.85, scroll: 26, alpha: 0.75 }), 0.85],
      [G.fx.beamMesh({ color: [0.45, 0.25, 0.06], core: [0.6, 0.4, 0.12], power: 2.2, noise: 1.0, scroll: 14, alpha: 0.5 }), 1.45],
    ];
    for (const [b] of this.beams) G.scene.add(b.mesh);
    this.splash = G.fx.light(new THREE.Vector3(), [1, 0.8, 0.4], 3, 8, 0);
    this.srcLight = G.fx.light(new THREE.Vector3(), [1, 0.8, 0.4], 2.5, 6, 0);
    const hp = this.hands();
    const dir = this.aimDir(hp);
    G.fx.add.emit({ pos: hp, shape: SHAPE.STAR, size: 2.6 * c + 0.6, sizeEnd: 0.3, life: 0.16, color: [2.6, 2.2, 1.4], alphaEnd: 0 });
    G.fx.ring({ pos: hp, normal: dir, r0: 0.2, r1: 1.5 + c, w0: 0.08, w1: 0.012, color: [1.2, 0.9, 0.4], life: 0.26, sharp: 1 });
    G.fx.distort({ pos: hp, r0: 0.3, r1: 5, strength: 0.04, life: 0.35 });
    G.screen.flash([1, 0.9, 0.7], 0.07, 0.07);
    G.screen.radial(0.6, 0.4);
    G.rig.fovPunch(5); G.rig.shake(0.3);
    this.player.vel.addScaledVector(dir.clone().setY(0).normalize(), -4);
    G.audio?.play('beam', { pitch: 1.1 - c * 0.2 });
  }
  finish() {
    const hp = this.hands();
    G.fx.add.emit({ pos: hp, shape: SHAPE.GLOW, size: 2, sizeEnd: 0.1, life: 0.2, color: [1.6, 1.2, 0.5], alphaEnd: 0 });
    this.player.endAction();
  }
  pose(P, t) {
    const p = this.player, w = this.w;
    w.castPose(P, p, easing.outCubic(clamp01(t / 0.15)), 0, true);
    // bring the palms together
    const mid = P.handR.clone().add(P.handL).multiplyScalar(0.5);
    P.handR.lerp(mid, 0.75); P.handL.lerp(mid, 0.75);
    P.handR.x -= 0.06; P.handL.x += 0.06;
    P.hip.y = 0.78; P.footR.set(-0.2, 0, -0.3); P.footL.set(0.2, 0, 0.32);
    if (this.phase === 'fire') { P.lean = -0.08; P.hip.z = -0.05; }
  }
  cancelable(kind) { return kind === 'dash' && this.phase === 'charge'; }
  end() {
    if (this.ball) this.ball.t = this.ball.life;
    for (const c of this.circles) c.t = c.life;
    if (this.beams) for (const [b] of this.beams) b.mesh.parent?.remove(b.mesh);
    if (this.splash) { this.splash.max = 0.001; this.splash.life = 1; }
    if (this.srcLight) { this.srcLight.max = 0.001; this.srcLight.life = 1; }
  }
}
