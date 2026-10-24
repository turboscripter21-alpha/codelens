/**
 * Block-grid city plan for the CodeCity engine (public/app/city/engine.js).
 *
 * Generalises the hand-placed layout of the demo city (user-design/codecity-demo-project/city.js)
 * so any repo works: every folder is a city block on a road grid with intersections, mixed
 * building tiers inside each block (towers next to offices next to shops, like a real city),
 * nested folders as sub-plots, parks / plazas in leftover space, a Vault per secrets file and
 * a Gateway at the east edge. Pure data and deterministic (hash-based, no AI, no randomness),
 * so it is unit-testable and renders the same city for the same repo every time.
 */
import type { FileKind, Project, ProjectFile } from "../types";
import { dict } from "../safeDict";

export const ROAD_HALF = 4; // RoadStraight default width 8
export const ARTERY_HALF = 7; // CommonPath width 14 (the demo's main artery)
export const APRON = 7; // half-size of an intersection tile incl. crosswalks
export const LOT_W = 9;
export const LOT_D = 9;
export const FOOT = 3.2; // footpath between back-to-back lot rows
export const MARGIN = 2.2; // pad edge to first lot
export const MIN_CELL = 22;
export const PAD = 0.25; // district pad height
export const SUB = 0.06; // sub-plot pad height
export const MAX_BUILDINGS = 700;
export const EXIT_LEN = 44;

export type PlanTier = "tall" | "medium" | "small" | "vault";
export type HealthLevel = "good" | "warn" | "bad";
const HEALTH_RANK: Record<HealthLevel, number> = { good: 0, warn: 1, bad: 2 };
function worstHealth(files: ProjectFile[]): HealthLevel | undefined {
  let w: HealthLevel | undefined;
  for (const f of files) { const lv = f.health?.lv; if (lv && (!w || HEALTH_RANK[lv] > HEALTH_RANK[w])) w = lv; }
  return w;
}
export type ModuleType = "core" | "utility" | "api" | "data" | "ui" | "config" | "test";

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Pt { x: number; z: number }

export interface PlanBuilding {
  /** File path, or "block:<dir>:<n>" for an aggregated block of small files. */
  id: string;
  name: string;
  dir: string;
  district: number;
  tier: PlanTier;
  /** Factory key the engine maps to a lib/ component. */
  comp: "tall" | "skyscraper" | "office" | "apartment" | "office-block" | "apartment-block" | "shop" | "house" | "diner" | "vault";
  /** Plain options for the factory (seed, importance, size, scheme...). */
  opts: Record<string, number | string | boolean>;
  x: number;
  z: number;
  /** 0 faces +z (south), PI faces -z (north), like the demo. */
  ry: number;
  y: number;
  lot: { w: number; d: number };
  moduleType: ModuleType;
  language: string;
  /** Code health level (code files; blocks take their worst member). */
  health?: HealthLevel;
  score: number;
  members?: string[];
  /** Door on the sidewalk / footpath in front, plus the walk to the street. */
  door: Pt;
  walk: Pt[];
  /** Where the walk joins the road graph: a point on the edge between two grid nodes. */
  attach: { pt: Pt; ends: [number, number] };
}

export interface PlanDistrict {
  key: string;
  label: string;
  kind: "district" | "park";
  cell: { c: number; r: number };
  pad: Rect;
  buildings: number[];
  subplots: (Rect & { label?: string; y: number })[];
  greens: Rect[];
  plaza?: Pt;
  footpaths: { z: number; x0: number; x1: number }[];
}

