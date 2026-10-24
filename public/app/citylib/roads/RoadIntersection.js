/**
 * RoadIntersection: square 4-way junction with zebra crosswalks on each side and stop
 * lines (the reference model's crossings). Matches RoadStraight width.
 *
 * CodeLens meaning: a hub where many dependency paths meet (e.g. a shared util or an
 * index/barrel file that re-exports many modules).
 *
 * @param {object} [o]
 * @param {number} [o.size=8] square size (equal to road width)
 * @param {number} [o.crosswalkDepth=2.2] length of the zebra band the cars cross
 * @param {boolean} [o.crosswalks=true] @param {string[]} [o.sides=['n','s','e','w']]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';

export function createRoadIntersection(o = {}) {
  const { size = 8, crosswalkDepth = 2.2, crosswalks = true, sides = ['n', 's', 'e', 'w'] } = o;
  const g = new THREE.Group(), apron = crosswalks ? crosswalkDepth + 0.8 : 0, S = size + apron * 2;
  box(g, S, 0.05, S, P.asphalt, 0, 0, 0, { cast: false });
  const zebra = (rotY) => {
    const z = new THREE.Group(); z.rotation.y = rotY; g.add(z);
    const n = Math.floor((size - 0.8) / 0.75);
    for (let i = 0; i < n; i++) box(z, 0.45, 0.012, crosswalkDepth, P.roadLine, -size / 2 + 0.6 + i * 0.75 + 0.2, 0.05, size / 2 + 0.3 + crosswalkDepth / 2, { cast: false });
    box(z, size / 2 - 0.3, 0.012, 0.3, P.roadLine, size / 4, 0.05, size / 2 + crosswalkDepth + 0.6, { cast: false }); // stop line (one lane)
    // continue edge lines through apron
    for (const s of [-1, 1]) box(z, 0.18, 0.012, apron, P.roadLine, s * (size / 2 - 0.4), 0.05, size / 2 + apron / 2, { cast: false });
  };
  if (crosswalks) { const rots = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }; sides.forEach(s => zebra(rots[s])); }
  return finish(g, 'RoadIntersection', { size: S });
}
