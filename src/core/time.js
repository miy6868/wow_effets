// Global time control: slow motion (eased), user slow-mo toggle, pause.
// Per-entity hitstop lives on the entities themselves.
export const Time = {
  real: 0,          // seconds since start (real)
  game: 0,          // scaled time
  dtReal: 0,
  dt: 0,            // scaled dt for gameplay
  scale: 1,
  userScale: 1,     // Z toggle (observation slow-mo)
  paused: false,    // photo mode
  _slow: [],        // active slowmo requests
  freeze: 0,        // global freeze (seconds, real) – used for big impact frames
};

/** Request a slow-motion window: ramp in, hold, ramp out (real seconds). */
export function slowmo(scale, hold, rampOut = 0.25, rampIn = 0.03) {
  Time._slow.push({ scale, hold, rampOut, rampIn, t: 0 });
}

export function globalFreeze(sec) {
  Time.freeze = Math.max(Time.freeze, sec);
}

export function tickTime(dtReal) {
  Time.dtReal = dtReal;
  Time.real += dtReal;
  let s = 1;
  for (let i = Time._slow.length - 1; i >= 0; i--) {
    const r = Time._slow[i];
    r.t += dtReal;
    let k;
    if (r.t < r.rampIn) k = r.t / r.rampIn;
    else if (r.t < r.rampIn + r.hold) k = 1;
    else if (r.t < r.rampIn + r.hold + r.rampOut) {
      const x = (r.t - r.rampIn - r.hold) / r.rampOut;
      k = 1 - x * x * (3 - 2 * x);
    } else { Time._slow.splice(i, 1); continue; }
    s = Math.min(s, 1 + (r.scale - 1) * k);
  }
  if (Time.freeze > 0) { Time.freeze -= dtReal; s = 0; }
  Time.scale = Time.paused ? 0 : s * Time.userScale;
  Time.dt = dtReal * Time.scale;
  Time.game += Time.dt;
}
