/**
 * Resource stability over repeated menu → match → armoury → menu cycles.
 *
 * Each cycle joins a room, deploys, plays a couple of seconds, leaves to the menu, opens the
 * armoury (the wardrobe: skins, outfits, haircuts, the 3D preview) and goes back. After every
 * cycle it forces a GC (`--js-flags=--expose-gc`) and records the JS heap, the engine's texture
 * cache, and — while a match is up — the scene's mesh / material / texture counts. A cache that
 * warms up and then holds still is fine; a count that climbs every cycle is a leak.
 *
 * Needs the dev servers. SwiftShader is slow, so the default is 10 cycles at low quality.
 *
 *   CYCLES=10 node e2e/tools/cycle-leaks.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.env.OUT ? resolve(process.env.OUT) : resolve(dirname(fileURLToPath(import.meta.url)), "../out/perf");
const CYCLES = +(process.env.CYCLES || 10);
const SET = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: false } });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--js-flags=--expose-gc"] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5174/");

const sample = (label) => page.evaluate((label) => {
  if (typeof window.gc === "function") { window.gc(); window.gc(); }
  const g = window.__fb?.game;
  const s = g?.currentScene ?? g?.scene ?? null;
  const e = s?.getEngine?.() ?? null;
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
  return {
    label, heapMB: mem,
    meshes: s ? s.meshes.length : null, materials: s ? s.materials.length : null, textures: s ? s.textures.length : null,
    engineTextures: e ? e._internalTexturesCache?.length ?? null : null,
    lights: s ? s.lights.length : null, particleSystems: s ? s.particleSystems.length : null,
    canvases: document.querySelectorAll("canvas").length,
  };
}, label);

const rows = [];
for (let i = 1; i <= CYCLES; i++) {
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill("LEAK");
  await page.getByTestId("input-room").fill(`leak-${Date.now()}`);
  await page.getByTestId("btn-quickplay").click();
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
  await page.getByTestId("enter-game").click({ timeout: 30000 });
  await page.waitForFunction(() => window.__fb.hud.get().alive === true, null, { timeout: 60000 });
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(2500);
  rows.push(await sample(`match ${i}`));
  // Leave: Escape opens the ESC column, OPUŚĆ MECZ asks „NA PEWNO WYJŚĆ?” (drop U, P7) and TAK,
  // WYJDŹ returns to the main menu.
  await page.keyboard.press("Escape");
  await page.getByTestId("btn-leave").click({ timeout: 10000 });
  await page.getByTestId("btn-leave-confirm").click({ timeout: 10000 });
  await page.getByTestId("btn-play").waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  rows.push(await sample(`menu ${i}`));
  await page.getByTestId("btn-armoury").click();
  await page.getByTestId("armoury").waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  rows.push(await sample(`armoury ${i}`));
  await page.getByTestId("btn-back").click();
  await page.getByTestId("btn-play").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  rows.push(await sample(`menu+ ${i}`));
  console.log(rows.slice(-4).map((r) => `${r.label}: heap ${r.heapMB} MB, engineTex ${r.engineTextures}, meshes ${r.meshes}, materials ${r.materials}, canvases ${r.canvases}`).join(" | "));
}
writeFileSync(`${OUT}/cycle-leaks.json`, JSON.stringify(rows, null, 2));
const first = rows.filter((r) => r.label.startsWith("menu+"))[1], last = rows.filter((r) => r.label.startsWith("menu+")).at(-1);
console.log(`cycle-leaks: ${CYCLES} cycles; heap after cycle 2 → ${CYCLES}: ${first?.heapMB} → ${last?.heapMB} MB; engine textures ${first?.engineTextures} → ${last?.engineTextures}`);
await browser.close();
