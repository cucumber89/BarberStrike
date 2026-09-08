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
 * RESOLUTION. The acceptance asks whether a bad haircut reads at 1080p; these are shot at 1280x720,
 * which is the HARDER test rather than a weaker one — fewer pixels on the same head is less to read
 * a clipper track from, so a cut that reads here reads at 1080p. The reason is measured, not
 * preferred: this container has no GPU, ANGLE falls back to SwiftShader, and at 1920x1080 the
 * render loop failed to advance FOUR FRAMES IN SIXTY SECONDS, so a 38-frame set never finished.
 * Judging the fine texture of a head at 1080p on real hardware is still the owner's to do, exactly
 * as the sniper scope is in Drop B.
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

// stdout is a pipe when this runs from a harness, and node buffers a pipe — a run that is merely
// slow then looks identical to one that has hung. Write every line straight through.
const log = (m) => { process.stdout.write(`${m}\n`); };

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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const page = await ctx.newPage();
page.on("pageerror", (e) => log(`PAGEERROR ${e.message}`));

await page.goto(`${HOST}/`);
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("CUTS");
await page.getByTestId("input-room").fill(`cuts-${Date.now()}`);
// TWO bots, in a TEAM mode, so the balancer gives one to each side: the subject has to be a
// TEAMMATE. The first version took one bot in whatever mode the lobby offered, and it shot the
// camera dead before every shutter — three attempts per haircut, all of them a respawn wait, and
// the run produced nothing. A teammate cannot shoot you (no friendly fire in team modes); a second
// enemy bot only adds another gun hunting the camera, so two is the whole room.
await page.getByTestId("bots-range").evaluate((el) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(el, "2"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120000 });
// ENTER MATCH. The client joins with `deferSpawn: true` and does not put you in the world until
// this is clicked (Drop D/I: connect → ready → deploy). Without it the local player is never
// spawned, `hud.alive` is false forever, and every shutter reports a death that never happened —
// which is exactly how this tool failed until the button was found.
await page.getByTestId("enter-game").click({ timeout: 60000 });
await page.waitForFunction(() => window.__fb.hud.get().alive === true, null, { timeout: 60000 });
// Without a pointer lock the client paints the pause card over the scene.
await page.evaluate(() => {
  const c = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true });
  document.dispatchEvent(new Event("pointerlockchange"));
});
await page.waitForFunction(() => {
  const g = window.__fb.game, mine = window.__fb.hud.get().myTeam;
  return [...g.remotes.values()].some((r) => r.team === mine);
}, null, { timeout: 90000 });
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
log(`[cuts] heading picked, ${clear.toFixed(1)} m clear`);

// The catalog, from the client's own shared bundle rather than a list copied into this file: a
// haircut added to `HAIRCUTS` is then photographed without anybody remembering to edit the tool.
const CATALOG = process.env.CUTS
  ? process.env.CUTS.split(",")
  : await page.evaluate(() => {
    const s = window.__fb.shared;
    // Every equippable haircut, then every shave stage (as the field would really carry it).
    return [...s.HAIRCUTS.map((h) => h.id), ...s.SHAVE_STAGES.map((_, i) => `cap#${i + 1}`)];
  });
log(`[cuts] ${CATALOG.length} subjects: ${CATALOG.join(", ")}`);

/** Which subjects get the first-person pair: every shave stage, plus a control at each extreme. */
const FP_SET = new Set(CATALOG.filter((id) => id.includes("#")).concat(["cap", "mohawk"]));

/**
 * Moves the camera to the spot the map's spawn pool offers that is FARTHEST from every living
 * enemy, and holds still there. The subject is posed relative to the camera afterwards, so where
 * the camera stands does not change the picture — only how long it survives to take it, which was
 * the whole failure: an enemy bot walked up and shot the photographer between pose and shutter.
 */
