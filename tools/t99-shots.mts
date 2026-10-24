// District screenshots: one district per folder with files; sidebar folder click highlights it.
// node --import tsx tools/t99-shots.mts <baseUrl> <github-url> <label> [folderToHighlight]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const [BASE, SRC, LABEL, FOLDER] = process.argv.slice(2);
const OUT = process.env.SHOT_OUT || "/workspace/codelens-app-shots/t99";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pg = await (await br.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs: string[] = [];
pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
await pg.addInitScript("window.__name = (f) => f; try { localStorage.setItem('codelens.introSeen','1'); localStorage.setItem('codelens.keyAsked','1'); sessionStorage.setItem('codelens.guest','1'); sessionStorage.setItem('codelens.accountAsked','1'); } catch {}");
await pg.goto(BASE + "/"); await pg.waitForTimeout(600);
await pg.fill(".cl-gh", SRC); await pg.click(".cl-form button[type=submit]");
await pg.waitForURL(/workspace/, { timeout: 240000 });
await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 180000 });
await pg.evaluate(() => document.querySelector(".ws-intro [data-intro-close]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await pg.waitForTimeout(2500);
const plan = await pg.evaluate(() => { const p = (window as Any).__codelensPlan; const ds = p.districts.filter((d: Any) => d.kind === "district"); return { districts: ds.length, buildings: p.buildings.length, files: p.stats.files, numbered: ds.filter((d: Any) => /\(\d+\)/.test(d.label)).map((d: Any) => d.label), dupKeys: ds.length - new Set(ds.map((d: Any) => d.key)).size, sample: ds.slice(0, 12).map((d: Any) => d.label) }; });
const shown = () => pg.evaluate(() => [...document.querySelectorAll(".cc-labels .glabel.big")].filter((e: Any) => e.style.display === "block").map((e: Any) => e.textContent));
console.log(JSON.stringify({ label: LABEL, plan, labelsShown: (await shown()).length }));
await pg.screenshot({ path: `${OUT}/${LABEL}-1-overview.png` });
// zoom in: more (smaller) folder signs appear
const box = await pg.locator("[data-city] canvas").boundingBox();
await pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 6; i++) { await pg.mouse.wheel(0, -240); await pg.waitForTimeout(60); }
await pg.waitForTimeout(1200);
console.log(JSON.stringify({ zoomedLabels: (await shown()).length }));
await pg.screenshot({ path: `${OUT}/${LABEL}-2-zoomed.png` });
if (FOLDER) {
  // open the parents in the sidebar, then click the folder
  const parts = FOLDER.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const dp = parts.slice(0, i).join("/");
    const sel = `.ws-dirbtn[data-dir="${dp}"]`;
    await pg.waitForSelector(sel, { timeout: 5000 });
    const exp = await pg.getAttribute(sel, "aria-expanded");
    if (i < parts.length ? exp !== "true" : true) await pg.click(sel);
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => ({ district: (window as Any).__codelensCity.district, on: document.querySelector(".cc-labels .glabel.is-on")?.textContent, onShown: (document.querySelector(".cc-labels .glabel.is-on") as Any)?.style.display, sidebar: document.querySelector(".ws-dirbtn.is-district")?.getAttribute("data-dir") }));
  console.log(JSON.stringify({ highlight: st }));
  await pg.screenshot({ path: `${OUT}/${LABEL}-3-folder-highlight.png` });
}
console.log(JSON.stringify({ errors: errs }));
await br.close();
