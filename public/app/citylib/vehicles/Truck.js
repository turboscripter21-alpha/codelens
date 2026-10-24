/**
 * Truck: heavy box truck: coloured cab with teal windscreen and side window, big cream
 * cargo box with ribbed sides and a coloured stripe, dark chassis, three chunky axles.
 *
 * CodeLens meaning: a heavy job: database queries, file uploads, data processing:
 * slow, carries a lot.
 *
 * @param {object} [o]
 * @param {string} [o.color] cab colour @param {string} [o.cargoColor] @param {string} [o.stripeColor]
 * @param {number} [o.length=8]
 * @returns {THREE.Group} faces +X
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';
import { addWheel } from './_wheels.js';

export function createTruck(o = {}) {
  const { color = P.red, cargoColor = P.creamLight, stripeColor = P.orange, length = 8 } = o;
  const g = new THREE.Group(), W = 2.4, cabL = 2.1, cargoL = length - cabL - 0.2;
  box(g, length, 0.35, W - 0.5, P.charcoal, 0, 0.45, 0); // chassis
  // cab
  const cx = length / 2 - cabL / 2;
  box(g, cabL, 2.2, W, color, cx, 0.65, 0);
  box(g, 0.06, 0.9, W - 0.3, P.glass, length / 2 + 0.01, 1.75, 0, { cast: false });
  for (const s of [-1, 1]) box(g, cabL * 0.55, 0.75, 0.06, P.glass, cx + 0.3, 1.8, s * (W / 2 + 0.01), { cast: false });
  box(g, cabL - 0.2, 0.35, W - 0.3, color, cx - 0.1, 2.85, 0); // roof fairing
  box(g, 0.12, 0.45, W * 0.6, P.charcoal, length / 2 + 0.03, 0.85, 0); // grille
  box(g, 0.2, 0.3, W + 0.1, P.metal, length / 2 + 0.05, 0.45, 0); // bumper
  for (const s of [-1, 1]) {
    box(g, 0.06, 0.22, 0.32, P.windowLit, length / 2 + 0.04, 1.2, s * (W / 2 - 0.3), { emissive: true });
    box(g, 0.1, 0.12, 0.35, P.metalDark, cx + 0.6, 1.7, s * (W / 2 + 0.2)); // mirrors
  }
  // cargo box
  const kx = -length / 2 + cargoL / 2;
  box(g, cargoL, 2.8, W + 0.1, cargoColor, kx, 0.8, 0);
  for (const s of [-1, 1]) {
    box(g, cargoL - 0.3, 0.4, 0.05, stripeColor, kx, 1.4, s * (W / 2 + 0.07), { cast: false });
    for (let x = kx - cargoL / 2 + 0.6; x < kx + cargoL / 2 - 0.3; x += 0.9) box(g, 0.08, 2.6, 0.06, '#d8cfae', x, 0.9, s * (W / 2 + 0.06), { cast: false });
  }
  box(g, 0.06, 2.6, W - 0.1, '#d8cfae', -length / 2 - 0.01, 0.9, 0, { cast: false }); box(g, 0.08, 2.6, 0.08, P.metal, -length / 2 - 0.03, 0.9, 0);
  for (const s of [-1, 1]) box(g, 0.06, 0.2, 0.3, P.red, -length / 2 - 0.03, 0.75, s * (W / 2 - 0.25), { emissive: true });
  for (const x of [cx, -length / 2 + 1.0, -length / 2 + 2.15]) for (const z of [W / 2 - 0.15, -W / 2 + 0.15]) addWheel(g, x, 0.55, z, 0.55, 0.42);
  return finish(g, 'Truck', { color });
}
