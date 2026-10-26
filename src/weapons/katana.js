// 카타나 「청월」 — fast, precise, cyan crescent slashes.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { MeleeWeapon, SwingMove, trailDef, juggleSet } from './melee.js';
import { katanaModel } from './models.js';
import { WeaponTrail } from '../vfx/fx.js';
import { FXP, rand, cone } from '../vfx/presets.js';
import { SHAPE } from '../vfx/particles.js';
import { bladeQuat } from '../entities/pose.js';
import { hit } from '../combat/combat.js';
import { toonMesh } from '../render/toon.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const C = [0.25, 0.85, 2.6];
const CORE = [2.6, 3.6, 5.0];

// three stacked crescents: main, thin outer flash, faint inner wash
function slashLayers(extra = {}) {
  return [
    { ink: true, rIn: 1.05 * (extra.scale ?? 1), rOut: 2.1 * (extra.scale ?? 1), width: 0.38, color: [0.02, 0.03, 0.09], alpha: 0.7, tail: 0.75, fade: 0.14, streak: 0.6, cone: 0.15, da0: -0.25 },
    { width: 0.42, tail: 0.9, streak: 0.8, ...extra },
    { rIn: 1.75 * (extra.scale ?? 1), rOut: 2.25 * (extra.scale ?? 1), width: 0.3, color: [0.6, 1.3, 2.6], core: [2.5, 3, 3.6], tail: 0.5, fade: 0.1, streak: 0.3, cone: 0.05 },
    { rIn: 0.35, rOut: 1.5 * (extra.scale ?? 1), width: 0.8, color: [0.04, 0.14, 0.55], core: [0.1, 0.3, 0.8], alpha: 0.32, tail: 1.2, fade: 0.28, streak: 1 },
  ];
}

function sparkleArc(move, n = 9) {
  const p = move.player;
  const s = move.s;
  for (let i = 0; i < n; i++) {
    const t = s.swing[0] + (s.swing[1] - s.swing[0]) * (i / (n - 1));
    const sk = move.socketAt(t);
    const tip = sk.p.clone().addScaledVector(sk.blade, 1.0 + Math.random() * 0.25);
    const w = p.toWorld(tip, new THREE.Vector3());
    const tw = p.dirToWorld(sk.tangent, new THREE.Vector3());
    G.fx.add.emit({ pos: w, vel: tw.multiplyScalar(rand(1, 4)).addScaledVector(p.dirToWorld(sk.radial, _v2), rand(1, 3)), shape: Math.random() < 0.5 ? SHAPE.DIAMOND : SHAPE.STAR, size: rand(0.08, 0.2), sizeEnd: 0, life: rand(0.25, 0.5), color: [1.5, 3.2, 6], alphaEnd: 0, drag: 3, fadeIn: 0.1 });
  }
}

