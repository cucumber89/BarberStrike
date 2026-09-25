#!/usr/bin/env node
/**
 * What a full-screen overlay costs the frame rate — drop U's Principle 15, measured through REAL
 * states, never forced attributes (docs/UI_U_SPEC.md §7 P1 (m)).
 *
 *   node apps/client/e2e/tools/veil-cost.mjs [--url http://localhost:5174] [--seconds 5] [--label p1]
 *        [--quality default|low] [--rounds 5] [--min-frames 30] [--final]
 *
 * Needs the game server the client talks to (`VITE_SERVER_URL`, or :2567 in dev) started with
 * `FB_DEV_TOOLS=1` (the `dev:teleport` and `dev:endmatch` hooks). Two clients join a fresh duel
 * room with bots at 0. Client A plays at the DEFAULT quality (it is the one measured; `--quality
 * low` for a machine where software GL cannot draw the default at a measurable rate); client B,
 * the shooter, at LOW. A's `requestAnimationFrame` intervals are sampled in each state:
 *
 *   alive    the live round, nothing over the view;
 *   dead     A killed by B through the kill sequence of `multiplayer.spec.ts:230-267` (teleport,
 *            lookAt, burst) — the vignette, the death cam, the card or the round's banner, and the
 *            spectated eye, for as long as A is down (a duel's break is 5 s);
 *   pause    `Escape` plus `document.exitPointerLock()`: the ESC column and its dim (P7);
 *   result-B `dev:endmatch` (`TdmRoom.ts:405`), measured from 3.2 s to 5.8 s of Ended: the
 *            verdict's full-screen dim (P6).
 *
 * ALIVE AND DEAD ARE RECORDED CONTINUOUSLY AND POOLED over rounds. A recorder inside A's page tags
 * every rAF interval with the state it ended in — `alive` (alive, live round), `dead` (down after a
 * kill, through the break, until the respawn) or `other` — and drops the interval that straddles a
 * change of state. Every dead frame counts, from the kill's first frame (a window started by the
 * test driver would lose the seconds the driver takes to notice the kill), and alive and dead
 * interleave round by round, so both rows see the same load drift. A machine drawing 1 frame a
 * second (SwiftShader on shared cores) then still adds up to a frame rate instead of "n/a": a
 * duel's death lasts one break (5 s), so the tool keeps killing A, round after round, until each
 * pool holds `--min-frames` or `--rounds` is spent (the duel ends at 6 won rounds, so 5 is the
 * most one room gives). Each round's own pair is in the report, with the median of the per-round
 * ratios beside the pooled one.
 *
 * Writes apps/client/e2e/out/u/<label>/veil-cost.md and .json. The gate (§7.0 final gate): each
 * overlay row ≥ 95 % of the alive row's frame rate. P1 gates the dead row; the pause and result-B
 * rows are reported here and gate at the final gate, once P6 and P7 have built those layers.
 * Exits 1 when the dead row is under 95 %, 2 when it (or alive) could not be reached or measured
 * (under 10 frames). `--final` gates the pause and result-B rows the same way.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5174");
const SECONDS = Number(arg("--seconds", "5"));
const LABEL = arg("--label", "p1");
const OUT = resolve(HERE, "../out/u", LABEL);
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
// The playwright config's software GL (headless has no GPU): the numbers are relative, not absolute.
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"];
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: false } });
const GATE = 0.95;
const QUALITY = arg("--quality", "default");
/** Fewer frames than this in a row (pooled) is not a frame rate. */
const MIN_FRAMES = 10;
/** Keep adding rounds until each pool holds this many frames… */
const WANT_FRAMES = Math.max(MIN_FRAMES, Number(arg("--min-frames", "30")));
/** …or this many rounds are spent (a duel is won at 6). */
const ROUNDS = Math.max(1, Math.min(5, Number(arg("--rounds", "5"))));

