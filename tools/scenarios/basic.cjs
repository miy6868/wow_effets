module.exports = async ({ shot, ev, step }) => {
  await step(30);
  await shot('00_idle');
  await ev((app) => { app.rig.yaw = 0.6; app.rig.pitch = 0.25; });
  await step(20);
  await shot('01_angle');
};
