/**
 * Browser side of the import history (/api/history). Builds the small, contents-free record the
 * server keeps: GitHub imports save the normalized URL + stats; zip / folder imports also save the
 * analysis (paths, sizes, LOC, import graph, symbols, health) so the city can be rebuilt later.
 * Never sent: previews, file text, media, or anything from secret files.
 */
import type { Project, ProjectFile, ProjectStats } from "@/lib/types";

const MAX_ANALYSIS = 1_900_000;
const FIELDS = ["path", "language", "langColor", "kind", "bytes", "loc", "lines", "binary", "secret", "lockfile", "estimated", "uses", "usedBy", "importance", "moduleType", "symbols", "health"] as const;

export function statsOf(p: Pick<Project, "files" | "stats">) {
  return {
    files: p.stats.filesCounted || p.files.length,
    loc: p.stats.totalLoc,
    languages: p.stats.languages.slice(0, 3).map((l) => l.language),
    imports: p.stats.imports,
    secrets: p.stats.secrets,
  };
}

function slimFile(f: ProjectFile, withSymbols: boolean) {
  const o: Record<string, unknown> = {};
  for (const k of FIELDS) if (f[k] !== undefined) o[k] = f[k];
  if (f.secret) { o.uses = []; delete o.symbols; delete o.health; o.loc = 0; o.lines = 0; }
  if (!withSymbols) delete o.symbols;
  return o;
}

/** The analysis JSON for a zip / folder import, or null when even the slim version is too large. */
export function analysisOf(p: Project): string | null {
  const stats: Partial<ProjectStats> = { ...p.stats, skippedExamples: undefined, largest: [] };
  for (const withSymbols of [true, false]) {
    const s = JSON.stringify({ v: 1, name: p.name, files: p.files.map((f) => slimFile(f, withSymbols)), stats, warnings: p.warnings.slice(0, 10) });
    if (s.length <= MAX_ANALYSIS) return s;
  }
  return null;
}

export type SaveResult = { saved: boolean; reason?: string };

/** Save the import to the signed-in user's history. Guests get {saved:false} (no error). */
export async function recordHistory(p: Project): Promise<SaveResult> {
  const s = p.source;
  if (s.kind === "sample") return { saved: false };
  const body = s.kind === "github"
    ? { kind: "github", title: `${s.owner}/${s.repo}`, url: s.url || `https://github.com/${s.owner}/${s.repo}`, stats: statsOf(p) }
    : { kind: s.kind, title: s.name || p.name, stats: statsOf(p), analysis: analysisOf(p) };
  try {
    const r = await fetch("/api/history", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as SaveResult & { error?: string };
    return r.ok ? { saved: !!j.saved, reason: j.reason } : { saved: false, reason: j.error };
  } catch {
    return { saved: false, reason: "Could not reach the CodeLens server." };
  }
}

/** Rebuild a Project from a saved zip / folder analysis. File contents were never saved. */
export function projectFromAnalysis(title: string, kind: "zip" | "folder", analysis: unknown): Project {
  const a = (typeof analysis === "string" ? JSON.parse(analysis) : analysis) as { name?: string; files: ProjectFile[]; stats: ProjectStats; warnings?: string[] };
  const files = a.files.map((f) => ({
    ...f,
    name: f.path.slice(f.path.lastIndexOf("/") + 1),
    dir: f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "",
    uses: f.uses || [],
    usedBy: f.usedBy || [],
  }));
  const stats: ProjectStats = {
    ...({ totalLoc: 0, totalLines: 0, totalBytes: 0, filesCounted: files.length, filesSkipped: 0, skipped: {}, secrets: 0, binaries: 0, languages: [], imports: 0 } as Partial<ProjectStats>),
    ...a.stats,
    largest: [...files].filter((f) => !f.secret).sort((x, y) => y.loc - x.loc).slice(0, 5).map((f) => ({ path: f.path, loc: f.loc, bytes: f.bytes })),
  };
  return {
    name: a.name || title,
    source: { kind, name: title },
    files,
    previews: {},
    stats,
    warnings: ["Re-opened from your history: CodeLens saved only the analysis (no file contents), so code previews aren't available. Import the " + kind + " again to read the code.", ...(a.warnings || [])].slice(0, 10),
    createdAt: Date.now(),
  };
}

export type HistoryRow = { id: string; kind: "github" | "zip" | "folder"; title: string; url: string | null; stats: ReturnType<typeof statsOf>; hasAnalysis: boolean; createdAt: number };

/** The signed-in user's history (null for guests). */
export async function listHistory(): Promise<HistoryRow[] | null> {
  const r = await fetch("/api/history", { credentials: "same-origin" });
  if (r.status === 401) return null;
  const j = (await r.json().catch(() => ({}))) as { items?: HistoryRow[]; error?: string };
  if (!r.ok) throw new Error(j.error || "History is unavailable right now.");
  return j.items || [];
}

export async function deleteHistory(id: string | null): Promise<void> {
  const r = await fetch("/api/history?" + (id ? "id=" + encodeURIComponent(id) : "all=1"), { method: "DELETE", credentials: "same-origin" });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not delete.");
}

/** A zip / folder entry back as a Project, from its saved analysis (GitHub entries are simply re-imported). */
export async function restoreHistory(row: Pick<HistoryRow, "id" | "kind" | "title">): Promise<Project> {
  if (row.kind === "github") throw new Error("GitHub entries are re-imported.");
  const r = await fetch("/api/history/item?id=" + encodeURIComponent(row.id), { credentials: "same-origin" });
  const j = (await r.json().catch(() => ({}))) as { title?: string; analysis?: unknown; error?: string };
  if (!r.ok || !j.analysis) throw new Error(j.error || "That entry has no saved analysis.");
  return projectFromAnalysis(j.title || row.title, row.kind, j.analysis);
}

/* ---- sign-in (/api/auth/*) ---- */
async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, status: r.status, ...j } as { ok: boolean; status: number; error?: string; message?: string; retryAfter?: number; user?: { email: string } };
}
export type AuthStatus = { mode: "email" | "dev" | "off"; available: boolean; user: { email: string } | null };
export async function authStatus(): Promise<AuthStatus> {
  try {
    const r = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" });
    if (r.ok) return (await r.json()) as AuthStatus;
  } catch { /* offline */ }
  return { mode: "off", available: false, user: null };
}
export const startLogin = (email: string) => post("/api/auth/start", { email });
export const verifyLogin = (email: string, code: string) => post("/api/auth/verify", { email, code });
export const logout = () => post("/api/auth/logout", {});
