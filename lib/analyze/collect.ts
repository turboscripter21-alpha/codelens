/**
 * Turning raw archive / upload entries into SourceEntry objects, with the
 * shared ignore rules and caps. Callers (server zip, browser zip, browser
 * folder) list entries first, ask `planEntries` what to read, then read only
 * those bytes and hand them to `entryFromBytes`.
 */
import { CAPS, isBinaryExt, isLockfile, isSecretPath, looksBinary, normalizePath, skipReason, stripCommonRoot } from "./rules";
import { detectLanguage } from "./language";

export interface SourceEntry {
  path: string;
  bytes: number;
  /** Decoded text, when read. */
  text?: string;
  binary?: boolean;
  secret?: boolean;
  /** Contents not read (too large / not downloaded): LOC will be estimated. */
  estimated?: boolean;
}

export interface RawListing {
  /** Path exactly as it appears in the archive or upload. */
  raw: string;
  size: number;
}

export interface PlannedEntry {
  raw: string;
  path: string;
  size: number;
  action: "read" | "secret" | "binary" | "large";
}

export interface Plan {
  keep: PlannedEntry[];
  skipped: Record<string, number>;
  warnings: string[];
  root: string | null;
}

const bump = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);

/** Apply path safety, ignore rules, secrets, binaries, file cap and total-read cap. */
export function planEntries(listing: RawListing[], opts: { stripRoot?: boolean } = {}): Plan {
  const skipped: Record<string, number> = {};
  const warnings: string[] = [];
  const safe: { raw: string; path: string; size: number }[] = [];
  for (const l of listing) {
    if (l.raw.endsWith("/")) continue; // directory entry
    const p = normalizePath(l.raw);
    if (!p) {
      bump(skipped, "unsafe-path");
      continue;
    }
    safe.push({ raw: l.raw, path: p, size: l.size });
  }
  if (skipped["unsafe-path"]) warnings.push(`${skipped["unsafe-path"]} ${skipped["unsafe-path"] === 1 ? "entry" : "entries"} had unsafe paths (absolute or "..") and were ignored.`);

  const { root, strip } = opts.stripRoot === false ? { root: null, strip: (p: string) => p } : stripCommonRoot(safe.map((s) => s.path));
  let kept: PlannedEntry[] = [];
  const seen = new Set<string>();
  for (const s of safe) {
    const path = strip(s.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const reason = skipReason(path);
    if (reason) {
      bump(skipped, reason);
      continue;
    }
    const action: PlannedEntry["action"] = isSecretPath(path)
      ? "secret"
      : isBinaryExt(path)
        ? "binary"
        : s.size > CAPS.maxReadBytes
          ? "large"
          : "read";
    kept.push({ raw: s.raw, path, size: s.size, action });
  }

  if (kept.length > CAPS.maxFiles) {
    // Keep source code first, then shallower files, then by path (deterministic).
    const rank = (e: PlannedEntry) => (detectLanguage(e.path).code ? 0 : 1);
    kept.sort((a, b) => rank(a) - rank(b) || a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
    const over = kept.length - CAPS.maxFiles;
    skipped["over-cap"] = over;
    warnings.push(`Large project: analyzed the first ${CAPS.maxFiles.toLocaleString()} files, skipped ${over.toLocaleString()}.`);
    kept = kept.slice(0, CAPS.maxFiles);
  }

  // Cap the total number of bytes we decompress / read.
  let total = 0;
  let downgraded = 0;
  for (const e of kept) {
    if (e.action !== "read") continue;
    if (total + e.size > CAPS.maxTotalReadBytes) {
      e.action = "large";
      downgraded++;
    } else total += e.size;
  }
  if (downgraded) warnings.push(`${downgraded} files were not read (size budget); their line counts are estimated.`);

  kept.sort((a, b) => a.path.localeCompare(b.path));
  return { keep: kept, skipped, warnings, root };
}

const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: false }) : null;

/** Build a SourceEntry from a planned entry and (for "read") its bytes. Detects binaries by NUL bytes. */
export function entryFromBytes(e: PlannedEntry, bytes?: Uint8Array): SourceEntry {
  if (e.action === "secret") return { path: e.path, bytes: e.size, secret: true }; // contents never read
  if (e.action === "binary") return { path: e.path, bytes: e.size, binary: true };
  if (e.action === "large" || !bytes) return { path: e.path, bytes: e.size, estimated: true };
  if (looksBinary(bytes)) return { path: e.path, bytes: bytes.length, binary: true };
  return { path: e.path, bytes: bytes.length, text: decoder!.decode(bytes) };
}

export { isLockfile };
