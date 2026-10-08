// Environment look-dev: a few fixed camera angles around the plaza.
module.exports = async ({ shot, ev, step }) => {
  await step(40);
  await shot('env_default');
  await ev((app) => { app.rig.yaw = -0.62; app.rig.pitch = 0.12; });
  await step(30);
  await shot('env_sun');
  await ev((app) => { app.rig.yaw = 2.4; app.rig.pitch = 0.2; });
  await step(30);
  await shot('env_back');
  // near a stone lantern, looking out over the grass ring (crest on the coat back)
  await ev((app) => {
    const a = Math.PI / 8 * 3 + 0.14, r = 22.5;
    app.player.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r); app.player.yaw = Math.atan2(Math.cos(a), Math.sin(a));
    app.rig.yaw = app.player.yaw; app.rig.pitch = 0.22; app.rig.focus.copy(app.player.pos).setY(1.4);
  });
  await step(40);
  await shot('env_lantern');
  // mid-pass of the bird flock, default framing
  await ev((app) => {
    app.player.pos.set(0, 0, 0); app.player.yaw = 0; app.rig.yaw = -0.25; app.rig.pitch = 0.05; app.rig.focus.set(0, 1.4, 0);
    app.arena.birdT = -11; app.arena.birdPath = { a: 1.75, h: 30, r: 105, dir: 1 };
  });
  await step(20);
  await shot('env_birds');
};
