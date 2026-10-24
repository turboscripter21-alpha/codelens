import { isCode, normalizeEmail, sessionCookie, verifyLogin, BAD_CODE } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";
import { clientKey, hit } from "@/lib/server/rateLimit";

/** POST /api/auth/verify {email, code}: check the code (5 attempts max) and set the session cookie. */
export async function POST(req: Request) {
  const r = await readJson(req, 2048);
  if ("error" in r) return r.error;
  const wait = hit("auth-verify", clientKey(req), 20, 10 * 60 * 1000);
  if (wait) return json(429, { error: "Too many attempts. Wait a few minutes." }, { "Retry-After": String(wait) });
  const b = (r.body ?? {}) as { email?: unknown; code?: unknown };
  const email = normalizeEmail(b.email);
  const code = typeof b.code === "string" ? b.code.replace(/\s/g, "") : "";
  if (!email || !isCode(code)) return json(400, { error: BAD_CODE });
  try {
    const res = await verifyLogin(email, code);
    if (!res.ok) return json(res.status, { error: res.error });
    return json(200, { ok: true, user: { email: res.session.email } }, { "Set-Cookie": sessionCookie(res.session) });
  } catch {
    return json(503, { error: "Sign-in is unavailable right now. You can continue as a guest." });
  }
}
