/**
 * Drop A evidence set (docs/PLAN_2_1.md): for every weapon, idle / ADS / reload mid-frame / inspect
 * in first person, and the held gun in third person, under `e2e/out/weapons/<id>/`. A reviewer agent
 * that did not implement the fix reads these for clipping, floating and hands off the grip.
 *
 * Needs the dev servers (`pnpm dev`, server with FB_DEV_TOOLS=1 for the wallet). SwiftShader runs
 * at ~10 fps, so every wait below is generous on purpose.
 *
 *   OUT=e2e/out/weapons WEAPONS=rifle,smg node e2e/tools/weapon-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const OUT = process.env.OUT ?? "e2e/out/weapons";
const WEAPONS = process.env.WEAPONS ? process.env.WEAPONS.split(",") : ["pistol", "revolver", "smg", "smg2", "rifle", "lmg", "shotgun", "dmr", "sniper", "launcher", "clippers"];
/** TP_ONLY=1 skips the first-person set (the third-person room is the slow, bot-dependent half). */
const TP_ONLY = !!process.env.TP_ONLY;
const FP_ONLY = !!process.env.FP_ONLY;
const RELOAD_MS = { pistol: 1200, revolver: 2300 };
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: false, effects: 0.7, antialiasing: false, importedModels: true } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("SHOTS");
await page.getByTestId("input-room").fill(`shots-${Date.now()}`);
// No bots here: with a match running the shop is tied to the counters, and this loop buys from
// wherever it stands. The third-person subject gets its own room below.
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await page.waitForTimeout(3000);
const frames = async (n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60000 }); };
const send = (t, m) => page.evaluate(([t, m]) => window.__fb.game.conn.send(t, m), [t, m]);
const ads = (on) => page.evaluate((on) => { window.__fb.game.inputState.mouseButtons = on ? 4 : 0; }, on);
// Face the open side, look level.
await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.yaw += Math.PI / 2; lp.pitch = 0.02; });

// Real reload times from the shared WeaponDef table (TS source, so read as text): the 2 s
// default used before caught the LMG (4.5 s) and the shotgun at 18 % of their reload, mag still in.
const weaponsTs = readFileSync(new URL("../../../../packages/shared/src/weapons.ts", import.meta.url), "utf8");
const reloadMs = Object.fromEntries([...weaponsTs.matchAll(/id:\s*"(\w+)"[\s\S]*?reloadMs:\s*(\d+)/g)].map((m) => [m[1], +m[2]]));

for (const id of TP_ONLY ? [] : WEAPONS) {
  const dir = `${OUT}/${id}`;
  mkdirSync(dir, { recursive: true });
  // A bought gun lands in its own slot: sidearms (pistol, revolver) in 2, everything else in 1.
  if (id === "pistol") await page.keyboard.press("Digit2");
  else if (id === "clippers") await page.keyboard.press("Digit3");
  else {
    await send("dev:money", 9000);
    await page.evaluate((w) => window.__fb.game.buy(w), id);
    await page.waitForFunction((w) => window.__fb.hud.get().weapon === w, id, { timeout: 8000 }).catch(() => {});
    await page.keyboard.press(id === "revolver" ? "Digit2" : "Digit1");
  }
  await page.waitForFunction((w) => window.__fb.hud.get().weapon === w, id, { timeout: 8000 }).catch(() => console.log(`${id}: not equipped`));
  await page.waitForTimeout(1200); await frames(6);
  await page.screenshot({ path: `${dir}/fp_idle.png` });

  await ads(true);
  await page.waitForTimeout(id === "sniper" ? 2500 : 1500); await frames(6);
  await page.screenshot({ path: `${dir}/fp_ads.png` });
  await ads(false);
  await page.waitForTimeout(800);

  if (id !== "clippers") {
    // Fire one round so a reload is allowed (through the input state — a synthetic mouse event
    // does not reach the locked canvas), then catch the reload at ~40 % (magazine out, hand down).
    await page.evaluate(() => { window.__fb.game.inputState.mouseButtons = 1; });
    await frames(3);
    await page.evaluate(() => { window.__fb.game.inputState.mouseButtons = 0; });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__fb.game.inputState.reloadRequested = true; });
    const started = await page.waitForFunction(() => window.__fb.hud.get().reloading, null, { timeout: 4000 }).then(() => true).catch(() => false);
    if (!started) console.log(`${id}: reload did not start`);
    const ms = reloadMs[id] ?? RELOAD_MS[id] ?? 2000;
    // 45 % in: every timeline has the magazine fully out (or the cylinder open) by then.
    await page.waitForTimeout(Math.max(250, ms * 0.45 - 150));
    await page.screenshot({ path: `${dir}/fp_reload_mid.png` });
    // Inspect refuses to start while a reload runs, so wait for the HUD to drop RELOADING rather
    // than for a guessed duration (six inspect frames were the idle pose because of that guess).
    await page.waitForFunction(() => !window.__fb.hud.get().reloading, null, { timeout: 8000 }).catch(() => {});
    // The viewmodel's own reload timeline outlives the HUD flag, and a shell-by-shell reload
    // toggles the flag between shells; at 10 fps the only robust wait is longer than any reload.
    await page.waitForTimeout(5000); await frames(4);
  }

  await page.keyboard.press("KeyF");
  await page.waitForTimeout(900); await frames(3);
  await page.screenshot({ path: `${dir}/fp_inspect.png` });
  await page.waitForTimeout(1800);
}

