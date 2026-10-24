/* eslint-disable @typescript-eslint/no-explicit-any -- public/app/insights.js is untyped JS */
import { test } from "node:test";
import assert from "node:assert/strict";

type F = { path: string; language: string; loc: number; bytes: number; kind?: string; uses: string[]; usedBy: string[]; importance: number; secret?: boolean; binary?: boolean; symbols?: { n: string; k: string; l: number; end?: number; e?: number }[]; health?: { s: number; lv: string; br: number; dp: number; fn: number } };
const mk = (path: string, o: Partial<F> = {}): F => ({ path, language: "JavaScript", loc: 50, bytes: 900, uses: [], usedBy: [], importance: 1, ...o });
const project = (): F[] => {
  const fs = [
    mk("package.json", { language: "JSON", kind: "config" }),
    mk("README.md", { language: "Markdown", kind: "docs" }),
    mk("src/cli.js", { uses: ["src/auth.js", "src/db.js"], importance: 3, symbols: [{ n: "main", k: "fn", l: 3, end: 20 }, { n: "parseArgs", k: "fn", l: 22, end: 30 }] }),
    mk("src/auth.js", { uses: ["src/db.js"], importance: 8, kind: "core", symbols: [{ n: "login", k: "fn", l: 4, end: 18, e: 1 }] }),
    mk("src/db.js", { importance: 9, kind: "core", symbols: [{ n: "query", k: "fn", l: 2, end: 9, e: 1 }] }),
    mk("src/index.js", { importance: 2 }),
    mk(".env", { secret: true, language: "Secrets" }),
  ];
  const by = new Map(fs.map((f) => [f.path, f]));
  for (const f of fs) for (const u of f.uses) by.get(u)!.usedBy.push(f.path);
  return fs;
};
const load = () => import("../public/app/insights.js") as unknown as Promise<Record<string, any>>;

test("entry: package.json main/bin wins (dist mapped back to src); bad JSON / traversal ignored", async () => {
  const I = await load();
  const files = project();
  assert.equal(I.findEntry(files, JSON.stringify({ bin: { tool: "./dist/cli.js" } })).path, "src/cli.js");
  assert.equal(I.findEntry(files, JSON.stringify({ main: "../../etc/passwd" })).path, "src/index.js");
  assert.equal(I.findEntry(files, "{not json").path, "src/index.js");
  assert.equal(I.findEntry(files, null).path, "src/index.js");
  assert.equal(I.findEntry(files, JSON.stringify({ main: ".env" })).path, "src/index.js", "a secret is never the entry");
});

test("where to start: entry first, most-used next, config and readme, max 5, no secrets", async () => {
  const I = await load();
  const files = project();
  const list = I.whereToStart(files, I.findEntry(files, JSON.stringify({ main: "src/cli.js" })));
  assert.ok(list.length <= 5 && list.length >= 4);
  assert.equal(list[0].path, "src/cli.js");
  assert.equal(list[1].path, "src/db.js");
  assert.ok(list.some((s: { path: string }) => s.path === "package.json"));
  assert.ok(list.some((s: { path: string }) => s.path === "README.md"));
  assert.ok(!list.some((s: { path: string }) => s.path === ".env"));
});

test("building chat: first-person intro and offline answers from facts only", async () => {
  const I = await load();
  const files = project();
  const auth = files.find((f) => f.path === "src/auth.js")!;
  assert.match(I.introOf(auth), /^Hi, I'm auth\.js/);
  assert.match(I.introOf(auth), /login\(\)/);
  assert.match(I.localAnswer("Who uses you?", auth), /cli\.js/);
  assert.match(I.localAnswer("Explain line 4", auth, { lineText: "export function login(user) {" }), /start of a function definition, inside login\(\)/);
  assert.match(I.localAnswer("Explain line 9", auth, { lineText: "  if (x) {" }), /decision/);
  assert.match(I.localAnswer("Explain line 3", auth, {}), /can't see line 3/);
  assert.match(I.localAnswer("What should I read first?", auth, { start: [{ path: "src/cli.js" }] }), /db\.js[\s\S]*1\. cli\.js/);
  assert.match(I.introOf(files.find((f) => f.secret)!), /never reads/);
  assert.deepEqual(I.SUGGESTIONS.slice(0, 3), ["What do you do?", "Who uses you?", "What should I read first?"]);
});

test("summary: entry first, then its imports by importance; narration walks the entry's functions", async () => {
  const I = await load();
  const files = project();
  const entry = { path: "src/cli.js", why: "package.json points to it (main / bin)" };
  const plan = I.summaryPlan(files, entry, 8);
  assert.deepEqual(plan.slice(0, 3).map((s: { path: string }) => s.path), ["src/cli.js", "src/db.js", "src/auth.js"]);
  assert.equal(plan[1].from, "src/cli.js");
  assert.ok(!plan.some((s: { path: string }) => s.path === ".env"));
  const t = I.slideText(files.find((f) => f.path === "src/cli.js")!, plan[0], entry, plan.length);
  assert.match(t, /where the program starts/);
  assert.match(t, /first main\(\) \(line 3–20\).*parseArgs/);
});

test("search: files, paths and functions ranked; regex characters are safe", async () => {
  const I = await load();
  const idx = I.searchIndex(project());
  const r = I.search(idx, "login");
  assert.equal(r[0].label, "login"); assert.equal(r[0].path, "src/auth.js"); assert.equal(r[0].line, 4);
  assert.equal(I.search(idx, "auth")[0].path, "src/auth.js");
  assert.ok(I.search(idx, "src/d").some((x: { path: string }) => x.path === "src/db.js"));
  assert.deepEqual(I.search(idx, "   "), []);
  assert.doesNotThrow(() => I.search(idx, "(*[+?"));
});
