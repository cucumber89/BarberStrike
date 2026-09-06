/**
 * Drop 6b stills: the imported gun in the hands, and imported characters in the world.
 * Pointer lock is faked, or every shot is of the pause overlay instead of the game.
 */
import { chromium } from "@playwright/test";
const SET = JSON.stringify({ graphics: { preset: "high", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: true, effects: 0.8, antialiasing: true, importedModels: true } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const p = await ctx.newPage();
await p.goto("http://localhost:5174/");
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("SHOTS");
await p.getByTestId("input-room").fill("shots-" + Date.now());
await p.getByTestId("bots-range").evaluate((el) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, "3"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await p.getByTestId("btn-quickplay").click();
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
// The game pauses without pointer lock, so pretend the canvas holds it AND tell it so.
await p.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await p.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
await p.waitForTimeout(6000);

const frames = async (n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60000 }); };
const SLOT = { pistol: "Digit1", smg: "Digit2", rifle: "Digit3", shotgun: "Digit4", dmr: "Digit5" };
const shot = async (name, weapon, x, y, z, yaw, pitch, lineUpBots) => {
  if (weapon && SLOT[weapon]) {
    await p.keyboard.press(SLOT[weapon]);
    await p.waitForFunction((w) => window.__fb.hud.get().weapon === w, weapon, { timeout: 5000 }).catch(() => console.log("  (no", weapon, "in loadout)"));
  }
  await p.evaluate(([w, x, y, z, yaw, pitch, line]) => {
    const g = window.__fb.game;
    g.conn.send("dev:teleport", { x, y, z });
    g.localPlayer.yaw = yaw; g.localPlayer.pitch = pitch;
    void w;
    if (line) {
      let i = 0;
      for (const r of g.remotes.values()) {
        r.x = x + Math.sin(yaw) * 3.2 + (i - 1) * 1.1 * Math.cos(yaw);
        r.z = z + Math.cos(yaw) * 3.2 - (i - 1) * 1.1 * Math.sin(yaw);
        r.y = y; r.yaw = yaw + Math.PI;
        r.character.root.position.set(r.x, r.y, r.z);
        r.character.root.rotation.y = r.yaw;
        i++;
      }
    }
  }, [weapon, x, y, z, yaw, pitch, lineUpBots]);
  await frames(6);
  await p.screenshot({ path: `e2e/out/d6b-${name}.png` });
  console.log("shot", name);
};

await shot("gun-pistol", "pistol", 2, 0.05, 1.2, 0.3, 0.02, false);
await shot("gun-rifle", "rifle", 2, 0.05, 1.2, 0.3, 0.02, false);
await shot("gun-dmr", "dmr", -6, 0.05, -5, 0.6, 0.0, false);
await shot("players", "rifle", 0, 0.05, 11, 0.0, 0.02, true);
await shot("street", "smg", -6, 0.05, -5, 0.6, 0.02, true);
await shot("shop", "pistol", 2, 0.05, 5, -Math.PI / 2, 0.05, true);
await b.close();