const retreat = () => page.evaluate(() => {
  const g = window.__fb.game, h = window.__fb.hud.get();
  const spawns = [...(g.mapDefinition?.spawns ?? []), ...(g.mapDefinition?.arenaSpawns ?? [])];
  if (!spawns.length) return null;
  const foes = [...(g.conn?.state?.players?.values() ?? [])].filter((p) => p.alive && p.team !== h.myTeam && p.id !== h.myId);
  let best = spawns[0], bestD = -1;
  for (const s of spawns) {
    let d = Infinity;
    for (const f of foes) d = Math.min(d, Math.hypot(s.x - f.x, s.z - f.z));
    if (d > bestD) { bestD = d; best = s; }
  }
  g.conn.send("dev:teleport", { x: best.x, y: best.y, z: best.z });
  return Number.isFinite(bestD) ? Math.round(bestD) : -1;
});

const alive = () => page.evaluate(() => window.__fb.hud.get().alive !== false && (window.__fb.hud.get().health ?? 1) > 0);

/** What the client thinks is going on — printed whenever the subject is missing, never guessed at. */
const diagnose = () => page.evaluate(() => {
  const g = window.__fb.game, h = window.__fb.hud.get();
  return {
    remotes: g.remotes.size, mates: [...g.remotes.values()].filter((r) => r.team === h.myTeam).length,
    players: g.conn?.state?.players?.size ?? -1, phase: h.phase, connected: h.connected, alive: h.alive, health: h.health,
  };
});

/**
 * Waits for a subject to exist. The first version of this tool assumed the one `waitForFunction`
 * before the loop was enough; under a loaded box the page can be starved long enough to lose the
 * room, and every pose after that reported "no bot to pose" with nothing to explain it.
 */
async function subject() {
  const ok = await page.waitForFunction(() => {
    const g = window.__fb.game, mine = window.__fb.hud.get().myTeam;
    return [...g.remotes.values()].some((r) => r.team === mine);
  }, null, { timeout: 45000 }).then(() => true).catch(() => false);
  if (!ok) log(`no subject: ${JSON.stringify(await diagnose())}`);
  return ok;
}

/**
 * Stands the bot at `dist` metres ahead, wearing `haircut`, and holds that pose EVERY frame — the
 * remote's own interpolation would otherwise put it back where the server says it is before the
 * shutter. `turn` is added to the subject's yaw: PI faces us, PI/2 gives the profile.
 */
/**
 * Moves the CAMERA to `dist` metres from the subject and points it at their head, then holds the
 * subject's haircut and facing every frame.
 *
 * The camera moves, not the subject — that is the correction that makes the distances true. Dragging
 * the remote's mesh in front of the camera (Drop A's trick for a frozen weapon pose) does not
 * survive here: the game's own `RemotePlayer.update` writes `root.position` from interpolation on
 * the same frame, so the subject snapped back to wherever the server said it was and a frame
 * labelled "4 m" was shot from whatever range the match happened to put them at. Teleporting the
 * camera uses the server's own position for the subject and cannot be overwritten (`shaved-shots.mjs`
 * does the same, for the same reason).
 */
