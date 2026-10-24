import { test } from "node:test";
import assert from "node:assert/strict";

import "./helpers/devAuthEnv";
import * as auth from "@/lib/server/auth";
import * as history from "@/lib/server/history";
import { POST as start } from "@/app/api/auth/start/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { GET as status } from "@/app/api/auth/status/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import * as hist from "@/app/api/history/route";
import { GET as item } from "@/app/api/history/item/route";
import { _resetRateLimits } from "@/lib/server/rateLimit";

const H = { origin: "http://localhost:3100", host: "localhost:3100", "content-type": "application/json" };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3100" + path, { method: "POST", headers: { ...H, ...headers }, body: JSON.stringify(body) });

/** Run fn while capturing console.log lines (the DEV-mode code is printed there). */
async function captureLog<T>(fn: () => Promise<T>): Promise<{ out: T; lines: string[] }> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { lines.push(a.join(" ")); };
  try { return { out: await fn(), lines }; } finally { console.log = orig; }
}
const codeIn = (lines: string[]) => /code for [^:]+: (\d{6})/.exec(lines.join("\n"))?.[1];

async function signIn(email: string): Promise<string> {
  const { lines } = await captureLog(() => start(post("/api/auth/start", { email })));
  const code = codeIn(lines)!;
  const r = await verify(post("/api/auth/verify", { email, code }));
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}

test("auth mode: dev locally, off in production without env, email when fully configured", () => {
  assert.equal(auth.authMode(), "dev");
  const env = { ...process.env };
  try {
    (process.env as Record<string, string>).NODE_ENV = "production";
    assert.equal(auth.authMode(), "off");
    process.env.DATABASE_URL = "pglite:memory"; // PGlite is never accepted in production
    process.env.AUTH_SECRET = "x".repeat(40); process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "CodeLens <a@b.co>";
    assert.equal(auth.authMode(), "off");
    process.env.DATABASE_URL = "postgres://u:p@db.example/neondb?sslmode=require";
    assert.equal(auth.authMode(), "email");
    delete process.env.RESEND_API_KEY;
    assert.equal(auth.authMode(), "off", "never falls back to the console DEV mode in production");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
  }
});

test("email + code validation", () => {
  assert.equal(auth.normalizeEmail("  Ann@Example.COM "), "ann@example.com");
  for (const bad of ["", "a@b", "no-at.example.com", "a@@b.co", "a b@c.co", "<x>@y.co", "a@b..co", "x".repeat(250) + "@a.co", 42, null]) assert.equal(auth.normalizeEmail(bad), null, String(bad));
  assert.ok(auth.isCode("012345"));
  for (const bad of ["12345", "1234567", "12345a", " 123456", 123456]) assert.ok(!auth.isCode(bad));
  const c = auth.newCode();
  assert.match(c, /^\d{6}$/);
  assert.notEqual(auth.hashCode("a@b.co", c), c, "codes are stored hashed");
  assert.match(auth.hashCode("a@b.co", c), /^[0-9a-f]{64}$/);
});

test("session cookie: signed, httpOnly, SameSite=Lax; tampering and expiry rejected", () => {
  const s = { uid: "u1", email: "a@b.co", exp: Date.now() + 60000 };
  const tok = auth.signSession(s);
  assert.deepEqual(auth.verifySession(tok), s);
  const [body, sig] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "admin", e: "x@y.co", x: Date.now() + 1e9, v: 1 })).toString("base64url");
  assert.equal(auth.verifySession(forged + "." + sig), null);
  assert.equal(auth.verifySession(body + "." + sig.slice(0, -2) + "AA"), null);
  assert.equal(auth.verifySession(auth.signSession({ ...s, exp: Date.now() - 1 })), null);
  assert.equal(auth.verifySession("garbage"), null);
  const c = auth.sessionCookie(s);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Path=\//);
});

