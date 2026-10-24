/**
 * Per-user import history. Stored: kind, title, GitHub URL (github.com only), a few stats, and for
 * zip / folder imports the analysis JSON (file names, sizes, LOC, import graph, symbols, health) so
 * the city can be rebuilt. Never stored: file contents, previews, media, or anything from secret files
 * (they are kept as a name + "secret" flag only, exactly like the city shows them).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { parseGitHubUrl } from "../github";
import { isSecretPath, normalizePath } from "../analyze/rules";
import type { CodeSymbol, FileHealth, Project, ProjectFile } from "../types";

export const MAX_ENTRIES = 50;
export const MAX_ANALYSIS_BYTES = 2_000_000;
const MAX_FILES = 6000;

export type HistoryKind = "github" | "zip" | "folder";
export interface HistoryStats { files: number; loc: number; languages: string[]; imports: number; secrets: number }
export interface HistoryInput { kind: HistoryKind; title: string; url: string | null; stats: HistoryStats; analysis: string | null }
export interface HistoryRow { id: string; kind: HistoryKind; title: string; url: string | null; stats: HistoryStats; hasAnalysis: boolean; createdAt: number }

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const int = (v: unknown, max = 1e9) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
const KINDS = new Set(["fn", "method", "class", "type", "var"]);
const LV = new Set(["good", "warn", "bad"]);

function cleanStats(v: unknown): HistoryStats {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const langs = Array.isArray(o.languages) ? o.languages.map((l) => str(l, 40)).filter(Boolean).slice(0, 5) : [];
  return { files: int(o.files), loc: int(o.loc), languages: langs, imports: int(o.imports), secrets: int(o.secrets) };
}

function cleanFile(v: unknown): ProjectFile | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const path = typeof o.path === "string" ? normalizePath(o.path) : null;
  if (!path) return null;
  const secret = !!o.secret || isSecretPath(path);
  const paths = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").map((x) => normalizePath(x)).filter((x): x is string => !!x).slice(0, 500) : []);
  const f: ProjectFile = {
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    dir: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
    language: str(o.language, 40) || "Other",
    langColor: /^#[0-9a-fA-F]{3,8}$/.test(String(o.langColor)) ? String(o.langColor) : "#8f949b",
    kind: (str(o.kind, 20) || "util") as ProjectFile["kind"],
    bytes: int(o.bytes),
    loc: secret ? 0 : int(o.loc),
    lines: secret ? 0 : int(o.lines),
    binary: !!o.binary,
    secret,
    lockfile: !!o.lockfile,
    estimated: !!o.estimated,
    uses: secret ? [] : paths(o.uses),
    usedBy: paths(o.usedBy),
    importance: int(o.importance, 1e6),
  };
  if (typeof o.moduleType === "string") f.moduleType = str(o.moduleType, 20);
  if (!secret && Array.isArray(o.symbols)) {
    f.symbols = o.symbols.slice(0, 60).flatMap((s): CodeSymbol[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      const n = str(r.n, 80), k = String(r.k);
      if (!n || !KINDS.has(k)) return [];
      const out: CodeSymbol = { n, k: k as CodeSymbol["k"], l: int(r.l, 1e7) };
      if (r.end) out.end = int(r.end, 1e7);
      if (r.e) out.e = 1;
      return [out];
    });
  }
  if (!secret && o.health && typeof o.health === "object") {
    const h = o.health as Record<string, unknown>;
    if (LV.has(String(h.lv))) {
      const hh: FileHealth = { s: int(h.s, 100), lv: h.lv as FileHealth["lv"], br: int(h.br), dp: int(h.dp, 1000), fn: int(h.fn) };
      if (h.fnName) hh.fnName = str(h.fnName, 80);
      f.health = hh;
    }
  }
  return f;
}

/** Rebuild a contents-free analysis from untrusted JSON. Returns the canonical JSON string or null. */
export function cleanAnalysis(raw: unknown, title: string): string | null {
  let o: Record<string, unknown>;
  try {
    o = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || !Array.isArray(o.files)) return null;
  const files = o.files.slice(0, MAX_FILES).map(cleanFile).filter((f): f is ProjectFile => !!f);
  if (!files.length) return null;
  const st = (o.stats && typeof o.stats === "object" ? o.stats : {}) as Record<string, unknown>;
  const languages = Array.isArray(st.languages)
    ? st.languages.slice(0, 30).flatMap((l) => {
        if (!l || typeof l !== "object") return [];
        const r = l as Record<string, unknown>;
        return [{ language: str(r.language, 40), color: /^#[0-9a-fA-F]{3,8}$/.test(String(r.color)) ? String(r.color) : "#8f949b", loc: int(r.loc), files: int(r.files), pct: Math.max(0, Math.min(100, Number(r.pct) || 0)) }];
      })
    : [];
  const stats = {
    totalLoc: int(st.totalLoc), totalLines: int(st.totalLines), totalBytes: int(st.totalBytes, 1e12),
    filesCounted: int(st.filesCounted), filesSkipped: int(st.filesSkipped), skipped: {},
    secrets: int(st.secrets), binaries: int(st.binaries), languages, largest: [], imports: int(st.imports),
  };
  const warnings = Array.isArray(o.warnings) ? o.warnings.map((w) => str(w, 300)).filter(Boolean).slice(0, 10) : [];
  const out = JSON.stringify({ v: 1, name: str(o.name, 200) || title, files, stats, warnings });
  return out.length <= MAX_ANALYSIS_BYTES ? out : null;
}

export type Parsed = { ok: true; value: HistoryInput } | { ok: false; error: string };
export function parseHistoryInput(v: unknown): Parsed {
  if (!v || typeof v !== "object") return { ok: false, error: "Bad request." };
  const o = v as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== "github" && kind !== "zip" && kind !== "folder") return { ok: false, error: "Bad kind." };
  const title = str(o.title, 200);
  if (!title) return { ok: false, error: "Missing title." };
  let url: string | null = null;
  let analysis: string | null = null;
  if (kind === "github") {
    const r = typeof o.url === "string" ? parseGitHubUrl(o.url) : null;
    if (!r) return { ok: false, error: "Only github.com/owner/repo links can be saved." };
    url = `https://github.com/${r.owner}/${r.repo}`;
  } else if (o.analysis != null) {
    analysis = cleanAnalysis(o.analysis, title);
    if (!analysis) return { ok: false, error: "That analysis is too large or not valid." };
  }
  return { ok: true, value: { kind, title, url, stats: cleanStats(o.stats), analysis } };
}

/** The small stats block saved with each entry. */
export function statsOf(p: Pick<Project, "files" | "stats">): HistoryStats {
  return {
    files: p.stats.filesCounted || p.files.length,
    loc: p.stats.totalLoc,
    languages: p.stats.languages.slice(0, 3).map((l) => l.language),
    imports: p.stats.imports,
    secrets: p.stats.secrets,
  };
}

export async function addHistory(uid: string, h: HistoryInput, now = Date.now()): Promise<string> {
  const db = await getDb();
  // same project again: refresh the existing entry instead of piling up duplicates
  const dup = await db.query<{ id: string }>("SELECT id FROM cl_history WHERE user_id = $1 AND kind = $2 AND title = $3 AND COALESCE(url, '') = $4", [uid, h.kind, h.title, h.url ?? ""]);
  let id: string;
  if (dup[0]) {
    id = dup[0].id;
    await db.query("UPDATE cl_history SET stats = $2, analysis = $3, created_at = $4 WHERE id = $1", [id, JSON.stringify(h.stats), h.analysis, now]);
  } else {
    id = randomUUID();
    await db.query("INSERT INTO cl_history (id, user_id, kind, title, url, stats, analysis, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [id, uid, h.kind, h.title, h.url, JSON.stringify(h.stats), h.analysis, now]);
  }
  await db.query(
    "DELETE FROM cl_history WHERE user_id = $1 AND id NOT IN (SELECT id FROM cl_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)",
    [uid, MAX_ENTRIES],
  );
  return id;
}

export async function listHistory(uid: string): Promise<HistoryRow[]> {
  const db = await getDb();
  const rows = await db.query<{ id: string; kind: HistoryKind; title: string; url: string | null; stats: string; has: boolean; created_at: string | number }>(
    "SELECT id, kind, title, url, stats, (analysis IS NOT NULL) AS has, created_at FROM cl_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [uid, MAX_ENTRIES],
  );
  return rows.map((r) => {
    let stats: HistoryStats;
    try { stats = cleanStats(JSON.parse(r.stats)); } catch { stats = cleanStats({}); }
    return { id: r.id, kind: r.kind, title: r.title, url: r.url, stats, hasAnalysis: !!r.has, createdAt: Number(r.created_at) };
  });
}

export async function getAnalysis(uid: string, id: string): Promise<{ title: string; kind: HistoryKind; analysis: string } | null> {
  const db = await getDb();
  const rows = await db.query<{ title: string; kind: HistoryKind; analysis: string | null }>("SELECT title, kind, analysis FROM cl_history WHERE user_id = $1 AND id = $2", [uid, id]);
  return rows[0]?.analysis ? { title: rows[0].title, kind: rows[0].kind, analysis: rows[0].analysis } : null;
}

export async function deleteHistory(uid: string, id: string | null): Promise<number> {
  const db = await getDb();
  const rows = id
    ? await db.query<{ id: string }>("DELETE FROM cl_history WHERE user_id = $1 AND id = $2 RETURNING id", [uid, id])
    : await db.query<{ id: string }>("DELETE FROM cl_history WHERE user_id = $1 RETURNING id", [uid]);
  return rows.length;
}

export const isId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
