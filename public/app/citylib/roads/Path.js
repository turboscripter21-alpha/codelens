/**
 * Path: narrow pedestrian / park footpath. Straight (runs along +Z from the origin) or
 * curved (starts at the origin heading +Z and bends toward +X, or -X with a negative
 * angle). Styles: 'dirt' (the reference park's ochre path), 'paver' (grey slabs with
 * joints) and 'stones' (stepping stones on grass).
 *
 * CodeLens meaning: light, occasional links: e.g. a file imported once, a doc link, a
 * walking route for the guided tour.
 *
 * @param {object} [o]
 * @param {number} [o.length=10] straight length (ignored when curved)
 * @param {number} [o.width=1.6]
 * @param {number} [o.curve=0] bend angle in radians (0 = straight; e.g. Math.PI/2 = quarter turn)
 * @param {number} [o.radius=5] curve radius (centre line)
 * @param {'dirt'|'paver'|'stones'} [o.style='dirt'] @param {boolean} [o.edging=true] small curb stones
 * @param {string} [o.color]
 * @returns {THREE.Group} surface ~y=0.03
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, finish } from '../shared/geom.js';
import { mat } from '../shared/materials.js';

export function createPath(o = {}) {
  const { length = 10, width = 1.6, curve = 0, radius = 5, style = 'dirt', edging = style !== 'stones' } = o;
  const color = o.color ?? (style === 'paver' ? '#c9c9c9' : style === 'stones' ? P.stoneLight : P.dirtPath);
  const g = new THREE.Group();
  const curved = Math.abs(curve) > 1e-3, sgn = Math.sign(curve) || 1, L = curved ? Math.abs(curve) * radius : length;
  // sample the centre line: t in [0,1] → {x, z, angle}
  const at = (t) => {
    if (!curved) return { x: 0, z: t * L, a: 0 };
    const th = t * Math.abs(curve);
    return { x: sgn * radius * (1 - Math.cos(th)), z: radius * Math.sin(th), a: sgn * th };
  };
  const sector = (rIn, rOut, y, h, c) => {
    // ring sector around centre (sgn*radius, 0)
    const sh = new THREE.Shape(), a0 = sgn > 0 ? Math.PI : 0, a1 = sgn > 0 ? Math.PI - Math.abs(curve) : Math.abs(curve);
    sh.absarc(0, 0, rOut, a0, a1, sgn > 0); sh.absarc(0, 0, rIn, a1, a0, sgn < 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 32 }); geo.rotateX(Math.PI / 2); geo.translate(sgn * radius, y + h, 0);
    const m = new THREE.Mesh(geo, mat(c)); m.receiveShadow = true; g.add(m); return m;
  };
  if (style === 'stones') {
    const n = Math.max(2, Math.round(L / 0.9));
    for (let i = 0; i < n; i++) { const p = at((i + 0.5) / n); const s = cyl(g, width * 0.32, width * 0.34, 0.07, i % 2 ? color : P.stone, p.x + (i % 2 ? 0.15 : -0.15) * Math.cos(p.a), 0, p.z, { segs: 7, cast: false }); s.rotation.y = i * 0.7; }
    return finish(g, 'Path', { style, curved, length: L });
  }
  if (!curved) {
    box(g, width, 0.03, L, color, 0, 0, L / 2, { cast: false });
    if (edging) for (const s of [-1, 1]) box(g, 0.14, 0.07, L, P.curb, s * (width / 2 + 0.05), 0, L / 2, { cast: false });
  } else {
    sector(radius - width / 2, radius + width / 2, 0, 0.03, color);
    if (edging) { sector(radius + width / 2 - 0.02, radius + width / 2 + 0.12, 0, 0.07, P.curb); sector(radius - width / 2 - 0.12, radius - width / 2 + 0.02, 0, 0.07, P.curb); }
  }
  if (style === 'paver') {
    const n = Math.round(L / 0.8);
    for (let i = 1; i < n; i++) { const p = at(i / n); box(g, width, 0.01, 0.05, P.sidewalkDark, p.x, 0.03, p.z, { ry: p.a, cast: false }); }
  }
  if (style === 'dirt') { // a few pebbles
    for (let i = 0; i < Math.round(L / 1.5); i++) { const p = at((i + 0.37) / Math.round(L / 1.5)); const off = (i % 3 - 1) * width * 0.25; cyl(g, 0.08, 0.1, 0.05, '#9d7822', p.x + off * Math.cos(p.a), 0.03, p.z - off * Math.sin(p.a), { segs: 5, cast: false }); }
  }
  return finish(g, 'Path', { style, curved, length: L });
}
