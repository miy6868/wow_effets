// ─────────────────────────────────────────────────────────────────────────────
//  Cartoon (cel) rendering shaders
//
//  - toon:     2-step cel shading with a hue-shifted shadow color, a soft
//              mid-highlight band, stepped specular, lit-side rim light,
//              toon-stepped dynamic point lights (muzzle flashes, explosions...)
//              and a hit-flash override.
//  - outline:  inverted-hull outline extruded in clip space along *smoothed*
//              normals so hard-edged shapes do not crack open at corners.
//  - ground:   the arena floor: procedural stone tiles + the same cel lighting
//              and point lights so effects light up the floor.
//
//  All math is done in linear HDR space; the post pipeline tone maps.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const MAX_PLIGHTS = 8;

// Uniforms shared by every toon material (same object instances → one update).
export const toonGlobals = {
  uLightDir: { value: new THREE.Vector3(-0.45, 0.8, 0.35).normalize() },
  uLightColor: { value: new THREE.Color(1.0, 0.96, 0.9) },
  uSkyAmb: { value: new THREE.Color(1.0, 1.0, 1.0) },
  uGroundAmb: { value: new THREE.Color(0.85, 0.85, 0.95) },
  uRimColor: { value: new THREE.Color(0.75, 0.85, 1.0) },
  uFogColor: { value: new THREE.Color(0.3, 0.35, 0.5) },
  uFog: { value: new THREE.Vector2(40, 140) },
  uPLPos: { value: Array.from({ length: MAX_PLIGHTS }, () => new THREE.Vector4(0, -100, 0, 0.001)) },
  uPLCol: { value: Array.from({ length: MAX_PLIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1280, 720) },
  uWorldDim: { value: 0 }, // 0..1 darkens the world (ultimate cut-ins)
};

const lightingChunk = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uSkyAmb;
  uniform vec3 uGroundAmb;
  uniform vec3 uRimColor;
  uniform vec3 uFogColor;
  uniform vec2 uFog;
  uniform vec4 uPLPos[${MAX_PLIGHTS}];
  uniform vec4 uPLCol[${MAX_PLIGHTS}];
  uniform float uWorldDim;

  float aaStep(float edge, float x) {
    float w = max(fwidth(x), 1e-4) * 0.75;
    return smoothstep(edge - w, edge + w, x);
  }

  // Toon-stepped point lights. Distance falloff is smooth, N.L is stepped.
  vec3 toonPointLights(vec3 P, vec3 N, vec3 base) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < ${MAX_PLIGHTS}; i++) {
      vec4 lp = uPLPos[i];
      vec4 lc = uPLCol[i];
      if (lc.a <= 0.0) continue;
      vec3 d = lp.xyz - P;
      float dist = length(d);
      float att = clamp(1.0 - dist / lp.w, 0.0, 1.0);
      att *= att;
      float nd = dot(N, d / max(dist, 1e-4));
      float s = 0.25 + 0.75 * aaStep(0.05, nd);
      acc += (base * 0.75 + 0.25) * lc.rgb * lc.a * att * s;
    }
    return acc;
  }

  vec3 applyFog(vec3 col, vec3 P) {
    float f = smoothstep(uFog.x, uFog.y, length(P - cameraPosition));
    return mix(col, uFogColor, f);
  }
`;

// ── Toon ─────────────────────────────────────────────────────────────────────
export const toonVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vInstColor;
  void main() {
    vec4 lp = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      lp = instanceMatrix * lp;
      n = mat3(instanceMatrix) * n;
    #endif
    vInstColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vInstColor = instanceColor;
    #endif
    vLocal = position;
    vec4 wp = modelMatrix * lp;
    vPosW = wp.xyz;
    vec3 nv = normalize(normalMatrix * n);
    vNormalW = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const toonFragment = /* glsl */ `
  ${lightingChunk}
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec4 uFlash;      // rgb, amount
  uniform float uRim;
  uniform float uSpec;
  uniform float uEmissive;
  uniform float uOpacity;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vInstColor;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uLightDir);
    vec3 base = uColor * vInstColor;
    vec3 shade = uShade * vInstColor;

    float ndl = dot(N, L);
    float lit = aaStep(0.02, ndl);
    float hi = aaStep(0.62, ndl);
    vec3 col = mix(shade, base, lit);
    col = mix(col, base * 1.12 + 0.015, hi * 0.55);

    // hemispheric ambient tint (subtle, keeps flat anime colors)
    col *= mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5) * uLightColor;

    // stepped specular
    vec3 H = normalize(L + V);
    col += aaStep(0.965, dot(N, H)) * uSpec * uLightColor * 0.55;

    // rim light (stronger on the lit side)
    float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
    float rim = aaStep(0.7, fres + 0.12 * ndl) * uRim;
    col += rim * uRimColor * (0.35 + 0.4 * lit) * (base + 0.25);

    col += toonPointLights(vPosW, N, base);
    col += base * uEmissive;
    col *= 1.0 - uWorldDim * 0.75;
    col = mix(col, uFlash.rgb, uFlash.a);
    col = applyFog(col, vPosW);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

