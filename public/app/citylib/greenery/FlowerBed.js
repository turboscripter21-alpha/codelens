/**
 * FlowerBed: raised wooden planter box with soil, green stems/leaves and small
 * low-poly flowers in bright palette colours.
 *
 * CodeLens meaning: decoration near entrances; can mark UI/style files (the "pretty" parts).
 *
 * @param {object} [o]
 * @param {number} [o.width=2.4] @param {number} [o.depth=1} @param {number} [o.height=0.5]
 * @param {string} [o.boxColor] @param {string[]} [o.flowerColors] @param {number} [o.density=1] @param {number} [o.seed=1]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P, FLOWER_COLORS } from '../shared/palette.js';
import { box, cyl, blob, finish } from '../shared/geom.js';
import { rng } from '../shared/random.js';

export function createFlowerBed(o = {}) {
  const { width = 2.4, depth = 1, height = 0.5, boxColor = P.woodLight, flowerColors = FLOWER_COLORS, density = 1, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  box(g, width, height, depth, boxColor, 0, 0, 0);
  for (const sz of [-1, 1]) box(g, width + 0.1, 0.1, 0.14, P.wood, 0, height, sz * (depth / 2 - 0.02));
  for (const sx of [-1, 1]) box(g, 0.14, 0.1, depth + 0.1, P.wood, sx * (width / 2 - 0.02), height, 0);
  box(g, width - 0.16, 0.04, depth - 0.16, P.soil, 0, height, 0, { cast: false });
  const n = Math.round(width * depth * 12 * density);
  for (let i = 0; i < n; i++) {
    const x = r.range(-width / 2 + 0.18, width / 2 - 0.18), z = r.range(-depth / 2 + 0.18, depth / 2 - 0.18), sh = r.range(0.15, 0.35);
    cyl(g, 0.02, 0.02, sh, P.leafLight, x, height + 0.05, z, { segs: 3, cast: false });
    blob(g, 0.09, P.leafLight, x + 0.06, height + 0.12, z, { sy: 0.5 });
    blob(g, r.range(0.09, 0.13), r.pick(flowerColors), x, height + 0.05 + sh, z);
  }
  return finish(g, 'FlowerBed');
}
