// Sun shadow map: depth-only pass of shadow casters (layer 1) from an
// orthographic light camera that follows the player (texel-snapped).
import * as THREE from 'three';

export const SHADOW_LAYER = 1;

export class SunShadow {
  constructor(size = 2048, extent = 22) {
    this.size = size;
    this.extent = extent;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(size, size);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.cam = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, 220);
    this.cam.layers.set(SHADOW_LAYER);
    this.mat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.matrix = new THREE.Matrix4();
    this.uniforms = {
      uShadowMap: { value: this.rt.depthTexture },
      uShadowMatrix: { value: this.matrix },
      uShadowOn: { value: 1 },
      uShadowTexel: { value: 1 / size },
    };
    this.bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }

  render(renderer, scene, center, lightDir) {
    const cam = this.cam;
    // snap the center to shadow texels (in light space) to avoid shimmering
    const texel = (this.extent * 2) / this.size;
    const up = Math.abs(lightDir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const look = new THREE.Matrix4().lookAt(new THREE.Vector3(), lightDir.clone().negate(), up);
    const inv = look.clone().invert();
    const c = center.clone().applyMatrix4(inv);
    c.x = Math.round(c.x / texel) * texel; c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(look);
    cam.position.copy(c).addScaledVector(lightDir, 100);
    cam.up.copy(up);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    this.matrix.multiplyMatrices(this.bias, cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.mat;
    renderer.setRenderTarget(this.rt);
    renderer.clear(false, true, false);
    renderer.render(scene, cam);
    scene.overrideMaterial = prevOverride;
  }
}

export const shadowChunk = /* glsl */ `
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform float uShadowOn;
  uniform float uShadowTexel;
  float sunShadow(vec3 P) {
    if (uShadowOn < 0.5) return 0.0;
    vec4 sc = uShadowMatrix * vec4(P, 1.0);
    vec3 s = sc.xyz / sc.w;
    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 0.0;
    float b = 0.0015;
    float acc = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      float d = texture2D(uShadowMap, s.xy + vec2(float(i), float(j)) * uShadowTexel * 1.5).r;
      acc += step(d + b, s.z);
    }
    acc /= 9.0;
    // fade out toward the edge of the shadow map
    vec2 e = min(s.xy, 1.0 - s.xy);
    acc *= smoothstep(0.0, 0.08, min(e.x, e.y));
    return smoothstep(0.25, 0.75, acc);
  }
`;
