"use client";

import { useEffect, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { prismLanguage } from "@/lib/analyze/language";
import type { FileNode, Project } from "@/lib/types";

const SHORT = 40;

/**
 * Phase 3: small read-only preview with line numbers (prism-react-renderer, light theme).
 * Uses the stored preview text; for GitHub files that did not fit in the import response,
 * it fetches the first 64 KB on demand from /api/github/file. Secrets never reach here.
 */
export default function CodePreview({ file, project }: { file: FileNode; project: Project }) {
  const stored = project.previews[file.path];
  const [fetched, setFetched] = useState<{ path: string; text: string | null; error?: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const src = project.source;
  const canFetch = stored === undefined && src.kind === "github" && !file.binary && !file.secret;

  useEffect(() => {
    if (!canFetch || src.kind !== "github") return;
    let live = true;
    const q = new URLSearchParams({ owner: src.owner, repo: src.repo, ref: src.branch, path: file.path });
    fetch(`/api/github/file?${q}`)
      .then(async (r) => (r.ok ? { path: file.path, text: await r.text() } : { path: file.path, text: null, error: await r.text() }))
      .catch(() => ({ path: file.path, text: null, error: "Could not load the preview." }))
      .then((v) => live && setFetched(v));
    return () => {
      live = false;
    };
  }, [canFetch, src, file.path]);

  const text = stored ?? (fetched?.path === file.path ? fetched.text : null);
  let body;
  if (file.binary) body = <p className="text-[13px] text-ink-soft">Binary file, no preview.</p>;
  else if (text === null || text === undefined) {
    body = (
      <p className="text-[13px] text-ink-soft">
        {canFetch ? (fetched?.path === file.path ? (fetched.error ?? "No preview.") : "Loading preview…") : file.estimated ? "Too large to read; no preview." : "No preview stored for this file."}
      </p>
    );
  } else {
    const all = text.replace(/\n$/, "").split("\n");
    const shown = (expanded ? all : all.slice(0, SHORT)).join("\n");
    body = (
      <>
        <Highlight theme={themes.github} code={shown} language={prismLanguage(file.path)}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-line bg-white py-2 font-mono text-[12px] leading-[1.55]" data-testid="code-preview">
              {tokens.map((line, i) => {
                const { key: _k, ...lineProps } = getLineProps({ line, key: i }) as ReturnType<typeof getLineProps> & { key?: unknown };
                void _k;
                return (
                  <div key={i} {...lineProps} className="flex px-0">
                    <span className="w-10 shrink-0 select-none pr-3 text-right text-[#a0a7b2]">{i + 1}</span>
                    <span className="whitespace-pre pr-3">
                      {line.map((token, j) => {
                        const { key: _t, ...tp } = getTokenProps({ token, key: j }) as ReturnType<typeof getTokenProps> & { key?: unknown };
                        void _t;
                        return <span key={j} {...tp} />;
                      })}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
        {all.length > SHORT && (
          <button type="button" className="btn-ghost mt-2 px-3 py-1 text-[12.5px]" onClick={() => setExpanded((v) => !v)}>
            {expanded ? `Show first ${SHORT} lines` : `Show ${Math.min(all.length, 400) - SHORT} more lines`}
          </button>
        )}
      </>
    );
  }
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-soft">Code preview (read-only)</h3>
      {body}
    </div>
  );
}
