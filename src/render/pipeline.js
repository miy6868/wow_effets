// HDR render pipeline: scene → (MSAA HDR target) → bloom mip chain → composite.
import * as THREE from 'three';
import { fsVertex, downsampleFrag, upsampleFrag, compositeFrag } from './shaders/post.js';
import { toonGlobals } from './shaders/toon.js';

const BLOOM_LEVELS = 6;

export class Pipeline {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true, samples: 4 });
    this.distortRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts });
    this.mips = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));

    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.fsMesh = new THREE.Mesh(tri);
    this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.fsMesh);

    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 }, uThreshold: { value: new THREE.Vector4(1.0, 0.45, 40, 0) } },
      vertexShader: fsVertex, fragmentShader: downsampleFrag, depthTest: false, depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 }, uWeight: { value: 1.0 } },
      vertexShader: fsVertex, fragmentShader: upsampleFrag, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tBloom: { value: this.mips[0].texture },
        tDistort: { value: this.distortRT.texture },
        uHasDistort: { value: 0 },
        uResolution: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uBloom: { value: 0.9 },
        uExposure: { value: 1.0 },
        uChroma: { value: 0 },
        uRadial: { value: 0 },
        uRadialCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
        uImpact: { value: 0 },
        uImpactInvert: { value: 0 },
        uImpactTint: { value: new THREE.Color(1, 1, 1) },
        uVignette: { value: 0.55 },
        uSaturation: { value: 1.08 },
        uSpeedLines: { value: 0 },
        uSpeedCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uLetterbox: { value: 0 },
        uDesat: { value: 0 },
        uGrade: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: fsVertex, fragmentShader: compositeFrag, depthTest: false, depthWrite: false,
    });

    this.distortScene = new THREE.Scene();
    this.overlayScene = new THREE.Scene();
    this.overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.bloomEnabled = true;
    this.bloomStrength = 0.32;
    this.width = 4; this.height = 4;
  }

  get u() { return this.compMat.uniforms; }

  setSize(w, h) {
    const pr = this.pixelRatio;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(pr);
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.width = W; this.height = H;
    this.sceneRT.setSize(W, H);
    this.distortRT.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    let mw = W >> 1, mh = H >> 1;
    for (const m of this.mips) { m.setSize(Math.max(1, mw), Math.max(1, mh)); mw >>= 1; mh >>= 1; }
    this.u.uResolution.value.set(W, H);
    toonGlobals.uResolution.value.set(W, H);
    this.overlayCam.left = -w / h; this.overlayCam.right = w / h; this.overlayCam.updateProjectionMatrix();
  }

  pass(mat, target) {
    this.fsMesh.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    // 1. scene
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);

    // 2. distortion offsets
    const hasDist = this.distortScene.children.length > 0;
    this.u.uHasDistort.value = hasDist ? 1 : 0;
    if (hasDist) {
      r.setRenderTarget(this.distortRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      r.render(this.distortScene, camera);
    }

    // 3. bloom
    if (this.bloomEnabled) {
      let src = this.sceneRT.texture;
      let sw = this.width, sh = this.height;
      for (let i = 0; i < BLOOM_LEVELS; i++) {
        this.downMat.uniforms.tSrc.value = src;
        this.downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        this.downMat.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
        r.setRenderTarget(this.mips[i]);
        this.pass(this.downMat, this.mips[i]);
        src = this.mips[i].texture;
        sw = this.mips[i].width; sh = this.mips[i].height;
      }
      for (let i = BLOOM_LEVELS - 1; i > 0; i--) {
        const s = this.mips[i];
        this.upMat.uniforms.tSrc.value = s.texture;
        this.upMat.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
        this.upMat.uniforms.uWeight.value = 1.0;
        this.pass(this.upMat, this.mips[i - 1]);
      }
    }
    this.u.uBloom.value = this.bloomEnabled ? this.bloomStrength : 0;

    // 4. composite to screen
    this.u.uTime.value = time;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    this.pass(this.compMat, null);

    // 5. overlay (cut-ins)
    if (this.overlayScene.children.length) {
      r.clear(false, true, false);
      r.render(this.overlayScene, this.overlayCam);
    }
  }
}