export interface CityPlan {
  name: string;
  XL: number[];
  ZL: number[];
  /** Grid nodes: XL x ZL (id = r * XL.length + c), plus the exit node beyond the Gateway. */
  nodes: Pt[];
  edges: [number, number][];
  exitNode: number;
  artery: { z: number; x0: number; x1: number; line: number; c0: number; c1: number } | null;
  gateway: { x: number; z: number; exitEnd: number };
  bounds: Rect;
  districts: PlanDistrict[];
  buildings: PlanBuilding[];
  lamps: { x: number; z: number; ry: number }[];
  trees: { x: number; z: number; variant: "round" | "cone" | "tall"; seed: number }[];
  links: { from: string; to: string; kind: string }[];
  fileToBuilding: Record<string, string>;
  stats: { files: number; buildings: number; aggregatedFiles: number; districts: number };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const KIND_MODULE: Record<FileKind, ModuleType> = {
  core: "core", ui: "ui", hook: "utility", util: "utility", style: "ui", test: "test", config: "config",
  docs: "config", ci: "config", markup: "ui", asset: "ui", secret: "config", block: "config",
};
const API_RE = /(^|\/)(api|apis|server|routes?|services?|client|http|fetch|graphql|rpc)(\/|\.|$)/i;
const DATA_RE = /(^|\/)(db|database|models?|schema|migrations?|prisma|store|data)(\/|\.|$)/i;

const MODULE_TYPES = new Set(["core", "utility", "api", "data", "ui", "config", "test"]);
export function moduleTypeOf(f: Pick<ProjectFile, "path" | "kind" | "moduleType">): ModuleType {
  if (f.moduleType && MODULE_TYPES.has(f.moduleType)) return f.moduleType as ModuleType;
  const m = KIND_MODULE[f.kind] ?? "utility";
  if (m === "utility" || m === "core") {
    if (API_RE.test(f.path)) return "api";
    if (DATA_RE.test(f.path)) return "data";
  }
  return m;
}

export function languageKey(language: string, path: string): string {
  const l = language.toLowerCase();
  if (l.startsWith("typescript") || /\.(ts|tsx|mts|cts)$/.test(path)) return "ts";
  if (l.startsWith("javascript") || /\.(js|jsx|mjs|cjs)$/.test(path)) return "js";
  if (l === "python" || path.endsWith(".py")) return "py";
  if (["css", "scss", "sass", "less"].includes(l)) return "css";
  if (l === "json" || path.endsWith(".json")) return "json";
  return "other";
}

const KIND_WEIGHT: Partial<Record<FileKind, number>> = { core: 1.6, hook: 1.1, util: 1.0, ui: 1.0, style: 0.6, test: 0.6, config: 0.5, docs: 0.4, ci: 0.6, markup: 0.7, asset: 0.3 };

export function scoreOf(f: ProjectFile): number {
  if (f.secret) return 0;
  if (f.lockfile) return Math.min(40, Math.round((f.lines || 0) * 0.01)); // generated, not code
  const lines = f.loc || f.lines || (f.binary ? 4 : 0);
  return Math.round(lines * (KIND_WEIGHT[f.kind] ?? 0.8) + 18 * Math.min(f.usedBy.length, 40));
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Tier thresholds: the demo's absolute values for small repos, percentiles for big ones. */
export function tiersFor(scores: number[]): { tall: number; medium: number } {
  const s = [...scores].sort((a, b) => a - b);
  return { tall: Math.max(150, percentile(s, 0.93)), medium: Math.max(55, percentile(s, 0.7)) };
}

interface Item {
  id: string;
  name: string;
  dir: string;
  file?: ProjectFile;
  members?: string[];
  score: number;
  tier: PlanTier;
  moduleType: ModuleType;
  language: string;
  health?: HealthLevel;
}

/** Above MAX_BUILDINGS, the smallest files of each folder are merged into "block" buildings. */
function aggregate(files: ProjectFile[], max: number): { items: Item[]; aggregated: number; memberOf: Record<string, string> } {
  const scored = files.map((f) => ({ f, s: scoreOf(f) }));
  const memberOf = dict<string>();
  let keep = scored;
  let rest: typeof scored = [];
  let chunk = 30;
  let depth = 99;
  const cut = (dir: string) => (dir ? dir.split("/").slice(0, depth).join("/") : "");
  if (files.length > max) {
    const order = [...scored].sort((a, b) => b.s - a.s || (a.f.path < b.f.path ? -1 : 1));
    // Keep the top files as their own buildings; the rest become per-folder blocks of up to
    // `chunk` files. Shrink the budget (then grow the chunk) until the total fits under max.
    const blocksFor = (list: typeof scored, size: number) => {
      const per = new Map<string, number>();
      for (const e of list) { const d = cut(e.f.dir); per.set(d, (per.get(d) || 0) + 1); }
      let n = 0;
      for (const c of per.values()) n += Math.ceil(c / size);
      return n;
    };
    let budget = Math.floor(max * 0.85);
    for (;;) {
      keep = [];
      rest = [];
      for (const e of order) (e.f.secret || keep.length < budget ? keep : rest).push(e);
      if (keep.length + blocksFor(rest, chunk) <= max || budget <= max * 0.4) break;
      budget = Math.floor(budget * 0.92);
    }
    while (keep.length + blocksFor(rest, chunk) > max && chunk < 2000) chunk = Math.ceil(chunk * 1.5);
    // Very many folders: group the leftovers by a shallower ancestor folder instead.
    while (keep.length + blocksFor(rest, chunk) > max && depth > 0) depth--;
  }
  const th = tiersFor(keep.map((k) => k.s));
  const items: Item[] = keep.map(({ f, s }) => ({
    id: f.path,
    name: f.name,
    dir: f.dir,
    file: f,
    score: s,
    tier: f.secret ? "vault" : s >= th.tall ? "tall" : s >= th.medium ? "medium" : "small",
    moduleType: moduleTypeOf(f),
    language: languageKey(f.language, f.path),
    health: f.health?.lv,
  }));
  const byDir = new Map<string, ProjectFile[]>();
  for (const { f } of rest) {
    const d = cut(f.dir);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d)!.push(f);
  }
  for (const [dir, list] of [...byDir.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => (a.path < b.path ? -1 : 1));
    for (let i = 0; i < list.length; i += chunk) {
      const part = list.slice(i, i + chunk);
      const id = `block:${dir}:${i / chunk + 1}`;
      part.forEach((m) => (memberOf[m.path] = id));
      items.push({
        id,
        name: `${part.length} small files`,
        dir,
        members: part.map((m) => m.path),
        score: 0,
        tier: "small",
        moduleType: "config",
        language: "other",
        health: worstHealth(part),
      });
    }
  }
  return { items, aggregated: rest.length, memberOf };
}

interface Group { key: string; label: string; items: Item[]; root?: boolean }

/** Folders -> districts: every folder that directly holds files is exactly one district (a big
    folder is just a bigger district, never split into parts); folders holding only sub-folders get
    none. The files at the repo root are the city hall district. */
function districtsOf(items: Item[]): Group[] {
  const by = new Map<string, Item[]>();
  for (const it of items) {
    if (!by.has(it.dir)) by.set(it.dir, []);
    by.get(it.dir)!.push(it);
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, list]) =>
    k === "" ? { key: "", label: "root files · city hall", items: list, root: true } : { key: k, label: k + "/", items: list });
}

