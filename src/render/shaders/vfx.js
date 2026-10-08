// Shaders for mesh-based effects. Every effect outputs linear HDR color
// (values > 1 are picked up by bloom).
const noiseChunk = /* glsl */ `
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
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + 11.3; a *= 0.5; }
    return s;
  }
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
    float e = hash13(i + vec3(0, 0, 1)), f1 = hash13(i + vec3(1, 0, 1)), g = hash13(i + vec3(0, 1, 1)), h = hash13(i + vec3(1, 1, 1));
    return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
  }
`;
export { noiseChunk };

export const basicVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// ── Crescent slash (검기) ────────────────────────────────────────────────────
// Unit strip geometry: uv.x along the arc, uv.y inner(0)→outer(1).
export const slashVertex = /* glsl */ `
  uniform float uA0, uA1, uRin, uRout, uCone;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float a = mix(uA0, uA1, uv.x);
    float r = mix(uRin, uRout, uv.y);
    // cone: the inner edge drops out of the plane so the band reads even edge-on
    vec3 p = vec3(sin(a) * r, -(1.0 - uv.y) * uCone, cos(a) * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const slashFragment = /* glsl */ `
  ${noiseChunk}
  uniform float uHead;     // 0..1 sweep progress (leading edge in uv.x)
  uniform float uTail;     // visible tail length (uv.x units)
  uniform float uFade;     // 0..1 erosion after the swing
  uniform float uSeed;
  uniform float uWidth;    // 0..1 band thickness (fraction of radial span)
  uniform vec3 uColor;     // body color (HDR)
  uniform vec3 uCore;      // edge color (HDR)
  uniform float uAlpha;
  uniform float uStreak;   // strand noise strength
  varying vec2 vUv;
  void main() {
    float u = vUv.x, v = vUv.y;
    float behind = uHead - u;
    if (behind < 0.0) discard;
    float tail = 1.0 - smoothstep(uTail * 0.25, uTail, behind);
    float uu = clamp(u, 0.0, 1.0);
    // crescent thickness: tapered ends, thinner toward the leading head and the old tail
    float thick = pow(sin(3.14159 * pow(uu, 0.85)), 0.8) * uWidth;
    thick *= 0.35 + 0.65 * smoothstep(0.0, 0.12, behind + 0.01);
    thick *= mix(0.45, 1.0, tail);
    thick = max(thick, 1e-3);
    float d = 1.0 - v;                     // 0 at the outer (cutting) edge
    // strands run parallel to the arc
    float sN = vnoise(vec2(u * 3.0 + uSeed * 7.0, v * 24.0));
    float sN2 = vnoise(vec2(u * 7.0 - uSeed * 3.0, v * 10.0));
    float x = d / thick + (sN - 0.5) * 0.45 * uStreak;
    float limit = 1.0 - uFade * 1.15 + (sN2 - 0.5) * 0.5 * min(uFade * 8.0, 1.0);
    float w = fwidth(x) * 1.2 + 0.01;
    float body = 1.0 - smoothstep(limit - w, limit + w, x);
    float core = 1.0 - smoothstep(0.12 - w, 0.12 + w, x + (1.0 - tail) * 0.25 + uFade * 0.3);
    float mid = 1.0 - smoothstep(0.48 - w, 0.48 + w, x);
    vec3 col = mix(uColor * 0.38, uColor, mid);
    col = mix(col, uCore, core);
    float headGlow = exp(-behind * 9.0);
    col *= 1.0 + headGlow * 0.7;
    float a = body * tail * uAlpha * (1.0 - smoothstep(0.55, 1.0, x) * 0.55);
    if (a < 0.002) discard;
    gl_FragColor = vec4(col * a, 0.0);
  }
`;

// ── Flat ring / disc (shockwaves on ground, camera-facing pulses) ───────────
export const ringFragment = /* glsl */ `
  ${noiseChunk}
  uniform float uR;       // ring radius (0..1 of quad half-size)
  uniform float uW;       // ring width
  uniform float uFill;    // inner fill amount
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uNoise;
  uniform float uSeed;
  uniform float uSharp;   // 0 soft, 1 crisp cel edge
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float n = vnoise(vec2(ang * 6.0 + uSeed * 20.0, r * 4.0 - uR * 3.0));
    float rr = r + (n - 0.5) * uNoise;
    float x = (rr - uR) / max(uW, 1e-3);
    float soft = exp(-x * x * 2.5) * (x > 0.0 ? 1.0 : 1.0);
    float w = fwidth(x) * 1.5;
    float crisp = 1.0 - smoothstep(1.0 - w, 1.0 + w, abs(x));
    float band = mix(soft, crisp, uSharp);
    float inner = (1.0 - smoothstep(uR - uW, uR, rr)) * uFill;
    float a = max(band, inner * 0.5) * uAlpha * (1.0 - smoothstep(0.96, 1.0, r));
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a, 0.0);
  }
