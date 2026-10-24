import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** City page top bar: project name and a New import link. */
export function TopBar({
  project,
  sourceLabel,
  badge,
  actions,
}: {
  project: string;
  sourceLabel: string;
  /** Phase 2: badge text (real imports show their size). */
  badge?: string;
  /** Phase 2: extra buttons left of "New import" (e.g. Project stats). */
  actions?: ReactNode;
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-[color-mix(in_oklab,#f6f7f9_88%,transparent)] px-5 backdrop-blur-md">
      <Logo />
      <span className="h-6 w-px bg-line" aria-hidden />
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate font-mono text-[15px] font-semibold">{project}</h1>
        <span className="text-[12px] text-ink-soft">{sourceLabel}</span>
      </div>
      {badge && <span className="rounded-full bg-[#fff4cf] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#7a5a00]">{badge}</span>}
      <div className="flex-1" />
      {actions}
      <Link href="/" className="btn-ghost px-3.5 py-1.5 text-[13.5px]">
        New import
      </Link>
    </header>
  );
}
