/**
 * RoadStraight: straight asphalt tile with white solid edge lines and a dashed centre
 * line (as in the reference model). Runs along Z. Tiles snap together end to end.
 *
 * CodeLens meaning: a dependency "street" between districts (folders); vehicles drive
 * on it to visualise calls between files.
 *
 * @param {object} [o]
 * @param {number} [o.length=10] along Z @param {number} [o.width=8] along X
 * @param {number} [o.lanes=2] lanes in total (dashed lines between them)
 * @param {boolean} [o.dashed=true] @param {boolean} [o.edgeLines=true}
 * @param {string} [o.color] asphalt colour
 * @returns {THREE.Group} top surface at y = 0.05
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';

export const ROAD_TOP = 0.05;

export function createRoadStraight(o = {}) {
  const { length = 10, width = 8, lanes = 2, dashed = true, edgeLines = true, color = P.asphalt } = o;
  const g = new THREE.Group();
  box(g, width, 0.05, length, color, 0, 0, 0, { cast: false });
  if (edgeLines) for (const s of [-1, 1]) box(g, 0.18, 0.012, length, P.roadLine, s * (width / 2 - 0.4), 0.05, 0, { cast: false });
  if (dashed) for (let l = 1; l < lanes; l++) {
    const x = -width / 2 + (width / lanes) * l;
    const n = Math.max(1, Math.round(length / 2.5));
    for (let i = 0; i < n; i++) box(g, 0.16, 0.012, 1.2, P.roadLine, x, 0.05, -length / 2 + (length / n) * (i + 0.5), { cast: false });
  }
  return finish(g, 'RoadStraight', { length, width });
}
