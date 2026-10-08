// Entry point: builds the world and runs the main loop.
import * as THREE from 'three';
import { G } from './ctx.js';
import { Pipeline } from './render/pipeline.js';
import { toonGlobals } from './render/shaders/toon.js';
import { Arena, Ambience } from './world/arena.js';
import { CameraRig } from './core/camera.js';
import { Input } from './core/input.js';
import { Time, tickTime, slowmo } from './core/time.js';
import { ScreenFX } from './core/screen.js';
import { Audio } from './core/audio.js';
import { FX } from './vfx/fx.js';
import { FXP } from './vfx/presets.js';
import { Player } from './entities/player.js';
import { DummyManager } from './entities/dummy.js';
import { Projectiles } from './combat/projectiles.js';
import { HUD } from './ui/hud.js';
import { Portrait } from './ui/portrait.js';
import { createWeapons } from './weapons/index.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
let attract = false;

const canvas = document.getElementById('c');
const pipeline = new Pipeline(canvas);
const scene = new THREE.Scene();
const rig = new CameraRig(innerWidth / innerHeight);
const arena = new Arena(scene);
rig.colliders = arena.colliders;
const fx = new FX(scene, pipeline, rig.camera);
const input = new Input(canvas);
const audio = new Audio();
const screen = new ScreenFX(pipeline);

Object.assign(G, { scene, fx, rig, pipeline, input, audio, screen, fxp: FXP, slowmo, time: 0 });

const ambience = new Ambience(fx);
if (params.has('night')) { arena.setTimeOfDay('night', pipeline); ambience.night = true; }
const dummies = new DummyManager(scene);
G.dummies = dummies;
const player = new Player(scene);
G.player = player;
const projectiles = new Projectiles();
G.projectiles = projectiles;

const weapons = createWeapons();
player.setWeapons(weapons);
const hud = new HUD(weapons);
G.hud = hud;
player.equip(0);

function resize() {
  const w = TEST ? Number(params.get('w') || 1280) : innerWidth;
  const h = TEST ? Number(params.get('h') || 720) : innerHeight;
  pipeline.setSize(w, h);
  rig.camera.aspect = w / h;
  rig.camera.updateProjectionMatrix();
  if (TEST) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
}
addEventListener('resize', resize);
resize();

// ── global keys ────────────────────────────────────────────────────────────────
const WEAPON_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash'];
let wheelCD = 0;
function globalKeys() {
  WEAPON_KEYS.forEach((k, i) => { if (input.wasPressed(k)) player.equip(i); });
  const n = weapons.length;
  if (input.wasPressed('KeyQ')) player.equip((player.weaponIndex + n - 1) % n);
  if (input.wasPressed('KeyE')) player.equip((player.weaponIndex + 1) % n);
  wheelCD -= Time.dtReal;
  if (input.wheel && wheelCD <= 0) { wheelCD = 0.14; player.equip((player.weaponIndex + Math.sign(input.wheel) + n) % n); }
  if (input.wasPressed('KeyZ')) {
    Time.userScale = Time.userScale < 1 ? 1 : 0.25;
    G.time_userSlow = Time.userScale < 1;
    hud.toast(Time.userScale < 1 ? '슬로모션 ON (×0.25)' : '슬로모션 OFF');
  }
  if (input.wasPressed('KeyP')) {
    Time.paused = !Time.paused; G.paused = Time.paused;
    document.body.classList.toggle('photo', Time.paused);
    hud.toast(Time.paused ? '일시정지 · 마우스로 카메라 회전' : '재개');
  }
  if (input.wasPressed('KeyT')) { dummies.reset(); hud.toast('허수아비 리셋'); }
  if (input.wasPressed('KeyH') || input.wasPressed('F1')) hud.help.classList.toggle('on');
  if (input.wasPressed('KeyM')) { G.settings.sound = !G.settings.sound; audio.mute(!G.settings.sound); hud.toast(G.settings.sound ? '사운드 ON' : '사운드 OFF'); }
  if (input.wasPressed('KeyK')) {
    const night = arena.time !== 'night';
    arena.setTimeOfDay(night ? 'night' : 'dusk', pipeline);
    ambience.night = night;
    hud.toast(night ? '달밤' : '해질녘');
  }
  if (input.wasPressed('KeyJ')) { G.settings.music = !G.settings.music; audio.music?.setOn(G.settings.music); hud.toast(G.settings.music ? '음악 ON' : '음악 OFF'); }
  if (input.wasPressed('KeyN')) { G.settings.damageNumbers = !G.settings.damageNumbers; hud.toast(G.settings.damageNumbers ? '데미지 숫자 ON' : '데미지 숫자 OFF'); }
  if (input.wasPressed('KeyB')) { pipeline.bloomEnabled = !pipeline.bloomEnabled; hud.toast(pipeline.bloomEnabled ? '블룸 ON' : '블룸 OFF'); }
  if (input.wasPressed('KeyG')) {
    const u = pipeline.shadow.uniforms.uShadowOn;
    u.value = u.value > 0.5 ? 0 : 1;
    hud.toast(u.value ? '그림자 ON' : '그림자 OFF');
  }
  if (input.wasPressed('KeyV')) { G.settings.shake = G.settings.shake > 0 ? 0 : 1; hud.toast(G.settings.shake ? '화면 흔들림 ON' : '화면 흔들림 OFF'); }
  if (input.wasPressed('Backquote')) { hud.showFps = !hud.showFps; }
}

