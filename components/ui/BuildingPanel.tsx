"use client";

import dynamic from "next/dynamic";
import type { Building, Project } from "@/lib/types";
import { Facts, LinkList, TierBadge, tierOf } from "./buildingInfo";

// Phase 3: the highlighted code preview is lazy-loaded the first time a panel opens.
const CodePreview = dynamic(() => import("./CodePreview"), { ssr: false, loading: () => <p className="text-[13px] text-ink-soft">Loading preview…</p> });

interface Props {
  building: Building;
  /** Phase 2: the analyzed project (absent for the Phase 1 sample). */
  project?: Project;
  onMinimize: () => void;
  onClose: () => void;
  onPick: (path: string) => void;
}

/** Maximized left-side panel. Shown after the SECOND (or third) click on the same building. */
export function BuildingPanel({ building: b, project, onMinimize, onClose, onPick }: Props) {
  const crumbs = b.path.split("/");
  return (
    <aside
      key={b.id}
      className="anim-slide absolute bottom-0 left-0 top-14 z-20 flex w-[460px] flex-col border-r border-line bg-surface shadow-[18px_0_40px_-28px_rgb(30_40_60/0.45)]"
      aria-label={`Full details for ${b.name}`}
      data-testid="building-panel"
    >
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-soft">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="px-1 text-[#a0a7b2]">/</span>}
              <span className={i === crumbs.length - 1 ? "font-semibold text-ink" : ""}>{c}</span>
            </span>
          ))}
        </p>
        <button type="button" onClick={onMinimize} className="btn-ghost px-2.5 py-1 text-[12.5px]" title="Back to pop-up">
          Minimize
        </button>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-soft hover:bg-white hover:text-ink" aria-label="Close" title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 rounded-md border border-line" style={{ background: b.color }} aria-hidden />
            <h2 className="truncate font-mono text-[24px] font-bold tracking-[-0.02em]">{b.name}</h2>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <TierBadge tier={tierOf(b)} />
            <span className="text-[12px] text-ink-soft">{b.height.toFixed(1)} m tall in the city</span>
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">What it does</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed">{b.file.description}</p>
          <p className="mt-2 text-[12px] text-ink-soft">
            {project ? "Short summary from the file type. A plain-English explanation comes with your own Gemini key (Phase 4)." : "Placeholder text. Phase 4 writes this with your own Gemini key."}
          </p>
        </div>

        {b.file.secret && (
          <div className="rounded-xl border border-[#cfd4da] bg-[#eef0f3] p-4" data-testid="vault-note">
            <p className="text-[14px] font-semibold">Vault: contents never read</p>
            <p className="mt-1 text-[13px] text-ink-soft">
              This looks like a secrets file ({b.name}). CodeLens only shows where secrets live, by name. It never reads, stores or sends what is inside.
            </p>
          </div>
        )}

        <Facts b={b} wide />

        {b.file.members && <LinkList title={`Files in this block (${b.file.members.length})`} items={b.file.members} onPick={onPick} />}

        {project && !b.file.secret && !b.file.members && <CodePreview file={b.file} project={project} />}

        <div className="space-y-4">
          <LinkList title="Uses" items={b.file.uses ?? []} onPick={onPick} />
          <LinkList title="Used by" items={b.file.usedBy ?? []} onPick={onPick} />
        </div>

        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">Why this size</h3>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,#12161c_8%,transparent)]">
            <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (b.score / 420) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-soft">Height comes from line count weighted by file kind ({b.file.kind}){b.file.importance !== undefined ? ", plus how many files import it" : ""}. Core files rise highest.</p>
        </div>

        <div className="rounded-xl border border-dashed border-line p-4">
          <p className="text-[14px] font-semibold">Talk to this file</p>
          <p className="mt-1 text-[13px] text-ink-soft">Ask questions about this file and read it line by line. Coming in Phase 4.</p>
          <button type="button" disabled className="btn-primary mt-3 px-4 py-2 text-[14px]">Ask about {b.name}</button>
        </div>
      </div>
    </aside>
  );
}
