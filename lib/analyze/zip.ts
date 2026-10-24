/** Read a .zip (GitHub codeload archive or a user upload) with fflate. Works in Node and the browser. */
import { unzipSync } from "fflate";
import { entryFromBytes, planEntries, type Plan, type RawListing, type SourceEntry } from "./collect";
import { mediaMime, MEDIA_MAX_BYTES } from "./rules";

/** Media budget for one archive: at most this many bytes / files of audio + video are kept for the player. */
export const MEDIA_BUDGET = { bytes: 40 * 1024 * 1024, files: 40 };

export interface ZipRead {
  entries: SourceEntry[];
  plan: Plan;
  /** path -> bytes of playable audio / video files (each <= 10 MB, capped in total) */
  media: Record<string, { bytes: Uint8Array; mime: string }>;
}

export function readZip(data: Uint8Array, onProgress?: (done: number, total: number) => void, keepMedia = false): ZipRead {
  // Pass 1: list names and sizes only (filter returns false, nothing is inflated).
  const listing: RawListing[] = [];
  unzipSync(data, {
    filter: (f) => {
      listing.push({ raw: f.name, size: f.originalSize });
      return false;
    },
  });
  const plan = planEntries(listing);
  const toRead = new Map(plan.keep.filter((e) => e.action === "read").map((e) => [e.raw, e]));
  // Audio / video files are binary (never read as code), but small ones are kept for the player.
  const mediaWanted = new Map<string, { path: string; mime: string }>();
  let budget = MEDIA_BUDGET.bytes;
  for (const e of plan.keep) {
    const mime = keepMedia && e.action === "binary" ? mediaMime(e.path) : null;
    if (!mime || e.size > MEDIA_MAX_BYTES || e.size > budget || mediaWanted.size >= MEDIA_BUDGET.files) continue;
    budget -= e.size;
    mediaWanted.set(e.raw, { path: e.path, mime });
  }

  // Pass 2: inflate only the files we planned to read.
  // Inflate each planned name once: an archive can repeat the same entry name many times
  // (each copy would be inflated again, a cheap decompression-time bomb).
  const wantMedia = new Set(mediaWanted.keys());
  const out = toRead.size || wantMedia.size
    ? unzipSync(data, {
        filter: (f) => {
          if (wantMedia.has(f.name)) { wantMedia.delete(f.name); return f.originalSize <= MEDIA_MAX_BYTES; }
          if (!toRead.has(f.name)) return false;
          toRead.delete(f.name);
          return true;
        },
      })
    : {};
  const media: ZipRead["media"] = {};
  for (const [raw, m] of mediaWanted) {
    const b = out[raw];
    if (b && b.length <= MEDIA_MAX_BYTES) media[m.path] = { bytes: b, mime: m.mime };
    delete out[raw];
  }
  const entries: SourceEntry[] = [];
  plan.keep.forEach((e, i) => {
    if (i % 200 === 0) onProgress?.(i, plan.keep.length);
    entries.push(entryFromBytes(e, out[e.raw]));
  });
  return { entries, plan, media };
}
