// Player controller: movement, jumps/dash/blink, locomotion animation,
// action (attack) playback with hitstop, weapon switching.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { CharacterModel } from './character.js';
import { Pose, bladeQuat, easing, clamp01 } from './pose.js';
import { FXP, rand, cone } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { ARENA_R } from '../world/arena.js';
import { triggerUltimate } from '../weapons/ultimate.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function wrapPi(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export const MOVE = { run: 7.6, accel: 60, airAccel: 26, jump: 11.5, jump2: 11, gravity: 34, dash: 27, dashTime: 0.19 };

export class Player {
  constructor(scene) {
    this.model = new CharacterModel();
    scene.add(this.model.root);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.jumps = 0;
    this.airDash = 0;
    this.pose = new Pose();
    this.loco = new Pose();
    this.act = new Pose();
    this.action = null;
    this.hitstopT = 0;
    this.time = 0;
    this.runPhase = 0;
    this.moveDir = new THREE.Vector3();
    this.wishDir = new THREE.Vector3();
    this.speed01 = 0;
    this.weapons = [];
    this.weapon = null;
    this.weaponIndex = 0;
    this.dashCD = 0;
    this.blinkCD = 0;
    this.invisible = 0;
    this.leanRoll = 0;
    this.lastYaw = 0;
    this.gravityScale = 1;
    this.landT = 0;
    this.airT = 0;
    this.stepT = 0;
    this.trails = [];
    this.flipT = -1;
    this.aimYawOverride = null;
    this.restBlend = 1;
    this.upperOverride = null; // weapon-provided upper-body pose (aiming)
    this.rootM = new THREE.Matrix4();
  }

  get facing() { return _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  right(out = new THREE.Vector3()) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }

  addHitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }

  setWeapons(list) { this.weapons = list; }
  equip(i) {
    if (i < 0 || i >= this.weapons.length) return;
    if (this.action?.isUlt) return;
    if (this.weapon && this.weapons[i] === this.weapon) return;
    if (this.action) this.endAction();
    if (this.weapon) this.weapon.unequip(this);
    this.weaponIndex = i;
    this.weapon = this.weapons[i];
    this.weapon.equip(this);
    G.hud?.setWeapon(i);
    G.audio?.play('equip');
    // equip flourish
    const p = this.handWorld(new THREE.Vector3());
    G.fx.add.emit({ pos: p, shape: SHAPE.STAR, size: 1.2, sizeEnd: 0, life: 0.25, color: [3, 3, 3.5], alphaEnd: 0 });
    G.fx.ring({ pos: p, billboard: true, r0: 0.1, r1: 0.8, w0: 0.1, w1: 0.02, color: [1.5, 1.8, 2.5], life: 0.2, sharp: 1 });
  }

  handWorld(out) { return this.model.handR.getWorldPosition(out); }

  /** Root-space (pose space) → world, honoring the current spin/flip. */
  toWorld(v, out = new THREE.Vector3(), pose = this.pose) {
    _m.makeRotationY(this.yaw).setPosition(this.pos);
    _e.set(pose.flip, pose.spin, 0, 'YXZ');
    _m2.makeRotationFromEuler(_e);
    out.copy(v);
    out.y -= 0.9; out.applyMatrix4(_m2); out.y += 0.9;
    return out.applyMatrix4(_m);
  }
  dirToWorld(v, out = new THREE.Vector3(), pose = this.pose) {
    _e.set(pose.flip, pose.spin, 0, 'YXZ');
    out.copy(v).applyEuler(_e).applyAxisAngle(UP, this.yaw);
    return out;
  }

  startAction(a) {
    if (this.action) this.endAction(a);
    this.action = a;
    a.player = this;
    a.t = 0;
    a.start?.();
  }
  endAction(next) {
    const a = this.action;
    this.action = null;
    a?.end?.(next);
    this.gravityScale = 1;
  }

  /** Movement input in world space from camera-relative WASD. */
  readInput(input) {
    const f = G.rig.flatForward(_v);
    const r = G.rig.flatRight(_v2);
    let x = 0, z = 0;
    if (input.isDown('KeyW')) z += 1;
    if (input.isDown('KeyS')) z -= 1;
    if (input.isDown('KeyD')) x += 1;
    if (input.isDown('KeyA')) x -= 1;
    this.wishDir.set(0, 0, 0).addScaledVector(f, z).addScaledVector(r, x);
    if (this.wishDir.lengthSq() > 0) this.wishDir.normalize();
    if (this.scriptedMove) this.wishDir.copy(this.scriptedMove);
  }

  /** Direction for actions: input direction if held, else facing. */
  intentDir(out = new THREE.Vector3()) {
    return this.wishDir.lengthSq() > 0 ? out.copy(this.wishDir) : this.forward(out);
  }

  update(dtWorld, input) {
    let dt = dtWorld;
    if (this.hitstopT > 0) {
      this.hitstopT -= dtWorld;
      dt = 0;
    }
    this.time += dt;
    this.dashCD -= dtWorld; this.blinkCD -= dtWorld;
    this.readInput(input);

    // ── weapon input ──
    const w = this.weapon;
    if (w && !this.inCine) {
      if (input.wasPressed('Mouse0')) w.press?.(this, 0);
      if (input.isDown('Mouse0')) w.hold?.(this, 0, dtWorld);
      if (input.wasReleased('Mouse0')) w.release?.(this, 0);
      if (input.wasPressed('Mouse2')) w.press?.(this, 1);
      if (input.isDown('Mouse2')) w.hold?.(this, 1, dtWorld);
      if (input.wasReleased('Mouse2')) w.release?.(this, 1);
      if (input.wasPressed('KeyF')) triggerUltimate(this, w);
    }
    if (!this.inCine) {
      if (input.wasPressed('ShiftLeft')) this.tryDash();
      if (input.wasPressed('KeyC')) this.tryBlink();
      if (input.wasPressed('Space')) this.tryJump();
    }
    if (dt <= 0) { this.applyVisual(); return; }

    w?.update?.(this, dt);

    // ── action ──
    const a = this.action;
    let moveScale = 1, faceMove = true;
    if (a) {
      const prevT = a.t;
      a.t += dt * (a.speed ?? 1);
      a.update?.(dt, prevT);
      moveScale = a.moveScale ?? 0;
      faceMove = a.faceMove ?? false;
      if (this.action === a && a.t >= a.dur) this.endAction();
    }

    // ── movement ──
    const wish = this.wishDir;
    const mm = moveScale * (this.moveMul ?? 1);
    const tgtX = wish.x * MOVE.run * mm, tgtZ = wish.z * MOVE.run * mm;
    const acc = (this.grounded ? MOVE.accel : MOVE.airAccel) * dt;
    if (!(a && a.ownsVelocity)) {
      const dx = tgtX - this.vel.x, dz = tgtZ - this.vel.z;
      const dl = Math.hypot(dx, dz);
      if (dl > acc) { this.vel.x += dx / dl * acc; this.vel.z += dz / dl * acc; }
      else { this.vel.x = tgtX; this.vel.z = tgtZ; }
    }
    if (!this.grounded || this.vel.y > 0) {
      this.vel.y -= MOVE.gravity * this.gravityScale * (this.vel.y < 0 ? 1.15 : 1) * dt;
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.grounded) this.onLand(-this.vel.y);
      this.pos.y = 0; this.vel.y = 0; this.grounded = true; this.jumps = 0; this.airDash = 0;
    } else if (this.pos.y > 0.001) {
      if (this.grounded) this.airT = 0;
      this.grounded = false;
    }
    if (!this.grounded) this.airT += dt;
    // arena bound
    const r = Math.hypot(this.pos.x, this.pos.z), lim = ARENA_R + 1.6;
    if (r > lim) { this.pos.x *= lim / r; this.pos.z *= lim / r; }
    // push out of dummies
    for (const d of G.dummies.list) {
      if (d.state === 'down' || Math.abs(d.pos.y - this.pos.y) > 1.6) continue;
      const dx = this.pos.x - d.pos.x, dz = this.pos.z - d.pos.z;
      const dist = Math.hypot(dx, dz), min = d.radius + 0.32;
      if (dist < min && dist > 1e-4) { this.pos.x += dx / dist * (min - dist); this.pos.z += dz / dist * (min - dist); }
    }

    // ── facing ──
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed01 = Math.min(1, hs / MOVE.run);
    if (this.aimYawOverride !== null) {
      this.yaw = this.turn(this.yaw, this.aimYawOverride, dt * 22);
    } else if (faceMove && wish.lengthSq() > 0) {
      this.yaw = this.turn(this.yaw, Math.atan2(wish.x, wish.z), dt * 16);
    }
    const yawRate = wrapPi(this.yaw - this.lastYaw) / Math.max(dt, 1e-4);
    this.lastYaw = this.yaw;
    this.leanRoll += (THREE.MathUtils.clamp(-yawRate * 0.04 * this.speed01, -0.35, 0.35) - this.leanRoll) * Math.min(1, dt * 10);

    // ── footsteps ──
    if (this.grounded && hs > 2) {
      this.stepT += dt * hs / 1.25;
      if (this.stepT > 1) { this.stepT -= 1; if (Math.random() < 0.6) FXP.dust(this.pos, 0.5, 1, this.vel.clone().normalize().negate()); G.audio?.play('step', { vol: 0.25 }); }
    }
    this.landT -= dt;

    this.computePose(dt);
    this.applyVisual();
    this.sampleTrails(dt);
  }

  turn(a, b, k) { return a + wrapPi(b - a) * Math.min(1, k); }

  computePose(dt) {
    const L = this.loco;
    const t = this.time;
    const s = this.speed01;
    // locomotion
    this.runPhase += dt * (Math.hypot(this.vel.x, this.vel.z) / 1.35) * Math.PI;
    const ph = this.runPhase;
    L.lean = 0.28 * s; L.roll = this.leanRoll; L.twist = Math.sin(ph) * 0.18 * s; L.squash = 1;
    L.hip.set(0, 0.86 - 0.05 * s + Math.abs(Math.cos(ph)) * 0.07 * s + Math.sin(t * 2.2) * 0.008 * (1 - s), 0);
    const stride = 0.42 * s;
    L.footR.set(-0.13, Math.max(0, -Math.sin(ph)) * 0.28 * s, Math.cos(ph) * stride + 0.05 * s);
    L.footL.set(0.13, Math.max(0, Math.sin(ph)) * 0.28 * s, -Math.cos(ph) * stride + 0.05 * s);
    L.handR.set(-0.34, 0.78 + s * 0.06, 0.06 - Math.cos(ph) * 0.26 * s);
    L.handL.set(0.34, 0.78 + s * 0.06, 0.06 + Math.cos(ph) * 0.26 * s);
    L.headYaw = 0; L.headPitch = 0.05 * s; L.elbowOut = 0; L.flip = 0; L.spin = 0;
    bladeQuat(L.wR, _v.set(0, -0.35, -1), _v2.set(0, -1, 0.2));
    bladeQuat(L.wL, _v.set(0, -0.35, -1), _v2.set(0, -1, 0.2));
    if (!this.grounded) {
      const up = this.vel.y > 0 ? 1 : 0;
      L.footR.set(-0.14, 0.32 + up * 0.08, 0.18);
      L.footL.set(0.14, 0.18 + up * 0.1, -0.14);
      L.hip.y = 0.88;
      L.lean = 0.12 + Math.max(-0.2, Math.min(0.2, -this.vel.y * 0.015));
      L.handR.set(-0.42, 0.95, 0.0); L.handL.set(0.42, 0.95, 0.0);
    }
    if (this.landT > 0) {
      const k = this.landT / 0.16;
      L.hip.y -= 0.16 * k; L.lean += 0.2 * k;
    }
    // flips (double jump)
    if (this.flipT >= 0) {
      this.flipT += dt;
      const k = Math.min(1, this.flipT / 0.42);
      L.flip = easing.outCubic(k) * Math.PI * 2;
      L.footR.set(-0.12, 0.45, 0.1); L.footL.set(0.12, 0.42, 0.05);
      if (k >= 1) { this.flipT = -1; L.flip = 0; }
    }
    // weapon rest pose (upper body)
    this.weapon?.restPose?.(L, this);

    this.pose.copy(L);
    if (this.action && this.action.pose) {
      this.act.copy(L);
      this.action.pose(this.act, this.action.t);
      const w = this.action.poseWeight ? this.action.poseWeight(this.action.t) : 1;
      if (this.action.fullBody) this.pose.lerp(this.act, w);
      else {
        this.pose.lerpUpper(this.act, w);
        // allow actions to drive hips/feet
        if (this.action.legs) { this.pose.hip.lerp(this.act.hip, w); this.pose.footR.lerp(this.act.footR, w); this.pose.footL.lerp(this.act.footL, w); this.pose.flip += (this.act.flip - this.pose.flip) * w; this.pose.spin += (this.act.spin - this.pose.spin) * w; }
      }
    }
    // smooth to avoid pops between actions
    if (!this.prevPose) this.prevPose = new Pose().copy(this.pose);
    const snap = this.action?.snap ?? false;
    if (!snap) {
      const k = 1 - Math.exp(-dt * 38);
      this.prevPose.lerp(this.pose, k);
      this.pose.copy(this.prevPose);
    } else this.prevPose.copy(this.pose);
  }

  applyVisual() {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    m.root.visible = this.invisible <= 0;
    m.apply(this.pose);
  }

  sampleTrails(dt) {
    // trails registered by weapons: {trail, base:Vector3 (socket-local), tip:Vector3, socket:'R'|'L'}
    this.model.root.updateMatrixWorld(true);
    for (const tr of this.trails) {
      const sock = tr.socket === 'L' ? this.model.sockL : this.model.sockR;
      const a = tr.base.clone().applyMatrix4(sock.matrixWorld);
      const b = tr.tip.clone().applyMatrix4(sock.matrixWorld);
      // sub-sample analytic swing for smooth arcs
      if (tr.trail.emitting && this.action?.sampleSocket && tr.prevT !== undefined && this.action === tr.prevAction) {
        const t0 = tr.prevT, t1 = this.action.t;
        const N = 6;
        for (let i = 1; i < N; i++) {
          const tt = t0 + (t1 - t0) * (i / N);
          const res = this.action.sampleSocket(tt, tr.socket);
          if (res) {
            const sa = tr.base.clone().applyQuaternion(res.q).add(res.p);
            const sb = tr.tip.clone().applyQuaternion(res.q).add(res.p);
            tr.trail.push(this.toWorld(sa, sa, res.pose), this.toWorld(sb, sb, res.pose), G.fx.time - dt * (1 - i / N));
          }
        }
      }
      tr.trail.push(a, b, G.fx.time);
      tr.trail.update(G.fx.time);
      tr.prevT = this.action?.t; tr.prevAction = this.action;
    }
  }

  // ── movement abilities ─────────────────────────────────────────────────────
  tryJump() {
    if (this.action && !(this.action.cancelable?.('jump'))) return;
    if (this.grounded) {
      if (this.action) this.endAction();
      this.vel.y = MOVE.jump;
      this.grounded = false;
      this.jumps = 1;
      FXP.dust(this.pos, 0.7, 4);
      G.audio?.play('jump');
    } else if (this.jumps < 2) {
      if (this.action) this.endAction();
      this.vel.y = MOVE.jump2;
      this.jumps = 2;
      this.flipT = 0;
      const p = this.pos.clone().setY(this.pos.y + 0.1);
      FXP.jumpRing(p);
      G.audio?.play('jump2');
      if (this.wishDir.lengthSq() > 0) { this.vel.x = this.wishDir.x * MOVE.run; this.vel.z = this.wishDir.z * MOVE.run; }
    }
  }

  tryDash() {
    if (this.dashCD > 0) return;
    if (this.action && !(this.action.cancelable?.('dash'))) return;
    if (!this.grounded && this.airDash >= 1) return;
    if (!this.grounded) this.airDash++;
    this.dashCD = 0.32;
    this.startAction(new DashAction(this.intentDir(new THREE.Vector3())));
  }

  tryBlink() {
    if (this.blinkCD > 0) return;
    if (this.action && !(this.action.cancelable?.('dash'))) return;
    this.blinkCD = 0.6;
    this.startAction(new BlinkAction(this.intentDir(new THREE.Vector3())));
  }

  onLand(speed) {
    this.landT = 0.16;
    this.flipT = -1;
    if (speed > 6) FXP.dust(this.pos, 0.6 + Math.min(0.6, speed / 30), 5);
    G.audio?.play('land', { vol: Math.min(1, speed / 20) });
    this.action?.onLand?.(speed);
  }
}

