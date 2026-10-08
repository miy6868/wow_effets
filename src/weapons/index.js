// Weapon registry (order = number keys 1, 2, 3 …).
import { Katana } from './katana.js';
import { Greatsword } from './greatsword.js';
import { Pistols } from './pistols.js';

export function createWeapons() {
  return [new Katana(), new Greatsword(), new Pistols()];
}
