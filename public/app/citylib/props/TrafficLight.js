/**
 * TrafficLight: black pole with a 3-lamp signal head (red / amber / green) and visor
 * hoods, like the reference model's signals.
 *
 * CodeLens meaning: a guard / condition / middleware that decides whether traffic
 * (calls) may pass.
 *
 * @param {object} [o]
 * @param {number} [o.height=3.4} @param {'red'|'amber'|'green'|'all'} [o.state='all'] which lamps glow
 * @param {boolean} [o.overhang=false] mount head on an arm over the road
 * @returns {THREE.Group} lamps face +Z
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, cyl, cylC, finish } from '../shared/geom.js';

export function createTrafficLight(o = {}) {
  const { height = 3.4, state = 'all', overhang = false } = o;
  const g = new THREE.Group();
  cyl(g, 0.22, 0.26, 0.2, P.charcoal, 0, 0, 0, { segs: 8 });
  cyl(g, 0.07, 0.08, height, P.black, 0, 0.2, 0, { segs: 6 });
  const head = new THREE.Group(); g.add(head);
  if (overhang) { box(g, 0.1, 0.1, 2.6, P.black, 0, height + 0.05, 1.3); head.position.set(0, height - 1.2, 2.5); }
  else head.position.set(0, height - 1.2, 0.16);
  box(head, 0.5, 1.35, 0.32, P.black, 0, 0, 0);
  box(head, 0.7, 1.5, 0.05, P.charcoal, 0, -0.08, -0.17);
  const cols = [[P.red, 'red'], ['#ffb000', 'amber'], ['#4fdc3a', 'green']];
  cols.forEach(([c, k], i) => {
    const y = 1.12 - i * 0.43, on = state === 'all' || state === k;
    cylC(head, 0.15, 0.15, 0.06, on ? c : P.charcoal, 0, y, 0.17, { rx: Math.PI / 2, segs: 10, emissive: on });
    box(head, 0.38, 0.05, 0.22, P.black, 0, y + 0.15, 0.27);
  });
  return finish(g, 'TrafficLight', { state });
}
