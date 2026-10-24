/**
 * Strict GitHub URL parsing (SSRF-safe: only github.com, only owner/repo).
 * Accepts https://github.com/owner/repo, github.com/owner/repo, .git suffix,
 * trailing slash, and /tree/<branch>/... paths. Everything else is rejected.
 */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?(?:\/(?:tree|blob)\/[^\s?#]*)?\/?(?:[?#][^\s]*)?$/i);
  if (!m) return null;
  const [, owner, repo] = m;
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

export const isValidOwner = (s: string) => OWNER.test(s);
export const isValidRepo = (s: string) => REPO.test(s) && s !== "." && s !== "..";
/** Git ref names we are willing to put in a URL path. */
export const isValidRef = (s: string) => /^[A-Za-z0-9._/-]{1,200}$/.test(s) && !s.includes("..") && !s.startsWith("/") && !s.endsWith("/");
