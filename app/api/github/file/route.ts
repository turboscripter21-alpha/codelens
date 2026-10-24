import { isSecretPath, isBinaryExt, normalizePath, skipReason } from "@/lib/analyze/rules";
import { isValidOwner, isValidRef, isValidRepo } from "@/lib/github";
import { getRawFile, ImportError } from "@/lib/server/githubApi";
import { clientKey, hit, LIMITS } from "@/lib/server/rateLimit";


/** GET ?owner&repo&ref&path -> first 64 KB of one public file, for previews not included in the import. Secrets are refused. */
export async function GET(req: Request) {
  const wait = hit("file", clientKey(req), LIMITS.filesPerMinute, 60 * 1000);
  if (wait) return new Response("Too many file requests. Slow down a little.", { status: 429, headers: { "Retry-After": String(wait) } });
  const q = new URL(req.url).searchParams;
  const owner = q.get("owner") ?? "";
  const repo = q.get("repo") ?? "";
  const ref = q.get("ref") ?? "";
  const path = normalizePath(q.get("path") ?? "");
  if (!isValidOwner(owner) || !isValidRepo(repo) || !isValidRef(ref) || !path) return new Response("Bad request", { status: 400 });
  if (isSecretPath(path)) return new Response("Secret files are never read.", { status: 403 });
  if (isBinaryExt(path) || skipReason(path)) return new Response("Not previewable.", { status: 415 });
  try {
    const text = await getRawFile(owner, repo, ref, path);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    const status = e instanceof ImportError && e.code === "not-found" ? 404 : 502;
    return new Response(e instanceof Error ? e.message : "Failed", { status });
  }
}
