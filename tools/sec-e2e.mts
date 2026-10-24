// Security + functional sweep in headless Chrome against `npm run start` (PORT 3100).
// node --import tsx tools/sec-e2e.mts   (run tools/make-sec-fixtures.mts first)
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
const BASE = `http://localhost:${process.env.PORT ?? 3100}`;
const only = process.argv[2] ?? "all";
const want = (k: string) => only === "all" || only === k;
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const results: { name: string; ok: boolean; note: string }[] = [];
const rec = (name: string, ok: boolean, note = "") => { results.push({ name, ok, note }); console.log((ok ? "PASS " : "FAIL ") + name + (note ? " — " + note : "")); };
let errs: string[] = [];
async function fresh() {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("console", (m: Any) => { if (m.type() === "error" || /Refused to|Content Security Policy/.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); });
  pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
  await pg.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation " + e.violatedDirective + " " + e.blockedURI)));
  return { ctx, pg };
}
const wait = (pg: Any, ms: number) => pg.waitForTimeout(ms);
async function toPlate(pg: Any) {
  await pg.goto(BASE + "/"); await wait(pg, 500);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(pg, 900);
}
async function importLocal(pg: Any, kind: "zip" | "dir", path: string) {
  await toPlate(pg);
  await pg.setInputFiles(`input[data-pick=${kind}]`, path); await wait(pg, 300);
  await pg.click(".cl-drop__picked a");
  await pg.waitForURL(/workspace|building/, { timeout: 20000 });
  await pg.waitForFunction(() => /workspace/.test(location.pathname) || !document.querySelector("[data-err]")?.hasAttribute("hidden"), null, { timeout: 60000 });
  if (/workspace/.test(pg.url())) await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 60000 });
  await wait(pg, 800);
}
async function exerciseWorkspace(pg: Any) {
  // click every file in the tree (Talk panel), open Code tab for some, focus mode + Esc, hover the canvas
  const paths: string[] = await pg.evaluate(() => [...document.querySelectorAll(".ws-files [data-path]")].map((b: Any) => b.dataset.path));
  for (const p of paths.slice(0, 40)) await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.select(x), p);
  await pg.click("#tab-code"); await wait(pg, 300);
  for (const p of paths.slice(0, 12)) { await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.select(x), p); await wait(pg, 120); }
  await pg.click("#tab-city"); await wait(pg, 200);
  for (const p of paths.slice(0, 4)) {
    await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.focus(x), p);
    await pg.waitForFunction(() => document.body.classList.contains("is-focus"), null, { timeout: 15000 }).catch(() => {});
    await wait(pg, 700); await pg.keyboard.press("Escape"); await wait(pg, 300);
  }
  const box = await pg.locator("[data-city] canvas").boundingBox();
  for (let i = 0; i < 12; i++) await pg.mouse.move(box.x + box.width * (0.2 + 0.05 * i), box.y + box.height * 0.5);
  return paths;
}
const xssFired = (pg: Any) => pg.evaluate(() => (window as Any).__xss);

