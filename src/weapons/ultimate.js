// Ultimates (F): cut-in → cinematic, slow-motion finishers.
//   melee  「무영참」  phantom dash through every target, then delayed cuts
//   guns   「데드아이」 mark targets in slow time, fire, time resumes
//   magic  「메테오」  a burning meteor from a sky circle
import * as THREE from 'three';
import { G } from '../ctx.js';
import { FXP, rand, cone, randUnit, screenAngle } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { PUFF } from '../vfx/puffs.js';
import { bladeQuat, clamp01, easing } from '../entities/pose.js';
import { hit } from '../combat/combat.js';
import { toonMesh } from '../render/toon.js';
import { Time } from '../core/time.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CUTIN = 1.05; // real seconds the cut-in holds time

export const ULT_COOLDOWN = 4;

/** Show the cut-in band and near-freeze time while it plays. */
export function cutIn(title, sub, accent = '#ffe27a') {
  G.hud.startCutin(title, sub, accent, CUTIN + 0.1);
  G.slowmo(0.02, CUTIN - 0.05, 0.05, 0.01);
  G.screen.dim(0.7);
  G.screen.letterbox(true);
  G.screen.speedLines(0.7, CUTIN);
  G.audio?.play('ult');
}

function endCinematic() {
  G.screen.dim(0);
  G.screen.letterbox(false);
  G.rig.cine = null;
}

function setCine(pos, look, fov = 55, blendSpeed = 6) {
  G.rig.cine = { pos: pos.clone(), look: look.clone(), fov, w: 1, blendSpeed };
}

const hex = (c) => '#' + new THREE.Color(Math.min(1, c[0] / 2.5), Math.min(1, c[1] / 2.5), Math.min(1, c[2] / 2.5)).getHexString();

function nearestTargets(p, n, range) {
  return G.dummies.list
    .map((d) => ({ d, dist: d.pos.distanceTo(p.pos) }))
    .filter((x) => x.dist < range)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((x) => x.d);
}

class UltBase {
  constructor(w) {
    this.w = w; this.dur = 99; this.moveScale = 0; this.ownsVelocity = true; this.legs = true; this.faceMove = false;
    this.isUlt = true;
    this.ownsFacing = true;
  }
  get rt() { return Time.real - this.real0; }
  cancelable() { return false; }
}

