/**
 * Park: small composed park: raised lime lawn with curb, crossing dirt footpaths, a
 * fountain plaza in the middle, seeded lollipop/cone trees, bushes, flower beds,
 * benches along the paths and red park lanterns. Built only from library pieces.
 *
 * CodeLens meaning: a calm "documentation / tests / assets" district, or a breathing
 * space in large cities so the map stays readable.
 *
 * @param {object} [o]
 * @param {number} [o.width=20] @param {number} [o.depth=16]
 * @param {number} [o.trees] number of trees (default scales with area)
 * @param {boolean} [o.fountain=true] @param {number} [o.seed=1]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, finish } from '../shared/geom.js';
import { rng } from '../shared/random.js';
import { createGrassPatch } from './GrassPatch.js';
import { createTree } from './Tree.js';
import { createBush } from './Bush.js';
import { createFlowerBed } from './FlowerBed.js';
import { createBench } from '../props/Bench.js';
import { createStreetLamp } from '../props/StreetLamp.js';
import { createFountain } from '../props/Fountain.js';

export function createPark(o = {}) {
  const { width = 20, depth = 16, fountain = true, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  const trees = o.trees ?? Math.round((width * depth) / 22);
  g.add(createGrassPatch({ width, depth, tufts: Math.round(width * depth / 12), seed }));
  const top = 0.3, pw = 1.6, plaza = 3.6;
  box(g, width - 0.6, 0.03, pw, P.dirtPath, 0, top, 0, { cast: false });
  box(g, pw, 0.03, depth - 0.6, P.dirtPath, 0, top, 0, { cast: false });
  cyl(g, plaza, plaza, 0.03, P.dirtPath, 0, top, 0, { segs: 16, cast: false });
  if (fountain) { const f = createFountain({ radius: 1.6 }); f.position.y = top; f.scale.setScalar(0.9); g.add(f); }
  // keep-out test: paths and plaza
  const free = (x, z, m) => Math.abs(x) > pw / 2 + m && Math.abs(z) > pw / 2 + m && Math.hypot(x, z) > plaza + m;
  const placed = [];
  const spot = (m) => {
    for (let t = 0; t < 60; t++) {
      const x = r.range(-width / 2 + 1.4, width / 2 - 1.4), z = r.range(-depth / 2 + 1.4, depth / 2 - 1.4);
      if (free(x, z, m) && placed.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + m)) { placed.push([x, z, m]); return [x, z]; }
    }
    return null;
  };
  for (let i = 0; i < trees; i++) {
    const s = spot(1.3); if (!s) break;
    const t = createTree({ variant: r.chance(0.07) ? 'cone' : r.chance(0.25) ? 'tall' : 'round', seed: seed * 100 + i });
    t.position.set(s[0], top, s[1]); g.add(t);
  }
  for (let i = 0; i < Math.round(trees * 0.7); i++) {
    const s = spot(0.7); if (!s) break;
    const b = createBush({ size: r.range(0.6, 0.9), seed: seed * 200 + i }); b.position.set(s[0], top, s[1]); g.add(b);
  }
  // benches facing the paths, lanterns at path corners
  const bx = Math.min(width / 4 + 1, width / 2 - 2);
  for (const [x, z, ry] of [[bx, pw / 2 + 0.5, Math.PI], [-bx, -pw / 2 - 0.5, 0], [pw / 2 + 0.5, -depth / 4 - 1, -Math.PI / 2], [-pw / 2 - 0.5, depth / 4 + 1, Math.PI / 2]]) {
    const b = createBench({ length: 1.8 }); b.position.set(x, top, z); b.rotation.y = ry; g.add(b);
  }
  for (const [x, z] of [[pw / 2 + 0.4, pw / 2 + 0.4 + plaza], [-pw / 2 - 0.4, -pw / 2 - 0.4 - plaza], [plaza + 1.5, -pw / 2 - 0.4], [-plaza - 1.5, pw / 2 + 0.4]]) {
    const l = createStreetLamp({ style: 'park' }); l.position.set(x, top, z); g.add(l);
  }
  for (const [x, z] of [[width / 2 - 2, pw / 2 + 1], [-width / 2 + 2, -pw / 2 - 1]]) {
    const fb = createFlowerBed({ width: 2, depth: 0.8, seed: seed + x }); fb.position.set(x, top, z); g.add(fb);
  }
  return finish(g, 'Park', { width, depth });
}
