/** Read a .zip (GitHub codeload archive or a user upload) with fflate. Works in Node and the browser. */
import { unzipSync } from "fflate";
import { entryFromBytes, planEntries, type Plan, type RawListing, type SourceEntry } from "./collect";

export interface ZipRead {
  entries: SourceEntry[];
  plan: Plan;
}

export function readZip(data: Uint8Array, onProgress?: (done: number, total: number) => void): ZipRead {
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

  // Pass 2: inflate only the files we planned to read.
  // Inflate each planned name once: an archive can repeat the same entry name many times
  // (each copy would be inflated again, a cheap decompression-time bomb).
  const out = toRead.size
    ? unzipSync(data, {
        filter: (f) => {
          if (!toRead.has(f.name)) return false;
          toRead.delete(f.name);
          return true;
        },
      })
    : {};
  const entries: SourceEntry[] = [];
  plan.keep.forEach((e, i) => {
    if (i % 200 === 0) onProgress?.(i, plan.keep.length);
    entries.push(entryFromBytes(e, out[e.raw]));
  });
  return { entries, plan };
}
