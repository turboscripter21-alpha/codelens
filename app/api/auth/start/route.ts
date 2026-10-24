import { normalizeEmail, startLogin } from "@/lib/server/auth";
import { json, readJson } from "@/lib/server/http";
import { clientKey, hit } from "@/lib/server/rateLimit";

/** POST /api/auth/start {email}: send a 6-digit code. Same answer for every valid address (no enumeration). */
export async function POST(req: Request) {
  const r = await readJson(req, 2048);
  if ("error" in r) return r.error;
  const wait = hit("auth-start", clientKey(req), 6, 10 * 60 * 1000);
  if (wait) return json(429, { error: "Too many sign-in attempts. Wait a few minutes." }, { "Retry-After": String(wait) });
  const email = normalizeEmail((r.body as { email?: unknown })?.email);
  if (!email) return json(400, { error: "Enter a valid email address." });
  try {
    const res = await startLogin(email);
    if (!res.ok) return json(res.status, { error: res.error }, res.retryAfter ? { "Retry-After": String(res.retryAfter) } : {});
    return json(200, { ok: true, message: "If that address can receive email, a 6-digit code is on its way. It is valid for 10 minutes." });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.error("[codelens DEV] sign-in start failed:", (e as Error)?.message);
    return json(503, { error: "Sign-in is unavailable right now. You can continue as a guest." });
  }
}
