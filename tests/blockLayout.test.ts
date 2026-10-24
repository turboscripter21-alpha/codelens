import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeEntries } from "../lib/analyze/analyze";
import type { SourceEntry } from "../lib/analyze/collect";
import { planCity, MAX_BUILDINGS, type CityPlan } from "../lib/city/blockLayout";

const src = { kind: "zip", name: "t.zip" } as const;

/** A synthetic repo: n files spread over nested folders, with imports, plus secrets and a lockfile. */
function repo(n: number): SourceEntry[] {
  const dirs = ["src", "src/components", "src/hooks", "src/utils", "src/api", "lib", "lib/core", "tests", "docs", "scripts"];
  const out: SourceEntry[] = [];
  for (let i = 0; i < n; i++) {
    const dir = dirs[i % dirs.length] + (n > 200 ? "/part" + (i % 7) : "");
    const target = i > 0 ? `./f${Math.floor(i / 2)}` : "";
    const body = (target ? `import x from "${target}";\n` : "") + "export const v = 1;\n".repeat(1 + ((i * 37) % 120));
    out.push({ path: `${dir}/f${i}.ts`, bytes: body.length, text: body });
  }
  out.push({ path: ".env", bytes: 20, secret: true }, { path: "config/id_rsa", bytes: 400, secret: true });
  const lock = "x\n".repeat(20000);
  out.push({ path: "package-lock.json", bytes: lock.length, text: lock }, { path: "package.json", bytes: 20, text: '{"name":"t"}\n' });
  return out;
}
const plan = (n: number): CityPlan => planCity(analyzeEntries(repo(n), { name: "t", source: src }));

const overlaps = (a: CityPlan["buildings"][number], b: CityPlan["buildings"][number]) =>
  Math.abs(a.x - b.x) < (a.lot.w + b.lot.w) / 2 - 1e-6 && Math.abs(a.z - b.z) < (a.lot.d + b.lot.d) / 2 - 1e-6;

test("planCity is deterministic", () => {
  assert.deepEqual(plan(60), plan(60));
});

test("no two building lots overlap", () => {
  for (const n of [12, 120, 900]) {
    const p = plan(n), bs = p.buildings;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(!overlaps(bs[i], bs[j]), `${n}: ${bs[i].id} vs ${bs[j].id}`);
  }
});

test("secrets become vault buildings and are never aggregated", () => {
  for (const n of [12, 3000]) {
    const p = plan(n);
    for (const s of [".env", "config/id_rsa"]) {
      const b = p.buildings.find((x) => x.id === p.fileToBuilding[s]);
      assert.ok(b, s);
      assert.equal(b.tier, "vault");
      assert.equal(b.comp, "vault");
    }
  }
});

test("every file maps to a building; big repos aggregate under the cap", () => {
  for (const n of [10, 300, 1500, 5000]) {
    const p = plan(n);
    const ids = new Set(p.buildings.map((b) => b.id));
    assert.equal(Object.keys(p.fileToBuilding).length, p.stats.files);
    for (const id of Object.values(p.fileToBuilding)) assert.ok(ids.has(id), id);
    assert.ok(p.buildings.length <= MAX_BUILDINGS, `${n}: ${p.buildings.length}`);
    if (n >= 1500) assert.ok(p.stats.aggregatedFiles > 0, "aggregated");
  }
});

test("many folders still fit under the building cap", () => {
  const entries: SourceEntry[] = [];
  for (let i = 0; i < 4000; i++) { const t = "export const v = 1;\n".repeat(1 + (i % 9)); entries.push({ path: `pkg${i % 40}/d${i % 1300}/f${i}.ts`, bytes: t.length, text: t }); }
  const p = planCity(analyzeEntries(entries, { name: "t", source: src }));
  assert.ok(p.buildings.length <= MAX_BUILDINGS, String(p.buildings.length));
  assert.equal(Object.keys(p.fileToBuilding).length, 4000);
});

test("blocks mix tiers (not all tall towers on one side)", () => {
  const p = plan(300);
  const mixed = p.districts.filter((d) => d.kind === "district" && d.buildings.length >= 4)
    .filter((d) => new Set(d.buildings.map((i) => p.buildings[i].tier)).size >= 2);
  assert.ok(mixed.length >= 1, "at least one mixed block");
});

test("a lockfile is never the tallest building", () => {
  const p = plan(40);
  const lock = p.buildings.find((b) => b.id === p.fileToBuilding["package-lock.json"]);
  assert.ok(lock);
  assert.notEqual(lock.tier, "tall");
});

test("one district per folder that directly holds files; never numbered parts", () => {
  for (const n of [12, 120, 900, 5000]) {
    const p = plan(n);
    const ds = p.districts.filter((d) => d.kind === "district");
    for (const d of ds) assert.ok(!/\(\d+\)/.test(d.label), `${n}: numbered part ${d.label}`);
    const keys = ds.map((d) => d.key);
    assert.equal(new Set(keys).size, keys.length, `${n}: a folder split into several districts`);
    // every building sits in the district of its own folder
    for (const d of ds) for (const i of d.buildings) assert.equal(p.buildings[i].dir, d.key, `${n}: ${p.buildings[i].id} in ${d.key}`);
    const dirs = new Set(p.buildings.map((b) => b.dir));
    assert.equal(ds.length, dirs.size, `${n}: districts = folders with files`);
    assert.equal(p.stats.districts, ds.length);
  }
});

test("sub-folders are their own districts; folders with only sub-folders get none; root = city hall", () => {
  const t = "export const v = 1;\n";
  const paths = ["README.md", "src/index.ts", "src/components/a.tsx", "src/components/b.tsx", "src/components/forms/c.tsx", "src/utils/d.ts", "packages/x/lib/e.ts"];
  for (let i = 0; i < 80; i++) paths.push(`src/big/f${i}.ts`);
  const p = planCity(analyzeEntries(paths.map((path) => ({ path, bytes: t.length, text: t })), { name: "t", source: src }));
  const ds = p.districts.filter((d) => d.kind === "district");
  assert.deepEqual(ds.map((d) => d.key).sort(), ["", "packages/x/lib", "src", "src/big", "src/components", "src/components/forms", "src/utils"]);
  assert.equal(ds.find((d) => d.key === "")!.label, "root files · city hall");
  assert.equal(ds.find((d) => d.key === "src/components/forms")!.label, "src/components/forms/");
  const big = ds.find((d) => d.key === "src/big")!;
  assert.equal(big.buildings.length, 80, "a big folder is one bigger district");
  const w = big.pad.x1 - big.pad.x0, d = big.pad.z1 - big.pad.z0;
  assert.ok(w / d < 4 && d / w < 4, `roughly rectangular ${w}x${d}`);
  // siblings sit next to each other: src/components and src/components/forms are adjacent cells
  const a = ds.find((x) => x.key === "src/components")!.cell, b = ds.find((x) => x.key === "src/components/forms")!.cell;
  assert.ok(Math.abs(a.c - b.c) + Math.abs(a.r - b.r) <= 2, "parent and sub-folder are near each other");
});