// ---- third person: a second room with one bot, frozen in its idle pose with each weapon.
if (FP_ONLY) { await browser.close(); console.log(`weapon-shots: first person only, ${WEAPONS.length} weapons under ${OUT}/<id>/`); process.exit(0); }
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("SHOTS");
await page.getByTestId("input-room").fill(`shots-tp-${Date.now()}`);
await page.getByTestId("bots-range").evaluate((el) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, "1"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await page.waitForFunction(() => window.__fb.game.remotes.size > 0, null, { timeout: 30000 });
await page.waitForTimeout(3000);
// Face open ground: the bot is posed 2.2 m ahead of the camera, and a spawn that faces a wall put
// it inside the wall (art review round 4: "no bot in frame"). Try eight headings and keep the one
// with the longest clear line, using the game's OWN collision world — `pickWithRay` needs Babylon's
// Ray, whose side-effect import the game bundle does not carry.
await page.evaluate(() => {
  const g = window.__fb.game; const lp = g.localPlayer; const w = g.world;
  const hit = { hit: false, t: Infinity, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const eye = lp.camera.globalPosition ?? lp.camera.position;
  let best = lp.yaw, bestD = -1;
  for (let i = 0; i < 16; i++) {
    const yaw = (i * Math.PI) / 8;
    const r = w.raycast(eye.x, eye.y, eye.z, Math.sin(yaw), 0, Math.cos(yaw), 12, hit);
    const d = r.hit ? r.t : 12;
    if (d > bestD) { bestD = d; best = yaw; }
  }
  lp.yaw = best; lp.pitch = 0.05;
  console.log(`[shots] heading ${(best * 180 / Math.PI).toFixed(0)}deg, ${bestD.toFixed(1)} m clear`);
});

// The bot is hostile and will kill us; a dead camera shows the death screen, not the gun. So only
// shoot while alive, and after a death wait for the respawn first.
const alive = () => page.evaluate(() => window.__fb.hud.get().alive !== false && (window.__fb.hud.get().health ?? 1) > 0);
for (const id of WEAPONS) {
  mkdirSync(`${OUT}/${id}`, { recursive: true });
  let shot = false;
  for (let attempt = 0; attempt < 4 && !shot; attempt++) {
  if (!(await alive())) { await page.waitForFunction(() => window.__fb.hud.get().alive !== false && (window.__fb.hud.get().hp ?? window.__fb.hud.get().health ?? 1) > 0, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(800); }
  await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.pitch = 0.05; });
  for (const [tag, turn] of [["tp_idle", Math.PI], ["tp_side", Math.PI / 2]]) {
  const ok = await page.evaluate(([id, turn]) => {
    const g = window.__fb.game;
    const r = [...g.remotes.values()][0];
    if (!r) return false;
    const s = g.currentScene ?? g.scene;
    const lp = g.localPlayer;
    // Stand the bot 2.2 m in front of us, facing us, and hold that pose EVERY frame: the remote's
    // own interpolation would otherwise put it back where the server says it is before the
    // screenshot is taken.
    const yaw = lp.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const eye = lp.camera.globalPosition ?? lp.camera.position;
    // revive() ONCE: it restarts the spawn fade-in (visibility 0 → 1 over a third of a second),
    // so calling it every frame kept the bot at 10 % visibility — measured, not guessed.
    r.character.revive();
    const pose = () => {
      r.character.root.position.set(eye.x + fx * 2.2, eye.y - 1.62, eye.z + fz * 2.2);
      r.yaw = yaw + turn; r.character.root.rotation.y = yaw + turn;
      r.weapon = id;
      r.character.update({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: id, moveDir: 0 }, 16);
    };
    if (window.__shotsPose) s.onBeforeRenderObservable.remove(window.__shotsPose);
    window.__shotsPose = s.onBeforeRenderObservable.add(pose);
    for (let i = 0; i < 30; i++) { pose(); s.render(); }
    return true;
  }, [id, turn]);
  if (!ok) { console.log("no bot to pose"); break; }
  await frames(4);
  if (!(await alive())) break;
  // Facing us for the hands and the silhouette; in profile for the bore and the fore-end.
  await page.screenshot({ path: `${OUT}/${id}/${tag}.png` });
  // The bot shoots at our server position; a kill between the check and the shutter leaves the
  // death overlay in the frame. Re-check and let the attempt loop take it again.
  if (!(await alive())) break;
  if (tag === "tp_side") shot = true;
  }
  }
  if (!shot) console.log(`${id}: no live third-person frame`);
}
await browser.close();
console.log(`weapon-shots: ${WEAPONS.length} weapons under ${OUT}/<id>/ (fp_idle, fp_ads, fp_reload_mid, fp_inspect, tp_idle, tp_side)`);
