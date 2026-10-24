"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ImportSource } from "@/lib/types";
import { filesFromEntry } from "@/lib/client/importClient";

export type Picked = Extract<ImportSource, { kind: "zip" } | { kind: "folder" }>;

interface Props {
  picked: Picked | null;
  onPick: (p: Picked | null) => void;
  onBuild: () => void;
  disabled?: boolean;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Secondary import option: drop a .zip or a project folder, or use the pickers. */
export function DropZone({ picked, onPick, onBuild, disabled }: Props) {
  const zipRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // webkitdirectory is not in React's input props, so set it on the element.
  useEffect(() => {
    dirRef.current?.setAttribute("webkitdirectory", "");
    dirRef.current?.setAttribute("directory", "");
  }, []);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    setError(null);
    const item = e.dataTransfer.items?.[0];
    const entry = item?.webkitGetAsEntry?.();
    const file = e.dataTransfer.files?.[0];
    if (entry?.isDirectory) {
      // Phase 2: keep the File objects so the browser can read them (still never uploaded).
      const files = await filesFromEntry(entry);
      onPick({ kind: "folder", name: entry.name, fileCount: files.length, files });
    } else if (file && /\.zip$/i.test(file.name)) {
      onPick({ kind: "zip", name: file.name, bytes: file.size, file });
    } else {
      setError("Drop a .zip file or a project folder.");
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!over) setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
        }}
        onDrop={onDrop}
        data-dragover={over || undefined}
        data-testid="dropzone"
        className={`rounded-xl border-2 border-dashed px-5 py-5 transition-colors ${
          over ? "border-ink bg-white" : "border-[color-mix(in_oklab,#12161c_22%,transparent)] bg-[color-mix(in_oklab,#fff_45%,transparent)]"
        }`}
      >
        {picked ? (
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e8f0e0]" aria-hidden>
              {picked.kind === "zip" ? <ZipIcon /> : <FolderIcon />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{picked.name}</p>
              <p className="text-[13px] text-ink-soft">
                {picked.kind === "zip" ? `Zip file, ${formatBytes(picked.bytes)}` : `Folder, ${picked.fileCount.toLocaleString()} files`}
                {" "}· stays on your computer
              </p>
            </div>
            <button type="button" className="btn-ghost px-3 py-2 text-[13px]" onClick={() => onPick(null)} disabled={disabled}>
              Remove
            </button>
            <button type="button" className="btn-primary px-4 py-2 text-[14px]" onClick={onBuild} disabled={disabled}>
              Build from this
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white" aria-hidden>
              <UploadIcon />
            </span>
            <div className="flex-1">
              <p className="font-semibold">{over ? "Let go to add it" : "Drop a .zip or project folder here"}</p>
              <p className="text-[13px] text-ink-soft">Read in your browser. Nothing is uploaded.</p>
            </div>
            <button type="button" className="btn-ghost px-3 py-2 text-[13px]" onClick={() => zipRef.current?.click()} disabled={disabled}>
              Choose .zip
            </button>
            <button type="button" className="btn-ghost px-3 py-2 text-[13px]" onClick={() => dirRef.current?.click()} disabled={disabled}>
              Choose folder
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-[13px] text-[#b3261e]">{error}</p>}
      <input
        ref={zipRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick({ kind: "zip", name: f.name, bytes: f.size, file: f });
          e.target.value = "";
        }}
      />
      <input
        ref={dirRef}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length) {
            const list = [...files].map((f) => ({ file: f, path: (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name }));
            const name = list[0].path.split("/")[0] || "project";
            onPick({ kind: "folder", name, fileCount: files.length, files: list });
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#12161c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#9fd36a" stroke="#12161c" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function ZipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#f6d37a" stroke="#12161c" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M11 6h2M11 9h2M11 12h2M11 15h2v3h-2z" fill="none" />
    </svg>
  );
}
