/**
 * CommonPath: "main artery" road for the MOST commonly used code paths (hot call
 * chains like request → router → handler → db). Wider multi-lane carriageway, brighter
 * asphalt, white edge + dashed lane lines, a highlighted glowing centre strip with soft
 * halo, glowing lane studs, and an optional animated "flow" of light pulses along the
 * strip. Runs along Z, same convention as RoadStraight.
 *
 * `intensity` (0..1) = how hot the path is. It controls glow strength, strip width,
 * road width and the default number of lanes (4 → 6).
 *
 * Animation: when `flow` is true the pulses move by themselves inside any render loop
 * (driven from onBeforeRender with performance.now). Call group.userData.setTime(t)
 * to drive it manually (e.g. paused screenshots).
 *
 * @param {object} [o]
 * @param {number} [o.length=20] @param {number} [o.intensity=0.6] 0..1
 * @param {number} [o.width] default 11 + 4*intensity @param {number} [o.lanes] default 4, or 6 when intensity > 0.6
 * @param {string} [o.glowColor='#ffd23a'] @param {boolean} [o.flow=true] @param {number} [o.flowSpeed=8] units/sec
 * @param {boolean} [o.median=true] slightly raised strip under the glow
 * @returns {THREE.Group} top surface y≈0.06
 */
import * as THREE from 'three';
import { PALETTE as P } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';

export function createCommonPath(o = {}) {
  const intensity = Math.min(1, Math.max(0, o.intensity ?? 0.6));
  const { length = 20, glowColor = '#ffd23a', flow = true, flowSpeed = 8, median = true } = o;
  const width = o.width ?? 11 + 4 * intensity, lanes = o.lanes ?? (intensity > 0.6 ? 6 : 4);
  const g = new THREE.Group();
  const asphalt = '#' + new THREE.Color('#3b3c40').lerp(new THREE.Color('#4e5058'), intensity).getHexString();
  box(g, width, 0.06, length, asphalt, 0, 0, 0, { cast: false });
  for (const s of [-1, 1]) box(g, 0.24, 0.012, length, P.roadLine, s * (width / 2 - 0.45), 0.06, 0, { cast: false });
  const half = lanes / 2, stripW = 0.35 + 0.75 * intensity;
  const inner = stripW / 2 + 0.25, laneW = (width / 2 - 0.45 - inner) / half;
  const n = Math.max(1, Math.round(length / 2.5));
  for (let l = 1; l < half; l++) for (const s of [-1, 1]) for (let i = 0; i < n; i++)
    box(g, 0.16, 0.012, 1.2, P.roadLine, s * (inner + laneW * l), 0.06, -length / 2 + (length / n) * (i + 0.5), { cast: false });
  // glowing centre strip + halo
  const glow = new THREE.Color(glowColor);
  const coreMat = new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(0.55 + 0.45 * intensity).lerp(new THREE.Color('#fffbe0'), 0.5 * intensity) });
  const haloMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.08 + 0.37 * intensity, depthWrite: false });
  const halo2Mat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.05 + 0.2 * intensity, depthWrite: false });
  if (median) box(g, stripW + 0.5, 0.05, length, '#2a2b2e', 0, 0.06, 0, { cast: false });
  const core = new THREE.Mesh(new THREE.BoxGeometry(stripW, 0.03, length), coreMat); core.position.y = 0.2; g.add(core);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(stripW + 0.6 + 1.2 * intensity, length), haloMat); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.17; g.add(halo);
  const halo2 = new THREE.Mesh(new THREE.PlaneGeometry(stripW + 1.4 + 3.6 * intensity, length), halo2Mat); halo2.rotation.x = -Math.PI / 2; halo2.position.y = 0.14; g.add(halo2);
  // glowing lane studs (cat's eyes) along the edges of the strip
  const studMat = new THREE.MeshBasicMaterial({ color: glow });
  const nStud = Math.round(length / 2);
  for (let i = 0; i < nStud; i++) for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.3), studMat); m.position.set(s * (stripW / 2 + 0.38), 0.19, -length / 2 + (length / nStud) * (i + 0.5)); g.add(m); }
  // animated flow pulses
  const pulses = [];
  if (flow) {
    const pm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 + 0.4 * intensity, depthWrite: false });
    const n = Math.max(2, Math.round(length / 5));
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(stripW * 0.9, 0.03, 1.4), pm); m.position.y = 0.235; g.add(m); pulses.push(m); }
    const setTime = (t) => { pulses.forEach((m, i) => { m.position.z = ((t * flowSpeed + (i * length) / n) % length) - length / 2; }); };
    setTime(0);
    g.userData.setTime = setTime;
    core.onBeforeRender = () => { if (!g.userData.paused) setTime(performance.now() / 1000); };
  }
  return finish(g, 'CommonPath', { intensity, lanes, width, length });
}
