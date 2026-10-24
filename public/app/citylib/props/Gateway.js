/**
 * Gateway: city-edge arch / toll gate: two chunky pillars, a lintel beam with a plain
 * coloured panel (no text), pillar-top lamps, striped boom barrier and a small booth.
 *
 * CodeLens meaning: the exit to the outside world: Car vehicles (API calls) pass
 * through here toward external services (payment, AI, auth providers).
 *
 * @param {object} [o]
 * @param {number} [o.width=9] clear opening @param {number} [o.height=5.5]
 * @param {string} [o.pillarColor] @param {string} [o.beamColor] @param {string} [o.panelColor]
 * @param {boolean} [o.barrier=true] @param {boolean} [o.open=false] raise the barrier
 * @returns {THREE.Group} road passes along Z through the opening
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, boxC, cyl, finish } from '../shared/geom.js';
import { createSignBoard } from '../shared/details.js';

export function createGateway(o = {}) {
  const { width = 9, height = 5.5, pillarColor = P.cream, beamColor = P.blueDeep, panelColor = P.yellow, barrier = true, open = false } = o;
  const g = new THREE.Group(), pw = 1.2;
  for (const s of [-1, 1]) {
    const x = s * (width / 2 + pw / 2);
    box(g, pw + 0.4, 0.5, pw + 0.4, P.metalDark, x, 0, 0);
    box(g, pw, height, pw, pillarColor, x, 0.5, 0);
    for (let k = 1; k <= 3; k++) box(g, pw + 0.12, 0.18, pw + 0.12, beamColor, x, 0.5 + (height / 4) * k, 0);
    box(g, pw + 0.3, 0.35, pw + 0.3, beamColor, x, height + 1.9, 0);
    cyl(g, 0.25, 0.3, 0.5, P.windowLit, x, height + 2.25, 0, { segs: 6, emissive: true });
  }
  box(g, width + pw * 2 + 0.4, 1.4, 1, beamColor, 0, height + 0.5, 0);
  box(g, width + pw * 2 + 0.6, 0.2, 1.2, P.white, 0, height + 1.9, 0);
  for (const z of [0.5, -0.5]) {
    const s = createSignBoard({ width: width * 0.6, height: 0.9, color: panelColor, border: P.white });
    s.position.set(0, height + 0.75, z); if (z < 0) s.rotation.y = Math.PI; g.add(s);
  }
  // booth
  const bx = width / 2 + pw + 1.3;
  box(g, 1.6, 2.4, 1.6, P.white, bx, 0, 1.6);
  box(g, 1.62, 0.8, 1.62, P.glass, bx, 1.2, 1.6, { cast: false });
  box(g, 2, 0.2, 2, beamColor, bx, 2.4, 1.6);
  if (barrier) {
    const pivot = new THREE.Group(); pivot.position.set(width / 2 - 0.25, 1, 1.1); g.add(pivot);
    box(g, 0.3, 1.1, 0.3, P.charcoal, width / 2 - 0.25, 0, 1.1);
    const arm = new THREE.Group(); arm.rotation.z = open ? -1.3 : 0; pivot.add(arm);
    const L = width - 0.6, n = 8;
    for (let i = 0; i < n; i++) boxC(arm, L / n, 0.14, 0.14, i % 2 ? P.white : P.red, -(L / n) * (i + 0.5), 0.05, 0);
  }
  return finish(g, 'Gateway');
}
