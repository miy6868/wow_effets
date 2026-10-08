// Hero shots for docs/ (HUD hidden via photo-mode class). Same runner as gallery.cjs.
const S = [
  // name, weapon, player [x,z,yaw], cam [yaw,pitch], aim | null, inputs, shots
  ['katana', 0, [0, 3.4, 0], [0.55, 0.22], null, [[0, 'Mouse0'], [14, 'Mouse0'], [28, 'Mouse0'], [42, 'Mouse0']], [8, 22, 36, 66]],
  ['thunder', 11, [0, 0, 0], [-0.35, 0.16], [0, 0, 8], [[0, 'Mouse2']], [44]],
  ['dark_hole', 13, [0, -2, 0], [-0.2, 0.2], [0, 1.0, 8], [[0, 'Mouse2']], [80]],
  ['meteor', 9, [0, -2, 0], [0.4, 0.28], null, [[0, 'KeyF']], [150]],
];
module.exports = async ({ shot, ev, step }) => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const want = (n) => !only.length || only.includes(n);
  await ev(() => document.body.classList.add('photo'));
  if (process.env.NIGHT) await ev((app) => { app.arena.setTimeOfDay('night', app.pipeline); app.ambience.night = true; });
  // establishing shot: sunset, torii, a flock crossing
  if (want('hero')) await ev((app) => {
    app.player.pos.set(0, 0, 0); app.player.yaw = -0.3; app.rig.yaw = -0.3; app.rig.pitch = 0.06; app.rig.focus.set(0, 1.4, 0);
    app.arena.birdT = -11; app.arena.birdPath = { a: 1.75, h: 30, r: 105, dir: 1 };
  });
  if (want('hero')) { await step(30); await shot('hero'); }
  for (const [name, W, pl, cam, aim, inputs, shots] of S) {
    if (!want(name)) continue;
    await ev((app, W, pl, cam, aim) => {
      app.fx.clearAll(); app.G.projectiles.clear(); app.dummies.reset();
      if (app.player.action) app.player.endAction();
      app.G.rig.cine = null; app.G.rig.cineW = 0; app.G.ultCooldown = 0;
      app.player.equip(W);
      app.player.pos.set(pl[0], 0, pl[1]); app.player.vel.set(0, 0, 0); app.player.yaw = pl[2];
      app.rig.yaw = cam[0]; app.rig.pitch = cam[1]; app.rig.focus.set(pl[0], 1.4, pl[1]); app.rig.trauma = 0;
      const w = app.weapons[W];
      if (aim && w.computeAim) { w.computeAim = () => w.aimPoint.set(aim[0], aim[1], aim[2]); w.aimT = 1; }
    }, W, pl, cam, aim);
    await step(20);
    const maxF = Math.max(...shots);
    const held = new Map();
    for (let f = 0; f <= maxF; f++) {
      for (const [fr, code, hold] of inputs) if (fr === f) { await ev((app, c) => app.input.press(c), code); held.set(code, f + (hold || 1)); }
      for (const [code, until] of [...held]) if (f >= until) { await ev((app, c) => app.input.release(c), code); held.delete(code); }
      await step(1);
      if (shots.includes(f)) await shot(shots.length > 1 ? `${name}_${f}` : name);
    }
    for (const code of held.keys()) await ev((app, c) => app.input.release(c), code);
  }
};
