// Entry point: builds the world and runs the main loop.
import * as THREE from 'three';
import { G } from './ctx.js';
import { Pipeline } from './render/pipeline.js';
import { toonGlobals } from './render/shaders/toon.js';
import { Arena } from './world/arena.js';
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
import { createWeapons } from './weapons/index.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const canvas = document.getElementById('c');
const pipeline = new Pipeline(canvas);
const scene = new THREE.Scene();
const rig = new CameraRig(innerWidth / innerHeight);
const arena = new Arena(scene);
const fx = new FX(scene, pipeline, rig.camera);
const input = new Input(canvas);
const audio = new Audio();
const screen = new ScreenFX(pipeline);

Object.assign(G, { scene, fx, rig, pipeline, input, audio, screen, fxp: FXP, slowmo, time: 0 });

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
function globalKeys() {
  WEAPON_KEYS.forEach((k, i) => { if (input.wasPressed(k)) player.equip(i); });
  const n = weapons.length;
  if (input.wasPressed('KeyQ')) player.equip((player.weaponIndex + n - 1) % n);
  if (input.wasPressed('KeyE')) player.equip((player.weaponIndex + 1) % n);
  if (input.wheel && !(player.weapon?.usesWheel)) player.equip((player.weaponIndex + Math.sign(input.wheel) + n) % n);
  if (input.wasPressed('KeyZ')) {
    Time.userScale = Time.userScale < 1 ? 1 : 0.25;
    G.time_userSlow = Time.userScale < 1;
    hud.toast(Time.userScale < 1 ? '슬로모션 ON (×0.25)' : '슬로모션 OFF');
  }
  if (input.wasPressed('KeyP')) {
    Time.paused = !Time.paused; G.paused = Time.paused;
    hud.toast(Time.paused ? '일시정지 · 마우스로 카메라 회전' : '재개');
  }
  if (input.wasPressed('KeyT')) { dummies.reset(); hud.toast('허수아비 리셋'); }
  if (input.wasPressed('KeyH') || input.wasPressed('F1')) hud.help.classList.toggle('on');
  if (input.wasPressed('KeyM')) { G.settings.sound = !G.settings.sound; hud.toast(G.settings.sound ? '사운드 ON' : '사운드 OFF'); }
  if (input.wasPressed('KeyN')) { G.settings.damageNumbers = !G.settings.damageNumbers; hud.toast(G.settings.damageNumbers ? '데미지 숫자 ON' : '데미지 숫자 OFF'); }
  if (input.wasPressed('KeyB')) { pipeline.bloomEnabled = !pipeline.bloomEnabled; hud.toast(pipeline.bloomEnabled ? '블룸 ON' : '블룸 OFF'); }
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
  fx.update(Time.dt);

  const camOpts = { ...(player.weapon?.cameraOpts?.(player) ?? {}), ...(player.action?.cam ?? {}) };
  rig.update(dtReal, player.pos, input, camOpts);
  screen.update(dtReal);
  hud.update(dtReal);

  toonGlobals.uTime.value = Time.real;
  arena.sky.position.copy(rig.camera.position);
  pipeline.render(scene, rig.camera, Time.real);
  input.endFrame();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}

// ── test / automation hooks ────────────────────────────────────────────────────
window.__app = {
  G, Time, THREE, player, dummies, fx, rig, input, pipeline, weapons, screen,
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
  run(sec, dt = 1 / 60) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) frame(dt); },
  tap(code) { input.press(code); frame(1 / 60); input.release(code); },
};

// cut-in portrait: render the hero's face once through the toon pipeline
function makePortrait() {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const head = player.model.head.getWorldPosition(new THREE.Vector3());
  const fwd = player.forward(new THREE.Vector3());
  const right = player.right(new THREE.Vector3());
  cam.position.copy(head).addScaledVector(fwd, 1.6).addScaledVector(right, -0.45).add(new THREE.Vector3(0, 0.05, 0));
  cam.lookAt(head.clone().add(new THREE.Vector3(0, -0.08, 0)));
  const hidden = [];
  scene.traverse((o) => { if (o.isMesh && o.visible && !isChildOf(o, player.model.root)) { o.visible = false; hidden.push(o); } });
  const prevClear = pipeline.clearColor;
  pipeline.clearColor = 0x150c2a;
  const vig = pipeline.u.uVignette.value; pipeline.u.uVignette.value = 0;
  const url = pipeline.snapshot(scene, cam, 512, 512);
  pipeline.u.uVignette.value = vig;
  pipeline.clearColor = prevClear;
  for (const o of hidden) o.visible = true;
  hud.cutin.querySelector('.portrait').style.backgroundImage = `url(${url})`;
}
function isChildOf(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }

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

// start overlay
const start = document.getElementById('start');
if (start) {
  if (TEST) start.remove();
  else start.addEventListener('click', () => { start.classList.add('hide'); audio.unlock(); canvas.requestPointerLock?.(); setTimeout(() => start.remove(), 600); });
}