type Slot = { kind: "b"; item: Item } | { kind: "green" } | { kind: "plaza" };
interface BlockShape { cols: number; rows: number; w: number; d: number; slots: Slot[] }

/** One folder's block: lots in back-to-back row pairs, tiers interleaved so towers are spread out;
    a big folder grows into a bigger, roughly rectangular block. */
function shapeBlock(g: Group, opts: { parks: boolean; plazas: boolean }): BlockShape {
  const list = [...g.items].sort((a, b) => hash(a.id) - hash(b.id));
  const big = list.filter((i) => i.tier === "tall" || i.tier === "medium");
  const small = list.filter((i) => i.tier !== "tall" && i.tier !== "medium");
  const mixed: Item[] = [];
  while (big.length || small.length) {
    if (small.length) mixed.push(small.shift()!);
    if (big.length) mixed.push(big.shift()!);
    if (small.length && hash(g.key + mixed.length) % 2) mixed.push(small.shift()!);
  }
  const slots: Slot[] = mixed.map((item) => ({ kind: "b", item }));
  const n = slots.length;
  const greens = opts.parks && n >= 3 ? Math.max(1, Math.floor(n * 0.16)) : 0;
  for (let i = 0; i < greens; i++) slots.splice(hash(g.key + ":g" + i) % (slots.length + 1), 0, { kind: "green" });
  const total = slots.length + (opts.plazas && n >= 6 ? 1 : 0);
  const cols = Math.max(1, Math.min(24, total <= 3 ? total : Math.ceil(Math.sqrt(total * 1.7))));
  const rows = Math.max(1, Math.ceil(total / cols));
  if (total > slots.length) slots.splice(Math.min(slots.length, Math.floor((rows - 1) / 2) * cols + Math.floor(cols / 2)), 0, { kind: "plaza" });
  const pairs = Math.ceil(rows / 2);
  return { cols, rows, slots, w: cols * LOT_W + 2 * MARGIN, d: rows * LOT_D + (pairs - 1) * FOOT + 2 * MARGIN };
}

