/** Tiny pure colour helpers (no three.js), so the layout stays testable in plain Node. */

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** Mix a colour towards white (k > 0) or black (k < 0). */
export function shade(hex: string, k: number): string {
  const [r, g, b] = toRgb(hex);
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  return toHex([r + (t - r) * a, g + (t - g) * a, b + (t - b) * a]);
}

/** Deterministic 32-bit FNV-1a hash of a string. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(list: readonly T[], key: string): T {
  return list[hash(key) % list.length];
}

/** Deterministic 0..1 value from a key. */
export function rand01(key: string): number {
  return (hash(key) % 10000) / 10000;
}
