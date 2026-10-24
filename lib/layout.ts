import { hash, pick, rand01, shade } from "./color";
import { PROTO_DIMS } from "./city/protoDims";
import type { Building, CityLayout, District, FileKind, FileNode, Lamp, Side, StreetRect, Tier, Tree } from "./types";

/**
 * Deterministic city layout: file tree in, buildings / districts / lamps / trees out.
 * No AI, no randomness: the same tree always gives the same city.
 *
 * - Each top-level folder is a district (files at the repo root form a "root" district).
 * - Districts sit on flat plots on both sides of ONE straight road running along x.
 * - Each file is a building. Height comes from a size/importance score:
 *   tall towers = core files, medium = apartments/offices, small shops = small parts.
 * - Towers stand at the back of a plot, shops line the road.
 *
 * Phase 3 extensions (same plain road style):
 * - Each building gets a detailed kit prototype (`style`), picked by tier + file hash.
 * - Big folders split into sub-districts; huge repos fold the smallest files into blocks.
 * - When one road would get too long, the city switches to grid mode: several parallel
 *   Phase 1 streets ("strips") joined by plain cross streets.
 */

export const ROAD_WIDTH = 7;
export const SIDEWALK = 1.8;
export const CELL = 5.4; // grid cell per building
export const PLOT_PAD = 1.4;
export const DISTRICT_GAP = 3.5;
export const LAMP_SPACING = 9;
/** Phase 3: above this run length per side, use grid mode. */
export const SINGLE_ROAD_MAX_RUN = 130;
/** Phase 3: max files per district before it is split into sub-districts / chunks. */
export const MAX_DISTRICT_FILES = 150;
/** Phase 3: max buildings drawn; beyond this the smallest files become aggregated blocks. */
export const MAX_BUILDINGS = 1200;
/** Phase 3: grid mode segment width (between cross streets). */
export const SEGMENT = 96;
/** Width of a cross-street band (road + both sidewalks + margin). */
export const CROSS = ROAD_WIDTH + SIDEWALK * 2 + 1.2;
const BLOCK_SIZE = 25;

const KIND_WEIGHT: Record<FileKind, number> = {
  core: 1.6,
  util: 1.2,
  hook: 1.2,
  ui: 1,
  markup: 1,
  test: 0.8,
  config: 0.8,
  ci: 0.8,
  style: 0.7,
  docs: 0.6,
  asset: 0.5,
  secret: 0.5,
  block: 0.5,
};

export const TIER_THRESHOLDS = { tower: 180, mid: 60 } as const;

const PALETTE: Record<Tier, readonly string[]> = {
  tower: ["#cfdbe6", "#a9c6dc", "#f0e2c1", "#bfd0dd"],
  mid: ["#f5edcd", "#f2c88a", "#e7a27c", "#dfe6d3", "#c8dca0"],
  shop: ["#9fd36a", "#ffa45c", "#f6d37a", "#7fc8c0", "#f19a8e"],
};
const ACCENTS = ["#e8554a", "#2f6fd1", "#ff8a1f", "#14a39a", "#e2457f"] as const;
const DISTRICT_COLORS = ["#dfe9c9", "#e6e2d3", "#d8e6dd", "#ebe3cf", "#dde3ea"] as const;

/** Size/importance score for one file. Binary assets fall back to bytes. */
export function fileScore(f: FileNode): number {
  const w = KIND_WEIGHT[f.kind ?? "util"] ?? 1;
  const lines = f.loc ?? f.lines; // Phase 2: analyzed files use non-blank LOC
  const base = lines && lines > 0 ? lines : Math.min(60, (f.bytes ?? 0) / 1000);
  // Phase 2: files many others import rise higher (in-degree). Only analyzed files carry importance.
  const inDeg = f.importance !== undefined ? Math.min(f.usedBy?.length ?? 0, 40) * 12 : 0;
  return Math.round((base * w + inDeg) * 10) / 10;
}

export function tierFor(score: number, t: { tower: number; mid: number } = TIER_THRESHOLDS): Tier {
  if (score >= t.tower) return "tower";
  if (score >= t.mid) return "mid";
  return "shop";
}

/**
 * Phase 3: for bigger cities, raise the thresholds to percentiles so only the top ~6%
 * become towers and the next ~25% offices/apartments (the Phase 1 values stay the floor).
 */
