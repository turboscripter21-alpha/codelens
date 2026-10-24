/**
 * Skyscraper — tall, tiered glass tower (cream body, teal glass floor bands, blue rims,
 * stepped setbacks, rooftop antenna with a red beacon).
 *
 * CodeLens meaning: represents the core / entry-point files that everything else depends on
 * (core files like app.py, main.ts, server.js). Height scales with how central/heavy the file is.
 * No text is drawn on the building; identity comes from your own UI.
 *
 * @param {object} [o]
 * @param {number} [o.width=7] @param {number} [o.depth=7]
 * @param {number} [o.floors=14] @param {number} [o.floorHeight=2.2]
 * @param {number} [o.tiers=3] number of stepped sections
 * @param {string} [o.bodyColor] @param {string} [o.glassColor] @param {string} [o.accentColor]
 * @param {boolean} [o.antenna=true] @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, eachFace, finish } from '../shared/geom.js';
import { createRoofRim, createACUnit, createDoor } from '../shared/details.js';
import { rng } from '../shared/random.js';

export function createSkyscraper(o = {}) {
  const cc = codeColors(o);
  const { width = 7, depth = 7, floors = 14, floorHeight = 2.2, tiers = 3, bodyColor = cc?.light ?? P.cream,
    glassColor = P.glass, accentColor = cc?.wall ?? P.blueDeep, antenna = true, seed = 1 } = o;
  const r = rng(seed), g = new THREE.Group();
  // podium / lobby
  box(g, width + 1.6, 0.3, depth + 1.6, P.sidewalkDark, 0, 0, 0);
  box(g, width + 0.8, 3, depth + 0.8, accentColor, 0, 0.3, 0);
  eachFace(g, width + 0.8, depth + 0.8, (f, fw, side) => {
    box(f, fw - 0.8, 2.2, 0.06, glassColor, 0, 0.5, 0.03, { cast: false });
    for (let x = -fw / 2 + 0.4; x <= fw / 2 - 0.39; x += 1.2) box(f, 0.12, 2.2, 0.1, accentColor, x, 0.5, 0.06);
    if (side === 'front') { const d = createDoor({ width: 1.6, height: 2.1, color: glassColor, frame: P.white }); d.position.set(0, 0.3, 0.06); f.add(d); box(f, 3.4, 0.18, 1.4, P.white, 0, 2.7, 0.7); }
  });
  let y = 3.3, w = width, d = depth, left = floors;
  for (let t = 0; t < tiers; t++) {
    const n = t === tiers - 1 ? left : Math.max(2, Math.round(floors * (t === 0 ? 0.5 : 0.3)));
    left -= n; const h = n * floorHeight;
    box(g, w, h, d, bodyColor, 0, y, 0);
    eachFace(g, w, d, (f, fw) => {
      for (let k = 0; k < n; k++) {
        const yy = y + k * floorHeight + floorHeight * 0.3;
        box(f, fw - 0.5, floorHeight * 0.55, 0.06, glassColor, 0, yy, 0.03, { cast: false });
        if (r.chance(0.12)) box(f, 0.9, floorHeight * 0.55, 0.07, P.windowLit, r.range(-fw / 2 + 0.8, fw / 2 - 0.8), yy, 0.04, { cast: false });
      }
      for (let x = -fw / 2 + 0.25; x <= fw / 2 - 0.24; x += Math.max(0.9, (fw - 0.5) / Math.round((fw - 0.5) / 1.1))) box(f, 0.1, h, 0.1, bodyColor, x, y, 0.05);
      box(f, 0.4, h, 0.2, accentColor, -fw / 2 + 0.2, y, 0.0); box(f, 0.4, h, 0.2, accentColor, fw / 2 - 0.2, y, 0.0);
    });
    y += h;
    const rim = createRoofRim({ width: w + 0.2, depth: d + 0.2, thickness: 0.3, height: 0.5, color: accentColor }); rim.position.y = y; g.add(rim);
    box(g, w, 0.05, d, P.metalLight, 0, y, 0, { cast: false });
    if (t < tiers - 1) {
      const ac = createACUnit({ size: 0.9 }); ac.position.set(w / 2 - 0.9, y, d / 2 - 0.9); g.add(ac);
    }
    w *= 0.74; d *= 0.74;
  }
  // crown + antenna
  box(g, w * 0.9, 1.2, d * 0.9, accentColor, 0, y, 0);
  box(g, w * 0.95, 0.15, d * 0.95, P.white, 0, y + 1.2, 0);
  if (antenna) {
    cyl(g, 0.08, 0.14, 4.5, P.metal, 0, y + 1.35, 0, { segs: 6 });
    cyl(g, 0.3, 0.3, 0.12, P.metal, 0, y + 3.2, 0, { segs: 6 });
    box(g, 0.25, 0.25, 0.25, P.red, 0, y + 5.85, 0, { emissive: true });
  }
  return finish(g, 'Skyscraper', { size: 'core', floors, ...codeMeta(o) });
}