// ── Melee: 무영참 ──────────────────────────────────────────────────────────────
export class UltPhantom extends UltBase {
  start() {
    const p = this.player;
    this.real0 = Time.real;
    this.color = this.w.color ?? [0.4, 1.0, 2.6];
    cutIn('무영참', '無 影 斬', hex(this.color));
    this.targets = nearestTargets(p, 7, 20);
    this.i = 0; this.nextT = 0; this.phase = 'cut';
    this.cam = { dist: 7.5 };
    p.vel.set(0, 0, 0);
  }
  update(dt) {
    const p = this.player;
    if (this.phase === 'cut') {
      if (this.rt > CUTIN) {
        this.phase = 'dash'; G.screen.dim(0.5); this.lt = 0;
        const center = this.targets.reduce((a, d) => a.add(d.pos), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, this.targets.length));
        if (!this.targets.length) center.copy(p.pos).addScaledVector(p.forward(_v), 5);
        const back = p.pos.clone().sub(center).setY(0);
        if (back.lengthSq() < 0.01) back.set(0, 0, -1);
        back.normalize();
        const side = new THREE.Vector3(-back.z, 0, back.x);
        setCine(center.clone().addScaledVector(back, 9.5).addScaledVector(side, 3.5).add(_v.set(0, 4.2, 0)), center.clone().add(_v.set(0, 1.0, 0)), 52, 5);
      }
      return;
    }
    this.lt += dt;
    const col = this.color;
    if (this.phase === 'dash') {
      if (this.lt >= this.nextT) {
        if (this.i >= this.targets.length) { this.phase = 'still'; this.lt = 0; this.stillStart(); return; }
        const d = this.targets[this.i++];
        this.nextT = this.lt + 0.075;
        const from = p.pos.clone();
        const dir = _v.subVectors(d.pos, from).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
        const to = d.pos.clone().addScaledVector(dir, d.radius + 1.3); to.y = 0;
        G.fx.ghost(p.model.root, { color: col.map((x) => x * 0.15), rim: col, life: 0.4, alpha: 0.9 });
        G.fx.line({ a: from.clone().setY(1.1), b: to.clone().setY(1.1), width: 0.32, color: col, core: [3, 3, 3.4], coreWidth: 0.25, life: 0.5, headFade: 0.1, tailFade: 0.2 });
        p.pos.copy(to);
        p.yaw = Math.atan2(dir.x, dir.z);
        p.teleported();
        // a quick cut across the target, then freeze it in place
        const c = d.center(new THREE.Vector3());
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.6, 0.6), Math.atan2(dir.x, dir.z) + Math.PI / 2, rand(-0.8, 0.8)));
        G.fx.slash({ pos: c, quat: q, a0: -1.3, a1: 1.3, rIn: 0.6, rOut: 1.8, sweep: 0.05, hold: 0.4, fade: 0.2, color: col, core: [3, 3, 3.5], width: 0.3, tail: 1.2, cone: 0.05 });
        FXP.hitSlash(c, dir, new THREE.Vector3(-dir.z, 0, dir.x), col, 0.8);
        d.hitstop = 6; d.hitstopMax = 60; d.flashT = 0.05; d.stunEyes = 3;
        G.hud.damage(c, 99); G.hud.combo();
        G.rig.shake(0.08);
        G.audio?.play('hitSlash', { pitch: 1.2 + this.i * 0.05, vol: 0.7 });
        G.audio?.play('blink', { vol: 0.4 });
      }
    } else if (this.phase === 'still') {
      if (this.lt > 0.55 && !this.burst) { this.burst = true; this.doBurst(); }
      if (this.lt > 1.25) { endCinematic(); p.endAction(); }
    }
  }
  stillStart() {
    const p = this.player;
    G.screen.dim(0.6);
    G.slowmo(0.35, 0.5, 0.1);
    G.audio?.play('sheath');
    // the "click" of the sheath: a thin glint
    G.fx.add.emit({ pos: p.model.handR.getWorldPosition(new THREE.Vector3()), shape: SHAPE.STAR, size: 1.4, sizeEnd: 0, life: 0.25, color: [3, 3, 3.4], alphaEnd: 0 });
  }
  doBurst() {
    const col = this.color;
    G.screen.impact(0.07, true, [1, 0.96, 0.95]);
    G.screen.dim(0);
    G.screen.flash([1, 1, 1], 0.2, 0.1);
    G.slowmo(0.2, 0.35, 0.4);
    G.rig.shake(0.8); G.rig.fovPunch(6);
    G.screen.chroma(0.02, 0.4);
    G.audio?.play('hitSlashBig'); G.audio?.play('ultBoom');
    for (const d of this.targets) {
      const c = d.center(new THREE.Vector3());
      d.hitstop = 0;
      // crossing giant slashes + scattered cut lines
      for (const r of [0.8, -0.8]) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(c.x - G.rig.camera.position.x, c.z - G.rig.camera.position.z) + Math.PI / 2, r));
        G.fx.slash({ pos: c, quat: q, a0: -1.6, a1: 1.6, rIn: 0.5, rOut: 2.6, sweep: 0.06, hold: 0.08, fade: 0.3, color: col, core: [3.5, 3.5, 4], width: 0.45, tail: 1.2, cone: 0.05 });
      }
      for (let k = 0; k < 6; k++) {
        const dir = randUnit(new THREE.Vector3());
        G.fx.line({ a: c.clone().addScaledVector(dir, -2.2), b: c.clone().addScaledVector(dir, 2.2), width: 0.1, color: col, core: [3, 3, 3], coreWidth: 0.4, life: 0.25, headFade: 0.3, tailFade: 0.3 });
      }
      const away = new THREE.Vector3(d.pos.x - this.player.pos.x, 0, d.pos.z - this.player.pos.z).normalize();
      hit(d, { dir: away, kb: 14, lift: 11, hitstop: 0.1, shake: 0, kind: 'slash', color: col, tangent: new THREE.Vector3(-away.z, 0, away.x), dmg: 999, crit: true, fxScale: 1.6, sound: null, spin: 2 });
    }
  }
  pose(P, t) {
    if (this.phase === 'still' || this.phase === 'end') {
      // blade lowered after the strike, body straight
      P.handR.set(0.15, 0.95, 0.3);
      bladeQuat(P.wR, _v.set(-0.6, -0.2, -1), _v2.set(0, -1, 0));
      P.handL.set(0.25, 0.92, 0.18);
      P.lean = 0.05; P.hip.y = 0.84; P.headPitch = 0.15;
      P.footR.set(-0.15, 0, -0.1); P.footL.set(0.15, 0, 0.12);
    } else {
      P.lean = 0.6; P.hip.y = 0.72;
      P.handR.set(-0.35, 0.95, -0.5); P.handL.set(0.35, 0.95, -0.4);
      P.footR.set(-0.15, 0.1, 0.35); P.footL.set(0.15, 0.2, -0.4);
    }
  }
  end() { endCinematic(); for (const d of this.targets ?? []) if (d.hitstop > 1) d.hitstop = 0; }
}

