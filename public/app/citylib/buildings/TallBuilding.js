/**
 * TallBuilding: SIZE TIER "tall": thin wrapper over Skyscraper.
 *
 * Size tiers (documentation only, nothing is written on buildings):
 *   tall   → TallBuilding   : core / entry-point modules (represents files like app.py, main.ts)
 *   medium → MediumBuilding : mid-size modules (services, feature folders, big components)
 *   small  → SmallShop      : small parts (helpers, tiny components, config)
 *
 * `importance` (0..1) scales the floor count when floors is not given, so heavier /
 * more central core files get taller towers.
 *
 * @param {object} [o] all Skyscraper options, plus:
 * @param {number} [o.importance=0.7] 0..1 → 10..22 floors
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] @param {string} [o.moduleType] @param {string} [o.language]
 * @returns {THREE.Group} userData.codecity.tier = 'tall'
 */
import { createSkyscraper } from './Skyscraper.js';

export function createTallBuilding(o = {}) {
  const importance = Math.min(1, Math.max(0, o.importance ?? 0.7));
  const g = createSkyscraper({ floors: Math.round(10 + importance * 12), ...o });
  g.userData.codecity.tier = 'tall'; g.name = 'TallBuilding';
  return g;
}
