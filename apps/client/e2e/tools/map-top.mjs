/**
 * map-top — the map from straight above, orthographic, like a satellite tile: proves the ground
 * reads as the place (lawn, gravel road, tiled roofs, the pool, the paving) and that the plot's
 * proportions are the drawing's. Two frames: the game's night lighting, and the same view with
 * the sky and the moon turned up ("day") so the materials themselves can be judged.
 *
 *   PW_CHROMIUM=… MAP=dolna node apps/client/e2e/tools/map-top.mjs   → apps/client/e2e/out/<map>/top_{night,day}.png
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
const URL = process.env.HOST_URL ?? "http://localhost:5174";
const MAP = process.env.MAP ?? "dolna";
const OUT = `apps/client/e2e/out/${MAP}`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
await p.goto(`${URL}/map-review.html?map=${MAP}&preset=medium`);
await p.waitForFunction(() => window.review, null, { timeout: 120000 });
await p.evaluate(() => window.review.scene.whenReadyAsync());
const bounds = await p.evaluate(() => {
  const { scene, camera } = window.review;
  const bb = scene.meshes.filter((m) => m.name.startsWith("map_")).reduce((a, m) => { const bi = m.getBoundingInfo().boundingBox; return { minX: Math.min(a.minX, bi.minimumWorld.x), maxX: Math.max(a.maxX, bi.maximumWorld.x), minZ: Math.min(a.minZ, bi.minimumWorld.z), maxZ: Math.max(a.maxZ, bi.maximumWorld.z) }; }, { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 });
  const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2, w = bb.maxX - bb.minX, d = bb.maxZ - bb.minZ;
  camera.mode = 1;   // ORTHOGRAPHIC_CAMERA
  const aspect = 1.4, half = Math.max(w / 2, (d / 2) * aspect) + 1;
  camera.orthoLeft = -half; camera.orthoRight = half; camera.orthoTop = half / aspect; camera.orthoBottom = -half / aspect;
  camera.position.set(cx, 60, cz);
  camera.setTarget(new (camera.position.constructor)(cx, 0, cz + 0.001));
  camera.upVector.set(0, 0, 1);
  camera.minZ = 1; camera.maxZ = 200;
  scene.fogMode = 0;
  return { cx, cz, w, d };
});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/top_night.png` });
await p.evaluate(() => {
  const { scene } = window.review;
  for (const l of scene.lights) { if (l.name === "ambient") { l.intensity = 1.6; l.diffuse.set(0.95, 0.97, 1); l.groundColor.set(0.4, 0.4, 0.4); } if (l.name === "moon") { l.intensity = 2.2; l.diffuse.set(1, 0.97, 0.9); } }
  scene.imageProcessingConfiguration.exposure = 1.0;
  for (const m of scene.materials) m.markDirty(true);
});
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/top_day.png` });
console.log(`top: ${MAP} ${bounds.w.toFixed(0)} × ${bounds.d.toFixed(0)} m → ${OUT}/top_{night,day}.png`);
await b.close();
