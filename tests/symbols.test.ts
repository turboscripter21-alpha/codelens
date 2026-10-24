import { test } from "node:test";
import assert from "node:assert/strict";
import { codeFacts, healthScore, levelOf, stripCode } from "@/lib/analyze/symbols";
import { analyzeEntries } from "@/lib/analyze/analyze";

const loc = (t: string) => t.split("\n").filter((l) => l.trim()).length;

test("JS/TS symbols with lines, exports and function ends; strings and comments ignored", () => {
  const src = [
    "import x from './x';",
    "// function fake() {}",
    "const s = 'function alsoFake() {';",
    "export function login(user) {",
    "  if (user && user.ok) {",
    "    return true;",
    "  }",
    "  return false;",
    "}",
    "export const add = (a: number, b: number) => a + b;",
    "const helper = async (x) => {",
    "  for (const y of x) { if (y) break; }",
    "};",
    "export default class Store {",
    "  get(key) {",
    "    return key;",
    "  }",
    "}",
    "export interface Opts { a: 1 }",
  ].join("\n");
  const f = codeFacts("src/auth.ts", src, loc(src))!;
  const by = Object.fromEntries(f.symbols.map((s) => [s.n, s]));
  assert.deepEqual(Object.keys(by).sort(), ["Opts", "Store", "add", "get", "helper", "login"]);
  assert.deepEqual(by.login, { n: "login", k: "fn", l: 4, end: 9, e: 1 });
  assert.equal(by.add.e, 1);
  assert.equal(by.add.end, undefined, "one-liner");
  assert.equal(by.helper.e, undefined);
  assert.equal(by.helper.end, 13);
  assert.equal(by.Store.k, "class");
  assert.equal(by.get.k, "method");
  assert.equal(by.Opts.k, "type");
  assert.ok(f.health.br >= 4);
  assert.equal(f.health.lv, "good");
});

test("Python symbols and indentation-based function length", () => {
  const src = ["import os", "", "class Repo:", "    def load(self, p):", "        if p:", "            return 1", "        return 0", "", "def _private():", "    '''def nope(): pass'''", "    return 2", "def main():", "    pass"].join("\n");
  const f = codeFacts("app/repo.py", src, loc(src))!;
  assert.deepEqual(f.symbols.map((s) => `${s.k}:${s.n}:${s.l}:${s.end ?? ""}:${s.e ?? 0}`), ["class:Repo:3::1", "fn:load:4:7:0", "fn:_private:9:11:0", "fn:main:12:13:1"]);
});

test("Go, Rust, Java and Ruby basics", () => {
  const go = codeFacts("main.go", "package main\n\nfunc Serve(w int) {\n\tif w > 0 {\n\t}\n}\nfunc helper() {}\n", 5)!;
  assert.deepEqual(go.symbols.map((s) => s.n + (s.e ? "*" : "")), ["Serve*", "helper"]);
  const rs = codeFacts("lib.rs", "pub fn run() {\n}\nfn inner() {}\npub struct Cfg {}\n", 4)!;
  assert.deepEqual(rs.symbols.map((s) => s.n + (s.e ? "*" : "")), ["run*", "inner", "Cfg*"]);
  const java = codeFacts("A.java", "public class App {\n  public static void main(String[] a) {\n    if (a.length > 0) {}\n  }\n  private int x() { return 1; }\n}\n", 6)!;
  assert.deepEqual(java.symbols.map((s) => s.n), ["App", "main", "x"]);
  const rb = codeFacts("a.rb", "class User\n  def name?\n    true\n  end\nend\n", 5)!;
  assert.deepEqual(rb.symbols.map((s) => s.n), ["User", "name?"]);
});

test("health: score grows with size, branches, depth and long functions", () => {
  assert.equal(healthScore(10, 0, 1, 5), 0);
  assert.ok(healthScore(1200, 300, 9, 400) >= 95);
  assert.equal(levelOf(10), "good");
  assert.equal(levelOf(40), "warn");
  assert.equal(levelOf(80), "bad");
  const deep = ["export function f(a) {"];
  for (let i = 0; i < 8; i++) deep.push("  ".repeat(i + 1) + `if (a > ${i}) {`);
  for (let i = 7; i >= 0; i--) deep.push("  ".repeat(i + 1) + "}");
  deep.push("}");
  const h = codeFacts("deep.js", deep.join("\n"), deep.length)!.health;
  assert.equal(h.dp, 9);
  assert.equal(h.br, 8);
  assert.equal(h.fn, deep.length);
  assert.ok(h.s > 25);
});

test("unsupported, minified and non-code files get no facts; strip keeps line count", () => {
  assert.equal(codeFacts("README.md", "# hi\nfunction x() {}", 2), null);
  assert.equal(codeFacts("bundle.min.js", "var a=1;".repeat(4000), 1), null);
  const s = stripCode("a = 'x\\'y'; // c\n/* multi\nline */ b", "js");
  assert.equal(s.split("\n").length, 3);
  assert.ok(!s.includes("multi") && !s.includes("x\\'y"));
});

test("analyzeEntries attaches symbols + health to code files only", () => {
  const p = analyzeEntries(
    [
      { path: "src/index.ts", bytes: 40, text: "export function main() {\n  return 1;\n}\n" },
      { path: "README.md", bytes: 10, text: "# Readme\n" },
      { path: ".env", bytes: 10, secret: true },
    ],
    { name: "t", source: { kind: "zip", name: "t.zip" } },
  );
  const by = Object.fromEntries(p.files.map((f) => [f.path, f]));
  assert.equal(by["src/index.ts"].symbols![0].n, "main");
  assert.equal(by["src/index.ts"].health!.lv, "good");
  assert.equal(by["README.md"].health, undefined);
  assert.equal(by[".env"].symbols, undefined);
});
