// Night look-dev (K toggles in game): set dressing + one spell against the dark.
module.exports = async ({ shot, ev, step }) => {
  await ev((app) => { app.arena.setTimeOfDay('night', app.pipeline); app.ambience.night = true; });
  await step(90);
  await shot('night_default');
  await ev((app) => { app.rig.yaw = 0.36; app.rig.pitch = 0.02; });
  await step(20);
  await shot('night_moon');
  await ev((app) => {
    app.player.equip(11); app.rig.yaw = -0.2; app.rig.pitch = 0.2;
    const w = app.weapons[11]; w.computeAim = () => w.aimPoint.set(0, 0, 8); w.aimT = 1;
    app.input.press('Mouse2');
  });
  await step(1);
  await ev((app) => app.input.release('Mouse2'));
  await step(36);
  await shot('night_thunder');
  await ev((app) => { app.player.equip(0); app.input.press('Mouse0'); });
  await step(1);
  await ev((app) => app.input.release('Mouse0'));
  for (let i = 0; i < 3; i++) { await step(13); await ev((app) => { app.input.press('Mouse0'); }); await step(1); await ev((app) => app.input.release('Mouse0')); }
  await step(8);
  await shot('night_katana');
};
