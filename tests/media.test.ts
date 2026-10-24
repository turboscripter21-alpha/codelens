import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { mediaMime, MEDIA_MAX_BYTES } from "@/lib/analyze/rules";
import { readZip } from "@/lib/analyze/zip";
import { GET } from "@/app/api/github/media/route";

test("mediaMime: allowlisted audio / video types only", () => {
  assert.equal(mediaMime("a/song.mp3"), "audio/mpeg");
  assert.equal(mediaMime("x.WAV"), "audio/wav");
  assert.equal(mediaMime("x.ogg"), "audio/ogg");
  assert.equal(mediaMime("x.m4a"), "audio/mp4");
  assert.equal(mediaMime("x.flac"), "audio/flac");
  assert.equal(mediaMime("clip.mp4"), "video/mp4");
  assert.equal(mediaMime("clip.webm"), "video/webm");
  assert.equal(mediaMime("x.html"), null);
  assert.equal(mediaMime("x.svg"), null);
  assert.equal(mediaMime("constructor"), null);
  assert.equal(MEDIA_MAX_BYTES, 10 * 1024 * 1024);
});

test("readZip keeps small media only when asked, never as code", () => {
  const zip = zipSync({
    "p/index.js": new TextEncoder().encode("export const a = 1;\n"),
    "p/sfx/beep.wav": new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
    "p/.env": new TextEncoder().encode("SECRET=1"),
  });
  const plain = readZip(zip);
  assert.deepEqual(Object.keys(plain.media), []);
  const withMedia = readZip(zip, undefined, true);
  const keys = Object.keys(withMedia.media);
  assert.equal(keys.length, 1);
  assert.ok(keys[0].endsWith("beep.wav"));
  assert.equal(withMedia.media[keys[0]].mime, "audio/wav");
  const wav = withMedia.entries.find((e) => e.path.endsWith("beep.wav"));
  assert.ok(wav?.binary, "media is still a binary building, not code");
  assert.ok(!keys.some((k) => k.endsWith(".env")));
});

test("media route: validates input and refuses non-media / secrets without fetching", async () => {
  const call = (q: string) => GET(new Request("http://localhost/api/github/media?" + q));
  assert.equal((await call("owner=a&repo=b&ref=main&path=../etc/passwd")).status, 400);
  assert.equal((await call("owner=a/b&repo=b&ref=main&path=x.mp3")).status, 400);
  assert.equal((await call("owner=a&repo=b&ref=main&path=.env")).status, 403);
  assert.equal((await call("owner=a&repo=b&ref=main&path=index.html")).status, 415);
  assert.equal((await call("owner=a&repo=b&ref=main&path=node_modules/x/a.mp3")).status, 415);
});