// ── Dash (afterimage dodge) ───────────────────────────────────────────────────
export class DashAction {
  constructor(dir) {
    this.dir = dir.clone().setY(0).normalize();
    this.dur = MOVE.dashTime + 0.08;
    this.ownsVelocity = true;
    this.moveScale = 1;
    this.faceMove = false;
    this.legs = true;
    this.ghostT = 0;
  }
  start() {
    const p = this.player;
    p.yaw = Math.atan2(this.dir.x, this.dir.z);
    p.vel.set(this.dir.x * MOVE.dash, 0, this.dir.z * MOVE.dash);
    p.gravityScale = 0;
    this.wasAir = !p.grounded;
    G.rig.fovPunch(7);
    G.screen.speedLines(0.9, 0.22);
    G.screen.radial(0.5, 0.18);
    G.audio?.play('dash');
    const fx = G.fx;
    const back = this.dir.clone().negate();
    if (p.grounded) FXP.dust(p.pos, 0.9, 7, back);
    // burst ring at start
    fx.ring({ pos: p.pos.clone().setY(p.pos.y + 0.9), normal: this.dir, r0: 0.3, r1: 1.6, w0: 0.15, w1: 0.02, color: [0.8, 1.6, 3], life: 0.22, sharp: 1 });
    for (let i = 0; i < 14; i++) {
      cone(back, 0.5, _v);
      fx.add.emit({ pos: p.pos.clone().add(_v2.set(rand(-0.3, 0.3), rand(0.3, 1.6), rand(-0.3, 0.3))), vel: _v.multiplyScalar(rand(6, 14)), shape: SHAPE.STREAK, size: 0.05, stretch: 0.05, life: rand(0.15, 0.3), color: [1.2, 2.4, 4], alphaEnd: 0, drag: 4 });
    }
  }
  update(dt) {
    const p = this.player;
    const k = clamp01(this.t / MOVE.dashTime);
    const sp = this.t < MOVE.dashTime ? MOVE.dash * (1 - easing.inQuad(k) * 0.55) : MOVE.run * 0.9;
    p.vel.x = this.dir.x * sp; p.vel.z = this.dir.z * sp;
    if (this.wasAir) p.vel.y = 0;
    this.ghostT -= dt;
    if (this.ghostT <= 0 && this.t < MOVE.dashTime + 0.02) {
      this.ghostT = 0.022;
      G.fx.ghost(p.model.root, { color: [0.25, 0.5, 1.4], rim: [0.6, 1.5, 3.5], life: 0.3, alpha: 0.75 });
    }
    if (p.grounded && Math.random() < dt * 30) FXP.slideDust(p.pos, p.vel, 0.6);
    if (this.t > MOVE.dashTime) p.gravityScale = 1;
  }
  cancelable(kind) { return this.t > MOVE.dashTime * 0.55; }
  pose(P, t) {
    const k = clamp01(t / MOVE.dashTime);
    P.lean = 0.7; P.hip.y = 0.74;
    P.handR.set(-0.3, 0.72, -0.55); P.handL.set(0.3, 0.72, -0.55);
    P.footR.set(-0.13, 0.12, 0.35); P.footL.set(0.13, 0.25, -0.45);
    P.headPitch = -0.3;
  }
  poseWeight(t) { return t < MOVE.dashTime ? 1 : 1 - clamp01((t - MOVE.dashTime) / 0.08); }
  end() { this.player.gravityScale = 1; }
}

