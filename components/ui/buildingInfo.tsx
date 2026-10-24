import type { Building, Tier } from "@/lib/types";

export const TIER_LABEL: Record<Tier | "vault", string> = { tower: "Tall tower · core", mid: "Medium · office", shop: "Small shop · small part", vault: "Vault · secrets" };
export const TIER_DOT: Record<Tier | "vault", string> = { tower: "#2f5bd8", mid: "#ff8a1f", shop: "#3fae3a", vault: "#4b5563" };

/** Phase 2: secrets show as Vaults, aggregated blocks as "Block". */
export function tierOf(b: Building): Tier | "vault" {
  return b.file.secret || b.style === "vault" ? "vault" : b.tier;
}

export function TierBadge({ tier }: { tier: Tier | "vault" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-[11.5px] font-semibold">
      <span className="h-2 w-2 rounded-full" style={{ background: TIER_DOT[tier] }} />
      {TIER_LABEL[tier]}
    </span>
  );
}

export function Facts({ b, wide = false }: { b: Building; wide?: boolean }) {
  const f = b.file;
  const analyzed = f.loc !== undefined;
  const linesText = f.secret ? "not read" : f.binary || (!f.lines && !analyzed) ? "binary" : (analyzed ? f.loc! : f.lines!).toLocaleString() + (f.estimated ? " (est.)" : "");
  const rows: [string, string][] = [
    [analyzed ? "LOC" : "Lines", linesText],
    ["Language", f.language ?? "Unknown"],
    ["District", b.district],
  ];
  if (wide) {
    rows.push(["Size", f.bytes ? (f.bytes < 1024 ? `${f.bytes} B` : `${(f.bytes / 1024).toFixed(1)} KB`) : "n/a"], ["Kind", f.kind ?? "file"], ["Height score", String(b.score)]);
    if (analyzed) rows.push(["Total lines", f.secret ? "not read" : (f.lines ?? 0).toLocaleString()], ["Importance", String(f.importance ?? 0)], ["Imported by", String(f.usedBy?.length ?? 0)]);
  }
  return (
    <dl className={`grid gap-x-4 gap-y-2 ${wide ? "grid-cols-3" : "grid-cols-3"}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">{k}</dt>
          <dd className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
            {k === "Language" && f.langColor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.langColor }} aria-hidden />}
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkList({ title, items, onPick }: { title: string; items: string[]; onPick?: (p: string) => void }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">{title}</p>
      {items.length ? (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {items.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPick?.(p)}
                className="rounded-md border border-line bg-white px-2 py-0.5 font-mono text-[12px] hover:border-ink"
                title={p}
              >
                {p.split("/").pop()}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-ink-soft">Nothing yet</p>
      )}
    </div>
  );
}