// ── loop ───────────────────────────────────────────────────────────────────────
function frame(dtReal) {
  tickTime(dtReal);
  G.time = Time.game;
  G.timeScale = Time.scale;
  G.realTime = Time.real;
  if (!player.action?.isUlt) G.ultCooldown = Math.max(0, (G.ultCooldown ?? 0) - dtReal);
  globalKeys();
  if (input.pressed.size) audio.unlock();

  player.update(Time.dt, input);
  dummies.update(Time.dt);
  projectiles.update(Time.dt);
  ambience.update(Time.dt, player.pos);
  audio.music?.tick();
  arena.update(Time.dt, fx, player.pos);
  fx.update(Time.dt);

  attractCam?.();
  const camOpts = { ...(player.weapon?.cameraOpts?.(player) ?? {}), ...(player.action?.cam ?? {}) };
  rig.update(dtReal, player.pos, input, camOpts);
  screen.update(dtReal);
  hud.update(dtReal);

  toonGlobals.uTime.value = Time.real;
  arena.sky.position.copy(rig.camera.position);
  arena.updateSun(rig.camera, pipeline);
  pipeline.shadowCenter.copy(player.pos).addScaledVector(rig.flatForward(new THREE.Vector3()), 8);
  pipeline.render(scene, rig.camera, Time.real);
  input.endFrame();
}

let last = performance.now();
let errCount = 0;
// adaptive resolution: keep frame time near 60 fps on unknown hardware
const PR_MAX = Math.min(window.devicePixelRatio || 1, 1.5);
let prAcc = 0, prN = 0;
function adaptResolution(dt) {
  prAcc += dt; prN++;
  if (prAcc < 1.5) return;
  const avg = prAcc / prN;
  prAcc = 0; prN = 0;
  let pr = pipeline.pixelRatio;
  if (avg > 1 / 45 && pr > 0.7) pr = Math.max(0.7, pr - 0.15);
  else if (avg < 1 / 58 && pr < PR_MAX) pr = Math.min(PR_MAX, pr + 0.1);
  if (Math.abs(pr - pipeline.pixelRatio) > 1e-3) { pipeline.pixelRatio = pr; resize(); }
}
function loop(now) {
  // schedule first so one bad frame can never freeze the whole game
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (!document.hidden) adaptResolution((now - (loop.prev ?? now)) / 1000);
  loop.prev = now;
  try {
    frame(dt);
  } catch (e) {
    input.endFrame();
    if (errCount++ < 5) console.error(e);
  }
}

// ── test / automation hooks ────────────────────────────────────────────────────
window.__app = {
  G, Time, THREE, player, dummies, fx, rig, input, pipeline, weapons, screen, arena, ambience,
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
  run(sec, dt = 1 / 60) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) frame(dt); },
  tap(code) { input.press(code); frame(1 / 60); input.release(code); },
};

