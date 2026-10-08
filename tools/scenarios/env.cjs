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
};
