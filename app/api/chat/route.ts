import { buildRequest, errorFor, GEMINI_URL, isPlausibleKey, parseBody, textOf } from "@/lib/server/gemini";
import { clientKey, hit } from "@/lib/server/rateLimit";

/**
 * POST /api/chat: same-origin proxy to Gemini (CSP connect-src is 'self').
 * The key comes from the x-gemini-key header, is used for this one request and is never stored or logged.
 * Only the fixed Google endpoint is ever fetched (no user-controlled URL).
 */
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

export async function POST(req: Request) {
  const wait = hit("chat", clientKey(req), 20, 60 * 1000);
  if (wait) return json(429, { error: "Too many questions in a minute. Wait a few seconds." }, { "Retry-After": String(wait) });
  const key = req.headers.get("x-gemini-key");
  if (!isPlausibleKey(key)) return json(401, { error: "Add your free Gemini key first (Add Gemini key, top right)." });
  if (Number(req.headers.get("content-length") ?? 0) > 64 * 1024) return json(413, { error: "Question too large." });
  let raw: unknown;
  try {
    raw = JSON.parse((await req.text()).slice(0, 64 * 1024));
  } catch {
    return json(400, { error: "Bad request." });
  }
  const body = parseBody(raw);
  if (!body) return json(400, { error: "Type a question first." });
  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(buildRequest(body)),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    return json(504, { error: "Could not reach Gemini. Try again." });
  }
  if (!res.ok) {
    const e = errorFor(res.status);
    const ra = res.headers.get("retry-after");
    return json(e.status, { error: e.message }, ra && /^\d+$/.test(ra) ? { "Retry-After": ra } : {});
  }
  try {
    return json(200, { text: textOf(await res.json()) });
  } catch {
    return json(502, { error: "Gemini sent an answer CodeLens could not read." });
  }
}