// ── Outline (inverted hull) ──────────────────────────────────────────────────
export const outlineVertex = /* glsl */ `
  attribute vec3 outlineNormal;
  uniform float uWidth;     // in pixels at ~8m
  uniform vec2 uResolution;
  void main() {
    vec4 lp = vec4(position, 1.0);
    vec3 n = outlineNormal;
    #ifdef USE_INSTANCING
      lp = instanceMatrix * lp;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 clip = projectionMatrix * modelViewMatrix * lp;
    vec3 nv = normalize(normalMatrix * n);
    vec2 sdir = (projectionMatrix * vec4(nv, 0.0)).xy * uResolution;
    float len = length(sdir);
    sdir = len > 1e-5 ? sdir / len : vec2(0.0);
    float px = uWidth * clamp(9.0 / clip.w, 0.45, 1.25) * (uResolution.y / 900.0);
    clip.xy += sdir * px * 2.0 / uResolution * clip.w;
    // nudge back a hair to avoid z-fighting with thin parts
    clip.z += 0.0004 * clip.w;
    gl_Position = clip;
  }
`;

export const outlineFragment = /* glsl */ `
  uniform vec3 uOutlineColor;
  uniform vec4 uFlash;
  uniform float uOpacity;
  uniform vec3 uFogColor;
  uniform float uWorldDim;
  void main() {
    vec3 c = mix(uOutlineColor, uFlash.rgb * 0.5, uFlash.a * 0.12);
    gl_FragColor = vec4(c, uOpacity);
  }
`;

// ── Ground ───────────────────────────────────────────────────────────────────
export const groundVertex = /* glsl */ `
  varying vec3 vPosW;
  varying vec3 vNormalW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const groundFragment = /* glsl */ `
  ${lightingChunk}
  uniform vec3 uStoneA;
  uniform vec3 uStoneB;
  uniform vec3 uGrout;
  uniform vec3 uGrass;
  uniform vec3 uGrassDark;
  uniform float uArenaR;
  varying vec3 vPosW;
  varying vec3 vNormalW;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 p = vPosW.xz;
    float r = length(p);
    vec3 N = normalize(vNormalW);
    vec3 col;

    // ── stone plaza: concentric rings of tiles ──
    float ang = atan(p.y, p.x);
    float ringW = 2.2;
    float ringIdx = floor(r / ringW);
    float segs = max(6.0, floor(ringIdx * 6.0 + 6.0));
    float a01 = ang / 6.2831853 + 0.5 + hash12(vec2(ringIdx, 7.0)) * 0.5;
    float segIdx = floor(a01 * segs);
    vec2 tileId = vec2(ringIdx, segIdx);
    float fr = fract(r / ringW);
    float fa = fract(a01 * segs);
    // grout distance in meters
    float gR = min(fr, 1.0 - fr) * ringW;
    float gA = min(fa, 1.0 - fa) * (6.2831853 * max(r, 0.5) / segs);
    float grout = min(gR, gA);
    float tileRnd = hash12(tileId);
    vec3 stone = mix(uStoneA, uStoneB, tileRnd);
    // subtle large-scale variation in two flat steps
    float big = vnoise(p * 0.15);
    stone *= 0.94 + 0.08 * step(0.5, big);
    // tiny worn speckles
    float speck = step(0.93, vnoise(p * 3.1 + tileRnd * 10.0));
    stone *= 1.0 - speck * 0.08;
    float gw = fwidth(grout) * 0.8 + 1e-4;
    float isGrout = 1.0 - smoothstep(0.028 - gw, 0.028 + gw, grout);
    vec3 plaza = mix(stone, uGrout, isGrout);
    // center emblem rings
    float ringLine = abs(r - 5.0);
    ringLine = min(ringLine, abs(r - 5.6));
    float lw = fwidth(r);
    plaza = mix(plaza, uGrout * 1.25, 1.0 - smoothstep(0.035 - lw, 0.035 + lw, ringLine));

    // ── grass outside the plaza ──
    float gN = vnoise(p * 0.11) * 0.7 + vnoise(p * 0.45) * 0.3;
    float gw2 = fwidth(gN) + 1e-4;
    vec3 grass = mix(uGrassDark, uGrass, smoothstep(0.5 - gw2, 0.5 + gw2, gN));
    float edge = r - uArenaR;
    float ew = fwidth(r);
    float onPlaza = 1.0 - smoothstep(-ew, ew, edge + (vnoise(p * 2.0) - 0.5) * 0.25);
    // stone border ring
    float border = 1.0 - smoothstep(0.5 - ew, 0.5 + ew, abs(edge + 0.5));
    col = mix(grass, plaza, onPlaza);
    col = mix(col, uStoneB * 0.8, border * 0.85);

    // lighting: ground is mostly lit, shadows come from blob decals
    vec3 L = normalize(uLightDir);
    float ndl = dot(N, L);
    col *= mix(uGroundAmb, uSkyAmb, 0.85) * uLightColor * (0.85 + 0.15 * ndl);
    col += toonPointLights(vPosW, N, col * 1.3);
    col *= 1.0 - uWorldDim * 0.8;
    col = applyFog(col, vPosW);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── material factories ───────────────────────────────────────────────────────
