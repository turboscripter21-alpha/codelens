/**
 * Bush: cluster of chunky low-poly blobs, slightly squashed, in mixed greens (like the
 * reference model's round shrubs). Seeded for variety.
 *
 * CodeLens meaning: filler greenery; small clusters can mark config/asset files.
 *
 * @param {object} [o]
 * @param {number} [o.size=1] overall radius @param {number} [o.blobs=5]
 * @param {string[]} [o.colors] @param {number} [o.seed=1]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { blob, finish } from '../shared/geom.js';
import { rng } from '../shared/random.js';

export function createBush(o = {}) {
  const { size = 1, blobs = 5, colors = [P.leafDark, P.leaf, P.leafDark], seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  blob(g, size * 0.7, r.pick(colors), 0, size * 0.55, 0, { sy: 0.85 });
  for (let i = 0; i < blobs - 1; i++) {
    const a = (i / (blobs - 1)) * Math.PI * 2 + r.range(0, 0.6), d = size * r.range(0.45, 0.7), rr = size * r.range(0.4, 0.58);
    blob(g, rr, r.pick(colors), Math.cos(a) * d, rr * 0.8, Math.sin(a) * d, { sy: 0.85 });
  }
  g.rotation.y = r.range(0, 6.28);
  return finish(g, 'Bush');
}
