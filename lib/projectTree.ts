import type { FileNode, Project, ProjectFile } from "./types";
import { treeFromFiles } from "./fileTree";

const KIND_TEXT: Record<string, string> = {
  core: "A core file: many other files import it, or it is an entry point.",
  ui: "A user-interface file: components, pages or views.",
  util: "A helper / logic module.",
  test: "A test file.",
  config: "A configuration or tooling file.",
  style: "A stylesheet.",
  docs: "Documentation.",
  asset: "An asset such as an image or font. Contents are not analyzed.",
  secret: "A secrets file. CodeLens lists it by name only; its contents were never read.",
};

/** Phase 2: analyzed ProjectFile -> the Phase 1 FileNode shape the layout and UI already use. */
export function fileNodeOf(f: ProjectFile): FileNode {
  return {
    name: f.name,
    path: f.path,
    type: "file",
    lines: f.lines,
    loc: f.loc,
    bytes: f.bytes,
    language: f.language,
    langColor: f.langColor,
    kind: f.kind,
    secret: f.secret,
    binary: f.binary,
    lockfile: f.lockfile,
    estimated: f.estimated,
    importance: f.importance,
    description: f.description ?? KIND_TEXT[f.kind] ?? "",
    uses: f.uses,
    usedBy: f.usedBy,
  };
}

export function projectToTree(p: Project): FileNode {
  return treeFromFiles(p.name.split("/").pop() || p.name, p.files.map(fileNodeOf));
}
