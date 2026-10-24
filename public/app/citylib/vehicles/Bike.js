/**
 * Bike: low-poly bicycle (polygonal wheels, coloured frame triangle, seat, handlebars)
 * with an optional blocky rider.
 *
 * CodeLens meaning: a function call: small, quick, everywhere, between nearby buildings.
 *
 * @param {object} [o]
 * @param {string} [o.color] frame colour @param {boolean} [o.rider=true]
 * @param {string} [o.riderColor] shirt colour
 * @returns {THREE.Group} faces +X, length ~1.8
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, boxC, blob, finish } from '../shared/geom.js';
import { mat } from '../shared/materials.js';

export function createBike(o = {}) {
  const { color = P.blueBright, rider = true, riderColor = P.orange } = o;
  const g = new THREE.Group(), R = 0.36;
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 4, 10), mat(P.tyre)); t.position.set(x, R + 0.03, 0); t.castShadow = true; g.add(t);
    boxC(g, R * 1.8, 0.04, 0.04, P.metalLight, x, R + 0.03, 0); boxC(g, 0.04, R * 1.8, 0.04, P.metalLight, x, R + 0.03, 0);
  }
  const y0 = R + 0.03;
  const bar = (x1, y1, x2, y2, c = color, t = 0.08) => { const dx = x2 - x1, dy = y2 - y1; boxC(g, Math.hypot(dx, dy), t, t, c, (x1 + x2) / 2, (y1 + y2) / 2, 0, { rz: Math.atan2(dy, dx) }); };
  bar(-0.6, y0, -0.05, y0 + 0.05); bar(-0.05, y0 + 0.05, 0.45, y0 + 0.5); bar(-0.2, y0 + 0.55, 0.45, y0 + 0.5);
  bar(-0.6, y0, -0.2, y0 + 0.55); bar(-0.05, y0 + 0.05, -0.22, y0 + 0.6); bar(0.6, y0, 0.45, y0 + 0.6);
  bar(0.45, y0 + 0.6, 0.42, y0 + 0.75, P.metalDark, 0.06);
  boxC(g, 0.06, 0.06, 0.6, P.metalDark, 0.42, y0 + 0.78, 0); // handlebar
  boxC(g, 0.3, 0.07, 0.16, P.black, -0.24, y0 + 0.65, 0); // seat
  boxC(g, 0.12, 0.12, 0.12, P.metal, -0.05, y0 + 0.05, 0.08);
  if (rider) {
    const skin = '#e2b48a';
    box(g, 0.32, 0.5, 0.42, P.blueDeep, -0.24, y0 + 0.68, 0); // hips/legs block
    boxC(g, 0.55, 0.14, 0.14, P.blueDeep, 0.0, y0 + 0.45, 0.14, { rz: -0.5 }); boxC(g, 0.55, 0.14, 0.14, P.blueDeep, 0.0, y0 + 0.45, -0.14, { rz: -0.9 });
    boxC(g, 0.36, 0.7, 0.46, riderColor, -0.1, y0 + 1.35, 0, { rz: -0.35 });
    boxC(g, 0.5, 0.12, 0.12, riderColor, 0.2, y0 + 1.25, 0.24, { rz: -0.5 }); boxC(g, 0.5, 0.12, 0.12, riderColor, 0.2, y0 + 1.25, -0.24, { rz: -0.5 });
    blob(g, 0.2, skin, 0.08, y0 + 1.85, 0, { detail: 0 });
    boxC(g, 0.42, 0.14, 0.42, P.red, 0.06, y0 + 2.0, 0); // helmet
  }
  return finish(g, 'Bike', { color });
}
