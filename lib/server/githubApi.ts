import "server-only";
import { CAPS } from "@/lib/analyze/rules";
import { isValidOwner, isValidRef, isValidRepo } from "@/lib/github";

/**
 * Server-only GitHub access. Every URL is built from validated parts on fixed
 * hosts (api.github.com, codeload.github.com, raw.githubusercontent.com); no
 * user-supplied URL is ever fetched. GITHUB_TOKEN (optional) never leaves the server.
 */

export class ImportError extends Error {
  constructor(
    public code: "invalid-url" | "not-found" | "private" | "rate-limited" | "too-large" | "upstream" | "empty",
    message: string,
    public resetAt?: number,
  ) {
    super(message);
  }
}

/** fetch with a hard time limit; a slow or hung upstream becomes a clean ImportError. */
async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new ImportError("upstream", "GitHub took too long to answer. Try again.");
    throw new ImportError("upstream", "Could not reach GitHub.");
  }
}

function apiHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodeLens-college-project",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function checkRateLimit(res: Response) {
  const remaining = res.headers.get("x-ratelimit-remaining");
  if ((res.status === 403 || res.status === 429) && (remaining === "0" || res.status === 429)) {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000 || Date.now() + 60 * 60 * 1000;
    throw new ImportError("rate-limited", "GitHub's rate limit for this server was reached.", reset);
  }
}

async function api<T>(path: string, hops = 0): Promise<T> {
  const res = await timedFetch(`https://api.github.com${path}`, { headers: apiHeaders(), redirect: "manual", cache: "no-store" }, 15_000);
  checkRateLimit(res);
  if (res.status === 301 || res.status === 302 || res.status === 307) {
    // Renamed / transferred repo: follow only to api.github.com, at most twice.
    const loc = res.headers.get("location") ?? "";
    const u = new URL(loc, "https://api.github.com");
    if (u.hostname !== "api.github.com" || hops >= 2) throw new ImportError("upstream", "GitHub redirected somewhere unexpected.");
    return api<T>(u.pathname + u.search, hops + 1);
  }
  if (res.status === 404) throw new ImportError("not-found", "Repo not found. It may be private, renamed, or misspelled.");
  if (!res.ok) throw new ImportError("upstream", `GitHub returned ${res.status}.`);
  return (await res.json()) as T;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  branch: string;
  sizeKb: number;
  description: string | null;
}

export async function getRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  if (!isValidOwner(owner) || !isValidRepo(repo)) throw new ImportError("invalid-url", "That is not a valid GitHub repo.");
  const r = await api<{ private: boolean; default_branch: string; size: number; description: string | null; name: string; owner: { login: string } }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
  if (r.private) throw new ImportError("private", "This repo is private. CodeLens only reads public repos.");
  if (!isValidRef(r.default_branch)) throw new ImportError("upstream", "Unsupported default branch name.");
  return { owner: r.owner.login, repo: r.name, branch: r.default_branch, sizeKb: r.size, description: r.description };
}

export interface TreeEntry {
  path: string;
  size: number;
}

export async function getTree(m: RepoMeta): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const t = await api<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `/repos/${encodeURIComponent(m.owner)}/${encodeURIComponent(m.repo)}/git/trees/${encodeURIComponent(m.branch)}?recursive=1`,
  );
  return { entries: t.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, size: e.size ?? 0 })), truncated: t.truncated };
}

const refPath = (ref: string) => ref.split("/").map(encodeURIComponent).join("/");

/**
 * Download the codeload zip of the branch in one request, streaming with a byte cap.
 * Returns null if the archive is larger than the cap (caller falls back to tree-only).
 */
export async function downloadZip(m: RepoMeta, onBytes: (n: number) => void): Promise<Uint8Array | null> {
  const url = `https://codeload.github.com/${encodeURIComponent(m.owner)}/${encodeURIComponent(m.repo)}/zip/refs/heads/${refPath(m.branch)}`;
  // The whole download (headers + body) must finish in 50 s (Vercel maxDuration is 60 s).
  const res = await timedFetch(url, { headers: { "User-Agent": "CodeLens-college-project" }, redirect: "error", cache: "no-store" }, 50_000);
  if (res.status === 404) throw new ImportError("not-found", "Could not download the repo archive.");
  if (!res.ok || !res.body) throw new ImportError("upstream", `Archive download failed (${res.status}).`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > CAPS.maxArchiveBytes) {
    await res.body.cancel();
    return null;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > CAPS.maxArchiveBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
    if (total - lastReport > 512 * 1024) {
      lastReport = total;
      onBytes(total);
    }
  }
  onBytes(total);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** One file's text for the on-demand preview (used when it did not fit the import response). */
export async function getRawFile(owner: string, repo: string, ref: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${refPath(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await timedFetch(url, { headers: { "User-Agent": "CodeLens-college-project" }, redirect: "error", cache: "no-store" }, 15_000);
  if (res.status === 404) throw new ImportError("not-found", "File not found.");
  if (!res.ok || !res.body) throw new ImportError("upstream", `GitHub returned ${res.status}.`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total >= CAPS.previewBytes) {
      await reader.cancel();
      break;
    }
  }
  const buf = new Uint8Array(Math.min(total, CAPS.previewBytes));
  let o = 0;
  for (const c of chunks) {
    const n = Math.min(c.length, buf.length - o);
    buf.set(c.subarray(0, n), o);
    o += n;
    if (o >= buf.length) break;
  }
  for (let i = 0; i < Math.min(buf.length, 8000); i++) if (buf[i] === 0) throw new ImportError("upstream", "Binary file.");
  return new TextDecoder().decode(buf);
}
