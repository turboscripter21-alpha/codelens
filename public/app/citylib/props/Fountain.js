/**
 * Fountain: tiered octagonal stone fountain with blue water basins and a centre spout
 * (low-poly, like the reference park fountain).
 *
 * CodeLens meaning: a central plaza / shared state store (e.g. a global store or
 * context provider) that many paths pass around.
 *
 * @param {object} [o]
 * @param {number} [o.radius=2.4] @param {number} [o.tiers=2] @param {string} [o.stoneColor] @param {string} [o.waterColor]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { cyl, blob, finish } from '../shared/geom.js';

export function createFountain(o = {}) {
  const { radius = 2.4, tiers = 2, stoneColor = P.stoneLight, waterColor = P.water } = o;
  const g = new THREE.Group();
  cyl(g, radius + 0.5, radius + 0.6, 0.12, P.stone, 0, 0, 0, { segs: 8 });
  cyl(g, radius, radius + 0.1, 0.6, stoneColor, 0, 0.12, 0, { segs: 8 });
  cyl(g, radius - 0.25, radius - 0.25, 0.04, waterColor, 0, 0.62, 0, { segs: 8, transparent: 0.85 });
  let y = 0.66, r = radius * 0.5;
  for (let t = 0; t < tiers; t++) {
    cyl(g, r * 0.25, r * 0.35, 0.9, stoneColor, 0, y - 0.1, 0, { segs: 8 });
    y += 0.8;
    cyl(g, r, r * 0.55, 0.3, stoneColor, 0, y, 0, { segs: 8 });
    cyl(g, r - 0.12, r - 0.12, 0.03, waterColor, 0, y + 0.3, 0, { segs: 8 });
    // water spill
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; cyl(g, 0.05, 0.12, 0.6, '#5ec8e6', Math.cos(a) * (r - 0.05), y - 0.55, Math.sin(a) * (r - 0.05), { segs: 5, transparent: 0.7 }); }
    y += 0.3; r *= 0.55;
  }
  cyl(g, 0.08, 0.12, 0.6, stoneColor, 0, y, 0, { segs: 6 });
  blob(g, 0.25, '#5ec8e6', 0, y + 0.75, 0, { transparent: 0.8 });
  return finish(g, 'Fountain');
}
