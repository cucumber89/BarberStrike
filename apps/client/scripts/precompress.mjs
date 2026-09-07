// Precompress the built client (performance pass, task 3): every compressible file in dist/ gets a
// .br and a .gz sibling at build time, so the game server (or any static host that looks for them)
// sends bytes it never has to compress per request. On a 2-vCPU VPS with the simulation on one core,
// compressing a 2.7 MB bundle on the fly for every first load is CPU the match does not get.
//
//   node scripts/precompress.mjs [dist]          (runs after `vite build`, see package.json)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve(process.argv[2] ?? "dist");
const TEXT = new Set([".js", ".css", ".html", ".svg", ".json", ".map", ".txt", ".webmanifest", ".xml"]);
const BINARY = new Set([".glb", ".wasm"]);
const MIN_BYTES = 1024;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

if (!fs.existsSync(dist)) { console.error(`[precompress] no ${dist}`); process.exit(1); }
const rows = [];
let rawTotal = 0, brTotal = 0, gzTotal = 0;
for (const file of walk(dist)) {
  const ext = path.extname(file);
  if (!TEXT.has(ext) && !BINARY.has(ext)) continue;
  const raw = fs.readFileSync(file);
  if (raw.length < MIN_BYTES) continue;
  const br = zlib.brotliCompressSync(raw, { params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_MODE]: TEXT.has(ext) ? zlib.constants.BROTLI_MODE_TEXT : zlib.constants.BROTLI_MODE_GENERIC,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
  } });
  const gz = zlib.gzipSync(raw, { level: 9 });
  // Only keep a sibling that actually saves something: a 3 % gain is not worth a second file.
  if (br.length < raw.length * 0.97) fs.writeFileSync(file + ".br", br);
  if (gz.length < raw.length * 0.97) fs.writeFileSync(file + ".gz", gz);
  rawTotal += raw.length; brTotal += Math.min(br.length, raw.length); gzTotal += Math.min(gz.length, raw.length);
  rows.push({ file: path.relative(dist, file), raw: raw.length, br: br.length, gz: gz.length });
}
rows.sort((a, b) => b.raw - a.raw);
const kb = (n) => (n / 1024).toFixed(0).padStart(6) + " kB";
for (const r of rows.slice(0, 12)) console.log(`[precompress] ${kb(r.raw)} → br ${kb(r.br)}  gz ${kb(r.gz)}  ${r.file}`);
console.log(`[precompress] ${rows.length} files: ${kb(rawTotal)} raw → ${kb(brTotal)} br, ${kb(gzTotal)} gz`);
