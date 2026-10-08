// Stylized dusk sky: banded gradient, sun glow, cel-shaded clouds.
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
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
    col = mix(col, uZenith, smoothstep(0.15, 0.75, h));
    col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.2, h));

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sd, 6.0) * 0.35;
    col += uSunColor * pow(sd, 60.0) * 0.8;
    float disc = smoothstep(0.9975, 0.9985, sd);
    col = mix(col, uSunColor * 3.0, disc);

    // clouds on a virtual plane
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(uTime * 0.01, 0.0);
      float n = fbm(uv * 0.9);
      float n2 = fbm(uv * 0.9 + vec2(0.06, 0.05));   // offset toward the sun for shading
      float cov = smoothstep(0.0, 0.35, h) * 0.0 + 0.56;
      float cw = fwidth(n) * 1.2 + 0.004;
      float cloud = smoothstep(cov - cw, cov + cw, n);
      float lw = fwidth(n - n2) + 0.004;
      float lit = smoothstep(-lw, lw, n - n2 - 0.03);
      vec3 cc = mix(uCloudShade, uCloudLit, lit);
      // sun-side clouds glow
      cc += uSunColor * pow(sd, 4.0) * 0.4;
      float fade = smoothstep(0.02, 0.18, h);
      col = mix(col, cc, cloud * fade);
    }
    col *= 1.0 - uWorldDim * 0.85;
    gl_FragColor = vec4(col, 1.0);
  }
`;
