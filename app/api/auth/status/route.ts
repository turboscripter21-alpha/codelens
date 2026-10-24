import { authMode, sessionOf } from "@/lib/server/auth";
import { json, perRequest } from "@/lib/server/http";

/** GET /api/auth/status: is email sign-in available here, and who is signed in. */
export async function GET(req: Request) {
  await perRequest(); // reads the session cookie: never prerendered
  const mode = authMode();
  const s = sessionOf(req);
  return json(200, { mode, available: mode !== "off", user: s ? { email: s.email } : null });
}
