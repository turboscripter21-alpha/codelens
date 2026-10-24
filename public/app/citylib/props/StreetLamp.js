/**
 * StreetLamp: tall grey pole with a bent arm and flat lamp head with a warm light panel
 * underneath (the reference model's street lights). Style 'park' gives the short red
 * lantern post used inside the park.
 *
 * CodeLens meaning: decoration / landmarks; can be "lit" to highlight an active path.
 *
 * @param {object} [o]
 * @param {number} [o.height=6] @param {'street'|'park'} [o.style='street']
 * @param {string} [o.color] pole colour @param {boolean} [o.lit=true] warm emissive light
 * @returns {THREE.Group} arm points toward +Z
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, boxC, cyl, finish } from '../shared/geom.js';

export function createStreetLamp(o = {}) {
  const { style = 'street', height = style === 'park' ? 2.4 : 6, color = style === 'park' ? P.redDark : P.metal, lit = true } = o;
  const g = new THREE.Group();
  if (style === 'park') {
    cyl(g, 0.22, 0.28, 0.25, color, 0, 0, 0, { segs: 6 });
    cyl(g, 0.06, 0.08, height, color, 0, 0.25, 0, { segs: 6 });
    cyl(g, 0.22, 0.14, 0.45, lit ? '#fee8a0' : P.creamLight, 0, height + 0.2, 0, { segs: 6, emissive: lit });
    cyl(g, 0.05, 0.28, 0.22, color, 0, height + 0.65, 0, { segs: 6 });
    cyl(g, 0.16, 0.16, 0.06, color, 0, height + 0.18, 0, { segs: 6 });
    return finish(g, 'StreetLamp', { style });
  }
  box(g, 0.4, 0.3, 0.4, P.metalDark, 0, 0, 0);
  cyl(g, 0.1, 0.13, height, color, 0, 0.3, 0, { segs: 6 });
  boxC(g, 0.16, 0.16, 0.7, color, 0, height + 0.1, 0.25, { rx: -0.6 });
  const armLen = 1.6;
  box(g, 0.16, 0.14, armLen, color, 0, height + 0.27, 0.45 + armLen / 2);
  box(g, 0.5, 0.18, 1.1, color, 0, height + 0.18, 0.45 + armLen + 0.25);
  box(g, 0.36, 0.04, 0.95, lit ? '#f7eaa0' : P.creamLight, 0, height + 0.15, 0.45 + armLen + 0.25, { emissive: lit });
  return finish(g, 'StreetLamp', { style });
}