// ── Blink (teleport) ─────────────────────────────────────────────────────────
export class BlinkAction {
  constructor(dir) {
    this.dir = dir.clone().setY(0).normalize();
    this.dur = 0.26;
    this.ownsVelocity = true;
    this.moveScale = 0;
    this.done = false;
  }
  start() {
    const p = this.player;
    const from = p.pos.clone();
    let dist = 7.5;
    const to = from.clone().addScaledVector(this.dir, dist);
    const r = Math.hypot(to.x, to.z), lim = ARENA_R + 1.4;
    if (r > lim) to.multiplyScalar(lim / r);
    to.y = from.y;
    this.from = from; this.to = to;
    p.vel.set(0, 0, 0);
    p.gravityScale = 0;
    // vanish
    const c = from.clone().setY(from.y + 1);
    G.fx.ghost(p.model.root, { color: [0.7, 0.4, 1.6], rim: [1.5, 0.9, 4], life: 0.25, alpha: 1 });
    p.invisible = 1;
    this.vanishFX(c, true);
    // streak line between
    const c2 = to.clone().setY(to.y + 1);
    G.fx.line({ a: c, b: c2, width: 0.5, color: [1.2, 0.6, 3], core: [4, 3, 6], coreWidth: 0.2, life: 0.22, headFade: 0.2, tailFade: 0.4, noise: 0.6, segments: 12 });
    for (let i = 0; i < 24; i++) {
      const q = c.clone().lerp(c2, Math.random()).add(_v.set(rand(-0.3, 0.3), rand(-0.6, 0.6), rand(-0.3, 0.3)));
      G.fx.add.emit({ pos: q, vel: this.dir.clone().multiplyScalar(rand(2, 8)), shape: SHAPE.DIAMOND, size: rand(0.06, 0.14), sizeEnd: 0, life: rand(0.2, 0.45), color: [2, 1.2, 4], alphaEnd: 0, drag: 3 });
    }
    G.screen.chroma(0.012, 0.18);
    G.rig.fovPunch(4);
    G.audio?.play('blink');
  }
  vanishFX(c, out) {
    const fx = G.fx;
    fx.add.emit({ pos: c, shape: SHAPE.STAR, size: 2.6, sizeEnd: 0, life: 0.18, color: [3, 2, 5], alphaEnd: 0 });
    fx.ring({ pos: c, billboard: true, r0: out ? 1.4 : 0.1, r1: out ? 0.05 : 1.8, w0: 0.1, w1: 0.04, color: [1.6, 0.8, 3], life: 0.18, sharp: 1, easing: (k) => k });
    for (let i = 0; i < 18; i++) {
      const d = new THREE.Vector3();
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, rr = Math.sqrt(1 - u * u);
      d.set(rr * Math.cos(th), u, rr * Math.sin(th));
      if (out) {
        fx.add.emit({ pos: c.clone().addScaledVector(d, 1.3), vel: d.clone().multiplyScalar(-7), shape: SHAPE.STREAK, size: 0.05, stretch: 0.04, life: 0.16, color: [1.5, 0.9, 3.5], alphaEnd: 0.2 });
      } else {
        fx.add.emit({ pos: c, vel: d.clone().multiplyScalar(rand(5, 10)), shape: SHAPE.STREAK, size: 0.05, stretch: 0.04, life: rand(0.15, 0.3), color: [1.5, 0.9, 3.5], alphaEnd: 0, drag: 5 });
      }
    }
    fx.light(c, [0.7, 0.4, 1.0], 3, 5, 0.2);
  }
  update(dt) {
    const p = this.player;
    if (!this.done && this.t > 0.08) {
      this.done = true;
      p.pos.copy(this.to);
      p.invisible = 0;
      p.prevPose = null;
      this.vanishFX(this.to.clone().setY(this.to.y + 1), false);
      G.fx.ghost(p.model.root, { color: [0.7, 0.4, 1.6], rim: [1.5, 0.9, 4], life: 0.2, alpha: 1 });
      if (p.grounded) FXP.dust(p.pos, 0.6, 5);
    }
    if (!this.done) p.invisible = 1;
  }
  cancelable() { return this.done; }
  end() { this.player.invisible = 0; this.player.gravityScale = 1; }
}
