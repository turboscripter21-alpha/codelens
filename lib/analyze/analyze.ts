/**
 * The shared, pure analyzer: SourceEntry[] in, typed Project out.
 * Runs on the server (GitHub import) and in the browser (zip / folder), and in tests.
 */
import type { Project, ProjectFile, ProjectSource } from "../types";
import { computeStats } from "./stats";
export { computeStats };
import type { SourceEntry } from "./collect";
import { BINARY_LANG, SECRET_LANG, detectLanguage } from "./language";
import { CAPS, isLockfile } from "./rules";
import { kindFromPath } from "./kind";
import { extractImports, importLangFor, resolveImport } from "./imports";
import { dict } from "../safeDict";

export interface AnalyzeOptions {
  name: string;
  source: ProjectSource;
  skipped?: Record<string, number>;
  warnings?: string[];
  /** Total bytes of preview text to keep (most important files first). */
  previewBudget?: number;
  onProgress?: (done: number, total: number) => void;
}

export function countLines(text: string): { lines: number; loc: number } {
  if (!text) return { lines: 0, loc: 0 };
  let lines = 0;
  let loc = 0;
  let blank = true;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) {
      lines++;
      if (!blank) loc++;
      blank = true;
    } else if (blank && c !== 32 && c !== 9 && c !== 13) blank = false;
  }
  if (text.charCodeAt(text.length - 1) !== 10) {
    lines++;
    if (!blank) loc++;
  }
  return { lines, loc };
}

/** First CAPS.previewLines lines / CAPS.previewBytes bytes. */
export function previewOf(text: string): string {
  let end = Math.min(text.length, CAPS.previewBytes);
  let n = 0;
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10 && ++n >= CAPS.previewLines) {
      end = i;
      break;
    }
  }
  return text.slice(0, end);
}

export function importanceOf(f: Pick<ProjectFile, "loc" | "bytes" | "kind" | "binary" | "secret">, inDegree: number): number {
  if (f.secret) return 6;
  if (f.binary) return Math.round(Math.log2(1 + f.bytes / 1024) * 3);
  const core = f.kind === "core" ? 12 : 0;
  return Math.round(Math.log2(1 + f.loc) * 10 + Math.min(inDegree, 40) * 8 + core);
}

export function analyzeEntries(entries: SourceEntry[], opts: AnalyzeOptions): Project {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const paths = new Set(sorted.map((e) => e.path));
  const texts = new Map<string, string>();

  const files: ProjectFile[] = sorted.map((e, i) => {
    if (i % 250 === 0) opts.onProgress?.(i, sorted.length);
    const name = e.path.slice(e.path.lastIndexOf("/") + 1);
    const dir = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
    const lang = e.secret ? SECRET_LANG : e.binary ? BINARY_LANG : detectLanguage(e.path);
    const lockfile = isLockfile(e.path);
    let lines = 0;
    let loc = 0;
    let estimated = false;
    if (e.text !== undefined) {
      ({ lines, loc } = countLines(e.text));
      texts.set(e.path, e.text);
    } else if (e.estimated && !e.secret && !e.binary) {
      lines = Math.round(e.bytes / 32);
      loc = Math.round(e.bytes / 38);
      estimated = true;
    }
    if (lockfile) loc = 0; // lockfiles never count towards LOC
    const kind = kindFromPath(e.path, { binary: !!e.binary, secret: !!e.secret, lockfile, code: lang.code });
    return {
      path: e.path,
      name,
      dir,
      language: lang.name,
      langColor: lang.color,
      kind,
      bytes: e.bytes,
      loc,
      lines,
      binary: !!e.binary,
      secret: !!e.secret,
      lockfile,
      estimated,
      uses: [],
      usedBy: [],
      importance: 0,
    };
  });

  // Import graph.
  const byPath = new Map(files.map((f) => [f.path, f]));
  let edges = 0;
  for (const f of files) {
    const text = texts.get(f.path);
    const il = importLangFor(f.path);
    if (!text || !il || f.lockfile) continue;
    const uses = new Set<string>();
    for (const spec of extractImports(text, il)) {
      const target = resolveImport(spec, f.path, paths);
      if (target && target !== f.path && byPath.has(target)) uses.add(target);
    }
    f.uses = [...uses].sort();
    for (const u of f.uses) byPath.get(u)!.usedBy.push(f.path);
    edges += f.uses.length;
  }
  for (const f of files) f.usedBy.sort();

  // Promote heavily imported files to "core".
  const degrees = files.map((f) => f.usedBy.length).sort((a, b) => a - b);
  const p95 = degrees[Math.floor(degrees.length * 0.95)] ?? 0;
  const coreMin = Math.max(3, p95);
  for (const f of files) {
    if ((f.kind === "util" || f.kind === "ui") && f.usedBy.length >= coreMin) f.kind = "core";
    f.importance = importanceOf(f, f.usedBy.length);
  }

  // Previews: most important files first, within the budget.
  const previews = dict<string>();
  let budget = opts.previewBudget ?? 30 * 1024 * 1024;
  for (const f of [...files].sort((a, b) => b.importance - a.importance || a.path.localeCompare(b.path))) {
    const t = texts.get(f.path);
    if (t === undefined) continue;
    const p = previewOf(t);
    if (p.length > budget) continue;
    previews[f.path] = p;
    budget -= p.length;
  }

  opts.onProgress?.(sorted.length, sorted.length);
  return {
    name: opts.name,
    source: opts.source,
    files,
    previews,
    stats: computeStats(files, opts.skipped ?? {}, edges),
    warnings: opts.warnings ?? [],
    createdAt: Date.now(),
  };
}

