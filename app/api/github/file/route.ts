import { imageMime, IMAGE_MAX_BYTES, isSecretPath, isBinaryExt, normalizePath, skipReason } from "@/lib/analyze/rules";
import { isValidOwner, isValidRef, isValidRepo } from "@/lib/github";
import { getRawBytes, getRawFile, ImportError } from "@/lib/server/githubApi";
import { clientKey, hit, LIMITS } from "@/lib/server/rateLimit";


/**
 * GET ?owner&repo&ref&path -> first 64 KB of one public file, for previews not included in the import. Secrets are refused.
 * GET ...&as=image -> the raw bytes of one public image (png, jpg, gif, webp, bmp, ico, avif, svg), at most 5 MB, with the
 * content type taken from the extension allowlist (never from upstream). Binary-safe; the browser shows it via a blob: <img>.
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
  if (q.get("as") === "image") {
    const mime = imageMime(path);
    if (!mime || skipReason(path)) return new Response("Not an image CodeLens can show.", { status: 415 });
    try {
      const bytes = await getRawBytes(owner, repo, ref, path, IMAGE_MAX_BYTES);
      return new Response(bytes as BodyInit, {
        headers: {
          "Content-Type": mime,
          "Content-Length": String(bytes.length),
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
          // SVG can carry script: never render it as a document from this origin, even if opened directly.
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          "Content-Disposition": mime === "image/svg+xml" ? "attachment" : "inline",
        },
      });
    } catch (e) {
      const status = e instanceof ImportError ? (e.code === "not-found" ? 404 : e.code === "too-large" ? 413 : 502) : 502;
      return new Response(e instanceof Error ? e.message : "Failed", { status });
    }
  }
  if (isBinaryExt(path) || skipReason(path)) return new Response("Not previewable.", { status: 415 });
  try {
    const text = await getRawFile(owner, repo, ref, path);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    const status = e instanceof ImportError && e.code === "not-found" ? 404 : 502;
    return new Response(e instanceof Error ? e.message : "Failed", { status });
  }
}
