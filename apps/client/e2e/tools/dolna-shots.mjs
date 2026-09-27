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
 *       LIVE=1 SKIP_REVIEW=1 … for the duel alone.
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
  ["start_t0", [-3.4, E, 17.0], [-4.0, 1.5, 17.0]],           // T0 start in the shed, at its west door
  ["shed_interior", [3.9, E, 17.0], [-3.0, 1.2, 16.2]],       // from the east door, west across the chairs
  ["start_t1", [-7.0, E, -23.6], [-6.95, 1.5, -17.4]],        // T1 start in the shell, at the north door
  ["site_yard", [-3.25, E, -8.5], [0, 2.5, 10]],              // from the mesh gate, north over the street to the house
  ["street_w", [-28, E, -4.5], [28, 1.4, -4.5]],              // the long line of the road, west end
  ["street_e", [28, E, -4.5], [-28, 1.4, -4.5]],              // ... and from the east end
  ["gate", [8, E, -4], [8.1, 2.5, 10]],                       // through the gate at the house
  ["wicket", [-2.2, E, -4], [-2.25, 1.5, 10]],                // through the wicket
  // East across the front from just east of the thuja row (x −8.6..−6.4): from inside the pocket
  // at x −9 the row's face 0.4 m away is the whole frame, which was a foliage-green blank.
  ["front_yard", [-6.1, E, 2.4], [11.8, 1.4, 2.4]],
  ["pocket", [-11.2, E, 4.6], [-2, 1.4, -4]],                 // the pocket behind the hedge gap, looking out at the street
  ["garage", [-2.7, E, 1], [-2.75, 1.2, 12]],                 // into the open garage door
  ["hall", [-6, E, 31], [-6, 1.8, 42]],                       // into the roller door
  ["hall_interior", [-4, E, 40.5], [-7, 2.4, 37.5]],          // south-west at the lifted car
  ["garden", [0, E, 21], [0, 1.8, 42]],                       // north over the lawn to the hall
  ["overview", [0, 45, -40], [0, 0, 10]],
  ["overview_plot", [-30, 30, 20], [0, 0, 20]],
];
const p = await openReview("map=dolna&preset=medium", "dolna");
const metrics = await shoot(p, views, "review_");
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
  await p.addInitScript(() => { try { localStorage.setItem("bs_onboard_v1", JSON.stringify({ welcomed: true })); } catch {} });
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