// cut-in portrait: render the hero's face once through the toon pipeline
function makePortrait() {
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
  player.model.root.updateMatrixWorld(true);
  const head = player.model.head.getWorldPosition(new THREE.Vector3());
  const fwd = player.forward(new THREE.Vector3());
  const right = player.right(new THREE.Vector3());
  const eyes = head.clone().add(new THREE.Vector3(0, 0.01, 0)).addScaledVector(fwd, 0.15);
  cam.position.copy(eyes).addScaledVector(fwd, 1.15).addScaledVector(right, -0.34).add(new THREE.Vector3(0, -0.06, 0));
  cam.lookAt(eyes.clone().add(new THREE.Vector3(0, -0.03, 0)));
  cam.rotateZ(-0.12); // dutch angle
  const hidden = [];
  scene.traverse((o) => { if (o.isMesh && o.visible && !isChildOf(o, player.model.root)) { o.visible = false; hidden.push(o); } });
  // dramatic lighting for the still: hard side key, strong cool rim, dark ambient
  const L = toonGlobals;
  const saved = { dir: L.uLightDir.value.clone(), col: L.uLightColor.value.clone(), sky: L.uSkyAmb.value.clone(), gnd: L.uGroundAmb.value.clone(), rim: L.uRimColor.value.clone() };
  // key from behind-left: most of the face falls into screen-tone, a lit rim carves the profile
  L.uLightDir.value.copy(right).multiplyScalar(-1).addScaledVector(fwd, -0.3).add(new THREE.Vector3(0, 0.35, 0)).normalize();
  L.uLightColor.value.setRGB(1.15, 0.98, 0.85);
  L.uSkyAmb.value.setRGB(0.64, 0.66, 0.78); L.uGroundAmb.value.setRGB(0.5, 0.52, 0.66);
  L.uRimColor.value.setRGB(0.6, 0.85, 1.6);
  const prevClear = pipeline.clearColor;
  pipeline.clearColor = 0x0c0818;
  const vig = pipeline.u.uVignette.value; pipeline.u.uVignette.value = 0.4;
  const shOn = pipeline.shadow.uniforms.uShadowOn.value; pipeline.shadow.uniforms.uShadowOn.value = 0;
  const shot = pipeline.snapshot(scene, cam, 512, 512, true);
  pipeline.shadow.uniforms.uShadowOn.value = shOn;
  pipeline.u.uVignette.value = vig;
  pipeline.clearColor = prevClear;
  L.uLightDir.value.copy(saved.dir); L.uLightColor.value.copy(saved.col); L.uSkyAmb.value.copy(saved.sky); L.uGroundAmb.value.copy(saved.gnd); L.uRimColor.value.copy(saved.rim);
  for (const o of hidden) o.visible = true;
  hud.portrait = new Portrait(shot);
}
function isChildOf(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }

fx.prewarm(player.model.root);
if (TEST) {
  input.noLock = true;
  document.body.classList.add('test');
  frame(1 / 60);
  makePortrait();
} else {
  frame(1 / 60);
  makePortrait();
  requestAnimationFrame(loop);
}

// start overlay + slow attract-mode camera behind it
const start = document.getElementById('start');
if (start) {
  if (TEST) start.remove();
  else {
    attract = true;
    document.body.classList.add('attract');
    start.addEventListener('click', () => {
      attract = false;
      rig.cine = null;
      document.body.classList.remove('attract');
      start.classList.add('hide'); audio.unlock(); canvas.requestPointerLock?.();
      hud.playing = true;
      hud.setWeapon(player.weaponIndex);
      setTimeout(() => start.remove(), 800);
    });
  }
}
function attractCam() {
  if (!attract) return;
  const t = Time.real * 0.06;
  const c = player.pos;
  const pos = new THREE.Vector3(c.x + Math.sin(t + 2.4) * 6.4, 1.15, c.z + Math.cos(t + 2.4) * 6.4);
  const toC = new THREE.Vector3().subVectors(c, pos).setY(0).normalize();
  const right = new THREE.Vector3(-toC.z, 0, toC.x);
  const look = c.clone().add(new THREE.Vector3(0, 1.55, 0)).addScaledVector(right, -1.9);
  rig.cine = { pos, look, fov: 42, w: 1, blendSpeed: 30, blendOut: 2.4 };
}
