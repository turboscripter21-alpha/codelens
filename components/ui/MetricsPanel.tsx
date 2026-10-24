"use client";

import type { CityLayout, Project } from "@/lib/types";

const SKIP_LABEL: Record<string, string> = {
  "ignored-dir": "node_modules, .git, build output",
  vendored: "vendored code",
  minified: "minified / source maps",
  "unsafe-path": "unsafe paths",
  "over-cap": "over the 5,000-file cap",
};

/** Phase 2: project metrics card (right side, under the top bar). Same card style as the pop-up. */
export function MetricsPanel({ project, layout, onPick, onClose }: { project: Project; layout: CityLayout; onPick: (path: string) => void; onClose: () => void }) {
  const s = project.stats;
  const langs = s.languages.filter((l) => l.loc > 0 || l.files > 0);
  const top = langs.slice(0, 8);
  const restPct = Math.max(0, 100 - top.reduce((a, l) => a + l.pct, 0));
  return (
    <section className="card anim-pop absolute right-5 top-[68px] z-20 flex max-h-[calc(100vh-170px)] w-[360px] flex-col overflow-hidden" data-testid="metrics-panel" aria-label="Project stats">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-bold">Project stats</h2>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-soft hover:bg-white hover:text-ink" aria-label="Close stats">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="space-y-5 overflow-y-auto px-5 py-4">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
          {[
            ["Lines of code", s.totalLoc.toLocaleString()],
            ["Files counted", s.filesCounted.toLocaleString()],
            ["Files skipped", s.filesSkipped.toLocaleString()],
            ["Total lines", s.totalLines.toLocaleString()],
            ["Vault files", String(s.secrets)],
            ["Imports found", s.imports.toLocaleString()],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">{k}</dt>
              <dd className="text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">Languages (by LOC)</h3>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,#12161c_8%,transparent)]" aria-hidden>
            {top.map((l) => (
              <span key={l.language} style={{ width: `${l.pct}%`, background: l.color }} />
            ))}
            {restPct > 0.5 && <span style={{ width: `${restPct}%`, background: "#c9ced6" }} />}
          </div>
          <ul className="mt-2.5 space-y-1 text-[13px]">
            {top.map((l) => (
              <li key={l.language} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                <span className="font-medium">{l.language}</span>
                <span className="text-ink-soft">{l.files.toLocaleString()} files</span>
                <span className="ml-auto font-mono text-[12px]">{l.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">Largest files</h3>
          <ol className="mt-1.5 space-y-1">
            {s.largest.slice(0, 6).map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => onPick(f.path)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white" title={f.path}>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{f.path}</span>
                  <span className="font-mono text-[12px] text-ink-soft">{f.loc.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {(s.filesSkipped > 0 || layout.aggregatedFiles || project.warnings.length > 0) && (
          <div className="space-y-1.5 border-t border-line pt-3 text-[12.5px] text-ink-soft">
            {Object.entries(s.skipped).map(([k, v]) => (
              <p key={k}>
                Skipped {v?.toLocaleString()} · {SKIP_LABEL[k] ?? k}
              </p>
            ))}
            {!!layout.aggregatedFiles && <p>{layout.aggregatedFiles.toLocaleString()} small files are grouped into blocks to keep the city smooth.</p>}
            {project.warnings.map((w) => (
              <p key={w} className="text-[#6b5200]">{w}</p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
