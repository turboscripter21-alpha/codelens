/**
 * Regex-based import extraction for JS/TS and Python, plus resolution to
 * project paths. Good enough for Uses / Used by and the importance score;
 * not a real parser (comments and strings can fool it, which is acceptable here).
 */

const JS_RE = [
  /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+["']([^"'\n]+)["']/g,
  /\brequire\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g,
];
const CSS_RE = /@import\s+(?:url\()?["']([^"'\n]+)["']/g;
const PY_FROM = /^\s*from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)/gm;
const PY_IMPORT = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;

export type ImportLang = "js" | "py" | "css" | null;

export function importLangFor(path: string): ImportLang {
  if (/\.(m|c)?(j|t)sx?$/.test(path) || /\.(vue|svelte|astro)$/.test(path)) return "js";
  if (/\.pyi?$/.test(path)) return "py";
  if (/\.(s?css|less)$/.test(path)) return "css";
  return null;
}

/** Raw specifiers found in the text. Python specifiers are returned as "py:<dots><module>[:<name>]". */
export function extractImports(text: string, lang: ImportLang): string[] {
  const out = new Set<string>();
  if (lang === "js") {
    for (const re of JS_RE) for (const m of text.matchAll(re)) out.add(m[1]);
  } else if (lang === "css") {
    for (const m of text.matchAll(CSS_RE)) out.add(m[1]);
  } else if (lang === "py") {
    for (const m of text.matchAll(PY_FROM)) {
      const mod = m[1];
      for (const n of m[2].replace(/[()]/g, "").split(",")) {
        const name = n.trim().split(/\s+as\s+/)[0];
        if (name && name !== "*") out.add(`py:${mod}:${name}`);
      }
      out.add(`py:${mod}`);
    }
    for (const m of text.matchAll(PY_IMPORT)) for (const mod of m[1].split(",")) out.add(`py:${mod.trim()}`);
  }
  return [...out];
}

const JS_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".json", ".vue", ".svelte", ".css", ".scss"];
const INDEX = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"];

function join(dir: string, rel: string): string | null {
  const parts = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

function tryJs(base: string, files: Set<string>): string | null {
  // "./foo.js" may really be "./foo.ts" in TS projects.
  const noJs = base.replace(/\.(m|c)?js$/, "");
  for (const b of noJs !== base ? [base, noJs] : [base]) {
    for (const e of JS_EXTS) if (files.has(b + e)) return b + e;
    for (const i of INDEX) if (files.has(b + i)) return b + i;
  }
  return null;
}

/** Resolve a raw specifier from `fromPath` to a project file path, or null if external/unknown. */
export function resolveImport(spec: string, fromPath: string, files: Set<string>): string | null {
  const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  if (spec.startsWith("py:")) {
    const [, mod, name] = spec.split(":");
    const dots = mod.match(/^\.*/)![0].length;
    const rest = mod.slice(dots).replace(/\./g, "/");
    const bases: string[] = [];
    if (dots > 0) {
      let d: string | null = dir;
      for (let i = 1; i < dots && d !== null; i++) d = join(d, "..");
      if (d === null) return null;
      bases.push(rest ? (d ? `${d}/${rest}` : rest) : d);
    } else if (rest) {
      bases.push(rest, `src/${rest}`, `lib/${rest}`);
    }
    for (const b of bases) {
      const cands = name ? [`${b}/${name}.py`, `${b}.py`, `${b}/__init__.py`] : [`${b}.py`, `${b}/__init__.py`];
      for (const c of cands) if (files.has(c.replace(/^\//, ""))) return c.replace(/^\//, "");
    }
    return null;
  }
  let base: string | null = null;
  if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") base = join(dir, spec);
  else if (spec.startsWith("@/") || spec.startsWith("~/")) {
    const r = spec.slice(2);
    return tryJs(r, files) ?? tryJs(`src/${r}`, files);
  } else if (spec.startsWith("/")) base = spec.slice(1);
  else if (/^(src|app|lib|components)\//.test(spec)) base = spec;
  if (base === null) return null;
  return tryJs(base, files);
}
