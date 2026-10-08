// Screen-space effect controller: drives the composite pass uniforms
// (flash, chromatic aberration, radial blur, impact frames, speed lines...).
import { toonGlobals } from '../render/shaders/toon.js';

export class ScreenFX {
  constructor(pipeline) {
    this.p = pipeline;
    this.items = [];
    this.letterboxT = 0; this.letterboxV = 0;
    this.dimT = 0; this.dimV = 0;
    this.persist = { chroma: 0, radial: 0, speed: 0, desat: 0 };
  }
  _add(kind, amount, dur, extra = {}) {
    this.items.push({ kind, amount, dur, t: 0, ...extra });
  }
  flash(color = [1, 1, 1], amount = 0.6, dur = 0.08) { this._add('flash', amount, dur, { color }); }
  chroma(amount = 0.01, dur = 0.2) { this._add('chroma', amount, dur); }
  radial(amount = 1, dur = 0.25, cx = 0.5, cy = 0.5) { this._add('radial', amount, dur, { cx, cy }); }
  speedLines(amount = 1, dur = 0.3) { this._add('speed', amount, dur); }
  /** anime impact frame: hold for `dur` real seconds */
  impact(dur = 0.06, invert = false, tint = [1, 1, 1]) { this._add('impact', 1, dur, { invert, tint, hold: true }); }
  desat(amount = 1, dur = 0.5) { this._add('desat', amount, dur); }
  letterbox(on) { this.letterboxT = on ? 1 : 0; }
  dim(v) { this.dimT = v; }

  update(dtReal) {
    const u = this.p.u;
    let flashA = 0, fr = 1, fg = 1, fb = 1;
    let chroma = this.persist.chroma, radial = this.persist.radial, speed = this.persist.speed, desat = this.persist.desat;
    let impact = 0, inv = 0, tint = null, rcx = 0.5, rcy = 0.5;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dtReal;
      if (it.t >= it.dur) { this.items.splice(i, 1); continue; }
      const k = it.hold ? 1 : 1 - it.t / it.dur;
      const v = it.amount * k * k;
      switch (it.kind) {
        case 'flash': if (v > flashA) { flashA = v; [fr, fg, fb] = it.color; } break;
        case 'chroma': chroma += v; break;
        case 'radial': radial += it.amount * k; rcx = it.cx; rcy = it.cy; break;
        case 'speed': speed = Math.max(speed, it.amount * k); break;
        case 'impact': impact = 1; inv = it.invert ? 1 : 0; tint = it.tint; break;
        case 'desat': desat = Math.max(desat, it.amount * k); break;
      }
    }
    u.uFlash.value.set(fr, fg, fb, flashA);
    u.uChroma.value = Math.min(chroma, 0.05);
    u.uRadial.value = Math.min(radial, 3);
    u.uRadialCenter.value.set(rcx, rcy);
    u.uSpeedLines.value = speed;
    u.uImpact.value = impact;
    u.uImpactInvert.value = inv;
    if (tint) u.uImpactTint.value.setRGB(tint[0], tint[1], tint[2]);
    u.uDesat.value = Math.min(1, desat);
    this.letterboxV += (this.letterboxT - this.letterboxV) * Math.min(1, dtReal * 8);
    u.uLetterbox.value = this.letterboxV;
    this.dimV += (this.dimT - this.dimV) * Math.min(1, dtReal * 10);
    toonGlobals.uWorldDim.value = this.dimV;
  }
}
