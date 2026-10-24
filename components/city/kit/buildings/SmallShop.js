/**
 * SmallShop — SIZE TIER "small": wrapper over Shop or SmallHouse. Represents small
 * parts: helpers, tiny components, constants/config. See TallBuilding.js for tiers.
 *
 * @param {object} [o] options passed through to the chosen building, plus:
 * @param {'auto'|'shop'|'house'} [o.variant='auto'] 'auto' picks by seed (shops more often)
 * @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] @param {string} [o.moduleType] @param {string} [o.language]
 * @returns {THREE.Group} userData.codecity.tier = 'small'
 */
import { createShop } from './Shop.js';
import { createSmallHouse } from './SmallHouse.js';
import { rng } from '../shared/random.js';

export function createSmallShop(o = {}) {
  const seed = o.seed ?? 1, r = rng(seed);
  const variant = o.variant && o.variant !== 'auto' ? o.variant : (r() < 0.7 ? 'shop' : 'house');
  const g = variant === 'house' ? createSmallHouse({ ...o, seed }) : createShop({ scheme: r.int(0, 3), width: 5, depth: 4.5, height: 3.4, ...o, seed });
  g.userData.codecity.tier = 'small'; g.userData.codecity.variant = variant; g.name = 'SmallShop';
  return g;
}
