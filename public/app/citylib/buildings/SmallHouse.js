/**
 * SmallHouse: tiny gable-roof house (wall + roof colours, door, two windows, chimney,
 * front step, optional little fence).
 *
 * CodeLens meaning: tiny utility files: constants, config, a one-function helper.
 *
 * @param {object} [o]
 * @param {number} [o.width=4] @param {number} [o.depth=4] @param {number} [o.height=2.6]
 * @param {string} [o.wallColor] @param {string} [o.roofColor] @param {boolean} [o.fence=true]
 * @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P } from '../shared/palette.js';
import { box, prism, finish } from '../shared/geom.js';
import { createDoor, createWindow } from '../shared/details.js';
import { rng } from '../shared/random.js';

export function createSmallHouse(o = {}) {
  const r = rng(o.seed ?? 1);
  const cc = codeColors(o);
  const natWall = r.pick([P.creamLight, P.apricot, '#9fd0e0', P.limeSoft]), natRoof = r.pick([P.brick, P.blueDeep, P.terracotta, P.green]);
  const { width = 4, depth = 4, height = 2.6, wallColor = cc?.wall ?? natWall, roofColor = cc?.dark ?? natRoof, fence = true } = o;
  const g = new THREE.Group();
  box(g, width + 2, 0.12, depth + 2.4, P.grass, 0, 0, 0.2);
  box(g, width, height, depth, wallColor, 0, 0.12, 0);
  prism(g, width + 0.5, 1.7, depth + 0.6, roofColor, 0, 0.12 + height, 0);
  box(g, width + 0.5, 0.12, depth + 0.6, roofColor, 0, 0.12 + height - 0.05, 0);
  box(g, 0.55, 1.3, 0.55, P.brickDark, width * 0.25, 0.12 + height + 0.5, -depth * 0.15);
  box(g, 0.7, 0.12, 0.7, P.charcoal, width * 0.25, 0.12 + height + 1.8, -depth * 0.15);
  const d = createDoor({ width: 0.9, height: 1.8, color: roofColor, frame: P.white }); d.position.set(-width * 0.18, 0.12, depth / 2); g.add(d);
  box(g, 1.3, 0.15, 0.5, P.stoneLight, -width * 0.18, 0.12, depth / 2 + 0.25);
  const w = createWindow({ width: 0.9, height: 0.9, frame: P.white, glass: P.glass, sill: P.white }); w.position.set(width * 0.22, 2.05, depth / 2); g.add(w);
  for (const s of [-1, 1]) { const w2 = createWindow({ width: 0.8, height: 0.8, frame: P.white, glass: P.glass }); w2.position.set(s * width / 2, 2, 0); w2.rotation.y = s * Math.PI / 2; g.add(w2); }
  if (fence) {
    const fz = depth / 2 + 1.25;
    for (let x = -width / 2 - 0.9; x <= width / 2 + 0.91; x += 0.4) if (Math.abs(x + width * 0.18) > 0.6) box(g, 0.1, 0.6, 0.06, P.white, x, 0.12, fz);
    const xL = -width / 2 - 0.9, xR = width / 2 + 0.9, gL = -width * 0.18 - 0.6, gR = -width * 0.18 + 0.6;
    box(g, gL - xL, 0.07, 0.05, P.white, (xL + gL) / 2, 0.5, fz);
    box(g, xR - gR, 0.07, 0.05, P.white, (xR + gR) / 2, 0.5, fz);
  }
  return finish(g, 'SmallHouse', { size: 'tiny', ...codeMeta(o) });
}
