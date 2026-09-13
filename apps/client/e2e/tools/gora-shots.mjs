/**
 * GÓRA (DACH) evidence: the roof rendered the way the game renders it, from both starts, the
 * perch, a court, a yard and from above (`map-review.html?map=gora`); a live duel against a bot
 * on the real server with the HUD, read back every few seconds; and `/viewer` on that room.
 *
 * Run:  FB_DEV_TOOLS=1 pnpm dev            (client :5174, server :2567)
 *       node apps/client/e2e/tools/gora-shots.mjs
 * Output: apps/client/e2e/out/g/shots/*.png and a JSON log on stdout.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
const URL = process.env.HOST_URL ?? "http://localhost:5174";
const OUT = "apps/client/e2e/out/g/shots";
fs.mkdirSync(OUT, { recursive: true });
const LOW = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 0.6, shadows: "medium", postProcessing: true, effects: 0.5, antialiasing: false, importedModels: false } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const errors = [];
const log = (k, v) => console.log(`${k.padEnd(14)}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

// ---- 1. The roof, rendered: the review page grades exactly as the game does.
if (process.env.SKIP_REVIEW !== "1") {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("review: " + String(e.message).slice(0, 160)));
  await p.goto(`${URL}/map-review.html?map=gora&preset=medium`);
  await p.waitForFunction(() => window.review, null, { timeout: 120000 });
  await p.evaluate(() => window.review.scene.whenReadyAsync());
  const views = [
    ["start_w", [-13.6, 1.62, -6.0], [-15.2, 1.6, -1.0]],
    ["start_w_door", [-15.2, 1.62, -2.2], [-9, 1.6, 2]],
    ["start_e", [13.6, 1.62, 6.0], [15.2, 1.6, 1.0]],
    ["start_e_door", [15.2, 1.62, 2.2], [9, 1.6, -2]],
    ["podest_w", [-7.2, 1.62, 0], [0, 2.4, 0]],
    ["perch_s", [0, 3.62, 0.2], [0, 0.6, -7]],
    ["perch_n", [0, 3.62, -0.2], [0, 0.6, 7]],
    ["court_s", [-5.5, 1.62, -4.5], [1.5, 1.4, -7]],
    ["court_n", [5.5, 1.62, 4.5], [-1.5, 1.4, 7]],
    ["yard_w", [-11.5, 1.62, -0.5], [-13.5, 1.5, 9]],
    ["yard_e", [11.5, 1.62, 0.5], [13.5, 1.5, -9]],
    ["lane_s", [6.5, 1.62, -9.4], [-4, 1.5, -9.4]],
    ["lane_n", [-6.5, 1.62, 9.4], [4, 1.5, 9.4]],
    ["mouth_w", [-2.0, 1.62, -8.8], [-12, 1.5, -9.6]],
    ["skyline", [-8, 1.62, 6], [-40, 4, 30]],
    ["overview", [-10, 26, -32], [0, 0, 0]],
    ["topdown", [0.01, 40, 0], [0, 0, 0]],
  ];
  const metrics = [];
  for (const [name, pos, look] of views) {
    await p.evaluate(({ pos, look }) => window.review.view(pos, look), { pos, look });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/review_${name}.png` });
    metrics.push(await p.evaluate((name) => { const { scene, engine } = window.review; const s = engine._drawCalls.current; scene.render(); return { name, drawCalls: engine._drawCalls.current - s, activeMeshes: scene.getActiveMeshes().length, vertices: scene.getTotalVertices(), lights: scene.lights.length }; }, name));
  }
  log("review", metrics.map((m) => `${m.name} ${m.drawCalls} calls/${m.activeMeshes} meshes`).join(" · "));
  log("review verts", metrics[0].vertices);
  await p.close();
}

// ---- 2. A live duel against one bot on the server: the lobby, the freeze, the round, the HUD.
const room = "gora-" + Date.now().toString(36);
{
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("game: " + String(e.message).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("game console: " + m.text().slice(0, 160)); });
  await p.goto(URL);
  await p.getByTestId("btn-play").click();
  await p.getByTestId("input-name").fill("FRANKI");
  await p.getByTestId("input-room").fill(room);
  await p.getByTestId("mode-duel").click();
  log("blurb", (await p.getByTestId("mode-blurb").innerText()).slice(0, 120));
  await p.getByTestId("map-gora").click();
  await p.getByTestId("bots-range").fill("1");
  log("bots", await p.getByTestId("bots-count").innerText());
  await p.getByTestId("mode-picker").screenshot({ path: `${OUT}/lobby-modes.png` });
  await p.getByTestId("map-picker").screenshot({ path: `${OUT}/lobby-maps.png` });
  await p.getByTestId("btn-create").click();
  // The room is joined with the spawn deferred: the HUD stays dormant until ENTER MATCH is clicked.
  await p.getByTestId("enter-game").click({ timeout: 120000 });
  await p.getByTestId("hud").waitFor({ timeout: 90000 });
  await p.waitForFunction(() => window.__fb?.hud.get().myId !== "", null, { timeout: 90000 });
  const state = () => p.evaluate(() => {
    const h = window.__fb.hud.get(); const st = window.__fb.game.conn.state; const rows = [];
    st.players.forEach((q) => rows.push({ name: q.name, team: q.team, alive: q.alive, hp: q.health, money: q.money, weapon: q.weapon, x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10, bot: !!q.bot }));
    return { phase: h.phase, round: h.round, A: h.scoreA, B: h.scoreB, buy: h.buyWindowLeft, mine: h.myTeam, rows };
  });
  await p.waitForFunction(() => ["prep", "playing"].includes(window.__fb.hud.get().phase), null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  log("prep", await state());
  await p.screenshot({ path: `${OUT}/duel-prep.png` });
  const line = await p.getByTestId("duel-line").innerText().catch(() => "(no duel line)");
  log("duel line", line.replace(/\n/g, " | "));
  // Buy a rifle in the freeze, through the real shop message.
  await p.evaluate(() => window.__fb.game.conn.send("buy", { item: "rifle" }));
  await p.waitForTimeout(300);
  await p.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 30000 });
  await p.waitForTimeout(800);
  log("round live", await state());
  await p.screenshot({ path: `${OUT}/duel-round.png` });
  // Look around from the start with the real camera: the door, then the mouth.
  const look = async (yaw, name) => { await p.evaluate((y) => { window.__fb.game.local.yaw = y; }, yaw); await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}.png` }); };
  await look(0.1, "pov-door");
  await look(1.4, "pov-mouth");
  // Watch the bot move and the rounds turn over for a while.
  const trace = [];
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(5000);
    const s = await state();
    const bot = s.rows.find((r) => r.bot);
    trace.push(`t+${(i + 1) * 5}s ${s.phase} r${s.round} ${s.A}:${s.B} bot@(${bot?.x},${bot?.z}) alive=${bot?.alive} me=${s.rows.find((r) => !r.bot)?.alive}`);
    if (i === 4) await p.screenshot({ path: `${OUT}/duel-mid.png` });
  }
  log("trace", trace.join(" · "));

  // ---- 3. /viewer on the same room: the roof's own spots, and the room gains no player.
  const v = await ctx.newPage();
  v.on("pageerror", (e) => errors.push("viewer: " + String(e.message).slice(0, 160)));
  await v.goto(`${URL}/viewer?room=${room}`);
  await v.waitForSelector('[data-testid="viewer-stage"]', { timeout: 60000 });
  await v.waitForTimeout(4000);
  const spots = await v.locator('[data-testid="viewer-spots"] button').allInnerTexts();
  log("viewer spots", spots.map((s) => s.replace(/\n/g, " ")).join(" · "));
  for (const id of ["start_w", "perch", "court_s", "yard_w", "overview"]) {
    await v.click(`[data-testid="viewer-go-${id}"]`);
    await v.waitForTimeout(1800);
    await v.screenshot({ path: `${OUT}/viewer_${id}.png` });
  }
  log("viewer stats", (await v.locator('[data-testid="viewer-stats"]').innerText()).replace(/\s+/g, " "));
  const health = await (await fetch("http://localhost:2567/health")).json();
  log("health", { players: health.players, rooms: health.rooms });
  await v.close();
  await p.close();
}
log("errors", errors.length ? errors.slice(0, 6) : "none");
await b.close();
