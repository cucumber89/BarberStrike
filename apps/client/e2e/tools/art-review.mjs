import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Run with the dev servers and FB_DEV_TOOLS=1. No external assets are needed.
const out = path.resolve(process.env.SHOT_DIR || "art-review");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => { errors.push(e.message); console.log("pageerror", e.message); });
  await page.addInitScript(() => {
    localStorage.setItem("fb_settings_v1", JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.8, importedModels: false, dynamicResolution: false, shadows: "off", postProcessing: false } }));
    localStorage.setItem("fb_bots", "0");
  });
  await page.goto(process.env.PW_BASE_URL || "http://localhost:5174");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill("ART REVIEW");
  await page.getByTestId("input-room").fill(`art-${Date.now()}`);
  await page.getByTestId("btn-quickplay").click();
  console.log("joining review room");
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120000 });
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  const shot = async (name, x, y, z, yaw, pitch = 0) => {
    await page.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [x, y, z]);
    await page.waitForTimeout(600);
    await page.evaluate(([yaw, pitch]) => { const p = window.__fb.game.localPlayer; p.yaw = yaw; p.pitch = pitch; }, [yaw, pitch]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log("shot", name);
  };
  await shot("market", -21, 0.05, -12, 0.45);
  await shot("lookout", -11, 0.05, 33, 2.0, -0.12);
  await shot("repair-bay", -20, 0.05, 3, 0, -0.1);
  await shot("shop-front", 2, 0.05, -5.3, 0, -0.16);
  await shot("shop-interior", 3.8, 0.05, 7, -1.9, 0.08);
  // Stage both team bodies using the exact in-game builder, lit by the actual map.
  await page.evaluate(async () => {
    const { Character } = await import("/src/game/view/Character.ts");
    const scene = window.__fb.game.currentScene;
    for (const team of [0, 1]) {
      const c = new Character(scene, team, `review-${team}`);
      c.root.position.set(team ? 3.1 : 1.7, 0.15, -4);
      c.root.rotation.y = Math.PI;
      c.update({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: team ? "smg" : "rifle", moveDir: 0 }, 16);
    }
  });
  await shot("characters", 2.4, 0.05, -7.2, 0, 0.12);
  await page.evaluate(() => window.__fb.game.conn.send("dev:money", 10000));
  await page.waitForFunction(() => window.__fb.hud.get().money >= 10000);
  await page.evaluate(() => window.__fb.game.buy("rifle"));
  await page.waitForFunction(() => window.__fb.hud.get().owned.includes("rifle"));
  await page.keyboard.press("Digit1");
  await page.waitForFunction(() => window.__fb.hud.get().weapon === "rifle");
  await shot("rifle", 2, 0.05, 1.2, 0.3, 0.03);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "rifle-ads.png") });
  await page.mouse.up({ button: "right" });
  console.log(JSON.stringify({ errors, output: out }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
