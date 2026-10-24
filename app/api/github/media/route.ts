import { isSecretPath, mediaMime, MEDIA_MAX_BYTES, normalizePath, skipReason } from "@/lib/analyze/rules";
import { isValidOwner, isValidRepo, isValidRef } from "@/lib/github";
import { getRawBytes, ImportError } from "@/lib/server/githubApi";
import { clientKey, hit, LIMITS } from "@/lib/server/rateLimit";

/**
 * GET ?owner&repo&ref&path -> one public audio / video file (mp3, wav, ogg, m4a, flac, mp4, webm), at most 10 MB,
 * for the HTML5 player. Only raw.githubusercontent.com is ever contacted; the content type comes from the
 * extension allowlist, never from upstream, and the bytes are served as an attachment-safe media type.
 */
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
  const mime = mediaMime(path);
  if (!mime || skipReason(path)) return new Response("Not a playable audio / video file.", { status: 415 });
  try {
    const bytes = await getRawBytes(owner, repo, ref, path, MEDIA_MAX_BYTES);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    const status = e instanceof ImportError ? (e.code === "not-found" ? 404 : e.code === "too-large" ? 413 : 502) : 502;
    return new Response(e instanceof Error ? e.message : "Failed", { status });
  }
}