`;

// ── Fresnel sphere (flashes, energy shells, black hole rims) ────────────────
export const fresnelFragment = /* glsl */ `
  ${noiseChunk}
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uAlpha;
  uniform float uPower;
  uniform float uCore;     // how bright the center is
  uniform float uNoise;
  uniform float uTime;
  uniform float uDissolve;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 V = normalize(cameraPosition - vPosW);
    float ndv = abs(dot(normalize(vNormalW), V));
    float fres = pow(1.0 - ndv, uPower);
    float n = fbm(vUv * vec2(8.0, 4.0) + vec2(uTime * 0.7, -uTime * 1.3));
    float k = fres + uCore * ndv * ndv;
    k *= mix(1.0, 0.5 + n, uNoise);
    if (uDissolve > 0.0 && n < uDissolve) discard;
    vec3 col = mix(uColor, uCoreColor, ndv * ndv);
    float a = k * uAlpha;
    gl_FragColor = vec4(col * a, 0.0);
  }
`;

// ── Ribbons (tracers, lightning, cut lines, weapon trails) ──────────────────
// geometry attributes: position (world), uv.x along (0 tail → 1 head), uv.y across (0..1)
export const ribbonVertex = /* glsl */ `
  attribute float aFade;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    vFade = aFade;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

export const ribbonFragment = /* glsl */ `
  ${noiseChunk}
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uAlpha;
  uniform float uCoreWidth;
  uniform float uHeadFade;
  uniform float uTailFade;
  uniform float uNoise;
  uniform float uTime;
  uniform float uMode;    // 0: centered glow line, 1: edge-weighted trail (bright at uv.y = 1)
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float y = vUv.y * 2.0 - 1.0;
    float along = vUv.x;
    float glow, core;
    if (uMode < 0.5) {
      glow = exp(-y * y * 3.0) * (1.0 - smoothstep(0.85, 1.0, abs(y)));
      core = 1.0 - smoothstep(uCoreWidth * 0.5, uCoreWidth, abs(y));
    } else {
      float e = vUv.y;
      glow = smoothstep(0.0, 1.0, e) * (1.0 - smoothstep(0.97, 1.0, e));
      core = smoothstep(1.0 - uCoreWidth, 1.0 - uCoreWidth * 0.3, e) * (1.0 - smoothstep(0.985, 1.0, e));
    }
    float n = vnoise(vec2(along * 18.0 - uTime * 10.0, vUv.y * 3.0));
    glow *= mix(1.0, 0.4 + n, uNoise);
    float lenFade = smoothstep(0.0, max(uTailFade, 1e-3), along) * (1.0 - smoothstep(1.0 - uHeadFade, 1.0, along));
    float a = (glow * 0.8 + core) * lenFade * vFade * uAlpha;
    if (a < 0.002) discard;
    vec3 col = uColor * glow + uCore * core;
    gl_FragColor = vec4(col * lenFade * vFade * uAlpha, 0.0);
  }
`;

