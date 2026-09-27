/**
 * Voxel lab shots: the gallery of every model and one close-up per model, plus a table of what
 * each costs (voxels → quads → meshes). Needs the dev client on :5174 (`pnpm --filter client dev`).
 *
 *   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node apps/client/e2e/tools/voxel-shots.mjs
 *   MODELS=fridge,stove …   only these close-ups (the gallery is always taken)
 *
 * Output: apps/client/e2e/out/voxel/{all.png,<id>.png,voxel.md}
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const URL = process.env.HOST_URL ?? "http://localhost:5174";
const OUT = "apps/client/e2e/out/voxel";
fs.mkdirSync(OUT, { recursive: true });
const only = process.env.MODELS ? new Set(process.env.MODELS.split(",")) : null;
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push("pageerror: " + String(e.message).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text().slice(0, 200)); });
// Vite reloads the page when a model file is saved mid-run; every step waits for the lab again.
const ready = async () => { await p.waitForFunction(() => window.lab, null, { timeout: 120000 }); await p.evaluate(() => window.lab.scene.whenReadyAsync()); };
await p.goto(`${URL}/voxel-lab.html?galeria=1`);
await ready();
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/all.png` });
const ids = await p.evaluate(() => window.lab.ids);
const rows = [];
for (const id of ids) {
  if (only && !only.has(id)) continue;
  await ready();
  const s = await p.evaluate((id) => { const c = window.lab.camera; c.alpha = -Math.PI / 2 + 0.6; c.beta = 1.05; return window.lab.show(id); }, id);
  await ready();
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/${id}.png` });
  // a second angle: from the back-left, so the hidden faces are seen too
  await p.evaluate(() => { const c = window.lab.camera; c.alpha += Math.PI * 0.8; c.beta = 1.2; });
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${OUT}/${id}_back.png` });
  rows.push(s);
}
const md = ["# Voxel models — koszt i rozmiar", "", `Galeria: \`all.png\` (${ids.length} modeli). Kadry: \`<id>.png\` (przód) i \`<id>_back.png\`.`, "",
  "| model | w × h × d [m] | voxels | quads | meshes | grupy |", "|---|---|---|---|---|---|"];
for (const s of rows) md.push(`| ${s.id} | ${s.bounds.w} × ${s.bounds.h} × ${s.bounds.d} | ${s.voxels} | ${s.quads} | ${s.meshes} | ${s.groups.join(", ")} |`);
const totalQ = rows.reduce((a, s) => a + s.quads, 0), totalV = rows.reduce((a, s) => a + s.voxels, 0);
md.push("", `Razem: ${totalV} voxeli → ${totalQ} quadów (${(100 * totalQ / Math.max(1, totalV * 6)).toFixed(1)} % ścian, które miałyby boxy).`);
md.push("", "Błędy konsoli: " + (errors.length ? "\n- " + errors.join("\n- ") : "brak"));
fs.writeFileSync(`${OUT}/voxel.md`, md.join("\n") + "\n");
console.log(`voxel: ${rows.length} models, ${totalV} voxels → ${totalQ} quads; errors ${errors.length}`);
await b.close();
