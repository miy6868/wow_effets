// Procedural sound effects (WebAudio). Every sound is synthesized: layered
// noise bursts, filtered sweeps, pitched thumps. No sample files needed.
import { G } from '../ctx.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.last = new Map();
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6;
    comp.attack.value = 0.002; comp.release.value = 0.15;
    this.master.connect(comp).connect(ctx.destination);
    // short reverb for weight
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(1.4, 2.5);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.22;
    this.verb.connect(this.verbGain).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  makeNoise(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ── building blocks ────────────────────────────────────────────────────────
  out(o) {
    // returns a node chain end that goes to master (+ reverb send) with panning
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = o.vol ?? 1;
    let node = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p); node = p;
    }
    node.connect(this.master);
    if (o.verb) {
      const s = ctx.createGain(); s.gain.value = o.verb;
      node.connect(s).connect(this.verb);
    }
    return g;
  }

  noise(dest, t0, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.005, vol = 1, curve = 3 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.setTargetAtTime(0.0001, t0 + a, dur / curve);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.0);
    src.stop(t0 + dur + 0.5);
  }

  tone(dest, t0, dur, { type = 'sine', f0 = 200, f1 = f0, a = 0.003, vol = 1, curve = 3 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.setTargetAtTime(0.0001, t0 + a, dur / curve);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.5);
  }

  /** play(name, {pos, vol, pitch, delay}) */
  play(name, o = {}) {
    if (!this.enabled || !this.ctx || !G.settings.sound) return;
    const fn = SFX[name];
    if (!fn) return;
    // simple rate limiting per sound
    const now = this.ctx.currentTime;
    const lim = LIMIT[name] ?? 0.012;
    if (now - (this.last.get(name) ?? -1) < lim) return;
    this.last.set(name, now);
    let pan = 0, vol = o.vol ?? 1;
    if (o.pos && G.rig) {
      const cam = G.rig.camera;
      const dx = o.pos.x - cam.position.x, dz = o.pos.z - cam.position.z;
      const r = G.rig.right;
      const dist = Math.hypot(dx, dz);
      pan = dist > 0.01 ? (dx * r.x + dz * r.z) / dist * 0.6 : 0;
      vol *= Math.min(1, 14 / Math.max(6, dist));
    }
    const t0 = now + (o.delay ?? 0) / Math.max(0.2, G.timeScale ?? 1);
    const p = (o.pitch ?? 1) * (0.94 + Math.random() * 0.12) * Math.max(0.55, Math.min(1, (G.timeScale ?? 1) * 0.6 + 0.4));
    const dest = this.out({ vol, pan, verb: VERB[name] ?? 0.15 });
    fn(this, dest, t0, p);
  }
}

const LIMIT = { step: 0.08, casing: 0.03, gun: 0.02, hitBullet: 0.02 };
const VERB = { explosion: 0.5, slam: 0.45, hitSlashBig: 0.35, thunder: 0.6, ult: 0.6 };

