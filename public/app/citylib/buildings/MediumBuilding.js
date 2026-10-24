/**
 * MediumBuilding: SIZE TIER "medium": wrapper that picks an ApartmentBuilding or an
 * OfficeBlock variant. Represents mid-size modules: services, feature folders, large
 * components. See TallBuilding.js for the full tier list.
 *
 * @param {object} [o] options passed through to the chosen building, plus:
 * @param {'auto'|'apartment'|'office'} [o.variant='auto'] 'auto' picks by seed
 * @param {number} [o.size=0.5] 0..1 → floor count when floors is not given
 * @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] @param {string} [o.moduleType] @param {string} [o.language]
 * @returns {THREE.Group} userData.codecity.tier = 'medium'
 */
import { createApartmentBuilding } from './ApartmentBuilding.js';
import { createOfficeBlock } from './OfficeBlock.js';
import { rng } from '../shared/random.js';

export function createMediumBuilding(o = {}) {
  const seed = o.seed ?? 1, size = Math.min(1, Math.max(0, o.size ?? 0.5));
  const variant = o.variant && o.variant !== 'auto' ? o.variant : (rng(seed)() < 0.5 ? 'apartment' : 'office');
  const g = variant === 'office'
    ? createOfficeBlock({ floors: 2 + Math.round(size * 3), ...o, seed })
    : createApartmentBuilding({ floors: 3 + Math.round(size * 3), ...o, seed });
  g.userData.codecity.tier = 'medium'; g.userData.codecity.variant = variant; g.name = 'MediumBuilding';
  return g;
}
