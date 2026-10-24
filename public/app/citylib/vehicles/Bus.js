/**
 * Bus: yellow school-bus style coach: long boxy body with a short bonnet, teal window
 * row, black side stripes and front grille slats, roof hatches, chunky wheels (the
 * reference model's yellow bus).
 *
 * CodeLens meaning: an event / message: stops at several buildings at once (many
 * listeners react to one event).
 *
 * @param {object} [o]
 * @param {string} [o.color] @param {number} [o.length=9] @param {number} [o.windows=6}
 * @returns {THREE.Group} faces +X
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';
import { addWheel } from './_wheels.js';

export function createBus(o = {}) {
  const { color = '#f0be4c', length = 9, windows = 6 } = o;
  const g = new THREE.Group(), W = 2.5, H = 2.6, nose = 1.4, bodyL = length - nose;
  const bx = -nose / 2; // body centre x
  box(g, bodyL, H, W, color, bx, 0.45, 0);
  box(g, nose, 1.1, W - 0.2, color, length / 2 - nose / 2, 0.45, 0); // bonnet
  box(g, length + 0.1, 0.25, W + 0.04, P.charcoal, 0, 0.35, 0);
  // windows row
  const wy = 0.45 + H * 0.52, wh = H * 0.32, step = (bodyL - 1.2) / windows;
  for (const s of [-1, 1]) {
    for (let i = 0; i < windows; i++) box(g, step - 0.18, wh, 0.06, P.glass, bx - bodyL / 2 + 0.6 + step * (i + 0.5), wy, s * (W / 2 + 0.01), { cast: false });
    for (const y of [0.45 + H * 0.33, 0.45 + H * 0.22]) box(g, bodyL - 0.3, 0.1, 0.05, P.black, bx, y, s * (W / 2 + 0.02), { cast: false });
  }
  box(g, 0.06, wh + 0.2, W - 0.4, P.glass, bx + bodyL / 2 + 0.01, wy - 0.1, 0, { cast: false }); // windscreen
  box(g, 0.06, wh, W - 0.4, P.glass, bx - bodyL / 2 - 0.01, wy, 0, { cast: false }); // rear window
  for (let i = 0; i < 3; i++) box(g, 0.06, 0.08, W - 0.7, P.black, length / 2 + 0.01, 0.75 + i * 0.22, 0, { cast: false }); // grille
  for (const s of [-1, 1]) {
    box(g, 0.06, 0.22, 0.32, P.creamLight, length / 2 + 0.02, 1.25, s * (W / 2 - 0.35), { emissive: true });
    box(g, 0.06, 0.22, 0.28, P.red, -length / 2 - 0.02, 1.05, s * (W / 2 - 0.3), { emissive: true });
  }
  for (const x of [bx - 1.5, bx + 1.5]) box(g, 0.9, 0.12, 0.9, P.charcoal, x, 0.45 + H, 0); // roof hatches
  box(g, 0.2, 0.2, W + 0.1, P.red, bx + bodyL / 2 - 0.15, 0.45 + H - 0.1, 0, { emissive: true }); // warning lamp bar
  for (const x of [length / 2 - nose - 0.4, -length / 2 + 1.4]) for (const z of [W / 2 - 0.1, -W / 2 + 0.1]) addWheel(g, x, 0.52, z, 0.52, 0.38);
  return finish(g, 'Bus', { color });
}
