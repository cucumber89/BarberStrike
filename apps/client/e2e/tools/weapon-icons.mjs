/**
 * P8a — the fourteen shop weapons as static three-quarter PNGs (`apps/client/src/assets/weapons/
 * <id>.png`), rendered from the SAME procedural geometry the game builds at runtime, so the shop
 * shows the real gun, not a hand-drawn guess.
 *
 * METHOD (reported per the P8a brief). A live Babylon render was tried first and abandoned: under
 * headless SwiftShader the Standard/PBR shaders never reached `isReady` (their `#include` chunks are
 * side-effect registrations a tree-shaken standalone import drops, so every draw was skipped and the
 * canvas stayed a flat clear colour — see the note atop `weapon-icons-scene.ts`). Reproducing the
 * full app's module graph plus a running match (what `weapon-shots.mjs` needs) is far heavier than
 * this icon warrants. So the tool renders the SAME geometry a shader-free way: `proceduralParts(id)`
 * gives the exact box/cylinder AABBs the game builds; the browser-side module projects them through
 * a 3/4 orthographic camera (angle from `WEAPON_ART`, shared) and paints sorted, shaded quads on a
 * 2D canvas, then exports a transparent PNG. Deterministic, no GPU, real geometry, true alpha.
 *
 * It still runs in Playwright/Chromium against the client's Vite dev server (the `skin-batch.mjs`
 * pattern): that is the one place the browser `Canvas`/`ImageData` APIs and Vite's `/@fs/` resolver
 * are both available so the scene module's `@frankibarber/*` imports load. The PNGs are committed
 * (the shop imports them); the `_report.json` goes to the gitignored `e2e/out`.
 *
 * PREREQ: the client dev server on :5174 (`pnpm --filter @frankibarber/client dev`), Chromium from
 * Playwright (PW_CHROMIUM overrides the executable if the pinned build drifted from what is on disk).
 * Run: `node apps/client/e2e/tools/weapon-icons.mjs`
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const OUT = fileURLToPath(new URL("../../src/assets/weapons/", import.meta.url));
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5174";
const SIZE = +(process.env.SIZE || 384);
await mkdir(OUT, { recursive: true });

// The scene module the page imports, as an absolute /@fs/ URL Vite serves (skin-batch.mjs pattern):
// Vite transforms it, so its bare `@frankibarber/*` imports resolve (a raw page import() cannot).
// Windows drive letters need the leading slash stripped so `/@fs/C:/...` is well-formed.
const fsUrl = (rel) => {
  const p = decodeURIComponent(new URL(rel, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  return `/@fs/${p}`;
};
const SCENE = fsUrl("./weapon-icons-scene.ts");

const REPORT = fileURLToPath(new URL("../out/weapons/_report.json", import.meta.url));
await mkdir(fileURLToPath(new URL("../out/weapons/", import.meta.url)), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL,
  // The pinned Playwright build and the installed Chromium can drift (build 1234 vs 1243 here);
  // PW_CHROMIUM lets the caller point at the Chromium that IS on disk. The render is a 2D canvas —
  // no GPU needed — so no SwiftShader flags.
  executablePath: process.env.PW_CHROMIUM || undefined,
});
const report = { rendered: [], skipped: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(String(e.message ?? e)));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(m.text()); });
  await page.goto(CLIENT_URL, { waitUntil: "domcontentloaded" });

  const images = await page.evaluate(async ({ sceneUrl, size }) => {
    const mod = await import(/* @vite-ignore */ sceneUrl);
    return mod.renderWeaponIcons(size);
  }, { sceneUrl: SCENE, size: SIZE });

  for (const { id, png, opaque, radius } of images) {
    if (!png || opaque < 200) { report.skipped.push({ id, opaque, radius, why: "too few opaque pixels" }); continue; }
    const buf = Buffer.from(png, "base64");
    await writeFile(`${OUT}${id}.png`, buf);
    report.rendered.push({ id, bytes: buf.length, opaque });
  }
} finally {
  await writeFile(REPORT, JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify({ rendered: report.rendered.length, skipped: report.skipped.length, errors: report.errors.slice(0, 5) }, null, 2));
assert.equal(report.skipped.length, 0, `skipped: ${JSON.stringify(report.skipped)}`);
assert.equal(report.rendered.length, 14, "expected 14 weapon PNGs");
