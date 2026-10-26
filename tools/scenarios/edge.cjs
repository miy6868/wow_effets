// Camera boom vs. props: back the player up against a pillar and look inward.
module.exports = async ({ shot, ev, step }) => {
  for (const [name, a, r] of [['edge_pillar', 0.13, 25.2], ['edge_gate', 1.963, 25.6]]) {
    await ev((app, a, r) => {
      app.player.pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      app.player.yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      app.rig.yaw = app.player.yaw; app.rig.pitch = 0.2; app.rig.focus.copy(app.player.pos).setY(1.4);
    }, a, r);
    await step(30);
    await shot(name);
  }
};
