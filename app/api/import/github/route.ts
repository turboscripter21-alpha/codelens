import { importGithub } from "@/lib/server/importGithub";
import { ImportError } from "@/lib/server/githubApi";
import type { ImportProgress } from "@/lib/types";
import { acquire, clientKey, hit, LIMITS } from "@/lib/server/rateLimit";

// Node.js runtime (the default). maxDuration lets Vercel run big imports for up to 60 s.
export const maxDuration = 60;

/**
 * POST { url } -> NDJSON stream:
 *   {"type":"progress", ...ImportProgress}
 *   {"type":"result","project":Project}   or   {"type":"error","code","message","resetAt"?}
 */
const busy = (message: string, retryAfter: number) =>
  Response.json(
    { type: "error", code: "rate-limited", message, resetAt: Date.now() + retryAfter * 1000 },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );

export async function POST(req: Request) {
  let url = "";
  try {
    // Small JSON body only ({ url }); refuse anything big before parsing it.
    const text = await req.text();
    if (text.length > 4096) throw new Error("too big");
    const body = JSON.parse(text) as { url?: unknown };
    url = body && typeof body.url === "string" ? body.url : "";
  } catch {
    return Response.json({ type: "error", code: "invalid-url", message: "Send JSON: { url }." }, { status: 400 });
  }
  const wait = hit("import", clientKey(req), LIMITS.importsPerWindow, LIMITS.importWindowMs);
  if (wait) return busy(`Too many imports from this address. Try again in ${Math.ceil(wait / 60)} min.`, wait);
  const release = acquire(LIMITS.concurrentImports);
  if (!release) return busy("CodeLens is busy with other imports. Try again in a moment.", 15);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    cancel() {
      release();
    },
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {
          /* client went away */
        }
      };
      try {
        const project = await importGithub(url, (p: ImportProgress) => send({ type: "progress", ...p }));
        send({ type: "result", project });
      } catch (e) {
        if (e instanceof ImportError) send({ type: "error", code: e.code, message: e.message, resetAt: e.resetAt });
        else {
          console.error("[import] failed", e instanceof Error ? e.message : e);
          send({ type: "error", code: "upstream", message: "Something went wrong while reading this repo." });
        }
      } finally {
        release();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