// name → synth(audio, dest, t0, pitch)
export const SFX = {
  whoosh(A, d, t, p) {
    A.noise(d, t, 0.16, { type: 'bandpass', f0: 600 * p, f1: 3200 * p, q: 1.2, a: 0.04, vol: 0.6, curve: 2 });
    A.noise(d, t + 0.02, 0.12, { type: 'highpass', f0: 3000 * p, f1: 6000 * p, q: 0.7, a: 0.03, vol: 0.25 });
  },
  whooshBig(A, d, t, p) {
    A.noise(d, t, 0.3, { type: 'bandpass', f0: 300 * p, f1: 1800 * p, q: 1, a: 0.08, vol: 0.8, curve: 2 });
    A.noise(d, t + 0.04, 0.25, { type: 'bandpass', f0: 900 * p, f1: 4000 * p, q: 1.5, a: 0.06, vol: 0.4 });
  },
  hitSlash(A, d, t, p) {
    A.noise(d, t, 0.05, { type: 'highpass', f0: 4000 * p, f1: 2500 * p, q: 0.8, a: 0.001, vol: 0.9 });
    A.noise(d, t, 0.14, { type: 'bandpass', f0: 2400 * p, f1: 900 * p, q: 2, a: 0.002, vol: 0.8 });
    A.tone(d, t, 0.12, { type: 'triangle', f0: 180 * p, f1: 60, vol: 0.9 });
    A.tone(d, t, 0.25, { type: 'sine', f0: 2600 * p, f1: 2400 * p, vol: 0.12, curve: 4 });
  },
  hitSlashBig(A, d, t, p) {
    A.noise(d, t, 0.08, { type: 'highpass', f0: 3500 * p, f1: 2000 * p, q: 0.8, a: 0.001, vol: 1 });
    A.noise(d, t, 0.3, { type: 'bandpass', f0: 1800 * p, f1: 400 * p, q: 1.5, a: 0.002, vol: 0.9 });
    A.tone(d, t, 0.3, { type: 'sine', f0: 140 * p, f1: 40, vol: 1.2 });
    A.tone(d, t, 0.5, { type: 'sine', f0: 3100 * p, f1: 2900 * p, vol: 0.12, curve: 5 });
  },
  hitHeavy(A, d, t, p) {
    A.noise(d, t, 0.06, { type: 'lowpass', f0: 5000, f1: 1500, q: 0.7, a: 0.001, vol: 1 });
    A.noise(d, t, 0.35, { type: 'lowpass', f0: 900 * p, f1: 150, q: 1, a: 0.003, vol: 1 });
    A.tone(d, t, 0.35, { type: 'sine', f0: 110 * p, f1: 35, vol: 1.4 });
    A.tone(d, t, 0.08, { type: 'square', f0: 220 * p, f1: 80, vol: 0.25 });
  },
  hitBullet(A, d, t, p) {
    A.noise(d, t, 0.05, { type: 'bandpass', f0: 3000 * p, f1: 1200, q: 1.5, a: 0.001, vol: 0.7 });
    A.tone(d, t, 0.06, { type: 'triangle', f0: 300 * p, f1: 120, vol: 0.5 });
  },
  hitPierce(A, d, t, p) {
    A.noise(d, t, 0.08, { type: 'highpass', f0: 3500 * p, f1: 5000, q: 1, a: 0.001, vol: 0.8 });
    A.tone(d, t, 0.15, { type: 'triangle', f0: 260 * p, f1: 70, vol: 0.9 });
    A.tone(d, t, 0.2, { type: 'sine', f0: 1800 * p, f1: 1600, vol: 0.12 });
  },
  gun(A, d, t, p) {
    A.noise(d, t, 0.03, { type: 'highpass', f0: 2000, f1: 1500, q: 0.5, a: 0.0005, vol: 1 });
    A.noise(d, t, 0.18, { type: 'lowpass', f0: 3000 * p, f1: 300, q: 0.8, a: 0.001, vol: 0.9 });
    A.tone(d, t, 0.1, { type: 'sine', f0: 160 * p, f1: 50, vol: 1 });
  },
  shotgun(A, d, t, p) {
    A.noise(d, t, 0.05, { type: 'highpass', f0: 1500, f1: 900, q: 0.5, a: 0.0005, vol: 1 });
    A.noise(d, t, 0.45, { type: 'lowpass', f0: 2400 * p, f1: 120, q: 0.7, a: 0.002, vol: 1.2 });
    A.tone(d, t, 0.25, { type: 'sine', f0: 100 * p, f1: 32, vol: 1.6 });
  },
  sniper(A, d, t, p) {
    A.noise(d, t, 0.04, { type: 'highpass', f0: 2500, f1: 1800, q: 0.5, a: 0.0005, vol: 1.1 });
    A.noise(d, t, 0.8, { type: 'lowpass', f0: 3500 * p, f1: 80, q: 0.6, a: 0.002, vol: 1.1, curve: 4 });
    A.tone(d, t, 0.4, { type: 'sine', f0: 90 * p, f1: 28, vol: 1.6 });
    A.tone(d, t + 0.02, 0.6, { type: 'sawtooth', f0: 2400, f1: 300, vol: 0.06 });
  },
  casing(A, d, t, p) {
    A.tone(d, t, 0.08, { type: 'sine', f0: 4200 * p, f1: 4100 * p, vol: 0.2, curve: 4 });
    A.tone(d, t, 0.06, { type: 'sine', f0: 6100 * p, f1: 6000 * p, vol: 0.1, curve: 4 });
  },
  explosion(A, d, t, p) {
    A.noise(d, t, 0.08, { type: 'lowpass', f0: 6000, f1: 2000, q: 0.5, a: 0.001, vol: 1 });
    A.noise(d, t, 1.4, { type: 'lowpass', f0: 1500 * p, f1: 60, q: 0.7, a: 0.004, vol: 1.4, curve: 4 });
    A.tone(d, t, 0.8, { type: 'sine', f0: 70 * p, f1: 22, vol: 2.0 });
    A.noise(d, t + 0.05, 1.0, { type: 'bandpass', f0: 400, f1: 120, q: 0.6, a: 0.1, vol: 0.6 });
  },
  slam(A, d, t, p) {
    A.noise(d, t, 0.05, { type: 'lowpass', f0: 5000, f1: 1500, q: 0.7, a: 0.001, vol: 1 });
    A.noise(d, t, 0.7, { type: 'lowpass', f0: 1200 * p, f1: 70, q: 0.8, a: 0.003, vol: 1.3, curve: 4 });
    A.tone(d, t, 0.6, { type: 'sine', f0: 80 * p, f1: 26, vol: 2.0 });
    A.noise(d, t + 0.04, 0.6, { type: 'bandpass', f0: 2500, f1: 600, q: 1, a: 0.02, vol: 0.3 });
  },
  thud(A, d, t, p) {
    A.noise(d, t, 0.15, { type: 'lowpass', f0: 800 * p, f1: 120, q: 0.8, a: 0.002, vol: 0.6 });
    A.tone(d, t, 0.15, { type: 'sine', f0: 100 * p, f1: 45, vol: 0.8 });
  },
  step(A, d, t, p) { A.noise(d, t, 0.05, { type: 'lowpass', f0: 900 * p, f1: 300, q: 0.7, a: 0.002, vol: 0.25 }); },
  jump(A, d, t, p) { A.noise(d, t, 0.12, { type: 'bandpass', f0: 500 * p, f1: 1400, q: 1, a: 0.01, vol: 0.35 }); },
  jump2(A, d, t, p) {
    A.noise(d, t, 0.2, { type: 'bandpass', f0: 700 * p, f1: 2600, q: 1.2, a: 0.01, vol: 0.4 });
    A.tone(d, t, 0.25, { type: 'sine', f0: 600 * p, f1: 1300 * p, vol: 0.12 });
  },
  land(A, d, t, p) { A.noise(d, t, 0.1, { type: 'lowpass', f0: 600 * p, f1: 150, q: 0.7, a: 0.002, vol: 0.4 }); },
  dash(A, d, t, p) {
    A.noise(d, t, 0.25, { type: 'bandpass', f0: 1800 * p, f1: 500, q: 0.8, a: 0.01, vol: 0.6 });
    A.noise(d, t, 0.15, { type: 'highpass', f0: 5000, f1: 3000, q: 0.5, a: 0.005, vol: 0.2 });
  },
  blink(A, d, t, p) {
    A.tone(d, t, 0.18, { type: 'sine', f0: 1400 * p, f1: 300, vol: 0.3 });
    A.tone(d, t + 0.08, 0.2, { type: 'sine', f0: 300 * p, f1: 1600, vol: 0.3 });
    A.noise(d, t, 0.2, { type: 'highpass', f0: 6000, f1: 3000, q: 0.7, a: 0.01, vol: 0.2 });
  },
  equip(A, d, t, p) {
    A.tone(d, t, 0.12, { type: 'triangle', f0: 1200 * p, f1: 1500, vol: 0.18 });
    A.noise(d, t, 0.08, { type: 'highpass', f0: 4000, f1: 6000, q: 1, a: 0.002, vol: 0.2 });
  },
  charge(A, d, t, p) {
    A.tone(d, t, 0.3, { type: 'sawtooth', f0: 200 * p, f1: 600 * p, vol: 0.08, a: 0.05 });
    A.noise(d, t, 0.3, { type: 'bandpass', f0: 800 * p, f1: 2400 * p, q: 3, a: 0.05, vol: 0.2 });
  },
  chargeLvl(A, d, t, p) {
    A.tone(d, t, 0.35, { type: 'sine', f0: 880 * p, f1: 880 * p, vol: 0.25, curve: 4 });
    A.tone(d, t, 0.35, { type: 'sine', f0: 1320 * p, f1: 1320 * p, vol: 0.15, curve: 4 });
    A.noise(d, t, 0.2, { type: 'highpass', f0: 5000, f1: 7000, q: 1, a: 0.002, vol: 0.2 });
  },
};