export function thresholdsFor(scores: number[]): { tower: number; mid: number } {
  if (scores.length <= 60) return TIER_THRESHOLDS;
  const s = [...scores].sort((a, b) => b - a);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { tower: Math.max(TIER_THRESHOLDS.tower, at(0.06)), mid: Math.max(TIER_THRESHOLDS.mid, at(0.31)) };
}

/** Phase 3: deterministic kit prototype for a building (see components/city/prototypes.ts). */
export function styleFor(tier: Tier, f: FileNode, height: number): string {
  if (f.secret || f.kind === "secret") return "vault";
  if (f.kind === "block") return "house";
  const h = hash(f.path + "#style");
  if (tier === "tower") {
    const scheme = h % 3 === 0 ? "b" : "a";
    if (scheme === "b") return height >= 12.5 ? "tower-b2" : "tower-b1";
    return height >= 14 ? "tower-a3" : height >= 11 ? "tower-a2" : "tower-a1";
  }
  if (tier === "mid") {
    const big = height >= 6.1;
    return h % 2 === 0 ? (big ? "office-3" : "office-2") : big ? "apt-5" : "apt-3";
  }
  return (["shop-0", "shop-2", "diner", "house"] as const)[h % 4];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function heightFor(tier: Tier, score: number): number {
  if (tier === "tower") return clamp(9 + (score - TIER_THRESHOLDS.tower) / 40, 9, 16);
  if (tier === "mid") return clamp(4.6 + (score - TIER_THRESHOLDS.mid) / 30, 4.6, 7.6);
  return clamp(2.2 + score / 60, 2.2, 3.2);
}


/** All files under a node, depth first, sorted by path for determinism. */
export function collectFiles(node: FileNode): FileNode[] {
  if (node.type === "file") return [node];
  return (node.children ?? []).flatMap(collectFiles).sort((a, b) => a.path.localeCompare(b.path));
}

interface Group {
  name: string;
  path: string;
  files: FileNode[];
}

function groupDistricts(root: FileNode): Group[] {
  const groups: Group[] = [];
  const rootFiles: FileNode[] = [];
  for (const child of root.children ?? []) {
    if (child.type === "file") rootFiles.push(child);
    else {
      const files = collectFiles(child);
      if (files.length) groups.push(...splitGroup({ name: child.name, path: child.path, files }, child));
    }
  }
  if (rootFiles.length) groups.push(...chunk({ name: "root", path: "", files: rootFiles.sort((a, b) => a.path.localeCompare(b.path)) }));
  // Biggest districts first, then by name, so placement is stable.
  return groups.sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
}

/** Phase 3: split a folder with too many files into sub-folder districts (recursively). */
function splitGroup(g: Group, dir: FileNode): Group[] {
  if (g.files.length <= MAX_DISTRICT_FILES) return [g];
  const out: Group[] = [];
  const direct: FileNode[] = [];
  for (const c of dir.children ?? []) {
    if (c.type === "file") direct.push(c);
    else {
      const files = collectFiles(c);
      if (files.length) out.push(...splitGroup({ name: `${g.name}/${c.name}`, path: c.path, files }, c));
    }
  }
  if (direct.length) out.push(...chunk({ name: g.name, path: g.path, files: direct.sort((a, b) => a.path.localeCompare(b.path)) }));
  return out;
}

/** Phase 3: a flat folder with hundreds of files becomes several numbered districts. */
function chunk(g: Group): Group[] {
  if (g.files.length <= MAX_DISTRICT_FILES) return [g];
  const out: Group[] = [];
  for (let i = 0; i < g.files.length; i += MAX_DISTRICT_FILES) {
    out.push({ name: `${g.name} (${i / MAX_DISTRICT_FILES + 1})`, path: g.path, files: g.files.slice(i, i + MAX_DISTRICT_FILES) });
  }
  return out;
}

/** Phase 3: fold the smallest files into aggregated blocks so at most ~MAX_BUILDINGS are drawn. */
function aggregate(groups: Group[]): { groups: Group[]; aggregated: number } {
  const total = groups.reduce((a, g) => a + g.files.length, 0);
  if (total <= MAX_BUILDINGS) return { groups, aggregated: 0 };
  const keepN = Math.floor(MAX_BUILDINGS * 0.85);
  const ranked = groups.flatMap((g) => g.files).map((f) => ({ f, s: fileScore(f) }));
  ranked.sort((a, b) => b.s - a.s || a.f.path.localeCompare(b.f.path));
  const keep = new Set(ranked.slice(0, keepN).map((r) => r.f.path));
  let aggregated = 0;
  const out = groups.map((g) => {
    const kept = g.files.filter((f) => keep.has(f.path) || f.secret);
    const rest = g.files.filter((f) => !keep.has(f.path) && !f.secret);
    const blocks: FileNode[] = [];
    for (let i = 0; i < rest.length; i += BLOCK_SIZE) {
      const members = rest.slice(i, i + BLOCK_SIZE);
      const loc = members.reduce((a, f) => a + (f.loc ?? f.lines ?? 0), 0);
      blocks.push({
        name: `${members.length} small files`,
        path: `block:${g.name}:${i / BLOCK_SIZE + 1}`,
        type: "file",
        kind: "block",
        lines: loc,
        loc,
        importance: 0,
        language: "Mixed",
        description: `${members.length} small files grouped into one block so big repos stay smooth.`,
        members: members.map((f) => f.path),
      });
      aggregated += members.length;
    }
    return { ...g, files: [...kept, ...blocks] };
  });
  return { groups: out, aggregated };
}

type Sized = Group & { cols: number; rows: number; width: number; depth: number };
interface Acc {
  districts: District[];
  buildings: Building[];
  trees: Tree[];
  maxHeight: number;
  thresholds: { tower: number; mid: number };
}

const nearEdge = ROAD_WIDTH / 2 + SIDEWALK + 0.6;

function sizeGroup(g: Group): Sized {
  const n = g.files.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  return { ...g, cols, rows, width: cols * CELL + PLOT_PAD * 2, depth: rows * CELL + PLOT_PAD * 2 };
}

/** Place one district plot (Phase 1 rules) whose near edge faces a road running along x at z = roadZ. */
function placeDistrict(p: Sized, side: Side, left: number, roadZ: number, di: number, acc: Acc) {
  const cx = left + p.width / 2;
  const cz = roadZ + side * (nearEdge + p.depth / 2);
  acc.districts.push({
    name: p.name,
    path: p.path,
    side,
    x: cx,
    z: cz,
    width: p.width,
    depth: p.depth,
    color: DISTRICT_COLORS[di % DISTRICT_COLORS.length],
    fileCount: p.files.length,
  });

  // Highest score first; fill rows from the back of the plot so towers stand behind shops.
  const scored = p.files.map((f) => ({ f, s: fileScore(f) })).sort((a, b) => b.s - a.s || a.f.path.localeCompare(b.f.path));
  const used = new Set<number>();
  scored.forEach(({ f, s }, i) => {
    const rowFromBack = Math.floor(i / p.cols);
    const col = i % p.cols;
    used.add(rowFromBack * p.cols + col);
    const isVault = !!f.secret || f.kind === "secret";
    const tier: Tier = isVault || f.kind === "block" ? "shop" : tierFor(s, acc.thresholds);
    const style = styleFor(tier, f, heightFor(tier, s));
    const dims = PROTO_DIMS[style];
    acc.maxHeight = Math.max(acc.maxHeight, dims.height);
    const rowFromRoad = p.rows - 1 - rowFromBack;
    const dz = PLOT_PAD + rowFromRoad * CELL + CELL / 2;
    const color = isVault ? "#8c8c8c" : pick(PALETTE[tier], f.path);
    acc.buildings.push({
      id: f.path,
      name: f.name,
      path: f.path,
      district: p.name,
      tier,
      score: s,
      x: left + PLOT_PAD + col * CELL + CELL / 2,
      z: roadZ + side * (nearEdge + dz),
      width: dims.width,
      depth: dims.depth,
      height: dims.height,
      color,
      roofColor: shade(color, -0.28),
      accentColor: pick(ACCENTS, f.path + "#accent"),
      facing: (side === -1 ? 1 : -1) as 1 | -1,
      file: f,
      style,
    });
  });

  // Empty grid cells get a tree (cheap, instanced).
  for (let cell = 0; cell < p.rows * p.cols; cell++) {
    if (used.has(cell)) continue;
    const rowFromBack = Math.floor(cell / p.cols);
    const col = cell % p.cols;
    const rowFromRoad = p.rows - 1 - rowFromBack;
    acc.trees.push({
      x: left + PLOT_PAD + col * CELL + CELL / 2,
      z: roadZ + side * (nearEdge + PLOT_PAD + rowFromRoad * CELL + CELL / 2),
      scale: 0.9 + rand01(p.name + cell) * 0.35,
    });
  }
  // A short row of trees along the back edge of the plot.
  const backZ = roadZ + side * (nearEdge + p.depth + 1.6);
  for (let tx = left + 1.5; tx <= left + p.width - 1.5; tx += 4.5) {
    if (hash(p.name + Math.round(tx * 10)) % 3 === 0) continue;
    acc.trees.push({ x: tx, z: backZ, scale: 0.8 + rand01(p.name + tx) * 0.5 });
  }
}

export function buildCityLayout(root: FileNode): CityLayout {
  const agg = aggregate(groupDistricts(root));
  const sized = agg.groups.map(sizeGroup);
  const acc: Acc = {
    districts: [],
    buildings: [],
    trees: [],
    maxHeight: 0,
    thresholds: thresholdsFor(sized.flatMap((g) => g.files.filter((f) => !f.secret && f.kind !== "block").map(fileScore))),
  };

  // 1. Phase 1: assign each plot to the shorter side of one road.
  const run: Record<Side, number> = { [-1]: 0, [1]: 0 } as Record<Side, number>;
  const placed: (Sized & { side: Side; x0: number })[] = [];
  for (const g of sized) {
    const side: Side = run[-1] <= run[1] ? -1 : 1;
    const x0 = run[side] + (run[side] > 0 ? DISTRICT_GAP : 0);
    run[side] = x0 + g.width;
    placed.push({ ...g, side, x0 });
  }
  const longest = Math.max(run[-1], run[1]);
  if (longest > SINGLE_ROAD_MAX_RUN) return gridLayout(sized, acc, agg.aggregated);

  // 2. Centre each side's run on x = 0, then place buildings in each plot.
  placed.forEach((p, di) => placeDistrict(p, p.side, -run[p.side] / 2 + p.x0, 0, di, acc));
  const halfZ = Math.max(nearEdge, ...placed.map((p) => nearEdge + p.depth));

  // 3. One straight road with lamp posts evenly spaced on both sidewalks.
  const length = Math.ceil(longest + 18);
  const lamps = lampsAlongX(0, length);
  // Trees at both ends of the road.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      acc.trees.push({ x: sx * (length / 2 + 2), z: sz * (nearEdge + 2), scale: 1.2 });
      acc.trees.push({ x: sx * (length / 2 + 4.5), z: sz * (nearEdge + 6), scale: 1 });
    }
  }

  return {
    buildings: acc.buildings,
    districts: acc.districts,
    lamps: lamps.filter((l) => Math.abs(l.x) <= length / 2 - 2),
    trees: acc.trees,
    road: { length, width: ROAD_WIDTH, sidewalk: SIDEWALK },
    bounds: { halfX: length / 2 + 6, halfZ: halfZ + 3, maxHeight: acc.maxHeight },
    aggregatedFiles: agg.aggregated,
  };
}

