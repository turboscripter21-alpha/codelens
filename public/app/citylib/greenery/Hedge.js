/**
 * Hedge: trimmed hedge row: a long chunky green box with lumpy faceted bumps on top,
 * optionally in a wooden trough (like the model's shop-front planters, but longer).
 *
 * CodeLens meaning: a soft boundary: e.g. separating a module's public API from
 * internals, or edging a district.
 *
 * @param {object} [o]
 * @param {number} [o.length=6] @param {number} [o.height=1} @param {number} [o.thickness=0.9]
 * @param {boolean} [o.trough=false] @param {string} [o.color] @param {number} [o.seed=1]
 * @returns {THREE.Group} runs along X
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, blob, finish } from '../shared/geom.js';
import { rng } from '../shared/random.js';

export function createHedge(o = {}) {
  const { length = 6, height = 1, thickness = 0.9, trough = false, color = P.leafDark, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  let y = 0;
  if (trough) { box(g, length + 0.2, 0.45, thickness + 0.2, P.woodLight, 0, 0, 0); y = 0.45; }
  box(g, length, height * 0.75, thickness, color, 0, y, 0);
  const n = Math.max(2, Math.round(length / 0.7));
  for (let i = 0; i < n; i++) blob(g, thickness * r.range(0.5, 0.62), r.pick([color, P.leaf, color]), -length / 2 + (length / n) * (i + 0.5), y + height * 0.75, r.range(-0.05, 0.05), { sy: 0.7 });
  return finish(g, 'Hedge', { length });
}