test("CSRF: cross-site, missing-origin and non-JSON requests are refused", async () => {
  _resetRateLimits();
  assert.equal((await start(post("/api/auth/start", { email: "a@b.co" }, { origin: "https://evil.example" }))).status, 403);
  const noOrigin = new Request("http://localhost:3100/api/auth/start", { method: "POST", headers: { host: "localhost:3100", "content-type": "application/json" }, body: "{}" });
  assert.equal((await start(noOrigin)).status, 403);
  assert.equal((await start(post("/api/auth/start", { email: "a@b.co" }, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await start(post("/api/auth/start", { email: "a@b.co" }, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await logout(post("/api/auth/logout", {}, { origin: "https://evil.example" }))).status, 403);
  const del = new Request("http://localhost:3100/api/history?all=1", { method: "DELETE", headers: { origin: "https://evil.example", host: "localhost:3100" } });
  assert.equal((await hist.DELETE(del)).status, 403);
});

test("sign-in flow: DEV code in console, generic answers, wrong code counted, max attempts, single use", async () => {
  _resetRateLimits();
  const st = await (await status(new Request("http://localhost:3100/api/auth/status"))).json();
  assert.equal(st.mode, "dev");
  assert.equal(st.user, null);

  const a = await captureLog(() => start(post("/api/auth/start", { email: "new.person@example.com" })));
  const b = await captureLog(() => start(post("/api/auth/start", { email: "other@example.com" })));
  assert.equal(a.out.status, 200);
  assert.deepEqual(await a.out.json(), await b.out.json(), "same answer for any address (no enumeration)");
  const code = codeIn(a.lines)!;
  assert.match(code, /^\d{6}$/);
  assert.equal((await start(post("/api/auth/start", { email: "nope" }))).status, 400);

  const wrong = code === "000000" ? "111111" : "000000";
  const w = await verify(post("/api/auth/verify", { email: "new.person@example.com", code: wrong }));
  assert.equal(w.status, 400);
  const unknown = await verify(post("/api/auth/verify", { email: "never-asked@example.com", code: wrong }));
  assert.deepEqual(await unknown.json(), await w.json(), "unknown address and wrong code look the same");

  const ok = await verify(post("/api/auth/verify", { email: "new.person@example.com", code }));
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie")!;
  assert.match(cookie, /^cl_session=/);
  assert.match(cookie, /HttpOnly/);
  const again = await verify(post("/api/auth/verify", { email: "new.person@example.com", code }));
  assert.equal(again.status, 400, "a code works once");

  const me = await (await status(new Request("http://localhost:3100/api/auth/status", { headers: { cookie: cookie.split(";")[0] } }))).json();
  assert.equal(me.user.email, "new.person@example.com");

  // max attempts: after 5 wrong tries even the right code fails
  const c2 = codeIn((await captureLog(() => start(post("/api/auth/start", { email: "brute@example.com" })))).lines)!;
  const bad = c2 === "999999" ? "888888" : "999999";
  for (let i = 0; i < 5; i++) await verify(post("/api/auth/verify", { email: "brute@example.com", code: bad }));
  assert.equal((await verify(post("/api/auth/verify", { email: "brute@example.com", code: c2 }))).status, 400);

  // expiry
  const c3 = codeIn((await captureLog(() => auth.startLogin("late@example.com", Date.now() - auth.CODE_TTL_MS - 1000).then((r) => { assert.ok(r.ok); return r; }))).lines)!;
  assert.equal((await auth.verifyLogin("late@example.com", c3)).ok, false);

  const out = await logout(post("/api/auth/logout", {}));
  assert.match(out.headers.get("set-cookie")!, /Max-Age=0/);
});

test("rate limits: at most 3 codes per address per 10 minutes", async () => {
  _resetRateLimits();
  const r = [];
  for (let i = 0; i < 4; i++) r.push((await captureLog(() => start(post("/api/auth/start", { email: "spam@example.com" }, { "x-forwarded-for": "10.0.0." + i })))).out.status);
  assert.deepEqual(r, [200, 200, 200, 429]);
  _resetRateLimits();
  const ip = [];
  for (let i = 0; i < 7; i++) ip.push((await captureLog(() => start(post("/api/auth/start", { email: `p${i}@example.com` }, { "x-forwarded-for": "10.9.9.9" })))).out.status);
  assert.equal(ip[6], 429, "per-IP limit");
});

test("history: guests are not saved; users list, re-open, delete; contents and secrets never stored", async () => {
  _resetRateLimits();
  const guest = await hist.POST(post("/api/history", { kind: "github", title: "a/b", url: "https://github.com/a/b", stats: {} }));
  assert.deepEqual(await guest.json(), { saved: false, reason: "Log in with email to keep your history." });
  assert.equal((await hist.GET(new Request("http://localhost:3100/api/history"))).status, 401);

  const cookie = await signIn("hist@example.com");
  const other = await signIn("someone.else@example.com");
  const withC = (c: string) => ({ cookie: c });

  const bad = await hist.POST(post("/api/history", { kind: "github", title: "x", url: "https://evil.example/a/b", stats: {} }, withC(cookie)));
  assert.equal(bad.status, 400, "only github.com links");

  const gh = await (await hist.POST(post("/api/history", { kind: "github", title: "vercel/swr", url: "https://github.com/vercel/swr/tree/main", stats: { files: 120, loc: 9000, languages: ["TypeScript"], imports: 300 } }, withC(cookie)))).json();
  assert.equal(gh.saved, true);

  const analysis = {
    name: "demo.zip",
    previews: { "src/a.ts": "SECRET CONTENT" },
    files: [
      { path: "src/a.ts", language: "TypeScript", loc: 10, lines: 12, bytes: 200, uses: ["src/b.ts"], usedBy: [], kind: "core", importance: 30, text: "should be dropped", symbols: [{ n: "main", k: "fn", l: 2, end: 9, e: 1 }], health: { s: 12, lv: "good", br: 1, dp: 2, fn: 8 } },
      { path: ".env", language: "Secret", loc: 3, uses: ["x"], content: "API_KEY=abc", symbols: [{ n: "API_KEY", k: "var", l: 1 }] },
      { path: "../etc/passwd", loc: 1 },
    ],
    stats: { totalLoc: 13, filesCounted: 2, languages: [{ language: "TypeScript", color: "#3178c6", loc: 10, files: 1, pct: 100 }] },
  };
  const z = await (await hist.POST(post("/api/history", { kind: "zip", title: "demo.zip", stats: { files: 2, loc: 13 }, analysis: JSON.stringify(analysis) }, withC(cookie)))).json();
  assert.equal(z.saved, true);

  const list = await (await hist.GET(new Request("http://localhost:3100/api/history", { headers: withC(cookie) }))).json();
  assert.deepEqual(list.items.map((i: { title: string }) => i.title), ["demo.zip", "vercel/swr"]);
  assert.equal(list.items[1].url, "https://github.com/vercel/swr");
  assert.equal(list.items[1].hasAnalysis, false, "GitHub entries are re-imported, not stored");
  assert.equal(list.items[0].stats.loc, 13);

  const got = await (await item(new Request("http://localhost:3100/api/history/item?id=" + z.id, { headers: withC(cookie) }))).json();
  const raw = JSON.stringify(got);
  assert.ok(!raw.includes("SECRET CONTENT") && !raw.includes("API_KEY") && !raw.includes("should be dropped") && !raw.includes("passwd"));
  assert.equal(got.analysis.files.length, 2);
  const env = got.analysis.files.find((f: { path: string }) => f.path === ".env");
  assert.equal(env.secret, true);
  assert.equal(env.loc, 0);
  assert.equal(env.symbols, undefined);
  assert.equal(got.analysis.files.find((f: { path: string }) => f.path === "src/a.ts").symbols[0].n, "main");

  // another user cannot read or delete it
  assert.equal((await item(new Request("http://localhost:3100/api/history/item?id=" + z.id, { headers: withC(other) }))).status, 404);
  const del = (c: string, q: string) => hist.DELETE(new Request("http://localhost:3100/api/history?" + q, { method: "DELETE", headers: { ...H, cookie: c } }));
  assert.equal((await (await del(other, "id=" + z.id)).json()).deleted, 0);
  assert.equal((await (await del(cookie, "id=" + z.id)).json()).deleted, 1);
  assert.equal((await del(cookie, "id=../../x")).status, 400);
  const after = await (await hist.GET(new Request("http://localhost:3100/api/history", { headers: withC(cookie) }))).json();
  assert.equal(after.items.length, 1);

  // re-saving the same repo refreshes it instead of duplicating
  await hist.POST(post("/api/history", { kind: "github", title: "vercel/swr", url: "https://github.com/vercel/swr", stats: {} }, withC(cookie)));
  assert.equal((await (await hist.GET(new Request("http://localhost:3100/api/history", { headers: withC(cookie) }))).json()).items.length, 1);
  assert.equal(history.cleanAnalysis("{not json", "x"), null);
});
