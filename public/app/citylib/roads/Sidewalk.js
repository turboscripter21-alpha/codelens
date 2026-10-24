/**
 * Sidewalk: raised pavement strip with a lighter curb on the road side and tile joints.
 * Runs along Z; curb on +X side by default.
 *
 * CodeLens meaning: the "plot" edge of a district; buildings stand on it.
 *
 * @param {object} [o]
 * @param {number} [o.length=10] @param {number} [o.width=3] @param {number} [o.height=0.25]
 * @param {'+x'|'-x'|'both'|'none'} [o.curb='+x'] @param {boolean} [o.tiles=true]
 * @param {string} [o.color] @param {string} [o.curbColor]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';

export function createSidewalk(o = {}) {
  const { length = 10, width = 3, height = 0.25, curb = '+x', tiles = true, color = P.sidewalk, curbColor = P.curb } = o;
  const g = new THREE.Group(), cw = 0.3;
  box(g, width, height, length, color, 0, 0, 0, { cast: false });
  const curbs = curb === 'both' ? [1, -1] : curb === '+x' ? [1] : curb === '-x' ? [-1] : [];
  for (const s of curbs) box(g, cw, height + 0.02, length, curbColor, s * (width / 2 - cw / 2), 0, 0, { cast: false });
  if (tiles) {
    const n = Math.round(length / 1.5);
    for (let i = 1; i < n; i++) box(g, width - (curbs.length ? cw : 0) * curbs.length, 0.01, 0.05, P.sidewalkDark, curbs.length === 1 ? -curbs[0] * cw / 2 : 0, height, -length / 2 + (length / n) * i, { cast: false });
    if (width > 2.2) box(g, 0.05, 0.01, length, P.sidewalkDark, curbs.length === 1 ? -curbs[0] * cw / 2 : 0, height, 0, { cast: false });
  }
  return finish(g, 'Sidewalk', { length, width });
}
