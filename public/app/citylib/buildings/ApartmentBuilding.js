/**
 * ApartmentBuilding: multi-floor brick apartment block (red brick walls, orange floor
 * bands, cream windows, front balconies, side fire-escape ladder, rooftop railing + AC).
 *
 * CodeLens meaning: a mid/large module that "houses" many related pieces: e.g. a folder
 * of components or a file with many small functions. More floors = more lines/functions.
 *
 * @param {object} [o]
 * @param {number} [o.width=8]  @param {number} [o.depth=7]
 * @param {number} [o.floors=4] @param {number} [o.floorHeight=2.6]
 * @param {string} [o.wallColor] @param {string} [o.trimColor] @param {string} [o.windowColor]
 * @param {boolean} [o.balconies=true] @param {boolean} [o.fireEscape=true] @param {boolean} [o.rooftop=true]
 * @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group} origin at ground centre, front faces +Z
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P } from '../shared/palette.js';
import { box, eachFace, finish } from '../shared/geom.js';
import { createWindow, createDoor, createACUnit, createRailing, createRoofRim } from '../shared/details.js';
import { rng } from '../shared/random.js';

export function createApartmentBuilding(o = {}) {
  const cc = codeColors(o);
  const { width = 8, depth = 7, floors = 4, floorHeight = 2.6, wallColor = cc?.wall ?? P.brick, trimColor = cc?.light ?? P.terracotta,
    windowColor = P.cream, glassColor = '#e8b7c0', balconies = true, fireEscape = true, rooftop = true, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  const H = floors * floorHeight;
  box(g, width + 0.3, 0.35, depth + 0.3, P.charcoal, 0, 0, 0); // plinth
  box(g, width, H, depth, wallColor, 0, 0.2, 0);
  // orange floor bands + cornice
  for (let f = 1; f <= floors; f++) box(g, width + 0.24, 0.22, depth + 0.24, trimColor, 0, 0.2 + f * floorHeight - 0.22, 0);
  box(g, width + 0.5, 0.3, depth + 0.5, trimColor, 0, H + 0.2, 0);
  eachFace(g, width, depth, (face, fw, side) => {
    const cols = Math.max(1, Math.floor(fw / 2.2)), step = fw / cols;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const x = -fw / 2 + step * (c + 0.5), yTop = 0.2 + f * floorHeight + floorHeight * 0.82;
      if (f === 0 && side === 'front' && c === Math.floor(cols / 2)) {
        const d = createDoor({ color: P.brickDark, frame: trimColor, glass: P.glass }); d.position.set(x, 0.35, 0); face.add(d);
        box(face, 1.8, 0.12, 0.6, trimColor, x, floorHeight * 0.95, 0.3); // door canopy
        continue;
      }
      const w = createWindow({ width: 0.9, height: floorHeight * 0.5, frame: windowColor, glass: r.chance(0.3) ? P.windowWarm : glassColor, sill: trimColor });
      w.position.set(x, yTop, 0); face.add(w);
      if (balconies && side === 'front' && f > 0 && c % 2 === 0) {
        const by = 0.2 + f * floorHeight;
        box(face, 1.6, 0.14, 0.9, P.charcoal, x, by, 0.45);
        const rl = createRailing({ width: 1.6, depth: 0.9, height: 0.75, color: P.charcoal, spacing: 0.25, sides: ['front', 'left', 'right'] });
        rl.position.set(x, by + 0.14, 0.45); face.add(rl);
      }
    }
    if (fireEscape && side === 'right') {
      const lx = fw * 0.3; // ladder rails + rungs
      for (const s of [-0.3, 0.3]) box(face, 0.07, H + 1.4, 0.07, P.metal, lx + s, 1.6, 0.25);
      for (let y = 2; y < H + 2.8; y += 0.45) box(face, 0.6, 0.05, 0.05, P.metal, lx, y, 0.25);
      for (const s of [-0.3, 0.3]) box(face, 0.07, 0.07, 0.25, P.metal, lx + s, H * 0.6, 0.12);
    }
  });
  if (rooftop) {
    const top = 0.5 + H;
    const rl = createRailing({ width: width - 0.2, depth: depth - 0.2, height: 0.8, color: P.black, spacing: 0.35 }); rl.position.y = top; g.add(rl);
    const ac = createACUnit({ size: 1.1 }); ac.position.set(-width * 0.25, top, -depth * 0.2); g.add(ac);
    const ac2 = createACUnit({ size: 0.8 }); ac2.position.set(width * 0.2, top, -depth * 0.25); ac2.rotation.y = 0.3; g.add(ac2);
    box(g, 1.4, 1.1, 1.4, wallColor, width * 0.25, top, depth * 0.15); // stair hut
    box(g, 1.6, 0.15, 1.6, trimColor, width * 0.25, top + 1.1, depth * 0.15);
  }
  return finish(g, 'ApartmentBuilding', { size: floors >= 6 ? 'large' : 'medium', floors, ...codeMeta(o) });
}
