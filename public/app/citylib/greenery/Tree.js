/**
 * Tree: low-poly "lollipop" tree in the reference park style: dark brown trunk (with an
 * optional fork) and a crown of chunky faceted green blobs. Variants:
 *  - 'round' : classic wide blob cluster
 *  - 'cone'  : tall pointy evergreen spike
 *  - 'tall'  : taller trunk, stacked crown
 * Seeded so every tree in a row looks a little different.
 *
 * CodeLens meaning: decoration / greenery between districts; can mark test or docs
 * folders ("green" = healthy, non-runtime code).
 *
 * @param {object} [o]
 * @param {'round'|'cone'|'tall'} [o.variant='round'] @param {number} [o.height] overall height
 * @param {string} [o.leafColor] @param {string} [o.trunkColor] @param {number} [o.seed=1]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { cyl, blob, boxC, finish } from '../shared/geom.js';
import { mat } from '../shared/materials.js';
import { rng } from '../shared/random.js';

export function createTree(o = {}) {
  const { variant = 'round', seed = 1, leafColor = P.leaf, trunkColor = P.trunk } = o;
  const r = rng(seed), g = new THREE.Group();
  const shade = () => r.pick([leafColor, leafColor, P.leafDark, leafColor]);
  if (variant === 'cone') {
    const H = o.height ?? r.range(4.5, 6);
    cyl(g, 0.14, 0.2, H * 0.25, trunkColor, 0, 0, 0, { segs: 5 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(H * 0.2, H * 0.85, 5), mat(shade()));
    cone.position.y = H * 0.15 + H * 0.425; cone.rotation.y = r.range(0, 6); cone.castShadow = true; g.add(cone);
    return finish(g, 'Tree', { variant });
  }
  const H = o.height ?? (variant === 'tall' ? r.range(5.5, 7) : r.range(3.6, 4.6));
  const trunkH = H * (variant === 'tall' ? 0.55 : 0.45);
  cyl(g, 0.16, 0.26, trunkH, trunkColor, 0, 0, 0, { segs: 6 });
  // a forked branch
  boxC(g, 0.14, trunkH * 0.5, 0.14, trunkColor, 0.28, trunkH * 0.85, 0.05, { rz: -0.6 });
  const cy = trunkH + H * 0.12, R = H * (variant === 'tall' ? 0.2 : 0.26);
  blob(g, R, shade(), 0, cy + R * 0.3, 0, { detail: 0 });
  const n = variant === 'tall' ? 5 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(0, 0.8), d = R * r.range(0.65, 0.95);
    blob(g, R * r.range(0.6, 0.8), shade(), Math.cos(a) * d, cy + r.range(-0.3, 0.5) * R, Math.sin(a) * d);
  }
  blob(g, R * 0.75, shade(), r.range(-0.2, 0.2), cy + R * (variant === 'tall' ? 1.4 : 1.05), r.range(-0.2, 0.2));
  if (variant === 'tall') blob(g, R * 0.55, shade(), 0, cy + R * 2, 0);
  g.rotation.y = r.range(0, Math.PI * 2);
  return finish(g, 'Tree', { variant });
}
