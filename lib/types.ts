/** Shared types for CodeLens. Plain data only, so lib/ stays pure and unit-testable. */

export type FileKind =
  | "core"
  | "ui"
  | "hook"
  | "util"
  | "style"
  | "test"
  | "config"
  | "docs"
  | "ci"
  | "markup"
  | "asset"
  // Phase 2+: secret files (Vault buildings, contents never read) and aggregated blocks of small files.
  | "secret"
  | "block";

export interface FileNode {
  name: string;
  /** Path from the repo root, using "/" separators. */
  path: string;
  type: "file" | "dir";
  /** Line count for text files. 0 for binary files. */
  lines?: number;
  /** Size in bytes (placeholder in Phase 1). */
  bytes?: number;
  language?: string;
  kind?: FileKind;
  /** Placeholder description. Phase 2 replaces this with a real AI explanation. */
  description?: string;
  /** Placeholder dependency lists (paths). */
  uses?: string[];
  usedBy?: string[];
  children?: FileNode[];
  // ---- Phase 2+ (optional, filled from the analyzer) ----
  /** Non-blank lines. When set, it drives building size instead of `lines`. */
  loc?: number;
  langColor?: string;
  secret?: boolean;
  binary?: boolean;
  lockfile?: boolean;
  /** LOC estimated from size (contents not read). */
  estimated?: boolean;
  /** Analyzer importance score (LOC + in-degree). */
  importance?: number;
  /** For an aggregated block: the file paths it stands for. */
  members?: string[];
}

export interface ProjectInfo {
  name: string;
  root: FileNode;
}

export type Tier = "tower" | "mid" | "shop";

/** Which side of the road a district sits on. -1 = north (z < 0), 1 = south (z > 0). */
export type Side = -1 | 1;

export interface Building {
  id: string; // = file path
  name: string;
  path: string;
  district: string;
  tier: Tier;
  score: number;
  /** Centre of the footprint on the ground. */
  x: number;
  z: number;
  width: number; // along x
  depth: number; // along z
  height: number;
  color: string;
  roofColor: string;
  accentColor: string;
  /** +1 if the road-facing wall is +z, -1 if it is -z. */
  facing: 1 | -1;
  file: FileNode;
  /** Phase 3: kit prototype key (see components/city/prototypes.ts and lib/city/protoDims.ts). */
  style?: string;
}

export interface District {
  name: string;
  path: string;
  side: Side;
  /** Centre of the plot. */
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  fileCount: number;
}

export interface Lamp {
  x: number;
  z: number;
  /** Direction the lamp arm points (towards the road centre), +1 or -1 on z. */
  armDir: 1 | -1;
  /** Phase 3: lamps on cross streets point along x. Default "z" (Phase 1). */
  armAxis?: "x" | "z";
}

export interface Tree {
  x: number;
  z: number;
  scale: number;
}

export interface CityLayout {
  buildings: Building[];
  districts: District[];
  lamps: Lamp[];
  trees: Tree[];
  road: { length: number; width: number; sidewalk: number };
  /** Half extents of everything that was placed, for camera and shadow fitting. */
  bounds: { halfX: number; halfZ: number; maxHeight: number };
  /** Phase 3 grid mode: extra roads (parallel avenues and cross streets). Absent for the single-road layout. */
  streets?: StreetRect[];
  /** Files folded into aggregated blocks because of the render cap. */
  aggregatedFiles?: number;
}

export interface StreetRect {
  x: number;
  z: number;
  sx: number;
  sz: number;
  axis: "x" | "z";
}

export type ImportSource =
  | { kind: "github"; owner: string; repo: string; url: string }
  // Phase 2: the picked File objects ride along so the browser can read them (never uploaded).
  | { kind: "zip"; name: string; bytes: number; file?: File }
  | { kind: "folder"; name: string; fileCount: number; files?: { file: File; path: string }[] };

// ---------------------------------------------------------------------------
// Phase 2: analyzed project model (shared by the API route and the browser).
// ---------------------------------------------------------------------------

/** One analyzed file. Contents are never part of this object (see Project.previews). */
export interface ProjectFile {
  path: string;
  name: string;
  dir: string;
  language: string;
  langColor: string;
  kind: FileKind;
  bytes: number;
  /** Non-blank lines (0 for binaries, secrets and lockfiles). */
  loc: number;
  /** All lines, including blank ones. */
  lines: number;
  binary: boolean;
  secret: boolean;
  lockfile: boolean;
  estimated: boolean;
  uses: string[];
  usedBy: string[];
  importance: number;
  /** Optional human description (sample project only in Phase 2). */
  description?: string;
  /** Optional module type override (core, ui, api, utility, data, config, test): the prototype sample sets it. */
  moduleType?: string;
}

export type ProjectSource =
  | { kind: "github"; owner: string; repo: string; branch: string; url: string }
  | { kind: "zip"; name: string }
  | { kind: "folder"; name: string }
  | { kind: "sample"; name: string };

export interface LanguageStat {
  language: string;
  color: string;
  files: number;
  loc: number;
  /** Share of total LOC, 0..100. */
  pct: number;
}

export interface ProjectStats {
  totalLoc: number;
  totalLines: number;
  totalBytes: number;
  filesCounted: number;
  filesSkipped: number;
  skipped: Partial<Record<string, number>>;
  /** Up to 5 example paths per skip reason ("X files skipped: reasons" summary). */
  skippedExamples?: Record<string, string[]>;
  secrets: number;
  binaries: number;
  languages: LanguageStat[];
  largest: { path: string; loc: number; bytes: number }[];
  imports: number;
}

export interface Project {
  name: string;
  source: ProjectSource;
  files: ProjectFile[];
  /** path -> first lines (capped). Missing GitHub previews are fetched on demand. */
  previews: Record<string, string>;
  stats: ProjectStats;
  warnings: string[];
  createdAt: number;
}

export interface ImportProgress {
  stage: "repo" | "tree" | "download" | "read" | "analyze" | "city";
  detail?: string;
  ratio?: number;
}