export class Katana extends MeleeWeapon {
  constructor() {
    super();
    this.id = 'katana';
    this.name = '카타나 「청월」';
    this.short = '카타나';
    this.icon = '刀';
    this.color = C;
    this.core = CORE;
    this.hitSound = 'hitSlash';
    this.modelR = katanaModel(0x7fe8ff);
    // lacquered scabbard worn at the left hip
    this.sheath = new THREE.Group();
    const saya = toonMesh(new THREE.CylinderGeometry(0.032, 0.026, 1.0, 8), { color: 0x2a1f30, spec: 0.6, outlineWidth: 1.4 });
    saya.scale.set(1, 1, 1.5);
    saya.position.y = -0.5;
    this.sheath.add(saya);
    for (const y of [-0.05, -0.32, -0.97]) {
      const ring = toonMesh(new THREE.CylinderGeometry(0.037, 0.037, 0.035, 8), { color: 0xd4ad62, spec: 0.9, outline: false });
      ring.scale.set(1, 1, 1.5); ring.position.y = y;
      this.sheath.add(ring);
    }
    this.sheath.position.set(0.24, 0.02, 0.1);
    this.sheath.rotation.set(1.12, 0, -0.25);
    this.bladeLen = this.modelR.userData.bladeLen;
    this.trail = new WeaponTrail(G.fx, { color: [0.25, 0.75, 2.6], core: [2.5, 4, 6], maxAge: 0.13, coreWidth: 0.18, noise: 0.08 });
    this.trails = [this.trail];
    this.trailDefs = [trailDef(this.trail, [0, 0.3, 0.02], [0, 1.18, -0.04])];

    const H = (o) => ({ range: 2.9, arc: 170, kb: 3.6, stop: 0.07, shake: 0.14, kick: 0.6, dmg: 120, kind: 'slash', ...o });

    this.combo = [
      { // 1: right → left horizontal
        dur: 0.36, cancel: 0.19, swing: [0.075, 0.14], follow: 0.1, over: 0.25, antic: 0.3,
        plane: { roll: -0.18 }, a0: -2.05, a1: 1.7, radius: 0.5, lunge: 0.8, offHand: [0.42, 1.0, -0.25],
        hits: [H({ t: 0.105, dmg: 112 })], slash: slashLayers(), whooshPitch: 1.15,
        onEvent: [{ t: 0.08, fn: (m) => sparkleArc(m) }],
      },
      { // 2: left-low → right-high reverse diagonal
        dur: 0.36, cancel: 0.19, swing: [0.06, 0.125], follow: 0.1, over: 0.25, antic: 0.3,
        plane: { roll: 0.75 }, a0: 1.95, a1: -1.65, radius: 0.5, lunge: 0.8, offHand: [0.4, 0.85, 0.1],
        hits: [H({ t: 0.095, dmg: 118 })], slash: slashLayers(), whooshPitch: 1.25,
        onEvent: [{ t: 0.065, fn: (m) => sparkleArc(m) }],
      },
      { // 3: heavy descending diagonal
        dur: 0.44, cancel: 0.25, swing: [0.1, 0.17], follow: 0.12, over: 0.3, antic: 0.45,
        plane: { roll: -0.85, yaw: 0.1 }, a0: -2.3, a1: 1.75, radius: 0.55, lunge: 1.2, maxLunge: 4, offHand: [0.45, 1.1, -0.2],
        crouch: 0.08, lean: 0.4,
        hits: [H({ t: 0.135, dmg: 160, kb: 5.5, stop: 0.09, shake: 0.2, kick: 1.0 })],
        slash: slashLayers({ scale: 1.1, width: 0.8 }), whooshPitch: 0.95,
        onEvent: [{ t: 0.1, fn: (m) => sparkleArc(m, 12) }],
      },
      { // 4: 360° spin finisher
        dur: 0.72, cancel: 0.5, swing: [0.13, 0.3], follow: 0.14, over: 0.2, antic: 0.2,
        plane: { roll: -0.08 }, a0: -0.9, a1: 0.9, radius: 0.55, spinTurns: 1, spinWin: [0.12, 0.33],
        lunge: 1.0, maxLunge: 3, crouch: 0.12, lean: 0.25, offHand: [0.5, 1.15, -0.1], stance: 'low',
        hits: [
          H({ t: 0.2, arc: 360, range: 3.4, dmg: 90, kb: 2, stop: 0.05, shake: 0.12 }),
          H({ t: 0.29, arc: 360, range: 3.6, dmg: 240, kb: 13, lift: 6.5, stop: 0.13, atkStop: 0.13, shake: 0.42, kick: 1.6, fxScale: 1.35, flash: [0.7, 0.9, 1], flashA: 0.18, chroma: 0.012, fov: 4, slowmo: [0.25, 0.1, 0.25], sound: 'hitSlashBig' }),
        ],
        slash: [
          { da0: -0.4, da1: Math.PI * 2 - 1.8 + 0.3, sweep: 0.19, width: 0.42, tail: 0.55, scale: 1.1, rIn: 0.9, rOut: 2.4, fade: 0.22, cone: 0.25 },
          { da0: -0.2, da1: Math.PI * 2 - 1.8 + 0.3, sweep: 0.17, rIn: 2.2, rOut: 2.65, width: 0.3, color: [0.6, 1.3, 2.6], core: [2.5, 3, 3.6], tail: 0.4, fade: 0.12, streak: 0.3, cone: 0.04 },
          { da0: -0.4, da1: Math.PI * 2 - 1.8 + 0.3, sweep: 0.2, rIn: 0.5, rOut: 1.8, width: 0.8, color: [0.05, 0.16, 0.6], core: [0.12, 0.3, 0.9], alpha: 0.45, tail: 0.9, fade: 0.3, cone: 0.2 },
        ],
        whoosh: 'whooshBig',
        onEvent: [
          { t: 0.14, fn: (m) => { FXP.dust(m.player.pos, 1.0, 8); G.fx.ring({ pos: m.player.pos.clone().setY(0.08), normal: UP, r0: 0.5, r1: 3.6, w0: 0.07, w1: 0.012, color: [0.3, 0.75, 1.7], life: 0.32, sharp: 1 }); } },
        ],
      },
    ];

    this.airCombo = [
      {
        dur: 0.34, cancel: 0.18, swing: [0.05, 0.12], follow: 0.1, antic: 0.3, plane: { roll: -0.25 }, a0: -2.0, a1: 1.7,
        radius: 0.5, lunge: 0.6, air: true, gravity: 0.06, airLift: 1.2, offHand: [0.42, 1.0, -0.25],
        hits: [H({ t: 0.09, dmg: 110, kb: 1.8, lift: 5.5, yMin: -2.5, yMax: 4.5, set: juggleSet })], slash: slashLayers(),
        onEvent: [{ t: 0.06, fn: (m) => sparkleArc(m) }],
      },
      {
        dur: 0.34, cancel: 0.18, swing: [0.05, 0.12], follow: 0.1, antic: 0.3, plane: { roll: 0.8 }, a0: 1.9, a1: -1.6,
        radius: 0.5, lunge: 0.6, air: true, gravity: 0.06, airLift: 1.2, offHand: [0.4, 0.85, 0.1],
        hits: [H({ t: 0.09, dmg: 118, kb: 1.8, lift: 5.5, yMin: -2.5, yMax: 4.5, set: juggleSet })], slash: slashLayers(),
        onEvent: [{ t: 0.06, fn: (m) => sparkleArc(m) }],
      },
      { // plunge
        dur: 1.2, cancel: 1.2, dashCancel: 1.2, swing: [0.1, 0.18], follow: 0.12, antic: 0.5,
        plane: { roll: Math.PI / 2 }, a0: 2.4, a1: -1.15, radius: 0.55, lunge: 0.5, air: true, gravity: 0, airLift: 2.5,
        vy: -30, vyUntil: 9, center: [-0.15, 1.25, 0.15], flipTurns: 0,
        hits: [H({ t: 0.15, dmg: 150, kb: 1, stop: 0.08, yMin: -3.5, yMax: 4.5, set: (d, m) => m.fwd.clone().multiplyScalar(2).setY(-24), shake: 0.2 })],
        slash: slashLayers({ scale: 1.1 }),
        onLand: (m, speed) => {
          const p = m.player;
          landingImpact(p.pos, 1.0);
          m.dur = m.t + 0.22; // short recovery
        },
        update: (m) => { if (m.t > 0.12 && m.player.vel.y > -30) m.player.vel.y = -30; },
      },
    ];
    this.airCombo[2].posePost = (P, t) => { if (t > 0.18) { P.hip.y = 0.7; P.footR.set(-0.2, 0, -0.3); P.footL.set(0.2, 0, 0.3); } };
  }

