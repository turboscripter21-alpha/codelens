/**
 * Car: chunky low-poly car (boxy body, narrower cabin with teal glass, black wheels,
 * yellow headlights, red tail lights, grey bumpers). Styles: 'sedan', 'hatch', 'van',
 * 'police' (white with red/blue light bar).
 *
 * CodeLens meaning: an API call: leaves the city through the Gateway toward an
 * outside service.
 *
 * @param {object} [o]
 * @param {string} [o.color] body colour (random from CAR_COLORS if seed given)
 * @param {'sedan'|'hatch'|'van'|'police'} [o.style='sedan'] @param {number} [o.seed]
 * @returns {THREE.Group} faces +X, length ~4.2, wheels on y=0
 */
import * as THREE from 'three';
import { PALETTE as P, CAR_COLORS } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';
import { addWheel } from './_wheels.js';
import { rng } from '../shared/random.js';

export function createCar(o = {}) {
  const { style = 'sedan' } = o;
  const color = o.color ?? (style === 'police' ? P.white : o.seed != null ? rng(o.seed).pick(CAR_COLORS) : '#f43408');
  const g = new THREE.Group();
  const L = style === 'hatch' ? 3.6 : style === 'van' ? 4.4 : 4.2, W = 1.9;
  // lower body
  box(g, L, 0.75, W, color, 0, 0.35, 0);
  box(g, L + 0.1, 0.22, W + 0.06, P.charcoal, 0, 0.3, 0); // bumper/skirt band
  // cabin
  const cabL = style === 'van' ? L * 0.78 : style === 'hatch' ? L * 0.62 : L * 0.5;
  const cabX = style === 'van' ? -L * 0.08 : style === 'hatch' ? -L * 0.1 : -L * 0.04;
  const cabH = style === 'van' ? 1.05 : 0.72;
  box(g, cabL, cabH, W - 0.2, color, cabX, 1.1, 0);
  box(g, cabL + 0.02, cabH - 0.24, W - 0.16, P.glass, cabX, 1.18, 0, { cast: false }); // side glass band
  box(g, 0.08, cabH - 0.24, W - 0.36, P.glass, cabX + cabL / 2 + 0.01, 1.18, 0, { cast: false }); // windscreen
  box(g, 0.1, cabH - 0.24, 0.12, color, cabX, 1.18, W / 2 - 0.09); box(g, 0.1, cabH - 0.24, 0.12, color, cabX, 1.18, -W / 2 + 0.09); // B pillar
  // lights
  for (const s of [-1, 1]) {
    box(g, 0.06, 0.2, 0.4, P.windowLit, L / 2 + 0.02, 0.75, s * (W / 2 - 0.35), { emissive: true });
    box(g, 0.06, 0.18, 0.35, P.red, -L / 2 - 0.02, 0.75, s * (W / 2 - 0.3), { emissive: true });
  }
  box(g, 0.08, 0.16, W * 0.45, P.charcoal, L / 2 + 0.02, 0.45, 0); // grille
  if (style === 'police') {
    box(g, L + 0.01, 0.2, W + 0.01, P.blueDeep, 0, 0.75, 0);
    box(g, 0.35, 0.18, 0.6, P.red, cabX, 1.1 + cabH, 0.32, { emissive: true }); box(g, 0.35, 0.18, 0.6, P.blueBright, cabX, 1.1 + cabH, -0.32, { emissive: true });
  }
  if (style === 'van') box(g, cabL * 0.7, 0.08, W - 0.5, P.charcoal, cabX - 0.2, 1.1 + cabH, 0); // roof rack
  const wx = L / 2 - 0.85;
  for (const x of [wx, -wx]) for (const z of [W / 2 - 0.1, -W / 2 + 0.1]) addWheel(g, x, 0.42, z);
  return finish(g, 'Car', { style, color });
}
