// Shared game context (filled in by main.js).
export const G = {
  scene: null,
  fx: null,
  rig: null,        // CameraRig
  pipeline: null,
  input: null,
  player: null,
  dummies: null,
  audio: null,
  hud: null,
  settings: {
    damageNumbers: false,
    shake: 1.0,
    hitstop: 1.0,
    sound: true,
    music: true,
  },
};