  equip(p) { super.equip(p); p.model.body.add(this.sheath); }
  unequip(p) { super.unequip(p); this.sheath.parent?.remove(this.sheath); }

  restPose(P, p) {
    // blade held low and back, edge down
    P.handR.set(-0.33, 0.8 + p.speed01 * 0.05, 0.02 - Math.cos(p.runPhase) * 0.15 * p.speed01);
    bladeQuat(P.wR, _v.set(-0.15, -0.35, -1), _v2.set(0, -1, 0.3));
  }

  heavy(p, a) {
    // 월광: rising launcher – the player rises with the target
    G.hud?.skill('월광', 'MOONRISE');
    const spec = {
      dur: 0.62, cancel: 0.42, dashCancel: 0.3, swing: [0.09, 0.18], follow: 0.14, over: 0.3, antic: 0.4,
      plane: { roll: Math.PI / 2 - 0.25 }, a0: -2.0, a1: 2.1, radius: 0.55, lunge: 0.6, maxLunge: 2.5,
      center: [-0.12, 1.2, 0.2], jumpVel: 0, gravity: 0.55, lean: -0.2,
      hits: [H2({ t: 0.13, dmg: 150, kb: 1.2, lift: 13, stop: 0.1, atkStop: 0.08, shake: 0.24, kick: 0.6, spin: 1.2 })],
      slash: slashLayers({ scale: 1.15, width: 0.85 }),
      onEvent: [
        { t: 0.1, fn: (m) => { m.player.vel.y = 12.5; m.player.grounded = false; FXP.dust(m.player.pos, 0.9, 6); sparkleArc(m, 12);
          G.fx.ring({ pos: m.player.pos.clone().setY(0.08), normal: UP, r0: 0.3, r1: 2.2, w0: 0.07, w1: 0.012, color: [0.25, 0.6, 1.4], life: 0.28, sharp: 1 }); } },
      ],
      whooshPitch: 0.9,
    };
    p.startAction(new SwingMove(this, spec, 0));
  }
}

