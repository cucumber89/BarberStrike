/**
 * Reconnect check: B goes offline for ~2.5 s, must come back into the SAME session (the server
 * keeps the player for its grace period) and must still be able to play.
 *
 * Read the output, not just the exit code: every line is a fact about what the client did. It is
 * written not to throw when a page has no `__fb` — that state is itself the failure this tool
 * exists to catch (a blip that dumped the player to the menu), and a stack trace hides it.
 */
import { chromium } from "@playwright/test";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
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
  // ENTER MATCH. Without it the player is loaded but never spawned, so "can B still play after the
  // reconnect" was measuring a player who had never played: `alive` false and the ack stuck at 0
  // before the outage as well as after it.
  await page.getByTestId("enter-game").click({ timeout: 60000 });
  await page.waitForFunction(() => window.__fb?.hud.get().alive, null, { timeout: 30000 }).catch(() => console.log(`[${name}] never spawned`));
  // The pointer lock the input layer waits for; the tool drives the keyboard, not a real mouse.
  await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
  return { ctx, page };
}
const A = await mk("ALPHA"); const B = await mk("BRAVO");
/** HUD state, or a note saying the harness hook is gone — which means the client left the match. */
const hudOf = (p) => p.evaluate(() => (window.__fb ? { ...window.__fb.hud.get(), _gone: false } : { _gone: true })).catch((e) => ({ _gone: true, _err: e.message.slice(0, 60) }));
const roster = async (p) => { const h = await hudOf(p); return h._gone ? "(left the match)" : h.players.map((q) => `${q.name}:${q.connected}`).join(","); };
const idB = (await hudOf(B.page)).myId;
await A.page.waitForTimeout(1500);
const beforeB = await hudOf(B.page);
console.log("before: A sees", await roster(A.page), "| B alive =", beforeB.alive);
await B.ctx.setOffline(true);
await B.page.waitForTimeout(2500);
const offlineB = await hudOf(B.page);
console.log("offline: B still in the match =", !offlineB._gone, "· reconnecting =", offlineB.reconnecting, "| A sees", await roster(A.page));
await B.ctx.setOffline(false);
await B.page.waitForFunction(() => window.__fb && !window.__fb.hud.get().reconnecting, null, { timeout: 15000 }).catch(() => console.log("B did not finish reconnecting in time"));
await B.page.waitForTimeout(1500);
const afterB = await hudOf(B.page);
console.log("after: same session =", idB === afterB.myId, "| B state:",
  afterB._gone ? "LEFT THE MATCH" : { reconnecting: afterB.reconnecting, players: afterB.players.length, alive: afterB.alive },
  "| A sees", await roster(A.page));
// B can still act: move and check the server acks new inputs.
// The ack is the Connection's own field: it stopped being a replicated one when the server
// started sending it to its owner alone (performance pass, task 5), and this tool never noticed.
const ack0 = await B.page.evaluate(() => window.__fb.game.conn.ack);
await B.page.keyboard.down("KeyW"); await B.page.waitForTimeout(1200); await B.page.keyboard.up("KeyW");
const ack1 = await B.page.evaluate(() => window.__fb.game.conn.ack);
console.log("B inputs acked after reconnect:", ack1 > ack0, ack0, "->", ack1);
await browser.close();
