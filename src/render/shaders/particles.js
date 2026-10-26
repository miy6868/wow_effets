// Instanced billboard particles. Shapes are analytic (SDF) so no textures are
// needed. Velocity-stretched quads make sparks read as streaks.
export const SHAPE = {
  GLOW: 0, DOT: 1, STAR: 2, RING: 3, STREAK: 4, SMOKE: 5, SHARD: 6, DIAMOND: 7,
  FLARE: 8, CROSS: 9, SOFTRING: 10, FLAME: 11, SPIKES: 12, HALO: 13,
};

export const particleVertex = /* glsl */ `
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iColor;
  attribute vec4 iSize;   // x: width, y: height, z: stretch (s), w: head anchor (0 center, 1 head)
  attribute vec4 iMisc;   // x: rotation, y: shape, z: life01, w: seed
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vShape;
  varying float vLife;
  varying float vSeed;
  varying float vAspect;
  void main() {
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    vec2 corner = position.xy;
    vec2 size = iSize.xy;
    vec2 ax, ay;
    float yo = corner.y;
    if (iSize.z > 0.0) {
      vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
      // perspective-correct-ish screen direction of velocity
      vec2 d = vv.xy - mv.xy * (vv.z / min(mv.z, -0.01));
      float l = length(d);
      ay = l > 1e-5 ? d / l : vec2(0.0, 1.0);
      ax = vec2(-ay.y, ay.x);
      size.y += length(iVel) * iSize.z;
      yo = mix(corner.y, corner.y - 0.5, iSize.w);
    } else {
      float c = cos(iMisc.x), s = sin(iMisc.x);
      ax = vec2(c, s); ay = vec2(-s, c);
    }
    mv.xy += ax * corner.x * size.x + ay * yo * size.y;
    gl_Position = projectionMatrix * mv;
    vUv = corner * 2.0;
    vColor = iColor;
    vShape = iMisc.y;
    vLife = iMisc.z;
    vSeed = iMisc.w;
    vAspect = size.y / max(size.x, 1e-4);
  }
`;

