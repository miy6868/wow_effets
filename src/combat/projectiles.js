// Projectiles: swept-segment collision against dummy capsules and the ground.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { segmentQuery } from './combat.js';

export class Projectiles {
  constructor() { this.list = []; }

  /**
   * o: { pos, vel, life, radius, gravity, drag, pierce, onHit(proj, dummy, point),
   *      onGround(proj, point), onExpire(proj), render(proj, dt), homing }
   */
  spawn(o) {
    const p = {
      pos: o.pos.clone(), prev: o.pos.clone(), vel: o.vel.clone(), life: o.life ?? 2, age: 0,
      radius: o.radius ?? 0.05, gravity: o.gravity ?? 0, drag: o.drag ?? 0, pierce: o.pierce ?? 0,
      hitSet: new Set(), dead: false, ...o,
    };
    p.pos = o.pos.clone(); p.prev = o.pos.clone(); p.vel = o.vel.clone();
    this.list.push(p);
    return p;
  }

  update(dt) {
    if (dt <= 0) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      p.prev.copy(p.pos);
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.gravity * dt;
      if (p.steer) p.steer(p, dt);
      p.pos.addScaledVector(p.vel, dt);
      // dummies
      let hitRes = segmentQuery(p.prev, p.pos, p.radius, p.hitSet);
      while (hitRes && !p.dead) {
        p.hitSet.add(hitRes.d);
        p.onHit?.(p, hitRes.d, hitRes.point);
        if (p.pierce-- <= 0) { p.dead = true; p.pos.copy(hitRes.point); break; }
        hitRes = segmentQuery(p.prev, p.pos, p.radius, p.hitSet);
      }
      // ground
      if (!p.dead && p.pos.y <= 0.02) {
        const k = p.prev.y / Math.max(1e-5, p.prev.y - p.pos.y);
        const gp = p.prev.clone().lerp(p.pos, Math.min(1, Math.max(0, k)));
        gp.y = 0.02;
        p.pos.copy(gp);
        p.dead = true;
        p.onGround?.(p, gp);
      }
      if (!p.dead && p.age >= p.life) { p.dead = true; p.onExpire?.(p); }
      p.render?.(p, dt);
      if (p.dead) { p.onDead?.(p); this.list.splice(i, 1); }
    }
  }

  clear() { for (const p of this.list) p.onDead?.(p); this.list.length = 0; }
}
