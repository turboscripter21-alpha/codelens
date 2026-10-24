// Image viewer screenshots: png + svg from a GitHub repo, jpg / too-large image / pdf card from a zip.
// node --import tsx tools/t100-shots.mts <baseUrl> <label> [github|zip|both] [zipPath]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const [BASE, LABEL, MODE = "both", ZIP = "/workspace/t100fx/gallery.zip"] = process.argv.slice(2);
const OUT = process.env.SHOT_OUT || "/workspace/codelens-app-shots/t100";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const results: Any = {};
async function session(name: string, load: (pg: Any) => Promise<void>, steps: (pg: Any) => Promise<void>) {
  const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs: string[] = [];
  pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
  pg.on("dialog", (d: Any) => { errs.push("DIALOG " + d.message()); d.dismiss(); });
  await pg.addInitScript("window.__name = (f) => f; try { localStorage.setItem('codelens.introSeen','1'); localStorage.setItem('codelens.keyAsked','1'); sessionStorage.setItem('codelens.guest','1'); sessionStorage.setItem('codelens.accountAsked','1'); } catch {}");
  await pg.goto(BASE + "/"); await pg.waitForTimeout(600);
  await load(pg);
  await pg.waitForURL(/workspace/, { timeout: 240000 });
  await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 180000 });
  await pg.evaluate(() => document.querySelector(".ws-intro [data-intro-close]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await pg.waitForTimeout(1200);
  await steps(pg);
  results[name + ".errors"] = errs;
  results[name + ".pwned"] = await pg.evaluate(() => (window as Any).__pwned ?? null);
  await pg.close();
}
const info = (pg: Any, host: string) => pg.evaluate((h: string) => {
  const f = document.querySelector(h + " .cl-img") as Any, c = document.querySelector(h + " .cl-card") as Any;
  return f ? { viewer: f.dataset.ready, w: f.dataset.w, h: f.dataset.h, meta: f.querySelector(".cl-img__meta")?.textContent, src: f.querySelector("img")?.src?.slice(0, 5), inlineSvg: document.querySelectorAll(h + " svg").length }
    : c ? { card: c.textContent } : { none: document.querySelector(h)?.textContent?.slice(0, 120) };
}, host);
const codeTab = async (pg: Any, p: string, shot: string) => {
  await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.select(x), p);
  await pg.click("#tab-code");
  await pg.waitForSelector("[data-code-none] .cl-img[data-ready], [data-code-none] .cl-card", { timeout: 30000 });
  await pg.waitForTimeout(400);
  results[shot] = await info(pg, "[data-code-none]");
  await pg.screenshot({ path: `${OUT}/${LABEL}-${shot}.png` });
};
const focus = async (pg: Any, p: string, shot: string) => {
  await pg.evaluate((x: string) => (window as Any).CodeLensWorkspace.focus(x), p);
  await pg.waitForSelector(".vsc-binary .cl-img[data-ready], .vsc-binary .cl-card", { timeout: 30000 });
  await pg.waitForTimeout(900);
  results[shot] = await info(pg, ".vsc-binary");
  await pg.screenshot({ path: `${OUT}/${LABEL}-${shot}.png` });
};
const exit = (pg: Any) => pg.evaluate(() => (window as Any).CodeLensWorkspace.exit());

if (MODE !== "zip") await session("github", async (pg) => {
  await pg.fill(".cl-gh", "https://github.com/chalk/chalk"); await pg.click(".cl-form button[type=submit]");
}, async (pg) => {
  await codeTab(pg, "media/screenshot.png", "gh-png-codetab");
  await focus(pg, "media/logo.png", "gh-png-focus");
  await exit(pg);
  await pg.click("[data-theme]"); await pg.waitForTimeout(500);
  await focus(pg, "media/logo.svg", "gh-svg-focus-night");
  const old = await pg.evaluate(() => (document.querySelector(".vsc-binary .cl-img img") as Any).src);
  await pg.click(".vsc-tabs__rest .cl-srcbtn");
  await pg.waitForSelector(".vsc-editor .monaco-editor .view-line", { timeout: 30000 }); await pg.waitForTimeout(800);
  results["gh-svg-source"] = await pg.evaluate(() => ({ lines: document.querySelectorAll(".vsc-editor .view-line").length, btn: document.querySelector(".cl-srcbtn")?.textContent }));
  await pg.screenshot({ path: `${OUT}/${LABEL}-gh-svg-view-source.png` });
  await exit(pg);
  results["gh-revoked"] = await pg.evaluate((u: string) => new Promise((res) => { const i = new Image(); i.onload = () => res(false); i.onerror = () => res(true); i.src = u; }), old);
});

if (MODE !== "github") await session("zip", async (pg) => {
  await pg.setInputFiles("input[data-pick=zip]", ZIP); await pg.waitForTimeout(300); await pg.click(".cl-drop__picked a");
}, async (pg) => {
  const root = await pg.evaluate(() => Object.keys((window as Any).CodeLensWorkspace.plan.buildings.reduce((a: Any, b: Any) => (a[b.id] = 1, a), {})).find((k: string) => k.endsWith("img/photo.jpg")));
  const pre = root.slice(0, root.indexOf("img/photo.jpg"));
  results.zipRoot = pre;
  await codeTab(pg, pre + "img/photo.jpg", "zip-jpg-codetab");
  await pg.click("[data-code-none] .cl-img__zoom button:nth-child(2)"); await pg.waitForTimeout(300);
  await pg.screenshot({ path: `${OUT}/${LABEL}-zip-jpg-100pct.png` });
  await focus(pg, pre + "img/photo.jpg", "zip-jpg-focus");
  await focus(pg, pre + "img/smile.svg", "zip-svg-focus");
  await focus(pg, pre + "img/badge.png", "zip-png-transparent-focus");
  await focus(pg, pre + "img/huge.jpg", "zip-too-large-focus");
  await exit(pg);
  await codeTab(pg, pre + "img/huge.jpg", "zip-too-large-codetab");
  await codeTab(pg, pre + "docs/guide.pdf", "zip-pdf-card");
  await codeTab(pg, pre + "fonts/Inter.woff2", "zip-font-card");
  await codeTab(pg, pre + "index.js", "zip-js-still-code").catch(async () => { results["zip-js-still-code"] = await pg.evaluate(() => ({ codeShown: !(document.querySelector("[data-code-real]") as Any).hidden, lines: document.querySelectorAll("[data-code-lines] .ln").length })); await pg.screenshot({ path: `${OUT}/${LABEL}-zip-js-still-code.png` }); });
});
console.log(JSON.stringify(results, null, 1));
await br.close();
