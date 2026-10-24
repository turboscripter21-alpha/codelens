// t81 part B screenshots + checks: node --import tsx tools/t81b-shots.mts <baseUrl> <github-url> [devBaseUrl devLogFile]
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
import { readFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const [BASE, REPO, DEV, DEVLOG] = process.argv.slice(2);
const OUT = process.env.SHOT_OUT || "/workspace/codelens-app-shots/t81";
const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const res: Record<string, unknown> = {};
const errs: string[] = [];
async function page(theme = "night", extra = "") {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("console", (m: Any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e: Error) => errs.push("pageerror: " + e.message.slice(0, 200)));
  await pg.addInitScript(`window.__name = (f) => f; try { localStorage.setItem('codelens.introSeen', '1'); localStorage.setItem('codelens.theme', '${theme}'); ${extra} } catch {}`);
  return pg;
}
const shot = (pg: Any, n: string) => pg.screenshot({ path: `${OUT}/${n}.png`, timeout: 30000 }).catch((e: Error) => console.error("shot failed", n, e.message));
const wait = (pg: Any, ms: number) => pg.waitForTimeout(ms);
async function importRepo(pg: Any, base: string, url: string) {
  await pg.goto(base + "/"); await wait(pg, 600);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(pg, 800);
  await pg.fill(".cl-gh", url); await pg.click(".cl-form button[type=submit]");
  await pg.waitForURL(/workspace/, { timeout: 240000 });
  await pg.waitForFunction(() => (window as Any).__workspaceReady, null, { timeout: 120000 });
  await wait(pg, 2000);
}

/* ---------- 1. landing: account card with env off (production server) ---------- */
{
  const pg = await page("night");
  await pg.goto(BASE + "/"); await wait(pg, 1500);
  res.landingAuth = await pg.evaluate(() => ({ dialogOpen: !!(document.querySelector("dialog[data-account]") as HTMLDialogElement)?.open, offNote: document.querySelector("[data-auth-off]")?.textContent, chip: document.querySelector("[data-ac-label]")?.textContent }));
  await shot(pg, "b4-landing-auth-off");
  await pg.click("dialog[data-account] [data-guest]"); await wait(pg, 400);
  res.afterGuest = await pg.evaluate(() => ({ chip: document.querySelector("[data-ac-label]")?.textContent, title: (document.querySelector("[data-account-open]") as HTMLElement)?.title }));
  res.historyAsGuest = await pg.evaluate(async () => (await fetch("/api/history")).status);
  await pg.context().close();
}

/* ---------- 2. workspace: key pop-up, health, where-to-start, search, building chat, summary ---------- */
{
  const pg = await page("night", "sessionStorage.setItem('codelens.guest','1'); sessionStorage.setItem('codelens.accountAsked','1');");
  await importRepo(pg, BASE, REPO);
  // key pop-up: offered once after the intro (no key yet)
  await wait(pg, 1200);
  res.keyPopupOffered = await pg.evaluate(() => (document.querySelector("[data-keydlg]") as HTMLDialogElement).open);
  await shot(pg, "b7-key-popup");
  const kd = "[data-keydlg]";
  res.keyLinks = await pg.evaluate(() => [...document.querySelectorAll("[data-keydlg] .ws-keylinks a")].map((a) => (a as HTMLAnchorElement).href));
  await pg.fill(kd + " [data-keyinput]", "not-a-key"); await pg.click(kd + " [data-keytest]"); await wait(pg, 300);
  res.testMalformed = await pg.textContent(kd + " [data-keystatus]");
  await pg.fill(kd + " [data-keyinput]", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE00"); await pg.click(kd + " [data-keytest]");
  await pg.waitForFunction(() => /Invalid|rate|busy|works|reach/i.test(document.querySelector("[data-keydlg] [data-keystatus]")?.textContent || ""), null, { timeout: 20000 }).catch(() => {});
  res.testRealInvalid = await pg.textContent(kd + " [data-keystatus]");
  await pg.click(kd + " [data-keyshow]"); await wait(pg, 200);
  res.keyShownType = await pg.getAttribute(kd + " [data-keyinput]", "type");
  await shot(pg, "b7-key-test-invalid");
  await pg.route("**/api/chat", (r: Any) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Gemini rate limit" }) }));
  await pg.click(kd + " [data-keytest]"); await wait(pg, 500);
  res.testLimited = await pg.textContent(kd + " [data-keystatus]");
  await shot(pg, "b7-key-test-ratelimited");
  await pg.unroute("**/api/chat");
  await pg.route("**/api/chat", (r: Any) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "OK" }) }));
  await pg.click(kd + " [data-keytest]"); await wait(pg, 500);
  res.testOk = await pg.textContent(kd + " [data-keystatus]");
  await shot(pg, "b7-key-test-ok");
  await pg.unroute("**/api/chat");
  await pg.click(kd + " .ws-key__btns [data-keyskip]").catch(async () => { await pg.keyboard.press("Escape"); });
  await wait(pg, 300);
  res.keyAfterSkip = await pg.evaluate(() => ({ open: (document.querySelector("[data-keydlg]") as HTMLDialogElement).open, stored: localStorage.getItem("codelens.geminiKey") }));

  // health colours
  await pg.evaluate(() => { const c = (window as Any).CodeLensWorkspace.city; c.setColorBy("health"); });
  for (let i = 0; i < 4; i++) { const t = await pg.textContent("[data-colorby]"); if (/health/.test(t)) break; await pg.click("[data-colorby]"); await wait(pg, 200); }
  await wait(pg, 600);
  res.health = await pg.evaluate(() => ({ button: document.querySelector("[data-colorby]")?.textContent, legend: document.querySelector("[data-colorlegend]")?.textContent, levels: (window as Any).__codelensPlan.buildings.reduce((m: Any, b: Any) => { m[b.health || "none"] = (m[b.health || "none"] || 0) + 1; return m; }, {}) }));
  const worst = await pg.evaluate(() => { const p = (window as Any).__codelensPlan; return (p.buildings.find((b: Any) => b.health === "bad" && !b.members) || p.buildings.find((b: Any) => !b.members)).id; });
  await pg.evaluate((p: string) => (window as Any).CodeLensWorkspace.select(p), worst); await wait(pg, 600);
  res.healthPanel = await pg.textContent("[data-health]").catch(() => null);
  await shot(pg, "b10-health-colours");

  // where to start
  await pg.click("[data-start-open]"); await wait(pg, 1800);
  res.whereToStart = await pg.evaluate(() => ({ items: [...document.querySelectorAll("[data-startlist] li")].map((l) => l.textContent?.replace(/\s+/g, " ").trim().slice(0, 90)), markers: document.querySelectorAll(".cl-marker, [data-marker]").length }));
  await shot(pg, "b8-where-to-start");
  await pg.click("[data-startlist] li:nth-child(2) button, [data-startlist] li:nth-child(2)"); await wait(pg, 1800);
  res.startClickSelected = await pg.evaluate(() => document.querySelector(".ws-files [aria-current]")?.getAttribute("data-path"));
  await shot(pg, "b8-where-to-start-flyto");
  await pg.click("[data-start-open]"); await wait(pg, 300);

  // search
  await pg.keyboard.press("Control+k"); await wait(pg, 300);
  await pg.keyboard.type("config"); await wait(pg, 400);
  res.search = await pg.evaluate(() => ({ open: (document.querySelector("[data-searchdlg]") as HTMLDialogElement).open, results: [...document.querySelectorAll("[data-searchlist] li")].slice(0, 6).map((l) => l.textContent?.replace(/\s+/g, " ").trim().slice(0, 80)) }));
  await shot(pg, "b9-search");
  await pg.keyboard.press("Enter"); await wait(pg, 1800);
  res.searchPicked = await pg.evaluate(() => ({ open: (document.querySelector("[data-searchdlg]") as HTMLDialogElement).open, selected: document.querySelector(".ws-files [aria-current]")?.getAttribute("data-path") }));
  await shot(pg, "b9-search-flyto");
  await pg.keyboard.press("/"); await wait(pg, 200);
  res.slashOpens = await pg.evaluate(() => (document.querySelector("[data-searchdlg]") as HTMLDialogElement).open);
  await pg.keyboard.press("Escape"); await wait(pg, 200);

  // building chat (no key)
  const top = await pg.evaluate(() => { const p = (window as Any).__codelensPlan; return p.buildings.filter((x: Any) => !x.members && /\.(t|j)sx?$/.test(x.id)).sort((a: Any, b: Any) => b.score - a.score)[0].id; });
  await pg.evaluate((p: string) => (window as Any).CodeLensWorkspace.focus(p), top);
  await pg.waitForSelector(".monaco-editor", { timeout: 30000 }); await wait(pg, 1800);
  res.bchatIntro = await pg.evaluate(() => ({ visible: !!document.querySelector("[data-bchat]")?.clientHeight, log: [...document.querySelectorAll("[data-bchat-log] li")].map((l) => l.textContent?.slice(0, 120)), chips: [...document.querySelectorAll("[data-bchat-chips] button")].map((b) => b.textContent), monacoW: (document.querySelector(".monaco-editor") as HTMLElement).clientWidth, floatCanvas: !!document.querySelector(".ws-float canvas") }));
  await pg.click("[data-bchat-chips] button:nth-child(2)"); await wait(pg, 500);
  await shot(pg, "b5-building-chat-nokey");
  await pg.fill("[data-bchat-input]", "Why is the retry logic written like this?"); await pg.press("[data-bchat-input]", "Enter"); await wait(pg, 700);
  res.bchatOpenNoKey = await pg.evaluate(() => ({ keyDialog: (document.querySelector("[data-keydlg]") as HTMLDialogElement).open, last: [...document.querySelectorAll("[data-bchat-log] li")].pop()?.textContent?.slice(0, 160) }));
  await shot(pg, "b5-building-chat-asks-for-key");
  await pg.keyboard.press("Escape"); await wait(pg, 300);
  // with a key (Gemini mocked)
  let lastBody: Any = null;
  await pg.route("**/api/chat", async (r: Any) => { lastBody = JSON.parse(r.request().postData() || "{}"); await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "I'm the heart of this library: I export the main hook. Line 12 is where I read the cache before fetching. (mocked Gemini reply)" }) }); });
  await pg.evaluate(() => localStorage.setItem("codelens.geminiKey", "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE00"));
  await pg.fill("[data-bchat-input]", "What would break if I deleted you?"); await pg.press("[data-bchat-input]", "Enter"); await wait(pg, 900);
  res.bchatWithKey = { persona: lastBody?.persona, file: lastBody?.file, sourceChars: lastBody?.source?.length, last: await pg.evaluate(() => [...document.querySelectorAll("[data-bchat-log] li")].pop()?.textContent?.slice(0, 160)) };
  await shot(pg, "b5-building-chat-gemini");
  await pg.evaluate(() => (window as Any).CodeLensWorkspace.exit()); await wait(pg, 800);

  // summary slideshow
  await pg.click("[data-summary-open]"); await wait(pg, 1800);
  res.summary1 = await pg.evaluate(() => ({ open: (document.querySelector("[data-sumdlg]") as HTMLDialogElement).open, step: document.querySelector("[data-sum-step]")?.textContent, title: document.querySelector("[data-sum-title]")?.textContent, text: document.querySelector("[data-sum-text]")?.textContent?.slice(0, 220), cityPaused: document.body.classList.contains("is-sum") }));
  await shot(pg, "b6-summary-1");
  await pg.click("[data-sum-next]"); await wait(pg, 1200); await pg.click("[data-sum-next]"); await wait(pg, 1200);
  res.summary3 = await pg.evaluate(() => ({ step: document.querySelector("[data-sum-step]")?.textContent, title: document.querySelector("[data-sum-title]")?.textContent, text: document.querySelector("[data-sum-text]")?.textContent?.slice(0, 220) }));
  await shot(pg, "b6-summary-3");
  await pg.click("[data-sum-ai-btn]"); await wait(pg, 900);
  res.summaryAi = { persona: lastBody?.persona, text: (await pg.textContent("[data-sum-ai]"))?.slice(0, 120) };
  await shot(pg, "b6-summary-gemini");
  await pg.click("[data-sum-play]"); await wait(pg, 7200);
  res.summaryAutoplayStep = await pg.textContent("[data-sum-step]");
  await pg.click("[data-sum-play]");
  await pg.keyboard.press("Escape"); await wait(pg, 500);
  res.summaryClosed = await pg.evaluate(() => ({ open: (document.querySelector("[data-sumdlg]") as HTMLDialogElement).open, isSum: document.body.classList.contains("is-sum") }));
  await pg.unroute("**/api/chat");
  res.perf = await pg.evaluate(() => (window as Any).CodeLensWorkspace.city.perf?.());
  await pg.context().close();
}

