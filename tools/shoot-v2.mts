// End-to-end screenshots + perf for the wired CodeLens site. Needs `npm run start` (PORT, default 3100).
// node --import tsx tools/shoot-v2.mts [all|landing|empty|github|local|errors|large]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";

const BASE = `http://localhost:${process.env.PORT ?? 3100}`;
const OUT = process.env.OUT ?? "/workspace/codelens-app-shots/v2";
const only = process.argv[2] ?? "all";
const want = (k: string) => only === "all" || only === k;
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
pg.on("console", (m: { type: () => string; text: () => string }) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
pg.on("pageerror", (e: Error) => console.log("pageerror:", e.message));
const shot = (n: string) => pg.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms: number) => pg.waitForTimeout(ms);
const perf: Record<string, unknown> = {};
type W = { __codelensCity: { info: () => Record<string, number>; screenPos: (id: string) => [number, number]; focusOn: (id: string, d?: number) => void; setColorBy: (v: string) => void }; __codelensPlan: { buildings: { id: string; score: number; tier: string; members?: string[]; comp: string }[] }; CodeLensWorkspace: { select: (p: string) => void } };

async function ready() {
  await pg.waitForURL("**/workspace**", { timeout: 180000 });
  await pg.waitForFunction(() => (window as unknown as { __workspaceReady?: boolean }).__workspaceReady, null, { timeout: 120000 });
  await wait(1800);
}
async function measure(label: string) {
  const a = await pg.evaluate(() => ({ f: (window as unknown as W).__codelensCity.info().frames, t: performance.now() }));
  await wait(3000);
  const b = await pg.evaluate(() => ({ f: (window as unknown as W).__codelensCity.info().frames, t: performance.now(), i: (window as unknown as W).__codelensCity.info(), n: (window as unknown as W).__codelensPlan.buildings.length }));
  perf[label] = { fps: +(((b.f - a.f) * 1000) / (b.t - a.t)).toFixed(1), calls: b.i.calls, triangles: b.i.triangles, buildings: b.n, vehicles: b.i.vehicles, geometries: b.i.geometries };
  console.log("perf", label, JSON.stringify(perf[label]));
}
async function clickBuilding(id: string, dbl = false) {
  const p = await pg.evaluate((i: string) => (window as unknown as W).__codelensCity.screenPos(i), id);
  await pg.mouse.move(p[0], p[1]);
  await wait(150);
  if (dbl) await pg.mouse.dblclick(p[0], p[1]);
  else await pg.mouse.click(p[0], p[1]);
  await wait(500);
}
const topBuilding = () => pg.evaluate(() => [...(window as unknown as W).__codelensPlan.buildings].filter((b) => !b.members).sort((a, b) => b.score - a.score)[0].id);
async function landingImport(url: string) {
  await pg.goto(BASE + "/");
  await wait(800);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(1500);
  await pg.fill(".cl-gh", url);
  await pg.click(".cl-form button[type=submit]");
}
async function buildingShot(name: string, re: RegExp) {
  await pg.waitForURL("**/building**", { timeout: 30000 });
  await pg.waitForFunction((s: string) => new RegExp(s).test(document.querySelector(".bd")?.textContent || ""), re.source, { timeout: 120000 }).catch(() => {});
  await shot(name);
}
async function focusShot(name: string, id: string) {
  await clickBuilding(id, true);
  await pg.waitForFunction(() => !!document.querySelector(".ws-focus:not([hidden]) .monaco-editor, .ws-focus:not([hidden]) [data-binary]:not([hidden])"), null, { timeout: 60000 }).catch(() => {});
  await wait(2500);
  await shot(name);
  await pg.keyboard.press("Escape");
  await wait(400);
}

if (want("landing")) {
  await pg.goto(BASE + "/");
  await wait(1500);
  await shot("01-landing-top");
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(2000);
  await shot("02-landing-import-plate");
}

