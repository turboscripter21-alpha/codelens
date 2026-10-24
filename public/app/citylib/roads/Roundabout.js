/**
 * Roundabout: square tile with a circular carriageway, raised grass island with white
 * curb ring, dashed lane ring and four road stubs (the reference model has one around
 * its central monument; here the island holds an optional small tree cluster instead).
 *
 * CodeLens meaning: an event loop / router / dispatcher: traffic circulates and exits
 * to different destinations.
 *
 * @param {object} [o]
 * @param {number} [o.size=22] tile size @param {number} [o.roadWidth=8] arm width
 * @param {number} [o.islandRadius=4] @param {boolean} [o.islandTrees=true]
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, ring, blob, finish } from '../shared/geom.js';
import { mat } from '../shared/materials.js';

export function createRoundabout(o = {}) {
  const { size = 22, roadWidth = 8, islandRadius = 4, islandTrees = true } = o;
  const g = new THREE.Group();
  const outer = islandRadius + roadWidth * 0.85;
  // corner sidewalk pads + asphalt
  box(g, size, 0.05, size, P.asphalt, 0, 0, 0, { cast: false });
  // corner sidewalks, cut by the circle (quarter-arc inner edge)
  const h = roadWidth / 2, S = size / 2, R = outer + 0.2, y1 = Math.sqrt(Math.max(R * R - h * h, 0));
  for (let k = 0; k < 4; k++) {
    const sh = new THREE.Shape();
    sh.moveTo(S, S); sh.lineTo(h, S); sh.lineTo(h, y1);
    sh.absarc(0, 0, R, Math.atan2(y1, h), Math.atan2(h, y1), true);
    sh.lineTo(S, h); sh.lineTo(S, S);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false, curveSegments: 10 }); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat(P.sidewalk)); m.rotation.y = (k * Math.PI) / 2; m.receiveShadow = true; g.add(m);
    const cgeo = new THREE.RingGeometry(R - 0.3, R, 10, 1, Math.atan2(h, y1), Math.atan2(y1, h) - Math.atan2(h, y1)); cgeo.rotateX(-Math.PI / 2);
    const c = new THREE.Mesh(cgeo, mat(P.curb)); c.position.y = 0.255; c.rotation.y = (k * Math.PI) / 2 ; g.add(c);
  }
  cyl(g, outer, outer, 0.06, P.asphalt, 0, 0, 0, { segs: 40, cast: false });
  ring(g, outer - 0.55, outer - 0.35, P.roadLine, 0, 0.065, 0, { segs: 40 });
  // dashed lane ring
  const mid = (islandRadius + outer) / 2, n = 22;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; box(g, 0.16, 0.012, 1, P.roadLine, Math.cos(a) * mid, 0.06, Math.sin(a) * mid, { ry: -a, cast: false }); }
  // island
  cyl(g, islandRadius + 0.3, islandRadius + 0.3, 0.3, P.curb, 0, 0, 0, { segs: 28 });
  cyl(g, islandRadius, islandRadius, 0.34, P.grass, 0, 0, 0, { segs: 28 });
  if (islandTrees) {
    cyl(g, 0.18, 0.25, 1.4, P.trunk, 0, 0.34, 0, { segs: 6 });
    blob(g, 1.2, P.leaf, 0, 2.3, 0); blob(g, 0.8, P.leafDark, 0.7, 1.9, 0.3); blob(g, 0.7, P.leafLight, -0.6, 2, -0.4);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; blob(g, 0.5, i % 2 ? P.leafDark : P.leafLime, Math.cos(a) * (islandRadius - 0.9), 0.65, Math.sin(a) * (islandRadius - 0.9), { sy: 0.8 }); }
  }
  // arm edge lines on the stubs
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.y = (k * Math.PI) / 2; g.add(arm);
    const len = size / 2 - outer + 0.6;
    for (const s of [-1, 1]) box(arm, 0.18, 0.012, len, P.roadLine, s * (roadWidth / 2 - 0.4), 0.05, size / 2 - len / 2, { cast: false });
  }
  return finish(g, 'Roundabout', { size });
}