/* ---------- 3. DEV sign-in (next dev, code printed in the server console) + history ---------- */
if (DEV) {
  const pg = await page("day");
  await pg.goto(DEV + "/"); await wait(pg, 2500);
  await pg.waitForSelector("dialog[data-account] [data-email]", { timeout: 30000 });
  await shot(pg, "b4-landing-auth-dev");
  const email = "maverick.test@example.com";
  await pg.fill("[data-email]", email); await pg.click("[data-send]");
  await pg.waitForSelector("[data-code]", { timeout: 20000 }); await wait(pg, 500);
  await shot(pg, "b4-code-step");
  await wait(pg, 500);
  const m = [...readFileSync(DEVLOG, "utf8").matchAll(/sign-in code for maverick\.test@example\.com: (\d{6})/g)].pop();
  await pg.fill("[data-code]", "000000"); await pg.click("[data-verify]"); await wait(pg, 800);
  res.wrongCode = await pg.textContent("dialog[data-account] .ac-err");
  await pg.fill("[data-code]", m![1]); await pg.click("[data-verify]");
  await pg.waitForSelector("[data-history]", { timeout: 20000 }); await wait(pg, 400);
  res.cookie = (await pg.context().cookies()).map((c: Any) => ({ name: c.name, httpOnly: c.httpOnly, sameSite: c.sameSite }));
  await shot(pg, "b4-history-empty");
  await pg.keyboard.press("Escape");
  await importRepo(pg, DEV, REPO);
  await pg.goto(DEV + "/"); await wait(pg, 1500);
  await pg.click("[data-account-open]"); await pg.waitForSelector("[data-history] .ac-item", { timeout: 20000 }); await wait(pg, 400);
  res.history = await pg.evaluate(() => [...document.querySelectorAll("[data-history] .ac-item")].map((l) => l.textContent?.replace(/\s+/g, " ").slice(0, 140)));
  await shot(pg, "b4-history-list");
  await pg.click("[data-logout]"); await wait(pg, 800);
  res.afterLogout = await pg.evaluate(async () => ({ chip: document.querySelector("[data-ac-label]")?.textContent, history: (await fetch("/api/history")).status }));
  await shot(pg, "b4-logged-out");
  await pg.context().close();
}
res.consoleErrors = errs;
console.log(JSON.stringify(res, null, 1));
await br.close();
