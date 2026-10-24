/**
 * Shop — small corner shop (bright wall colour, darker framing rim on edges and roof,
 * big display window, door, striped awning, PLAIN sign board — no lettering — and a
 * white rooftop box). Modelled on the reference model's green shop.
 *
 * CodeLens meaning: small files / helpers — a utility module, a single component.
 *
 * @param {object} [o]
 * @param {number} [o.width=6] @param {number} [o.depth=5] @param {number} [o.height=3.8]
 * @param {number|object} [o.scheme] index into SHOP_SCHEMES or {wall, rim, awning:[a,b], sign}
 * @param {number} [o.seed=1]
 * @param {'none'|'moduleType'|'language'} [o.colorBy='none'] optional colour-coding (see shared/colorCoding.js)
 * @param {string} [o.moduleType] core|utility|api|data|db|ui|config|test  @param {string} [o.language] ts|js|py|css|json|other
 * @returns {THREE.Group}
 */
import * as THREE from 'three';
import { codeColors, codeMeta } from '../shared/colorCoding.js';
import { PALETTE as P, SHOP_SCHEMES } from '../shared/palette.js';
import { box, finish } from '../shared/geom.js';
import { createAwning, createDoor, createSignBoard, createRoofRim, createACUnit } from '../shared/details.js';
import { rng } from '../shared/random.js';

export function createShop(o = {}) {
  const { width = 6, depth = 5, height = 3.8, seed = 1 } = o;
  const r = rng(seed);
  const cc = codeColors(o);
  const sc0 = typeof o.scheme === 'object' ? o.scheme : SHOP_SCHEMES[(o.scheme ?? 0) % SHOP_SCHEMES.length];
  const sc = cc ? { wall: cc.wall, rim: cc.trim, awning: [cc.wall, P.white], sign: cc.light } : sc0;
  const g = new THREE.Group();
  box(g, width + 1.2, 0.2, depth + 1.2, P.sidewalk, 0, 0, 0);
  box(g, width, height, depth, sc.wall, 0, 0.2, 0);
  // edge framing posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.4, height, 0.4, sc.rim, sx * (width / 2 - 0.15), 0.2, sz * (depth / 2 - 0.15));
  box(g, width + 0.1, 0.3, depth + 0.1, sc.rim, 0, 0.2, 0);
  const rim = createRoofRim({ width: width + 0.2, depth: depth + 0.2, thickness: 0.4, height: 0.4, color: sc.rim }); rim.position.y = 0.2 + height - 0.1; g.add(rim);
  const front = new THREE.Group(); front.position.z = depth / 2; g.add(front);
  // display window
  box(front, width * 0.55, height * 0.5, 0.1, sc.rim, -width * 0.12, 0.6, 0.02);
  box(front, width * 0.55 - 0.25, height * 0.5 - 0.25, 0.1, P.windowWarm, -width * 0.12, 0.72, 0.06, { cast: false });
  box(front, width * 0.55, 0.12, 0.3, sc.rim, -width * 0.12, 0.5, 0.15);
  const door = createDoor({ width: 1, height: 2.2, color: sc.rim, frame: P.white, glass: P.windowWarm }); door.position.set(width * 0.3, 0.2, 0.02); front.add(door);
  const aw = createAwning({ width: width - 0.4, depth: 1.1, colors: sc.awning }); aw.position.set(0, 0.2 + height * 0.8, 0.06); front.add(aw);
  const sign = createSignBoard({ width: width * 0.75, height: 0.75, color: sc.sign, border: sc.rim }); sign.position.set(0, 0.2 + height + 0.05, 0.1); sign.rotation.x = -0.12; front.add(sign);
  // small side window
  const side = new THREE.Group(); side.position.x = width / 2; side.rotation.y = Math.PI / 2; g.add(side);
  box(side, 1.4, 1.1, 0.08, P.white, 0, 1.6, 0.02); box(side, 1.2, 0.9, 0.08, P.glass, 0, 1.7, 0.05, { cast: false });
  const ac = createACUnit({ size: 1.3, color: P.offWhite }); ac.position.set(r.range(-1, 1), 0.2 + height, -depth * 0.15); g.add(ac);
  return finish(g, 'Shop', { size: 'small', ...codeMeta(o) });
}
