// Stylized golden-hour sky: banded gradient, sun glow, cel-shaded cumulus banks, cirrus.
export const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

export const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uTime;
  uniform float uWorldDim;
  varying vec3 vDir;

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
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sun = normalize(uSunDir);
    float sd = max(dot(d, sun), 0.0);
    // azimuthal closeness to the sun (warms the whole horizon band on that side)
    vec2 dz = normalize(d.xz + 1e-5), sz = normalize(sun.xz);
    float az = dot(dz, sz) * 0.5 + 0.5;

    // gradient: warm horizon → blue mid → deep zenith
    vec3 horizon = mix(uHorizon * vec3(0.85, 0.82, 0.95), uHorizon, pow(az, 1.5));
    vec3 col = mix(horizon, uMid, smoothstep(-0.02, 0.28, h));
    col = mix(col, uZenith, smoothstep(0.22, 0.9, h));
    col = mix(col, horizon * 0.62, smoothstep(0.0, -0.25, h));
    // sun glow
    col += uSunColor * pow(sd, 5.0) * 0.45 * (1.0 - smoothstep(0.0, 0.6, h));
    col += uSunColor * pow(sd, 90.0) * 1.1;
    float disc = smoothstep(0.9988, 0.9993, sd);
    col = mix(col, uSunColor * 4.0, disc);

    // towering cumulus banks sitting on the horizon (cel-shaded, 3 tones)
    float ang = atan(d.z, d.x);
    vec2 cuv = vec2(ang * 1.5 + uTime * 0.004, h * 5.0);
    float hfall = smoothstep(-0.02, 0.42, h) * 0.62;
    float body = fbm(cuv) - hfall;
    float bodyUp = fbm(cuv + vec2(0.01, 0.16)) - smoothstep(-0.02, 0.42, h + 0.032) * 0.62;
    float cov = 0.4;
    float cw = fwidth(body) * 1.2 + 0.002;
    float cloud = smoothstep(cov - cw, cov + cw, body) * smoothstep(-0.04, 0.01, h);
    float lw = fwidth(body - bodyUp) + 0.003;
    float lit = smoothstep(-lw, lw, body - bodyUp - 0.012);          // upper surfaces lit
    float core = smoothstep(cov + 0.12 - cw, cov + 0.12 + cw, body);  // dense interior
    vec3 cLit = mix(uCloudLit, uSunColor * 1.15, pow(az, 3.0) * 0.6);
    // shadow side stays close to the sky behind it (atmospheric), lit side warm
    vec3 cShade = mix(uCloudShade, col, 0.35);
    vec3 cc = mix(cShade, cLit, lit);
    // silver lining toward the sun
    float edge = 1.0 - smoothstep(cov, cov + 0.05, body);
    cc += uSunColor * edge * pow(az, 4.0) * 0.9;
    col = mix(col, cc, cloud);

    // high cirrus streaks
    if (h > 0.05) {
      vec2 u2 = d.xz / (h + 0.25);
      float ci = fbm(vec2(u2.x * 0.18 + uTime * 0.004, u2.y * 0.9));
      float cir = smoothstep(0.55, 0.78, ci) * smoothstep(0.12, 0.5, h) * (1.0 - cloud);
      col = mix(col, mix(uCloudLit, uSunColor, 0.35) * 0.9, cir * 0.32);
    }
    col *= 1.0 - uWorldDim * 0.85;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Distant mountain ridges: layered silhouettes with atmospheric haze and a
// warm rim where the ridge faces the sun.
export const ridgeVertex = /* glsl */ `
  attribute float aV;      // 0 bottom .. 1 ridge top
  varying float vV;
  varying vec3 vDir;
  void main() {
    vV = aV;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
export const ridgeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHaze;
  uniform vec3 uRim;
  uniform vec3 uSunDir;
  uniform float uHazeAmt;
  uniform float uWorldDim;
  varying float vV;
  varying vec3 vDir;
  void main() {
    vec2 dz = normalize(vDir.xz + 1e-5), sz = normalize(uSunDir.xz);
    float toSun = pow(max(dot(dz, sz), 0.0), 3.0);
    // haze thickens toward the base
    vec3 col = mix(uColor, uHaze, uHazeAmt + (1.0 - vV) * 0.45);
    col = mix(col, uHaze * 1.05, toSun * 0.35);
    // rim light along the ridge crest on the sun side
    float w = fwidth(vV) * 1.6;
    float crest = smoothstep(1.0 - w * 2.0, 1.0 - w * 0.4, vV);
    col = mix(col, uRim, crest * (0.04 + toSun * 0.55));
    col *= 1.0 - uWorldDim * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Instanced grass clumps: wind sway, tip-lit cel gradient, fog.
export const grassVertex = /* glsl */ `
  attribute vec4 iOff;     // x, z, scale, rotation
  attribute float iTint;
  uniform float uTime;
  uniform vec3 uPlayer;
  varying float vH;
  varying float vTint;
  varying vec3 vPosW;
  void main() {
    float c = cos(iOff.w), s = sin(iOff.w);
    vec3 p = position * iOff.z;
    p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
    vec3 wp = vec3(iOff.x, 0.0, iOff.y) + p;
    float h = position.y / 0.6;
    float h2 = h * h;
    // wind: slow swells + flutter
    float w = sin(uTime * 1.3 + iOff.x * 0.15 + iOff.y * 0.1) * 0.6 + sin(uTime * 3.1 + iOff.x * 0.9) * 0.25;
    wp.x += w * 0.12 * h2 * iOff.z;
    wp.z += w * 0.05 * h2 * iOff.z;
    // bend away from the player
    vec2 d = wp.xz - uPlayer.xz;
    float dl = length(d);
    wp.xz += normalize(d + 1e-4) * (1.0 - smoothstep(0.3, 1.4, dl)) * 0.35 * h2;
    vH = h;
    vTint = iTint;
    vPosW = wp;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
export const grassFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uSunTint;
  uniform vec3 uFogColor;
  uniform vec2 uFog;
  uniform float uWorldDim;
  varying float vH;
  varying float vTint;
  varying vec3 vPosW;
  void main() {
    float w = fwidth(vH) + 0.01;
    float band = smoothstep(0.45 - w, 0.45 + w, vH);
    vec3 col = mix(uBase, uTip, band);
    col = mix(col, uTip + uSunTint * 0.25, smoothstep(0.85 - w, 0.85 + w, vH) * 0.7);
    col *= 0.85 + vTint * 0.3;
    col *= 1.0 - uWorldDim * 0.8;
    float f = smoothstep(uFog.x, uFog.y, length(vPosW - cameraPosition));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
  }
`;
