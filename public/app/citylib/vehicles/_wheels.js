/** _wheels.js: shared chunky wheel for vehicles (black tyre + grey hub). Internal helper. */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { cylC } from '../shared/geom.js';

export function addWheel(parent, x, y, z, r = 0.42, w = 0.32) {
  const s = Math.sign(z) || 1;
  cylC(parent, r, r, w, P.tyre, x, y, z, { rx: Math.PI / 2, segs: 10 });
  cylC(parent, r * 0.5, r * 0.5, 0.04, P.hub, x, y, z + s * (w / 2 + 0.01), { rx: Math.PI / 2, segs: 8 });
}
