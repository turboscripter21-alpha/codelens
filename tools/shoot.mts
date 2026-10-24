// Screenshots + perf numbers. Run: node --import tsx tools/shoot.mts  (needs `npm run start` on PORT, default 3100)
// @ts-expect-error -- playwright-core lives outside this project on the dev box
import { chromium } from "/workspace/codelens-city-demo/node_modules/playwright-core/index.mjs";
import { buildCityLayout } from "../lib/layout";
import { sampleProject } from "../tests/fixtures/sampleProject";

const BASE = `http://localhost:${process.env.PORT ?? 3100}`;
const OUT = process.env.OUT ?? "/workspace/codelens-app-shots";
const br = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
pg.on("console", (m: { type: () => string; text: () => string }) => m.type() === "error" && console.log("console:", m.text()));
pg.on("pageerror", (e: Error) => console.log("pageerror:", e.message));
const shot = (n: string) => pg.screenshot({ path: `${OUT}/${n}.png` });

await pg.goto(BASE + "/");
await pg.waitForTimeout(600);
await shot("01-import-empty");
await pg.fill("#repo", "github.com/notarepo");
await pg.locator("#repo").blur();
await pg.waitForTimeout(150);
await shot("01b-import-invalid");
await pg.fill("#repo", "https://github.com/maverick/demo-project");
await pg.waitForTimeout(150);
await shot("02-import-github-url");
await pg.click("button[type=submit]");
await pg.waitForTimeout(1050);
await shot("03-loading");
await pg.waitForURL("**/city**", { timeout: 10000 });
await pg.waitForFunction(() => window.__codelens, null, { timeout: 30000 });
await pg.waitForTimeout(1500);
await shot("04-city-overview");
console.log("url:", pg.url());
console.log("idle frame info:", JSON.stringify(await pg.evaluate(() => window.__codelens!.info())));

const layout = buildCityLayout(sampleProject().root);
const target = layout.buildings.find((b) => b.path === "src/App.js")!;
const pt = await pg.evaluate(([x, y, z]: number[]) => window.__codelens!.screenOf(x, y, z), [target.x, target.height * 0.5, target.z + target.facing * target.depth * 0.5]);
await pg.mouse.move(pt.x, pt.y);
await pg.waitForTimeout(300);
await pg.mouse.click(pt.x, pt.y);
await pg.waitForSelector("[data-testid=building-popup]", { timeout: 5000 });
await pg.waitForTimeout(400);
await shot("05-popup-1st-click");
await pg.mouse.click(pt.x, pt.y);
await pg.waitForSelector("[data-testid=building-panel]", { timeout: 5000 });
await pg.waitForTimeout(500);
await shot("06-panel-2nd-click");
// The city recentres beside the panel, so find the building again for the 3rd click.
const pt2 = await pg.evaluate(([x, y, z]: number[]) => window.__codelens!.screenOf(x, y, z), [target.x, target.height * 0.5, target.z + target.facing * target.depth * 0.5]);
await pg.mouse.click(pt2.x, pt2.y);
await pg.waitForTimeout(300);
console.log("3rd click keeps panel:", await pg.locator("[data-testid=building-panel]").count());
await pg.keyboard.press("Escape");
await pg.waitForTimeout(300);
console.log("after Esc popup/panel:", await pg.locator("[data-testid=building-popup],[data-testid=building-panel]").count());

// FPS: continuous loop (?fps=1), orbit drag while sampling.
await pg.goto(BASE + "/city?source=github&repo=maverick/demo-project&fps=1");
await pg.waitForFunction(() => window.__codelens, null, { timeout: 30000 });
await pg.waitForTimeout(2000);
const f0 = await pg.evaluate(() => ({ f: window.__codelens!.info().frames, t: performance.now() }));
await pg.mouse.move(900, 500);
await pg.mouse.down();
for (let i = 0; i < 60; i++) {
  await pg.mouse.move(900 + i * 4, 500 + Math.sin(i / 8) * 20);
  await pg.waitForTimeout(40);
}
await pg.mouse.up();
await pg.waitForTimeout(800);
const f1 = await pg.evaluate(() => ({ f: window.__codelens!.info().frames, t: performance.now(), info: window.__codelens!.info() }));
console.log("fps (swiftshader, 1440x900):", (((f1.f - f0.f) * 1000) / (f1.t - f0.t)).toFixed(1), JSON.stringify(f1.info));
await shot("07-city-fps-overlay");

// Folder/zip import path through the drop-zone pickers.
await pg.goto(BASE + "/");
await pg.setInputFiles("input[type=file][accept]", { name: "my-project.zip", mimeType: "application/zip", buffer: Buffer.alloc(240_000) });
await pg.waitForTimeout(200);
await shot("08-import-zip-picked");
await br.close();