if (want("xss")) {
  errs = [];
  const { ctx, pg } = await fresh();
  await importLocal(pg, "zip", "/tmp/sec/xss-names.zip");
  const paths = await exerciseWorkspace(pg);
  rec("XSS: hostile file names imported", paths.length === 10, `${paths.length} files listed`);
  rec("XSS: no script ran from names/contents (tree, labels, tooltip, Talk, Code, Monaco)", (await xssFired(pg)) === undefined);
  const html = await pg.evaluate(() => document.body.innerHTML);
  rec("XSS: no live injected <img>/<svg>/<script> elements", !/<img src="?x"? onerror|<svg onload|<script>window/.test(html));
  rec("XSS: __proto__/constructor files selectable", await pg.evaluate(() => { (window as Any).CodeLensWorkspace.select("__proto__"); return document.querySelector(".ws-who [data-path]")?.textContent === "__proto__"; }));
  await pg.goto(BASE + "/workspace?file=__proto__&ff=__proto__:0,constructor:0,toString:0"); await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 30000 }); await wait(pg, 600);
  rec("?file=__proto__ & ?ff=prototype keys don't crash", !errs.some((e) => e.startsWith("pageerror")), errs.filter((e) => e.startsWith("pageerror")).join(" | "));
  rec("XSS run: no console errors / CSP violations", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

if (want("monaco")) {
  errs = [];
  const { ctx, pg } = await fresh();
  await importLocal(pg, "zip", "/tmp/sec/xss-names.zip");
  const first: string = await pg.evaluate(() => (document.querySelector(".ws-files [data-path]") as Any)?.dataset.path);
  await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.focus(x), first);
  const ok = await pg.waitForFunction(() => document.querySelectorAll(".monaco-editor .view-line").length > 0, null, { timeout: 30000 }).then(() => true, () => false);
  rec("Monaco renders in focus mode under the CSP", ok, first);
  await pg.keyboard.press("Escape"); await wait(pg, 400);
  rec("Esc leaves focus mode", !(await pg.evaluate(() => document.body.classList.contains("is-focus"))));
  rec("Monaco run: no console errors / CSP violations", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

if (want("secrets")) {
  errs = [];
  const { ctx, pg } = await fresh();
  await importLocal(pg, "zip", "/tmp/sec/secrets.zip");
  await exerciseWorkspace(pg);
  const leak = await pg.evaluate(async () => { const p = await (window as Any).CodeLens.loadProject(); return JSON.stringify(p).includes("TOPSECRET_9f3a") || document.body.innerText.includes("TOPSECRET_9f3a"); });
  rec("Secrets: contents never stored or shown", !leak);
  const vaults = await pg.evaluate(() => (window as Any).__codelensPlan.buildings.filter((b: Any) => b.tier === "vault").length);
  rec("Secrets: every secret file is a Vault", vaults === 13, `${vaults} vaults`);
  rec("Secrets run: no console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

if (want("zips")) {
  for (const [file, expectWs, label] of [
    ["zip-slip.zip", true, "zip slip"], ["oversized.zip", true, "oversized file"], ["duplicates.zip", true, "3,000 duplicate entries"],
    ["nested-root.zip", true, "nested root folder"], ["only-binaries.zip", true, "only binaries"], ["empty-after-rules.zip", false, "empty after ignore rules"], ["not-a-zip.zip", false, "not a zip"],
  ] as const) {
    errs = [];
    const { ctx, pg } = await fresh();
    const t0 = Date.now();
    await importLocal(pg, "zip", `/tmp/sec/${file}`);
    const onWs = /workspace/.test(pg.url());
    let note = onWs ? `workspace, ${await pg.evaluate(() => document.querySelector("[data-filecount]")?.textContent)} files, ${Date.now() - t0} ms` : `error: ${await pg.evaluate(() => document.querySelector("[data-err]")?.textContent)}`;
    if (file === "zip-slip.zip" && onWs) { const ps = await pg.evaluate(() => [...document.querySelectorAll(".ws-files [data-path]")].map((b: Any) => b.dataset.path)); note += " " + JSON.stringify(ps); }
    if (file === "nested-root.zip" && onWs) note += " tree: " + (await pg.evaluate(() => [...document.querySelectorAll(".ws-files [data-path]")].map((b: Any) => b.dataset.path).join(",")));
    if (onWs) await exerciseWorkspace(pg);
    rec(`Zip: ${label}`, onWs === expectWs && !errs.some((e) => e.startsWith("pageerror")), note + (errs.length ? " | " + errs.join(" | ") : ""));
    await ctx.close();
  }
}

if (want("folder")) {
  errs = [];
  const { ctx, pg } = await fresh();
  await importLocal(pg, "dir", "/tmp/sec/odd folder ✨");
  const onWs = /workspace/.test(pg.url());
  const ps = onWs ? await pg.evaluate(() => [...document.querySelectorAll(".ws-files [data-path]")].map((b: Any) => b.dataset.path)) : [];
  if (onWs) await exerciseWorkspace(pg);
  rec("Folder: unicode / spaces / 40-deep / 400-char paths / symlink / markup name", onWs && (await xssFired(pg)) === undefined && !errs.some((e) => e.startsWith("pageerror")), `${ps.length} files: ${ps.map((p: string) => p.length > 50 ? p.slice(0, 20) + "…" + p.slice(-20) : p).join(" , ")}${errs.length ? " | " + errs.join(" | ") : ""}`);
  await ctx.close();
}

if (want("state")) {
  // malformed stored state, empty pending, back/forward/reload, double import
  errs = [];
  const { ctx, pg } = await fresh();
  await pg.goto(BASE + "/workspace"); await wait(pg, 500);
  for (const [label, bad] of [["files not an array", { name: "x", files: "nope" }], ["file objects missing fields", { name: "x", files: [{}, { path: 5 }], source: null, previews: null, stats: null }], ["string instead of project", "garbage"]] as const) {
    errs = [];
    await pg.evaluate(async (b: Any) => (window as Any).CodeLens.saveProject(b), bad);
    await pg.reload(); await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 15000 }).catch(() => {});
    const empty = await pg.evaluate(() => !document.querySelector("[data-empty]")?.hasAttribute("hidden"));
    rec(`Malformed stored project (${label}) shows the empty state, no crash`, empty && !errs.some((e) => e.startsWith("pageerror")), errs.join(" | "));
  }
  errs = [];
  await pg.evaluate(async () => { const r = indexedDB.open("codelens", 1); await new Promise((res) => (r.onsuccess = res)); const tx = r.result.transaction("projects", "readwrite"); tx.objectStore("projects").put({ src: "folder", name: "x" }, "pending"); await new Promise((res) => (tx.oncomplete = res)); });
  await pg.goto(BASE + "/building"); await wait(pg, 1500);
  rec("Malformed pending import shows an error, no crash", await pg.evaluate(() => !document.querySelector("[data-err]")?.hasAttribute("hidden")) && !errs.some((e) => e.startsWith("pageerror")), (await pg.evaluate(() => document.querySelector("[data-err]")?.textContent)) + " " + errs.join(" | "));
  // a good import, then reload / back / forward
  errs = [];
  await importLocal(pg, "zip", "/tmp/sec/nested-root.zip");
  await pg.reload(); await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 15000 });
  rec("Reload /workspace keeps the project", await pg.evaluate(() => document.querySelector("[data-filecount]")?.textContent) === "3");
  await pg.goBack(); await wait(pg, 1200);
  const backUrl = pg.url();
  await pg.goForward(); await wait(pg, 1500);
  rec("Back / forward from /workspace", /workspace/.test(pg.url()) && !errs.some((e) => e.startsWith("pageerror")), `back went to ${backUrl.replace(BASE, "")}`);
  await pg.goto(BASE + "/building"); await wait(pg, 1200);
  rec("Reload /building after a finished import says nothing to build", await pg.evaluate(() => /Nothing to build/.test(document.querySelector("[data-err]")?.textContent || "")));
  // double import: click build twice quickly
  errs = [];
  await toPlate(pg);
  await pg.setInputFiles("input[data-pick=zip]", "/tmp/sec/nested-root.zip"); await wait(pg, 300);
  await pg.evaluate(() => { const a = document.querySelector(".cl-drop__picked a") as HTMLElement; a.click(); a.click(); });
  await pg.waitForURL(/workspace/, { timeout: 30000 }); await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 30000 });
  rec("Double-click Build imports once and lands on the workspace", !errs.some((e) => e.startsWith("pageerror")), errs.join(" | "));
  await ctx.close();
}