const fail = (msg, code = 2) => { console.error(`veil-cost: ${msg}`); process.exit(code); };
const log = (msg) => console.error(`[veil-cost ${new Date().toISOString().slice(11, 19)}] ${msg}`);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ ...(existsSync(EXE) ? { executablePath: EXE } : {}), args: ARGS });
const view = { viewport: { width: 1280, height: 720 } };
const ca = await browser.newContext(view), cb = await browser.newContext(view);
// The duel is played on its own arena, and the room lists that map: a join that asks for another
// map is matched to no duel room and opens its own (measured 2026-09-25), so both ask for it.
await ca.addInitScript((v) => { if (v) localStorage.setItem("fb_settings_v1", v); localStorage.setItem("fb_mode", "duel"); localStorage.setItem("fb_map", "gora"); localStorage.setItem("fb_bots", "0"); }, QUALITY === "low" ? LOW : "");
await cb.addInitScript((v) => { localStorage.setItem("fb_settings_v1", v); localStorage.setItem("fb_mode", "duel"); localStorage.setItem("fb_map", "gora"); localStorage.setItem("fb_bots", "0"); }, LOW);
const a = await ca.newPage(), b = await cb.newPage();
const errors = [];
for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));

const hud = (p) => p.evaluate(() => window.__fb.hud.get());
const until = (p, fn, arg, timeout) => p.waitForFunction(fn, arg, { timeout, polling: "raf" });

async function join(page, name, room) {
  await page.goto(BASE);
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(room);
  await page.getByTestId("btn-quickplay").click();
  await page.getByTestId("enter-game").click({ timeout: 90_000 });
  // The default quality loads slowly on software GL; a join that does not arrive says where it stopped.
  await page.getByTestId("hud").waitFor({ state: "visible", timeout: 180_000 })
    .catch(async (e) => { throw new Error(`${name} never reached the game: ${(await page.evaluate(() => document.body.innerText).catch(() => "?")).replace(/\s+/g, " ").slice(0, 300)} (${e.message.split("\n")[0]})`); });
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 60_000 });
}
async function fakeLock(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
}
const frames = async (page, n) => {
  const start = await page.evaluate(() => window.__fb.game.frameCount);
  await page.waitForFunction((t) => window.__fb.game.frameCount >= t, start + n, { timeout: 60_000 });
};

/**
 * A's rAF intervals for `ms`, or until `stop` (a page predicate) turns true — whichever first.
 * Returns the frame count, the window, the mean interval, fps and the 95th percentile interval.
 */
async function sample(ms, stop = null, minFrames = 0) {
  return a.evaluate(([ms, stopSrc, minFrames]) => new Promise((done) => {
    const stopFn = stopSrc ? new Function(`return (${stopSrc})();`) : () => false;
    const dts = [];
    const t0 = performance.now();
    let last = t0;
    const step = (t) => {
      dts.push(t - last); last = t;
      // A slow machine: past `ms`, keep going until `minFrames` intervals (at most 30 s).
      if ((t - t0 >= ms && dts.length > minFrames) || t - t0 >= Math.max(ms, 30_000) || stopFn()) {
        dts.shift(); // the first interval straddles the start
        done({ dts, windowMs: Math.round(t - t0) });
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), [ms, stop ? stop.toString() : null, minFrames]).then((r) => ({ ...stats(r.dts, r.windowMs), dts: r.dts }));
}

/** Frame count, window, mean interval, fps and the 95th percentile interval of `dts`. */
function stats(dts, windowMs) {
  const sorted = [...dts].sort((x, y) => x - y);
  const mean = dts.reduce((s, d) => s + d, 0) / Math.max(1, dts.length);
  return { frames: dts.length, windowMs, meanMs: +mean.toFixed(2), fps: dts.length ? +(1000 / mean).toFixed(2) : 0, p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2) };
}

/**
 * Where the shooter stands to kill: close sides first (1.5 m — `dev:teleport` checks only the
 * world, not bodies), then the old 2.5–3.5 m ring. MEASURED 2026-09-25 on the duel's „gora”: with
 * the old ring alone B never killed A in round 1 (veil-cost exit 2, "B could not kill A"); with the
 * close sides first A died in all 5 rounds (1.5,0 was refused, inside a wall, in rounds 1–3). A side
 * the room refuses (the shooter did not arrive) is skipped, not shot from.
 */
const SIDES = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5], [2.5, 2.5], [-2.5, -2.5]];

