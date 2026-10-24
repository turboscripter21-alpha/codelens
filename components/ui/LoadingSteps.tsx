"use client";

import { IMPORT_STEPS } from "@/lib/importStub";

interface Props {
  title: string;
  active: number;
  /** Phase 2: real step labels (defaults to the Phase 1 stub steps). */
  steps?: readonly string[];
  /** Phase 2: live detail text per step, e.g. "3.2 MB" or "1,204 / 3,000 files". */
  details?: (string | undefined)[];
  /** Phase 2: progress inside the active step, 0..1. */
  ratio?: number;
  /** Phase 2: import failed; show the message in the same card. */
  error?: { title: string; message: string; onClose: () => void };
}

/** Loading state while an import is being indexed. Steps tick from pending to done. */
export function LoadingSteps({ title, active, steps = IMPORT_STEPS, details = [], ratio = 0.5, error }: Props) {
  const pct = Math.round(((active + Math.min(1, Math.max(0, ratio))) / steps.length) * 100);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,#e7eaee_80%,transparent)] backdrop-blur-[3px]" role="status" aria-live="polite">
      <div className="card anim-pop w-[440px] p-7">
        <p className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${error ? "text-[#b3261e]" : "text-ink-soft"}`}>{error ? "Import failed" : "Building your city"}</p>
        <h2 className="mt-1 truncate text-[22px] font-[720] tracking-[-0.02em]">{title}</h2>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,#12161c_10%,transparent)]">
          <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${error ? "bg-[#b3261e]" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-5 space-y-2.5">
          {steps.map((s, i) => {
            const state = i < active ? "done" : i === active ? (error ? "failed" : "active") : "pending";
            return (
              <li key={s} className={`flex items-center gap-3 text-[15px] ${state === "pending" ? "text-ink-soft/60" : "text-ink"}`}>
                <span className="grid h-5 w-5 place-items-center" aria-hidden>
                  {state === "done" ? (
                    <svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#12161c" /><path d="M6 10.5l2.6 2.5L14 7.5" stroke="#ffc21a" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : state === "failed" ? (
                    <svg width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#b3261e" /><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
                  ) : state === "active" ? (
                    <span className="anim-spin block h-4 w-4 rounded-full border-2 border-ink border-t-transparent" />
                  ) : (
                    <span className="block h-3.5 w-3.5 rounded-full border-2 border-[color-mix(in_oklab,#12161c_25%,transparent)]" />
                  )}
                </span>
                <span className={state === "active" || state === "failed" ? "font-semibold" : ""}>{s}</span>
                {details[i] && state !== "pending" && <span className="ml-auto truncate pl-3 font-mono text-[12px] text-ink-soft">{details[i]}</span>}
              </li>
            );
          })}
        </ol>
        {error && (
          <div className="mt-5 rounded-xl border border-[#f1c4c0] bg-[#fdf1f0] p-4" role="alert">
            <p className="text-[14px] font-semibold text-[#8c1d18]">{error.title}</p>
            <p className="mt-1 text-[13.5px] text-[#5f2120]">{error.message}</p>
            <button type="button" onClick={error.onClose} className="btn-ghost mt-3 px-3.5 py-1.5 text-[13.5px]">
              Back to import
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
