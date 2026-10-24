import { sessionOf } from "@/lib/server/auth";
import { getAnalysis, isId } from "@/lib/server/history";
import { json } from "@/lib/server/http";

/** GET /api/history/item?id=…: the saved analysis of a zip / folder import (no file contents). */
export async function GET(req: Request) {
  const s = sessionOf(req);
  if (!s) return json(401, { error: "Log in with email to keep your history." });
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return json(400, { error: "Bad id." });
  try {
    const a = await getAnalysis(s.uid, id);
    if (!a) return json(404, { error: "Not found." });
    return new Response(`{"title":${JSON.stringify(a.title)},"kind":${JSON.stringify(a.kind)},"analysis":${a.analysis}}`, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return json(503, { error: "History is unavailable right now." });
  }
}
