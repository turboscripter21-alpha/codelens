import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { binaryTypeOf, imageMime, IMAGE_MAX_BYTES } from "@/lib/analyze/rules";
import { readZip } from "@/lib/analyze/zip";
import { GET } from "@/app/api/github/file/route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0xff, 0x00, 0x80]);

test("imageMime: allowlisted image types only (svg included, never html / tiff)", () => {
  assert.equal(imageMime("a/logo.png"), "image/png");
  assert.equal(imageMime("x.JPG"), "image/jpeg");
  assert.equal(imageMime("x.jpeg"), "image/jpeg");
  assert.equal(imageMime("x.gif"), "image/gif");
  assert.equal(imageMime("x.webp"), "image/webp");
  assert.equal(imageMime("x.bmp"), "image/bmp");
  assert.equal(imageMime("favicon.ico"), "image/x-icon");
  assert.equal(imageMime("x.avif"), "image/avif");
  assert.equal(imageMime("icon.svg"), "image/svg+xml");
  for (const p of ["x.html", "x.tiff", "x.psd", "x.mp3", "constructor", "x.toString", "__proto__"]) assert.equal(imageMime(p), null, p);
  assert.equal(IMAGE_MAX_BYTES, 5 * 1024 * 1024);
});

test("binaryTypeOf: friendly names for the binary card", () => {
  assert.equal(binaryTypeOf("docs/guide.pdf"), "PDF document");
  assert.equal(binaryTypeOf("f/Inter.woff2"), "Font (WOFF2)");
  assert.equal(binaryTypeOf("dist.tar"), "Archive (TAR)");
  assert.equal(binaryTypeOf("a.png"), "Image (PNG)");
  assert.equal(binaryTypeOf("constructor"), "Binary file");
});

test("readZip keeps images (binary-safe, svg source still read as code) within the 5 MB cap", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script><rect width="4" height="4"/></svg>';
  const zip = zipSync({
    "p/index.js": new TextEncoder().encode("export const a = 1;\n"),
    "p/img/photo.jpg": PNG,
    "p/img/icon.svg": new TextEncoder().encode(svg),
    "p/img/huge.png": new Uint8Array(IMAGE_MAX_BYTES + 10),
    "p/.env": new TextEncoder().encode("SECRET=1"),
  });
  assert.deepEqual(Object.keys(readZip(zip).media), [], "nothing kept unless asked");
  const r = readZip(zip, undefined, true);
  const jpg = Object.entries(r.media).find(([k]) => k.endsWith("photo.jpg"))!;
  assert.equal(jpg[1].mime, "image/jpeg");
  assert.deepEqual([...jpg[1].bytes], [...PNG], "bytes are kept exactly");
  const s = Object.entries(r.media).find(([k]) => k.endsWith("icon.svg"))!;
  assert.equal(s[1].mime, "image/svg+xml");
  assert.ok(!Object.keys(r.media).some((k) => k.endsWith("huge.png")), "over 5 MB is not kept");
  assert.ok(!Object.keys(r.media).some((k) => k.endsWith(".env")));
  const svgEntry = r.entries.find((e) => e.path.endsWith("icon.svg"));
  assert.ok(svgEntry?.text?.includes("<rect"), "svg source is still readable as code");
  assert.ok(r.entries.find((e) => e.path.endsWith("photo.jpg"))?.binary);
});

test("file route ?as=image: validates input, refuses secrets / non-images without fetching", async () => {
  const call = (q: string) => GET(new Request("http://localhost/api/github/file?as=image&" + q));
  assert.equal((await call("owner=a&repo=b&ref=main&path=../etc/passwd")).status, 400);
  assert.equal((await call("owner=a/b&repo=b&ref=main&path=x.png")).status, 400);
  assert.equal((await call("owner=a&repo=b&ref=main&path=.env")).status, 403);
  assert.equal((await call("owner=a&repo=b&ref=main&path=index.html")).status, 415);
  assert.equal((await call("owner=a&repo=b&ref=main&path=node_modules/x/a.png")).status, 415);
});

test("file route ?as=image: binary-safe bytes, allowlisted content type, only raw.githubusercontent.com, 5 MB cap", async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  let body: Uint8Array = PNG;
  globalThis.fetch = (async (u: string | URL | Request) => {
    seen.push(String(u));
    return new Response(body as BodyInit, { headers: { "Content-Type": "text/html" } });
  }) as typeof fetch;
  try {
    const r = await GET(new Request("http://localhost/api/github/file?as=image&owner=a&repo=b&ref=main&path=img/logo.png"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png", "type from the allowlist, not upstream");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [...PNG]);
    assert.ok(seen.every((u) => u.startsWith("https://raw.githubusercontent.com/a/b/")), seen.join());
    const s = await GET(new Request("http://localhost/api/github/file?as=image&owner=a&repo=b&ref=main&path=icon.svg"));
    assert.equal(s.headers.get("content-type"), "image/svg+xml");
    assert.match(s.headers.get("content-security-policy") ?? "", /sandbox/);
    assert.equal(s.headers.get("content-disposition"), "attachment");
    body = new Uint8Array(IMAGE_MAX_BYTES + 1);
    const big = await GET(new Request("http://localhost/api/github/file?as=image&owner=a&repo=b&ref=main&path=big.png"));
    assert.equal(big.status, 413);
  } finally {
    globalThis.fetch = real;
  }
});
