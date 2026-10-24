// Phase 2/3 screenshots + perf. Needs `npm run start` on PORT (default 3100).
// node --import tsx tools/shoot-phase23.mts [sample|errors|github|local|all]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
import type { CityLayout } from "../lib/types";

const BASE = `http://localhost:${process.env.PORT ?? 3100}`;
const OUT = process.env.OUT ?? "/workspace/codelens-app-shots/phase2-3";
const only = process.argv[2] ?? "all";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
pg.on("console", (m: { type: () => string; text: () => string }) => m.type() === "error" && console.log("console:", m.text()));
pg.on("pageerror", (e: Error) => console.log("pageerror:", e.message));
type Pg = typeof pg;
const shot = (n: string) => pg.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms: number) => pg.waitForTimeout(ms);
const perf: Record<string, unknown> = {};

async function cityReady() {
  await pg.waitForFunction(() => (window as unknown as { __codelens?: unknown }).__codelens && (window as unknown as { __codelensLayout?: unknown }).__codelensLayout, null, { timeout: 60000 });
  await wait(1500);
}
async function info() {
  return pg.evaluate(() => (window as unknown as { __codelens: { info: () => unknown } }).__codelens.info());
}
async function layoutOf(p: Pg): Promise<CityLayout> {
  return p.evaluate(() => (window as unknown as { __codelensLayout: CityLayout }).__codelensLayout);
}
async function screenOf(x: number, y: number, z: number) {
  return pg.evaluate(([a, b, c]: number[]) => (window as unknown as { __codelens: { screenOf: (x: number, y: number, z: number) => { x: number; y: number } } }).__codelens.screenOf(a, b, c), [x, y, z]);
}
/** Click a building's road-facing wall centre. */
async function clickBuilding(path: string) {
  const l = await layoutOf(pg);
  const b = l.buildings.find((x) => x.path === path)!;
  const pt = await screenOf(b.x, b.height * 0.4 + 0.2, b.z + b.facing * b.depth * 0.5);
  await pg.mouse.move(pt.x, pt.y);
  await wait(200);
  await pg.mouse.click(pt.x, pt.y);
  await wait(500);
}
async function fps(label: string, url: string) {
  await pg.goto(url + (url.includes("?") ? "&" : "?") + "fps=1");
  await cityReady();
  await wait(1000);
  const f0 = await pg.evaluate(() => ({ f: (window as unknown as { __codelens: { info: () => { frames: number } } }).__codelens.info().frames, t: performance.now() }));
  await pg.mouse.move(900, 500);
  await pg.mouse.down();
  for (let i = 0; i < 50; i++) {
    await pg.mouse.move(900 + i * 4, 500 + Math.sin(i / 8) * 20);
    await wait(40);
  }
  await pg.mouse.up();
  await wait(600);
  const f1 = await pg.evaluate(() => ({ f: (window as unknown as { __codelens: { info: () => { frames: number } } }).__codelens.info().frames, t: performance.now() }));
  const i = (await info()) as Record<string, number>;
  const l = await layoutOf(pg);
  perf[label] = { fps: +(((f1.f - f0.f) * 1000) / (f1.t - f0.t)).toFixed(1), calls: i.calls, triangles: i.triangles, buildings: l.buildings.length, districts: l.districts.length, aggregated: l.aggregatedFiles ?? 0 };
  console.log("perf", label, JSON.stringify(perf[label]));
}
async function importGithub(url: string, tag: string, loadingShotAt?: RegExp) {
  await pg.goto(BASE + "/");
  await wait(400);
  await pg.fill("#repo", url);
  await pg.click("button[type=submit]");
  if (loadingShotAt) {
    await pg.waitForFunction((re: string) => new RegExp(re).test(document.body.innerText), loadingShotAt.source, { timeout: 60000 }).catch(() => {});
    await shot(`${tag}-loading`);
  }
  const t0 = Date.now();
  await pg.waitForURL("**/city**", { timeout: 120000 });
  await cityReady();
  console.log(tag, "import+render ms", Date.now() - t0);
}

