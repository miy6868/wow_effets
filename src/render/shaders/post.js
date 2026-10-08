// Post-processing shaders: bloom chain + final composite.
export const fsVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// 13-tap downsample (CoD: Advanced Warfare). Optional threshold + Karis average
// on the first pass to tame fireflies from tiny super-bright particles.
export const downsampleFrag = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uPrefilter;
  uniform vec4 uThreshold; // x: threshold, y: knee, z: clamp
  varying vec2 vUv;

  vec3 thresh(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold.x + uThreshold.y, 0.0, 2.0 * uThreshold.y);
    rq = (rq * rq) / (4.0 * uThreshold.y + 1e-5);
    float w = max(rq, br - uThreshold.x) / max(br, 1e-5);
    return min(c * w, vec3(uThreshold.z));
  }
  float karis(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b)) * 0.25); }

  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(tSrc, vUv + t * vec2(-2, 2)).rgb;
    vec3 b = texture2D(tSrc, vUv + t * vec2(0, 2)).rgb;
    vec3 c = texture2D(tSrc, vUv + t * vec2(2, 2)).rgb;
    vec3 d = texture2D(tSrc, vUv + t * vec2(-2, 0)).rgb;
    vec3 e = texture2D(tSrc, vUv).rgb;
    vec3 f = texture2D(tSrc, vUv + t * vec2(2, 0)).rgb;
    vec3 g = texture2D(tSrc, vUv + t * vec2(-2, -2)).rgb;
    vec3 h = texture2D(tSrc, vUv + t * vec2(0, -2)).rgb;
    vec3 i = texture2D(tSrc, vUv + t * vec2(2, -2)).rgb;
    vec3 j = texture2D(tSrc, vUv + t * vec2(-1, 1)).rgb;
    vec3 k = texture2D(tSrc, vUv + t * vec2(1, 1)).rgb;
    vec3 l = texture2D(tSrc, vUv + t * vec2(-1, -1)).rgb;
    vec3 m = texture2D(tSrc, vUv + t * vec2(1, -1)).rgb;
    vec3 col;
    if (uPrefilter > 0.5) {
      a = thresh(a); b = thresh(b); c = thresh(c); d = thresh(d); e = thresh(e);
      f = thresh(f); g = thresh(g); h = thresh(h); i = thresh(i);
      j = thresh(j); k = thresh(k); l = thresh(l); m = thresh(m);
      vec3 g0 = (a + b + d + e) * 0.25;
      vec3 g1 = (b + c + e + f) * 0.25;
      vec3 g2 = (d + e + g + h) * 0.25;
      vec3 g3 = (e + f + h + i) * 0.25;
      vec3 g4 = (j + k + l + m) * 0.25;
      float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
      col = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) /
            (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
    } else {
      col = e * 0.125;
      col += (a + c + g + i) * 0.03125;
      col += (b + d + f + h) * 0.0625;
      col += (j + k + l + m) * 0.125;
    }
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

// 9-tap tent upsample, additively blended onto the next larger mip.
export const upsampleFrag = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uRadius;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec2 t = uTexel * uRadius;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += texture2D(tSrc, vUv + t * vec2(-1, 0)).rgb * 2.0;
    c += texture2D(tSrc, vUv + t * vec2(1, 0)).rgb * 2.0;
    c += texture2D(tSrc, vUv + t * vec2(0, -1)).rgb * 2.0;
    c += texture2D(tSrc, vUv + t * vec2(0, 1)).rgb * 2.0;
    c += texture2D(tSrc, vUv + t * vec2(-1, -1)).rgb;
    c += texture2D(tSrc, vUv + t * vec2(1, -1)).rgb;
    c += texture2D(tSrc, vUv + t * vec2(-1, 1)).rgb;
    c += texture2D(tSrc, vUv + t * vec2(1, 1)).rgb;
    gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
  }