// ── Guns: 데드아이 ─────────────────────────────────────────────────────────────
export class UltDeadEye extends UltBase {
  start() {
    const p = this.player;
    this.real0 = Time.real;
    cutIn('데드아이', 'D E A D   E Y E', '#ff5a4a');
    this.targets = nearestTargets(p, 8, 32);
    this.phase = 'cut'; this.i = 0; this.nextR = 0; this.marks = [];
    this.moveScale = 0;
    p.vel.set(0, 0, 0);
  }
  update(dt) {
    const p = this.player, rt = this.rt;
    if (this.phase === 'cut') {
      if (rt > CUTIN) {
        this.phase = 'mark'; this.r0 = rt;
        const f = p.forward(new THREE.Vector3()), r = p.right(new THREE.Vector3());
        setCine(p.pos.clone().addScaledVector(f, -3.8).addScaledVector(r, 1.7).add(_v.set(0, 1.9, 0)), p.pos.clone().addScaledVector(f, 12).add(_v.set(0, 0.9, 0)), 46, 8);
        G.slowmo(0.06, 2.4, 0.4, 0.05);
        G.screen.dim(0.25);
        G.screen.desat(0.75, 2.6);
        G.rig.fovPunch(-10);
      }
      return;
    }
    const lr = rt - this.r0;
    if (this.phase === 'mark') {
      if (lr >= this.nextR) {
        if (this.i >= this.targets.length) { this.phase = 'fire'; this.i = 0; this.nextR = lr + 0.15; return; }
        const d = this.targets[this.i++];
        this.nextR = lr + 0.11;
        this.marks.push(markTarget(d));
        G.audio?.play('tick', { pitch: 1 + this.i * 0.06 });
      }
    } else if (this.phase === 'fire') {
      if (lr >= this.nextR) {
        if (this.i >= this.targets.length) { this.phase = 'wait'; this.wr = lr; return; }
        const d = this.targets[this.i];
        this.nextR = lr + 0.07;
        this.shootAt(d, this.i);
        this.i++;
      }
    } else if (this.phase === 'wait') {
      if (lr - this.wr > 1.1) { endCinematic(); p.endAction(); }
    }
    if (this.aimAt) p.yaw = Math.atan2(this.aimAt.x - p.pos.x, this.aimAt.z - p.pos.z);
  }
  shootAt(d, i) {
    const p = this.player;
    const c = d.center(new THREE.Vector3());
    this.aimAt = c;
    const w = this.w;
    const model = (i % 2 === 1 && w.modelL) ? w.modelL : w.modelR;
    const from = model?.userData.muzzle ? w.muzzle(model, new THREE.Vector3()) : p.model.handR.getWorldPosition(new THREE.Vector3());
    const dir = c.clone().sub(from).normalize();
    FXP.muzzleFlash(from, dir, 0.9, [3.2, 1.6, 1.0]);
    G.rig.shake(0.05);
    G.audio?.play('sniper', { pitch: 1.4, vol: 0.6 });
    const mark = this.marks[i];
    G.projectiles.spawn({
      pos: from, vel: dir.multiplyScalar(90), life: 3, radius: 0.1,
      render: (pr) => {
        G.fx.add.emit({ pos: pr.pos, vel: pr.vel, shape: SHAPE.STREAK, size: 0.08, stretch: 0.03, life: 1 / 50, color: [3, 1.2, 0.6], alpha: 1, alphaEnd: 1 });
        G.fx.add.emit({ pos: pr.pos, shape: SHAPE.GLOW, size: 0.25, life: 1 / 50, color: [1.4, 0.45, 0.2], alpha: 1, alphaEnd: 1 });
      },
      onHit: (pr, dd, point) => {
        if (mark) mark.t = mark.life;
        hit(dd, { dir: pr.vel.clone().setY(0).normalize(), fxDir: pr.vel.clone().normalize(), point, kb: 15, lift: 7, hitstop: 0.12, shake: 0.25, kind: 'pierce', color: [1, 0.5, 0.3], fxScale: 1.6, dmg: 777, crit: true, sound: 'hitPierce', spin: 1.8 });
        G.fx.ring({ pos: point, billboard: true, r0: 0.2, r1: 2.2, w0: 0.08, w1: 0.01, color: [2, 0.6, 0.4], life: 0.3, sharp: 1 });
      },
    });
  }
  pose(P, t) {
    if (!this.aimAt) return;
    const p = this.player;
    const w = this.w;
    const old = w.aimPoint.clone();
    w.aimPoint.copy(this.aimAt);
    if (w.modelL) w.aimPose(P, p, 'RL', 1); else if (w.aimPose2H) w.aimPose2H(P, p, 0, 0.3, w.id === 'rocket');
    w.aimPoint.copy(old);
  }
  end() { endCinematic(); for (const m of this.marks ?? []) m.t = m.life; }
}

