import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// The app flow has no sample/demo project: the city, tree, Talk panel and code come only
// from the user's GitHub link, .zip or folder. (Fixtures under tests/ are fine.)
const read = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("no hard-coded sample data is shipped to the app", () => {
  for (const p of ["public/app/project.js", "public/app/code.js", "public/demo-city", "lib/sampleProject.ts"]) assert.ok(!existsSync(new URL("../" + p, import.meta.url)), p);
});

test("pages never fall back to a sample project", () => {
  for (const p of ["public/app/workspace.js", "public/app/building.js", "public/app/focus.js", "public/codelens.js", "public/index.html", "public/workspace.html", "public/building.html", "lib/bridge/index.ts", "components/ui/CityScreen.tsx", "components/ui/ImportScreen.tsx"]) {
    const s = read(p);
    assert.ok(!/\?sample|sampleFromPrototype|demo-project|Try the sample|source=sample|project\.js'|code\.js'/.test(s), p);
  }
});

test("workspace has an 'Import a repo first' empty state linking to the import plate", () => {
  const h = read("public/workspace.html");
  assert.match(h, /data-empty hidden/);
  assert.match(h, /Import a repo first/);
  assert.match(h, /href="index\.html#your-repo"/);
});
