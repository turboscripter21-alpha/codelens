/**
 * details.js: Shared façade/roof details in the reference model's style:
 * striped awnings, framed windows, roof rims, AC units, railings, plain sign boards,
 * doors and planters. Detail groups face +Z with their origin on the wall surface.
 */
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { box, boxC, cyl, blob } from './geom.js';

/** Striped, sloped awning with front valance. Origin = top-back edge on the wall. */
export function createAwning({ width = 4, depth = 1.1, colors = [P.blue, P.white], stripes, tilt = 0.5, valance = 0.32 } = {}) {
  const g = new THREE.Group(); g.name = 'Awning';
  const n = stripes ?? Math.max(4, Math.round(width / 0.45)); const sw = width / n;
  for (let i = 0; i < n; i++) {
    const c = colors[i % colors.length], x = -width / 2 + sw * (i + 0.5);
    boxC(g, sw, 0.06, depth, c, x, -Math.sin(tilt) * depth / 2, Math.cos(tilt) * depth / 2, { rx: tilt });
    box(g, sw, valance, 0.06, c, x, -Math.sin(tilt) * depth - valance, Math.cos(tilt) * depth);
  }
  // side cheeks
  for (const s of [-1, 1]) boxC(g, 0.05, 0.06, depth, colors[0], s * width / 2, -Math.sin(tilt) * depth / 2, Math.cos(tilt) * depth / 2, { rx: tilt });
  return g;
}

/** Framed window. Origin centre of window on wall. */
export function createWindow({ width = 1, height = 1.3, frame = P.cream, glass = P.glass, sill = null, mullion = true, depth = 0.08 } = {}) {
  const g = new THREE.Group();
  box(g, width, height, depth, frame, 0, -height / 2, depth / 2, { cast: false });
  box(g, width - 0.16, height - 0.16, depth, glass, 0, -height / 2 + 0.08, depth / 2 + 0.02, { cast: false });
  if (mullion) box(g, 0.06, height - 0.16, depth, frame, 0, -height / 2 + 0.08, depth / 2 + 0.04, { cast: false });
  if (sill) box(g, width + 0.2, 0.1, 0.22, sill, 0, -height / 2 - 0.1, 0.11);
  return g;
}

/** Door with frame. Origin bottom-centre on wall. */
export function createDoor({ width = 1.1, height = 2.1, color = P.wood, frame = P.creamLight, glass = null } = {}) {
  const g = new THREE.Group();
  box(g, width + 0.2, height + 0.12, 0.08, frame, 0, 0, 0.04, { cast: false });
  box(g, width, height, 0.1, color, 0, 0, 0.07, { cast: false });
  if (glass) box(g, width * 0.6, height * 0.45, 0.1, glass, 0, height * 0.42, 0.09, { cast: false });
  box(g, 0.08, 0.08, 0.1, P.metalLight, width * 0.32, height * 0.48, 0.14);
  return g;
}

/** Rim/parapet around a roof (the thick coloured border on the model's shops). */
export function createRoofRim({ width = 6, depth = 5, thickness = 0.35, height = 0.45, color = P.green } = {}) {
  const g = new THREE.Group();
  box(g, width, height, thickness, color, 0, 0, depth / 2 - thickness / 2);
  box(g, width, height, thickness, color, 0, 0, -depth / 2 + thickness / 2);
  box(g, thickness, height, depth - thickness * 2, color, width / 2 - thickness / 2, 0, 0);
  box(g, thickness, height, depth - thickness * 2, color, -width / 2 + thickness / 2, 0, 0);
  return g;
}

/** Rooftop AC unit: box with a dark fan disc on top. */
export function createACUnit({ size = 1, color = P.offWhite } = {}) {
  const g = new THREE.Group(); g.name = 'ACUnit';
  box(g, size, size * 0.55, size * 0.8, color, 0, 0, 0);
  cyl(g, size * 0.28, size * 0.28, 0.04, P.black, 0, size * 0.55, 0, { segs: 10 });
  box(g, size * 0.9, 0.05, 0.05, P.metal, 0, size * 0.25, size * 0.41);
  return g;
}

/** Simple railing loop (posts + top rail) on a w x d rectangle. */
export function createRailing({ width = 6, depth = 5, height = 0.9, color = P.charcoal, spacing = 0.6, sides = ['front', 'back', 'left', 'right'] } = {}) {
  const g = new THREE.Group(), t = 0.06;
  const run = (len, fx) => {
    const n = Math.max(2, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) fx(-len / 2 + (len / n) * i);
  };
  if (sides.includes('front')) { box(g, width, t, t, color, 0, height, depth / 2); run(width, x => box(g, t, height, t, color, x, 0, depth / 2)); }
  if (sides.includes('back')) { box(g, width, t, t, color, 0, height, -depth / 2); run(width, x => box(g, t, height, t, color, x, 0, -depth / 2)); }
  if (sides.includes('left')) { box(g, t, t, depth, color, -width / 2, height, 0); run(depth, z => box(g, t, height, t, color, -width / 2, 0, z)); }
  if (sides.includes('right')) { box(g, t, t, depth, color, width / 2, height, 0); run(depth, z => box(g, t, height, t, color, width / 2, 0, z)); }
  return g;
}

/** Plain sign board (no text): coloured panel with a contrasting border. Origin centre-bottom on wall. */
export function createSignBoard({ width = 3, height = 0.8, color = P.cream, border = P.charcoal, stripe = null } = {}) {
  const g = new THREE.Group(); g.name = 'SignBoard';
  box(g, width, height, 0.1, border, 0, 0, 0.05);
  box(g, width - 0.14, height - 0.14, 0.1, color, 0, 0.07, 0.09);
  if (stripe) box(g, width - 0.5, height * 0.18, 0.1, stripe, 0, height * 0.41, 0.12);
  return g;
}

/** Wooden planter box with chunky bushes. Origin bottom centre. */
export function createPlanter({ width = 1.6, depth = 0.6, height = 0.45, wood = P.woodLight, leaf = P.leafDark, bushes } = {}) {
  const g = new THREE.Group(); g.name = 'Planter';
  box(g, width, height, depth, wood, 0, 0, 0);
  box(g, width - 0.12, 0.05, depth - 0.12, P.soil, 0, height, 0, { cast: false });
  const n = bushes ?? Math.max(1, Math.round(width / 0.7));
  for (let i = 0; i < n; i++) blob(g, Math.min(depth * 0.55, 0.42), i % 2 ? P.leafLight : leaf, -width / 2 + (width / n) * (i + 0.5), height + 0.25, 0, { detail: 0 });
  return g;
}
