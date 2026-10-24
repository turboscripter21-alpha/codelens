/**
 * materials.js — Flat-shaded, cached materials in the reference model's look.
 * The original model is unlit (flat palette colours). Default mode 'lambert' keeps that
 * flat look but adds gentle face shading so shapes read in 3D. Call
 * setMaterialMode('unlit') BEFORE creating components for the fully flat original look,
 * or 'toon' for a 2-tone cel look.
 */
import * as THREE from 'three';

let MODE = 'lambert';
const cache = new Map();
let toonRamp = null;

/** @param {'lambert'|'unlit'|'toon'} mode */
export function setMaterialMode(mode) { MODE = mode; }
export function getMaterialMode() { return MODE; }

/**
 * Get a shared material for a colour.
 * @param {string|number} color
 * @param {{emissive?:boolean, transparent?:number, side?:number}} [o]
 */
export function mat(color, o = {}) {
  const key = `${MODE}|${color}|${o.emissive ? 1 : 0}|${o.transparent ?? ''}|${o.side ?? ''}`;
  let m = cache.get(key);
  if (m) return m;
  const base = { color: new THREE.Color(color) };
  if (o.transparent != null) Object.assign(base, { transparent: true, opacity: o.transparent, depthWrite: false });
  if (o.side != null) base.side = o.side;
  if (o.emissive || MODE === 'unlit') m = new THREE.MeshBasicMaterial(base);
  else if (MODE === 'toon') {
    if (!toonRamp) {
      toonRamp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 255, 255, 255, 255]), 2, 1);
      toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter; toonRamp.needsUpdate = true;
    }
    m = new THREE.MeshToonMaterial({ ...base, gradientMap: toonRamp });
  } else m = new THREE.MeshLambertMaterial({ ...base, flatShading: true });
  cache.set(key, m);
  return m;
}
