#!/usr/bin/env node
/**
 * Pixel diff between two runs of the HUD state gallery (`hud-states.mjs`), scenario by scenario.
 *
 *   node apps/client/e2e/tools/hud-diff.mjs --a before --b p0 [--tolerance 0.002] [--only a,b]
 *
 * Drop U splits `Hud.tsx` into components before anybody restyles anything, and "the split changed
 * nothing on screen" is a claim that needs a number, not a glance: this loads both PNGs of every
 * scenario into a canvas in headless Chromium (no image library in the repo, and none is worth
 * adding for this), counts the pixels whose colour moved by more than a small threshold, and writes
 * `e2e/out/u/diff-<a>-<b>.md`. Exit code 1 when any scenario differs by more than `--tolerance`
 * (a fraction of the frame; the default 0.2 % absorbs text antialiasing and a blinking caret).
 */
import { chromium } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/u");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const A = arg("--a", "before");
const B = arg("--b", "after");
const TOL = Number(arg("--tolerance", "0.002"));
const ONLY = arg("--only", "")?.split(",").filter(Boolean) ?? [];
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

const dirA = resolve(OUT, A), dirB = resolve(OUT, B);
if (!existsSync(dirA) || !existsSync(dirB)) {
  console.error(`missing gallery: ${existsSync(dirA) ? dirB : dirA}`);
  process.exit(2);
}
const names = readdirSync(dirA).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4))
  .filter((n) => !ONLY.length || ONLY.includes(n)).sort();

const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage();
const rows = [];
let failed = 0;
for (const name of names) {
  const fa = resolve(dirA, `${name}.png`), fb = resolve(dirB, `${name}.png`);
  if (!existsSync(fb)) { rows.push({ name, frac: null, note: `missing in ${B}` }); failed++; continue; }
  const r = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const da = px(ia), db = px(ib);
    let diff = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 48) {
        diff++;
        const p = i / 4, x = p % ia.width, y = (p - x) / ia.width;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { frac: diff / (ia.width * ia.height), box: maxX < 0 ? "" : `${minX},${minY} → ${maxX},${maxY}` };
  }, [`data:image/png;base64,${readFileSync(fa).toString("base64")}`, `data:image/png;base64,${readFileSync(fb).toString("base64")}`]);
  if (r.size) { rows.push({ name, frac: null, note: `size ${r.size}` }); failed++; continue; }
  if (r.frac > TOL) failed++;
  rows.push({ name, frac: r.frac, note: r.box });
}
await browser.close();

const md = [
  `# HUD gallery diff: ${A} → ${B}`,
  "",
  `Tolerance ${(TOL * 100).toFixed(2)} % of the frame; a pixel counts when |ΔR|+|ΔG|+|ΔB| > 48.`,
  "",
  "| scenario | changed | verdict | changed box |",
  "|---|---:|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.frac === null ? "—" : `${(r.frac * 100).toFixed(3)} %`} | ${r.frac === null ? "FAIL" : r.frac > TOL ? "DIFFERS" : "same"} | ${r.note} |`),
  "",
  `${rows.length - failed}/${rows.length} within tolerance.`,
].join("\n");
const file = resolve(OUT, `diff-${A}-${B}.md`);
writeFileSync(file, md + "\n");
console.log(md);
console.log(`wrote ${file}`);
process.exit(failed ? 1 : 0);
