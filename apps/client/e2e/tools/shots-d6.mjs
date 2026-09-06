/** Drop 6 stills: the barber pole by the shop door and a van close up. Dev servers running; OUT=<dir> PW_CHROMIUM=<chromium>. */
import { chromium } from "@playwright/test";
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const p = await ctx.newPage();
await p.goto("http://localhost:5174/");
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("POLE");
await p.getByTestId("input-room").fill("pole-" + Date.now());
await p.getByTestId("btn-quickplay").click();
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
const frames = async (n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120000 }); };
await frames(5);
await p.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await frames(2);
for (const [name, x, y, z, yaw, pitch] of [["pole", -0.6, 0.05, -4.6, 0.0, -0.32], ["van", 4.5, 0.05, -9.5, 2.6, 0.05]]) {
  await p.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [x, y, z]);
  await p.waitForTimeout(400);
  await p.evaluate(([yaw, pitch]) => { window.__fb.game.localPlayer.yaw = yaw; window.__fb.game.localPlayer.pitch = pitch; }, [yaw, pitch]);
  await frames(4);
  await p.screenshot({ path: `${process.env.OUT}/d6_${name}.png` });
}
await b.close();
