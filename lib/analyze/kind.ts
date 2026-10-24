import type { FileKind } from "../types";
import { extOf } from "./language";

const STYLE = new Set(["css", "scss", "sass", "less", "styl", "pcss"]);
const DOCS = new Set(["md", "mdx", "rst", "txt", "adoc"]);
const CONFIG = new Set(["json", "jsonc", "json5", "yml", "yaml", "toml", "ini", "cfg", "conf", "xml", "properties", "lock", "env"]);
const ASSET = new Set(["svg", "png", "jpg", "jpeg", "gif", "ico", "webp", "avif", "woff", "woff2", "ttf", "otf", "mp3", "mp4", "webm", "wav", "pdf"]);
const UI_EXT = new Set(["jsx", "tsx", "vue", "svelte", "astro", "html", "htm"]);
const ENTRY = /^(index|main|app|server|cli|mod|lib|__init__|__main__|manage|program|application)\.[a-z0-9]+$/i;

/** First-pass kind from the path alone. "util" files can be promoted to "core" later from the import graph. */
export function kindFromPath(path: string, opts: { binary: boolean; secret: boolean; lockfile: boolean; code: boolean }): FileKind {
  if (opts.secret) return "secret";
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  const ext = extOf(lower);
  if (opts.binary || ASSET.has(ext)) return "asset";
  if (
    /(^|\/)(__tests__|__mocks__|tests?|specs?|e2e|cypress|fixtures)\//.test(lower) ||
    /\.(test|spec|e2e)\.[a-z0-9]+$/.test(name) ||
    /^test_.*\.py$/.test(name) ||
    /_test\.(go|py|rb|exs?)$/.test(name)
  )
    return "test";
  if (STYLE.has(ext)) return "style";
  if (DOCS.has(ext) || /^(license|licence|changelog|contributing|authors|notice|readme)(\.|$)/.test(name) || lower.startsWith("docs/")) return "docs";
  if (
    opts.lockfile ||
    CONFIG.has(ext) ||
    name.startsWith(".") ||
    /\.config\.[a-z0-9]+$/.test(name) ||
    /^(dockerfile|makefile|procfile|jenkinsfile|vagrantfile)/.test(name) ||
    lower.startsWith(".github/") ||
    !opts.code
  )
    return "config";
  if (UI_EXT.has(ext) || /(^|\/)(components?|pages|views|screens|ui|widgets|layouts|templates|app)\//.test(lower)) return "ui";
  const depth = lower.split("/").length;
  if (ENTRY.test(name) && depth <= 3) return "core";
  return "util";
}
