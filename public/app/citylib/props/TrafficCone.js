/**
 * TrafficCone: low-poly red/orange cone with white reflective bands on a square base.
 *
 * CodeLens meaning: TODO / work-in-progress / deprecated code markers.
 *
 * @param {object} [o]
 * @param {number} [o.height=0.8] @param {string} [o.color] @param {string} [o.bandColor]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, finish } from '../shared/geom.js';

export function createTrafficCone(o = {}) {
  const { height = 0.8, color = P.red, bandColor = P.white } = o;
  const g = new THREE.Group(), h = height, rb = h * 0.3;
  box(g, rb * 2.4, h * 0.07, rb * 2.4, color, 0, 0, 0);
  const segs = [[0, 0.25, color], [0.25, 0.42, bandColor], [0.42, 0.62, color], [0.62, 0.78, bandColor], [0.78, 1, color]];
  for (const [a, b, c] of segs) cyl(g, rb * (1 - b) + 0.02, rb * (1 - a) + 0.02, h * (b - a) * 0.93, c, 0, h * 0.07 + h * a * 0.93, 0, { segs: 8 });
  return finish(g, 'TrafficCone');
}
