#!/usr/bin/env node
/**
 * Menu → match → leave, N times, measured: does anything grow?
 *
 * Each cycle joins a fresh room, waits for READY, enters, plays a few frames, leaves through the
 * pause card, and records: time to READY (cycle 1 is the cold load, the rest are warm), the scene's
 * resource counts at READY (meshes, materials, textures, particle systems, compiled effects), and the
 * JS heap after leaving and a forced GC. After the caches warm (cycle 2) the counts must be flat and
 * the heap must stop climbing; a monotonic heap or a growing texture count is a leak.
 *
 * SwiftShader only says whether things LEAK; it says nothing about how fast a real GPU renders.
 *
 *   node apps/client/e2e/tools/cycles.mjs [--url http://localhost:5174] [--n 10] [--label run]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/perf");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5174");
const N = Number(arg("--n", "10"));
const LABEL = arg("--label", "run");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false } });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(existsSync(EXE) ? { executablePath: EXE } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--js-flags=--expose-gc"],
});
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

const heap = async () => {
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.gc?.(); });
  await page.waitForTimeout(300);
  return page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1024 / 1024 * 10) / 10);
};

const rows = [];
for (let i = 1; i <= N; i++) {
  const t0 = performance.now();
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill("CYCLE");
  await page.getByTestId("input-room").fill(`cycle-${Date.now()}-${i}`);
  await page.getByTestId("btn-quickplay").click();
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120_000 });
  const readyMs = Math.round(performance.now() - t0);
  const counts = await page.evaluate(() => {
    const g = window.__fb.game; const s = g.currentScene ?? g.scene; const e = s.getEngine();
    return {
      meshes: s.meshes.length, materials: s.materials.length, textures: s.textures.length, particles: s.particleSystems.length,
      effects: e._compiledEffects ? Object.keys(e._compiledEffects).length : -1, lights: s.lights.length, canvases: document.querySelectorAll("canvas").length,
    };
  });
  await page.getByTestId("enter-game").click();
  await page.waitForFunction(() => window.__fb?.hud.get().connected && window.__fb.hud.get().alive, null, { timeout: 60_000 }).catch(() => {});
  // A few frames of play.
  const f0 = await page.evaluate(() => window.__fb.game.frameCount);
  await page.waitForFunction((t) => window.__fb.game.frameCount >= t, f0 + 20, { timeout: 60_000 });
  // Escape opens the pause card whether or not the browser granted the pointer; leave through it.
  await page.keyboard.press("Escape");
  const leaveBtn = page.getByTestId("btn-leave");
  if (!(await leaveBtn.isVisible().catch(() => false))) {
    await page.evaluate(() => document.exitPointerLock?.());
    await page.keyboard.press("Escape");
  }
  await leaveBtn.click({ timeout: 10_000 });
  await page.getByTestId("btn-play").waitFor({ timeout: 30_000 });
  const heapMb = await heap();
  const canvases = await page.evaluate(() => document.querySelectorAll("canvas").length);
  const fbGone = await page.evaluate(() => window.__fb === undefined);
  rows.push({ cycle: i, readyMs, ...counts, heapMbAfterLeave: heapMb, canvasesAfterLeave: canvases, gameReleased: fbGone });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
await browser.close();

const warm = rows.slice(1);
const flat = (k) => warm.length === 0 || warm.every((r) => r[k] === warm[0][k]);
const heapTrend = warm.length >= 2 ? +(warm[warm.length - 1].heapMbAfterLeave - warm[0].heapMbAfterLeave).toFixed(1) : 0;
const md = [
  `# Menu → match → leave, ${N} cycles (${LABEL})\n`,
  "Measured with `node apps/client/e2e/tools/cycles.mjs` on SwiftShader (leaks only — not speed).\n",
  "| cycle | ready ms | meshes | materials | textures | particles | effects | lights | heap MB after leave | canvases after leave | game released |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.cycle} | ${r.readyMs} | ${r.meshes} | ${r.materials} | ${r.textures} | ${r.particles} | ${r.effects} | ${r.lights} | ${r.heapMbAfterLeave} | ${r.canvasesAfterLeave} | ${r.gameReleased} |`),
  "",
  `Warm cycles (2..${N}): meshes ${flat("meshes") ? "flat" : "VARY"}, materials ${flat("materials") ? "flat" : "VARY"}, textures ${flat("textures") ? "flat" : "VARY"}, effects ${flat("effects") ? "flat" : "VARY"}; heap after leave drifts ${heapTrend >= 0 ? "+" : ""}${heapTrend} MB from cycle 2 to ${N}.`,
  errors.length ? `\nPage errors: ${errors.length}\n${errors.slice(0, 5).map((e) => `- ${e}`).join("\n")}` : "\nPage errors: none",
].join("\n");
writeFileSync(`${OUT}/cycles-${LABEL}.md`, md + "\n");
writeFileSync(`${OUT}/cycles-${LABEL}.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(md);
