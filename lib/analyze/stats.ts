import type { LanguageStat, ProjectFile, ProjectStats } from "../types";

/** Totals, language breakdown (by LOC) and largest files. */
export function computeStats(files: ProjectFile[], skipped: Record<string, number>, imports: number): ProjectStats {
  const langs = new Map<string, LanguageStat>();
  let totalLoc = 0;
  let totalLines = 0;
  let totalBytes = 0;
  for (const f of files) {
    totalLoc += f.loc;
    totalLines += f.lines;
    totalBytes += f.bytes;
    if (f.secret || f.binary) continue;
    const s = langs.get(f.language) ?? { language: f.language, color: f.langColor, files: 0, loc: 0, pct: 0 };
    s.files++;
    s.loc += f.loc;
    langs.set(f.language, s);
  }
  const languages = [...langs.values()]
    .map((s) => ({ ...s, pct: totalLoc ? Math.round((s.loc / totalLoc) * 1000) / 10 : 0 }))
    .sort((a, b) => b.loc - a.loc || b.files - a.files || a.language.localeCompare(b.language));
  const largest = [...files]
    .filter((f) => !f.secret && !f.binary)
    .sort((a, b) => b.loc - a.loc || a.path.localeCompare(b.path))
    .slice(0, 8)
    .map((f) => ({ path: f.path, loc: f.loc, bytes: f.bytes }));
  const filesSkipped = Object.values(skipped).reduce((a, b) => a + (b ?? 0), 0);
  return {
    totalLoc,
    totalLines,
    totalBytes,
    filesCounted: files.length,
    filesSkipped,
    skipped,
    secrets: files.filter((f) => f.secret).length,
    binaries: files.filter((f) => f.binary).length,
    languages,
    largest,
    imports,
  };
}
