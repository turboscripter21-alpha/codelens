// Interaction + perf probe in headless Chrome: does wheel / drag move the camera, frame times, memory over a 30 s pan/zoom soak.
// node --import tsx tools/perf-probe.mts <baseUrl> <github-url|zip:/path> [label] [soakSeconds]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const [BASE, SRC, LABEL = "probe", SOAK = "30"] = process.argv.slice(2);
const OUT = "/workspace/codelens-app-shots/t73";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();
const errs: string[] = [];
pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
await pg.addInitScript("window.__name = (f) => f; try { sessionStorage.setItem('codelens.guest','1'); sessionStorage.setItem('codelens.accountAsked','1'); localStorage.setItem('codelens.keyAsked','1'); } catch {}  window.__rafCalls = 0; const _raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__rafCalls++; return _raf(cb); };");   // tsx keepNames helper inside evaluate()
const out: Record<string, unknown> = { label: LABEL, src: SRC };
const shot = async (o: { path: string }) => { try { await pg.screenshot({ ...o, timeout: 20000 }); } catch { ((out.screenshotTimeouts ??= []) as string[]).push(o.path.split("/").pop() as string); console.error("screenshot timed out (main thread pegged):", o.path); } };
const log = (k: string, v: unknown) => { out[k] = v; console.error(k, JSON.stringify(v)); };
const rafRate = () => pg.evaluate(() => new Promise((r) => { const a = (window as Any).__rafCalls; setTimeout(() => r((window as Any).__rafCalls - a), 1000); }));
await pg.goto(BASE + "/"); await pg.waitForTimeout(600);
await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(900);
if (SRC.startsWith("zip:")) { await pg.setInputFiles("input[data-pick=zip]", SRC.slice(4)); await pg.waitForTimeout(300); await pg.click(".cl-drop__picked a"); }
else { await pg.fill(".cl-gh", SRC); await pg.click(".cl-form button[type=submit]"); }
await pg.waitForURL(/workspace/, { timeout: 240000 });
await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 120000 });
await pg.evaluate(() => { (window as Any).__introSeen = true; document.querySelector(".ws-intro [data-intro-close]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
await pg.waitForTimeout(2500);
const box = await pg.locator("[data-city] canvas").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const cam = () => pg.evaluate(() => { const c = (window as Any).__codelensCity; return c.camState ? c.camState() : null; });
// frame timing: rAF intervals + main-thread busy time over N ms
const frames = (ms: number) => pg.evaluate((ms: number) => new Promise((res) => { const d: number[] = []; let last = performance.now(); const t0 = last; const f = (t: number) => { d.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ frames: d.length, fps: +(d.length / (ms / 1000)).toFixed(1), p50: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1) }); } }; requestAnimationFrame(f); }), ms);
const info = () => pg.evaluate(() => { const c = (window as Any).__codelensCity; (window as Any).gc?.(); const i = c.info(); return { calls: i.calls, triangles: i.triangles, geometries: i.geometries, textures: (c.memInfo?.() || {}).textures, programs: i.programs, heapMB: +((performance as Any).memory.usedJSHeapSize / 1048576).toFixed(1), perf: c.perf?.() }; });
log('idle', { ...(await info()), timing: await frames(4000), rafCallsPerSec: await rafRate() });
await shot({ path: `${OUT}/${LABEL}-0-start.png` });
// interaction checks (camera must move)
const c0 = await cam(); await pg.mouse.move(cx, cy);
for (let i = 0; i < 8; i++) { await pg.mouse.wheel(0, -240); await pg.waitForTimeout(60); }
await pg.waitForTimeout(800); const c1 = await cam(); log('afterWheel', { rafCallsPerSec: await rafRate(), dist: [c0?.dist, c1?.dist] });
await shot({ path: `${OUT}/${LABEL}-1-zoomed.png` });
const drag = async (btn: "left" | "right" | "middle", mod?: string, dx = 220, dy = 60) => { if (mod) await pg.keyboard.down(mod); await pg.mouse.move(cx, cy); await pg.mouse.down({ button: btn }); for (let k = 1; k <= 12; k++) { await pg.mouse.move(cx + dx * k / 12, cy + dy * k / 12); await pg.waitForTimeout(16); } await pg.mouse.up({ button: btn }); if (mod) await pg.keyboard.up(mod); await pg.waitForTimeout(700); };
await drag("right"); const c2 = await cam();
await shot({ path: `${OUT}/${LABEL}-2-panned.png` });
await drag("left", "Shift", -160, -40); const c3 = await cam();
await drag("left", "Control", 120, 30); const c3b = await cam();
await drag("left", undefined, 260, 0); const c4 = await cam();
await shot({ path: `${OUT}/${LABEL}-3-rotated.png` });
const d = (a: Any, b: Any, k: string) => a && b ? +Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1], a[k][2] - b[k][2]).toFixed(2) : null;
log('controls', { zoomDistance: [c0?.dist, c1?.dist], wheelZooms: !!(c0 && c1 && c1.dist < c0.dist - 1), rightDragPanTarget: d(c1, c2, "target"), shiftDragPanTarget: d(c2, c3, "target"), ctrlDragPanTarget: d(c3, c3b, "target"), leftDragRotate: d(c3b, c4, "pos"), leftDragKeepsTarget: d(c3b, c4, "target"), rafCallsPerSecAfter: await rafRate() });
// soak: 30 s of wheel + drags, timing measured during
const before = await info();
const soakMs = +SOAK * 1000; const t0 = Date.now(); let n = 0;
const timing = frames(Math.min(soakMs, 8000));
while (Date.now() - t0 < soakMs) {
  await pg.mouse.move(cx + ((n * 37) % 300) - 150, cy + ((n * 53) % 200) - 100);
  await pg.mouse.wheel(0, n % 2 ? 300 : -300);
  await pg.mouse.down({ button: n % 3 ? "left" : "right" });
  for (let k = 0; k < 6; k++) await pg.mouse.move(cx + Math.sin(n + k) * 200, cy + Math.cos(n + k) * 120);
  await pg.mouse.up({ button: n % 3 ? "left" : "right" });
  n++;
}
const during = await timing;
await pg.waitForTimeout(1500);
const after = await info();
log('soak', { seconds: +SOAK, cycles: n, before, after, timingDuring: during, rafCallsPerSecAfter: await rafRate() });
// focus mode: wheel / drag in the levitating building view
const top: string = await pg.evaluate(() => (window as Any).__codelensPlan.buildings.filter((b: Any) => !b.members).sort((a: Any, b: Any) => b.score - a.score)[0].id);
await pg.evaluate((p: string) => (window as Any).CodeLensWorkspace.focus(p), top);
await pg.waitForTimeout(2500);
const lev = await pg.locator("[data-lev] canvas").boundingBox().catch(() => null);
if (lev) {
  const lc = () => pg.evaluate(() => (window as Any).__codelensLev?.camState?.() ?? null);
  const l0 = await lc(); const lx = lev.x + lev.width / 2, ly = lev.y + lev.height / 2;
  await pg.mouse.move(lx, ly); for (let i = 0; i < 5; i++) { await pg.mouse.wheel(0, -200); await pg.waitForTimeout(50); }
  await pg.waitForTimeout(500); const l1 = await lc();
  await pg.mouse.down({ button: "right" }); for (let k = 1; k <= 8; k++) await pg.mouse.move(lx + k * 12, ly + k * 4); await pg.mouse.up({ button: "right" }); await pg.waitForTimeout(500); const l2 = await lc();
  await pg.mouse.down(); for (let k = 1; k <= 8; k++) await pg.mouse.move(lx - k * 15, ly); await pg.mouse.up(); await pg.waitForTimeout(500); const l3 = await lc();
  log('focus', { wheelZooms: !!(l0 && l1 && l1.dist < l0.dist - 0.01), dist: [l0?.dist, l1?.dist], rightDragPan: d(l1, l2, "target"), leftDragRotate: d(l2, l3, "pos") });
  await shot({ path: `${OUT}/${LABEL}-4-focus.png` });
}
out.consoleErrors = errs;
console.log(JSON.stringify(out, null, 1));
await br.close();
