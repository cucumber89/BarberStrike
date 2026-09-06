// Drop 3 visual check: every weapon's viewmodel (hip + ADS), the sniper scope, perks + armour on the HUD.
// Needs the dev servers running (`pnpm dev`) and FB_DEV_TOOLS=1 on the server for the wallet top-up.
// Run from apps/client: `OUT=/tmp/shots node e2e/tools/loadout.mjs`.
import { chromium } from "@playwright/test";
const OUT = process.env.OUT ?? "/tmp";
const SETTINGS = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 1, antialiasing: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SETTINGS);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("LOADOUT");
await page.getByTestId("input-room").fill(`loadout-${Date.now()}`);
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 30000 });
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
  document.dispatchEvent(new Event("pointerlockchange"));
});
await page.waitForTimeout(2500);
const send = (t, m) => page.evaluate(([t, m]) => window.__fb.game.conn.send(t, m), [t, m]);
// Face the open side.
await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.yaw += Math.PI / 2; lp.pitch = 0.05; });
const ads = async (on) => { await page.evaluate((on) => { const inp = window.__fb.game.inputState; inp.mouseButtons = on ? 4 : 0; }, on); };
for (const id of (process.env.WEAPONS ? process.env.WEAPONS.split(",") : ["revolver", "smg2", "lmg", "sniper", "launcher"])) {
  await send("dev:money", 9000);
  await page.evaluate((id) => window.__fb.game.buy(id), id);
  await page.waitForFunction((id) => window.__fb.hud.get().weapon === id, id, { timeout: 5000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/d3_${id}_hip.png` });
  await ads(true);
  // SwiftShader runs at ~10 fps: the ADS blend needs a handful of frames, the scoped HUD one more sync.
  await page.waitForTimeout(id === "sniper" ? 2500 : 900);
  await page.screenshot({ path: `${OUT}/d3_${id}_ads.png` });
  await ads(false);
  await page.waitForTimeout(400);
}
// Look pass: inspect (F), sprint pose, wall push.
if (process.env.LOOK) {
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/look_inspect_a.png` });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/look_inspect_b.png` });
  await page.waitForTimeout(1200);
  await page.keyboard.down("KeyW"); await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/look_sprint.png` });
  await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW");
  await page.waitForTimeout(600);
  // Face the brick wall the spawn stands next to (turn back) and walk into it.
  await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.yaw -= Math.PI / 2; lp.pitch = 0; });
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1500); await page.keyboard.up("KeyW");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/look_wall.png` });
  await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.yaw += Math.PI / 2; });
  await page.waitForTimeout(600);
}
await page.keyboard.press("KeyV");
await page.waitForFunction(() => window.__fb.hud.get().weapon === "clippers", null, { timeout: 5000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/d3_clippers.png` });
await page.mouse.down(); await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/d3_clippers_swing.png` }); await page.mouse.up();
await send("dev:money", 9000);
await page.evaluate(() => { const g = window.__fb.game; g.buy("flask"); g.buy("roids"); g.buy("energy"); g.buy("fade"); g.buy("heavy"); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/d3_perks.png` });
await page.keyboard.press("KeyB");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/d3_shop.png` });
await page.evaluate(() => document.querySelector(".shop-card").scrollTo(0, 99999));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/d3_shop_bottom.png` });
console.log(JSON.stringify(await page.evaluate(() => { const h = window.__fb.hud.get(); return { weapon: h.weapon, owned: h.owned, armor: h.armor, perks: h.perks, money: h.money }; })));
await browser.close();
