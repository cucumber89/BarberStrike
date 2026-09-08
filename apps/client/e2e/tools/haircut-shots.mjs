/**
 * Drop E evidence set (docs/PLAN_2_1.md): the shave and the haircut catalog, photographed for an art
 * reviewer that did not implement them.
 *
 * WHAT "FIRST PERSON" MEANS HERE. The local player has no visible head — `Character` is constructed
 * only for REMOTE players (`RemotePlayer.ts`), the viewmodel is hands and a gun, and there is no
 * mirror and no third-person camera. So a player never sees their own haircut, and "first person"
 * can only honestly mean THE VIEW A PLAYER HAS OF SOMEBODY ELSE'S HEAD: through their own eyes, at
 * the distances a fight actually happens at. That is also the view the drop has to survive — a bad
 * haircut that only reads from 60 cm is not a mechanic, it is a texture.
 *
 *   fp_<id>_4m.png / fp_<id>_8m.png   the head at gameplay distance, through the camera
 *   tp_<id>_front.png / tp_<id>_side.png   the character close up, front and profile
 *
 * Shot at 1920x1080 because that is what the acceptance asks the reviewer to judge at.
 *
 * Needs the dev servers up (`pnpm dev`, or the built-client single-port path in README-drop-d.md),
 * and one bot to stand in as the subject. SwiftShader runs at ~10 fps, so every wait is generous.
 *
 *   node apps/client/e2e/tools/haircut-shots.mjs
 *   OUT=/tmp/cuts HOST_URL=http://localhost:2601 CUTS=cap#1,cap#4,mohawk node .../haircut-shots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to THIS tool, not to the shell's cwd: run from the repo root and a bare "e2e/out" lands
// outside the ignored directory and shows up as untracked files (Drop A learned this).
const OUT = process.env.OUT ? resolve(process.env.OUT) : resolve(dirname(fileURLToPath(import.meta.url)), "../out/haircuts");
const HOST = process.env.HOST_URL || "http://localhost:5174";
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: false, effects: 0.7, antialiasing: false, importedModels: true } });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

await page.goto(`${HOST}/`);
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("CUTS");
await page.getByTestId("input-room").fill(`cuts-${Date.now()}`);
await page.getByTestId("bots-range").evaluate((el) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(el, "1"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
// Without a pointer lock the client paints the pause card over the scene.
await page.evaluate(() => {
  const c = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true });
  document.dispatchEvent(new Event("pointerlockchange"));
});
await page.waitForFunction(() => window.__fb.game.remotes.size > 0, null, { timeout: 60000 });
await page.waitForTimeout(3000);

const frames = async (n) => { const s = await page.evaluate(() => window.__fb.game.frameCount); await page.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60000 }); };

// Face the longest clear line, using the game's own collision world: a spawn facing a wall put the
// posed subject inside the wall in Drop A's harness, and a head inside a wall photographs as black.
const clear = await page.evaluate(() => {
  const g = window.__fb.game, lp = g.localPlayer, w = g.world;
  const hit = { hit: false, t: Infinity, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const eye = lp.camera.globalPosition ?? lp.camera.position;
  let best = lp.yaw, bestD = -1;
  for (let i = 0; i < 16; i++) {
    const yaw = (i * Math.PI) / 8;
    const r = w.raycast(eye.x, eye.y, eye.z, Math.sin(yaw), 0, Math.cos(yaw), 14, hit);
    const d = r.hit ? r.t : 14;
    if (d > bestD) { bestD = d; best = yaw; }
  }
  lp.yaw = best; lp.pitch = 0;
  return bestD;
});
console.log(`[cuts] heading picked, ${clear.toFixed(1)} m clear`);

// The catalog, from the client's own shared bundle rather than a list copied into this file: a
// haircut added to `HAIRCUTS` is then photographed without anybody remembering to edit the tool.
const CATALOG = process.env.CUTS
  ? process.env.CUTS.split(",")
  : await page.evaluate(() => {
    const s = window.__fb.shared;
    // Every equippable haircut, then every shave stage (as the field would really carry it).
    return [...s.HAIRCUTS.map((h) => h.id), ...s.SHAVE_STAGES.map((_, i) => `cap#${i + 1}`)];
  });
console.log(`[cuts] ${CATALOG.length}: ${CATALOG.join(", ")}`);

const alive = () => page.evaluate(() => window.__fb.hud.get().alive !== false && (window.__fb.hud.get().health ?? 1) > 0);

/**
 * Stands the bot at `dist` metres ahead, wearing `haircut`, and holds that pose EVERY frame — the
 * remote's own interpolation would otherwise put it back where the server says it is before the
 * shutter. `turn` is added to the subject's yaw: PI faces us, PI/2 gives the profile.
 */
