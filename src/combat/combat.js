// Hit resolution: applies knockback/hitstop to the target, hitstop to the
// attacker, camera feedback, hit effects, damage numbers and sound.
import * as THREE from 'three';
import { G } from '../ctx.js';
import { FXP } from '../vfx/presets.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * h: {
 *   dir: Vector3 (knockback direction), point?: Vector3, from?: Vector3 (attacker position for surface point),
 *   kb, lift, hitstop, atkStop, shake, kick, kind ('slash'|'heavy'|'pierce'|'bullet'|'none'),
 *   color, tangent, dmg, spin, sound, fx(point, dir, target), set (Vector3 explicit velocity)
 * }
 */
export function hit(target, h) {
  const S = G.settings;
  const dir = _v.copy(h.dir); dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const point = h.point ? h.point.clone() : target.surfacePoint(h.from ?? G.player.pos.clone().setY(1.2), new THREE.Vector3());
  const stop = (h.hitstop ?? 0.06) * S.hitstop;
  target.takeHit({ ...h, dir: dir.clone(), hitstop: stop });
  if (h.atkStop && G.player) G.player.addHitstop(h.atkStop * S.hitstop);

  const fdir = h.fxDir ? h.fxDir : dir;
  switch (h.kind ?? 'slash') {
    case 'slash': FXP.hitSlash(point, fdir, h.tangent ?? new THREE.Vector3(1, 0, 0), h.color, h.fxScale ?? 1); break;
    case 'heavy': FXP.hitHeavy(point, fdir, h.color, h.fxScale ?? 1); break;
    case 'pierce': FXP.hitPierce(point, fdir, h.color, h.fxScale ?? 1); break;
    case 'bullet': FXP.hitBullet(point, fdir, h.color, h.fxScale ?? 1); break;
  }
  if (h.fx) h.fx(point, fdir, target);

  if (h.shake) G.rig.shake(h.shake * S.shake);
  if (h.kick) G.rig.kick(fdir, h.kick * S.shake);
  if (h.dmg !== undefined) G.hud?.damage(point, h.dmg, h.crit);
  if (h.combo !== false) G.hud?.combo();
  if (h.sound !== null) G.audio?.play(h.sound ?? 'hitSlash', { pos: point, vol: h.vol ?? 1, pitch: h.pitch });
  return point;
}

/** Dummies inside a horizontal sector in front of `origin`. */
export function sectorQuery(origin, fwd, range, arcDeg, yMin = -0.5, yMax = 3, exclude = null) {
  const out = [];
  const cosHalf = Math.cos(THREE.MathUtils.degToRad(arcDeg * 0.5));
  for (const d of G.dummies.list) {
    if (exclude && exclude.has(d)) continue;
    _a.subVectors(d.pos, origin);
    const dy = d.pos.y - origin.y;
    if (dy < yMin - d.height || dy > yMax) continue;
    _a.y = 0;
    const dist = _a.length() - d.radius;
    if (dist > range) continue;
    if (dist > 0.3) {
      _a.normalize();
      if (_a.dot(fwd) < cosHalf) continue;
    }
    out.push({ d, dist });
  }
  out.sort((x, y) => x.dist - y.dist);
  return out.map((x) => x.d);
}

/** Dummies within a sphere. */
export function sphereQuery(center, radius, exclude = null) {
  const out = [];
  for (const d of G.dummies.list) {
    if (exclude && exclude.has(d)) continue;
    d.center(_a);
    const dy = THREE.MathUtils.clamp(center.y, d.pos.y, d.pos.y + d.height) - center.y;
    _b.set(_a.x - center.x, dy, _a.z - center.z);
    if (_b.length() < radius + d.radius) out.push(d);
  }
  return out;
}

/**
 * Segment p0→p1 vs dummy capsules (radius extra `r`). Returns {d, t, point} of
 * the first hit or null.
 */
export function segmentQuery(p0, p1, r = 0, exclude = null) {
  let best = null;
  const seg = _a.subVectors(p1, p0);
  const len = seg.length();
  if (len < 1e-6) return null;
  const dir = seg.clone().multiplyScalar(1 / len);
  for (const d of G.dummies.list) {
    if (exclude && exclude.has(d)) continue;
    // capsule axis
    let c0, c1;
    if (d.state === 'down' || d.state === 'getup' || d.state === 'air') {
      const c = d.center(new THREE.Vector3());
      c0 = c; c1 = c;
    } else {
      c0 = new THREE.Vector3(d.pos.x, d.pos.y + d.radius, d.pos.z);
      c1 = new THREE.Vector3(d.pos.x, d.pos.y + d.height - d.radius * 0.6, d.pos.z);
    }
    const res = closestSegSeg(p0, p1, c0, c1);
    const rad = d.radius + r + (c0 === c1 ? 0.3 * d.s : 0);
    if (res.dist < rad) {
      const back = Math.sqrt(Math.max(0, rad * rad - res.dist * res.dist));
      const t = Math.max(0, res.s * len - back) / len;
      if (!best || t < best.t) best = { d, t, point: p0.clone().addScaledVector(dir, t * len) };
    }
  }
  return best;
}

function closestSegSeg(p1, q1, p2, q2) {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (e <= 1e-8) { s = THREE.MathUtils.clamp(-d1.dot(r) / a, 0, 1); t = 0; }
  else {
    const c = d1.dot(r), b = d1.dot(d2);
    const denom = a * e - b * b;
    s = denom > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return { s, t, dist: c1.distanceTo(c2) };
}

/** Pick a soft-lock target: nearest dummy in a cone around `dir`. */
export function softTarget(origin, dir, range = 7, arcDeg = 150) {
  let best = null, bestScore = Infinity;
  const cosHalf = Math.cos(THREE.MathUtils.degToRad(arcDeg / 2));
  for (const d of G.dummies.list) {
    _a.subVectors(d.pos, origin); _a.y = 0;
    const dist = _a.length();
    if (dist > range) continue;
    _a.normalize();
    const c = _a.dot(dir);
    if (dist > 1.2 && c < cosHalf) continue;
    const score = dist * (1.6 - c);
    if (score < bestScore) { bestScore = score; best = d; }
  }
  return best;
}
