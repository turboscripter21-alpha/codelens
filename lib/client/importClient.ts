"use client";

/**
 * Browser side of the imports.
 * - GitHub: POST /api/import/github and read the NDJSON progress stream.
 * - .zip and folders: parsed right here in the browser (fflate + File API) with the same
 *   ignore rules, caps and path checks as the server. Nothing is uploaded, which also keeps
 *   us clear of Vercel's request body limit.
 */
import { analyzeEntries } from "@/lib/analyze/analyze";
import { entryFromBytes, planEntries, type SourceEntry } from "@/lib/analyze/collect";
import { CAPS } from "@/lib/analyze/rules";
import { readZip } from "@/lib/analyze/zip";
import type { ImportProgress, Project } from "@/lib/types";

export class ClientImportError extends Error {
  constructor(
    public code: string,
    message: string,
    public resetAt?: number,
  ) {
    super(message);
  }
}

type Emit = (p: ImportProgress) => void;
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function importGithub(url: string, emit: Emit, signal?: AbortSignal): Promise<Project> {
  let res: Response;
  try {
    res = await fetch("/api/import/github", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal });
  } catch {
    throw new ClientImportError("network", "Could not reach the CodeLens server. Check your connection.");
  }
  if (!res.body) throw new ClientImportError("upstream", "Empty response from the server.");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  const handle = (line: string): Project | undefined => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      throw new ClientImportError("upstream", res.ok ? "The server sent a reply CodeLens could not read." : `The server said ${res.status}.`);
    }
    if (msg.type === "progress") emit(msg as ImportProgress);
    else if (msg.type === "result") return msg.project as Project;
    else if (msg.type === "error") throw new ClientImportError(String(msg.code), String(msg.message), typeof msg.resetAt === "number" ? msg.resetAt : undefined);
    return undefined;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const p = handle(line);
      if (p) return p;
    }
    if (done) break;
  }
  // Plain JSON replies (400 / 429) have no trailing newline.
  if (buf.trim()) {
    const p = handle(buf.trim());
    if (p) return p;
  }
  throw new ClientImportError("upstream", "The import stopped before it finished.");
}

export async function importZipFile(file: File, emit: Emit): Promise<Project> {
  if (file.size > CAPS.maxArchiveBytes) throw new ClientImportError("too-large", `That zip is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is 50 MB.`);
  emit({ stage: "read", detail: `opening ${file.name}`, ratio: 0.1 });
  const data = new Uint8Array(await file.arrayBuffer());
  await tick();
  let read;
  try {
    read = readZip(data);
  } catch {
    throw new ClientImportError("bad-zip", "That file is not a valid .zip archive.");
  }
  emit({ stage: "read", detail: `${read.entries.length.toLocaleString()} files`, ratio: 1 });
  await tick();
  return finish(read.entries, read.plan.skipped, read.plan.warnings, file.name.replace(/\.zip$/i, ""), { kind: "zip", name: file.name }, emit);
}

export async function importFolder(name: string, files: { file: File; path: string }[], emit: Emit): Promise<Project> {
  const plan = planEntries(files.map((f) => ({ raw: f.path, size: f.file.size })));
  const byRaw = new Map(files.map((f) => [f.path, f.file]));
  const entries: SourceEntry[] = [];
  const BATCH = 24;
  for (let i = 0; i < plan.keep.length; i += BATCH) {
    const batch = plan.keep.slice(i, i + BATCH);
    const read = await Promise.all(
      batch.map(async (e) => (e.action === "read" ? entryFromBytes(e, new Uint8Array(await byRaw.get(e.raw)!.arrayBuffer())) : entryFromBytes(e))),
    );
    entries.push(...read);
    emit({ stage: "read", detail: `${Math.min(i + BATCH, plan.keep.length).toLocaleString()} / ${plan.keep.length.toLocaleString()} files`, ratio: (i + BATCH) / plan.keep.length });
  }
  return finish(entries, plan.skipped, plan.warnings, plan.root ?? name, { kind: "folder", name }, emit);
}

async function finish(entries: SourceEntry[], skipped: Record<string, number>, warnings: string[], name: string, source: Project["source"], emit: Emit): Promise<Project> {
  if (!entries.length) throw new ClientImportError("empty", "No source files found after ignore rules (node_modules, build output, binaries...).");
  emit({ stage: "analyze", detail: `${entries.length.toLocaleString()} files`, ratio: 0.2 });
  await tick();
  const project = analyzeEntries(entries, { name, source, skipped, warnings });
  emit({ stage: "analyze", detail: `${project.stats.totalLoc.toLocaleString()} lines of code`, ratio: 1 });
  return project;
}

/** Collect File objects from a dropped folder (FileSystemEntry API), capped. */
export async function filesFromEntry(root: FileSystemEntry): Promise<{ file: File; path: string }[]> {
  const out: { file: File; path: string }[] = [];
  const limit = CAPS.maxFiles * 4;
  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (out.length >= limit) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path });
      return;
    }
    // Do not descend into folders we would ignore anyway.
    if (["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv"].includes(entry.name) && prefix) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walk(e, path);
    }
  }
  await walk(root, "");
  return out;
}
