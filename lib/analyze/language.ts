import { own } from "../safeDict";
/** Language detection by file extension / name. Colours follow GitHub linguist where sensible. */

export interface LangInfo {
  name: string;
  color: string;
  /** Whether this is source code (used for kind heuristics and the import graph). */
  code: boolean;
}

const L = (name: string, color: string, code = true): LangInfo => ({ name, color, code });

const BY_EXT: Record<string, LangInfo> = {
  ts: L("TypeScript", "#3178c6"),
  tsx: L("TypeScript", "#3178c6"),
  mts: L("TypeScript", "#3178c6"),
  cts: L("TypeScript", "#3178c6"),
  js: L("JavaScript", "#e8c63a"),
  jsx: L("JavaScript", "#e8c63a"),
  mjs: L("JavaScript", "#e8c63a"),
  cjs: L("JavaScript", "#e8c63a"),
  py: L("Python", "#3572a5"),
  pyi: L("Python", "#3572a5"),
  go: L("Go", "#00add8"),
  rs: L("Rust", "#dea584"),
  java: L("Java", "#b07219"),
  kt: L("Kotlin", "#a97bff"),
  kts: L("Kotlin", "#a97bff"),
  swift: L("Swift", "#f05138"),
  c: L("C", "#555555"),
  h: L("C", "#555555"),
  cc: L("C++", "#f34b7d"),
  cpp: L("C++", "#f34b7d"),
  hpp: L("C++", "#f34b7d"),
  cs: L("C#", "#178600"),
  rb: L("Ruby", "#701516"),
  php: L("PHP", "#4f5d95"),
  dart: L("Dart", "#00b4ab"),
  lua: L("Lua", "#000080"),
  scala: L("Scala", "#c22d40"),
  ex: L("Elixir", "#6e4a7e"),
  exs: L("Elixir", "#6e4a7e"),
  sh: L("Shell", "#89e051"),
  bash: L("Shell", "#89e051"),
  zsh: L("Shell", "#89e051"),
  ps1: L("PowerShell", "#012456"),
  vue: L("Vue", "#41b883"),
  svelte: L("Svelte", "#ff3e00"),
  astro: L("Astro", "#ff5a03"),
  html: L("HTML", "#e34c26"),
  htm: L("HTML", "#e34c26"),
  css: L("CSS", "#663399"),
  scss: L("SCSS", "#c6538c"),
  sass: L("SCSS", "#c6538c"),
  less: L("Less", "#1d365d"),
  sql: L("SQL", "#e38c00"),
  graphql: L("GraphQL", "#e10098"),
  gql: L("GraphQL", "#e10098"),
  json: L("JSON", "#8a8f2a", false),
  jsonc: L("JSON", "#8a8f2a", false),
  json5: L("JSON", "#8a8f2a", false),
  yml: L("YAML", "#cb171e", false),
  yaml: L("YAML", "#cb171e", false),
  toml: L("TOML", "#9c4221", false),
  ini: L("INI", "#d1dbe0", false),
  xml: L("XML", "#0060ac", false),
  md: L("Markdown", "#083fa1", false),
  mdx: L("MDX", "#fcb32c", false),
  rst: L("reStructuredText", "#141414", false),
  txt: L("Text", "#9aa1ad", false),
  svg: L("SVG", "#ff9a00", false),
  ipynb: L("Jupyter", "#da5b0b", false),
};

const BY_NAME: Record<string, LangInfo> = {
  dockerfile: L("Dockerfile", "#384d54", false),
  makefile: L("Makefile", "#427819", false),
  license: L("Text", "#9aa1ad", false),
  readme: L("Text", "#9aa1ad", false),
};

export const OTHER: LangInfo = L("Other", "#9aa1ad", false);
export const SECRET_LANG: LangInfo = L("Secret", "#4b5563", false);
export const BINARY_LANG: LangInfo = L("Binary", "#b8bec7", false);

export function extOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1) : "";
}

export function detectLanguage(path: string): LangInfo {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  return own(BY_EXT, extOf(path)) ?? own(BY_NAME, name) ?? (name.startsWith("dockerfile") ? BY_NAME.dockerfile : OTHER);
}

/** prism-react-renderer language id for the code preview. */
export function prismLanguage(path: string): string {
  const e = extOf(path);
  const map: Record<string, string> = {
    ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx", js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
    py: "python", go: "go", rs: "rust", json: "json", md: "markdown", mdx: "markdown", yml: "yaml", yaml: "yaml", css: "css", scss: "css",
    html: "markup", htm: "markup", xml: "markup", svg: "markup", vue: "markup", svelte: "markup", sql: "sql", sh: "bash", bash: "bash",
    c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", java: "java", kt: "kotlin", swift: "swift", rb: "ruby", php: "php", graphql: "graphql",
  };
  return own(map, e) ?? "text";
}