const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

/** Shadow color: darker and cooler (multiplied toward violet), a bit more saturated. */
export function deriveShade(color, amount = 1) {
  const c = new THREE.Color(color);
  const k = amount;
  c.r *= 1 - 0.36 * k; c.g *= 1 - 0.42 * k; c.b *= 1 - 0.24 * k;
  c.getHSL(_hsl);
  return _c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.12 + 0.03), _hsl.l).clone();
}

export function deriveOutline(color) {
  const c = new THREE.Color(color);
  c.getHSL(_hsl);
  return new THREE.Color().setHSL(_hsl.h, Math.min(1, _hsl.s * 0.9 + 0.1), Math.max(0.015, _hsl.l * 0.18));
}

export function makeToonMaterial(opts = {}) {
  const color = new THREE.Color(opts.color ?? 0xffffff);
  const shade = opts.shade !== undefined ? new THREE.Color(opts.shade) : deriveShade(color, opts.shadeAmount ?? 1);
  const flash = opts.flash || { value: new THREE.Vector4(1, 1, 1, 0) };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...toonGlobals,
      uColor: { value: color },
      uShade: { value: shade },
      uFlash: flash,
      uRim: { value: opts.rim ?? 0.6 },
      uSpec: { value: opts.spec ?? 0.0 },
      uEmissive: { value: opts.emissive ?? 0.0 },
      uOpacity: { value: opts.opacity ?? 1.0 },
    },
    vertexShader: toonVertex,
    fragmentShader: toonFragment,
    transparent: !!opts.transparent,
    side: opts.side ?? THREE.FrontSide,
  });
  mat.userData.isToon = true;
  return mat;
}

export function makeOutlineMaterial(opts = {}) {
  const flash = opts.flash || { value: new THREE.Vector4(1, 1, 1, 0) };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: toonGlobals.uResolution,
      uWorldDim: toonGlobals.uWorldDim,
      uFogColor: toonGlobals.uFogColor,
      uWidth: { value: opts.width ?? 2.2 },
      uOutlineColor: { value: new THREE.Color(opts.color ?? 0x101018) },
      uFlash: flash,
      uOpacity: { value: opts.opacity ?? 1.0 },
    },
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    side: THREE.BackSide,
    transparent: !!opts.transparent,
  });
  mat.userData.isOutline = true;
  return mat;
}

export function makeGroundMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...toonGlobals,
      uStoneA: { value: new THREE.Color(opts.stoneA ?? 0x7f879c) },
      uStoneB: { value: new THREE.Color(opts.stoneB ?? 0x727a8f) },
      uGrout: { value: new THREE.Color(opts.grout ?? 0x5a5f76) },
      uGrass: { value: new THREE.Color(opts.grass ?? 0x6f9a63) },
      uGrassDark: { value: new THREE.Color(opts.grassDark ?? 0x5b8352) },
      uArenaR: { value: opts.arenaR ?? 26 },
    },
    vertexShader: groundVertex,
    fragmentShader: groundFragment,
  });
}