if (want("ui")) {
  errs = [];
  const { ctx, pg } = await fresh();
  await importLocal(pg, "dir", "/tmp/testproj/demo");
  const info0 = await pg.evaluate(() => (window as Any).__codelensCity.info());
  for (let i = 0; i < 12; i++) { await pg.click("[data-colorby]"); await wait(pg, 150); }
  for (let i = 0; i < 6; i++) { await pg.click("[data-labels]"); await wait(pg, 80); }
  const top = await pg.evaluate(() => [...(window as Any).__codelensPlan.buildings].sort((a: Any, b: Any) => b.score - a.score)[0].id);
  for (let i = 0; i < 8; i++) { await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.focus(x), top); await wait(pg, 500); await pg.keyboard.press("Escape"); await wait(pg, 250); }
  for (const [w, h] of [[1024, 700], [1920, 1080], [1440, 900]]) { await pg.setViewportSize({ width: w, height: h }); await wait(pg, 400); }
  const info1 = await pg.evaluate(() => (window as Any).__codelensCity.info());
  rec("Memory: geometries stable after 12 colour toggles + 8 focus cycles + resizes", info1.geometries <= info0.geometries + 6, `geometries ${info0.geometries} -> ${info1.geometries}, textures ${info0.textures} -> ${info1.textures}`);
  rec("UI run: no console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
  const flags = ["glowArtery", "traffic", "folderLabels", "colorCoding", "connectionLines", "parks", "plazas", "gateway", "lamps", "trees", "subPlots", "footpaths", "tooltip", "shadows"];
  const { ctx: c2, pg: p2 } = await fresh();
  await importLocal(p2, "dir", "/tmp/testproj/demo");
  const bad: string[] = [];
  for (const f of [...flags.map((f) => f + ":0"), flags.map((f) => f + ":0").join(",")]) {
    errs = [];
    await p2.goto(BASE + "/workspace?ff=" + f); await p2.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 30000 }).catch(() => bad.push(f + " (not ready)"));
    await wait(p2, 300);
    await p2.evaluate(() => { const ws = (window as Any).CodeLensWorkspace; const b = (window as Any).__codelensPlan.buildings[0]; ws.select(b.members ? b.members[0] : b.id); });
    if (errs.length) bad.push(f + ": " + errs.join(" | "));
  }
  rec("Every features.js flag off (one at a time, then all) renders without errors", bad.length === 0, bad.join(" ; "));
  await c2.close();
}

