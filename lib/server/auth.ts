/**
 * Email sign-in with a one-time 6-digit code, and a signed httpOnly session cookie.
 *
 * - Codes: random 6 digits, valid 10 minutes, stored only as HMAC-SHA256(AUTH_SECRET, email:code),
 *   max 5 wrong attempts, at most 3 codes per address per 10 minutes, per-IP limits on top.
 * - No user enumeration: /start answers the same for every valid address (accounts are created
 *   only when a code is verified), and /verify has one generic failure message.
 * - CSRF: SameSite=Lax cookie + every state-changing request must carry a same-origin Origin header.
 * - Codes are never logged in production. In local dev without Resend, the code is printed to the
 *   server console (DEV mode); that path is unreachable when NODE_ENV=production.
 */
import "server-only";
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { dbConfigured, devFallbackDb, getDb } from "./db";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const SENDS_PER_WINDOW = 3;
export const SEND_WINDOW_MS = 10 * 60 * 1000;
export const SESSION_DAYS = 30;

const isProd = () => process.env.NODE_ENV === "production";
let devSecret: string | null = null;

/** "email": real email sign-in; "dev": local dev, code printed to the console; "off": not set up. */
export type AuthMode = "email" | "dev" | "off";
export function authMode(): AuthMode {
  const secretOk = (process.env.AUTH_SECRET ?? "").length >= 32;
  const mailOk = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
  if (secretOk && mailOk && dbConfigured()) return "email";
  if (!isProd() && (dbConfigured() || devFallbackDb())) return "dev";
  return "off";
}

function secret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length >= 32) return s;
  if (isProd()) throw new Error("AUTH_SECRET is not set.");
  return (devSecret ??= randomBytes(32).toString("hex"));
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest();

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e)) return null;
  if (e.includes("..")) return null;
  return e;
}
export const isCode = (c: unknown): c is string => typeof c === "string" && /^\d{6}$/.test(c);
export const hashCode = (email: string, code: string) => mac("code:" + email + ":" + code).toString("hex");
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---------- session cookie ---------- */
export type Session = { uid: string; email: string; exp: number };
export const cookieName = () => (isProd() ? "__Host-cl_session" : "cl_session");

export function signSession(s: Session): string {
  const body = b64u(JSON.stringify({ u: s.uid, e: s.email, x: s.exp, v: 1 }));
  return body + "." + b64u(mac("session:" + body));
}
export function verifySession(token: string | undefined | null, now = Date.now()): Session | null {
  if (!token || token.length > 1024) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let good: string;
  try { good = b64u(mac("session:" + body)); } catch { return null; }
  if (!safeEq(sig, good)) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (j.v !== 1 || typeof j.u !== "string" || typeof j.e !== "string" || typeof j.x !== "number" || j.x < now) return null;
    return { uid: j.u, email: j.e, exp: j.x };
  } catch {
    return null;
  }
}
export function readCookie(req: Request, name: string): string | null {
  const h = req.headers.get("cookie");
  if (!h) return null;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
export function sessionOf(req: Request): Session | null {
  if (authMode() === "off") return null;
  return verifySession(readCookie(req, cookieName()));
}
export function sessionCookie(s: Session): string {
  return `${cookieName()}=${signSession(s)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isProd() ? "; Secure" : ""}`;
}
export const clearCookie = () => `${cookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd() ? "; Secure" : ""}`;

/* ---------- CSRF: same-origin requests only ---------- */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!host || o.host.toLowerCase() !== host) return false;
  if (isProd() && o.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}

/* ---------- the flow ---------- */
export type StartResult = { ok: true } | { ok: false; status: number; error: string; retryAfter?: number };

export async function startLogin(email: string, now = Date.now()): Promise<StartResult> {
  const mode = authMode();
  if (mode === "off") return { ok: false, status: 503, error: "Email login isn't set up on this server yet." };
  const db = await getDb();
  const rows = await db.query<{ sends: number; window_start: string | number }>("SELECT sends, window_start FROM cl_login_codes WHERE email = $1", [email]);
  let sends = 1, windowStart = now;
  if (rows[0] && now - Number(rows[0].window_start) < SEND_WINDOW_MS) {
    if (rows[0].sends >= SENDS_PER_WINDOW) {
      return { ok: false, status: 429, error: "Too many codes requested for this address. Wait a few minutes and try again.", retryAfter: Math.ceil((SEND_WINDOW_MS - (now - Number(rows[0].window_start))) / 1000) };
    }
    sends = rows[0].sends + 1; windowStart = Number(rows[0].window_start);
  }
  const code = newCode();
  await db.query(
    `INSERT INTO cl_login_codes (email, code_hash, expires_at, attempts, sends, window_start) VALUES ($1, $2, $3, 0, $4, $5)
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, sends = EXCLUDED.sends, window_start = EXCLUDED.window_start`,
    [email, hashCode(email, code), now + CODE_TTL_MS, sends, windowStart],
  );
  if (mode === "dev") {
    if (!isProd()) console.log(`[codelens DEV] sign-in code for ${email}: ${code} (valid 10 minutes; printed only in local dev)`);
    return { ok: true };
  }
  const sent = await sendCodeEmail(email, code);
  return sent ? { ok: true } : { ok: false, status: 502, error: "The email could not be sent right now. Try again in a minute." };
}

async function sendCodeEmail(to: string, code: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: `Your CodeLens sign-in code: ${code}`,
        text: `Your CodeLens sign-in code is ${code}\n\nIt is valid for 10 minutes. If you did not ask for it, you can ignore this email.`,
        html: `<p>Your CodeLens sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p><p>It is valid for 10 minutes. If you did not ask for it, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    return false;
  }
}

export type VerifyResult = { ok: true; session: Session } | { ok: false; status: number; error: string };
export const BAD_CODE = "That code is wrong or has expired. Check the email or request a new code.";

export async function verifyLogin(email: string, code: string, now = Date.now()): Promise<VerifyResult> {
  if (authMode() === "off") return { ok: false, status: 503, error: "Email login isn't set up on this server yet." };
  const db = await getDb();
  const rows = await db.query<{ code_hash: string; expires_at: string | number; attempts: number }>("SELECT code_hash, expires_at, attempts FROM cl_login_codes WHERE email = $1", [email]);
  const row = rows[0];
  if (!row || Number(row.expires_at) < now || row.attempts >= MAX_ATTEMPTS) {
    hashCode(email, code); // same work either way
    return { ok: false, status: 400, error: BAD_CODE };
  }
  if (!safeEq(row.code_hash, hashCode(email, code))) {
    // wrong code: count it; the code is burnt after MAX_ATTEMPTS (keeps the send window for rate limiting)
    await db.query("UPDATE cl_login_codes SET attempts = attempts + 1 WHERE email = $1", [email]);
    return { ok: false, status: 400, error: BAD_CODE };
  }
  await db.query("UPDATE cl_login_codes SET attempts = $2, expires_at = 0 WHERE email = $1", [email, MAX_ATTEMPTS]);
  const found = await db.query<{ id: string }>("SELECT id FROM cl_users WHERE email = $1", [email]);
  let uid = found[0]?.id;
  if (!uid) {
    uid = randomUUID();
    await db.query("INSERT INTO cl_users (id, email, created_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING", [uid, email, now]);
    uid = (await db.query<{ id: string }>("SELECT id FROM cl_users WHERE email = $1", [email]))[0].id;
  }
  return { ok: true, session: { uid, email, exp: now + SESSION_DAYS * 86400 * 1000 } };
}
