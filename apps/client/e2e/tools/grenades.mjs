// Drop 2 visual check: shop panel, wallet HUD, grenade in hand, blast, smoke. Writes PNGs to OUT.
// Needs the dev servers (`pnpm dev` from the repo root, FB_DEV_TOOLS not required) and the sandbox Chromium
// (override with PW_CHROMIUM). Run from apps/client: `OUT=/tmp/shots node e2e/tools/grenades.mjs`.
import { chromium } from "@playwright/test";
const OUT = process.env.OUT ?? "/tmp";
const LOW = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 1, antialiasing: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("SHOTS");
await page.getByTestId("input-room").fill(`shots-${Date.now()}`);
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 30000 });
const lock = () => page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
  document.dispatchEvent(new Event("pointerlockchange"));
});
await lock();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/d2_hud.png` });
await page.keyboard.press("KeyB");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/d2_shop.png` });
await page.getByTestId("shop-frag").getByRole("button").click();
await page.waitForTimeout(600);
await page.evaluate(() => { const g = window.__fb.game; g.buy("frag"); g.buy("smoke"); g.buy("smg"); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/d2_shop_bought.png` });
await page.keyboard.press("KeyB");
await page.waitForTimeout(600);
await lock();
// Face the open side (away from the wall) and a little down so the grenade lands ~6 m ahead, in view.
await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.yaw += Math.PI / 2; lp.pitch = 0.18; });
await page.waitForTimeout(400);
await page.keyboard.down("KeyG");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/d2_cook.png` });
await page.keyboard.up("KeyG");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/d2_flight.png` });
await page.waitForFunction(() => window.__fb.game.stats.booms > 0, null, { timeout: 15000 });
await page.screenshot({ path: `${OUT}/d2_boom.png` });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/d2_boom2.png` });
await page.waitForTimeout(1500);
await page.keyboard.press("Digit4");
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/d2_smoke.png` });
console.log(JSON.stringify(await page.evaluate(() => ({ stats: window.__fb.game.stats, money: window.__fb.hud.get().money, owned: window.__fb.hud.get().owned }))));
await browser.close();