function H2(o) { return { range: 2.9, arc: 150, kind: 'slash', ...o }; }

export function landingImpact(pos, s = 1, color = [0.6, 1.4, 3.2]) {
  const fx = G.fx;
  const p = pos.clone().setY(0.06);
  fx.ring({ pos: p, normal: UP, r0: 0.4, r1: 4.2 * s, w0: 0.1, w1: 0.015, color: [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7], life: 0.38, sharp: 1 });
  fx.ring({ pos: p.clone().setY(0.1), normal: UP, r0: 0.2, r1: 2.6 * s, w0: 0.3, w1: 0.05, color: [color[0] * 0.25, color[1] * 0.25, color[2] * 0.25], life: 0.45, noise: 0.2 });
  fx.decal({ pos: p, size: 2.4 * s, type: 1, color: [color[0] * 1.3, color[1] * 1.3, color[2] * 1.3], glow: 0.85, life: 3.5, reveal: 0.12 });
  FXP.dust(p, 1.2 * s, 10);
  fx.add.emit({ pos: p.clone().setY(0.5), shape: SHAPE.SPIKES, size: 3.0 * s, sizeEnd: 4.2 * s, life: 0.1, color: [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55], alphaEnd: 0 });
  for (let i = 0; i < 10 * s; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.debris.rock.emit({ pos: p.clone().setY(0.15), vel: new THREE.Vector3(Math.cos(a) * rand(2, 5), rand(4, 8), Math.sin(a) * rand(2, 5)), scale: rand(0.06, 0.14), life: rand(1, 1.6) });
  }
  fx.light(p.clone().setY(1), color, 1.6, 5.5 * s, 0.2);
  G.rig.shake(0.35 * s);
  G.audio?.play('slam', { pos: p, vol: 0.8 });
  // knock nearby grounded dummies
  for (const d of G.dummies.list) {
    const dx = d.pos.x - pos.x, dz = d.pos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3.2 * s && d.pos.y < 1.5) {
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      hit(d, { dir, kb: 5 * s, lift: 7 * s, hitstop: 0.06, shake: 0.0, kind: 'none', dmg: Math.round(60 * s), sound: null });
    }
  }
}
