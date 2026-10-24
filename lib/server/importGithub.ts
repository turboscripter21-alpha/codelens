import "server-only";
import { analyzeEntries } from "@/lib/analyze/analyze";
import { entryFromBytes, planEntries } from "@/lib/analyze/collect";
import { readZip } from "@/lib/analyze/zip";
import { parseGitHubUrl } from "@/lib/github";
import type { ImportProgress, Project } from "@/lib/types";
import { downloadZip, getRepoMeta, getTree, ImportError } from "./githubApi";

/** Preview text kept in the response; the rest is fetched on demand. Keeps responses well under Vercel's body limit. */
export const SERVER_PREVIEW_BUDGET = 1.25 * 1024 * 1024;

const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * GitHub import: repo metadata -> recursive tree -> one codeload zip (streamed, capped)
 * -> shared analyzer. Never executes repo code; contents are treated as plain text.
 */
export async function importGithub(url: string, emit: (p: ImportProgress) => void): Promise<Project> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new ImportError("invalid-url", "That doesn't look like a GitHub repo link. Use github.com/owner/repo.");

  emit({ stage: "repo", detail: `${parsed.owner}/${parsed.repo}` });
  const meta = await getRepoMeta(parsed.owner, parsed.repo);

  emit({ stage: "tree", detail: `branch ${meta.branch}` });
  const tree = await getTree(meta);
  const treePlan = planEntries(tree.entries.map((e) => ({ raw: e.path, size: e.size })), { stripRoot: false });
  if (!tree.entries.length) throw new ImportError("empty", "This repo has no files.");
  emit({ stage: "tree", detail: `${tree.entries.length.toLocaleString()} files, ${treePlan.keep.length.toLocaleString()} after ignore rules`, ratio: 1 });

  emit({ stage: "download", detail: "starting", ratio: 0 });
  const estimate = Math.max(1, meta.sizeKb * 1024 * 0.6);
  const zip = await downloadZip(meta, (n) => emit({ stage: "download", detail: mb(n), ratio: Math.min(0.98, n / estimate) }));

  const warnings: string[] = [];
  let entries;
  let plan;
  if (zip) {
    emit({ stage: "download", detail: `${mb(zip.length)} downloaded`, ratio: 1 });
    emit({ stage: "analyze", detail: "unpacking", ratio: 0 });
    ({ entries, plan } = readZip(zip, (d, t) => emit({ stage: "analyze", detail: `reading ${d.toLocaleString()} / ${t.toLocaleString()}`, ratio: (d / t) * 0.5 })));
  } else {
    if (tree.truncated) throw new ImportError("too-large", "This repo is too large to import (archive over 50 MB and file list truncated).");
    warnings.push("Archive is over 50 MB, so contents were not downloaded. Line counts are estimated from file sizes and Uses / Used by is empty.");
    emit({ stage: "download", detail: "over 50 MB, using the file tree only", ratio: 1 });
    plan = treePlan;
    entries = plan.keep.map((e) => entryFromBytes({ ...e, action: e.action === "read" ? "large" : e.action }));
  }
  if (tree.truncated) warnings.push("GitHub truncated the file tree for this repo.");
  if (!entries.length) throw new ImportError("empty", "No source files left after ignore rules.");

  emit({ stage: "analyze", detail: `${entries.length.toLocaleString()} files`, ratio: 0.6 });
  const project = analyzeEntries(entries, {
    name: `${meta.owner}/${meta.repo}`,
    source: { kind: "github", owner: meta.owner, repo: meta.repo, branch: meta.branch, url: `https://github.com/${meta.owner}/${meta.repo}` },
    skipped: plan.skipped,
    skippedExamples: plan.skippedExamples,
    warnings: [...plan.warnings, ...warnings],
    previewBudget: SERVER_PREVIEW_BUDGET,
  });
  emit({ stage: "analyze", detail: `${project.stats.totalLoc.toLocaleString()} lines of code`, ratio: 1 });
  return project;
}
