/**
 * Vault — squat reinforced bank-vault building (grey concrete, dark plinth, big round
 * steel vault door with locking wheel, yellow/black hazard band, barred slit windows,
 * red rooftop beacon, bollards). Deliberately no text.
 *
 * CodeLens meaning: where secrets live (.env, API keys, credentials). It shows WHERE
 * secrets are kept — never their values. Visually "locked".
 *
 * @param {object} [o]
 * @param {number} [o.width=6] @param {number} [o.depth=5] @param {number} [o.height=3.6]
 * @param {string} [o.wallColor] @param {string} [o.doorColor] @param {boolean} [o.locked=true]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, cylC, boxC, eachFace, finish } from '../shared/geom.js';

export function createVault(o = {}) {
  const cc = codeColors(o);
  const { width = 6, depth = 5, height = 3.6, wallColor = cc?.wall ?? '#8c8c8c', doorColor = P.metalLight, locked = true } = o;
  const g = new THREE.Group();
  box(g, width + 1.6, 0.25, depth + 1.6, P.sidewalkDark, 0, 0, 0);
  box(g, width + 0.4, 0.6, depth + 0.4, P.charcoal, 0, 0.25, 0);
  box(g, width, height, depth, wallColor, 0, 0.85, 0);
  box(g, width + 0.5, 0.5, depth + 0.5, '#737373', 0, 0.85 + height, 0);
  // hazard band
  eachFace(g, width, depth, (f, fw) => {
    const n = Math.round(fw / 0.5);
    for (let i = 0; i < n; i++) box(f, fw / n, 0.3, 0.06, i % 2 ? P.black : P.yellow, -fw / 2 + (fw / n) * (i + 0.5), 0.85 + height - 0.55, 0.03, { cast: false });
  });
  eachFace(g, width, depth, (f, fw, side) => {
    if (side === 'front') return;
    for (const x of [-fw * 0.25, fw * 0.25]) {
      box(f, 1, 0.4, 0.06, P.black, x, 2.6, 0.03, { cast: false });
      for (let k = -2; k <= 2; k++) box(f, 0.06, 0.4, 0.08, P.metalLight, x + k * 0.2, 2.6, 0.06);
    }
  });
  // round vault door
  const door = new THREE.Group(); door.position.set(0, 0.85 + 1.5, depth / 2); g.add(door);
  cylC(door, 1.55, 1.55, 0.2, P.metal, 0, 0, 0.1, { rx: Math.PI / 2, segs: 16 });
  cylC(door, 1.3, 1.3, 0.3, doorColor, 0, 0, 0.2, { rx: Math.PI / 2, segs: 16 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; cylC(door, 0.1, 0.1, 0.1, P.metal, Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0.38, { rx: Math.PI / 2, segs: 6 }); }
  cylC(door, 0.18, 0.18, 0.5, P.charcoal, 0, 0, 0.5, { rx: Math.PI / 2, segs: 8 });
  for (let i = 0; i < 3; i++) boxC(door, 1.3, 0.1, 0.1, P.charcoal, 0, 0, 0.72, { rz: (i / 3) * Math.PI });
  if (locked) { box(door, 0.5, 0.42, 0.18, P.yellowSoft, 1.6, -0.95, 0.15); box(door, 0.08, 0.3, 0.08, P.metal, 1.45, -0.53, 0.15); box(door, 0.08, 0.3, 0.08, P.metal, 1.75, -0.53, 0.15); box(door, 0.38, 0.08, 0.08, P.metal, 1.6, -0.27, 0.15); }
  // beacon + bollards
  const top = 1.35 + height;
  cyl(g, 0.35, 0.35, 0.2, P.charcoal, width * 0.3, top, -depth * 0.2);
  cyl(g, 0.25, 0.25, 0.4, P.red, width * 0.3, top + 0.2, -depth * 0.2, { emissive: true });
  box(g, 1.4, 0.8, 1, '#a6a6a6', -width * 0.25, top, -depth * 0.1);
  for (const x of [-2.2, -1, 1, 2.2]) { cyl(g, 0.16, 0.16, 0.9, P.yellow, x, 0.25, depth / 2 + 0.6, { segs: 8 }); cyl(g, 0.17, 0.17, 0.12, P.black, x, 0.85, depth / 2 + 0.6, { segs: 8 }); }
  return finish(g, 'Vault', { size: 'small', secret: true, ...codeMeta(o) });
}
