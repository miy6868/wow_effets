// Keyboard / mouse input with pointer lock. Also scriptable for automated tests.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();   // pressed this frame
    this.released = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.locked = false;
    this.lockT = -1e9;
    this.sensitivity = 0.0022;
    this.enabled = true;

    const key = (e) => (e.code === 'ShiftRight' ? 'ShiftLeft' : e.code);
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this._press(key(e));
    });
    window.addEventListener('keyup', (e) => this._release(key(e)));
    window.addEventListener('blur', () => { for (const k of [...this.down]) this._release(k); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && canvas.requestPointerLock && !this.noLock) {
        canvas.requestPointerLock();
      }
      this._press('Mouse' + e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => this._release('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      // right after pointer lock engages browsers can report one huge warp delta
      if (performance.now() - this.lockT < 150 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      if (this.locked || this.down.has('Mouse0') || this.down.has('Mouse2') || this.dragLook) {
        this.mouseDX += e.movementX; this.mouseDY += e.movementY;
      }
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.lockT = performance.now();
    });
  }

  _press(k) { if (!this.down.has(k)) { this.down.add(k); this.pressed.add(k); } }
  _release(k) { if (this.down.has(k)) { this.down.delete(k); this.released.add(k); } }

  // scripted control (tests / demo)
  press(k) { this._press(k); }
  release(k) { this._release(k); }

  isDown(k) { return this.down.has(k); }
  wasPressed(k) { return this.pressed.has(k); }
  wasReleased(k) { return this.released.has(k); }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
