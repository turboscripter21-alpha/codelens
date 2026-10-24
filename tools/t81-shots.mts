// t81 screenshots + checks: node --import tsx tools/t81-shots.mts <baseUrl> <section a|b> [github-url...]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const [BASE, SECTION = "a", ...REPOS] = process.argv.slice(2);
const OUT = process.env.SHOT_OUT || "/workspace/codelens-app-shots/t81";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
const res: Record<string, unknown> = {};
const errs: string[] = [];
async function page(theme = "night") {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
  await pg.addInitScript(`window.__name = (f) => f; try { sessionStorage.setItem('codelens.guest','1'); sessionStorage.setItem('codelens.accountAsked','1'); localStorage.setItem('codelens.keyAsked','1'); } catch {}  try { localStorage.setItem('codelens.introSeen', '1'); localStorage.setItem('codelens.keyIntroSeen', '1'); localStorage.setItem('codelens.theme', '${theme}'); } catch {}`);
  return pg;
}
async function importRepo(pg: Any, url: string) {
  await pg.goto(BASE + "/"); await pg.waitForTimeout(600);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(800);
  await pg.fill(".cl-gh", url); await pg.click(".cl-form button[type=submit]");
  await pg.waitForURL(/workspace/, { timeout: 240000 });
  await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 120000 });
  await pg.waitForTimeout(2500);
}
const shot = (pg: Any, n: string) => pg.screenshot({ path: `${OUT}/${n}.png`, timeout: 30000 }).catch((e: Error) => console.error("shot failed", n, e.message));
const wait = (pg: Any, ms: number) => pg.waitForTimeout(ms);

