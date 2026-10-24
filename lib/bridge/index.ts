/**
 * codelens-bridge: the backend wiring for the static CodeLens pages in public/
 * (index.html landing, building.html, workspace.html). Bundled by tools/build-bridge.mjs
 * into public/app/codelens-bridge.js and exposed as window.CodeLens.
 *
 * - GitHub link: POST /api/import/github (server: repo + tree + codeload zip, analyzer).
 * - .zip / folder: parsed in the browser (fflate + File API) with the same ignore rules,
 *   caps and path-traversal guard as the server. Nothing is uploaded.
 * - Project + pending import live in IndexedDB (this browser only).
 * - planCity(): the block-grid city plan the engine renders.
 */
import { ClientImportError, filesFromEntry, importFolder, importGithub, importZipFile } from "@/lib/client/importClient";
import { planCity, type PlanOptions } from "@/lib/city/blockLayout";
import { isSecretPath, isBinaryExt } from "@/lib/analyze/rules";
import { parseGitHubUrl } from "@/lib/github";
import type { ImportProgress, Project } from "@/lib/types";
import { own } from "@/lib/safeDict";

const DB = "codelens";
const STORE = "projects";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function put(key: string, value: unknown) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    if (value === undefined) tx.objectStore(STORE).delete(key);
    else tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function get<T>(key: string): Promise<T | null> {
  const db = await idb();
  const v = await new Promise<T | null>((res, rej) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => res((r.result as T) ?? null);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return v;
}

export type Pending =
  | { src: "github"; url: string; name: string }
  | { src: "zip"; name: string; file: File }
  | { src: "folder"; name: string; files: { file: File; path: string }[] };

/** Remember what the visitor picked (File objects are structured-cloneable into IndexedDB). */
export async function setPending(p: Pending) {
  try {
    sessionStorage.setItem("codelens-import", JSON.stringify({ src: p.src, name: p.name, n: p.src === "folder" ? p.files.length : 1 }));
  } catch {
    /* private mode */
  }
  await put("pending", p);
}
export const getPending = () => get<Pending>("pending");
export const clearPending = () => put("pending", undefined);
export const saveProject = (p: Project) => put("current", p);
export const loadProject = () => get<Project>("current");
export const clearProject = () => put("current", undefined);

/** Run the pending import with real progress. */
export async function runImport(p: Pending, emit: (e: ImportProgress) => void): Promise<Project> {
  if (p.src === "github") return importGithub(p.url, emit);
  if (p.src === "zip") return importZipFile(p.file, emit);
  return importFolder(p.name, p.files, emit);
}

export function checkGithubUrl(url: string): { ok: true; owner: string; repo: string } | { ok: false; message: string } {
  const r = parseGitHubUrl(url);
  return r ? { ok: true, owner: r.owner, repo: r.repo } : { ok: false, message: "That does not look like a public github.com/owner/repo link." };
}

export type Source =
  | { kind: "text"; text: string; truncated: boolean; note?: string }
  | { kind: "secret" | "binary" | "missing" | "error"; message: string };

/** The file's source for the Code tab / focus mode. Secrets are never read. */
export async function getSource(project: Project, path: string): Promise<Source> {
  const f = project.files.find((x) => x.path === path);
  if (!f) return { kind: "missing", message: "Not in this project." };
  if (f.secret || isSecretPath(path)) return { kind: "secret", message: "This is a secrets file. CodeLens lists it by name only; its contents are never read." };
  if (f.binary || isBinaryExt(path)) return { kind: "binary", message: "This file is binary, so there is no text to show. It still gets a building." };
  const pre = own(project.previews, path);
  const truncated = (t: string) => f.lines > t.split("\n").length;
  if (pre !== undefined) return { kind: "text", text: pre, truncated: truncated(pre) };
  if (project.source.kind === "github") {
    const s = project.source;
    const q = new URLSearchParams({ owner: s.owner, repo: s.repo, ref: s.branch, path });
    try {
      const r = await fetch("/api/github/file?" + q.toString());
      if (r.status === 403) return { kind: "secret", message: await r.text() };
      if (r.status === 415) return { kind: "binary", message: "Not previewable (binary or generated file)." };
      if (!r.ok) return { kind: "error", message: (await r.text()) || `GitHub said ${r.status}.` };
      const text = await r.text();
      project.previews[path] = text;
      return { kind: "text", text, truncated: truncated(text) };
    } catch {
      return { kind: "error", message: "Could not reach the CodeLens server." };
    }
  }
  return { kind: "missing", message: "The source of this file was not kept (preview budget for big projects). Re-import a smaller folder to read it." };
}

export function plan(project: Project, flags: PlanOptions = {}) {
  return planCity(project, flags);
}

const api = { setPending, getPending, clearPending, saveProject, loadProject, clearProject, runImport, checkGithubUrl, getSource, plan, filesFromEntry, ClientImportError };
declare global {
  interface Window {
    CodeLens: typeof api;
  }
}
if (typeof window !== "undefined") window.CodeLens = api;