if (want("github")) {
  errs = [];
  const { ctx, pg } = await fresh();
  // GH_URLS="url|ws,url|err" overrides the list (e.g. vercel/swr, or a rate-limit run with CODELENS_IMPORTS_PER_10MIN=1)
  const list: [string, string][] = process.env.GH_URLS ? process.env.GH_URLS.split(",").map((x) => x.split("|") as [string, string]) : [["https://github.com/sindresorhus/slugify", "ws"], ["https://github.com/maverick-codelens-test/this-repo-does-not-exist-42", "err"], ["https://github.com.evil.com/a/b", "plate"], ["http://127.0.0.1:3100/a/b", "plate"]];
  for (const [url, expect] of list) {
    errs = [];
    await toPlate(pg);
    await pg.fill(".cl-gh", url);
    await pg.click(".cl-form button[type=submit]"); await wait(pg, 800);
    if (expect === "plate") { rec(`GitHub link rejected on the plate: ${url}`, /\/$|index/.test(new URL(pg.url()).pathname) && /does not look like|github\.com\/owner\/repo/i.test(await pg.evaluate(() => document.querySelector(".cl-form__status")?.textContent || "")), await pg.evaluate(() => document.querySelector(".cl-form__status")?.textContent)); continue; }
    await pg.waitForFunction(() => /workspace/.test(location.pathname) || !document.querySelector("[data-err]")?.hasAttribute("hidden"), null, { timeout: 120000 });
    const onWs = /workspace/.test(pg.url());
    if (onWs) { await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 60000 }); await exerciseWorkspace(pg); }
    rec(`GitHub ${url.replace("https://github.com/", "")}`, (expect === "ws") === onWs && !errs.some((e) => e.startsWith("pageerror")), onWs ? "workspace" : await pg.evaluate(() => document.querySelector("[data-err]")?.textContent));
  }
  rec("GitHub run: no console errors / CSP violations", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

await br.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
