import { clearCookie } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";

/** POST /api/auth/logout: clear the session cookie. */
export async function POST(req: Request) {
  const r = await readJson(req, 256);
  if ("error" in r) return r.error;
  return json(200, { ok: true }, { "Set-Cookie": clearCookie() });
}
