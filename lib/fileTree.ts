import type { FileNode } from "./types";

/** Build a nested tree from flat file nodes. Used to turn an imported project's flat file list into a tree. */
export function treeFromFiles(rootName: string, files: FileNode[]): FileNode {
  const root: FileNode = { name: rootName, path: "", type: "dir", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join("/");
      let next = dir.children!.find((c) => c.type === "dir" && c.path === p);
      if (!next) {
        next = { name: parts[i], path: p, type: "dir", children: [] };
        dir.children!.push(next);
      }
      dir = next;
    }
    dir.children!.push(f);
  }
  return root;
}
