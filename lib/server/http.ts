/** JSON helpers shared by the auth + history routes. */
import "server-only";
import { sameOrigin } from "./auth";

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

/** State-changing requests: same-origin + JSON + size cap. Returns the parsed body or an error Response. */
export async function readJson(req: Request, maxBytes: number): Promise<{ body: unknown } | { error: Response }> {
  if (!sameOrigin(req)) return { error: json(403, { error: "Cross-site request refused." }) };
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return { error: json(415, { error: "Send JSON." }) };
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return { error: json(413, { error: "Request too large." }) };
  const text = await req.text();
  if (text.length > maxBytes) return { error: json(413, { error: "Request too large." }) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: json(400, { error: "Bad request." }) };
  }
}

/** Opt a GET route out of prerendering (cacheComponents forbids `export const dynamic`). Outside a Next request (unit tests) it is a no-op. */
export async function perRequest(): Promise<void> {
  const { connection } = await import("next/server");
  try { await connection(); } catch { /* not inside a Next request scope */ }
}