export const particleFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vShape;
  varying float vLife;
  varying float vSeed;
  varying float vAspect;
  uniform float uAlphaMode; // 0 additive, 1 alpha blend

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
    vec2 uv = vUv;
    float d = length(uv);
    int sh = int(vShape + 0.5);
    float a = 0.0;
    vec3 col = vColor.rgb;
    if (sh == 0) {            // GLOW
      a = exp(-d * d * 4.5) * (1.0 - smoothstep(0.85, 1.0, d));
    } else if (sh == 1) {     // DOT (cel)
      float w = fwidth(d) * 1.2;
      a = 1.0 - smoothstep(0.82 - w, 0.82 + w, d);
      col *= 1.0 + 0.5 * (1.0 - smoothstep(0.0, 0.5, d));
    } else if (sh == 2) {     // STAR (4-point sparkle)
      float x = abs(uv.x), y = abs(uv.y);
      float rays = max(1.0 - x * 9.0 - y * 0.9, 0.0) + max(1.0 - y * 9.0 - x * 0.9, 0.0);
      float core = exp(-d * d * 18.0);
      a = clamp(rays * 1.2 + core, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, d));
      col *= 1.0 + core * 1.5;
    } else if (sh == 3) {     // RING (crisp)
      float w = fwidth(d) * 1.5 + 0.02;
      a = 1.0 - smoothstep(0.0, w + 0.06, abs(d - 0.84));
    } else if (sh == 4) {     // STREAK (bright core, soft sides)
      float x = abs(uv.x);
      float y = uv.y * 0.5 + 0.5; // 0 tail .. 1 head
      a = (1.0 - smoothstep(0.0, 1.0, x)) * smoothstep(0.0, 0.5, y) * (1.0 - smoothstep(0.92, 1.0, y));
      a = pow(a, 1.3);
      col *= 1.0 + (1.0 - smoothstep(0.0, 0.35, x)) * 1.2;
    } else if (sh == 5) {     // SMOKE puff (cel, alpha)
      float n = vnoise(uv * 2.2 + vSeed * 37.0) * 0.6 + vnoise(uv * 4.7 - vSeed * 13.0) * 0.4;
      float m = (1.0 - d) + (n - 0.5) * 0.8;
      float edge = 0.18 + vLife * 0.45;
      float w = fwidth(m) * 1.5;
      a = smoothstep(edge - w, edge + w, m);
      // 2-tone cel shading: light from upper-left
      float lit = step(0.0, dot(uv, vec2(-0.6, 0.8)) + (n - 0.5) * 0.6 + 0.15);
      col *= mix(0.68, 1.0, lit);
    } else if (sh == 6) {     // SHARD (triangle)
      vec2 p = uv;
      float tri = max(abs(p.x) * 1.732 + p.y, -p.y * 2.0) - 0.9;
      float w = fwidth(tri);
      a = 1.0 - smoothstep(-w, w, tri);
      col *= 1.0 + 0.6 * step(p.x, 0.0);
    } else if (sh == 7) {     // DIAMOND
      float m = abs(uv.x) + abs(uv.y);
      float w = fwidth(m);
      a = 1.0 - smoothstep(0.9 - w, 0.9 + w, m);
      col *= 1.0 + 1.2 * (1.0 - smoothstep(0.0, 0.5, m));
    } else if (sh == 8) {     // FLARE (anamorphic streak)
      float y = abs(uv.y);
      float x = abs(uv.x);
      a = exp(-y * y * 40.0) * (1.0 - x * x);
      a += exp(-d * d * 10.0) * 0.6;
    } else if (sh == 9) {     // CROSS (thin + lines)
      float x = abs(uv.x), y = abs(uv.y);
      a = max(exp(-x * x * 900.0) * (1.0 - y), exp(-y * y * 900.0) * (1.0 - x));
      a += exp(-d * d * 30.0);
    } else if (sh == 10) {    // SOFTRING (shock ring)
      a = exp(-pow((d - 0.78) * 7.0, 2.0)) * (1.0 - smoothstep(0.9, 1.0, d));
    } else if (sh == 11) {    // FLAME (teardrop, cel bands)
      vec2 p = uv;
      p.y += 0.25;
      float r = length(vec2(p.x * (1.2 + max(p.y, 0.0) * 1.4), p.y * 0.85));
      float n = vnoise(vec2(uv.x * 3.0, uv.y * 2.0 - vLife * 6.0) + vSeed * 20.0);
      float m = 1.0 - r + (n - 0.5) * 0.35;
      float w = fwidth(m) * 1.5;
      a = smoothstep(0.25 - w, 0.25 + w, m);
      float core = smoothstep(0.55 - w, 0.55 + w, m);
      col = mix(col, col * 1.8 + 0.6, core);
    } else if (sh == 12) {    // SPIKES (impact burst lines)
      float ang = atan(uv.y, uv.x);
      float k = floor((ang + 3.14159) / 6.28318 * 12.0);
      float rnd = hash12(vec2(k, vSeed * 91.0));
      float spoke = abs(fract((ang + 3.14159) / 6.28318 * 12.0) - 0.5) * 2.0;
      float len = 0.55 + rnd * 0.45;
      float wid = (1.0 - d / len) * 0.45;
      a = step(spoke, wid) * step(0.25, d) * step(d, len);
      a = max(a, exp(-d * d * 30.0));
    } else {                  // HALO (soft disc + crisp rim)
      a = exp(-d * d * 3.0) * 0.5 + (1.0 - smoothstep(0.0, 0.08, abs(d - 0.9))) * 0.8;
      a *= 1.0 - smoothstep(0.95, 1.0, d);
    }
    a *= vColor.a;
    if (a < 0.003) discard;
    if (uAlphaMode > 0.5) gl_FragColor = vec4(col, a);
    else gl_FragColor = vec4(col * a, a);
  }
`;
