"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseGitHubUrl } from "@/lib/github";
import { cityHref } from "@/lib/importStub";
import { ClientImportError, importFolder, importGithub, importZipFile } from "@/lib/client/importClient";
import { saveProject } from "@/lib/client/projectStore";
import type { ImportProgress, ImportSource, Project } from "@/lib/types";
import { DropZone, type Picked } from "./DropZone";
import { LoadingSteps } from "./LoadingSteps";
import { Logo } from "./Logo";
import { Credit } from "./Credit";

/** "/" : GitHub link is the primary import; zip/folder is the secondary option below it. */
export function ImportScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [loading, setLoading] = useState<LoadState | null>(null);

  const parsed = parseGitHubUrl(url);
  const urlInvalid = touched && url.trim() !== "" && !parsed;

  /** Phase 2: real import with live progress (replaces the Phase 1 stub). */
  const start = async (source: ImportSource) => {
    const title = source.kind === "github" ? `${source.owner}/${source.repo}` : source.name;
    const stages = source.kind === "github" ? GITHUB_STAGES : LOCAL_STAGES;
    const st: LoadState = { title, stages, step: 0, details: [], ratio: 0 };
    setLoading({ ...st });
    const emit = (p: ImportProgress) => {
      const i = stages.findIndex((x) => x.stage === p.stage);
      if (i < 0) return;
      st.step = i;
      st.details = [...st.details];
      st.details[i] = p.detail;
      st.ratio = p.ratio ?? 0.5;
      setLoading({ ...st });
    };
    try {
      let project: Project;
      if (source.kind === "github") project = await importGithub(source.url, emit);
      else if (source.kind === "zip" && source.file) project = await importZipFile(source.file, emit);
      else if (source.kind === "folder" && source.files) project = await importFolder(source.name, source.files, emit);
      else throw new ClientImportError("empty", "Pick the file or folder again.");
      emit({ stage: "city", detail: `${project.files.length.toLocaleString()} buildings`, ratio: 0.6 });
      await saveProject(project);
      router.push(cityHref(source.kind === "github" && project.source.kind === "github" ? { ...source, owner: project.source.owner, repo: project.source.repo } : source));
    } catch (e) {
      const err = e instanceof ClientImportError ? e : new ClientImportError("upstream", "Something went wrong while reading this project.");
      setLoading({ ...st, error: { title: ERROR_TITLES[err.code] ?? "Import failed", message: errorMessage(err) } });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setFormError(null);
    if (url.trim()) {
      if (!parsed) return;
      void start({ kind: "github", ...parsed, url: url.trim() });
    } else if (picked) {
      void start(picked);
    } else {
      setFormError("Paste a GitHub repo link, or pick a .zip or folder below.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between px-10">
        <Logo />
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-soft">Free · public repos · your own Gemini key</span>
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-6 pb-16">
        <h1 className="text-[54px] font-[780] leading-[1.02] tracking-[-0.04em]">
          See your code
          <br />
          as a city.
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
          Paste a public GitHub repo. CodeLens turns its folders into districts and its files into buildings, so you can see what the
          project is made of before you read a single line.
        </p>

        <form onSubmit={onSubmit} className="card mt-8 p-6" noValidate>
          <label htmlFor="repo" className="flex items-center gap-2 text-[14px] font-semibold">
            <GitHubIcon /> GitHub repository
          </label>
          <div className="mt-2.5 flex gap-3">
            <input
              id="repo"
              name="repo"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setFormError(null);
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={urlInvalid || undefined}
              aria-describedby="repo-help"
              disabled={!!loading}
              className={`h-12 flex-1 rounded-[10px] border bg-white px-4 font-mono text-[15px] outline-none transition-shadow placeholder:text-[#9aa1ad] focus:shadow-[0_0_0_3px_rgb(255_194_26/0.45)] ${
                urlInvalid ? "border-[#b3261e]" : "border-line focus:border-ink"
              }`}
            />
            <button type="submit" className="btn-primary h-12 px-6 text-[16px]" disabled={!!loading}>
              Build my city
            </button>
          </div>
          <p id="repo-help" className={`mt-2 text-[13px] ${urlInvalid ? "text-[#b3261e]" : "text-ink-soft"}`}>
            {urlInvalid
              ? "That doesn't look like a GitHub repo link. Try github.com/owner/repo."
              : parsed
                ? `Ready: ${parsed.owner}/${parsed.repo}`
                : "Public repos only. Example: github.com/facebook/react"}
          </p>
          {formError && <p className="mt-1 text-[13px] text-[#b3261e]">{formError}</p>}

          <div className="my-5 flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-soft">
            <span className="h-px flex-1 bg-line" />
            or drop a .zip or project folder
            <span className="h-px flex-1 bg-line" />
          </div>
          <DropZone picked={picked} onPick={setPicked} onBuild={() => picked && start(picked)} disabled={!!loading} />
        </form>

        <ul className="mt-6 grid grid-cols-3 gap-4 text-[13.5px] text-ink-soft">
          <li><b className="block text-ink">Folders are districts</b>Each top-level folder gets its own block.</li>
          <li><b className="block text-ink">Files are buildings</b>Big core files are towers, small parts are shops.</li>
          <li><b className="block text-ink">No AI for the map</b>The city is built from the file tree alone.</li>
        </ul>
      </main>

      <footer className="flex h-12 items-center justify-between px-10">
        <Credit />
        <span className="text-[11.5px] text-ink-soft">CodeLens · college showcase project by Maverick</span>
      </footer>

      {loading && (
        <LoadingSteps
          title={loading.title}
          active={loading.step}
          steps={loading.stages.map((x) => x.label)}
          details={loading.details}
          ratio={loading.ratio}
          error={loading.error && { ...loading.error, onClose: () => setLoading(null) }}
        />
      )}
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="#12161c" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

interface LoadState {
  title: string;
  stages: { stage: ImportProgress["stage"]; label: string }[];
  step: number;
  details: (string | undefined)[];
  ratio: number;
  error?: { title: string; message: string };
}

const GITHUB_STAGES: LoadState["stages"] = [
  { stage: "repo", label: "Checking the repo" },
  { stage: "tree", label: "Reading the file tree" },
  { stage: "download", label: "Downloading the source" },
  { stage: "analyze", label: "Analyzing files" },
  { stage: "city", label: "Building the city" },
];
const LOCAL_STAGES: LoadState["stages"] = [
  { stage: "read", label: "Reading files in your browser" },
  { stage: "analyze", label: "Analyzing files" },
  { stage: "city", label: "Building the city" },
];

const ERROR_TITLES: Record<string, string> = {
  "invalid-url": "Not a GitHub repo link",
  "not-found": "Repo not found",
  private: "Private repo",
  "rate-limited": "GitHub rate limit reached",
  "too-large": "Too large to import",
  empty: "Nothing to show",
  network: "Connection problem",
  "bad-zip": "Not a zip file",
};

function errorMessage(e: ClientImportError): string {
  if (e.code === "rate-limited" && e.resetAt) {
    const t = new Date(e.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${e.message} It resets at ${t}. You can still drop a .zip or folder meanwhile.`;
  }
  return e.message;
}
