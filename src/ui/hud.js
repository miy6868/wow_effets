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
    this.wname = el('div', 'wname', this.root);
    this.wdesc = el('div', 'wdesc', this.root);
    this.comboEl = el('div', 'combo', this.root);
    this.comboN = el('div', 'n', this.comboEl);
    el('div', 'l', this.comboEl).textContent = 'HITS';
    this.comboCount = 0; this.comboT = 0;
    this.cross = el('div', 'crosshair', this.root);
    this.dmgLayer = el('div', 'dmg-layer', this.root);
    this.nums = [];
    this.toastEl = el('div', 'toast', this.root);
    this.status = el('div', 'status', this.root);
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
    this.wname.textContent = w.name;
    this.wdesc.innerHTML = w.desc ?? '';
    this.wname.classList.remove('pop'); void this.wname.offsetWidth; this.wname.classList.add('pop');
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
    d.alive = true;
    d.t = 0;
    d.pos = pos.clone().add(_v.set((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
    d.vy = 1.5;
    d.el.textContent = n;
    d.el.className = 'dn' + (n >= 200 ? ' big' : '') + (crit ? ' crit' : '');
    d.el.style.display = 'block';
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
      const k = d.t < 0.08 ? 1.6 - d.t / 0.08 * 0.6 : 1;
      const a = d.t > 0.6 ? 1 - (d.t - 0.6) / 0.3 : 1;
      d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${k})`;
      d.el.style.opacity = a;
    }
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
