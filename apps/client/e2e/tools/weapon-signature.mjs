// Drop B: the weapon signature, measured in a real client.
//
// For every weapon this fires through the actual WeaponController, samples the actual camera, and
// renders the actual audio graph, then writes one JSON per weapon under e2e/out/signature/ plus a
// summary table. The claim it exists to support is the one in docs/WEAPON_MATRIX.md: "a player who
// fires each weapon at a wall can name it from the feel alone".
//
// What it measures honestly, and what it does NOT:
//   - per-shot kick, ADS blend, sway response, audio peak and length: measured here.
//   - the SHAPE of a burst is deterministic (`recoilStep` is a pure function of the pattern and the
//     shot index) and is asserted in weaponFeel.test.ts, not re-measured at 10 fps.
//   - cadence cannot be measured under SwiftShader: the client fires at most once per frame, so a
//     1000 rpm weapon is frame-limited long before it is weapon-limited. The tool records what it
//     saw, what the rpm says, and marks the row `frameLimited` when the renderer was the bottleneck.
//   - nothing here judges how the scope LOOKS. That needs a real GPU and the owner's eyes.
//
// Needs the dev servers (`pnpm --filter @frankibarber/server dev` with FB_DEV_TOOLS=1 and
// `pnpm --filter @frankibarber/client dev`) and Chromium.
// Run from apps/client: `node e2e/tools/weapon-signature.mjs`
import { chromium } from "@playwright/test";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const OUT = process.env.OUT ?? "e2e/out/signature";
const WEAPONS_ARG = process.env.WEAPONS?.split(",");
const SETTINGS = JSON.stringify({
  graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 1, antialiasing: false },
  // The measurements must not be scaled by a user preference that happens to be in localStorage.
  // These are the real keys (`settings.ts`): cameraShake and headBob feed the shake and bob scales.
  gameplay: { sensitivity: 1, invertY: false, fov: 90, headBob: 0, cameraShake: 1 },
});

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => {
  localStorage.setItem("fb_settings_v1", v);
  // A room with one human never leaves `waiting`, so the body never spawns and there is nothing to
  // fire. Two bots start the match; the menu reads this key when quick play creates the room.
  localStorage.setItem("fb_bots", "2");
  localStorage.setItem("fb_botlevel", "easy");
}, SETTINGS);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });

await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("SIGNATURE");
await page.getByTestId("input-room").fill(`sig-${Date.now()}`);
await page.getByTestId("btn-quickplay").click();
// The lobby does not put a body in the world until this is clicked; without it the player stays a
// spectator with full health who never spawns, which is a very convincing way to measure nothing.
await page.getByTestId("enter-game").click({ timeout: 60000 });
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 30000 });
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
  document.dispatchEvent(new Event("pointerlockchange"));
});
await page.waitForTimeout(2500);

// Face the open side of the spawn so shots fly into the room rather than into a wall 30 cm away.
await page.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.yaw += Math.PI / 2; lp.pitch = 0; });

const send = (t, m) => page.evaluate(([t, m]) => window.__fb.game.conn.send(t, m), [t, m]);

/** Frames per second right now: everything below is quoted against it, because it bounds it. */
const measureFps = () => page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => { if (++n < 30) requestAnimationFrame(tick); else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(tick);
}));

/** Audio is rendered offline, so it is the one axis SwiftShader cannot degrade. */
const audio = await page.evaluate(async () => {
  const report = await window.__fbAudio.selfTest();
  const out = {};
  for (const r of report.offline ?? []) {
    const m = /^gunshot:([a-z0-9]+)$/.exec(r.name);
    if (m) out[m[1]] = { peakDb: r.peakDb, seconds: Math.round(r.seconds * 1000) / 1000 };
  }
  return out;
});

const ids = WEAPONS_ARG ?? await page.evaluate(() => window.__fb.shared?.WEAPON_ORDER ?? ["pistol", "revolver", "smg", "smg2", "rifle", "lmg", "shotgun", "dmr", "sniper", "launcher", "clippers"]);
const fps = await measureFps();
console.log(`renderer: ~${fps} fps (SwiftShader). Cadence rows are frame-limited above ${(fps / 2).toFixed(1)} shots/s.`);

