import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { analyzeEntries, countLines, previewOf } from "../lib/analyze/analyze";
import { planEntries } from "../lib/analyze/collect";
import { isSecretPath, normalizePath, skipReason, stripCommonRoot, CAPS } from "../lib/analyze/rules";
import { extractImports, resolveImport } from "../lib/analyze/imports";
import { readZip } from "../lib/analyze/zip";
import { detectLanguage } from "../lib/analyze/language";
import { kindFromPath } from "../lib/analyze/kind";
import { parseGitHubUrl } from "../lib/github";

const src = { kind: "zip", name: "t.zip" } as const;

test("path traversal and unsafe paths are rejected", () => {
  assert.equal(normalizePath("../etc/passwd"), null);
  assert.equal(normalizePath("a/../../b"), null);
  assert.equal(normalizePath("/abs/file.js"), null);
  assert.equal(normalizePath("C:\\win\\file.js"), null);
  assert.equal(normalizePath("~/x"), null);
  assert.equal(normalizePath("a/\u0000b"), null);
  assert.equal(normalizePath("a\\b\\c.js"), "a/b/c.js");
  assert.equal(normalizePath("./src//x.ts"), "src/x.ts");
  const plan = planEntries([
    { raw: "../evil.js", size: 10 },
    { raw: "ok/a.js", size: 10 },
    { raw: "other/b.js", size: 10 },
  ]);
  assert.equal(plan.skipped["unsafe-path"], 1);
  assert.deepEqual(plan.keep.map((k) => k.path), ["ok/a.js", "other/b.js"]);
});

test("ignore rules: node_modules, build output, minified, vendored", () => {
  assert.equal(skipReason("node_modules/react/index.js"), "ignored-dir");
  assert.equal(skipReason("packages/a/node_modules/x.js"), "ignored-dir");
  assert.equal(skipReason(".git/config"), "ignored-dir");
  assert.equal(skipReason("dist/app.js"), "ignored-dir");
  assert.equal(skipReason(".next/server/x.js"), "ignored-dir");
  assert.equal(skipReason("public/jquery.min.js"), "minified");
  assert.equal(skipReason("app.js.map"), "minified");
  assert.equal(skipReason("vendor/lib.js"), "vendored");
  assert.equal(skipReason("src/build.ts"), null);
});

test("secrets are detected and never read", () => {
  for (const p of [".env", ".env.local", "config/.env.production", "id_rsa", "keys/server.pem", "certs/a.key", ".npmrc", "secrets.json"]) assert.ok(isSecretPath(p), p);
  for (const p of ["src/env.ts", "environment.md", "keyboard.js"]) assert.ok(!isSecretPath(p), p);
  const zip = zipSync({ "r/.env": strToU8("API_KEY=supersecret"), "r/a.js": strToU8("x\n") });
  const { entries } = readZip(zip);
  const env = entries.find((e) => e.path === ".env")!;
  assert.equal(env.secret, true);
  assert.equal(env.text, undefined);
  const p = analyzeEntries(entries, { name: "r", source: src });
  assert.equal(p.files.find((f) => f.path === ".env")!.kind, "secret");
  assert.equal(p.previews[".env"], undefined);
  assert.ok(!JSON.stringify(p).includes("supersecret"));
});

test("zip: common root stripped, binaries by NUL byte, lockfiles excluded from LOC", () => {
  const zip = zipSync({
    "repo-main/src/index.ts": strToU8("import { a } from './a'\n\nexport const x = a\n"),
    "repo-main/src/a.ts": strToU8("export const a = 1\n"),
    "repo-main/data.dat": new Uint8Array([1, 0, 2, 3]),
    "repo-main/package-lock.json": strToU8('{\n "a": 1\n}\n'),
    "repo-main/node_modules/x/index.js": strToU8("nope"),
  });
  const { entries, plan } = readZip(zip);
  assert.equal(plan.root, "repo-main");
  assert.equal(plan.skipped["ignored-dir"], 1);
  const p = analyzeEntries(entries, { name: "repo", source: src });
  const byPath = Object.fromEntries(p.files.map((f) => [f.path, f]));
  assert.equal(byPath["data.dat"].binary, true);
  assert.equal(byPath["package-lock.json"].loc, 0);
  assert.equal(byPath["package-lock.json"].lines, 3);
  assert.equal(byPath["src/index.ts"].loc, 2);
  assert.equal(byPath["src/index.ts"].lines, 3);
  assert.deepEqual(byPath["src/index.ts"].uses, ["src/a.ts"]);
  assert.deepEqual(byPath["src/a.ts"].usedBy, ["src/index.ts"]);
  assert.equal(p.stats.languages[0].language, "TypeScript");
  assert.equal(p.stats.totalLoc, 3);
});

