/* eslint-disable @typescript-eslint/no-explicit-any -- fixture objects */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisOf, projectFromAnalysis, statsOf } from "@/lib/client/historyClient";

const proj = () => ({
  name: "demo", source: { kind: "zip", name: "demo.zip" }, warnings: [],
  stats: { totalLoc: 30, totalLines: 40, totalBytes: 999, filesCounted: 2, filesSkipped: 0, skipped: {}, secrets: 1, binaries: 0, languages: [{ language: "JavaScript", loc: 30, files: 1, color: "#f1e05a" }], imports: 0, largest: [] },
  files: [
    { path: "src/a.js", name: "a.js", dir: "src", language: "JavaScript", loc: 30, lines: 40, bytes: 900, uses: [], usedBy: [], importance: 1, content: "SECRET SOURCE", symbols: [{ n: "a", k: "fn", l: 1 }], health: { s: 10, lv: "good", br: 1, dp: 1, fn: 3 } },
    { path: ".env", name: ".env", dir: "", language: "Secrets", loc: 3, lines: 3, bytes: 40, uses: ["x"], usedBy: [], importance: 0, secret: true, symbols: [{ n: "KEY", k: "var", l: 1 }] },
  ],
});

test("history: the saved analysis has no file contents and no secret details", () => {
  const p = proj() as any;
  const json = analysisOf(p)!;
  assert.doesNotMatch(json, /SECRET SOURCE/);
  const a = JSON.parse(json);
  const env = a.files.find((f: { path: string }) => f.path === ".env");
  assert.equal(env.loc, 0); assert.deepEqual(env.uses, []); assert.equal(env.symbols, undefined);
  assert.equal(a.files[0].health.lv, "good");
  assert.equal(statsOf(p).files, 2);
});

test("history: re-opening a saved analysis rebuilds a project and says contents are not stored", () => {
  const p = proj() as any;
  const re = projectFromAnalysis("demo.zip", "zip", analysisOf(p) as any) as any;
  assert.equal(re.files.length, 2);
  assert.equal(re.files[0].name, "a.js");
  assert.ok(re.warnings.some((w: string) => /history/i.test(w)));
  assert.equal(re.stats.totalLoc, 30);
});