// ── Ground decals (premultiplied: darkens AND/OR glows) ─────────────────────
export const decalFragment = /* glsl */ `
  ${noiseChunk}
  uniform float uType;     // 0 scorch, 1 crack, 2 frost, 3 magic circle, 4 glow disc
  uniform vec3 uColor;     // tint / glow color (HDR)
  uniform vec3 uDark;
  uniform float uAlpha;
  uniform float uGlow;     // emissive amount (fades faster)
  uniform float uSeed;
  uniform float uTime;
  uniform float uSpin;
  uniform float uReveal;   // 0..1 reveal (magic circle draw-in, crack spread)
  varying vec2 vUv;

  vec2 voronoi(vec2 x) {
    vec2 n = floor(x), f = fract(x);
    float md = 8.0, md2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash12(n + g + uSeed * 17.0), hash12(n + g + 41.3 + uSeed * 9.0));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md2 = md; md = d; } else if (d < md2) { md2 = d; }
    }
    return vec2(sqrt(md), sqrt(md2));
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    vec3 rgb = vec3(0.0);
    float a = 0.0;
    int t = int(uType + 0.5);
    if (t == 0) {
      float n = fbm(p * 3.0 + uSeed * 10.0);
      float m = 1.0 - r + (n - 0.5) * 0.7;
      float w = fwidth(m) * 1.5;
      float dark = smoothstep(0.25 - w, 0.25 + w, m);
      float dark2 = smoothstep(0.5 - w, 0.5 + w, m);
      a = (dark * 0.55 + dark2 * 0.25) * uAlpha;
      rgb = uDark * a;
      float ember = smoothstep(0.62, 0.7, n) * dark2;
      rgb += uColor * ember * uGlow;
    } else if (t == 1) {
      // radial cracks: voronoi edges stretched radially
      vec2 q = vec2(ang * 2.2, log(r + 0.05) * 2.6);
      vec2 v = voronoi(q * 1.6);
      float edge = v.y - v.x;
      float w = fwidth(edge) * 1.2;
      float crack = 1.0 - smoothstep(0.04 - w, 0.06 + w, edge);
      float reach = smoothstep(uReveal * 1.05, uReveal * 0.85, r);
      crack *= reach * (1.0 - smoothstep(0.85, 1.0, r));
      float crater = 1.0 - smoothstep(0.18, 0.32 + 0.05 * vnoise(p * 9.0), r);
      a = (crack * 0.9 + crater * 0.5) * uAlpha;
      rgb = uDark * a + uColor * crack * uGlow * (1.0 - r);
    } else if (t == 2) {
      float n = fbm(p * 4.0 + uSeed * 7.0);
      float m = 1.0 - r + (n - 0.5) * 0.8;
      float w = fwidth(m) * 1.5;
      float ice = smoothstep(0.2 - w, 0.2 + w, m);
      vec2 v = voronoi(p * 5.0);
      float lines = 1.0 - smoothstep(0.02, 0.05, v.y - v.x);
      a = ice * 0.6 * uAlpha;
      rgb = uDark * a + uColor * ice * (0.35 + lines * 0.9) * uAlpha;
    } else if (t == 3) {
      float rot = uTime * uSpin;
      float ca = ang + rot;
      float lw = fwidth(r) * 1.2 + 0.004;
      float ring1 = 1.0 - smoothstep(lw, lw * 2.0 + 0.008, abs(r - 0.95));
      float ring2 = 1.0 - smoothstep(lw, lw * 2.0 + 0.006, abs(r - 0.82));
      float ring3 = 1.0 - smoothstep(lw, lw * 2.0 + 0.005, abs(r - 0.42));
      // runes between ring1 and ring2
      float seg = floor((ca + 3.14159) / 6.28318 * 24.0);
      float sf = fract((ca + 3.14159) / 6.28318 * 24.0);
      float rh = hash12(vec2(seg, uSeed));
      float runeBand = step(0.84, r) * step(r, 0.93);
      float rune = runeBand * step(0.2, sf) * step(sf, 0.8) * step(0.35, fract(rh * 7.0 + (r - 0.84) * 20.0 * rh));
      // hexagram
      float star = 0.0;
      for (int k = 0; k < 6; k++) {
        float th = float(k) * 1.0472 - rot * 1.5;
        vec2 dir = vec2(cos(th), sin(th));
        float dl = abs(dot(p, dir) - 0.41);
        star = max(star, 1.0 - smoothstep(lw, lw * 2.0 + 0.005, dl));
      }
      star *= step(r, 0.82);
      float fill = (1.0 - smoothstep(0.0, 0.95, r)) * 0.25;
      float reveal = step(fract((ang + 3.14159) / 6.28318 - 0.25), uReveal);
      float m = max(max(ring1, ring2), max(ring3, max(rune, star))) * reveal;
      a = 0.0;
      rgb = uColor * (m + fill * uReveal) * uAlpha;
    } else {
      float g = exp(-r * r * 4.0) * (1.0 - smoothstep(0.9, 1.0, r));
      a = 0.0;
      rgb = uColor * g * uAlpha;
    }
    if (a < 0.002 && dot(rgb, rgb) < 1e-6) discard;
    gl_FragColor = vec4(rgb, a);
  }
`;

// ── Afterimage ghost ─────────────────────────────────────────────────────────
export const ghostVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vec3 nv = normalize(normalMatrix * normal);
    vNormalW = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
export const ghostFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uAlpha;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 V = normalize(cameraPosition - vPosW);
    float ndv = clamp(dot(normalize(vNormalW), V), 0.0, 1.0);
    float rim = smoothstep(0.35, 0.05, ndv);
    vec3 col = uColor * 0.35 + uRim * rim * 1.6;
    gl_FragColor = vec4(col * uAlpha, 0.0);
  }
