#!/usr/bin/env node
/**
 * Showcase stills: menu, loading, in-match HUD from a few spots on the map, the shop, the
 * scoreboard, a bot fight with the kill feed, and the result card — 1280×720, medium preset,
 * for showing the game to someone without a machine to run it on. Dev servers must be running.
 *
 *   node apps/client/e2e/tools/showcase.mjs [--url http://localhost:5174]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/showcase");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5174");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true, dynamicResolution: false } });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ ...(existsSync(EXE) ? { executablePath: EXE } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => { localStorage.setItem("fb_settings_v1", v); localStorage.setItem("fb_bots", "6"); localStorage.setItem("fb_mode", "tdm"); }, SET);
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const frames = async (n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120_000 }); };
const fakeLock = () => page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
const teleport = (x, y, z, yaw, pitch = 0) => page.evaluate(([x, y, z, yaw, pitch]) => { window.__fb.game.conn.send("dev:teleport", { x, y, z }); const lp = window.__fb.game.localPlayer; lp.yaw = yaw; lp.pitch = pitch; }, [x, y, z, yaw, pitch]);

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await shot("01-menu");
await page.getByTestId("btn-play").click();
await page.waitForTimeout(600);
await shot("02-lobby");
await page.getByTestId("input-name").fill("FRANKI");
await page.getByTestId("input-room").fill(`show-${Date.now()}`);
await page.getByTestId("btn-quickplay").click();
await page.waitForTimeout(1500);
await shot("03-loading");
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120_000 });
await page.waitForTimeout(500);
await shot("04-ready");
await page.getByTestId("enter-game").click();
await page.waitForFunction(() => window.__fb?.hud.get().connected, null, { timeout: 60_000 });
await fakeLock();
await frames(10);
await page.evaluate(() => window.__fb.game.conn.send("dev:money", 6000));
// Wait for the match to start with the bots (countdown → playing).
await page.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 90_000 }).catch(() => {});
const views = [["05-street", -6, 0.05, -5, 0.6, 0.02], ["06-shop-front", 2, 0.05, 1.2, 0.3, 0.05], ["07-yard", 2, 0.05, 19.5, 0, 0]];
for (const [name, x, y, z, yaw, pitch] of views) {
  await teleport(x, y, z, yaw, pitch);
  await page.waitForTimeout(600);
  await frames(4);
  await shot(name);
}
// Buy menu, from a counter so it is open regardless of the spawn window.
await page.evaluate(() => { const st = window.__fb.game.mapDefinition.stations[0]; window.__fb.game.conn.send("dev:teleport", { x: st.x, y: st.y, z: st.z }); });
await page.waitForTimeout(800);
await page.evaluate(() => window.__fb.game.setShopOpen(true));
await page.waitForTimeout(500);
await shot("08-shop-primary");
await page.getByTestId("shop-tab-3").click();
await page.waitForTimeout(300);
await shot("09-shop-grenades");
await page.getByTestId("shop-tab-1").click();
await page.getByTestId("buy-rifle").click().catch(() => {});
await page.waitForTimeout(800);
await page.evaluate(() => window.__fb.game.setShopOpen(false, false));
await fakeLock();
// Let the bots fight for a while so the feed has something in it, then a scoreboard.
await page.waitForTimeout(12_000);
await teleport(-6, 0.05, -5, 0.6, 0.02);
await frames(4);
await shot("10-fight");
await page.keyboard.down("Tab");
await page.waitForTimeout(500);
await shot("11-scoreboard");
await page.keyboard.up("Tab");
// End the match through the dev hook for the result card.
await page.evaluate(() => window.__fb.game.conn.send("dev:endmatch", {}));
await page.waitForFunction(() => window.__fb.hud.get().phase === "ended", null, { timeout: 30_000 });
await page.waitForTimeout(800);
await shot("12-result");
await page.getByTestId("result-tab-table").click();
await page.waitForTimeout(300);
await shot("13-result-table");
await browser.close();
console.log(`written to ${OUT}`);
