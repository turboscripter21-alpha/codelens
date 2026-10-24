// TEST FIXTURE ONLY: a made-up repo used by the unit tests and the Phase 1 screenshot tool.
// The app never loads it (no sample project in the app flow).
import type { FileKind, FileNode, Project, ProjectFile, ProjectInfo } from "../../lib/types";
import { computeStats } from "../../lib/analyze/stats";
import { detectLanguage } from "../../lib/analyze/language";
import { treeFromFiles } from "../../lib/fileTree";
export { treeFromFiles };

/**
 * Phase 1 sample data: the "demo-project" tree. Line counts, descriptions and
 * Uses / Used by lists are PLACEHOLDERS. Phase 2 replaces this with the real
 * imported tree (GitHub API or a client-side zip/folder read).
 */

type Spec = [path: string, lines: number, language: string, kind: FileKind, description: string, uses?: string[], usedBy?: string[]];

const SPECS: Spec[] = [
  [".github/workflows/main.yml", 42, "YAML", "ci", "Runs install, tests and build on every push to main.", ["package.json"], []],
  ["public/index.html", 28, "HTML", "markup", "The single HTML page React mounts into.", ["public/favicon.ico", "public/assets/logo.svg"], ["src/index.js"]],
  ["public/favicon.ico", 0, "Binary", "asset", "Browser tab icon.", [], ["public/index.html"]],
  ["public/assets/logo.svg", 18, "SVG", "asset", "Vector logo shown in the navbar.", [], ["src/components/Navbar/Navbar.js", "public/index.html"]],
  ["public/assets/banner.png", 0, "Binary", "asset", "Hero banner image for the landing view.", [], ["src/App.js"]],
  ["src/index.js", 260, "JavaScript", "core", "Entry point. Creates the React root, wraps the app in providers and mounts it.", ["src/App.js", "src/hooks/useAuth.js"], ["public/index.html"]],
  ["src/App.js", 140, "JavaScript", "core", "Top-level component. Lays out the navbar and pages and decides what a signed-in user sees.", ["src/components/Navbar/Navbar.js", "src/components/Button/Button.js", "src/hooks/useAuth.js"], ["src/index.js", "tests/App.test.js"]],
  ["src/components/Button/Button.js", 64, "JavaScript", "ui", "Reusable button with primary and ghost variants.", ["src/components/Button/Button.css"], ["src/App.js", "src/components/Navbar/Navbar.js"]],
  ["src/components/Button/Button.css", 38, "CSS", "style", "Styles for the Button component.", [], ["src/components/Button/Button.js"]],
  ["src/components/Navbar/Navbar.js", 96, "JavaScript", "ui", "Top navigation bar with logo, links and the sign-in button.", ["src/components/Button/Button.js", "src/components/Navbar/Navbar.css", "src/hooks/useAuth.js"], ["src/App.js"]],
  ["src/components/Navbar/Navbar.css", 52, "CSS", "style", "Layout and colours for the navbar.", [], ["src/components/Navbar/Navbar.js"]],
  ["src/hooks/useAuth.js", 118, "JavaScript", "hook", "Keeps track of the signed-in user and exposes login and logout.", ["src/utils/helpers.js"], ["src/App.js", "src/index.js", "src/components/Navbar/Navbar.js"]],
  ["src/utils/helpers.js", 175, "JavaScript", "util", "Small shared helpers: formatting, storage and request wrappers.", [], ["src/hooks/useAuth.js", "tests/helpers.test.js"]],
  ["tests/App.test.js", 58, "JavaScript", "test", "Checks that App renders and shows the right view when signed in.", ["src/App.js"], []],
  ["tests/helpers.test.js", 84, "JavaScript", "test", "Unit tests for the helpers module.", ["src/utils/helpers.js"], []],
  [".env.example", 6, "Env", "config", "Lists the environment variables the app expects, with no real values.", [], []],
  [".gitignore", 14, "Text", "config", "Files Git should not track, like node_modules and build output.", [], []],
  ["package.json", 34, "JSON", "config", "Project name, scripts and dependencies.", [], [".github/workflows/main.yml"]],
  ["README.md", 72, "Markdown", "docs", "What the project is and how to run it.", [], []],
];

function fileNode([path, lines, language, kind, description, uses = [], usedBy = []]: Spec): FileNode {
  const name = path.split("/").pop() as string;
  const bytes = lines > 0 ? lines * 32 : name.endsWith(".png") ? 48_000 : 4_286;
  return { name, path, type: "file", lines, bytes, language, kind, description, uses, usedBy };
}

export function sampleProject(name = "demo-project"): ProjectInfo {
  return { name, root: treeFromFiles(name, SPECS.map(fileNode)) };
}

/** Phase 2: the same demo-project as a Project (for the metrics panel and "Try the sample"). */
const SAMPLE_KIND: Record<FileKind, ProjectFile["kind"]> = {
  core: "core", ui: "ui", hook: "util", util: "util", style: "style", test: "test", config: "config", docs: "docs", ci: "config", markup: "ui", asset: "asset", secret: "secret", block: "util",
};

export function sampleAsProject(name = "demo-project"): Project {
  const files: ProjectFile[] = SPECS.map((spec) => {
    const n = fileNode(spec);
    const lang = detectLanguage(n.path);
    return {
      path: n.path,
      name: n.name,
      dir: n.path.includes("/") ? n.path.slice(0, n.path.lastIndexOf("/")) : "",
      language: n.language ?? lang.name,
      langColor: n.lines ? lang.color : "#b8bec7",
      kind: SAMPLE_KIND[n.kind ?? "util"],
      bytes: n.bytes ?? 0,
      loc: n.lines ?? 0,
      lines: n.lines ?? 0,
      binary: !n.lines,
      secret: false,
      lockfile: false,
      estimated: false,
      uses: n.uses ?? [],
      usedBy: n.usedBy ?? [],
      importance: 0,
      description: n.description,
    };
  });
  return { name, source: { kind: "sample", name }, files, previews: {}, stats: computeStats(files, {}, files.reduce((a, f) => a + f.uses.length, 0)), warnings: [], createdAt: 0 };
}