/**
 * Nothing below means anything while the player is dead or inside a frozen preparation window: the
 * camera does not update, the trigger is refused and the shop is shut. Every measurement waits for
 * a live body first, which is also why the tool survives a match rolling over underneath it.
 */
const waitLive = () => page.waitForFunction(() => {
  const lp = window.__fb?.game?.localPlayer;
  return !!lp && lp.alive && !lp.frozen;
}, null, { timeout: 90000 });

const rows = [];
for (const id of ids) {
  await waitLive();
  // The buy window can be shut when we arrive; try until it opens rather than failing the run.
  let equipped = false;
  for (let attempt = 0; attempt < 12 && !equipped; attempt++) {
    await waitLive();
    await send("dev:money", 9000);
    if (id === "clippers") await page.keyboard.press("KeyV");
    else await page.evaluate((id) => window.__fb.game.buy(id), id);
    equipped = await page.waitForFunction((id) => window.__fb.hud.get().weapon === id, id, { timeout: 4000 })
      .then(() => true).catch(() => false);
  }
  if (!equipped) { console.log(`${id.padEnd(9)} SKIPPED: never equipped (buy window never opened)`); continue; }
  await page.waitForTimeout(1200); // let the equip animation and the server's equip gate finish
  await waitLive();

  // ---- per-shot kick, sampled by the view module at the instant of the shot. Reading the camera a
  // frame later would measure the renderer instead: at a few fps a pistol's kick has recovered
  // almost entirely before the next frame is drawn, and the weapon would look recoilless.
  const kick = await page.evaluate(async () => {
    const g = window.__fb.game;
    const before = window.__fbView.shots;
    g.inputState.mouseButtons = 1;
    for (let i = 0; i < 60 && window.__fbView.shots === before; i++) await new Promise((r) => setTimeout(r, 50));
    g.inputState.mouseButtons = 0;
    return window.__fbView.shots > before ? window.__fbView.lastKick : { pitch: 0, yaw: 0 };
  });
  await page.waitForTimeout(900); // let the kick recover before the next measurement

  // ---- cadence: hold the trigger for a fixed window and count what the client actually emitted.
  const held = 1200;
  const shots = await page.evaluate(async (held) => {
    const g = window.__fb.game;
    const before = window.__fbView.shots;
    g.inputState.mouseButtons = 1;
    await new Promise((r) => setTimeout(r, held));
    g.inputState.mouseButtons = 0;
    return window.__fbView.shots - before;
  }, held);
  await page.waitForTimeout(1400); // reload / recover

  // ---- ADS: time for the blend to cross 0.9, polled per frame.
  const ads = await page.evaluate(() => new Promise((res) => {
    const g = window.__fb.game;
    const lp = g.localPlayer;
    g.inputState.mouseButtons = 4;
    const t0 = performance.now();
    let frames = 0;
    const tick = () => {
      frames++;
      if (lp.aimBlend > 0.9) { g.inputState.mouseButtons = 0; res({ ms: Math.round(performance.now() - t0), frames, zoom: Math.round((lp.camera.fov / ((g.settings?.fov ?? 90) * Math.PI / 180)) * 1000) / 1000 }); }
      else if (performance.now() - t0 > 3000) { g.inputState.mouseButtons = 0; res({ ms: -1, frames, zoom: -1 }); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  await page.waitForTimeout(600);

  // ---- sway: flick the view a fixed amount and record how far the gun lags behind it.
  const sway = await page.evaluate(() => new Promise((res) => {
    const g = window.__fb.game;
    const vm = window.__fbView?.viewmodel;
    g.localPlayer.yaw += 0.35;
    let peak = 0;
    let n = 0;
    const tick = () => {
      const s = vm?.sway;
      if (s) peak = Math.max(peak, Math.abs(s.x));
      if (++n < 20) requestAnimationFrame(tick);
      else res(Math.round(peak * 1e4) / 1e4);
    };
    requestAnimationFrame(tick);
  }));
  await page.waitForTimeout(400);

  const feel = await page.evaluate((id) => window.__fb.feel?.[id] ?? null, id);
  const def = await page.evaluate((id) => {
    const w = window.__fb.shared?.WEAPONS?.[id];
    return w ? { rpm: w.rpm, adsMs: w.adsMs, adsZoom: w.adsZoom, equipMs: w.equipMs, automatic: w.automatic } : null;
  }, id);

  const expectedRate = def ? def.rpm / 60 : null;
  const measuredRate = Math.round((shots / (held / 1000)) * 100) / 100;
  const row = {
    weapon: id,
    measured: {
      kickPitchRad: Math.round(kick.pitch * 1e5) / 1e5,
      kickYawRad: Math.round(kick.yaw * 1e5) / 1e5,
      adsMs: ads.ms, adsFrames: ads.frames, fovRatio: ads.zoom,
      swayPeak: sway,
      shotsPerSec: measuredRate,
      audioPeakDb: audio[id]?.peakDb ?? null,
      audioSeconds: audio[id]?.seconds ?? null,
    },
    intended: { ...def, ...(feel ?? {}) },
    frameLimited: expectedRate !== null && expectedRate > fps / 2,
    fps,
  };
  rows.push(row);
  await writeFile(`${OUT}/${id}.json`, JSON.stringify(row, null, 2));
  console.log(`${id.padEnd(9)} kick ${String(row.measured.kickPitchRad).padStart(8)} rad  ads ${String(ads.ms).padStart(4)} ms  sway ${String(sway).padStart(7)}  ${measuredRate}/s${row.frameLimited ? " (frame-limited)" : ""}`);
}

// The summary is built from every measurement on disk, not just this run's: measuring one weapon
// again (WEAPONS=rifle) must not blank the other ten rows out of the table.
const onDisk = [];
for (const id of await readdir(OUT)) {
  if (!id.endsWith(".json")) continue;
  try { onDisk.push(JSON.parse(await readFile(`${OUT}/${id}`, "utf8"))); } catch { /* half-written */ }
}
const byWeapon = new Map(onDisk.map((r) => [r.weapon, r]));
for (const r of rows) byWeapon.set(r.weapon, r);
// Sorted by the roster's own order, not by this run's `ids` — otherwise re-measuring one weapon
// sends it to the bottom of a table everyone else reads top to bottom.
const order = await page.evaluate(() => window.__fb.shared.WEAPON_ORDER).catch(() => ids);
const ordered = [...byWeapon.values()].sort((a, b) => order.indexOf(a.weapon) - order.indexOf(b.weapon));

const head = "| weapon | kick pitch (rad) | ADS to 0.9 (ms) | sway peak | shots/s | rpm/60 | audio peak (dB) | audio (s) |";
const table = [
  `# Weapon signature — measured ${new Date().toISOString().slice(0, 10)} at ~${fps} fps (SwiftShader)`,
  "",
  "Per-shot kick, ADS blend, sway and audio are measured through the real client. Cadence is",
  "frame-limited under SwiftShader wherever the `frame-limited` note appears — the renderer, not the",
  "weapon, is the bottleneck there. Burst shape is deterministic and asserted in `weaponFeel.test.ts`.",
  "How the scope LOOKS is not judged here; that needs a real GPU.",
  "",
  head,
  "|---|---|---|---|---|---|---|---|",
  // A weapon that was never equipped has no `measured` block. Reading through it threw and took the
  // whole summary with it, so a run that skipped one gun wrote no table at all and lost the ten it
  // did measure. Skipped rows are printed AS skipped: silence would be worse than a gap.
  ...ordered.map((r) => (r.measured
    ? `| ${r.weapon} | ${r.measured.kickPitchRad} | ${r.measured.adsMs} | ${r.measured.swayPeak} | ${r.measured.shotsPerSec}${r.frameLimited ? " (frame-limited)" : ""} | ${r.intended?.rpm ? (r.intended.rpm / 60).toFixed(1) : "—"} | ${r.measured.audioPeakDb ?? "—"} | ${r.measured.audioSeconds ?? "—"} |`
    : `| ${r.weapon} | — | — | — | — | ${r.intended?.rpm ? (r.intended.rpm / 60).toFixed(1) : "—"} | — | — |  <!-- ${r.skipped ?? "not measured"} -->`)),
  "",
].join("\n");
await writeFile(`${OUT}/summary.md`, table);
console.log(`\nwrote ${rows.length} rows to ${OUT}/`);
await browser.close();
