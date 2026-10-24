// TEST FIXTURES: hostile archives and file names, built in memory (nothing is executed).
import { zipSync, strToU8 } from "fflate";

/** Store-only zip builder that lets us write ANY entry name (fflate's zipSync normalizes nothing,
 *  but we also need duplicate names, which an object literal can't express). */
export function rawZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (d: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of d) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true); lh.setUint16(26, name.length, true);
    local.push(new Uint8Array(lh.buffer), name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, e.data.length, true); ch.setUint32(24, e.data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + e.data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Zip slip: entries that try to escape the extraction root. */
export const zipSlip = () =>
  rawZip([
    { name: "../../evil.js", data: strToU8("pwned()") },
    { name: "/etc/passwd", data: strToU8("root:x:0:0") },
    { name: "C:\\Windows\\win.ini", data: strToU8("[x]") },
    { name: "ok/..\\..\\evil2.js", data: strToU8("pwned()") },
    { name: "ok/a\u0000.js", data: strToU8("nul") },
    { name: "ok/good.js", data: strToU8("export const a = 1;\n") },
  ]);

/** File names that would execute if any page used innerHTML with them. */
export const XSS_NAMES = [
  `src/<img src=x onerror="window.__xss=1">.js`,
  `src/"><svg onload=window.__xss=2>/index.ts`,
  `src/<script>window.__xss=3</script>.md`,
  "src/\u202Egnp.js",
  "src/日本語 ファイル.ts",
  "src/with space/and 'quotes'.js",
  "__proto__",
  "constructor",
  "src/a.constructor",
  "src/toString",
];
export const xssZip = () =>
  zipSync(Object.fromEntries(XSS_NAMES.map((n, i) => ["repo/" + n, strToU8(i % 2 ? `import x from './index';\nexport const v${i} = 1;\n` : `// <img src=x onerror=alert(1)>\nconst s = "</script><script>window.__xss=9</script>";\n`)])));

/** One file over the per-file read cap (1 MB), plus a normal file. */
export const oversizedZip = () => zipSync({ "r/huge.js": new Uint8Array(3 * 1024 * 1024).fill(0x61), "r/ok.js": strToU8("ok\n") });

/** The same entry name repeated: must be inflated once, not N times. */
export const duplicateZip = (n: number) => rawZip(Array.from({ length: n }, (_, i) => ({ name: "r/dup.js", data: strToU8(`// copy ${i}\n` + "x\n".repeat(50)) })));

/** Secrets with tell-tale contents that must never appear anywhere in the output. */
export const SECRET_MARK = "TOPSECRET_9f3a";
export const secretsZip = () =>
  zipSync(
    Object.fromEntries(
      [".env", ".env.production", ".envrc", ".env-local", "infra/prod.tfvars", "infra/terraform.tfstate", ".aws/credentials", ".kube/config", ".docker/config.json", "keys/deploy.ppk", ".dev.vars", ".pgpass", ".yarnrc.yml"].map((n) => [
        "r/" + n,
        strToU8(`${SECRET_MARK}=1\n`),
      ]).concat([["r/app.js", strToU8("export const a = 1;\n")]]),
    ),
  );
