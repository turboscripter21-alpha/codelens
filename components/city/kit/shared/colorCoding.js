/**
 * colorCoding.js — OPTIONAL colour-coding for buildings (default OFF).
 *
 * Every building factory accepts:
 *   { colorBy: 'none' | 'moduleType' | 'language', moduleType, language }
 * - 'none' (default) keeps the natural low-poly palette.
 * - 'moduleType' tints the main walls by what the code does (core, api, ui …).
 * - 'language'   tints the main walls by the file's language (ts, js, py …).
 * Only walls and trims are tinted: windows, glass, doors and roofs keep their colours
 * so the building stays readable. Nothing is written on the building; show the legend
 * in your page UI (see LEGENDS / legendFor()).
 */
import * as THREE from 'three';

export const MODULE_TYPE_COLORS = {
  core: '#2f5bd8',     // blue
  utility: '#3fae3a',  // green
  api: '#ff7a1a',      // orange
  data: '#7b3fc4',     // purple (data / db)
  ui: '#14b3a8',       // teal (ui; pink variant: UI_PINK)
  config: '#8f949b',   // gray
  test: '#f2c40f',     // yellow
};
MODULE_TYPE_COLORS.db = MODULE_TYPE_COLORS.data;
export const UI_PINK = '#ff4fb8';

export const LANGUAGE_COLORS = {
  ts: '#3178c6',   // TypeScript blue
  js: '#f0d43a',   // JavaScript yellow
  py: '#2e9e5b',   // Python (green, kept distinct from ts blue)
  css: '#c04bd9',  // CSS purple
  json: '#ff7a1a', // JSON orange
  other: '#8f949b',
};

/** Legend entries for page UI: [{key, color}] */
export const LEGENDS = {
  moduleType: ['core', 'utility', 'api', 'data', 'ui', 'config', 'test'].map(k => ({ key: k === 'data' ? 'data / db' : k, color: MODULE_TYPE_COLORS[k] })),
  language: Object.entries(LANGUAGE_COLORS).map(([key, color]) => ({ key, color })),
};
export const legendFor = (colorBy) => LEGENDS[colorBy] || [];

const shade = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color(k < 0 ? '#000000' : '#ffffff'), Math.abs(k)).getHexString();

/**
 * Resolve the coded colours for a building's options, or null when colour-coding is off.
 * @returns {null | {wall:string, trim:string, light:string, dark:string, key:string}}
 */
export function codeColors(o = {}) {
  const by = o.colorBy || 'none';
  if (by === 'none') return null;
  let c, key;
  if (by === 'moduleType') { key = (o.moduleType || 'utility').toLowerCase(); c = MODULE_TYPE_COLORS[key] ?? MODULE_TYPE_COLORS.config; }
  else if (by === 'language') { key = (o.language || 'other').toLowerCase().replace(/^\./, ''); key = { tsx: 'ts', jsx: 'js', mjs: 'js', scss: 'css' }[key] ?? key; c = LANGUAGE_COLORS[key] ?? LANGUAGE_COLORS.other; }
  else return null;
  return { wall: c, trim: shade(c, -0.35), light: shade(c, 0.45), dark: shade(c, -0.55), key, by };
}
/** Metadata to store in userData.codecity */
export const codeMeta = (o = {}) => ({ colorBy: o.colorBy || 'none', moduleType: o.moduleType, language: o.language });
