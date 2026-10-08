// Weapon registry (order = number keys 1, 2, 3 …).
import { Katana } from './katana.js';
import { Greatsword } from './greatsword.js';
import { Pistols } from './pistols.js';
import { Shotgun } from './shotgun.js';
import { RocketLauncher } from './rocket.js';
import { FireMagic } from './fire.js';
import { LightningMagic } from './lightning.js';
import { IceMagic } from './ice.js';

export function createWeapons() {
  return [new Katana(), new Greatsword(), new Pistols(), new Shotgun(), new RocketLauncher(), new FireMagic(), new IceMagic(), new LightningMagic()];
}
