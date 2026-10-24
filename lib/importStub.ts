import type { ImportSource } from "./types";

/**
 * Phase 1 stub. Pretends to index the source and resolves after ~1.8 s.
 * Nothing is uploaded or fetched. Phase 2 swaps this for the GitHub API route
 * and a client-side zip/folder reader.
 */
export const IMPORT_STEPS = [
  "Reading the file tree",
  "Sorting folders into districts",
  "Sizing buildings by file size",
  "Laying the road and lamps",
] as const;

export function runImportStub(
  source: ImportSource,
  onStep: (index: number) => void,
  stepMs = 450,
): Promise<ImportSource> {
  return new Promise((resolve) => {
    let i = 0;
    onStep(0);
    const t = setInterval(() => {
      i += 1;
      if (i >= IMPORT_STEPS.length) {
        clearInterval(t);
        resolve(source);
        return;
      }
      onStep(i);
    }, stepMs);
  });
}

/** Turn an import source into the /city query string. */
export function cityHref(source: ImportSource): string {
  const q = new URLSearchParams();
  q.set("source", source.kind);
  if (source.kind === "github") q.set("repo", `${source.owner}/${source.repo}`);
  else q.set("name", source.name);
  if (source.kind === "folder") q.set("files", String(source.fileCount));
  return `/city?${q.toString()}`;
}