function markTarget(d) {
  const fx = G.fx;
  const c = d.center(new THREE.Vector3());
  fx.add.emit({ pos: c, shape: SHAPE.CROSS, size: 1.3, sizeEnd: 0.8, life: 0.15, color: [3, 0.6, 0.4], alphaEnd: 0.6 });
  return fx.ring({ pos: c, billboard: true, r0: 1.1, r1: 0.5, w0: 0.06, w1: 0.07, color: [2.2, 0.35, 0.25], life: 6, sharp: 1, easing: (k) => Math.min(1, k * 40), alpha: 1 });
}

// ── Magic: 메테오 ─────────────────────────────────────────────────────────────
export class UltMeteor extends UltBase {
  start() {
    const p = this.player;
    this.real0 = Time.real;
    cutIn('메테오 스트라이크', 'M E T E O R', '#ff8a3a');
    // target: crosshair point, or the densest nearby group
    let tgt = this.w.aimPoint.clone(); tgt.y = 0;
    const flat = tgt.clone().sub(p.pos).setY(0);
    if (flat.length() > 24 || flat.length() < 4) {
      const ts = nearestTargets(p, 4, 24);
      if (ts.length) { tgt = ts.reduce((a, d) => a.add(d.pos), new THREE.Vector3()).multiplyScalar(1 / ts.length); tgt.y = 0; }
      else tgt = p.pos.clone().addScaledVector(p.forward(_v), 10);
    }
    this.tgt = tgt;
    this.phase = 'cut';
    this.cam = { dist: 9.5 };
    p.vel.set(0, 0, 0);
  }
  update(dt) {
    const p = this.player;
    if (this.phase === 'cut') {
      if (this.rt > CUTIN) {
        this.phase = 'summon'; this.lt = 0;
        const back = p.pos.clone().sub(this.tgt).setY(0).normalize();
        const side = new THREE.Vector3(-back.z, 0, back.x);
        this.F = back.clone().negate();
        this.summon();
        setCine(p.pos.clone().addScaledVector(back, 5).addScaledVector(side, 1.8).add(_v.set(0, 2.2, 0)), this.tgt.clone().addScaledVector(this.F, 5).add(_v.set(0, 7, 0)), 64, 4);
      }
      return;
    }
    this.lt += dt;
    if (this.phase === 'summon' && this.lt > 0.55) { this.phase = 'fall'; this.lt = 0; this.spawnMeteor(); }
    if (this.phase === 'fall') this.fall(dt);
    if (this.phase === 'after' && this.lt > 1.6) { endCinematic(); p.endAction(); }
    p.yaw = Math.atan2(this.tgt.x - p.pos.x, this.tgt.z - p.pos.z);
  }
  summon() {
    const fx = G.fx;
    G.screen.dim(0.45);
    // the meteor's path: from far beyond the target, through a sky circle, onto the target
    this.from = this.tgt.clone().addScaledVector(this.F, 30).add(_v.set(0, 44, 0));
    const pathDir = this.tgt.clone().sub(this.from).normalize();
    const sky = this.from.clone().lerp(this.tgt, 0.62);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, pathDir.clone().negate());
    this.skyCircle = fx.decal({ pos: sky, y: sky.y, size: 11, type: 3, color: [1.25, 0.42, 0.1], life: 3.4, spin: 0.7, reveal: 0.4, additive: true, fadeStart: 0.8 });
    this.skyCircle2 = fx.decal({ pos: sky, y: sky.y, size: 7, type: 3, color: [1.3, 0.62, 0.16], life: 3.4, spin: -1.1, reveal: 0.5, additive: true, fadeStart: 0.8 });
    this.skyCircle.obj.quaternion.copy(q); this.skyCircle2.obj.quaternion.copy(q);
    this.skyCircle2.obj.position.addScaledVector(pathDir, 0.4);
    fx.add.emit({ pos: sky, shape: SHAPE.STAR, size: 6, sizeEnd: 1, life: 0.3, color: [1.6, 0.8, 0.3], alphaEnd: 0 });
    fx.decal({ pos: this.tgt, size: 11, type: 3, color: [1.0, 0.3, 0.07], life: 3.4, spin: 0.5, reveal: 0.5, additive: true, fadeStart: 0.7 });
    fx.decal({ pos: this.tgt, size: 12, type: 4, color: [0.35, 0.08, 0.015], life: 3.4, additive: true, fadeStart: 0.6 });
    G.audio?.play('charge', { pitch: 0.5 });
    G.rig.shake(0.15);
  }
  spawnMeteor() {
    const fx = G.fx;
    const g = new THREE.Group();
    const rock = toonMesh(new THREE.DodecahedronGeometry(1.7, 1), { color: 0x4a2a24, outlineWidth: 2.6, emissive: 0.15 });
    g.add(rock);
    for (let i = 0; i < 7; i++) {
      const c = toonMesh(new THREE.DodecahedronGeometry(rand(0.5, 0.8), 0), { color: 0x3a221e, outlineWidth: 2 });
      c.position.copy(randUnit(_v).multiplyScalar(1.5));
      g.add(c);
    }
    G.scene.add(g);
    this.meteor = g;
    this.glow = fx.sphere({ pos: this.from, r0: 2.6, r1: 2.6, color: [1.8, 0.6, 0.12], coreColor: [2.2, 1.4, 0.5], life: 5, power: 1.6, core: 0.15, noise: 0.6, alphaCurve: () => 1, follow: (m) => m.position.copy(g.position) });
    this.haze = fx.distort({ pos: this.from, mode: 'haze', r0: 5, r1: 5, strength: 0.03, life: 5, strengthCurve: () => 1 });
    this.light = fx.light(this.from, [1, 0.5, 0.15], 4, 22, 0);
    this.fallT = 1.35;
    G.audio?.play('meteor');
  }
  fall(dt) {
    const fx = G.fx;
    const k = Math.min(1, this.lt / this.fallT);
    const e = k * k;
    const pos = this.from.clone().lerp(this.tgt.clone().setY(1.2), e);
    this.meteor.position.copy(pos);
    this.meteor.rotation.x += dt * 2.5; this.meteor.rotation.z += dt * 1.7;
    this.haze.obj.position.copy(pos);
    this.light.p.copy(pos);
    const vel = this.tgt.clone().setY(1.2).sub(this.from).normalize();
    // fire trail
    for (let i = 0; i < 5; i++) {
      fx.puffs.emit({ pos: pos.clone().add(randUnit(_v).multiplyScalar(1.6)), vel: vel.clone().multiplyScalar(-rand(4, 10)).add(randUnit(_v2).multiplyScalar(2)), size: rand(0.7, 1.1), sizeEnd: rand(0.2, 0.4), life: rand(0.5, 0.8), mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: rand(1, 1.2), drag: 2, rise: 1, dissolveStart: 0.3 });
    }
    if (Math.random() < 0.6) fx.puffs.emit({ pos: pos.clone().add(randUnit(_v).multiplyScalar(1.2)), vel: vel.clone().multiplyScalar(-3), size: 0.9, sizeEnd: 1.8, life: 1.4, mode: PUFF.SMOKE, color: [0.36, 0.3, 0.34], shade: [0.16, 0.12, 0.18], drag: 1, rise: 0.5, dissolveStart: 0.3 });
    for (let i = 0; i < 3; i++) fx.add.emit({ pos: pos.clone().add(randUnit(_v).multiplyScalar(1.8)), vel: vel.clone().multiplyScalar(-rand(6, 14)).add(randUnit(_v2).multiplyScalar(3)), shape: SHAPE.STREAK, size: 0.09, stretch: 0.04, life: rand(0.3, 0.6), color: [4, 2, 0.5], colorEnd: [1.6, 0.3, 0.05], alphaEnd: 0, drag: 1 });
    G.rig.shake(0.02 + k * 0.05);
    if (k >= 1) this.impact();
  }
  impact() {
    const fx = G.fx;
    const p = this.tgt.clone().setY(0.8);
    this.phase = 'after'; this.lt = 0;
    this.meteor.parent?.remove(this.meteor);
    this.glow.t = this.glow.life; this.haze.t = this.haze.life; this.light.max = 0.001; this.light.life = 1;
    if (this.skyCircle) this.skyCircle.t = this.skyCircle.life * 0.85;
    G.screen.impact(0.08, true, [1, 0.9, 0.8]);
    G.screen.flash([1, 0.8, 0.6], 0.25, 0.12);
    G.screen.dim(0);
    G.slowmo(0.18, 0.18, 0.45);
    G.rig.shake(1.0); G.rig.fovPunch(7);
    FXP.explosion(p, 2.6);
    fx.decal({ pos: p, size: 12, type: 1, color: [3, 1.0, 0.25], glow: 2, life: 8, reveal: 0.25, glowPow: 2 });
    fx.ring({ pos: p.clone().setY(0.1), normal: UP, r0: 1, r1: 22, w0: 0.06, w1: 0.006, color: [1.4, 0.8, 0.4], life: 0.7, sharp: 1 });
    fx.distort({ pos: p, r0: 1, r1: 22, strength: 0.08, life: 0.7, width: 0.08 });
    fx.distort({ pos: p.clone().setY(3), mode: 'haze', r0: 7, r1: 8, strength: 0.03, life: 3 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const q = p.clone().add(_v.set(Math.cos(a) * rand(3, 6), 0, Math.sin(a) * rand(3, 6)));
      for (let k = 0; k < 2; k++) fx.puffs.emit({ pos: q.clone().setY(0.3 + k * 0.5), vel: _v2.set(Math.cos(a) * 2, rand(5, 11), Math.sin(a) * 2), size: rand(0.4, 0.7), sizeEnd: rand(0.1, 0.25), life: rand(0.5, 0.9), mode: PUFF.FIRE, color: [1.7, 0.85, 0.18], shade: [0.95, 0.22, 0.04], heat: rand(1, 1.2), drag: 2, rise: 2, dissolveStart: 0.35, stretch: 1.4 });
    }
    for (let i = 0; i < 26; i++) {
      randUnit(_v2); _v2.y = Math.abs(_v2.y) + 0.5;
      fx.debris.rock.emit({ pos: p.clone().add(_v.set(rand(-2, 2), 0.3, rand(-2, 2))), vel: _v2.normalize().multiplyScalar(rand(10, 22)), scale: rand(0.2, 0.5), life: rand(2, 3) });
    }
    G.audio?.play('explosion', { pitch: 0.6 }); G.audio?.play('ultBoom');
    for (const d of G.dummies.list) {
      const dist = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
      if (dist < 13) {
        const dir = new THREE.Vector3(d.pos.x - p.x, 0, d.pos.z - p.z);
        if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
        dir.normalize();
        const k = 1 - dist / 13 * 0.6;
        hit(d, { dir, kb: 22 * k, lift: 15 * k, hitstop: 0.15, shake: 0, kind: 'none', dmg: Math.round(1500 * k), crit: true, sound: null, spin: 2.2 });
        d.status.burn = 3;
      }
    }
  }
  pose(P, t) {
    // arms raised to the sky while summoning, then flung down
    const up = this.phase === 'cut' || this.phase === 'summon';
    if (up) {
      P.handR.set(-0.3, 2.05, 0.15); P.handL.set(0.3, 2.05, 0.15);
      P.headPitch = -0.5; P.lean = -0.1;
    } else {
      P.handR.set(-0.25, 1.35, 0.6); P.handL.set(0.25, 1.35, 0.6);
      P.lean = 0.25;
    }
    P.hip.y = 0.82; P.footR.set(-0.18, 0, -0.15); P.footL.set(0.18, 0, 0.18);
  }
  end() { endCinematic(); if (this.meteor) this.meteor.parent?.remove(this.meteor); }
}

/** Start the ultimate that matches a weapon's category. */
export function triggerUltimate(p, w) {
  if ((G.ultCooldown ?? 0) > 0 || p.action?.isUlt) return false;
  if (p.action) p.endAction();
  const U = w.category === 'melee' ? UltPhantom : w.category === 'gun' ? UltDeadEye : UltMeteor;
  p.startAction(new U(w));
  G.ultCooldown = ULT_COOLDOWN;
  return true;
}
