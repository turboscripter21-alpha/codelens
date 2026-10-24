// UI screenshots for t73: intro, day, night (+tilted for stars), focus+chat, zip skip summary.
// node --import tsx tools/ui-shots.mts <baseUrl> <github-url> [zipPath]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const [BASE, SRC, ZIP] = process.argv.slice(2);
const OUT = "/workspace/codelens-app-shots/t73";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
const errs: string[] = [];
pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
await pg.addInitScript("window.__name = (f) => f; try { sessionStorage.setItem('codelens.guest','1'); sessionStorage.setItem('codelens.accountAsked','1'); localStorage.setItem('codelens.keyAsked','1'); } catch {} ");
const res: Record<string, unknown> = {};
const shot = (n: string) => pg.screenshot({ path: `${OUT}/${n}.png`, timeout: 30000 });
async function importGh(url: string) {
  await pg.goto(BASE + "/"); await pg.waitForTimeout(500);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(700);
  await pg.fill(".cl-gh", url); await pg.click(".cl-form button[type=submit]");
  await pg.waitForURL(/workspace/, { timeout: 240000 });
  await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 120000 });
  await pg.waitForTimeout(2500);
}
await importGh(SRC);
res.introShown = await pg.evaluate(() => !!document.querySelector("dialog.ws-intro[open]"));
await shot("intro-popup");
await pg.check("[data-intro-never]"); await pg.click(".ws-intro__foot [data-intro-close]"); await pg.waitForTimeout(400);
res.introStored = await pg.evaluate(() => localStorage.getItem("codelens.introSeen"));
res.plain = await pg.textContent("[data-plain]");
await shot("day");
await pg.click("[data-theme]"); await pg.waitForTimeout(1600);
res.night = await pg.evaluate(() => ({ body: document.body.classList.contains("is-night"), city: (window as Any).__codelensCity.night, stored: localStorage.getItem("codelens.theme") }));
await shot("night");
const box = await pg.locator("[data-city] canvas").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await pg.mouse.move(cx, cy); for (let i = 0; i < 6; i++) { await pg.mouse.wheel(0, -240); await pg.waitForTimeout(60); }
await pg.mouse.down({ button: "right" }); for (let k = 1; k <= 10; k++) { await pg.mouse.move(cx + k * 14, cy + k * 5); await pg.waitForTimeout(16); } await pg.mouse.up({ button: "right" });
await pg.waitForTimeout(900); await shot("night-zoomed-panned");
// tilt up to see the sky (moon + stars)
await pg.mouse.move(cx, cy); await pg.mouse.down(); for (let k = 1; k <= 12; k++) { await pg.mouse.move(cx, cy - k * 22); await pg.waitForTimeout(16); } await pg.mouse.up();
for (let i = 0; i < 6; i++) { await pg.mouse.wheel(0, 300); await pg.waitForTimeout(60); }
await pg.waitForTimeout(900); await shot("night-sky");
await pg.click("[data-theme]"); await pg.waitForTimeout(1600); await shot("day-sky");
// reload: theme persists
await pg.reload(); await pg.waitForFunction(() => (window as Any).__workspaceReady); await pg.waitForTimeout(1500);
res.afterReload = await pg.evaluate(() => ({ night: document.body.classList.contains("is-night"), intro: !!document.querySelector("dialog.ws-intro[open]") }));
await pg.click("[data-theme]"); await pg.waitForTimeout(1500);
await shot("day-zoomed-panned".replace("day", "day-reload"));
// focus mode + chat beside Monaco (no key -> explains the free key)
const top: string = await pg.evaluate(() => (window as Any).__codelensPlan.buildings.filter((b: Any) => !b.members).sort((a: Any, b: Any) => b.score - a.score)[0].id);
await pg.evaluate((p: string) => (window as Any).CodeLensWorkspace.focus(p), top);
await pg.waitForTimeout(3500);
await pg.click(".monaco-editor .view-lines").catch(() => {});
res.talkVisibleInFocus = await pg.evaluate(() => { const t = document.querySelector(".ws-talk") as HTMLElement; return t && getComputedStyle(t).display !== "none" && t.getBoundingClientRect().width > 100; });
await pg.click("[data-follow]"); await pg.keyboard.type("What does this file do?"); await pg.keyboard.press("Enter");
await pg.waitForTimeout(500);
res.focusStillOpen = await pg.evaluate(() => document.body.classList.contains("is-focus"));
res.chat = await pg.evaluate(() => [...document.querySelectorAll(".ws-msg")].map((m) => (m as HTMLElement).innerText.slice(0, 120)));
await shot("chat-beside-monaco");
await pg.click(".ws-msg__act"); await pg.waitForTimeout(300);
res.keyDialog = await pg.evaluate(() => !!document.querySelector("dialog.ws-dlg[open]"));
await pg.fill("[data-keyinput]", "not a key"); await pg.click(".ws-dlg__go"); await pg.waitForTimeout(200);
res.keyErr = await pg.textContent("[data-keyerr]");
await shot("gemini-key-dialog");
await pg.click("[data-keycancel]");
// ? reopens intro
await pg.click("[data-intro-open]"); await pg.waitForTimeout(300);
res.introReopen = await pg.evaluate(() => !!document.querySelector("dialog.ws-intro[open]"));
await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
res.focusAfterEscOnDialog = await pg.evaluate(() => document.body.classList.contains("is-focus"));
// zip import: skip summary
if (ZIP) {
  await pg.goto(BASE + "/"); await pg.waitForTimeout(500);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(700);
  await pg.setInputFiles("input[data-pick=zip]", ZIP); await pg.waitForTimeout(300); await pg.click(".cl-drop__picked a");
  await pg.waitForURL(/workspace/, { timeout: 120000 }); await pg.waitForFunction(() => (window as Any).__workspaceReady); await pg.waitForTimeout(1500);
  await pg.click(".ws-skipped summary").catch(() => {}); await pg.waitForTimeout(200);
  res.zip = await pg.evaluate(() => ({ files: [...document.querySelectorAll(".ws-files [data-path]")].map((b) => (b as HTMLElement).dataset.path), summary: (document.querySelector(".ws-skipped") as HTMLElement)?.innerText }));
  await shot("zip-skip-summary");
}
res.errors = errs;
console.log(JSON.stringify(res, null, 1));
await br.close();
