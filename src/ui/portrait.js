// Manga-style cut-in portrait. The toon snapshot of the hero's face is re-inked
// as a duotone: deep ink shadows, halftone screen-tone in the mid-tones and
// solid accent highlights, tinted per ultimate. A raw 3D close-up exposed how
// simple the head model is; the printed-panel treatment reads as art direction.

const INK = [9, 8, 18];

export class Portrait {
  constructor(canvas) {
    this.w = canvas.width; this.h = canvas.height;
    this.src = canvas.getContext('2d').getImageData(0, 0, this.w, this.h).data;
    this.cache = new Map();
  }

  /** Data URL of the portrait inked in `accent` ('#rrggbb'). */
  url(accent = '#ffe27a') {
    if (this.cache.has(accent)) return this.cache.get(accent);
    const a = parseHex(accent);
    const hi = a.map((v) => v + (255 - v) * 0.6);
    const { w, h, src } = this;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const out = img.data;
    const cell = 6.5, R2 = Math.SQRT1_2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255;
        const t = smooth(0.06, 0.7, l);
        let col;
        if (l > 0.93) col = [255, 255, 255];                        // eye glints, hot rims
        else if (t > 0.86) col = hi;                                 // highlights
        else if (t > 0.56) col = a;                                  // lit mid-tones
        else if (t > 0.18) {
          // halftone dots, 45° screen; dot area tracks the tone
          const u = (x + y) * R2 / cell, v = (x - y) * R2 / cell;
          const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5;
          const d = Math.sqrt(fu * fu + fv * fv);
          const r = Math.sqrt(((t - 0.18) / 0.38) / Math.PI);
          const k = Math.min(1, Math.max(0, (r - d) * cell + 0.5));
          col = [INK[0] + (a[0] - INK[0]) * k, INK[1] + (a[1] - INK[1]) * k, INK[2] + (a[2] - INK[2]) * k];
        } else col = INK;
        out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL('image/png');
    this.cache.set(accent, url);
    return url;
  }
}

function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return [255, 226, 122];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
