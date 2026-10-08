// DOM HUD: weapon bar, combo counter, damage numbers, crosshair, toasts, help.
import * as THREE from 'three';
import { G } from '../ctx.js';

const _v = new THREE.Vector3();

export class HUD {
  constructor(weapons) {
    this.root = document.getElementById('hud');
    this.weapons = weapons;
    this.bar = el('div', 'wbar', this.root);
    this.slots = weapons.map((w, i) => {
      const s = el('div', 'slot ' + w.category, this.bar);
      el('div', 'key', s).textContent = keyLabel(i);
      el('div', 'icon', s).textContent = w.icon;
      el('div', 'nm', s).textContent = w.short;
      s.addEventListener('mousedown', (e) => { e.stopPropagation(); G.player.equip(i); });
      return s;
    });
    this.wtitle = el('div', 'wtitle', this.root);
    this.wcat = el('div', 'cat', this.wtitle);
    this.wname = el('div', 'wname', this.wtitle);
    this.wdesc = el('div', 'wdesc', this.wtitle);
    this.comboEl = el('div', 'combo', this.root);
    this.comboN = el('div', 'n', this.comboEl);
    el('div', 'l', this.comboEl).textContent = 'COMBO';
    this.comboCount = 0; this.comboT = 0;
    this.scope = el('div', 'scope', this.root);
    this.cross = el('div', 'crosshair', this.root);
    this.dmgLayer = el('div', 'dmg-layer', this.root);
    this.nums = [];
    this.toastEl = el('div', 'toast', this.root);
    this.status = el('div', 'status', this.root);
    this.hint = el('div', 'hint', this.root);
    this.hint.innerHTML = '<b>H</b> 조작법 · <b>F</b> 필살기 · <b>Shift</b> 대시 · <b>C</b> 순간이동 · <b>Z</b> 슬로모션 · <b>P</b> 일시정지';
    this.ult = el('div', 'ult', this.root);
    this.ult.innerHTML = '<svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" cx="32" cy="32" r="28"/></svg><div class="k">F</div><div class="t">ULT</div>';
    this.ultRing = this.ult.querySelector('.fg');
    this.charge = el('div', 'charge', this.root);
    this.chargeFill = el('div', 'fill', this.charge);
    this.help = document.getElementById('help');
    this.cutin = document.getElementById('cutin');
    this.fps = el('div', 'fps', this.root);
    this.fpsAcc = 0; this.fpsN = 0;
    this.showFps = false;
  }

  setWeapon(i) {
    this.slots.forEach((s, j) => s.classList.toggle('on', i === j));
    const w = this.weapons[i];
    const cat = { melee: 'MELEE', gun: 'FIREARM', magic: 'ARCANA' }[w.category] ?? '';
    this.wcat.textContent = `${cat}  ·  ${String(i + 1).padStart(2, '0')}`;
    this.wname.textContent = w.name;
    this.wdesc.innerHTML = w.desc ?? '';
    this.wtitle.dataset.cat = w.category;
    this.wtitle.classList.remove('show'); void this.wtitle.offsetWidth; this.wtitle.classList.add('show');
    this.titleT = 4.0;
    this.cross.classList.toggle('on', w.category !== 'melee');
  }

  combo() {
    this.comboCount++;
    this.comboT = 2.2;
    this.comboN.textContent = this.comboCount;
    this.comboEl.classList.add('on');
    this.comboN.classList.remove('pop'); void this.comboN.offsetWidth; this.comboN.classList.add('pop');
  }

  damage(pos, n, crit) {
    if (!G.settings.damageNumbers) return;
    let d = this.nums.find((x) => !x.alive);
    if (!d) {
      if (this.nums.length > 60) return;
      d = { el: el('div', 'dn', this.dmgLayer) };
      this.nums.push(d);
    }
    // stack above live numbers near the same spot
    let near = 0;
    for (const o of this.nums) if (o.alive && o !== d && o.t < 0.5 && Math.hypot(o.base.x - pos.x, o.base.z - pos.z) < 1.0) near++;
    d.alive = true;
    d.t = 0;
    d.base = pos.clone();
    d.pos = pos.clone().add(_v.set((Math.random() - 0.5) * 0.7, 0.35 + Math.min(near, 6) * 0.28, (Math.random() - 0.5) * 0.7));
    d.vy = 1.5;
    d.el.textContent = n;
    d.el.className = 'dn' + (n >= 200 ? ' big' : '') + (crit ? ' crit' : '');
    d.big = n >= 200;
    d.el.style.display = 'block';
  }