const rows = [];
let recorder = null;
const room = `veil-${Date.now()}`;
try {
  await join(a, "WIDZ", room);
  await join(b, "STRZELEC", room);
  await fakeLock(a); await fakeLock(b);
  const idA = (await hud(a)).myId;
  log(`joined ${room}: A ${idA}, mode ${(await hud(a)).mode}, phase ${(await hud(a)).phase}`);

  // ---- alive, then dead, round after round, pooled (see the header)
  const target = () => b.evaluate((id) => { const s = window.__fb.game.conn.state.players.get(id); return { x: s.x, y: s.y, z: s.z, alive: s.alive }; }, idA);
  const burst = async () => { await b.mouse.down(); await frames(b, 2); await b.mouse.up(); await frames(b, 1); };
  /** B kills A: teleport beside A, look, burst (multiplayer.spec.ts:230-267). */
  async function killA() {
    let dead = false;
    for (const [ox, oz] of SIDES) {
      const t = await target();
      if (!t.alive) return true;
      await b.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [t.x + ox, t.y, t.z + oz]);
      await b.waitForTimeout(400);
      const at = await b.evaluate(() => { const p = window.__fb.game.localPlayer.body; return { x: p.x, z: p.z }; });
      if (Math.hypot(at.x - (t.x + ox), at.z - (t.z + oz)) > 1) { log(`side ${ox},${oz} refused (a wall)`); continue; }
      for (let i = 0; i < 25 && !dead; i++) {
        await b.evaluate(({ x, y, z }) => {
          const lp = window.__fb.game.localPlayer, p = lp.body;
          const dx = x - p.x, dz = z - p.z, dy = y + 1.2 - (p.y + 1.62);
          lp.yaw = Math.atan2(dx, dz); lp.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
        }, t);
        await burst();
        dead = !(await hud(a)).alive;
        if (i % 6 === 5) { await b.keyboard.press("KeyR"); await b.waitForTimeout(1500); }
      }
      if (dead) return true;
    }
    return dead;
  }
  // The recorder (see the header): one tag per rAF interval, in A's page, for the whole run.
  await frames(a, 30); // shaders warm
  await a.evaluate(() => {
    const R = (window.__vc = { dts: [], tags: [], rounds: [], on: true });
    let last = 0, prevTag = "", round = 0, wasDead = false;
    const step = (t) => {
      if (!R.on) return;
      const h = window.__fb.hud.get();
      const dead = !h.alive && h.diedAt > 0;
      if (dead && !wasDead) round++;
      wasDead = dead;
      const tag = dead ? "dead" : h.alive && h.phase === "playing" ? "alive" : "other";
      // An interval that straddles a change of state belongs to neither.
      if (last > 0) { R.dts.push(t - last); R.tags.push(tag === prevTag ? tag : "edge"); R.rounds.push(round); }
      last = t; prevTag = tag;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const counts = () => a.evaluate(() => { const c = { alive: 0, dead: 0 }; for (const t of window.__vc.tags) if (t in c) c[t]++; return c; });
  let rounds = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    // The live round (after the freeze), nothing over the view: at least SECONDS of it.
    await until(a, () => { const h = window.__fb.hud.get(); return h.phase === "playing" && h.alive; }, null, 180_000);
    log(`round ${round}: A alive in the live round`);
    await a.waitForTimeout(SECONDS * 1000);
    if (!(await killA())) fail(`round ${round}: B could not kill A (is the server running with FB_DEV_TOOLS=1?)`);
    log(`round ${round}: A is down`);
    await until(a, () => window.__fb.hud.get().alive || window.__fb.hud.get().phase === "ended", null, 60_000);
    rounds = round;
    const c = await counts();
    log(`round ${round}: pooled alive ${c.alive} frames · dead ${c.dead} frames · load ${(await import("node:os")).loadavg()[0].toFixed(1)}`);
    if (c.alive >= WANT_FRAMES && c.dead >= WANT_FRAMES) break;
    if ((await hud(a)).phase === "ended") break;
  }
  const rec = await a.evaluate(() => { window.__vc.on = false; return { dts: window.__vc.dts, tags: window.__vc.tags, rounds: window.__vc.rounds }; });
  recorder = rec; // the raw intervals go to the .json, so every number here can be recomputed
  const pick = (tag, round = null) => rec.dts.filter((_, i) => rec.tags[i] === tag && (round === null || rec.rounds[i] === round));
  const alivePool = pick("alive"), deadPool = pick("dead");
  const sum = (xs) => Math.round(xs.reduce((s, d) => s + d, 0));
  const perRoundPairs = [];
  for (let r = 1; r <= rounds; r++) {
    // Round r's death is tagged r; the live window before it is the alive frames tagged r − 1.
    const al = stats(pick("alive", r - 1), 0), de = stats(pick("dead", r), 0);
    perRoundPairs.push({ round: r, aliveFps: al.fps, aliveFrames: al.frames, deadFps: de.fps, deadFrames: de.frames });
  }
  const ratios = perRoundPairs.filter((x) => x.aliveFps > 0 && x.deadFrames > 0).map((x) => x.deadFps / x.aliveFps).sort((x, y) => x - y);
  const median = ratios.length ? ratios[Math.floor((ratios.length - 1) / 2)] : null;
  const perRound = perRoundPairs.map((x) => `${x.aliveFps}/${x.deadFps} (${x.aliveFrames}/${x.deadFrames} fr)`).join(", ");
  rows.push({ state: "alive", how: `duel, live round, A alive · ${rounds} round(s) pooled, recorded in-page`, ...stats(alivePool, sum(alivePool)) });
  rows.push({ state: "dead", how: `killed by B: vignette, death cam, card, break, until the respawn · ${rounds} round(s) pooled, interleaved with alive · per round alive/dead fps ${perRound} · median per-round ratio ${median === null ? "n/a" : (median * 100).toFixed(1) + " %"}`, ...stats(deadPool, sum(deadPool)), medianOfRounds: median, perRound: perRoundPairs });

  // The pause and result-B rows are reported, not P1's gate (they gate with --final): a stage that
  // is not reached on a loaded machine is a row that says so, never a lost dead row. MEASURED
  // 2026-09-25 13:58Z at load 26.9: `dev:endmatch` did not show Ended within 30 s and the whole
  // run exited 2 after five pooled rounds, its alive and dead rows unwritten.
  const reported = async (state, how, run) => {
    try { rows.push({ state, how, ...(await run()) }); }
    catch (e) { log(`${state} not reached: ${String(e?.message ?? e).split("\n")[0]}`); rows.push({ state, how: `${how} · NOT REACHED: ${String(e?.message ?? e).split("\n")[0]}`, ...stats([], 0) }); }
  };

  // ---- pause: Escape plus exitPointerLock, the ESC column (P7)
  await reported("pause", "Escape + exitPointerLock", async () => {
    await until(a, () => window.__fb.hud.get().alive || window.__fb.hud.get().phase === "ended", null, 60_000);
    await a.keyboard.press("Escape");
    await a.evaluate(() => { try { document.exitPointerLock(); } catch { /* headless */ } Object.defineProperty(document, "pointerLockElement", { get: () => null, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
    await a.waitForTimeout(600); // the pause card arms 300 ms after the lock is lost
    const paused = await a.evaluate(() => !!document.querySelector("[data-testid=pause]"));
    const r = await sample(SECONDS * 1000, null, MIN_FRAMES);
    await fakeLock(a);
    return paused ? r : { ...r, note: "no [data-testid=pause] seen" };
  });

  // ---- result stage B: dev:endmatch, then 3.2 s → 5.8 s of Ended (round modes: A 0–3, B 3–6)
  await reported("result-B", "dev:endmatch, 3.2–5.8 s of Ended", async () => {
    // Asked twice at most: on a loaded machine the first ask can land in a round edge.
    for (let ask = 1; ask <= 2; ask++) {
      await a.evaluate(() => window.__fb.game.conn.send("dev:endmatch", {}));
      const ended = await until(a, () => window.__fb.hud.get().phase === "ended", null, 45_000).then(() => true, (e) => (ask === 2 ? Promise.reject(e) : false));
      if (ended) break;
      log("result-B: no Ended 45 s after dev:endmatch, asking again");
    }
    const endedAt = await a.evaluate(() => performance.now());
    await a.waitForFunction((t0) => performance.now() - t0 >= 3_200, endedAt, { timeout: 30_000, polling: 100 });
    return sample(2_600);
  });
} catch (e) {
  try { const h = await hud(a); log(`A at failure: phase ${h.phase}, alive ${h.alive}, mode ${h.mode}, players ${h.players.length}`); } catch { /* page gone */ }
  fail(String(e?.message ?? e));
} finally {
  await browser.close();
}

for (const r of rows) { delete r.dts; if (r.note) { r.how += ` (${r.note})`; delete r.note; } }
const alive = rows.find((r) => r.state === "alive");
for (const r of rows) r.ofAlive = r.frames >= MIN_FRAMES && alive.frames >= MIN_FRAMES ? +(r.fps / alive.fps).toFixed(3) : null;
const deadRow = rows.find((r) => r.state === "dead");
// P1 gates the dead row (§7 P1); the pause and result-B rows are reported, and gate only with
// --final (the final gate, once P6 and P7 have built those layers).
const FINAL = argv.includes("--final");
const gated = rows.filter((r) => r.state === "alive" || r.state === "dead" || FINAL);
const measured = gated.every((r) => r.ofAlive !== null);
const pass = measured && gated.every((r) => r.state === "alive" || r.ofAlive >= GATE);
const pctOf = (r) => (r.ofAlive === null ? `n/a (< ${MIN_FRAMES} frames)` : `${(r.ofAlive * 100).toFixed(1)} %`);
const md = [
  `# veil-cost — ${LABEL}`,
  "",
  `${new Date().toISOString()} · ${BASE} · client A at the ${QUALITY} quality, 1280×720, SwiftShader · alive and dead recorded in-page, ≥ ${SECONDS} s alive per round · pause ${SECONDS} s, result-B 2.6 s · pools want ${WANT_FRAMES} frames, ≤ ${ROUNDS} rounds · load average ${(await import("node:os")).loadavg().map((x) => x.toFixed(1)).join(" / ")}`,
  "",
  "| state | how | frames | window ms | mean ms | fps | p95 ms | of alive | gate |",
  "|---|---|---:|---:|---:|---:|---:|---:|---|",
  ...rows.map((r) => `| ${r.state} | ${r.how} | ${r.frames} | ${r.windowMs} | ${r.meanMs} | ${r.fps} | ${r.p95Ms} | ${pctOf(r)} | ${
    r.state === "alive" ? "–" : r.ofAlive === null ? "not measured" : r.state === "dead" ? (r.ofAlive >= GATE ? "✓ ≥ 95 % (P1)" : "✗ < 95 % (P1)") : (r.ofAlive >= GATE ? "✓ (reported; final gate)" : "✗ (reported; final gate after P6/P7)")}`),
  "",
  errors.length ? `Page errors: ${errors.map((e) => `\`${e}\``).join(", ")}` : "No page errors.",
  "",
].join("\n");
writeFileSync(resolve(OUT, "veil-cost.md"), md);
writeFileSync(resolve(OUT, "veil-cost.json"), JSON.stringify({ base: BASE, seconds: SECONDS, rows, errors, recorder }, null, 2));
console.log(md);
process.exit(!measured ? 2 : pass ? 0 : 1);