`;

// ── Cel fire / smoke puffs (instanced spheres) ───────────────────────────────
// Instance attributes:
//   iA: xyz position, w scale
//   iB: rgb base color, w mode (0 smoke, 1 fire, 2 ice-mist / magic)
//   iC: rgb secondary (shade / outer fire), w seed
//   iD: x life01, y dissolve, z heat, w stretchY
export const puffVertex = /* glsl */ `
  ${noiseChunk}
  attribute vec4 iA;
  attribute vec4 iB;
  attribute vec4 iC;
  attribute vec4 iD;
  uniform float uOutline;   // pixels; > 0 renders the outline hull
  uniform vec2 uResolution;
  varying vec3 vN;
  varying vec3 vLocal;
  varying vec4 vB;
  varying vec4 vC;
  varying vec4 vD;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(position);
    float seed = iC.w;
    float lump = vnoise3(n * 2.2 + seed * 17.0 + vec3(0.0, iD.x * 1.5, 0.0));
    vec3 p = n * (1.0 + (lump - 0.5) * 0.42);
    p.y *= iD.w;
    vec3 wp = iA.xyz + p * iA.w;
    vN = n;
    vLocal = p;
    vB = iB; vC = iC; vD = iD;
    vPosW = wp;
    vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    if (uOutline > 0.0) {
      vec3 nv = (viewMatrix * vec4(n, 0.0)).xyz;
      vec2 sdir = (projectionMatrix * vec4(nv, 0.0)).xy * uResolution;
      float l = length(sdir);
      sdir = l > 1e-5 ? sdir / l : vec2(0.0);
      float px = uOutline * clamp(9.0 / clip.w, 0.5, 1.2) * (uResolution.y / 900.0);
      clip.xy += sdir * px * 2.0 / uResolution * clip.w;
      clip.z += 0.0005 * clip.w;
    }
    gl_Position = clip;
  }
`;

export const puffFragment = /* glsl */ `
  ${noiseChunk}
  uniform vec3 uLightDir;
  uniform float uOutline;
  uniform vec3 uOutlineColor;
  uniform float uWorldDim;
  varying vec3 vN;
  varying vec3 vLocal;
  varying vec4 vB;
  varying vec4 vC;
  varying vec4 vD;
  varying vec3 vPosW;
  void main() {
    float life = vD.x;
    float seed = vC.w;
    float mode = vB.w;
    float n = vnoise3(vLocal * 3.1 + seed * 11.0 + vec3(0.0, -life * 2.0, 0.0));
    // dissolve from the outside in: thin rims of the puff go first
    float dis = vD.y;
    vec3 V = normalize(cameraPosition - vPosW);
    float ndv = clamp(dot(normalize(vN), V), 0.0, 1.0);
    float keep = n * 0.75 + ndv * 0.35;
    if (keep < dis) discard;
    if (uOutline > 0.0) {
      vec3 oc = mode > 0.5 && mode < 1.5 ? vC.rgb * 0.35 : uOutlineColor;
      gl_FragColor = vec4(oc * (1.0 - uWorldDim * 0.7), 1.0);
      return;
    }
    vec3 L = normalize(uLightDir);
    float ndl = dot(normalize(vN + (n - 0.5) * 0.9), L);
    vec3 col;
    if (mode < 0.5) {
      // smoke: two tones + rim
      float lit = smoothstep(-0.05, 0.05, ndl);
      col = mix(vC.rgb, vB.rgb, lit);
      col += vB.rgb * 0.15 * step(0.6, 1.0 - ndv);
      col *= 1.0 - uWorldDim * 0.7;
    } else if (mode < 1.5) {
      // fire: heat bands (white → yellow → orange → red → dark)
      float heat = vD.z * (0.55 + 0.45 * ndv) + (n - 0.5) * 0.35 - life * 0.25;
      vec3 c0 = vec3(6.0, 5.2, 3.6);
      vec3 c1 = vB.rgb;          // bright yellow-orange (HDR)
      vec3 c2 = vC.rgb;          // deep orange/red
      vec3 c3 = vC.rgb * 0.18;   // charcoal
      float w = 0.02;
      col = c3;
      col = mix(col, c2, smoothstep(0.18 - w, 0.18 + w, heat));
      col = mix(col, c1, smoothstep(0.42 - w, 0.42 + w, heat));
      col = mix(col, c0, smoothstep(0.75 - w, 0.75 + w, heat));
    } else {
      // magic mist: flat color with bright rim
      float lit = smoothstep(-0.1, 0.1, ndl);
      col = mix(vC.rgb, vB.rgb, lit);
      col += vB.rgb * smoothstep(0.55, 0.85, 1.0 - ndv) * 1.2;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;
