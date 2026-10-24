import type { Building, CityLayout } from "./types";

/**
 * Pure helpers that turn a layout into lists of boxes for instanced meshes.
 * Every box here is drawn with ONE shared unit-cube geometry, so a whole
 * category (windows, roofs, doors, awnings...) is a single draw call.
 */
export interface BoxInstance {
  x: number;
  y: number; // centre
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
}

const GLASS = { tower: "#5f9fc2", mid: "#7fb2c9", shop: "#86c3d6" } as const;
const DOOR = "#5b3a26";
const FRAME = "#f7f4ec";

/** Windows, roof slabs, doors and awnings for every building. No text, no labels. */
export function buildingDetails(buildings: Building[]): BoxInstance[] {
  const out: BoxInstance[] = [];
  for (const b of buildings) {
    const { x, z, width: w, depth: d, height: h, facing } = b;
    // roof slab / parapet
    out.push({ x, y: h + 0.14, z, sx: w + 0.3, sy: 0.28, sz: d + 0.3, color: b.roofColor });
    const frontZ = z + facing * (d / 2 + 0.04);

    if (b.tier === "shop") {
      // storefront glass, door and a plain accent awning on the road side
      out.push({ x: x - w * 0.12, y: 1.05, z: frontZ, sx: w * 0.5, sy: 1.1, sz: 0.08, color: GLASS.shop });
      out.push({ x: x + w * 0.3, y: 0.8, z: frontZ, sx: 0.8, sy: 1.6, sz: 0.1, color: DOOR });
      out.push({ x, y: 1.95, z: z + facing * (d / 2 + 0.45), sx: w * 0.86, sy: 0.12, sz: 0.9, color: b.accentColor });
      // one small window on the back wall so the shop reads from both sides
      out.push({ x, y: 1.25, z: z - facing * (d / 2 + 0.03), sx: 1.1, sy: 0.8, sz: 0.06, color: GLASS.shop });
      continue;
    }

    // door on the road side
    out.push({ x, y: 0.85, z: frontZ, sx: 0.95, sy: 1.7, sz: 0.1, color: DOOR });
    // window rows on all four walls (2 per wall per floor)
    const floor = b.tier === "tower" ? 1.45 : 1.55;
    const glass = GLASS[b.tier];
    for (let y = 2.6; y < h - 0.5; y += floor) {
      for (const k of [-0.24, 0.24]) {
        out.push({ x: x + k * w, y, z: z + d / 2 + 0.03, sx: 0.7, sy: 0.85, sz: 0.06, color: glass });
        out.push({ x: x + k * w, y, z: z - d / 2 - 0.03, sx: 0.7, sy: 0.85, sz: 0.06, color: glass });
        out.push({ x: x + w / 2 + 0.03, y, z: z + k * d, sx: 0.06, sy: 0.85, sz: 0.7, color: glass });
        out.push({ x: x - w / 2 - 0.03, y, z: z + k * d, sx: 0.06, sy: 0.85, sz: 0.7, color: glass });
      }
    }
    if (b.tier === "tower") {
      // rooftop box (AC unit / stair house)
      out.push({ x: x - w * 0.18, y: h + 0.6, z: z - d * 0.12, sx: 1.1, sy: 0.7, sz: 0.9, color: FRAME });
    }
  }
  return out;
}

/** Road surface, sidewalks, centre dashes and district plots: all flat boxes. */
export function groundBoxes(layout: CityLayout): BoxInstance[] {
  if (layout.streets?.length) return gridGroundBoxes(layout);
  const { length, width, sidewalk } = layout.road;
  const out: BoxInstance[] = [
    { x: 0, y: 0.05, z: 0, sx: length, sy: 0.1, sz: width, color: ROAD },
  ];
  for (const s of [-1, 1]) {
    out.push({ x: 0, y: 0.09, z: s * (width / 2 + sidewalk / 2), sx: length, sy: 0.18, sz: sidewalk, color: WALK });
  }
  for (let x = -length / 2 + 2; x < length / 2 - 2; x += 4) {
    out.push({ x: x + 1, y: 0.105, z: 0, sx: 2, sy: 0.02, sz: 0.22, color: DASH });
  }
  for (const d of layout.districts) {
    out.push({ x: d.x, y: 0.1, z: d.z, sx: d.width, sy: 0.2, sz: d.depth, color: d.color });
  }
  return out;
}

const ROAD = "#5a6069";
const WALK = "#dcd8cf";
const DASH = "#f1eee6";

/**
 * Phase 3 grid mode: the same plain road pieces as Phase 1 (asphalt, two sidewalks,
 * a dashed centre line) for every street. Sidewalks and dashes stop at crossings so
 * streets meet cleanly. No glow, no double lanes.
 */
function gridGroundBoxes(layout: CityLayout): BoxInstance[] {
  const { width, sidewalk } = layout.road;
  const streets = layout.streets!;
  const xs = streets.filter((s) => s.axis === "x");
  const zs = streets.filter((s) => s.axis === "z");
  const band = width / 2 + sidewalk;
  const out: BoxInstance[] = [];
  /** Split [a, b] into pieces that avoid the given crossing centres (each crossing is 2*band wide). */
  const pieces = (a: number, b: number, cuts: number[]) => {
    const res: [number, number][] = [];
    let cur = a;
    for (const c of [...cuts].sort((p, q) => p - q)) {
      if (c + band < a || c - band > b) continue;
      if (c - band > cur) res.push([cur, c - band]);
      cur = Math.max(cur, c + band);
    }
    if (cur < b) res.push([cur, b]);
    return res;
  };
  for (const s of streets) {
    out.push({ x: s.x, y: 0.05, z: s.z, sx: s.sx, sy: 0.1, sz: s.sz, color: ROAD });
  }
  for (const s of xs) {
    for (const [a, b] of pieces(s.x - s.sx / 2, s.x + s.sx / 2, zs.map((c) => c.x))) {
      for (const side of [-1, 1]) out.push({ x: (a + b) / 2, y: 0.09, z: s.z + side * (width / 2 + sidewalk / 2), sx: b - a, sy: 0.18, sz: sidewalk, color: WALK });
      for (let x = a + 1; x + 2 <= b - 1; x += 4) out.push({ x: x + 1, y: 0.105, z: s.z, sx: 2, sy: 0.02, sz: 0.22, color: DASH });
    }
  }
  for (const s of zs) {
    for (const [a, b] of pieces(s.z - s.sz / 2, s.z + s.sz / 2, xs.map((c) => c.z))) {
      for (const side of [-1, 1]) out.push({ x: s.x + side * (width / 2 + sidewalk / 2), y: 0.09, z: (a + b) / 2, sx: sidewalk, sy: 0.18, sz: b - a, color: WALK });
      for (let z = a + 1; z + 2 <= b - 1; z += 4) out.push({ x: s.x, y: 0.105, z: z + 1, sx: 0.22, sy: 0.02, sz: 2, color: DASH });
    }
  }
  for (const d of layout.districts) {
    out.push({ x: d.x, y: 0.1, z: d.z, sx: d.width, sy: 0.2, sz: d.depth, color: d.color });
  }
  return out;
}
