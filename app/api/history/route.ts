import { sessionOf, sameOrigin } from "@/lib/server/auth";
import { addHistory, deleteHistory, isId, listHistory, parseHistoryInput, MAX_ANALYSIS_BYTES } from "@/lib/server/history";
import { json, readJson } from "@/lib/server/http";
import { clientKey, hit } from "@/lib/server/rateLimit";

/**
 * GET    /api/history          list (signed-in users)
 * POST   /api/history          save an import {kind, title, url?, stats, analysis?}; guests get {saved:false}
 * DELETE /api/history?id=…     delete one entry (or ?all=1 for every entry)
 */
const NEED = "Log in with email to keep your history.";

export async function GET(req: Request) {
  const s = sessionOf(req);
  if (!s) return json(401, { error: NEED });
  try {
    return json(200, { user: { email: s.email }, items: await listHistory(s.uid) });
  } catch {
    return json(503, { error: "History is unavailable right now." });
  }
}

export async function POST(req: Request) {
  const r = await readJson(req, MAX_ANALYSIS_BYTES * 2);
  if ("error" in r) return r.error;
  const s = sessionOf(req);
  if (!s) return json(200, { saved: false, reason: NEED });
  const wait = hit("history", s.uid + "|" + clientKey(req), 30, 10 * 60 * 1000);
  if (wait) return json(429, { error: "Too many saves. Wait a few minutes." }, { "Retry-After": String(wait) });
  const p = parseHistoryInput(r.body);
  if (!p.ok) return json(400, { error: p.error });
  try {
    return json(200, { saved: true, id: await addHistory(s.uid, p.value) });
  } catch {
    return json(503, { error: "History is unavailable right now." });
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Cross-site request refused." });
  const s = sessionOf(req);
  if (!s) return json(401, { error: NEED });
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  if (q.get("all") !== "1" && !isId(id)) return json(400, { error: "Bad id." });
  try {
    return json(200, { deleted: await deleteHistory(s.uid, q.get("all") === "1" ? null : id) });
  } catch {
    return json(503, { error: "History is unavailable right now." });
  }
}