  /** Ultimate cut-in band, animated from the game's real-time clock. */
  startCutin(title, sub, accent, dur = 1.15) {
    const el = this.cutin;
    el.style.setProperty('--accent', accent);
    el.querySelector('.title').textContent = title;
    el.querySelector('.sub').textContent = sub;
    el.classList.add('on');
    this.cut = { t: 0, dur };
    this.updateCutin(0);
  }
  updateCutin(dtReal) {
    if (!this.cut) return;
    const c = this.cut;
    c.t += dtReal;
    const k = c.t / c.dur;
    const el = this.cutin;
    if (k >= 1) { el.classList.remove('on'); this.cut = null; return; }
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    let x;
    if (k < 0.2) x = -110 + 110 * eo(k / 0.2);
    else if (k < 0.82) x = 3 * ((k - 0.2) / 0.62);
    else x = 3 + 115 * Math.pow((k - 0.82) / 0.18, 2);
    const band = el.querySelector('.band');
    band.style.transform = `skewY(-7deg) translateX(${x}%)`;
    const por = el.querySelector('.portrait');
    por.style.transform = `skewY(7deg) translateX(${(1 - eo(k / 0.25)) * -30}%) scale(${1.18 - 0.12 * eo(k / 0.8)})`;
    const ttl = el.querySelector('.title');
    ttl.style.transform = `skewY(7deg) translateX(${(1 - eo((k - 0.08) / 0.2)) * 40}%) scale(${1 + (1 - eo((k - 0.08) / 0.2)) * 0.4})`;
    ttl.style.opacity = k < 0.08 ? 0 : 1;
    el.style.setProperty('--fade', k < 0.12 ? k / 0.12 : k > 0.85 ? (1 - k) / 0.15 : 1);
  }

  toast(text, dur = 1.2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('on'); void this.toastEl.offsetWidth; this.toastEl.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.remove('on'), dur * 1000);
  }

  setCharge(k, lvl) {
    if (k <= 0) { this.charge.classList.remove('on'); return; }
    this.charge.classList.add('on');
    this.chargeFill.style.width = `${Math.min(1, k) * 100}%`;
    this.charge.dataset.lvl = lvl;
  }

  update(dtReal) {
    this.updateCutin(dtReal);
    if (this.comboT > 0) {
      this.comboT -= dtReal;
      if (this.comboT <= 0) { this.comboCount = 0; this.comboEl.classList.remove('on'); }
    }
    const cam = G.rig.camera;
    const W = window.innerWidth, H = window.innerHeight;
    for (const d of this.nums) {
      if (!d.alive) continue;
      d.t += dtReal;
      d.pos.y += d.vy * dtReal; d.vy *= Math.exp(-dtReal * 3);
      _v.copy(d.pos).project(cam);
      if (d.t > 0.9 || _v.z > 1) { d.alive = false; d.el.style.display = 'none'; continue; }
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      const k = d.t < 0.06 ? 1.35 - d.t / 0.06 * 0.35 : 1;
      const a = d.t > 0.6 ? 1 - (d.t - 0.6) / 0.3 : 1;
      d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${k})`;
      d.el.style.opacity = a;
    }
    const cd = G.ultCooldown ?? 0;
    this.ult.classList.toggle('ready', cd <= 0);
    this.ultRing.style.strokeDashoffset = `${176 * (cd / 4)}`;
    if (this.titleT > 0) { this.titleT -= dtReal; if (this.titleT <= 0) this.wtitle.classList.remove('show'); }
    const parts = [];
    if (G.time_userSlow) parts.push('◐ 슬로모션 (Z)');
    if (G.paused) parts.push('❚❚ 일시정지 · 포토모드 (P)');
    this.status.textContent = parts.join('   ');
    if (this.showFps) {
      this.fpsAcc += dtReal; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`; this.fpsAcc = 0; this.fpsN = 0; }
    } else this.fps.textContent = '';
  }
}

export function keyLabel(i) { return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '[', ']', '\\'][i] ?? ''; }

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