if (only === "sample" || only === "all") {
  await pg.goto(BASE + "/city?source=sample");
  await cityReady();
  await shot("sample-04-city-overview");
  console.log("sample idle", JSON.stringify(await info()));
  await clickBuilding("src/App.js");
  await shot("sample-05-popup-1st-click");
  await clickBuilding("src/App.js");
  await wait(400);
  await shot("sample-06-panel-2nd-click");
  await pg.keyboard.press("Escape");
  await fps("sample", BASE + "/city?source=sample");
}

if (only === "errors" || only === "all") {
  await pg.goto(BASE + "/");
  await wait(500);
  await shot("01-import");
  await pg.fill("#repo", "https://gitlab.com/owner/repo");
  await pg.locator("#repo").blur();
  await wait(200);
  await shot("02-error-invalid-url");
  await pg.fill("#repo", "https://github.com/maverick-codelens-test/this-repo-does-not-exist-42");
  await pg.click("button[type=submit]");
  await pg.waitForSelector("[role=alert]", { timeout: 30000 });
  await wait(300);
  await shot("03-error-repo-not-found");
}

if (only === "github" || only === "all") {
  // small
  await importGithub("https://github.com/sindresorhus/slugify", "small");
  await shot("10-small-slugify-city");
  await fps("small sindresorhus/slugify", BASE + "/city?source=github");
  // mid
  await importGithub("https://github.com/vercel/swr", "mid", /Analyzing files|Downloading the source[\s\S]*KB|MB/);
  await shot("20-mid-swr-city");
  await pg.click("text=Project stats");
  await wait(400);
  await shot("21-mid-swr-metrics");
  await pg.click("[aria-label='Close stats']");
  const l = await layoutOf(pg);
  const top = [...l.buildings].filter((b) => !b.file.members && !b.file.secret).sort((a, b) => b.height - a.height)[0];
  await clickBuilding(top.path);
  await shot("22-mid-swr-popup");
  await clickBuilding(top.path);
  await wait(1500);
  await shot("23-mid-swr-panel-code-preview");
  await pg.keyboard.press("Escape");
  await fps("mid vercel/swr", BASE + "/city?source=github");
  // large
  await importGithub("https://github.com/facebook/react", "large", /Analyzing files[\s\S]*reading/);
  await shot("30-large-react-city");
  await pg.click("text=Project stats");
  await wait(400);
  await shot("31-large-react-metrics");
  await fps("large facebook/react", BASE + "/city?source=github");
}

if (only === "local" || only === "all") {
  await pg.goto(BASE + "/");
  await wait(400);
  await pg.setInputFiles("input[type=file][accept]", "/tmp/testproj/codelens-src.zip");
  await wait(300);
  await shot("40-local-zip-picked");
  await pg.click("text=Build from this");
  await pg.waitForURL("**/city**", { timeout: 60000 });
  await cityReady();
  await shot("41-local-zip-city");
  await pg.click("text=Project stats");
  await wait(300);
  await shot("42-local-zip-metrics");
  await pg.click("[aria-label='Close stats']");
  const l = await layoutOf(pg);
  const vault = l.buildings.find((b) => b.style === "vault")!;
  console.log("vault building:", vault?.path);
  await clickBuilding(vault.path);
  await clickBuilding(vault.path);
  await wait(500);
  await shot("43-vault-panel");
  await pg.keyboard.press("Escape");
  await fps("local zip (codelens-app source)", BASE + "/city?source=zip");
  // folder
  await pg.goto(BASE + "/");
  await wait(400);
  await pg.locator("input[type=file]:not([accept])").setInputFiles("/tmp/testproj/demo");
  await wait(300);
  await shot("50-local-folder-picked");
  await pg.click("text=Build from this");
  await pg.waitForURL("**/city**", { timeout: 60000 });
  await cityReady();
  await shot("51-local-folder-city");
}
console.log("PERF", JSON.stringify(perf));
await br.close();
