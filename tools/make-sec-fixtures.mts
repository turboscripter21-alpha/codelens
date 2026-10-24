// Writes the malicious fixtures (tests/fixtures/malicious.ts) to /tmp/sec for the browser e2e run.
import { mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { zipSlip, xssZip, oversizedZip, duplicateZip, secretsZip } from "../tests/fixtures/malicious";
const D = "/tmp/sec";
mkdirSync(D, { recursive: true });
writeFileSync(`${D}/zip-slip.zip`, zipSlip());
writeFileSync(`${D}/xss-names.zip`, xssZip());
writeFileSync(`${D}/oversized.zip`, oversizedZip());
writeFileSync(`${D}/duplicates.zip`, duplicateZip(3000));
writeFileSync(`${D}/secrets.zip`, secretsZip());
writeFileSync(`${D}/only-binaries.zip`, zipSync({ "r/a.png": new Uint8Array(100), "r/b.woff2": new Uint8Array(50) }));
writeFileSync(`${D}/empty-after-rules.zip`, zipSync({ "r/node_modules/x/index.js": strToU8("x"), "r/dist/app.js": strToU8("y") }));
writeFileSync(`${D}/nested-root.zip`, zipSync({ "outer/inner/src/a.js": strToU8("import b from './b';\n"), "outer/inner/src/b.js": strToU8("export default 1;\n"), "outer/inner/README.md": strToU8("# hi\n") }));
writeFileSync(`${D}/not-a-zip.zip`, strToU8("this is not a zip"));
// odd folder: unicode, spaces, very long and very deep paths, a symlink out of the tree
const F = `${D}/odd folder ✨`;
rmSync(F, { recursive: true, force: true });
mkdirSync(`${F}/src/ünïcödé dir`, { recursive: true });
writeFileSync(`${F}/src/ünïcödé dir/файл.ts`, "export const x = 1;\n");
writeFileSync(`${F}/src/<b onmouseover=alert(1)>.js`, "export const y = 2;\n");
writeFileSync(`${F}/.env`, "TOPSECRET_9f3a=1\n");
let deep = `${F}/deep`;
for (let i = 0; i < 40; i++) deep += `/level${i}`;
mkdirSync(deep, { recursive: true });
writeFileSync(`${deep}/bottom.js`, "export default 'deep';\n");
const long = `${F}/${"l".repeat(200)}`;
mkdirSync(long, { recursive: true });
writeFileSync(`${long}/${"n".repeat(200)}.js`, "export {};\n");
try { symlinkSync("/etc/passwd", `${F}/src/passwd-link.txt`); } catch { /* ignore */ }
console.log("fixtures in", D);
