"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { buildCityLayout } from "@/lib/layout";
import { projectToTree } from "@/lib/projectTree";
import { loadProject } from "@/lib/client/projectStore";
import type { Project } from "@/lib/types";
import { MetricsPanel } from "./MetricsPanel";
import { TopBar } from "./TopBar";
import { BuildingPopup } from "./BuildingPopup";
import { BuildingPanel } from "./BuildingPanel";
import { Credit } from "./Credit";
import { TIER_DOT, TIER_LABEL } from "./buildingInfo";

const CityCanvas = dynamic(() => import("@/components/city/CityCanvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-ink-soft">Raising buildings…</div>,
});

const EMPTY: Project = {
  name: "",
  source: { kind: "folder", name: "" },
  files: [],
  previews: {},
  stats: { totalLoc: 0, totalLines: 0, totalBytes: 0, filesCounted: 0, filesSkipped: 0, skipped: {}, secrets: 0, binaries: 0, languages: [], largest: [], imports: 0 },
  warnings: [],
  createdAt: 0,
};

type Selection = { id: string; mode: "popup" | "panel" } | null;

/** "/city": renders the imported project's city and handles the click-to-expand flow. No sample data: nothing imported means an empty state. */
export function CityScreen() {
  const params = useSearchParams();
  const source = params.get("source") ?? "";
  // The imported project lives in the browser (IndexedDB). There is no sample fallback.
  const [data, setData] = useState<Project | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadProject().then((p) => live && setData(p));
    return () => {
      live = false;
    };
  }, [source]);
  const project = data?.name ?? params.get("repo") ?? params.get("name") ?? "";
  const sourceLabel =
    source === "github" ? "from GitHub" : source === "zip" ? "from a .zip" : source === "folder" ? "from a folder" : "";
  const showFps = params.get("fps") === "1";

  // The city is built only from the imported project's analyzed tree.
  const layout = useMemo(() => buildCityLayout(projectToTree(data ?? EMPTY)), [data]);
  const statsProject = data ?? EMPTY;
  const [showStats, setShowStats] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const selected = sel ? (layout.buildings.find((b) => b.id === sel.id) ?? null) : null;

  /** 1st click = pop-up. Same building again (2nd/3rd click) = full panel. Other building = pop-up for it. */
  const onBuildingClick = useCallback((id: string) => {
    setSel((prev) => (prev?.id === id ? { id, mode: "panel" } : { id, mode: "popup" }));
  }, []);
  const close = useCallback(() => setSel(null), []);
  /** Uses / Used by / largest-file links: select that building (or the block holding it) and fly the camera to it. */
  const pick = useCallback(
    (path: string, mode: "popup" | "panel" = "popup") => {
      const b = layout.buildings.find((x) => x.id === path) ?? layout.buildings.find((x) => x.file.members?.includes(path));
      if (!b) return;
      setSel({ id: b.id, mode });
      setFocus((f) => ({ id: b.id, n: (f?.n ?? 0) + 1 }));
    },
    [layout],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Test hook: lets the screenshot script find buildings (read-only data, no contents).
  useEffect(() => {
    (window as unknown as { __codelensLayout?: unknown }).__codelensLayout = layout;
  }, [layout]);

  const focusTarget = useMemo(() => {
    const b = focus ? layout.buildings.find((x) => x.id === focus.id) : null;
    return b && focus ? { x: b.x, y: b.height * 0.5, z: b.z, n: focus.n } : null;
  }, [focus, layout]);

  if (data === undefined) {
    return <div className="grid h-screen place-items-center text-ink-soft">Loading city…</div>;
  }
  if (data === null) {
    return (
      <div className="grid h-screen place-items-center bg-[#e4ecf2] text-center">
        <div>
          <p className="text-[22px] font-semibold text-ink">Import a repo first</p>
          <p className="mt-2 text-[14px] text-ink-soft">Nothing has been imported yet. Paste a GitHub link or drop a .zip or folder.</p>
          <a href="/app-legacy" className="btn-primary mt-5 inline-block px-5 py-2.5">Back to import</a>
        </div>
      </div>
    );
  }
  const badge = data ? `${data.stats.totalLoc.toLocaleString()} LOC · ${data.stats.filesCounted.toLocaleString()} files` : undefined;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#e4ecf2]">
      <CityCanvas
        layout={layout}
        selectedId={sel?.id ?? null}
        onBuildingClick={onBuildingClick}
        onEmptyClick={close}
        showFps={showFps}
        leftInset={sel?.mode === "panel" ? 460 : 0}
        focus={focusTarget}
      />
      <TopBar
        project={project}
        sourceLabel={sourceLabel}
        badge={badge}
        actions={
          <button type="button" onClick={() => setShowStats((v) => !v)} aria-pressed={showStats} className={`btn-ghost px-3.5 py-1.5 text-[13.5px] ${showStats ? "border-ink bg-white" : ""}`}>
            Project stats
          </button>
        }
      />
      {showStats && <MetricsPanel project={statsProject} layout={layout} onPick={(p) => pick(p, "popup")} onClose={() => setShowStats(false)} />}
      {!!data?.warnings.length && !showStats && (
        <p className="absolute right-5 top-[68px] z-20 max-w-[380px] rounded-lg border border-[#f0d98a] bg-[#fff8dc] px-3 py-2 text-[12.5px] text-[#6b5200]">{data.warnings[0]}</p>
      )}

      {selected && sel?.mode === "popup" && (
        <BuildingPopup building={selected} onExpand={() => setSel({ id: selected.id, mode: "panel" })} onClose={close} onPick={pick} />
      )}
      {selected && sel?.mode === "panel" && (
        <BuildingPanel building={selected} project={data ?? undefined} onMinimize={() => setSel({ id: selected.id, mode: "popup" })} onClose={close} onPick={pick} />
      )}

      {!selected && (
        <p className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,#f6f7f9_90%,transparent)] px-4 py-2 text-[13px] text-ink-soft shadow-sm">
          Click a building to see the file. Click it again to open the full panel. Drag to orbit, scroll to zoom.
        </p>
      )}

      <div className="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2">
        <ul className="card flex gap-4 px-4 py-2.5 text-[12px]">
          {(["tower", "mid", "shop", "vault"] as const).map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: TIER_DOT[t] }} />
              {TIER_LABEL[t]}
            </li>
          ))}
          <li className="text-ink-soft">
            {layout.buildings.length} {layout.aggregatedFiles ? "buildings" : "files"} · {layout.districts.length} districts
          </li>
        </ul>
        <Credit className="rounded-md bg-[color-mix(in_oklab,#f6f7f9_80%,transparent)] px-2 py-0.5" />
      </div>

      {showFps && (
        <p id="cl-fps" className="absolute right-5 top-[68px] z-30 rounded-md bg-ink px-2.5 py-1 font-mono text-[12px] text-white">
          measuring…
        </p>
      )}
    </div>
  );
}
