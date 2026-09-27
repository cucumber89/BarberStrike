import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * The dance (H) in a real match: two browsers in one room. A owns Spucha and has it on H; A presses
 * H and the tool photographs A's own screen (the camera out behind the body) and B's (A's body
 * dancing, seen from the front), then A takes a step and both are photographed again (dance over).
 * Needs the client dev server (:5174) and the game server (:2567). Output: e2e/out/emotes/live-*.png
 * and live.json with the numbers the claims rest on.
 */
const out = fileURLToPath(new URL("../out/emotes/", import.meta.url));
await mkdir(out, { recursive: true });
const URL_ = process.env.CLIENT_URL ?? "http://localhost:5174";
const EMOTE = process.env.EMOTE ?? "spucha";
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const SET = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 1, antialiasing: false } });
const room = `emote-${Date.now().toString(36)}`;
const errors = [];
async function player(name, profile) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
  await ctx.addInitScript(([s, p]) => { localStorage.setItem("fb_settings_v1", s); if (p) localStorage.setItem("bs_profile_v1", p); sessionStorage.setItem("bs_guest_ok", "1"); localStorage.setItem("bs_onboard_v1", JSON.stringify({ welcomed: true })); }, [SET, profile]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(URL_);
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(room);
  await page.getByTestId("btn-quickplay").click();
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120000 });
  const enter = page.getByTestId("enter-game");
  if (await enter.isVisible().catch(() => false)) await enter.click();
  else await enter.click({ timeout: 20000 }).catch(() => { /* this build lets you straight in */ });
  await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
  return page;
}
const frames = async (page, n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120000 }); };
const evidence = {};
try {
  const a = await player("TANCERZ", JSON.stringify({ emotes: [EMOTE], emote: EMOTE }));
  const b = await player("WIDZ");
  for (let i = 0; i < 12; i++) {
    const st = await a.evaluate(() => { const h = window.__fb.hud.get(); const me = window.__fb.game.conn.me(); return { alive: h.alive, phase: h.phase, meAlive: me?.alive, frames: window.__fb.game.frameCount }; });
    console.log("A", JSON.stringify(st));
    if (st.meAlive && st.phase === "playing") break;
    await a.waitForTimeout(5000);
  }
  await a.waitForTimeout(1500);
  // Put the two face to face in the open (the spot `faceoff.mjs` uses): A at z 20, B four metres on.
  const tp = async (p, x, y, z) => { await p.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [x, y, z]); await p.waitForTimeout(800); };
  await tp(a, 6, 0.05, 20); await tp(b, 6, 0.05, 24);
  await a.evaluate(() => { const l = window.__fb.game.localPlayer; l.yaw = Math.PI; l.pitch = 0.1; });
  await a.waitForTimeout(600);
  const pa = await a.evaluate(() => { const l = window.__fb.game.localPlayer; return { x: l.body.x, y: l.body.y, z: l.body.z, yaw: l.yaw }; });
  // Face A from wherever the teleport actually landed (a wall can refuse the exact spot).
  await b.evaluate(([ax, az]) => { const l = window.__fb.game.localPlayer; l.yaw = Math.atan2(ax - l.body.x, az - l.body.z); l.pitch = 0.12; }, [pa.x, pa.z]);
  evidence.distance = await b.evaluate(([ax, az]) => { const b = window.__fb.game.localPlayer.body; return +Math.hypot(ax - b.x, az - b.z).toFixed(2); }, [pa.x, pa.z]);
  await a.keyboard.press("h");
  await a.waitForTimeout(2500);
  await frames(a, 3); await frames(b, 3);
  evidence.dancing = {
    hudTag: await a.evaluate(() => window.__fb.hud.get().emote),
    camera: await a.evaluate(() => window.__fb.game.localPlayer.emoteCamera),
    seenByB: await b.evaluate(() => [...window.__fb.game.remotePlayers.values()].map((r) => ({ name: r.name, emote: r.emote, dancing: r.character.dancing }))),
  };
  await a.screenshot({ path: `${out}/live-a-dancing.png` });
  await b.screenshot({ path: `${out}/live-b-sees-dance.png` });
  // A step ends it on both screens.
  await a.keyboard.down("w"); await a.waitForTimeout(400); await a.keyboard.up("w");
  await a.waitForTimeout(1500);
  evidence.afterStep = {
    hudTag: await a.evaluate(() => window.__fb.hud.get().emote),
    camera: await a.evaluate(() => window.__fb.game.localPlayer.emoteCamera),
    seenByB: await b.evaluate(() => [...window.__fb.game.remotePlayers.values()].map((r) => ({ name: r.name, emote: r.emote, dancing: r.character.dancing }))),
  };
  await a.screenshot({ path: `${out}/live-a-after-step.png` });
} finally {
  evidence.errors = errors;
  await writeFile(`${out}/live.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
console.log(JSON.stringify(evidence, null, 2));
