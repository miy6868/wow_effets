// Generative ambient score: a soft drone + sparse koto-like plucks on a
// Japanese "yo" pentatonic scale. Everything is synthesized; plucks are
// pre-rendered once with Karplus-Strong, then scheduled a little ahead of the
// audio clock so phrases never stutter with frame rate.

const SCALE = [146.83, 164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33]; // D E G A B over two octaves

export class Music {
  constructor(ctx, out, verb) {
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    this.send = ctx.createGain();
    this.send.gain.value = 0.9;
    this.bus.connect(this.send).connect(verb);
    this.level = 0.5;
    this.on = true;
    this.next = ctx.currentTime + 1.5;
    this.idx = 5;
    this.plucks = SCALE.map((f) => this.koto(f));
    this.drone();
    this.bus.gain.setTargetAtTime(this.level, ctx.currentTime, 2.5);
  }

  setOn(on) {
    this.on = on;
    this.bus.gain.setTargetAtTime(on ? this.level : 0, this.ctx.currentTime, on ? 1.2 : 0.25);
  }

  /** Karplus-Strong pluck with a bright attack and a woody, damped tail. */
  koto(f) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 3.2);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(N);
    // excitation: noise shaped by pluck position (comb) for a nasal koto colour
    for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
    const pp = Math.floor(N * 0.18);
    for (let i = N - 1; i >= pp; i--) line[i] -= line[i - pp] * 0.85;
    let p = 0, prev = 0;
    const damp = 0.4965 + Math.min(0.0025, f / 400000);
    for (let i = 0; i < len; i++) {
      const cur = line[p];
      const nx = line[(p + 1) % N];
      const y = (cur + nx) * damp;
      line[p] = y;
      p = (p + 1) % N;
      // gentle one-pole low-pass on the output
      prev += (cur - prev) * 0.55;
      d[i] = prev;
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const k = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) d[i] *= k * (i > len - 2000 ? (len - i) / 2000 : 1);
    return buf;
  }

  drone() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.075;
    lp.connect(g).connect(this.bus);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    for (const [f, type, v, det] of [[73.42, 'sawtooth', 0.22, -4], [73.42, 'sawtooth', 0.22, 5], [110.0, 'triangle', 0.5, 0], [146.83, 'sine', 0.35, 2]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = v;
      o.connect(og).connect(lp);
      o.start();
    }
  }

  note(i, t, vel = 1, pan = 0) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.plucks[i];
    const g = ctx.createGain(); g.gain.value = 0.32 * vel;
    let node = s.connect(g);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(this.bus);
    s.start(t);
  }

  /** A short phrase: a random walk on the scale with a lingering last note. */
  phrase(t) {
    const n = 2 + Math.floor(Math.random() * 4);
    const pan = (Math.random() - 0.5) * 0.6;
    for (let k = 0; k < n; k++) {
      const step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
      this.idx = Math.max(2, Math.min(SCALE.length - 1, this.idx + step));
      const vel = k === n - 1 ? 0.8 : 0.55 + Math.random() * 0.35;
      this.note(this.idx, t, vel, pan);
      // occasional grace note an octave-ish below for a koto "sukui" flavour
      if (Math.random() < 0.15 && this.idx >= 5) this.note(this.idx - 5, t + 0.04, vel * 0.45, -pan);
      t += [0.28, 0.42, 0.42, 0.56, 0.84][Math.floor(Math.random() * 5)];
    }
    if (Math.random() < 0.3) this.idx = 5; // drift home to D
    return t;
  }

  /** Call every frame (or once with a long horizon for offline rendering). */
  scheduleUntil(horizon) {
    while (this.next < horizon) {
      const end = this.phrase(this.next);
      this.next = end + 1.8 + Math.random() * 3.2;
    }
  }

  tick() {
    if (!this.on) { this.next = Math.max(this.next, this.ctx.currentTime + 0.5); return; }
    this.scheduleUntil(this.ctx.currentTime + 0.6);
  }
}
