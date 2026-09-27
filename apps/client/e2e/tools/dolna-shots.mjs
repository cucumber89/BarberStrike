/**
 * DOLNA evidence: (1) the plot and the street rendered the way the game renders them
 * (`map-review.html?map=dolna&preset=medium`) — both starts, the shed, the shell, the street from
 * both ends, the three gaps in the front line, the garage, the hall, the garden and two overviews —
 * with the draw calls / active meshes / vertices of every view, plus ONE reference view of the
 * district's street so the numbers can be compared; (2) with `LIVE=1`, a whole 1 v 1 against one
 * bot on the real server, joined through the menu, the HUD sampled every 5 s until the match ends
 * (first to `DUEL.wins` = 6, or `phase === "ended"`), capped at 12 minutes. `/viewer` is section 3
 * of `gora-shots.mjs` and is not repeated here.
 *
 * Run:  FB_DEV_TOOLS=1 pnpm dev            (client :5174, server :2567)
 *       PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node apps/client/e2e/tools/dolna-shots.mjs
 *       LIVE=1 SKIP_REVIEW=1 … for the duel alone; VIEWS=bmw,gate … for a few views.
 * Output: apps/client/e2e/out/dolna/shots/review_*.png, ref_night_district_street.png,
 *         metrics.json (per-view metrics + page errors); with LIVE=1 also shots/live_*.png and
 *         apps/client/e2e/out/dolna/live.md; a JSON log on stdout.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
const URL = process.env.HOST_URL ?? "http://localhost:5174";
const OUT = "apps/client/e2e/out/dolna/shots";
fs.mkdirSync(OUT, { recursive: true });
const LOW = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 0.6, shadows: "medium", postProcessing: true, effects: 0.5, antialiasing: false, importedModels: false } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const errors = [];
const log = (k, v) => console.log(`${k.padEnd(14)}: ${typeof v === "string" ? v : JSON.stringify(v)}`);

// The review page grades exactly as the game does: same tone curve, same preset, same builder.
const openReview = async (query, tag) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${tag}: ` + String(e.message).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ` + m.text().slice(0, 160)); });
  await p.goto(`${URL}/map-review.html?${query}`);
  await p.waitForFunction(() => window.review, null, { timeout: 120000 });
  await p.evaluate(() => window.review.scene.whenReadyAsync());
  return p;
};
const measure = (p, name) => p.evaluate((name) => { const { scene, engine } = window.review; const s = engine._drawCalls.current; scene.render(); return { name, drawCalls: engine._drawCalls.current - s, activeMeshes: scene.getActiveMeshes().length, vertices: scene.getTotalVertices(), lights: scene.lights.length }; }, name);
// Vite reloads the page whenever a file of the dev tree changes (a sibling editing `packages/shared`
// mid-run wiped `window.review` once); a view is only taken once the page is ready, and taken
// again when the page was reloaded under it.
const ready = async (p) => {
  await p.waitForFunction(() => window.review, null, { timeout: 120000 });
  await p.evaluate(() => window.review.scene.whenReadyAsync());
};
const shoot = async (p, views, prefix) => {
  const metrics = [];
  for (const [name, pos, look] of views) {
    for (let attempt = 0; ; attempt++) {
      try {
        await ready(p);
        await p.evaluate(({ pos, look }) => window.review.view(pos, look), { pos, look });
        await p.waitForTimeout(1200);
        if (!(await p.evaluate(() => !!window.review))) throw new Error("page reloaded under the view");
        await p.screenshot({ path: `${OUT}/${prefix}${name}.png` });
        metrics.push({ ...(await measure(p, name)), file: `${prefix}${name}.png`, camera: pos, target: look });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        errors.push(`${prefix}${name} retry ${attempt + 1}: ` + String(e.message).slice(0, 120));
      }
    }
  }
  return metrics;
};

// ---- 1. DOLNA: the plot, the street, the site — every landmark of the map, at eye height 1.62.
if (process.env.SKIP_REVIEW !== "1") {
const E = 1.62;
const views = [
  ["start_t0", [16, E, 12.5], [12, 1.4, 11]],                  // T0 start in the garage pocket, west through the mouth
  ["start_t1", [-2, 7 + E, 7.75], [-1.5, 8.2, 14]],           // T1 start, the big top-floor room, north past the bed
  ["kitchen_0", [-4.2, E, 10.5], [-2.5, 1.2, 15]],             // the ground-floor kitchen: the run, the table
  ["salon_0", [-5.5, E, 14], [-10, 1.3, 16.5]],                // the salon from the kitchen door: couch, table, TV
  ["bedroom_0", [-2, E, 16.8], [-0.5, 0.8, 11]],               // the bedroom from its north end
  ["bath_0", [-5.9, E, 11.9], [-6.3, 1.0, 13.4]],              // the small bathroom from its door
  ["boiler", [-7.3, E, 7.2], [-10.5, 1.0, 8.5]],               // kotłownia
  ["house_garage", [-4.5, E, 7.5], [-1, 0.8, 8.8]],            // the house garage: bench, chest, tyres, bike
  ["stairs", [-6, E, 10.5], [-9.5, 2.0, 11.5]],                // the stairs from the hall
  ["bedroom_1", [-7.4, 3.5 + E, 7], [-10.5, 4.2, 7.5]],        // first floor: the bedroom
  ["bath_1", [-5.3, 3.5 + E, 7.5], [-3.9, 4.2, 7.5]],          // first floor: the bathroom
  ["kitchen_1", [-3, 3.5 + E, 12.5], [0.5, 4.2, 8]],           // first floor: the big kitchen
  ["salon_1", [-6.5, 3.5 + E, 13.9], [-3, 4.2, 16.5]],         // first floor: the salon and the balcony door
  ["balcony_1", [-5.5, 3.5 + E, 18], [-5.5, 3.5 + E - 0.3, 24]],   // over the garden from the first-floor balcony
  ["room_nw", [-6.8, 7 + E, 14.6], [-9.5, 7.8, 16.5]],         // top floor: the NW room
  ["room_e", [-4.5, 7 + E, 12.5], [-1.5, 7.8, 16.5]],          // top floor: the big east room, TV end
  ["balcony_2", [1.9, 7 + E, 10.75], [8, 7 + E - 0.8, 12]],    // the east balcony over the shed and the garage
  ["shed_mirrors", [6.8, E, 11.25], [3, 1.2, 12.5]],           // the shed: the mirror wall from the door
  ["shed_couch", [3.5, E, 9.5], [6, 1.2, 15]],                 // the shed: the couch and the TV corner
  ["garage_bays", [11, E, 13.8], [13.5, 1.4, 3]],              // the garage: both bays under the hex lights, from the NW corner
  ["garage_bench", [11, E, 8.5], [16, 1.2, 14]],               // the garage: the bench, the chests, the shelves
  ["gates", [13.5, E, -3.5], [13.5, 2, 8]],                    // the garage from the road: both gates
  ["bmw", [-13, E, -4.5], [-9, 0.7, -1.8]],                    // the M240i on the road
  ["bmw_rear", [-4, E, -3.8], [-8, 0.7, -1.8]],
  ["pool", [5, E, 20], [8.2, 1, 23.8]],                        // the pool from the lawn
  ["road", [-18, E, -2.5], [-6, 1.4, -1.5]],                   // the road from the west end
  ["gate", [-2.75, E, -3.5], [-4, 2.5, 6]],                    // the front gate, the house behind
  ["passage", [1.75, E, 4], [1.75, 1.4, 16]],                  // the passage between the house and the shed
  // The two ways out of the house that are not the staircase (owner, 2026-09-27).
  ["escape_window", [-2.85, 7 + E, 9.2], [-2.85, 7.5, 4.5]],       // top floor: the window over the drive, from the room
  ["escape_facade", [-2.85, E, 0.8], [-2.85, 8.0, 5.6]],           // ...and the same window from the drive, seven metres up
  ["balcony_gap", [-7.3, 3.5 + E, 18.2], [-3.6, 3.9, 19.8]],       // first floor: the missing railing on the garden side
  ["overview", [-20, 40, -40], [0, 0, 12]],
  ["overview_plot", [30, 32, 34], [-2, 0, 10]],
];
const only = process.env.VIEWS ? new Set(process.env.VIEWS.split(",")) : null;
const p = await openReview("map=dolna&preset=medium", "dolna");
const metrics = await shoot(p, only ? views.filter(([n]) => only.has(n)) : views, "review_");
log("dolna", metrics.map((m) => `${m.name} ${m.drawCalls} calls/${m.activeMeshes} meshes`).join(" · "));
log("dolna verts", metrics[0].vertices);
await p.close();

// ---- 2. Reference: the district's street (the `street` view of map-review.mjs), same preset.
const r = await openReview("map=night_district&preset=medium", "district");
const ref = await shoot(r, [["night_district_street", [-10, 1.7, -12], [2, 3, 0]]], "ref_");
log("district", ref.map((m) => `${m.name} ${m.drawCalls} calls/${m.activeMeshes} meshes/${m.vertices} verts`).join(" · "));
await r.close();

fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify({ at: new Date().toISOString(), preset: "medium", dolna: metrics, reference: ref, errors }, null, 2) + "\n");
log("errors", errors.length ? errors.slice(0, 6) : "none");
}

// ---- 2. A live duel against one bot on the server, played to the end: the lobby, the freeze, the
// rounds, the result screen — the HUD read back every 5 s (`window.__fb`, FB_DEV_TOOLS=1).
if (process.env.LIVE === "1") {
  const room = "dolna-" + Date.now().toString(36);
  const gameErrors = [];
  const p = await ctx.newPage();
  p.on("pageerror", (e) => gameErrors.push("pageerror: " + String(e.message).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error") gameErrors.push("console: " + m.text().slice(0, 200)); });
  const t0 = Date.now();
  const since = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
  // Drop V's welcome (`onboarding-welcome`) covers the menu of a fresh browser and swallows the
  // first click; mark the player welcomed the way `tutorial.mjs` proves POMIŃ does, then also skip
  // it if it shows anyway.
  await p.addInitScript(() => { try { sessionStorage.setItem("bs_guest_ok", "1"); localStorage.setItem("bs_onboard_v1", JSON.stringify({ welcomed: true })); } catch {} });
  await p.goto(URL);
  await p.getByTestId("onb-skip").click({ timeout: 3000 }).catch(() => {});
  await p.getByTestId("btn-play").click();
  await p.getByTestId("input-name").fill("FRANKI");
  await p.getByTestId("input-room").fill(room);
  await p.getByTestId("mode-duel").click();
  const blurb = (await p.getByTestId("mode-blurb").innerText()).slice(0, 160);
  const fixed = await p.getByTestId("map-fixed").innerText().catch(() => "(no map-fixed hint)");
  await p.getByTestId("map-dolna").click();
  await p.getByTestId("bots-range").fill("1");
  const bots = await p.getByTestId("bots-count").innerText();
  await p.getByTestId("map-picker").screenshot({ path: `${OUT}/live_lobby-maps.png` });
  await p.getByTestId("btn-create").click();
  // The loading card names the map the room really plays (`.loading-eyebrow`); the HUD store
  // carries the room's `mapId` once synced. Both are read before ENTER MATCH.
  await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 120000 });
  const eyebrow = (await p.locator(".loading-eyebrow").innerText().catch(() => "(no eyebrow)")).trim();
  const objective = (await p.getByTestId("loading-objective").innerText().catch(() => "")).trim();
  await p.screenshot({ path: `${OUT}/live_loading.png` });
  await p.getByTestId("enter-game").click({ timeout: 120000 });
  await p.getByTestId("hud").waitFor({ timeout: 90000 });
  await p.waitForFunction(() => window.__fb?.hud.get().myId !== "", null, { timeout: 90000 });
  const state = () => p.evaluate(() => {
    const h = window.__fb.hud.get(); const st = window.__fb.game.conn.state; const rows = [];
    st.players.forEach((q) => rows.push({ name: q.name, team: q.team, alive: q.alive, hp: q.health, money: q.money, weapon: q.weapon, x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10, bot: !!q.bot }));
    return { phase: h.phase, round: h.round, A: h.scoreA, B: h.scoreB, mine: h.myTeam, mapId: h.mapId, mode: h.mode, winnerName: h.winnerName, roundResult: h.roundResult, rows };
  });
  await p.waitForFunction(() => ["prep", "playing"].includes(window.__fb.hud.get().phase), null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const prep = await state();
  await p.screenshot({ path: `${OUT}/live_freeze.png` });
  // Buy a rifle in the freeze, through the real shop message, then watch the round go live.
  await p.evaluate(() => window.__fb.game.conn.send("buy", { item: "rifle" }));
  await p.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(800);
  const live1 = await state();
  await p.screenshot({ path: `${OUT}/live_round1.png` });
  // Sample every 5 s until the match ends: the result phase, a side at DUEL.wins (6), or the cap.
  const samples = [];
  const CAP_MS = 12 * 60_000;
  const over = (s) => s.phase === "ended" || s.A >= 6 || s.B >= 6 || !!s.winnerName;
  let last = live1, midShot = false;
  while (Date.now() - t0 < CAP_MS) {
    await p.waitForTimeout(5000);
    const s = await state().catch((e) => ({ error: String(e.message).slice(0, 120) }));
    if (s.error) { samples.push({ t: since(), error: s.error }); break; }
    const me = s.rows.find((r) => !r.bot), bot = s.rows.find((r) => r.bot);
    samples.push({ t: since(), phase: s.phase, round: s.round, A: s.A, B: s.B, roundResult: s.roundResult, me: me ? `(${me.x}, ${me.z}) hp ${me.hp} ${me.alive ? "alive" : "dead"} $${me.money} ${me.weapon}` : "—", bot: bot ? `(${bot.x}, ${bot.z}) hp ${bot.hp} ${bot.alive ? "alive" : "dead"} $${bot.money} ${bot.weapon}` : "—" });
    if (!midShot && (s.A + s.B) >= 3) { midShot = true; await p.screenshot({ path: `${OUT}/live_mid.png` }); }
    last = s;
    if (over(s)) break;
  }
  const ended = over(last);
  // The result screen, if the match got there.
  const resultShown = await p.getByTestId("result").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const resultTitle = resultShown ? (await p.getByTestId("result-title").innerText().catch(() => "")).trim() : "";
  const resultScore = resultShown ? (await p.getByTestId("result-score").innerText().catch(() => "")).replace(/\s+/g, " ").trim() : "";
  const resultWhy = resultShown ? (await p.getByTestId("result-why").innerText().catch(() => "")).trim() : "";
  await p.screenshot({ path: `${OUT}/live_result.png` });
  const health = await (await fetch("http://localhost:2567/health")).json().catch(() => ({}));
  const dur = since();
  await p.close();

  const md = [];
  md.push(`# DOLNA — pojedynek na żywo z jednym botem (${new Date().toISOString()})`, "");
  md.push(`Pokój \`${room}\`, tryb duel przez menu (\`mode-duel\` → \`map-dolna\` → 1 bot → CREATE → WEJDŹ DO MECZU), preset medium, swiftshader.`, "");
  md.push("## Mapa i tryb", "");
  md.push(`- Karta ładowania (\`.loading-eyebrow\`, tytuł mapy w HUD przed wejściem): **${eyebrow}** ${eyebrow.toUpperCase().includes("DOLNA") ? "✓ DOLNA" : "✗ NIE DOLNA"}`);
  md.push(`- Cel na karcie: ${objective || "(brak)"}`);
  md.push(`- Podpowiedź pod wyborem mapy (\`map-fixed\`): ${fixed}`);
  md.push(`- Blurb trybu: ${blurb}`);
  md.push(`- Boty: ${bots}`);
  md.push(`- Stan pokoju po wejściu: mapId = **${prep.mapId}** ${prep.mapId === "dolna" ? "✓" : "✗"}, mode = ${prep.mode}, moja drużyna = ${prep.mine}`, "");
  md.push("## Freeze i pierwsza runda", "");
  md.push(`- freeze: faza ${prep.phase}, runda ${prep.round}, ${prep.A}:${prep.B}; gracze: ${prep.rows.map((r) => `${r.name}${r.bot ? " (bot)" : ""} T${r.team} @(${r.x}, ${r.z}) $${r.money}`).join(" · ")}  → \`shots/live_freeze.png\``);
  md.push(`- runda na żywo: faza ${live1.phase}, runda ${live1.round}; ${live1.rows.map((r) => `${r.name}${r.bot ? " (bot)" : ""} ${r.weapon} @(${r.x}, ${r.z})`).join(" · ")}  → \`shots/live_round1.png\``, "");
  md.push("## Próbki HUD co 5 s", "");
  md.push("| t | faza | runda | A:B | wynik rundy | ja (x, z) hp stan $ broń | bot (x, z) hp stan $ broń |", "|---|---|---|---|---|---|---|");
  for (const s of samples) md.push(s.error ? `| ${s.t} | BŁĄD | | | ${s.error} | | |` : `| ${s.t} | ${s.phase} | ${s.round} | ${s.A}:${s.B} | ${s.roundResult || ""} | ${s.me} | ${s.bot} |`);
  md.push("");
  md.push("## Wynik", "");
  md.push(`- Mecz ${ended ? "**rozegrany do końca**" : "**NIE dograny** (limit 12 min)"}: faza ${last.phase}, rundy ${last.round}, wynik **${last.A}:${last.B}**, zwycięzca ${last.winnerName || "(brak w HUD)"}, czas ${dur} od wejścia do menu (${samples.length} próbek).`);
  md.push(`- Ekran wyniku (\`[data-testid=result]\`): ${resultShown ? `widoczny — „${resultTitle}” ${resultScore} — ${resultWhy}` : "nie pojawił się"}  → \`shots/live_result.png\``);
  md.push(`- Serwer /health: players ${health.players ?? "?"}, rooms ${health.rooms ?? "?"}`);
  md.push(`- Błędy konsoli / strony: ${gameErrors.length ? "" : "**brak**"}`);
  for (const e of [...new Set(gameErrors)].slice(0, 20)) md.push(`  - ${e}`);
  md.push("");
  fs.writeFileSync("apps/client/e2e/out/dolna/live.md", md.join("\n") + "\n");
  log("live", { room, eyebrow, mapId: prep.mapId, ended, score: `${last.A}:${last.B}`, round: last.round, phase: last.phase, winner: last.winnerName, dur, samples: samples.length, resultShown, errors: gameErrors.length });
}
await b.close();
