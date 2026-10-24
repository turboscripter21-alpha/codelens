// Regression tests for the security review (SECURITY-REVIEW.md). Fixtures: tests/fixtures/malicious.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeEntries } from "../lib/analyze/analyze";
import { readZip } from "../lib/analyze/zip";
import { isSecretPath } from "../lib/analyze/rules";
import { detectLanguage, prismLanguage } from "../lib/analyze/language";
import { planCity } from "../lib/city/blockLayout";
import { getSource } from "../lib/bridge/index";
import { parseGitHubUrl, isValidRef } from "../lib/github";
import { hit, acquire, _resetRateLimits } from "../lib/server/rateLimit";
import { zipSlip, xssZip, XSS_NAMES, oversizedZip, duplicateZip, secretsZip, SECRET_MARK } from "./fixtures/malicious";

const src = { kind: "zip", name: "t.zip" } as const;
const fromZip = (z: Uint8Array) => {
  const r = readZip(z);
  return analyzeEntries(r.entries, { name: "t", source: src, skipped: r.plan.skipped, warnings: r.plan.warnings });
};

test("SEC-01: prototype-key file names (__proto__, constructor, x.toString) don't crash or corrupt the analysis", () => {
  const p = fromZip(xssZip());
  const paths = p.files.map((f) => f.path).sort();
  assert.deepEqual(paths, [...XSS_NAMES].sort());
  for (const f of p.files) {
    assert.equal(typeof f.language, "string", f.path);
    assert.equal(typeof f.langColor, "string", f.path);
  }
  assert.equal(detectLanguage("constructor").name, "Other");
  assert.equal(detectLanguage("src/a.toString").name, "Other");
  assert.equal(prismLanguage("x.constructor"), "text");
  const plan = planCity(p); // used to throw: Cannot read properties of undefined (reading 'toLowerCase')
  for (const f of p.files) assert.ok(Object.prototype.hasOwnProperty.call(plan.fileToBuilding, f.path), f.path);
  assert.equal(Object.getPrototypeOf(p.previews), null);
  assert.equal(typeof p.previews["__proto__"], "string");
});

test("SEC-01: getSource never returns an inherited Object.prototype member as file text", async () => {
  const p = fromZip(xssZip());
  // simulate a project that came back through JSON / IndexedDB (ordinary prototype)
  const roundTrip = JSON.parse(JSON.stringify(p));
  for (const path of ["__proto__", "constructor", "src/toString"]) {
    const s = await getSource(roundTrip, path);
    assert.equal(s.kind, "text", path);
    if (s.kind === "text") assert.equal(typeof s.text, "string", path);
  }
  delete roundTrip.previews["constructor"];
  const s = await getSource(roundTrip, "constructor");
  assert.notEqual(s.kind, "text");
});

test("zip slip: absolute, drive, '..' and NUL entry names are dropped, nothing escapes the root", () => {
  const r = readZip(zipSlip());
  assert.deepEqual(r.entries.map((e) => e.path), ["good.js"]);
  assert.equal(r.plan.skipped["unsafe-path"], 5);
  for (const e of r.entries) assert.ok(!e.path.includes("..") && !e.path.startsWith("/"));
});

test("SEC-02: a repeated entry name is inflated once (decompression amplification)", () => {
  const z = duplicateZip(2000);
  const t0 = performance.now();
  const r = readZip(z);
  assert.equal(r.entries.length, 1);
  assert.match(r.entries[0].text ?? "", /^\/\/ copy 0\n/);
  assert.ok(performance.now() - t0 < 2000);
});

test("oversized file: counted, not read (LOC estimated)", () => {
  const r = readZip(oversizedZip());
  const huge = r.entries.find((e) => e.path === "huge.js")!;
  assert.equal(huge.estimated, true);
  assert.equal(huge.text, undefined);
});

test("SEC-03: more secret files are vaulted and their contents never appear in the output", () => {
  const p = fromZip(secretsZip());
  const out = JSON.stringify(p);
  assert.ok(!out.includes(SECRET_MARK), "secret contents leaked into the project");
  for (const f of p.files.filter((x) => x.path !== "app.js")) assert.equal(f.secret, true, f.path);
  for (const n of ["src/secret_handler.ts", "docs/aws.md", "src/env.ts", "README.md"]) assert.equal(isSecretPath(n), false, n);
});

