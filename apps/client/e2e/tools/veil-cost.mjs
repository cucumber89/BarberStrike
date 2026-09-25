#!/usr/bin/env node
/**
 * What a full-screen overlay costs the frame rate — drop U's Principle 15, measured through REAL
 * states, never forced attributes (docs/UI_U_SPEC.md §7 P1 (m)).
 *
 *   node apps/client/e2e/tools/veil-cost.mjs [--url http://localhost:5174] [--seconds 5] [--label p1]
 *        [--quality default|low]
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
 * Writes apps/client/e2e/out/u/<label>/veil-cost.md and .json. The gate (§7.0 final gate): each
 * overlay row ≥ 95 % of the alive row's frame rate. P1 gates the dead row; the pause and result-B
 * rows are reported here and gate at the final gate, once P6 and P7 have built those layers.
 * Exits 1 when the dead row is under 95 %, 2 when a state could not be reached.
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
/** Fewer frames than this in a window is not a frame rate. */
const MIN_FRAMES = 10;

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
  await page.getByTestId("hud").waitFor({ state: "visible", timeout: 60_000 });
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
async function sample(ms, stop = null) {
  return a.evaluate(([ms, stopSrc]) => new Promise((done) => {
    const stopFn = stopSrc ? new Function(`return (${stopSrc})();`) : () => false;
    const dts = [];
    const t0 = performance.now();
    let last = t0;
    const step = (t) => {
      dts.push(t - last); last = t;
      if (t - t0 >= ms || stopFn()) {
        dts.shift(); // the first interval straddles the start
        const sorted = [...dts].sort((x, y) => x - y);
        const mean = dts.reduce((s, d) => s + d, 0) / Math.max(1, dts.length);
        done({ frames: dts.length, windowMs: Math.round(t - t0), meanMs: +mean.toFixed(2), fps: +(1000 / mean).toFixed(1), p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2) });
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), [ms, stop ? stop.toString() : null]);
}

const rows = [];
const room = `veil-${Date.now()}`;
try {
  await join(a, "WIDZ", room);
  await join(b, "STRZELEC", room);
  await fakeLock(a); await fakeLock(b);
  const idA = (await hud(a)).myId;
  log(`joined ${room}: A ${idA}, mode ${(await hud(a)).mode}, phase ${(await hud(a)).phase}`);

  // ---- alive: the live round (after the freeze), nothing over the view
  await until(a, () => { const h = window.__fb.hud.get(); return h.phase === "playing" && h.alive; }, null, 120_000);
  log("A alive in the live round");
  await frames(a, 30); // shaders warm
  rows.push({ state: "alive", how: "duel, live round, A alive", ...(await sample(SECONDS * 1000)) });

  // ---- dead: B kills A — teleport beside A, look, burst (multiplayer.spec.ts:230-267)
  const target = () => b.evaluate((id) => { const s = window.__fb.game.conn.state.players.get(id); return { x: s.x, y: s.y, z: s.z, alive: s.alive }; }, idA);
  const burst = async () => { await b.mouse.down(); await frames(b, 2); await b.mouse.up(); await frames(b, 1); };
  let dead = false;
  for (const [ox, oz] of [[3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5], [2.5, 2.5], [-2.5, -2.5]]) {
    const t = await target();
    if (!t.alive) { dead = true; break; }
    await b.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [t.x + ox, t.y, t.z + oz]);
    await b.waitForTimeout(400);
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
    if (dead) break;
  }
  if (!dead) fail("B could not kill A (is the server running with FB_DEV_TOOLS=1?)");
  log("A is down");
  rows.push({ state: "dead", how: "killed by B: vignette, death cam, then the spectated eye", ...(await sample(SECONDS * 1000, () => window.__fb.hud.get().alive)) });

  // ---- pause: Escape plus exitPointerLock, the ESC column (P7)
  await until(a, () => window.__fb.hud.get().alive, null, 30_000);
  await a.keyboard.press("Escape");
  await a.evaluate(() => { try { document.exitPointerLock(); } catch { /* headless */ } Object.defineProperty(document, "pointerLockElement", { get: () => null, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
  await a.waitForTimeout(600); // the pause card arms 300 ms after the lock is lost
  const paused = await a.evaluate(() => !!document.querySelector("[data-testid=pause]"));
  rows.push({ state: "pause", how: `Escape + exitPointerLock${paused ? "" : " (no [data-testid=pause] seen)"}`, ...(await sample(SECONDS * 1000)) });
  await fakeLock(a);

  // ---- result stage B: dev:endmatch, then 3.2 s → 5.8 s of Ended (round modes: A 0–3, B 3–6)
  await a.evaluate(() => window.__fb.game.conn.send("dev:endmatch", {}));
  await until(a, () => window.__fb.hud.get().phase === "ended", null, 30_000);
  const endedAt = await a.evaluate(() => performance.now());
  await a.waitForFunction((t0) => performance.now() - t0 >= 3_200, endedAt, { timeout: 10_000 });
  rows.push({ state: "result-B", how: "dev:endmatch, 3.2–5.8 s of Ended", ...(await sample(2_600)) });
} catch (e) {
  try { const h = await hud(a); log(`A at failure: phase ${h.phase}, alive ${h.alive}, mode ${h.mode}, players ${h.players.length}`); } catch { /* page gone */ }
  fail(String(e?.message ?? e));
} finally {
  await browser.close();
}

const alive = rows.find((r) => r.state === "alive");
for (const r of rows) r.ofAlive = r.frames >= MIN_FRAMES && alive.frames >= MIN_FRAMES ? +(r.fps / alive.fps).toFixed(3) : null;
const deadRow = rows.find((r) => r.state === "dead");
const measured = rows.every((r) => r.ofAlive !== null);
const pass = measured && deadRow.ofAlive >= GATE;
const pctOf = (r) => (r.ofAlive === null ? `n/a (< ${MIN_FRAMES} frames)` : `${(r.ofAlive * 100).toFixed(1)} %`);
const md = [
  `# veil-cost — ${LABEL}`,
  "",
  `${new Date().toISOString()} · ${BASE} · client A at the ${QUALITY} quality, 1280×720, SwiftShader · window ${SECONDS} s (result-B 2.6 s) · load average ${(await import("node:os")).loadavg().map((x) => x.toFixed(1)).join(" / ")}`,
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
writeFileSync(resolve(OUT, "veil-cost.json"), JSON.stringify({ base: BASE, seconds: SECONDS, rows, errors }, null, 2));
console.log(md);
process.exit(!measured ? 2 : pass ? 0 : 1);