type Fac = Pick<PlanBuilding, "comp" | "opts">;
const pick = (arr: Fac[], h: number): Fac => arr[h % arr.length];

function factoryFor(it: Item, rank: number): Pick<PlanBuilding, "comp" | "opts"> {
  const h = hash(it.id);
  const seed = (h % 97) + 1;
  if (it.tier === "vault") return { comp: "vault", opts: {} };
  if (it.members) return { comp: "house", opts: { seed } };
  if (it.tier === "tall") {
    const importance = Math.min(0.95, 0.25 + 0.7 * rank);
    return h % 4 === 3
      ? { comp: "skyscraper", opts: { floors: Math.round(10 + importance * 12), width: 7, depth: 7, tiers: 3, seed } }
      : { comp: "tall", opts: { importance, width: 7.4, depth: 7.4, seed } };
  }
  if (it.tier === "medium") {
    const size = Math.min(1, 0.1 + 0.9 * rank);
    return pick(
      [
        { comp: "office", opts: { size, width: 8.4, depth: 7.6, seed } },
        { comp: "apartment", opts: { size, width: 7.4, depth: 6.8, seed } },
        { comp: "office-block", opts: { floors: 2 + Math.round(size * 2), width: 8.4, depth: 7.4, seed } },
        { comp: "apartment-block", opts: { floors: 3 + Math.round(size * 2), width: 7.4, depth: 6.8, seed } },
      ],
      h,
    );
  }
  return pick(
    [
      { comp: "shop", opts: { scheme: h % 4, seed } },
      { comp: "shop", opts: { scheme: (h >>> 3) % 4, width: 5.6, seed } },
      { comp: "house", opts: { seed } },
      { comp: "diner", opts: { width: 7.6, depth: 6, height: 3.6 } },
    ],
    h >>> 2,
  );
}

export interface PlanOptions {
  parks?: boolean;
  plazas?: boolean;
  glowArtery?: boolean;
  gateway?: boolean;
  maxBuildings?: number;
}

