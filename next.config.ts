import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// CSP for the static CodeLens pages in public/. The only inline script is workspace.html's
// importmap, allowed by its hash (computed from the file, so editing it can't break the page).
const inlineHashes = ["workspace.html", "index.html", "building.html"].flatMap((f) => {
  const html = readFileSync(join(process.cwd(), "public", f), "utf8");
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
  );
});
const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
const staticCsp = [
  "default-src 'self'",
  `script-src 'self' ${inlineHashes.join(" ")}`,
  "style-src 'self' 'unsafe-inline'", // three.js / Monaco set inline styles
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
// The legacy React pages (/app-legacy, /city) use Next's inline bootstrap scripts.
const appCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${process.env.NODE_ENV === "development" ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The CodeLens frontend is the static site in public/ (landing, building, workspace).
  // Clean URLs map onto those files; the API routes in app/api are the backend.
  poweredByHeader: false,
  async headers() {
    const staticPages = ["/", "/building", "/workspace", "/:page(index|building|workspace).html"];
    return [
      { source: "/:path*", headers: [...common, { key: "Content-Security-Policy", value: appCsp }] },
      ...staticPages.map((source) => ({ source, headers: [...common, { key: "Content-Security-Policy", value: staticCsp }] })),
      { source: "/api/:path*", headers: [...common, { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/building", destination: "/building.html" },
        { source: "/workspace", destination: "/workspace.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