if (SECTION === "a") {
  for (const url of REPOS) {
    const name = url.split("/").pop();
    const pg = await page("night");
    await importRepo(pg, url);
    const st = await pg.evaluate(() => (window as Any).__codelensCity.windowStats());
    res[name + ".windows"] = { buildings: st.buildings, withoutLitWindows: st.withoutLitWindows.length, examples: st.withoutLitWindows.slice(0, 5), lowDetail: st.withoutLitWindowsLowDetail?.length ?? "n/a (small city, no low-detail bake)" };
    await shot(pg, `night-${name}-out`);
    await pg.evaluate(() => { const c = (window as Any).__codelensCity, p = (window as Any).__codelensPlan; const b = p.buildings.filter((x: Any) => !x.members).sort((a: Any, b: Any) => b.score - a.score)[0]; c.focusOn(b.id, 55); });
    await wait(pg, 1500); await shot(pg, `night-${name}-in`);
    await pg.evaluate(() => { const c = (window as Any).__codelensCity; c.fitView(); c.debugQuality(3); }); await wait(pg, 1200);
    res[name + ".lowDetailPerf"] = await pg.evaluate(() => (window as Any).__codelensCity.perf());
    await shot(pg, `night-${name}-moving-lowdetail`);
    await pg.evaluate(() => (window as Any).__codelensCity.debugQuality(0)); await wait(pg, 500);
    if (name === REPOS[0].split("/").pop()) {
      // sidebar: open, closed (button), back open (Ctrl+B), remembered after reload
      const w0 = await pg.evaluate(() => (document.querySelector("[data-city] canvas") as HTMLElement).clientWidth);
      await shot(pg, "sidebar-open");
      await pg.click("[data-sidetoggle]");
      const t0 = Date.now(); let w1 = w0;
      while (Date.now() - t0 < 4000) { await wait(pg, 100); w1 = await pg.evaluate(() => (document.querySelector("[data-city] canvas") as HTMLElement).clientWidth); if (w1 > w0 + 100) break; }
      res.sidebarCloseSettledMs = Date.now() - t0;
      await wait(pg, 400);
      await shot(pg, "sidebar-closed");
      await pg.reload(); await pg.waitForFunction(() => (window as Any).__workspaceReady); await wait(pg, 1500);
      const kept = await pg.evaluate(() => document.body.classList.contains("tree-off"));
      await pg.keyboard.press("Control+b"); await wait(pg, 1500);
      const w2 = await pg.evaluate(() => ({ w: (document.querySelector("[data-city] canvas") as HTMLElement).clientWidth, open: !document.body.classList.contains("tree-off") }));
      res.sidebar = { canvasWidthOpen: w0, canvasWidthClosed: w1, closedAfterReload: kept, ctrlBReopened: w2 };
      // Monaco follows night mode, live for an open editor
      await pg.evaluate(() => { const p = (window as Any).__codelensPlan; const b = p.buildings.filter((x: Any) => !x.members).sort((a: Any, b: Any) => b.score - a.score)[0]; (window as Any).CodeLensWorkspace.focus(b.id); });
      await pg.waitForSelector(".monaco-editor", { timeout: 30000 }); await wait(pg, 1500);
      const bg = () => pg.evaluate(() => getComputedStyle(document.querySelector(".monaco-editor .monaco-editor-background") as Element).backgroundColor);
      const darkBg = await bg(); await shot(pg, "monaco-dark");
      await pg.click("[data-theme]"); await wait(pg, 1200);
      const lightBg = await bg(); await shot(pg, "monaco-light-after-toggle");
      await pg.click("[data-theme]"); await wait(pg, 800);
      res.monaco = { nightBg: darkBg, dayBgAfterLiveToggle: lightBg, backToNight: await bg() };
    }
    await pg.context().close();
  }
}
if (SECTION === "tree") {
  // VS Code-style tree on a big repo: only expanded folders are in the DOM
  const pg = await page("day");
  await importRepo(pg, REPOS[0]);
  await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("codelens.tree.")) localStorage.removeItem(k); });
  await pg.click("[data-collapse-all]"); await wait(pg, 300);
  const count = () => pg.evaluate(() => ({ rows: document.querySelectorAll(".ws-files li").length, files: document.querySelectorAll(".ws-files [data-path]").length, open: document.querySelectorAll(".ws-dirbtn[aria-expanded=true]").length }));
  const t0 = await count();
  await shot(pg, "tree-collapsed");
  const first = await pg.evaluate(() => (document.querySelector(".ws-dirbtn") as HTMLElement).dataset.dir);
  const tClick = Date.now(); await pg.click(".ws-dirbtn"); await wait(pg, 200);
  const t1 = await count();
  const clickMs = Date.now() - tClick - 200;
  // select a deep file "from the city": its folders open and it scrolls into view
  const deep = await pg.evaluate(() => { const p = (window as Any).__codelensPlan; return p.buildings.filter((x: Any) => !x.members && x.id.split("/").length > 4).sort((a: Any, b: Any) => b.score - a.score)[0].id; });
  await pg.evaluate((d: string) => (window as Any).CodeLensWorkspace.select(d), deep); await wait(pg, 600);
  const sel = await pg.evaluate((d: string) => { const b = document.querySelector(".ws-files [aria-current]") as HTMLElement; const l = document.querySelector(".ws-files") as HTMLElement; if (!b) return null; const r = b.getBoundingClientRect(), lr = l.getBoundingClientRect(); return { path: b.dataset.path, isDeep: b.dataset.path === d, visible: r.top >= lr.top - 2 && r.bottom <= lr.bottom + 2 }; }, deep);
  await shot(pg, "tree-revealed-deep-file");
  const t2 = await count();
  await pg.reload(); await pg.waitForFunction(() => (window as Any).__workspaceReady); await wait(pg, 1200);
  const t3 = await count();
  await pg.click("[data-collapse-all]"); await wait(pg, 300);
  const t4 = await count();
  await shot(pg, "tree-collapse-all");
  res.tree = { totalFiles: await pg.evaluate(() => (window as Any).__codelensPlan.buildings.length), collapsed: t0, afterOpening: { folder: first, ...t1, clickMs }, deepFile: deep, selected: sel, afterReveal: t2, afterReload: t3, afterCollapseAll: t4 };
  await pg.context().close();
}
if (SECTION === "media") {
  const pg = await page("day");
  await pg.goto(BASE + "/"); await wait(pg, 500);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(pg, 700);
  await pg.setInputFiles("input[data-pick=zip]", REPOS[0]); await wait(pg, 300); await pg.click(".cl-drop__picked a");
  await pg.waitForURL(/workspace/, { timeout: 120000 }); await pg.waitForFunction(() => (window as Any).__workspaceReady); await wait(pg, 1500);
  const out: Record<string, unknown> = {};
  for (const f of ["sounds/beep.wav", "clip.webm"]) {
    const path = await pg.evaluate((n: string) => (window as Any).__codelensPlan.buildings.map((b: Any) => b.id).find((id: string) => id.endsWith(n)), f);
    await pg.evaluate((p: string) => (window as Any).CodeLensWorkspace.select(p), path);
    await pg.click("#tab-code").catch(() => {});
    await wait(pg, 1200);
    out[f + ".codeTab"] = await pg.evaluate(() => { const m = document.querySelector("[data-code-none] audio, [data-code-none] video") as HTMLMediaElement; return m ? { tag: m.tagName, src: m.querySelector("source")?.src.slice(0, 5), type: m.querySelector("source")?.type, duration: m.duration, error: m.error?.code ?? null } : null; });
    await shot(pg, "media-" + f.split("/").pop() + "-codetab");
    await pg.evaluate((p: string) => (window as Any).CodeLensWorkspace.focus(p), path); await wait(pg, 1800);
    out[f + ".focus"] = await pg.evaluate(() => { const m = document.querySelector("[data-binary] audio, [data-binary] video") as HTMLMediaElement; return m ? { tag: m.tagName, type: m.querySelector("source")?.type, duration: m.duration, error: m.error?.code ?? null } : null; });
    await shot(pg, "media-" + f.split("/").pop() + "-focus");
    await pg.evaluate(() => (window as Any).CodeLensWorkspace.exit()); await wait(pg, 600);
  }
  res.media = out;
  await pg.context().close();
}
res.consoleErrors = errs;
console.log(JSON.stringify(res, null, 1));
await br.close();
