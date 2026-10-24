/**
 * GrassPatch: flat or raised lime-green grass tile with optional curb edge and a few
 * darker tufts (the reference park's bright yellow-green lawn).
 *
 * CodeLens meaning: empty plot / green space between districts (padding in layouts).
 *
 * @param {object} [o]
 * @param {number} [o.width=8] @param {number} [o.depth=8] @param {boolean} [o.raised=true}
 * @param {boolean} [o.curb=true] @param {number} [o.tufts=10] @param {string} [o.color] @param {number} [o.seed=1]
 * @returns {THREE.Group} top at y = raised ? 0.3 : 0.06
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, finish } from '../shared/geom.js';
import { rng } from '../shared/random.js';

export function createGrassPatch(o = {}) {
  const { width = 8, depth = 8, raised = true, curb = true, tufts = 10, color = P.grass, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group(), h = raised ? 0.3 : 0.06;
  if (curb) box(g, width, h - 0.02, depth, P.curb, 0, 0, 0, { cast: false });
  const c = curb ? 0.3 : 0;
  box(g, width - c * 2, h, depth - c * 2, color, 0, 0, 0, { cast: false });
  if (raised) box(g, width - c * 2 + 0.02, 0.18, depth - c * 2 + 0.02, P.soil, 0, 0, 0, { cast: false });
  for (let i = 0; i < tufts; i++) {
    const x = r.range(-width / 2 + 0.8, width / 2 - 0.8), z = r.range(-depth / 2 + 0.8, depth / 2 - 0.8);
    for (let k = 0; k < 3; k++) cyl(g, 0, 0.07, r.range(0.25, 0.4), r.pick([P.leafLime, P.grassDark]), x + r.range(-0.12, 0.12), h, z + r.range(-0.12, 0.12), { segs: 3, cast: false });
  }
  return finish(g, 'GrassPatch', { width, depth });
}