test("file cap keeps code first", () => {
  const listing = Array.from({ length: CAPS.maxFiles + 30 }, (_, i) => ({ raw: `r/f${i}.${i < 20 ? "txt" : "js"}`, size: 10 }));
  const plan = planEntries(listing);
  assert.equal(plan.keep.length, CAPS.maxFiles);
  assert.equal(plan.skipped["over-cap"], 30);
  assert.ok(plan.keep.every((k) => k.path.endsWith(".js")));
});

test("line counting", () => {
  assert.deepEqual(countLines(""), { lines: 0, loc: 0 });
  assert.deepEqual(countLines("a\n\n  \nb"), { lines: 4, loc: 2 });
  assert.deepEqual(countLines("a\r\n\r\nb\r\n"), { lines: 3, loc: 2 });
  const long = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
  assert.equal(previewOf(long).split("\n").length, CAPS.previewLines);
});

test("imports: JS/TS relative + alias, Python relative + absolute", () => {
  const files = new Set(["src/a.ts", "src/b/index.tsx", "src/c.js", "pkg/__init__.py", "pkg/mod.py", "pkg/sub/x.py", "main.py"]);
  const js = extractImports(`import a from "./a"; export * from './b'; const c = require("./c.js"); import("react");`, "js");
  assert.deepEqual(js.map((s) => resolveImport(s, "src/index.ts", files)).filter(Boolean).sort(), ["src/a.ts", "src/b/index.tsx", "src/c.js"]);
  assert.equal(resolveImport("@/a", "app/page.tsx", files), "src/a.ts");
  assert.equal(resolveImport("../../../x", "src/a.ts", files), null);
  const py = extractImports("from .mod import thing\nfrom .sub import x\nimport pkg.mod\nimport os\n", "py");
  const resolved = py.map((s) => resolveImport(s, "pkg/__init__.py", files)).filter(Boolean);
  assert.ok(resolved.includes("pkg/mod.py"));
  assert.ok(resolved.includes("pkg/sub/x.py"));
});

test("language and kind heuristics", () => {
  assert.equal(detectLanguage("a/b.tsx").name, "TypeScript");
  assert.equal(detectLanguage("Dockerfile").name, "Dockerfile");
  const k = (p: string) => kindFromPath(p, { binary: false, secret: false, lockfile: false, code: detectLanguage(p).code });
  assert.equal(k("src/__tests__/a.ts"), "test");
  assert.equal(k("src/a.test.ts"), "test");
  assert.equal(k("styles/app.css"), "style");
  assert.equal(k("README.md"), "docs");
  assert.equal(k("tsconfig.json"), "config");
  assert.equal(k("src/components/Button.tsx"), "ui");
  assert.equal(k("src/index.ts"), "core");
  assert.equal(k("src/lib/math.ts"), "util");
});

test("GitHub URL parsing is strict (SSRF safe)", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/vercel/swr"), { owner: "vercel", repo: "swr" });
  assert.deepEqual(parseGitHubUrl("github.com/vercel/swr.git"), { owner: "vercel", repo: "swr" });
  for (const bad of ["https://github.com.evil.com/a/b", "https://evil.com/github.com/a/b", "https://user@github.com/a/b", "http://localhost/a/b", "https://github.com/a", "https://github.com/a/b c", "https://github.com/../b", "github.com/-bad/repo"])
    assert.equal(parseGitHubUrl(bad), null, bad);
});

test("stripCommonRoot only strips a shared top folder", () => {
  assert.equal(stripCommonRoot(["a/x", "a/y/z"]).root, "a");
  assert.equal(stripCommonRoot(["a/x", "b/y"]).root, null);
  assert.equal(stripCommonRoot(["x"]).root, null);
});
