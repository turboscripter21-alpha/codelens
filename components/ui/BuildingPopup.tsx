"use client";

import type { Building } from "@/lib/types";
import { Facts, LinkList, TierBadge, tierOf } from "./buildingInfo";

interface Props {
  building: Building;
  onExpand: () => void;
  onClose: () => void;
  onPick: (path: string) => void;
}

/** Compact pop-up, bottom-left. Shown after the FIRST click on a building. */
export function BuildingPopup({ building: b, onExpand, onClose, onPick }: Props) {
  return (
    <section
      key={b.id}
      className="card anim-pop absolute bottom-5 left-5 z-20 w-[360px] p-5"
      aria-label={`Details for ${b.name}`}
      data-testid="building-popup"
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line" style={{ background: b.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-mono text-[17px] font-bold">{b.name}</h2>
          <p className="truncate font-mono text-[12px] text-ink-soft">{b.path}</p>
        </div>
        <button type="button" onClick={onExpand} className="rounded-md p-1 text-ink-soft hover:bg-white hover:text-ink" aria-label="Expand to side panel" title="Expand">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
        </button>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-soft hover:bg-white hover:text-ink" aria-label="Close" title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="mt-3"><TierBadge tier={tierOf(b)} /></div>
      <p className="mt-3 text-[14px] leading-snug">{b.file.description}</p>
      <div className="mt-4"><Facts b={b} /></div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <LinkList title="Uses" items={b.file.uses ?? []} onPick={onPick} />
        <LinkList title="Used by" items={b.file.usedBy ?? []} onPick={onPick} />
      </div>
      <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-soft">Click the building again to open the full panel.</p>
    </section>
  );
}
