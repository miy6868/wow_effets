// Runs many short move scenarios in one page and saves key frames.
// env: ONLY=name1,name2 (optional filter)
const S = [
  // name, weapon index, player [x,z,yaw], cam [yaw,pitch], aim [x,y,z] | null, inputs [[frame, code, hold]], shots [frames]
  ['katana_combo', 0, [0, 3.2, 0], [0.7, 0.3], null, [[0, 'Mouse0'], [14, 'Mouse0'], [28, 'Mouse0'], [42, 'Mouse0']], [8, 22, 36, 52, 58, 66]],
  ['katana_launch', 0, [0, 4.2, 0], [1.0, 0.18], null, [[0, 'Mouse2'], [24, 'Mouse0'], [46, 'Mouse0'], [68, 'Mouse0']], [12, 30, 52, 78, 95, 110]],
  ['gs_charge', 1, [0, 1.0, 0], [0.9, 0.3], null, [[0, 'Mouse2', 100]], [40, 100, 125, 135, 145, 165]],
  ['spear_lunge', 2, [-1, 0, 0], [1.1, 0.25], null, [[0, 'Mouse2']], [10, 24, 30, 36, 46, 60]],
  ['dual_storm', 3, [0, 4.5, 0], [0.8, 0.3], null, [[0, 'Mouse2']], [10, 25, 40, 55, 70, 80]],
  ['pistol_fire', 4, [-1, 2.5, 0], [1.0, 0.2], [0, 1.1, 6.5], [[0, 'Mouse0', 30]], [4, 10, 16, 22, 28, 36]],
  ['shotgun', 5, [0, 4.0, 0], [1.1, 0.22], [0, 1.0, 6.5], [[0, 'Mouse0'], [50, 'Mouse2']], [3, 8, 16, 54, 60, 70]],
  ['sniper', 6, [-2, 0, 0], [1.0, 0.22], [-6, 1.1, 10.5], [[0, 'Mouse0']], [2, 5, 10, 18, 28, 40]],
  ['minigun', 7, [0, 2, 0], [0.9, 0.22], [-3.2, 1.1, 7.8], [[0, 'Mouse0', 80]], [30, 50, 70, 82, 95, 110]],
  ['rocket', 8, [0, -2, 0], [1.25, 0.3], [0, 0.9, 6.5], [[0, 'Mouse0']], [4, 12, 20, 26, 34, 50]],
  ['fireball', 9, [0, 0, 0], [0.9, 0.22], [0, 1.0, 6.5], [[0, 'Mouse0']], [6, 12, 18, 22, 28, 40]],
  ['fire_pillar', 9, [0, 0, 0], [0.7, 0.28], [0, 0, 8], [[0, 'Mouse2', 60]], [30, 62, 70, 78, 90, 110]],
  ['ice_lance', 10, [0, 0, 0], [0.9, 0.22], [0, 1.0, 6.5], [[0, 'Mouse0'], [32, 'Mouse0'], [64, 'Mouse0']], [8, 14, 40, 75, 85, 100]],
  ['ice_wave', 10, [0, 0, 0], [0.8, 0.3], [0, 0, 8], [[0, 'Mouse2']], [8, 16, 28, 45, 70, 95]],
  ['thunder', 11, [0, 0, 0], [0.6, 0.3], [0, 0, 8], [[0, 'Mouse2']], [20, 26, 32, 38, 48, 70]],
  ['light_lance', 12, [0, 0, 0], [0.6, 0.25], [0, 1.0, 6.5], [[0, 'Mouse0']], [6, 14, 22, 30, 38, 50]],
  ['light_beam', 12, [0, 0, 0], [0.9, 0.25], [0, 1.0, 9], [[0, 'Mouse2', 60]], [30, 62, 70, 80, 100, 130]],
  ['dark_orb', 13, [0, 0, 0], [0.8, 0.25], [0, 1.0, 6.5], [[0, 'Mouse0'], [20, 'Mouse0']], [8, 16, 26, 34, 42, 55]],
  ['dark_hole', 13, [0, -2, 0], [0.5, 0.28], [0, 1.0, 8], [[0, 'Mouse2']], [15, 40, 80, 130, 160, 175]],
  ['chain', 11, [0, 1, 0], [0.0, 0.22], [0, 1.0, 6.5], [[0, 'Mouse0']], [3, 6, 10, 16]],
  ['ult_blade', 0, [0, 0, 0], [0.4, 0.28], null, [[0, 'KeyF']], [20, 60, 100, 140, 175, 200, 215, 240]],
  ['ult_gun', 4, [0, 0, 0], [0.4, 0.28], null, [[0, 'KeyF']], [20, 60, 100, 140, 175, 200, 215, 240]],
  ['ult_meteor', 9, [0, -2, 0], [0.4, 0.28], null, [[0, 'KeyF']], [20, 60, 100, 140, 175, 200, 215, 240]],
];
const fs = require('fs');
module.exports = async ({ shot, ev, step }) => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  for (const [name, W, pl, cam, aim, inputs, shots] of S) {
    if (only.length && !only.includes(name)) continue;
    await ev((app, W, pl, cam, aim) => {
      app.fx.clearAll(); app.G.projectiles.clear(); app.dummies.reset();
      if (app.player.action) app.player.endAction();
      app.G.rig.cine = null; app.G.rig.cineW = 0; app.G.ultCooldown = 0;
      app.player.equip(W);
      app.player.pos.set(pl[0], 0, pl[1]); app.player.vel.set(0, 0, 0); app.player.yaw = pl[2];
      app.rig.yaw = cam[0]; app.rig.pitch = cam[1]; app.rig.focus.set(pl[0], 1.4, pl[1]); app.rig.trauma = 0;
      const w = app.weapons[W];
      if (aim && w.computeAim) { w.computeAim = () => w.aimPoint.set(aim[0], aim[1], aim[2]); w.aimT = 1; }
      for (const d of app.dummies.list) d.lastHit = -10;
    }, W, pl, cam, aim);
    await step(20);
    const maxF = Math.max(...shots);
    const held = new Map();
    let si = 0;
    for (let f = 0; f <= maxF; f++) {
      for (const [fr, code, hold] of inputs) {
        if (fr === f) { await ev((app, c) => app.input.press(c), code); held.set(code, f + (hold || 1)); }
      }
      for (const [code, until] of [...held]) if (f >= until) { await ev((app, c) => app.input.release(c), code); held.delete(code); }
      await step(1);
      if (shots.includes(f)) await shot(`${name}_${String(f).padStart(3, '0')}`);
    }
    for (const code of held.keys()) await ev((app, c) => app.input.release(c), code);
  }
};
