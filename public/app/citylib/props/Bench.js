/**
 * Bench: park bench with brown wooden slats (seat + back) on dark cast-iron ends.
 *
 * CodeLens meaning: decoration; a resting spot for the tour-guide camera.
 *
 * @param {object} [o]
 * @param {number} [o.length=2.2] @param {string} [o.woodColor] @param {string} [o.metalColor]
 * @param {boolean} [o.back=true]
 * @returns {THREE.Group} seat faces +Z
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, boxC, finish } from '../shared/geom.js';

export function createBench(o = {}) {
  const { length = 2.2, woodColor = P.wood, metalColor = P.charcoal, back = true } = o;
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const x = s * (length / 2 - 0.15);
    box(g, 0.08, 0.45, 0.08, metalColor, x, 0, 0.22); box(g, 0.08, 0.45, 0.08, metalColor, x, 0, -0.22);
    box(g, 0.1, 0.06, 0.6, metalColor, x, 0.42, 0);
    if (back) boxC(g, 0.08, 0.7, 0.08, metalColor, x, 0.75, -0.28, { rx: -0.2 });
    box(g, 0.1, 0.06, 0.5, metalColor, x, 0.62, 0.02); // armrest
  }
  for (let i = 0; i < 4; i++) box(g, length, 0.06, 0.12, woodColor, 0, 0.48, -0.22 + i * 0.15);
  if (back) for (let i = 0; i < 3; i++) boxC(g, length, 0.12, 0.05, woodColor, 0, 0.72 + i * 0.17, -0.31 - i * 0.035, { rx: -0.2 });
  return finish(g, 'Bench');
}
