import { chromium } from "@playwright/test";
import fs from "node:fs";

/**
 * Animation stills: for each weapon, a frame from the middle of the reload (mag out / shell in /
 * bolt back) and one right after a shot (slide / pump / bolt cycling). Dev servers must be running.
 * Output: SHOT_DIR (default scratchpad)/anim-*.png
 */
const OUT = process.env.SHOT_DIR || "/tmp/claude-0/-home-user-sidequest/1d2f80ee-f8c5-5282-b5fc-eb567dff361c/scratchpad/anim";
fs.mkdirSync(OUT, { recursive: true });
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 0.5, antialiasing: false, dynamicResolution: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("ANIM");
await page.getByTestId("input-room").fill("anim-" + Date.now());
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await page.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
const frames = async (n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120000 }); };
// Stand in the shop looking at the mirror wall (well lit, close backdrop).
await page.evaluate(() => window.__fb.game.conn.send("dev:teleport", { x: 2, y: 0.05, z: 5 }));
await page.waitForTimeout(400);
await page.evaluate(() => { window.__fb.game.localPlayer.yaw = -Math.PI / 2; window.__fb.game.localPlayer.pitch = 0.05; });
await frames(3);
const slots = { pistol: "Digit1", smg: "Digit2", rifle: "Digit3", shotgun: "Digit4", dmr: "Digit5" };
for (const [weapon, key] of Object.entries(slots)) {
  await page.keyboard.press(key);
  await page.waitForFunction((w) => window.__fb.hud.get().weapon === w, weapon, { timeout: 5000 });
  await page.waitForTimeout(700);
  await frames(2);
  await page.screenshot({ path: `${OUT}/anim-${weapon}-idle.png` });
  // Shot: capture the very next frames (action cycling).
  await page.mouse.down(); await frames(1); await page.mouse.up();
  await page.screenshot({ path: `${OUT}/anim-${weapon}-shot.png` });
  await frames(3);
  // Reload: capture at ~45 % (mag out / shells) and ~88 % (action).
  const ms = await page.evaluate((w) => window.__fb.game.weapons ? 0 : 0, weapon);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.__fb.hud.get().reloading, null, { timeout: 3000 });
  const reloadMs = await page.evaluate(() => { const h = window.__fb.hud.get(); return h.reloadEnd ? h.reloadEnd - performance.now() : 1200; });
  await page.waitForTimeout(Math.max(100, reloadMs * 0.42));
  await page.screenshot({ path: `${OUT}/anim-${weapon}-reload-mid.png` });
  await page.waitForTimeout(Math.max(100, reloadMs * 0.42));
  await page.screenshot({ path: `${OUT}/anim-${weapon}-reload-late.png` });
  await page.waitForFunction(() => !window.__fb.hud.get().reloading, null, { timeout: 6000 });
  console.log("anim", weapon, "reloadMs≈", Math.round(reloadMs), void ms);
}
console.log("errors:", errors.length, errors.slice(0, 3));
await browser.close();