`;

// Final composite: distortion, radial blur, chromatic aberration, bloom,
// screen flash, anime "impact frames", speed lines, vignette, tone map.
export const compositeFrag = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tDistort;
  uniform float uHasDistort;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uBloom;
  uniform float uExposure;
  uniform float uChroma;
  uniform float uRadial;
  uniform vec2 uRadialCenter;
  uniform vec4 uFlash;        // rgb, amount (additive-ish overlay)
  uniform float uImpact;      // 0..1 impact frame blend
  uniform float uImpactInvert;
  uniform vec3 uImpactTint;
  uniform float uVignette;
  uniform float uSaturation;
  uniform float uSpeedLines;
  uniform vec2 uSpeedCenter;
  uniform float uLetterbox;
  uniform float uDesat;
  uniform float uDim;         // darken the world, keep bright effects
  uniform vec3 uGrade;        // color multiplier
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  vec3 sampleScene(vec2 uv) {
    vec3 c;
    if (uChroma > 0.0001) {
      vec2 dir = (uv - 0.5);
      float d = length(dir);
      vec2 off = dir * uChroma * (0.4 + d);
      c.r = texture2D(tScene, uv + off).r;
      c.g = texture2D(tScene, uv).g;
      c.b = texture2D(tScene, uv - off).b;
    } else {
      c = texture2D(tScene, uv).rgb;
    }
    return c;
  }

  // Tone map: linear below the knee, smooth shoulder above. Very bright
  // values are pushed toward white so effect cores read as "hot".
  vec3 tonemap(vec3 c) {
    c *= uExposure;
    float l = max(c.r, max(c.g, c.b));
    vec3 hot = vec3(luma(c));
    float burn = smoothstep(1.2, 4.0, l);
    c = mix(c, max(c, hot * 1.1), burn * 0.6);
    vec3 k = vec3(0.78);
    vec3 over = max(c - k, 0.0);
    vec3 mapped = min(c, k) + (1.0 - k) * (over / (over + (1.0 - k)));
    return mapped;
  }

  vec3 toSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 uv = vUv;
    if (uHasDistort > 0.5) {
      vec2 dofs = texture2D(tDistort, uv).rg;
      uv += dofs;
    }
    vec3 col;
    if (uRadial > 0.001) {
      vec2 dir = uv - uRadialCenter;
      col = vec3(0.0);
      float tot = 0.0;
      for (int i = 0; i < 12; i++) {
        float t = float(i) / 11.0;
        float s = 1.0 - uRadial * t * 0.18;
        float w = 1.0 - t * 0.5;
        col += sampleScene(uRadialCenter + dir * s) * w;
        tot += w;
      }
      col /= tot;
    } else {
      col = sampleScene(uv);
    }
    if (uDim > 0.001) {
      float br = max(col.r, max(col.g, col.b));
      col *= 1.0 - uDim * 0.82 * (1.0 - smoothstep(1.3, 2.8, br));
    }
    vec3 bloom = texture2D(tBloom, uv).rgb;
    col += bloom * uBloom;

    col = tonemap(col);

    // grade: split toning (cool shadows, warm highlights) + gentle S-curve
    col *= uGrade;
    float L = luma(col);
    vec3 shadowTint = vec3(0.86, 0.95, 1.1);
    vec3 hiTint = vec3(1.06, 1.0, 0.9);
    col *= mix(shadowTint, hiTint, smoothstep(0.05, 0.75, L));
    vec3 cc = clamp(col, 0.0, 1.0);
    col = mix(col, cc * cc * (3.0 - 2.0 * cc), 0.22);
    L = luma(col);
    col = mix(vec3(L), col, uSaturation * (1.0 - uDesat));

    // speed lines (anime radial streaks)
    if (uSpeedLines > 0.001) {
      vec2 d = (vUv - uSpeedCenter) * vec2(uResolution.x / uResolution.y, 1.0);
      float a = atan(d.y, d.x);
      float r = length(d);
      float n = hash(vec2(floor(a * 90.0), floor(uTime * 24.0)));
      float line = step(0.82, n) * smoothstep(0.25, 0.9, r);
      col = mix(col, vec3(1.0), line * uSpeedLines * 0.55);
    }

    // flash
    col = mix(col, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));

    // impact frame: harsh two-tone
    if (uImpact > 0.001) {
      float l = luma(col);
      float bw = step(0.42, l);
      if (uImpactInvert > 0.5) bw = 1.0 - bw;
      vec3 imp = mix(vec3(0.02), uImpactTint, bw);
      col = mix(col, imp, uImpact);
    }

    // vignette
    vec2 q = vUv - 0.5;
    float vig = 1.0 - dot(q, q) * uVignette;
    col *= clamp(vig, 0.0, 1.0);

    // letterbox
    if (uLetterbox > 0.001) {
      float bar = uLetterbox * 0.11;
      if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
    }

    col = toSRGB(col);
    // fine film grain (also kills banding)
    float gr = hash(vUv * uResolution + fract(uTime * 13.7)) - 0.5;
    col += gr * (0.022 + 0.02 * (1.0 - luma(col)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const copyFrag = /* glsl */ `
  uniform sampler2D tSrc;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tSrc, vUv); }
`;
