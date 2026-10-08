// Third-person orbit camera with trauma shake, directional kicks, FOV punches,
// and a cinematic override used by ultimates.
import * as THREE from 'three';

function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 157.31) * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.08, 400);
    this.yaw = 0;            // yaw 0 → looking toward +Z
    this.pitch = 0.32;
    this.dist = 5.6;
    this.distTarget = 5.6;
    this.height = 1.45;
    this.shoulder = 0;        // lateral offset
    this.shoulderTarget = 0;
    this.focus = new THREE.Vector3();
    this.baseFov = 58;
    this.fovOffset = 0;
    this.fovPunchV = 0;
    this.trauma = 0;
    this.shakeTime = 0;
    this.kickPos = new THREE.Vector3();
    this.kickVel = new THREE.Vector3();
    this.rollKick = 0; this.rollVel = 0;
    this.cine = null;        // {pos, look, fov, w}
    this.cineW = 0;
    this.shakeEnabled = true;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
  }

  /** Add screen shake. 0.1 = light tap, 0.4 = heavy hit, 0.8+ = explosion. */
  shake(amount) { this.trauma = Math.min(1.2, this.trauma + amount); }

  /** Directional positional kick (world-space direction). */
  kick(dir, strength) { this.kickVel.addScaledVector(dir, strength); }

  roll(amount) { this.rollVel += amount; }

  fovPunch(deg) { this.fovPunchV += deg; }

  update(dtReal, followPos, input, opts = {}) {
    if (input && !opts.lockLook) {
      const sens = input.sensitivity * (input.sensScale ?? 1);
      this.yaw -= input.mouseDX * sens;
      this.pitch += input.mouseDY * sens;
      this.pitch = Math.max(-0.5, Math.min(1.25, this.pitch));
    }
    this.distTarget = opts.dist ?? 5.6;
    this.dist += (this.distTarget - this.dist) * (1 - Math.exp(-dtReal * 10));
    this.shoulderTarget = opts.shoulder ?? 0;
    this.shoulder += (this.shoulderTarget - this.shoulder) * (1 - Math.exp(-dtReal * 10));
    const fovT = opts.fov ?? this.baseFov;
    this.fovOffset += (fovT - this.baseFov - this.fovOffset) * (1 - Math.exp(-dtReal * 8));

    // smooth follow: tight horizontally, a bit lazier vertically (jumps feel airy)
    const kx = 1 - Math.exp(-dtReal * 18);
    const ky = 1 - Math.exp(-dtReal * 9);
    this.focus.x += (followPos.x - this.focus.x) * kx;
    this.focus.z += (followPos.z - this.focus.z) * kx;
    this.focus.y += (followPos.y + this.height - this.focus.y) * ky;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // camera looks along forward; positioned behind focus
    this.forward.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp).normalize();
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const cam = this.camera;
    _v.copy(this.focus).addScaledVector(this.forward, -this.dist).addScaledVector(this.right, this.shoulder);
    if (_v.y < 0.25) _v.y = 0.25;
    this.lookTarget.copy(_v).addScaledVector(this.forward, 10);

    // springs
    const k = 260, d = 20;
    this.kickVel.addScaledVector(this.kickPos, -k * dtReal);
    this.kickVel.multiplyScalar(Math.exp(-d * dtReal));
    this.kickPos.addScaledVector(this.kickVel, dtReal);
    this.rollVel += -this.rollKick * k * dtReal;
    this.rollVel *= Math.exp(-d * dtReal);
    this.rollKick += this.rollVel * dtReal;
    this.fovPunchV *= Math.exp(-dtReal * 9);

    // cinematic blend
    const cineTarget = this.cine ? (this.cine.w ?? 1) : 0;
    this.cineW += (cineTarget - this.cineW) * (1 - Math.exp(-dtReal * (this.cine?.blendSpeed ?? 10)));
    if (this.cine) {
      _v.lerp(this.cine.pos, this.cineW);
      this.lookTarget.lerp(this.cine.look, this.cineW);
    }

    cam.position.copy(_v).add(this.kickPos);
    cam.lookAt(this.lookTarget);

    // trauma shake
    this.shakeTime += dtReal;
    this.trauma = Math.max(0, this.trauma - dtReal * 1.6);
    if (this.shakeEnabled && this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = this.shakeTime * 28;
      cam.rotateX(vnoise(t, 1) * 0.045 * s);
      cam.rotateY(vnoise(t, 2) * 0.045 * s);
      cam.rotateZ(vnoise(t, 3) * 0.06 * s);
      _v2.set(vnoise(t, 4), vnoise(t, 5), 0).multiplyScalar(0.18 * s).applyQuaternion(cam.quaternion);
      cam.position.add(_v2);
    }
    cam.rotateZ(this.rollKick);

    let fov = this.baseFov + this.fovOffset + this.fovPunchV;
    if (this.cine && this.cine.fov) fov = fov + (this.cine.fov - fov) * this.cineW;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  /** Flat (XZ) forward / right of the view, for movement input. */
  flatForward(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize(); }
  flatRight(out) { return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
}
