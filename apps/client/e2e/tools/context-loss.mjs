#!/usr/bin/env node
/**
 * Does the game survive a lost WebGL context? Forced with the WEBGL_lose_context extension on the
 * live canvas mid-match, restored two seconds later; the check is that frames keep coming after
 * the restore, the HUD still reports a connected match, and nothing threw. Babylon's Engine owns
 * the context-lost / restored dance (it rebuilds every texture and effect); this proves the game's
 * own render loop and modules come back with it rather than assuming so.
 *
 *   node apps/client/e2e/tools/context-loss.mjs [--url http://localhost:5174]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/perf");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5174");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false } });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ ...(existsSync(EXE) ? { executablePath: EXE } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("CTX");
await page.getByTestId("input-room").fill(`ctx-${Date.now()}`);
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120_000 });
await page.getByTestId("enter-game").click();
const frames = async (n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60_000 }); };
await frames(10);

const lost = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  const ext = gl?.getExtension("WEBGL_lose_context");
  if (!ext) return false;
  window.__ext = ext; ext.loseContext(); return true;
});
if (!lost) { console.log("WEBGL_lose_context not available"); await browser.close(); process.exit(2); }
await page.waitForTimeout(2000);
const duringLost = await page.evaluate(() => ({ frame: window.__fb.game.frameCount, isLost: window.__fb.game.currentScene.getEngine().isContextLost?.() ?? null }));
await page.evaluate(() => window.__ext.restoreContext());
await page.waitForTimeout(1500);
let advanced = true;
try { await frames(20); } catch { advanced = false; }
const after = await page.evaluate(() => ({ frame: window.__fb.game.frameCount, connected: window.__fb.hud.get().connected, alive: window.__fb.hud.get().alive, isLost: window.__fb.game.currentScene.getEngine().isContextLost?.() ?? null, meshes: window.__fb.game.currentScene.meshes.length }));
await page.screenshot({ path: `${OUT}/context-loss-after.png` });
await browser.close();
const ok = advanced && !after.isLost && after.connected && errors.length === 0;
const md = [
  "# WebGL context loss and restore (forced with WEBGL_lose_context)\n",
  `- during loss: frame ${duringLost.frame}, engine.isContextLost = ${duringLost.isLost}`,
  `- after restore: frames advanced = ${advanced}, isContextLost = ${after.isLost}, connected = ${after.connected}, alive = ${after.alive}, meshes = ${after.meshes}`,
  `- page errors: ${errors.length ? errors.join(" | ") : "none"}`,
  `\n**${ok ? "PASS" : "FAIL"}** — screenshot \`apps/client/e2e/out/perf/context-loss-after.png\`.`,
].join("\n");
writeFileSync(`${OUT}/context-loss.md`, md + "\n");
console.log(md);
process.exitCode = ok ? 0 : 1;