const pose = (haircut, dist, turn, pitch) => page.evaluate(([haircut, dist, turn, pitch]) => {
  const g = window.__fb.game;
  const r = [...g.remotes.values()][0];
  if (!r) return null;
  const s = g.currentScene ?? g.scene;
  const lp = g.localPlayer;
  lp.pitch = pitch;
  const yaw = lp.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const eye = lp.camera.globalPosition ?? lp.camera.position;
  // revive() ONCE: it restarts the spawn fade (visibility 0 → 1 over a third of a second), so
  // calling it every frame holds the subject at 10 % opacity — measured in Drop A, not guessed.
  r.character.revive();
  const hold = () => {
    r.character.root.position.set(eye.x + fx * dist, eye.y - 1.62, eye.z + fz * dist);
    r.yaw = yaw + turn; r.character.root.rotation.y = yaw + turn;
    r.character.update({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "pistol", moveDir: 0, haircut }, 16);
  };
  if (window.__cutsPose) s.onBeforeRenderObservable.remove(window.__cutsPose);
  window.__cutsPose = s.onBeforeRenderObservable.add(hold);
  for (let i = 0; i < 30; i++) { hold(); s.render(); }
  return r.character.currentHaircut ?? haircut;
}, [haircut, dist, turn, pitch]);

const file = (id) => id.replace("#", "-x");
let taken = 0, skipped = 0;

for (const id of CATALOG) {
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    // The bot is hostile and shoots; a dead camera photographs the death screen, not a head.
    if (!(await alive())) {
      await page.waitForFunction(() => window.__fb.hud.get().alive !== false && (window.__fb.hud.get().health ?? 1) > 0, null, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    // Third person: close, front and profile. The camera looks slightly UP at 1.1 m so the crown —
    // where a clipper track lives — is in frame rather than foreshortened away.
    for (const [tag, turn, dist, pitch] of [["front", Math.PI, 1.1, -0.16], ["side", Math.PI / 2, 1.1, -0.16]]) {
      if (!(await pose(id, dist, turn, pitch))) { console.log("no bot to pose"); break; }
      await frames(4);
      if (!(await alive())) break;
      await page.screenshot({ path: `${OUT}/tp_${file(id)}_${tag}.png` });
      taken++;
    }
    // First person: the same head at the distances a fight happens at, level, no zoom, exactly what
    // a player sees. This is the frame the "does it read at 1080p" verdict has to come from.
    for (const dist of [4, 8]) {
      if (!(await pose(id, dist, Math.PI, 0.02))) break;
      await frames(4);
      if (!(await alive())) break;
      await page.screenshot({ path: `${OUT}/fp_${file(id)}_${dist}m.png` });
      taken++;
      done = true;
    }
  }
  if (!done) { skipped++; console.log(`${id}: no live frame`); }
}

await page.evaluate(() => { const g = window.__fb.game; const s = g.currentScene ?? g.scene; if (window.__cutsPose) s.onBeforeRenderObservable.remove(window.__cutsPose); });
await browser.close();
console.log(`haircut-shots: ${taken} frames, ${skipped} subjects missed, under ${OUT}/`);
process.exit(skipped > 0 ? 1 : 0);