/** Phase 1 lamp pattern for a road along x centred on x = 0. */
function lampsAlongX(roadZ: number, length: number, skip?: (x: number) => boolean): Lamp[] {
  const lamps: Lamp[] = [];
  const lampCount = Math.floor((length - 6) / LAMP_SPACING) + 1;
  const start = -((lampCount - 1) * LAMP_SPACING) / 2;
  const lampZ = ROAD_WIDTH / 2 + SIDEWALK * 0.55;
  for (let i = 0; i < lampCount; i++) {
    const x = start + i * LAMP_SPACING;
    if (!skip?.(x)) lamps.push({ x, z: roadZ - lampZ, armDir: 1 });
    if (!skip?.(x + LAMP_SPACING / 2)) lamps.push({ x: x + LAMP_SPACING / 2, z: roadZ + lampZ, armDir: -1 });
  }
  return lamps;
}

/**
 * Phase 3 grid mode: several parallel Phase 1 streets ("strips"), each with plots on both
 * sides, split into segments by plain cross streets. Worst-fit packing keeps it balanced.
 */
function gridLayout(sized: Sized[], acc: Acc, aggregated: number): CityLayout {
  const totalRun = sized.reduce((a, g) => a + g.width + DISTRICT_GAP, 0);
  let K = Math.max(1, Math.ceil(Math.sqrt((totalRun * 1.25) / (2 * SEGMENT))));
  let S = K;
  type Slot = { strip: number; side: Side; seg: number; used: number; items: Sized[] };
  let slots: Slot[] = [];
  const pack = (): boolean => {
    slots = [];
    for (let st = 0; st < S; st++) for (let k = 0; k < K; k++) for (const side of [-1, 1] as Side[]) slots.push({ strip: st, side, seg: k, used: 0, items: [] });
    for (const g of sized) {
      let best: Slot | null = null;
      for (const sl of slots) {
        const need = g.width + (sl.items.length ? DISTRICT_GAP : 0);
        if (sl.used + need <= SEGMENT && (!best || sl.used < best.used)) best = sl;
      }
      if (!best) return false;
      best.used += g.width + (best.items.length ? DISTRICT_GAP : 0);
      best.items.push(g);
    }
    return true;
  };
  while (!pack()) {
    if (S <= K) S++;
    else K++;
  }

  const width = K * (SEGMENT + CROSS) + CROSS;
  const segLeft = (k: number) => -width / 2 + CROSS + k * (SEGMENT + CROSS);
  const crossX = Array.from({ length: K + 1 }, (_, k) => -width / 2 + CROSS / 2 + k * (SEGMENT + CROSS));

  // Strip depths (north / south), then road z positions from top to bottom.
  const depthOf = (st: number, side: Side) => Math.max(10, ...slots.filter((s) => s.strip === st && s.side === side).flatMap((s) => s.items.map((i) => i.depth)));
  const STRIP_GAP = 6;
  const roadZs: number[] = [];
  let cursor = 0;
  for (let st = 0; st < S; st++) {
    const z = cursor + nearEdge + depthOf(st, -1);
    roadZs.push(z);
    cursor = z + nearEdge + depthOf(st, 1) + STRIP_GAP;
  }
  const totalZ = cursor - STRIP_GAP;
  const shiftZ = -totalZ / 2;
  for (let i = 0; i < roadZs.length; i++) roadZs[i] += shiftZ;
  const top = shiftZ - 2;
  const bottom = shiftZ + totalZ + 2;

  let di = 0;
  const parkTrees: Tree[] = [];
  for (const sl of slots) {
    let x = segLeft(sl.seg);
    for (const g of sl.items) {
      placeDistrict(g, sl.side, x, roadZs[sl.strip], di++, acc);
      x += g.width + DISTRICT_GAP;
    }
    // Leftover lot at the end of a segment: a small park of trees.
    const end = segLeft(sl.seg) + SEGMENT;
    const depth = depthOf(sl.strip, sl.side);
    for (let tx = x + 2.5; tx <= end - 2.5; tx += 5) {
      for (let dz = 3; dz <= depth - 2; dz += 5.5) {
        if (hash(`${sl.strip}:${sl.seg}:${tx}:${dz}`) % 4 === 0) continue;
        parkTrees.push({ x: tx, z: roadZs[sl.strip] + sl.side * (nearEdge + dz), scale: 0.85 + rand01(`${tx}|${dz}`) * 0.4 });
      }
    }
  }
  acc.trees.push(...parkTrees);

  // Plain roads: one per strip along x, plus cross streets along z. Same width and style as Phase 1.
  const streets: StreetRect[] = [];
  const lengthX = width;
  for (const z of roadZs) streets.push({ x: 0, z, sx: lengthX, sz: ROAD_WIDTH, axis: "x" });
  for (const x of crossX) streets.push({ x, z: (top + bottom) / 2, sx: ROAD_WIDTH, sz: bottom - top, axis: "z" });

  const nearCross = (x: number) => crossX.some((cx) => Math.abs(x - cx) < CROSS / 2 + 1);
  const lamps: Lamp[] = roadZs.flatMap((z) => lampsAlongX(z, lengthX, nearCross)).filter((l) => Math.abs(l.x) <= lengthX / 2 - 2);
  const nearRoadZ = (z: number) => roadZs.some((rz) => Math.abs(z - rz) < CROSS / 2 + 1);
  const lampX = ROAD_WIDTH / 2 + SIDEWALK * 0.55;
  for (const x of crossX) {
    for (let z = top + 4; z <= bottom - 4; z += LAMP_SPACING) {
      if (!nearRoadZ(z)) lamps.push({ x: x + lampX, z, armDir: -1, armAxis: "x" });
    }
  }

  const halfX = width / 2 + 6;
  const halfZ = Math.max(Math.abs(top), Math.abs(bottom)) + 3;
  return {
    buildings: acc.buildings,
    districts: acc.districts,
    lamps,
    trees: acc.trees,
    road: { length: lengthX, width: ROAD_WIDTH, sidewalk: SIDEWALK },
    bounds: { halfX, halfZ, maxHeight: acc.maxHeight },
    streets,
    aggregatedFiles: aggregated,
  };
}
