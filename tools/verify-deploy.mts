// Verify a deployed CodeLens URL in headless Chrome: node --import tsx tools/verify-deploy.mts <baseUrl> <label>
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const BASE = process.argv[2].replace(/\/$/, ""); const L = process.argv[3] ?? "site";
const OUT = "/workspace/codelens-app-shots/deploy";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
const errs: string[] = [];
pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
await pg.addInitScript(() => { try { localStorage.setItem("codelens.introSeen", "1"); localStorage.setItem("codelens.keyAsked", "1"); sessionStorage.setItem("codelens.guest", "1"); sessionStorage.setItem("codelens.accountAsked", "1"); } catch {} });
await pg.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation " + e.violatedDirective + " " + e.blockedURI)));
const res: string[] = []; let fails = 0;
const rec = (n: string, ok: boolean, note = "") => { if (!ok) fails++; res.push((ok ? "PASS " : "FAIL ") + n + (note ? " — " + note : "")); console.log(res[res.length - 1]); };
const t0 = Date.now();
const r = await pg.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
await pg.waitForTimeout(2500);
rec("landing loads", r.status() === 200 && /CodeLens/.test(await pg.title()), `${r.status()} in ${Date.now() - t0} ms`);
await pg.screenshot({ path: `${OUT}/${L}-1-landing.png` });
await pg.goto(BASE + "/workspace"); await pg.waitForTimeout(2500);
rec("/workspace empty state", await pg.evaluate(() => !document.querySelector("[data-empty]")?.hasAttribute("hidden")));
await pg.screenshot({ path: `${OUT}/${L}-2-workspace-empty.png` });
await pg.goto(BASE + "/"); await pg.waitForTimeout(800);
await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(1000);
await pg.fill(".cl-gh", "https://github.com/sindresorhus/slugify");
await pg.click(".cl-form button[type=submit]");
await pg.waitForURL(/building/, { timeout: 20000 }).catch(() => {});
await pg.waitForTimeout(1500);
await pg.screenshot({ path: `${OUT}/${L}-3-building.png` });
await pg.waitForFunction(() => /workspace/.test(location.pathname) || !document.querySelector("[data-err]")?.hasAttribute("hidden"), null, { timeout: 180000 });
const onWs = /workspace/.test(pg.url());
let note = onWs ? "" : await pg.evaluate(() => document.querySelector("[data-err]")?.textContent);
if (onWs) { await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 60000 }); await pg.waitForTimeout(2500); note = `${await pg.evaluate(() => (window as Any).__codelensPlan?.buildings?.length)} buildings`; }
rec("import sindresorhus/slugify builds the city", onWs, note);
await pg.screenshot({ path: `${OUT}/${L}-4-city.png` });
if (onWs) {
  const before = await pg.evaluate(() => document.querySelector(".ws-who [data-path]")?.textContent);
  const target = await pg.evaluate((cur: string) => { const p = (window as Any).__codelensPlan; const c = (window as Any).__codelensCity; const bs = p.buildings.filter((b: Any) => !b.members).sort((a: Any, b: Any) => b.score - a.score); for (const b of bs) { if (b.id === cur) continue; const s = c.screenPos(b.id); if (s && s[0] > 0 && s[1] > 0 && s[0] < innerWidth && s[1] < innerHeight && document.elementFromPoint(s[0], s[1])?.tagName === "CANVAS") return { id: b.id, s }; } return null; }, before);
  if (target) { await pg.mouse.move(target.s[0], target.s[1]); await pg.waitForTimeout(300); await pg.mouse.click(target.s[0], target.s[1]); await pg.waitForTimeout(1200); }
  const after = await pg.evaluate(() => document.querySelector(".ws-who [data-path]")?.textContent);
  rec("clicking a building opens its panel", !!target && after === target.id, `clicked ${target?.id}; panel shows ${after} (was ${before})`);
  await pg.screenshot({ path: `${OUT}/${L}-5-building-click.png` });
}
rec("no console errors", errs.length === 0, errs.join(" | "));
console.log(`${res.length - fails}/${res.length} passed`);
await br.close(); process.exit(fails ? 1 : 0);
