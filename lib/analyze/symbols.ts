/**
 * Static symbol + code-health extraction. Text in, data out: repo code is never executed,
 * only scanned with linear passes and anchored per-line regexes (no catastrophic backtracking).
 *
 * symbols: functions / classes / methods / exported names with 1-based line numbers (for search,
 *          the building chat and the summary slideshow).
 * health:  a 0-100 complexity score from LOC, branch keywords, nesting depth and the longest function.
 *          good < 35 <= warn < 65 <= bad. A heuristic for "where to look first", not a verdict.
 */
import type { CodeSymbol, FileHealth } from "../types";

export const MAX_SYMBOLS = 60;
const MAX_SCAN_BYTES = 600 * 1024;

type Family = "js" | "py" | "go" | "rust" | "java" | "ruby" | "php" | "c" | null;
export function familyOf(path: string): Family {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const ext = m ? m[1].toLowerCase() : "";
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "vue", "svelte"].includes(ext)) return "js";
  if (["py", "pyw"].includes(ext)) return "py";
  if (ext === "go") return "go";
  if (ext === "rs") return "rust";
  if (["java", "kt", "kts", "cs", "scala", "swift", "dart"].includes(ext)) return "java";
  if (ext === "rb") return "ruby";
  if (ext === "php") return "php";
  if (["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "m", "mm"].includes(ext)) return "c";
  return null;
}

/** Blank out comments and string literals (newlines kept, so line numbers stay right). */
export function stripCode(text: string, fam: Exclude<Family, null>): string {
  const out: string[] = [];
  const n = text.length;
  const hash = fam === "py" || fam === "ruby";
  const slash = fam !== "py" && fam !== "ruby";
  let i = 0, start = 0;
  const blank = (from: number, to: number) => { out.push(text.slice(start, from)); out.push(text.slice(from, to).replace(/[^\n]/g, " ")); start = to; };
  while (i < n) {
    const c = text[i];
    if (slash && c === "/" && text[i + 1] === "/") { let j = text.indexOf("\n", i); if (j < 0) j = n; blank(i, j); i = j; continue; }
    if (slash && c === "/" && text[i + 1] === "*") { let j = text.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
    if (hash && c === "#") { let j = text.indexOf("\n", i); if (j < 0) j = n; blank(i, j); i = j; continue; }
    if (fam === "py" && (c === '"' || c === "'") && text[i + 1] === c && text[i + 2] === c) {
      let j = text.indexOf(c + c + c, i + 3); j = j < 0 ? n : j + 3; blank(i + 1, j - 1); i = j; continue;
    }
    if (c === '"' || c === "'" || (c === "`" && (fam === "js" || fam === "go"))) {
      let j = i + 1;
      while (j < n) {
        const d = text[j];
        if (d === "\\" && c !== "`") { j += 2; continue; }
        if (d === c) break;
        if (d === "\n" && c !== "`") break; // unterminated: stop at end of line
        j++;
      }
      if (j > i + 1) blank(i + 1, Math.min(j, n));
      i = j + 1;
      continue;
    }
    i++;
  }
  out.push(text.slice(start));
  return out.join("");
}

const KW = new Set(["if", "for", "while", "switch", "catch", "return", "function", "else", "do", "try", "with", "new", "typeof", "await", "elif", "except", "sizeof", "foreach", "using", "lock", "fixed", "super", "this"]);
type Rule = { re: RegExp; k: CodeSymbol["k"]; name: number; exp?: (m: RegExpExecArray, line: string) => boolean };

const RULES: Record<Exclude<Family, null>, Rule[]> = {
  js: [
    { re: /^\s*(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, k: "fn", name: 4, exp: (m) => !!m[1] },
    { re: /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, k: "class", name: 4, exp: (m) => !!m[1] },
    { re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]{0,80})?=\s*(?:async\s*)?(?:function\b|(?:\([^()]{0,200}\)|[A-Za-z_$][\w$]*)\s*(?::[^=]{0,60})?=>)/, k: "fn", name: 2, exp: (m) => !!m[1] },
    { re: /^\s*export\s+(?:declare\s+)?(?:const|let|var|enum)\s+([A-Za-z_$][\w$]*)/, k: "var", name: 1, exp: () => true },
    { re: /^\s*export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/, k: "type", name: 1, exp: () => true },
    { re: /^\s+(?:(?:public|private|protected|static|readonly|override|async|get|set)\s+)*\*?([A-Za-z_$][\w$]*)\s*\([^()]{0,200}\)\s*(?::\s*[^{=;]{1,80})?\{\s*$/, k: "method", name: 1 },
  ],
  py: [
    { re: /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/, k: "fn", name: 2, exp: (m) => !m[1] && !m[2].startsWith("_") },
    { re: /^(\s*)class\s+([A-Za-z_]\w*)/, k: "class", name: 2, exp: (m) => !m[1] && !m[2].startsWith("_") },
  ],
  go: [
    { re: /^func\s+(?:\([^)]{0,120}\)\s*)?([A-Za-z_]\w*)/, k: "fn", name: 1, exp: (m) => /^[A-Z]/.test(m[1]) },
    { re: /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/, k: "class", name: 1, exp: (m) => /^[A-Z]/.test(m[1]) },
  ],
  rust: [
    { re: /^\s*(pub(?:\([^)]{0,20}\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, k: "fn", name: 2, exp: (m) => !!m[1] },
    { re: /^\s*(pub(?:\([^)]{0,20}\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/, k: "class", name: 2, exp: (m) => !!m[1] },
  ],
  java: [
    { re: /^\s*(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial)\s+)*(?:class|interface|enum|record|struct|object)\s+([A-Za-z_]\w*)/, k: "class", name: 1, exp: (_m, l) => /\bpublic\b/.test(l) },
    { re: /^\s*(?:(?:public|private|protected|internal|static|final|abstract|async|override|virtual|synchronized|suspend|open)\s+)+(?:fun\s+)?(?:[\w<>[\],.? ]{1,80}\s+)?([A-Za-z_]\w*)\s*\(/, k: "method", name: 1, exp: (_m, l) => /\bpublic\b/.test(l) },
    { re: /^\s*fun\s+(?:<[^>]{0,60}>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)\s*\(/, k: "fn", name: 1 },
    { re: /^\s*func\s+([A-Za-z_]\w*)/, k: "fn", name: 1 },
  ],
  ruby: [
    { re: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/, k: "fn", name: 1 },
    { re: /^\s*(?:class|module)\s+([A-Z]\w*)/, k: "class", name: 1, exp: () => true },
  ],
  php: [
    { re: /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?([A-Za-z_]\w*)/, k: "fn", name: 1, exp: (_m, l) => !/\b(private|protected)\b/.test(l) },
    { re: /^\s*(?:(?:final|abstract)\s+)?(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/, k: "class", name: 1, exp: () => true },
  ],
  c: [
    { re: /^(?:[A-Za-z_][\w:*&<>, ]{0,80}[\s*&])([A-Za-z_][\w:~]*)\s*\([^;{}]{0,200}\)\s*(?:const\s*)?(?:noexcept\s*)?\{?\s*$/, k: "fn", name: 1 },
    { re: /^\s*(?:class|struct)\s+([A-Za-z_]\w*)\s*(?::[^{]{0,80})?\{?\s*$/, k: "class", name: 1, exp: () => true },
  ],
};

const BRANCH: Record<Exclude<Family, null>, RegExp> = {
  js: /\b(?:if|for|while|case|catch)\b|&&|\|\||\?\?/g,
  py: /\b(?:if|elif|for|while|except|and|or|case)\b/g,
  go: /\b(?:if|for|case|select)\b|&&|\|\|/g,
  rust: /\b(?:if|for|while|loop|match)\b|=>|&&|\|\||\?;/g,
  java: /\b(?:if|for|foreach|while|case|catch|when)\b|&&|\|\||\?\?/g,
  ruby: /\b(?:if|elsif|unless|while|until|for|when|rescue|and|or)\b|&&|\|\|/g,
  php: /\b(?:if|elseif|for|foreach|while|case|catch)\b|&&|\|\||\?\?/g,
  c: /\b(?:if|for|while|case|catch)\b|&&|\|\|/g,
};

export function levelOf(score: number): FileHealth["lv"] {
  return score < 35 ? "good" : score < 65 ? "warn" : "bad";
}

export function healthScore(loc: number, branches: number, depth: number, longestFn: number): number {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const locS = c(loc / 1000);
  const brS = c(Math.max(loc > 20 ? branches / loc / 0.3 : 0, branches / 200));
  const depthS = c((depth - 2) / 6);
  const fnS = c((longestFn - 30) / 170);
  return Math.round(100 * (0.25 * locS + 0.25 * brS + 0.25 * depthS + 0.25 * fnS));
}

export interface CodeFacts { symbols: CodeSymbol[]; health: FileHealth }

/** Symbols + health for one source file, or null when the language is not supported / the text looks minified. */
export function codeFacts(path: string, text: string, loc: number): CodeFacts | null {
  const fam = familyOf(path);
  if (!fam || !text || loc === 0) return null;
  if (text.length > MAX_SCAN_BYTES) return null;
  if (loc < 8 && text.length > 20000) return null; // minified bundle
  const clean = stripCode(text, fam);
  const lines = clean.split("\n");
  const raw = text.split("\n");
  const braces = fam !== "py" && fam !== "ruby";

  // depth per line (brace languages: nesting at line start; python/ruby: indent level)
  const depthAt = new Int16Array(lines.length + 1);
  let depth = 0, maxDepth = 0;
  let unit = 0;
  if (!braces) {
    for (const l of lines) { const m = /^( +|\t+)\S/.exec(l); if (m) { const w = m[1][0] === "\t" ? 4 * m[1].length : m[1].length; if (!unit || w < unit) unit = w; } }
    unit = Math.max(2, unit || 4);
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (braces) {
      depthAt[i] = depth;
      for (let j = 0; j < l.length; j++) { const ch = l.charCodeAt(j); if (ch === 123) { depth++; if (depth > maxDepth) maxDepth = depth; } else if (ch === 125 && depth > 0) depth--; }
    } else {
      const m = /^([ \t]*)\S/.exec(l);
      if (!m) { depthAt[i] = -1; continue; }
      const w = m[1].replace(/\t/g, "    ").length;
      depthAt[i] = Math.floor(w / unit);
      if (fam === "ruby" && /^\s*end\b/.test(l)) continue;
      if (depthAt[i] + 1 > maxDepth) maxDepth = depthAt[i] + 1;
    }
  }
  if (!braces) maxDepth = Math.max(0, maxDepth);

  // symbols
  const rules = RULES[fam];
  const symbols: CodeSymbol[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length && symbols.length < MAX_SYMBOLS; i++) {
    const l = lines[i];
    if (l.length > 400 || !/[A-Za-z]/.test(l)) continue;
    for (const r of rules) {
      const m = r.re.exec(l);
      if (!m) continue;
      const name = m[r.name];
      if (!name || KW.has(name) || name.length > 80) break;
      if (r.k === "method" && braces && depthAt[i] < 1) break; // a call at top level, not a method
      const key = name + ":" + r.k;
      if (seen.has(key) && r.k !== "method") break;
      seen.add(key);
      const s: CodeSymbol = { n: name, k: r.k, l: i + 1 };
      if (r.exp?.(m, raw[i] ?? l)) s.e = 1;
      symbols.push(s);
      break;
    }
  }

  // function lengths: until the block closes (braces) or the indent returns (python / ruby)
  let longest = 0, longestName = "";
  for (const s of symbols) {
    if (s.k !== "fn" && s.k !== "method") continue;
    const i0 = s.l - 1;
    let end = i0;
    if (braces) {
      const base = depthAt[i0];
      let opened = false, i = i0;
      for (; i < lines.length && i < i0 + 3000; i++) {
        const d = depthAt[i + 1] ?? 0;
        if (d > base) opened = true;
        else if (opened) break;
        else if (i >= i0 + 1 || /;\s*$/.test(lines[i0])) break; // one-liner / arrow without a block
      }
      if (opened) end = Math.min(i, lines.length - 1);
    } else {
      const base = depthAt[i0];
      for (let i = i0 + 1; i < lines.length && i < i0 + 3000; i++) {
        if (depthAt[i] === -1) continue;
        if (depthAt[i] <= base && !(fam === "ruby" && /^\s*end\b/.test(lines[i]))) break;
        end = i;
      }
    }
    const len = end - i0 + 1;
    if (len > 1) s.end = end + 1;
    if (len > longest) { longest = len; longestName = s.n; }
  }

  let branches = 0;
  const re = BRANCH[fam];
  re.lastIndex = 0;
  while (re.exec(clean)) branches++;

  const score = healthScore(loc, branches, maxDepth, longest);
  return { symbols, health: { s: score, lv: levelOf(score), br: branches, dp: maxDepth, fn: longest, fnName: longestName || undefined } };
}