export function planCity(project: Pick<Project, "name" | "files">, o: PlanOptions = {}): CityPlan {
  const opts = { parks: o.parks !== false, plazas: o.plazas !== false };
  const { items, aggregated, memberOf } = aggregate(project.files, o.maxBuildings ?? MAX_BUILDINGS);
  // Rank inside each tier (0..1) drives floors / size.
  for (const t of ["tall", "medium"] as const) {
    const list = items.filter((i) => i.tier === t).sort((a, b) => a.score - b.score);
    list.forEach((it, i) => ((it as Item & { rank?: number }).rank = list.length > 1 ? i / (list.length - 1) : 0.6));
  }
  const groups = districtsOf(items);
  const shapes = groups.map((g) => shapeBlock(g, opts));

  // ---- grid of cells, biggest district in the centre, root files by the Gateway (east)
  const D = groups.length;
  const C = Math.max(1, Math.ceil(Math.sqrt(D * 1.25)));
  const R = Math.max(1, Math.ceil(D / C));
  const cells: { c: number; r: number }[] = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.push({ c, r });
  const cr = (R - 1) / 2;
  // Districts in folder-path order (a parent, then its sub-folders, siblings together) laid along a
  // serpentine walk of the grid, so each folder's sub-folder districts sit next to it and each other.
  const snake = [...cells].sort((a, b) => a.r - b.r || (a.r % 2 ? b.c - a.c : a.c - b.c));
  const order = groups.map((_, i) => i).sort((a, b) => groups[b].items.length - groups[a].items.length || (groups[a].key < groups[b].key ? -1 : 1));
  const cellOf: { c: number; r: number }[] = new Array(D);
  const rootIdx = groups.findIndex((g) => g.root);
  const free = [...snake];
  if (rootIdx >= 0 && C > 1) {
    // City hall plaza: east edge, middle row.
    const east = free.filter((x) => x.c === C - 1).sort((a, b) => Math.abs(a.r - cr) - Math.abs(b.r - cr))[0];
    cellOf[rootIdx] = east;
    free.splice(free.indexOf(east), 1);
  }
  for (const i of groups.map((_, k) => k)) if (!cellOf[i]) cellOf[i] = free.shift()!;
  const parkCells = free; // leftover cells become parks

  const downtown = order[0];
  const dc = cellOf[downtown];
  const arteryLine = R === 1 ? 1 : dc.r + 1 < R ? dc.r + 1 : dc.r; // a ZL index
  const isArt = (line: number, c: number) => o.glowArtery !== false && line === arteryLine && c === dc.c;
  const arteryRows = new Set([arteryLine - 1, arteryLine].filter((r) => r >= 0 && r < R));

  const minCell = D > 60 ? 14 : MIN_CELL; // many tiny folders: tighter cells
  const colW = new Array(C).fill(minCell);
  const rowD = new Array(R).fill(minCell);
  groups.forEach((_, i) => {
    const { c, r } = cellOf[i];
    colW[c] = Math.max(colW[c], shapes[i].w);
    rowD[r] = Math.max(rowD[r], shapes[i].d);
  });
  for (const r of arteryRows) if (o.glowArtery !== false) rowD[r] += ARTERY_HALF - ROAD_HALF;
  const XL = [0];
  for (let c = 0; c < C; c++) XL.push(XL[c] + ROAD_HALF * 2 + colW[c]);
  const ZL = [0];
  for (let r = 0; r < R; r++) ZL.push(ZL[r] + ROAD_HALF * 2 + rowD[r]);
  const ox = XL[C] / 2, oz = ZL[arteryLine] ?? ZL[R] / 2;
  for (let i = 0; i < XL.length; i++) XL[i] = +(XL[i] - ox).toFixed(2);
  for (let i = 0; i < ZL.length; i++) ZL[i] = +(ZL[i] - oz).toFixed(2);

  const nid = (c: number, r: number) => r * (C + 1) + c;
  const nodes: Pt[] = [];
  for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) nodes.push({ x: XL[c], z: ZL[r] });
  const edges: [number, number][] = [];
  for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) edges.push([nid(c, r), nid(c + 1, r)]);
  for (let c = 0; c <= C; c++) for (let r = 0; r < R; r++) edges.push([nid(c, r), nid(c, r + 1)]);
  const gwZ = ZL[arteryLine];
  const exitNode = nodes.length;
  nodes.push({ x: XL[C] + EXIT_LEN, z: gwZ });
  if (o.gateway !== false) edges.push([nid(C, arteryLine), exitNode]);

  const padOf = (c: number, r: number): Rect => ({
    x0: XL[c] + ROAD_HALF,
    x1: XL[c + 1] - ROAD_HALF,
    z0: ZL[r] + (isArt(r, c) ? ARTERY_HALF : ROAD_HALF),
    z1: ZL[r + 1] - (isArt(r + 1, c) ? ARTERY_HALF : ROAD_HALF),
  });

  const districts: PlanDistrict[] = [];
  const buildings: PlanBuilding[] = [];
  groups.forEach((g, di) => {
    const { c, r } = cellOf[di];
    const pad = padOf(c, r);
    const s = shapes[di];
    const lx0 = (pad.x0 + pad.x1) / 2 - s.w / 2 + MARGIN;
    const lz0 = (pad.z0 + pad.z1) / 2 - s.d / 2 + MARGIN;
    const rowZ = (row: number) => lz0 + row * LOT_D + Math.floor(row / 2) * FOOT + LOT_D / 2;
    const footZ = (pair: number) => lz0 + (pair * 2) * LOT_D + (pair - 1) * FOOT + FOOT / 2; // between pair-1 and pair
    const d: PlanDistrict = { key: g.key, label: g.label, kind: "district", cell: { c, r }, pad, buildings: [], subplots: [], greens: [], footpaths: [] };
    const pairs = Math.ceil(s.rows / 2);
    for (let p = 1; p < pairs; p++) d.footpaths.push({ z: +footZ(p).toFixed(2), x0: pad.x0 + 0.8, x1: pad.x1 - 0.8 });
    s.slots.forEach((slot, k) => {
      const row = Math.floor(k / s.cols), col = k % s.cols;
      const x = lx0 + col * LOT_W + LOT_W / 2, z = rowZ(row);
      if (slot.kind === "green") {
        d.greens.push({ x0: x - LOT_W / 2 + 0.5, x1: x + LOT_W / 2 - 0.5, z0: z - LOT_D / 2 + 0.5, z1: z + LOT_D / 2 - 0.5 });
        return;
      }
      if (slot.kind === "plaza") {
        d.plaza = { x, z };
        return;
      }
      const it = slot.item;
      const north = row % 2 === 0; // even rows face north (-z), odd rows face south (+z)
      const ry = north ? Math.PI : 0;
      const frontZ = north ? z - LOT_D / 2 : z + LOT_D / 2;
      const pair = Math.floor(row / 2);
      // The street this row faces: a road (top / bottom of the block) or a footpath between pairs.
      let walk: Pt[];
      let attach: PlanBuilding["attach"];
      const door = { x: +x.toFixed(2), z: +(frontZ + (north ? -0.3 : 0.3)).toFixed(2) };
      const facesRoadTop = north && pair === 0;
      const facesRoadBottom = !north && pair === pairs - 1;
      if (facesRoadTop || facesRoadBottom || (north && s.rows === 1)) {
        const line = facesRoadBottom ? r + 1 : r;
        walk = [door, { x: door.x, z: facesRoadBottom ? pad.z1 + 0.6 : pad.z0 - 0.6 }];
        attach = { pt: { x: door.x, z: ZL[line] }, ends: [nid(c, line), nid(c + 1, line)] };
      } else {
        const fz = north ? footZ(pair) : footZ(pair + 1);
        const west = door.x - pad.x0 < pad.x1 - door.x;
        const ex = west ? pad.x0 - 0.6 : pad.x1 + 0.6;
        walk = [door, { x: door.x, z: +fz.toFixed(2) }, { x: ex, z: +fz.toFixed(2) }];
        const col2 = west ? c : c + 1;
        attach = { pt: { x: XL[col2], z: +fz.toFixed(2) }, ends: [nid(col2, r), nid(col2, r + 1)] };
      }
      const rank = (it as Item & { rank?: number }).rank ?? 0.5;
      const f = factoryFor(it, rank);
      const y = PAD;
      const b: PlanBuilding = {
        id: it.id,
        name: it.name,
        dir: it.dir,
        district: di,
        tier: it.tier,
        ...f,
        x: +x.toFixed(2),
        z: +z.toFixed(2),
        ry,
        y,
        lot: { w: LOT_W - 0.8, d: LOT_D - 0.8 },
        moduleType: it.moduleType,
        language: it.language,
        health: it.health,
        score: it.score,
        members: it.members,
        door,
        walk,
        attach,
      };
      d.buildings.push(buildings.length);
      buildings.push(b);
    });
    // Leftover pad around the lots: grass strips with trees (parks flag).
    if (opts.parks) {
      const lx1 = lx0 + s.cols * LOT_W, lz1 = lz0 + s.rows * LOT_D + (pairs - 1) * FOOT;
      if (lx0 - pad.x0 > 7) d.greens.push({ x0: pad.x0 + 1, x1: lx0 - 1, z0: pad.z0 + 1, z1: pad.z1 - 1 });
      if (pad.x1 - lx1 > 7) d.greens.push({ x0: lx1 + 1, x1: pad.x1 - 1, z0: pad.z0 + 1, z1: pad.z1 - 1 });
      if (lz0 - pad.z0 > 7) d.greens.push({ x0: Math.max(pad.x0 + 1, lx0), x1: Math.min(pad.x1 - 1, lx1), z0: pad.z0 + 1, z1: lz0 - 1 });
      if (pad.z1 - lz1 > 7) d.greens.push({ x0: Math.max(pad.x0 + 1, lx0), x1: Math.min(pad.x1 - 1, lx1), z0: lz1 + 1, z1: pad.z1 - 1 });
    }
    districts.push(d);
  });
  for (const cell of parkCells) {
    districts.push({ key: `park:${cell.c},${cell.r}`, label: "park", kind: "park", cell, pad: padOf(cell.c, cell.r), buildings: [], subplots: [], greens: [], footpaths: [] });
  }

  // ---- lamps along every street, trees around the city
  const lamps: CityPlan["lamps"] = [];
  const lampStep = 16;
  const sparse = D > 150; // hundreds of small folder districts: lamps on every other street segment keep the triangle budget
  for (let r = 0; r <= R; r++)
    for (let c = 0; c < C; c++) {
      if (sparse && (r + c) % 2) continue;
      const half = isArt(r, c) ? ARTERY_HALF : ROAD_HALF;
      const a = XL[c] + APRON + 3, b = XL[c + 1] - APRON - 3;
      for (let x = a; x <= b; x += lampStep) {
        if (r > 0) lamps.push({ x: +x.toFixed(2), z: ZL[r] - half - 0.5, ry: 0 });
        if (r < R) lamps.push({ x: +(x + lampStep / 2 > b ? x : x + lampStep / 2).toFixed(2), z: ZL[r] + half + 0.5, ry: Math.PI });
      }
    }
  for (let c = 0; c <= C; c++)
    for (let r = 0; r < R; r++) {
      if (sparse && (r + c) % 2 === 0) continue;
      const a = ZL[r] + APRON + 3, b = ZL[r + 1] - APRON - 3;
      for (let z = a; z <= b; z += lampStep + 2) {
        if (c > 0) lamps.push({ x: XL[c] - ROAD_HALF - 0.5, z: +z.toFixed(2), ry: -Math.PI / 2 });
        if (c < C) lamps.push({ x: XL[c] + ROAD_HALF + 0.5, z: +(z + lampStep / 2 + 1 > b ? z : z + lampStep / 2 + 1).toFixed(2), ry: Math.PI / 2 });
      }
    }
  const bounds: Rect = { x0: XL[0] - 12, x1: XL[C] + (o.gateway !== false ? EXIT_LEN : 12), z0: ZL[0] - 12, z1: ZL[R] + 12 };
  const trees: CityPlan["trees"] = [];
  const V = ["round", "cone", "tall"] as const;
  for (let x = XL[0] - 6; x <= XL[C] + 6; x += 11) {
    trees.push({ x: +(x + 2).toFixed(2), z: ZL[0] - 11, variant: V[hash("tn" + x) % 3], seed: hash("a" + x) % 200 });
    trees.push({ x: +(x - 3).toFixed(2), z: ZL[R] + 11, variant: V[hash("ts" + x) % 3], seed: hash("b" + x) % 200 });
  }
  for (let z = ZL[0]; z <= ZL[R]; z += 12) {
    trees.push({ x: XL[0] - 11, z: +z.toFixed(2), variant: "cone", seed: hash("w" + z) % 200 });
    if (Math.abs(z - gwZ) > 10) trees.push({ x: XL[C] + 11, z: +z.toFixed(2), variant: "round", seed: hash("e" + z) % 200 });
  }

  // ---- links between buildings (imports), for traffic and connection lines
  const fileToBuilding = dict<string>();
  for (const b of buildings) {
    if (b.members) b.members.forEach((m) => (fileToBuilding[m] = b.id));
    else fileToBuilding[b.id] = b.id;
  }
  for (const [p, id] of Object.entries(memberOf)) fileToBuilding[p] = id;
  const seen = new Set<string>();
  const links: CityPlan["links"] = [];
  for (const f of project.files)
    for (const u of f.uses) {
      const a = fileToBuilding[f.path], b = fileToBuilding[u];
      if (!a || !b || a === b) continue;
      const k = a + ">" + b;
      if (seen.has(k)) continue;
      seen.add(k);
      links.push({ from: a, to: b, kind: "import" });
    }

  return {
    name: project.name,
    XL,
    ZL,
    nodes,
    edges,
    exitNode,
    artery: o.glowArtery !== false ? { z: ZL[arteryLine], x0: XL[dc.c] + APRON, x1: XL[dc.c + 1] - APRON, line: arteryLine, c0: dc.c, c1: dc.c + 1 } : null,
    gateway: { x: XL[C] + 18, z: gwZ, exitEnd: XL[C] + EXIT_LEN },
    bounds,
    districts,
    buildings,
    lamps,
    trees,
    links,
    fileToBuilding,
    stats: { files: project.files.length, buildings: buildings.length, aggregatedFiles: aggregated, districts: groups.length },
  };
}