const pose = async (haircut, dist, turn, aimHigh) => {
  const spot = await page.evaluate(([dist, turn]) => {
    const g = window.__fb.game;
    // A TEAMMATE: an enemy bot shoots the camera between the pose and the shutter.
    const mine = window.__fb.hud.get().myTeam;
    const r = [...g.remotes.values()].find((q) => q.team === mine);
    if (!r) return null;
    const p = g.conn?.state?.players?.get(r.id);
    if (!p) return null;
    // Stand off along whichever horizontal direction has `dist` metres of clear air to the subject,
    // so the shot is not taken through a crate. The subject's own facing is set from `turn`.
    const w = g.world, hit = { hit: false, t: Infinity, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
    let best = null, bestClear = -1;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12, dx = Math.sin(a), dz = Math.cos(a);
      // Two rays, eye height and waist height: a line that is clear at 1.6 m can still have a crate.
      let clear = dist;
      for (const h of [1.5, 0.6]) {
        const rr = w.raycast(p.x + dx * 0.4, p.y + h, p.z + dz * 0.4, dx, 0, dz, dist, hit);
        clear = Math.min(clear, rr.hit ? rr.t : dist);
      }
      if (clear > bestClear) { bestClear = clear; best = { a, dx, dz }; }
    }
    return { x: p.x + best.dx * dist, y: p.y, z: p.z + best.dz * dist, tx: p.x, ty: p.y, tz: p.z, a: best.a, clear: bestClear, id: r.id };
  }, [dist, turn]);
  if (!spot) return null;
  await page.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [spot.x, spot.y, spot.z]);
  await page.waitForTimeout(500);
  return page.evaluate(([haircut, turn, aimHigh, spot]) => {
    const g = window.__fb.game, lp = g.localPlayer, b = lp.body;
    const s = g.currentScene ?? g.scene;
    const r = [...g.remotes.values()].find((q) => q.id === spot.id);
    if (!r) return null;
    // Look at the head, not the feet: the whole subject of these pictures is 1.6 m off the ground.
    const head = spot.ty + (aimHigh ? 1.66 : 1.6);
    lp.yaw = Math.atan2(spot.tx - b.x, spot.tz - b.z);
    lp.pitch = -Math.atan2(head - (b.y + 1.62), Math.hypot(spot.tx - b.x, spot.tz - b.z));
    // revive() ONCE: it restarts the spawn fade (visibility 0 → 1 over a third of a second), so
    // calling it every frame holds the subject at 10 % opacity — measured in Drop A, not guessed.
    r.character.revive();
    const hold = () => {
      // Only the FACING and the haircut are forced; the position is the server's, which is why the
      // camera had to be the thing that moved.
      const face = Math.atan2(b.x - r.character.root.position.x, b.z - r.character.root.position.z) + turn;
      r.yaw = face; r.character.root.rotation.y = face;
      r.character.update({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "pistol", moveDir: 0, haircut }, 16);
    };
    if (window.__cutsPose) s.onBeforeRenderObservable.remove(window.__cutsPose);
    window.__cutsPose = s.onBeforeRenderObservable.add(hold);
    hold(); s.render();
    return { clear: Math.round(spot.clear * 10) / 10 };
  }, [haircut, turn, aimHigh, spot]);
};

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
    if (!(await subject())) continue;
    // Stand somewhere the enemy is not, then re-pick the heading from there.
    const away = await retreat();
    if (away !== null) await page.waitForTimeout(600);
    await page.evaluate(() => {
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
      lp.yaw = best;
    });
    // Third person: close, front and profile. The camera looks slightly UP at 1.1 m so the crown —
    // where a clipper track lives — is in frame rather than foreshortened away.
    for (const [tag, turn, dist, high] of [["front", 0, 1.6, true], ["side", Math.PI / 2, 1.6, true]]) {
      if (!(await pose(id, dist, turn, high))) { log(`no bot to pose: ${JSON.stringify(await diagnose())}`); break; }
      await frames(4);
      if (!(await alive())) { log(`${id}/${tag}: died before the shutter, retrying`); break; }
      await page.screenshot({ path: `${OUT}/tp_${file(id)}_${tag}.png` });
      taken++; done = true;
      log(`tp_${file(id)}_${tag}`);
    }
    // First person: the same head at the distances a fight happens at, level, no zoom, exactly what
    // a player sees. This is the frame the "does it read at 1080p" verdict has to come from — so it
    // is shot for every SHAVED head (the claim under test) plus two equipped cuts as the control,
    // rather than for all thirteen, which is minutes of SwiftShader for pictures nobody judges.
    for (const dist of (FP_SET.has(id) ? [4, 8] : [])) {
      if (!(await pose(id, dist, 0, false))) break;
      await frames(4);
      if (!(await alive())) { log(`${id}/fp${dist}: died before the shutter`); break; }
      await page.screenshot({ path: `${OUT}/fp_${file(id)}_${dist}m.png` });
      taken++;
    }
  }
  if (!done) { skipped++; log(`${id}: no live frame`); }
}

await page.evaluate(() => { const g = window.__fb.game; const s = g.currentScene ?? g.scene; if (window.__cutsPose) s.onBeforeRenderObservable.remove(window.__cutsPose); });
await browser.close();
log(`haircut-shots: ${taken} frames, ${skipped} subjects missed, under ${OUT}/`);
process.exit(skipped > 0 ? 1 : 0);
