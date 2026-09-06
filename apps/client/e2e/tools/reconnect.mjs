// Reconnect check: B goes offline for ~2.5 s (socket drops with 1006), must come back into the
// SAME session (server keeps the player for RECONNECT_GRACE_S) and keep playing.
import { chromium } from "@playwright/test";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false } });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const room = "reconnect-" + Date.now();
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto("http://localhost:5174/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(room);
  await page.getByTestId("btn-quickplay").click();
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 60000 });
  return { ctx, page };
}
const A = await mk("ALPHA"); const B = await mk("BRAVO");
const idB = await B.page.evaluate(() => window.__fb.hud.get().myId);
await A.page.waitForTimeout(1500);
console.log("before: A sees", await A.page.evaluate(() => window.__fb.hud.get().players.map((p) => `${p.name}:${p.connected}`).join(",")));
await B.ctx.setOffline(true);
await B.page.waitForTimeout(2500);
console.log("offline: B reconnecting flag =", await B.page.evaluate(() => window.__fb.hud.get().reconnecting), "| A sees", await A.page.evaluate(() => window.__fb.hud.get().players.map((p) => `${p.name}:${p.connected}`).join(",")));
await B.ctx.setOffline(false);
await B.page.waitForFunction(() => !window.__fb.hud.get().reconnecting && window.__fb.hud.get().connected, null, { timeout: 15000 }).catch(() => console.log("B did not finish reconnecting in time"));
await B.page.waitForTimeout(1500);
const idB2 = await B.page.evaluate(() => window.__fb.hud.get().myId);
console.log("after: same session =", idB === idB2, "| B state:", await B.page.evaluate(() => ({ reconnecting: window.__fb.hud.get().reconnecting, players: window.__fb.hud.get().players.length, alive: window.__fb.hud.get().alive })), "| A sees", await A.page.evaluate(() => window.__fb.hud.get().players.map((p) => `${p.name}:${p.connected}`).join(",")));
// B can still act: move and check the server acks new inputs.
await B.page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
const ack0 = await B.page.evaluate(() => window.__fb.game.conn.me().ack);
await B.page.keyboard.down("KeyW"); await B.page.waitForTimeout(1200); await B.page.keyboard.up("KeyW");
const ack1 = await B.page.evaluate(() => window.__fb.game.conn.me().ack);
console.log("B inputs acked after reconnect:", ack1 > ack0, ack0, "->", ack1);
await browser.close();
