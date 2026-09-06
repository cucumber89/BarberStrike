import { chromium } from "@playwright/test";
import fs from "node:fs";
const OUT = process.env.SHOT_DIR || "/tmp/claude-0/-home-user-sidequest/1d2f80ee-f8c5-5282-b5fc-eb567dff361c/scratchpad/shots";
fs.mkdirSync(OUT, { recursive: true });
const MED = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true } });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), MED);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text()); });
await page.goto("http://localhost:5174/");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/01-menu.png` });
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("FRANKI");
await page.getByTestId("input-room").fill("shots-" + Date.now());
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/02-lobby.png` });
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 60000 });
await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
const frames = async (n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120000 }); };
const views = [
  ["10-backlot", -20, 0.05, 12, 0.5, 0.0],
  ["11-street-south", -12, 0.2, -18, 0.1, 0.0],
  ["12-carpark", 24, 0.05, 9, Math.PI + 0.6, 0.0],
  ["13-yard-north", -2, 0.05, 32, 0.0, 0.0],
  ["14-gantry", 21, 3.05, 11.6, Math.PI * 0.55, 0.15],
  ["15-compound", 12, 0.05, 41, Math.PI * 0.75, 0.0],
  ["03-street", -6, 0.05, -5, 0.6, 0.02],
  ["04-shop", 2, 0.05, 1.2, 0.3, 0.05],
  ["05-shop-back", 5, 0.05, 8.5, Math.PI + 0.5, 0.05],
  ["06-hall", 0, 0.05, 11, 0.4, 0.0],
  ["07-courtyard", 2, 0.05, 19.5, 0.0, 0.0],
  ["08-alley", -9, 0.05, 1, 0.1, 0.0],
  ["09-storage", 12, 0.05, 15, 1.2, -0.1],
];
for (const [name, x, y, z, yaw, pitch] of views) {
  await page.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [x, y, z]);
  await page.waitForTimeout(500);
  await page.evaluate(([yaw, pitch]) => { window.__fb.game.localPlayer.yaw = yaw; window.__fb.game.localPlayer.pitch = pitch; }, [yaw, pitch]);
  await frames(3);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name, await page.evaluate(() => { const b = window.__fb.game.localPlayer.body; return [b.x.toFixed(1), b.y.toFixed(2), b.z.toFixed(1)].join(","); }));
}
const stats = await page.evaluate(() => { const s = window.__fb.game.currentScene; return { meshes: s.meshes.length, active: s.getActiveMeshes().length, materials: s.materials.length, lights: s.lights.length, textures: s.textures.length, drawCalls: s.getEngine()._drawCalls?.current ?? "n/a" }; });
console.log("stats", JSON.stringify(stats));
await browser.close();
