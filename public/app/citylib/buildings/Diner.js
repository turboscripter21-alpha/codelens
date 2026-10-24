/**
 * Diner: single-storey roadside diner (cream walls, blue/white striped awnings on the
 * front and sides, plain red sign band: no letters: wide windows, planters with
 * bushes, yellow roof vent pipe, rooftop AC and vent).
 *
 * CodeLens meaning: a "service counter" file that many others visit: a request
 * handler / API route / auth module that serves data to callers.
 *
 * @param {object} [o]
 * @param {number} [o.width=10] @param {number} [o.depth=7] @param {number} [o.height=4}
 * @param {string} [o.wallColor] @param {string[]} [o.awningColors] @param {string} [o.signColor]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, eachFace, finish } from '../shared/geom.js';
import { createAwning, createDoor, createPlanter, createSignBoard, createACUnit } from '../shared/details.js';

export function createDiner(o = {}) {
  const cc = codeColors(o);
  const { width = 10, depth = 7, height = 4, wallColor = cc?.light ?? '#e4e2cf', awningColors = [cc?.wall ?? P.blueDeep, P.white], signColor = cc?.trim ?? P.red } = o;
  const g = new THREE.Group();
  box(g, width + 2, 0.2, depth + 2, P.sidewalk, 0, 0, 0);
  box(g, width, height, depth, wallColor, 0, 0.2, 0);
  box(g, width + 0.3, 0.45, depth + 0.3, wallColor, 0, 0.2 + height, 0); // parapet lip
  box(g, width + 0.12, 0.5, depth + 0.12, '#c9c6b0', 0, 0.2, 0); // base skirting
  eachFace(g, width, depth, (f, fw, side) => {
    if (side === 'back') return;
    const n = side === 'front' ? 3 : 1, seg = fw / n;
    for (let i = 0; i < n; i++) {
      const x = -fw / 2 + seg * (i + 0.5);
      if (side === 'front' && i === 2) {
        const d = createDoor({ width: 1.2, height: 2.3, color: P.blueDeep, frame: P.white, glass: P.glass }); d.position.set(x, 0.2, 0); f.add(d);
      } else {
        box(f, seg * 0.7, 1.5, 0.08, P.white, x, 1.2, 0.02); box(f, seg * 0.7 - 0.2, 1.3, 0.08, P.glass, x, 1.3, 0.05, { cast: false });
      }
      const aw = createAwning({ width: seg * 0.82, depth: 1.2, colors: awningColors, tilt: 0.6 }); aw.position.set(x, 3.3, 0.05); f.add(aw);
    }
    if (side === 'front') { const s = createSignBoard({ width: fw * 0.5, height: 0.55, color: signColor, border: P.white }); s.position.set(-fw * 0.12, 3.4, 0.05); f.add(s); }
    if (side === 'front') for (const x of [-fw * 0.36, -fw * 0.03]) { const p = createPlanter({ width: 1.6, depth: 0.7 }); p.position.set(x, 0.2, 0.9); f.add(p); }
  });
  // roof details
  const top = 0.65 + height;
  box(g, width - 0.4, 0.05, depth - 0.4, '#d6d4c4', 0, top - 0.45, 0, { cast: false });
  const ac = createACUnit({ size: 1.6, color: P.offWhite }); ac.position.set(-width * 0.2, top - 0.4, 0); g.add(ac);
  cyl(g, 0.18, 0.18, 1.2, P.yellowSoft, width * 0.3, top - 0.4, -depth * 0.2, { segs: 8 });
  box(g, 0.6, 0.18, 0.36, P.yellowSoft, width * 0.3 + 0.2, top + 0.6, -depth * 0.2);
  cyl(g, 0.45, 0.45, 0.2, P.black, width * 0.05, top - 0.4, depth * 0.2, { segs: 10 });
  return finish(g, 'Diner', { size: 'medium', ...codeMeta(o) });
}
