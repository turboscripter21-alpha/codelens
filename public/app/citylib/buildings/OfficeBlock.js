/**
 * OfficeBlock: wide, low-to-mid-rise block (cream walls, glass ground floor, ribbon
 * windows, thick blue roof rim, entrance canopy, rooftop AC units, water tank, planters).
 * Modelled on the reference model's big cream building with the blue roof border.
 *
 * CodeLens meaning: big functions/modules: services, controllers, large classes that
 * do a lot of the work but are not the single entry point.
 *
 * @param {object} [o]
 * @param {number} [o.width=12] @param {number} [o.depth=9]
 * @param {number} [o.floors=3] @param {number} [o.floorHeight=2.8]
 * @param {string} [o.wallColor] @param {string} [o.rimColor] @param {string} [o.glassColor]
 * @param {boolean} [o.planters=true] @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, eachFace, finish } from '../shared/geom.js';
import { createRoofRim, createACUnit, createDoor, createPlanter, createSignBoard } from '../shared/details.js';
import { rng } from '../shared/random.js';

export function createOfficeBlock(o = {}) {
  const cc = codeColors(o);
  const { width = 12, depth = 9, floors = 3, floorHeight = 2.8, wallColor = cc?.light ?? P.offWhite, rimColor = cc?.wall ?? P.blueDeep,
    glassColor = '#a9d3dc', planters = true, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  const H = floors * floorHeight;
  box(g, width + 2, 0.25, depth + 2, P.sidewalk, 0, 0, 0);
  // glass ground floor
  box(g, width - 0.4, floorHeight, depth - 0.4, glassColor, 0, 0.25, 0);
  box(g, width, H - floorHeight, depth, wallColor, 0, 0.25 + floorHeight, 0);
  box(g, width + 0.1, 0.3, depth + 0.1, wallColor, 0, 0.25 + floorHeight - 0.15, 0);
  eachFace(g, width - 0.4, depth - 0.4, (f, fw, side) => {
    for (let x = -fw / 2; x <= fw / 2 + 0.01; x += fw / Math.round(fw / 1.8)) box(f, 0.15, floorHeight, 0.12, P.white, x, 0.25, 0.04);
    if (side === 'front') {
      const d = createDoor({ width: 1.8, height: 2.2, color: P.glassLight, frame: P.white }); d.position.set(0, 0.25, 0.1); f.add(d);
      box(f, 4, 0.2, 1.6, rimColor, 0, 2.7, 0.8);
      for (const s of [-1.8, 1.8]) box(f, 0.12, 2.45, 0.12, P.metal, s, 0.25, 1.5);
    }
  });
  eachFace(g, width, depth, (f, fw, side) => {
    for (let k = 1; k < floors; k++) {
      const yy = 0.25 + k * floorHeight + 0.7;
      box(f, fw - 0.8, floorHeight * 0.45, 0.06, glassColor, 0, yy, 0.03, { cast: false });
      const n = Math.round((fw - 0.8) / 1.4);
      for (let i = 0; i <= n; i++) box(f, 0.1, floorHeight * 0.45, 0.1, wallColor, -fw / 2 + 0.4 + i * (fw - 0.8) / n, yy, 0.05);
      box(f, fw - 0.6, 0.12, 0.25, wallColor, 0, yy - 0.12, 0.12);
    }
    if (side === 'left') { const s = createSignBoard({ width: 2.6, height: 1.2, color: P.leafLight, border: P.green }); s.position.set(0, 0.25 + floorHeight + 0.3, 0); f.add(s); }
  });
  const top = 0.25 + H;
  const rim = createRoofRim({ width: width + 0.4, depth: depth + 0.4, thickness: 0.7, height: 0.7, color: rimColor }); rim.position.y = top - 0.2; g.add(rim);
  box(g, width - 0.6, 0.05, depth - 0.6, '#c9d2d6', 0, top, 0, { cast: false });
  for (let i = 0; i < 3; i++) { const ac = createACUnit({ size: r.range(0.8, 1.2) }); ac.position.set(r.range(-width / 3, width / 3), top, r.range(-depth / 4, depth / 4)); ac.rotation.y = r.pick([0, Math.PI / 2]); g.add(ac); }
  // water tank
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(g, 0.12, 1, 0.12, P.metal, width / 2 - 2 + x, top, -depth / 2 + 2 + z);
  cyl(g, 0.9, 0.9, 1.5, P.terracotta, width / 2 - 2, top + 1, -depth / 2 + 2, { segs: 10 });
  cyl(g, 0.2, 1, 0.5, P.brickDark, width / 2 - 2, top + 2.5, -depth / 2 + 2, { segs: 10 });
  if (planters) for (const x of [-width / 2 + 1.5, width / 2 - 1.5]) { const p = createPlanter({ width: 2, depth: 0.7 }); p.position.set(x, 0.25, depth / 2 + 0.6); g.add(p); }
  return finish(g, 'OfficeBlock', { size: 'large', floors, ...codeMeta(o) });
}