test("SSRF: only github.com owner/repo URLs parse; refs and hosts are strict", () => {
  for (const bad of [
    "https://github.com.evil.com/a/b", "https://evil.com/github.com/a/b", "http://127.0.0.1/a/b", "https://github.com@evil.com/a/b",
    "https://github.com/a", "https://github.com/../../x/y", "https://github.com/a/..", "file:///etc/passwd", "https://api.github.com/repos/a/b",
    "https://raw.githubusercontent.com/a/b/main/x", "https://github.com/a%2f..%2fb/c", "javascript:alert(1)//github.com/a/b",
  ])
    assert.equal(parseGitHubUrl(bad), null, bad);
  assert.deepEqual(parseGitHubUrl("github.com/vercel/swr.git"), { owner: "vercel", repo: "swr" });
  for (const r of ["../x", "a/../b", "/abs", "a b", "a?b", "a#b", "%2e%2e"]) assert.equal(isValidRef(r), false, r);
});

test("SEC-04: rate limit and concurrency guard", () => {
  _resetRateLimits();
  for (let i = 0; i < 3; i++) assert.equal(hit("t", "1.2.3.4", 3, 1000, 1000 + i), 0);
  assert.ok(hit("t", "1.2.3.4", 3, 1000, 1005) > 0);
  assert.equal(hit("t", "5.6.7.8", 3, 1000, 1005), 0, "other clients unaffected");
  assert.equal(hit("t", "1.2.3.4", 3, 1000, 2100), 0, "window slides");
  const a = acquire(2), b = acquire(2);
  assert.ok(a && b);
  assert.equal(acquire(2), null);
  a!();
  a!(); // double release is harmless
  assert.ok(acquire(2));
  _resetRateLimits();
});

test("SEC-05: static pages ship a CSP and the security headers; GITHUB_TOKEN never reaches client code", () => {
  const cfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const h of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "frame-ancestors 'none'", "object-src 'none'"]) assert.ok(cfg.includes(h), h);
  for (const f of ["public/app/codelens-bridge.js", "public/app/workspace.js", "public/codelens.js", "lib/bridge/index.ts"]) {
    assert.ok(!readFileSync(new URL("../" + f, import.meta.url), "utf8").includes("GITHUB_TOKEN"), f);
  }
});

test("SEC-06: ?ff= only toggles real flags (no prototype keys)", () => {
  const s = readFileSync(new URL("../public/app/features.js", import.meta.url), "utf8");
  assert.ok(s.includes("hasOwnProperty.call(FEATURES, k)"));
  assert.ok(!/\bk in FEATURES\b/.test(s));
});

test("DOM sinks: repo strings only reach innerHTML through an escaper", () => {
  const b = readFileSync(new URL("../public/app/building.js", import.meta.url), "utf8");
  // every setDetail(..., true) HTML string interpolates paths only via esc(...)
  for (const m of b.matchAll(/'<code>' \+ ([^+]+) \+ '<\/code>'/g)) assert.match(m[1], /^esc\(/, m[0]);
  const w = readFileSync(new URL("../public/app/workspace.js", import.meta.url), "utf8");
  assert.match(w, /\+ esc\(l\)\)/);
});

test("SEC-04: import route refuses oversized bodies and rate-limits a client (no GitHub call needed)", async () => {
  _resetRateLimits();
  const { POST } = await import("../app/api/import/github/route");
  const req = (body: string, ip = "9.9.9.9") => new Request("http://localhost/api/import/github", { method: "POST", body, headers: { "content-type": "application/json", "x-forwarded-for": ip } });
  assert.equal((await POST(req("x".repeat(10000)))).status, 400);
  const codes: number[] = [];
  for (let i = 0; i < 9; i++) {
    const r = await POST(req(JSON.stringify({ url: "not a github url" })));
    codes.push(r.status);
    const text = await r.text();
    assert.ok(!text.includes("GITHUB_TOKEN") && !/at .*\.ts:\d+/.test(text), "no stack traces or secrets in replies");
  }
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 200, 200, 429]);
  _resetRateLimits();
});

test("file route: traversal, secrets, bad refs and odd hosts are refused before any fetch", async () => {
  _resetRateLimits();
  const { GET } = await import("../app/api/github/file/route");
  const get = (qs: string) => GET(new Request("http://localhost/api/github/file?" + qs));
  assert.equal((await get("owner=a&repo=b&ref=main&path=../../etc/passwd")).status, 400);
  assert.equal((await get("owner=a&repo=b&ref=../main&path=x.js")).status, 400);
  assert.equal((await get("owner=a.evil.com&repo=b&ref=main&path=x.js")).status, 400);
  assert.equal((await get("owner=a&repo=b&ref=main&path=%2Fetc%2Fpasswd")).status, 400);
  assert.equal((await get("owner=a&repo=b&ref=main&path=config/.env.local")).status, 403);
  assert.equal((await get("owner=a&repo=b&ref=main&path=.aws/credentials")).status, 403);
  assert.equal((await get("owner=a&repo=b&ref=main&path=node_modules/x/index.js")).status, 415);
  _resetRateLimits();
});
