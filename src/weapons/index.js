// Weapon registry (order = number keys 1, 2, 3 …).
import { Katana } from './katana.js';
import { Greatsword } from './greatsword.js';
import { Spear } from './spear.js';
import { DualBlades } from './dualblades.js';
import { Pistols } from './pistols.js';
import { Shotgun } from './shotgun.js';
import { Sniper } from './sniper.js';
import { Minigun } from './minigun.js';
import { RocketLauncher } from './rocket.js';
import { FireMagic } from './fire.js';
import { IceMagic } from './ice.js';
import { LightningMagic } from './lightning.js';
import { LightMagic } from './light.js';
import { DarkMagic } from './dark.js';

export function createWeapons() {
  return [
    new Katana(), new Greatsword(), new Spear(), new DualBlades(),
    new Pistols(), new Shotgun(), new Sniper(), new Minigun(), new RocketLauncher(),
    new FireMagic(), new IceMagic(), new LightningMagic(), new LightMagic(), new DarkMagic(),
  ];
}
