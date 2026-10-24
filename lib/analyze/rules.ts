/**
 * Ignore rules, secret detection, path safety and caps. Shared by the server
 * (GitHub zip) and the browser (zip / folder upload), so both behave the same.
 * Pure: no Node or DOM APIs.
 */
import { extOf } from "./language";

export const CAPS = {
  /** Max compressed download / upload size. */
  maxArchiveBytes: 50 * 1024 * 1024,
  /** Max files analyzed (after ignore rules). */
  maxFiles: 5000,
  /** Files larger than this are counted but not read (LOC estimated). */
  maxReadBytes: 1024 * 1024,
  /** Total uncompressed bytes we are willing to read. */
  maxTotalReadBytes: 200 * 1024 * 1024,
  /** Stored preview per file. */
  previewLines: 400,
  previewBytes: 64 * 1024,
} as const;

export type SkipReason = "ignored-dir" | "minified" | "vendored" | "unsafe-path" | "over-cap" | "empty";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "out", ".nuxt", ".svelte-kit", ".turbo", ".vercel", ".cache", ".parcel-cache",
  "coverage", "__pycache__", ".pytest_cache", ".mypy_cache", ".venv", "venv", "env", ".tox", "bower_components", "jspm_packages",
  "target", ".gradle", ".idea", ".vscode", ".DS_Store", "Pods", "DerivedData",
]);
const VENDOR_DIRS = new Set(["vendor", "third_party", "third-party", "thirdparty", "external"]);

const LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "npm-shrinkwrap.json", "cargo.lock", "poetry.lock",
  "pipfile.lock", "composer.lock", "gemfile.lock", "go.sum", "pubspec.lock", "packages.lock.json", "uv.lock", "flake.lock",
]);

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "avif", "tif", "tiff", "psd", "heic",
  "mp3", "wav", "ogg", "flac", "m4a", "mp4", "mov", "avi", "mkv", "webm",
  "woff", "woff2", "ttf", "otf", "eot",
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar", "war", "apk", "ipa", "dmg", "iso",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "lib", "class", "pyc", "pyo", "wasm", "node",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "sqlite", "db", "glb", "gltf", "fbx", "obj", "blend", "lockb",
]);

/** Files whose contents we never read or return. They become Vault buildings, by name only. */
export function isSecretPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === ".env" || name.startsWith(".env.") || name.startsWith(".env-") || name.startsWith(".env_") || name.endsWith(".env") || name === ".envrc") return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(_sk)?(\.pub)?$/.test(name)) return true;
  if (/\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg|ovpn|crt|cer|der|p8|ppk|tfvars|tfstate|tfstate\.backup)$/.test(name)) return true;
  if ([".npmrc", ".pypirc", ".netrc", ".htpasswd", "credentials", "credentials.json", "service-account.json", "secrets.json", "secrets.yml", "secrets.yaml", ".git-credentials",
    ".dev.vars", ".pgpass", ".s3cfg", ".boto", ".terraformrc", "terraform.rc", "kubeconfig", ".yarnrc.yml", ".dockercfg"].includes(name)) return true;
  const lower = path.toLowerCase();
  if (/(^|\/)\.(aws|kube|docker|ssh|gnupg)\/[^/]+$/.test(lower) && name !== "readme.md") return true; // ~/.aws/credentials, .kube/config, .docker/config.json, .ssh/*
  if (/(^|[._-])secrets?([._-]|$)/.test(name) && /\.(json|ya?ml|toml|txt|ini)$/.test(name)) return true;
  return false;
}

export function isLockfile(path: string): boolean {
  return LOCKFILES.has(path.slice(path.lastIndexOf("/") + 1).toLowerCase());
}

export function isBinaryExt(path: string): boolean {
  return BINARY_EXT.has(extOf(path));
}

/** Returns why a (safe, normalized) path is skipped entirely, or null if it should be kept. */
export function skipReason(path: string): SkipReason | null {
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    if (IGNORED_DIRS.has(parts[i])) return "ignored-dir";
    if (VENDOR_DIRS.has(parts[i].toLowerCase())) return "vendored";
  }
  const name = parts[parts.length - 1].toLowerCase();
  if (name === ".ds_store" || name === "thumbs.db") return "ignored-dir";
  if (/[.-]min\.(js|css|mjs)$/.test(name) || /\.(map|bundle\.js|chunk\.js)$/.test(name)) return "minified";
  return null;
}

/**
 * Normalize an archive / upload path and reject anything unsafe:
 * absolute paths, drive letters, "..", empty or control characters.
 * Returns null for unsafe paths (they are counted as skipped "unsafe-path").
 */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 1024) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  const p = raw.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p) || p.startsWith("~")) return null;
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    out.push(seg);
  }
  return out.length ? out.join("/") : null;
}

/** If every path shares one top folder (zip root, "repo-main/"), strip it. */
export function stripCommonRoot(paths: string[]): { root: string | null; strip: (p: string) => string } {
  if (!paths.length) return { root: null, strip: (p) => p };
  const first = paths[0].split("/")[0];
  const all = paths.every((p) => p.includes("/") && p.split("/")[0] === first);
  if (!all) return { root: null, strip: (p) => p };
  return { root: first, strip: (p) => p.slice(first.length + 1) };
}

/** True if the bytes look binary (a NUL byte in the first 8 KB). */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}
