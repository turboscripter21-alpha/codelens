import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCityLayout, tierFor, ROAD_WIDTH } from "../lib/layout";
import { sampleProject } from "./fixtures/sampleProject";
import { parseGitHubUrl } from "../lib/github";
import { buildingDetails, groundBoxes } from "../lib/cityGeometry";

const layout = () => buildCityLayout(sampleProject().root);

test("one building per file, one district per top-level folder plus root", () => {
  const l = layout();
  assert.equal(l.buildings.length, 19);
  assert.deepEqual(l.districts.map((d) => d.name).sort(), [".github", "public", "root", "src", "tests"]);
});

test("layout is deterministic", () => {
  assert.deepEqual(layout(), layout());
});

test("core files become the tallest towers", () => {
  const l = layout();
  const tallest = [...l.buildings].sort((a, b) => b.height - a.height)[0];
  assert.equal(tallest.path, "src/index.js");
  assert.equal(tallest.tier, "tower");
  assert.equal(tierFor(10), "shop");
});

test("no building overlaps the road or another building", () => {
  const l = layout();
  for (const b of l.buildings) assert.ok(Math.abs(b.z) - b.depth / 2 > ROAD_WIDTH / 2, b.path);
  for (let i = 0; i < l.buildings.length; i++)
    for (let j = i + 1; j < l.buildings.length; j++) {
      const a = l.buildings[i], b = l.buildings[j];
      const overlap = Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
      assert.ok(!overlap, `${a.path} vs ${b.path}`);
    }
});

test("lamps are evenly spaced along the road", () => {
  const north = layout().lamps.filter((l) => l.z < 0).map((l) => l.x);
  for (let i = 1; i < north.length; i++) assert.equal(north[i] - north[i - 1], 9);
});

test("instance lists are produced", () => {
  const l = layout();
  assert.ok(buildingDetails(l.buildings).length > 50);
  assert.ok(groundBoxes(l).length > 5);
});

test("GitHub URL parsing", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/vercel/next.js"), { owner: "vercel", repo: "next.js" });
  assert.deepEqual(parseGitHubUrl("github.com/a-b/c.git/"), { owner: "a-b", repo: "c" });
  assert.deepEqual(parseGitHubUrl("https://github.com/o/r/tree/main/src"), { owner: "o", repo: "r" });
  assert.equal(parseGitHubUrl("https://gitlab.com/o/r"), null);
  assert.equal(parseGitHubUrl("github.com/onlyowner"), null);
});

// ---------------- Phase 3: scaling + detailed prototypes ----------------
import { MAX_BUILDINGS, SINGLE_ROAD_MAX_RUN } from "../lib/layout";
import { PROTO_DIMS } from "../lib/city/protoDims";
import { treeFromFiles } from "./fixtures/sampleProject";
import type { FileNode } from "../lib/types";

function synthetic(n: number): FileNode {
  const files: FileNode[] = [];
  for (let i = 0; i < n; i++) {
    const dir = `pkg${i % 23}/sub${i % 7}`;
    files.push({ name: `f${i}.ts`, path: `${dir}/f${i}.ts`, type: "file", lines: (i * 37) % 900, loc: (i * 37) % 800, kind: "util", importance: 1, usedBy: [] });
  }
  files.push({ name: ".env", path: ".env", type: "file", kind: "secret", secret: true, lines: 0, loc: 0, importance: 6 });
  return treeFromFiles("big", files);
}

test("every building has a known kit prototype; secrets become vaults", () => {
  const l = layout();
  for (const b of l.buildings) assert.ok(b.style && PROTO_DIMS[b.style], b.path);
  const big = buildCityLayout(synthetic(50));
  assert.equal(big.buildings.find((b) => b.path === ".env")!.style, "vault");
});

test("small repos keep the single Phase 1 road; big repos switch to grid mode", () => {
  assert.equal(layout().streets, undefined);
  const g = buildCityLayout(synthetic(800));
  assert.ok(g.streets && g.streets.some((s) => s.axis === "z") && g.streets.some((s) => s.axis === "x"));
  assert.ok(SINGLE_ROAD_MAX_RUN > 0);
});

test("layout scales to ~2000+ files: capped buildings, no overlaps, deterministic", () => {
  for (const n of [10, 200, 2000, 5000]) {
    const t = synthetic(n);
    const l = buildCityLayout(t);
    assert.ok(l.buildings.length <= MAX_BUILDINGS + 200, `${n}: ${l.buildings.length}`);
    if (n > MAX_BUILDINGS) assert.ok((l.aggregatedFiles ?? 0) > 0);
    const cells = new Set(l.buildings.map((b) => `${b.x.toFixed(2)}|${b.z.toFixed(2)}`));
    assert.equal(cells.size, l.buildings.length, `${n}: duplicate cells`);
    // Plots never overlap each other.
    for (let i = 0; i < l.districts.length; i++)
      for (let j = i + 1; j < l.districts.length; j++) {
        const a = l.districts[i], b = l.districts[j];
        const ov = Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 0.01 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 - 0.01;
        assert.ok(!ov, `${n}: ${a.name} vs ${b.name}`);
      }
    // Plots never sit on a street.
    for (const s of l.streets ?? [])
      for (const d of l.districts) {
        const ov = Math.abs(s.x - d.x) < (s.sx + d.width) / 2 && Math.abs(s.z - d.z) < (s.sz + d.depth) / 2;
        assert.ok(!ov, `${n}: ${d.name} on street`);
      }
    assert.deepEqual(buildCityLayout(t).buildings.map((b) => b.id), l.buildings.map((b) => b.id));
  }
});