// No sample project: with nothing imported, building.html and workspace.html show an empty state.
// (Runs before any import, on a fresh browser profile, so IndexedDB is empty.)
if (want("empty")) {
  await pg.goto(BASE + "/workspace");
  await pg.waitForFunction(() => (window as unknown as { __workspaceReady?: boolean }).__workspaceReady, null, { timeout: 30000 });
  await wait(600);
  await shot("30-empty-workspace-import-first");
  await pg.goto(BASE + "/building");
  await wait(1200);
  await shot("31-empty-building-nothing-to-build");
}

if (want("github")) {
  await landingImport("https://github.com/sindresorhus/slugify");
  await buildingShot("10-small-building", /Raising buildings[\s\S]*Tallest|Analyzing/);
  await ready();
  await shot("11-small-slugify-workspace");
  await measure("small sindresorhus/slugify");
  await focusShot("12-small-slugify-focus-monaco", await topBuilding());
  await landingImport("https://github.com/vercel/swr");
  await buildingShot("20-mid-building-progress", /Downloading the source|Analyzing|reading/);
  await ready();
  await shot("21-mid-swr-workspace");
  await measure("mid vercel/swr");
  const top = await topBuilding();
  await clickBuilding(top);
  await shot("22-mid-swr-selected");
  await pg.click("#tab-code");
  await wait(2500);
  await shot("23-mid-swr-code-tab");
  await pg.click("#tab-city");
  await wait(800);
  await focusShot("24-mid-swr-focus-monaco", top);
  await pg.click("[data-colorby]");
  await wait(1500);
  await shot("25-mid-swr-colorcoded-module");
  await pg.click("[data-colorby]");
  await wait(1500);
  await shot("26-mid-swr-colorcoded-language");
  await pg.click("[data-colorby]");
  await wait(800);
  await pg.evaluate((id: string) => (window as unknown as W).__codelensCity.focusOn(id, 85), top);
  await wait(1200);
  await shot("27-mid-swr-closeup-mixed-blocks");
}

if (want("local")) {
  await pg.goto(BASE + "/");
  await wait(800);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(1200);
  await pg.setInputFiles("input[data-pick=zip]", "/tmp/testproj/codelens-src.zip");
  await wait(400);
  await shot("40-zip-picked");
  await pg.click(".cl-drop__picked a");
  await buildingShot("41-zip-building", /Raising buildings[\s\S]*Tallest|Skipping secrets/);
  await ready();
  await shot("42-zip-workspace");
  await measure("local zip (codelens-app source)");
  await pg.evaluate(() => (window as unknown as W).CodeLensWorkspace.select(".env.local"));
  await wait(800);
  await shot("43-vault-talk-panel");
  await pg.click("#tab-code");
  await wait(1200);
  await shot("44-vault-code-never-read");
  await pg.click("#tab-city");
  await pg.goto(BASE + "/");
  await wait(800);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(1200);
  await pg.setInputFiles("input[data-pick=dir]", "/tmp/testproj/demo");
  await wait(400);
  await shot("50-folder-picked");
  await pg.click(".cl-drop__picked a");
  await ready();
  await shot("51-folder-workspace");
  await measure("local folder (codecity demo)");
}

if (want("errors")) {
  await pg.goto(BASE + "/");
  await wait(800);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(1200);
  await pg.fill(".cl-gh", "https://gitlab.com/owner/repo");
  await pg.click(".cl-form button[type=submit]");
  await wait(400);
  await shot("60-error-invalid-url");
  await pg.fill(".cl-gh", "https://github.com/maverick-codelens-test/this-repo-does-not-exist-42");
  await pg.click(".cl-form button[type=submit]");
  await pg.waitForURL("**/building**");
  await pg.waitForSelector("[data-err]:not([hidden])", { timeout: 60000 });
  await wait(400);
  await shot("61-error-repo-not-found");
}

if (only === "large") {
  await landingImport("https://github.com/facebook/react");
  await buildingShot("70-large-react-building", /reading|Analyzing/);
  await ready();
  await shot("71-large-react-workspace");
  await measure("large facebook/react");
}
console.log("PERF", JSON.stringify(perf));
await br.close();
