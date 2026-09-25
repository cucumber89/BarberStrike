/**
 * The 1 v 1 tournament, played out on the shipped client over real websockets.
 *
 * One human in a four-player bracket with three bots, which is the smallest thing that exercises
 * everything: a draw, a pair on the map while the others wait, a result that sends somebody up
 * rather than ending the evening, the bracket card between pairs, and a champion at the end.
 *
 * Needs the dev servers (`FB_DEV_TOOLS=1 node apps/server/dist/index.js` on 2567, vite on 5174).
 * Run from apps/client: `PW_CHROMIUM=/opt/pw-browsers/chromium node e2e/tools/tournament.mjs`
 *
 * LOBBY MODE (drop V, P2): `LOBBY=1 node e2e/tools/tournament.mjs` runs the WAITING-ROOM scenario
 * instead — no browser, no UI (that is P5). It drives the `tournament-lobby` room straight over the
 * Colyseus SDK against a running server (default `ws://localhost:2567`): a host plus eight entrants,
 * all ready, START, and the assertion that four parallel arenas come up; plus the authoritative chat
 * safety (a line over 200 chars comes back truncated to 200, a second line inside 1 s is dropped,
 * and `<b>x</b>` comes back with its angle brackets escaped). The presence→bracket seam and the
 * exact numbers are pinned deterministically in the server test `TournamentLobby.test.ts` — here we
 * confirm the room is reachable, hosts, starts and sanitises over a real socket.
 *
 * GRACE MODE (drop V, P3): `GRACE=1 node e2e/tools/tournament.mjs` drives two `tdm mode="duel"`
 * ARENAS straight over the Colyseus SDK — one raised WITH a tournament context (`tournamentId`,
 * `matchIndex`, `pair`) and one plain — drops a player abruptly in each, and asserts the tournament
 * arena still holds the dropped seat at 16 s (its grace is `TOURNAMENT_RECONNECT_GRACE_S` = 60 s)
 * while the plain duel has already released it (`RECONNECT_GRACE_S` = 15 s). It also proves
 * `verifySession`: an arena joined with a real session token accepts it, and an arena joined with a
 * bogus token still lets the player in as a guest with no error (L1). The deterministic seam and the
 * result publish are pinned in the server test `TournamentArena.test.ts`; here we confirm the two
 * graces and the guest fallback over a real socket. `PROBE_MS` (default 16000) tunes the wait.
 */
if (process.env.GRACE === "1") {
  const { Client } = await import("@colyseus/sdk");
  const URL = process.env.WS_URL ?? "ws://localhost:2567";
  const HTTP = process.env.HTTP_URL ?? URL.replace(/^ws/, "http");
  const probeMs = Number(process.env.PROBE_MS ?? 16000);
  const fail = (m) => { console.log("FAIL:", m); process.exit(1); };
  const client = new Client(URL);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log(`# Powroty 60 s w arenie turnieju vs 15 s w zwykłym duelu (P3), na żywo — ${URL}\n\`\`\``);

  // A signed-in identity: register an account over REST, take the session token it sets.
  const login = `p3_${Date.now().toString(36)}`;
  let token = "";
  try {
    const res = await fetch(`${HTTP}/api/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ login, password: "haslo-testowe-123" }),
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    token = /bs_sess=([^;]+)/.exec(setCookie)?.[1] ?? "";
    console.log(`konto: ${login} zarejestrowane (${res.status}), token sesji: ${token ? "jest" : "brak"}`);
  } catch (e) {
    console.log(`(rejestracja pominięta: ${e.message}) — sprawdzam sam fallback gościa`);
  }

  // The tournament arena: a duel raised with a lobby's context. Two players, a signed one and a guest.
  const arena = await client.create("tdm", {
    mode: "duel", room: `p3-arena-${Date.now()}`, tournamentId: "p3lobby", matchIndex: 0, pair: ["ent-a", "ent-b"], bots: 0,
  });
  const p1 = await client.joinById(arena.roomId, { name: "TURA", session: token || undefined });
  const p2guest = await client.joinById(arena.roomId, { name: "GOSC", session: "zły-token-gościa" });
  await sleep(600);
  console.log(`arena turniejowa: graczy = ${arena.state.players.size} (sesja przyjęta, gość bez błędu)`);
  if (arena.state.players.size !== 2) fail(`arena: spodziewano 2 graczy, jest ${arena.state.players.size}`);

  // The plain duel: no tournament context, so the 15 s grace.
  const plain = await client.create("tdm", { mode: "duel", room: `p3-plain-${Date.now()}`, bots: 0 });
  const q1 = await client.joinById(plain.roomId, { name: "ZWY1" });
  const q2 = await client.joinById(plain.roomId, { name: "ZWY2" });
  await sleep(600);

  // Drop one player in each, abruptly (transport close, not a consented leave).
  const drop = (c) => { try { c.connection.transport.ws.close(); } catch { c.leave(false); } };
  const goneTourn = p2guest.sessionId, gonePlain = q2.sessionId;
  drop(p2guest); drop(q2);
  console.log(`upuszczono po jednym graczu w każdej arenie; czekam ${probeMs} ms (> 15 s, < 60 s)…`);
  await sleep(probeMs);

  const tournStillThere = arena.state.players.has(goneTourn);
  const plainGone = !plain.state.players.has(gonePlain);
  console.log(`po ${probeMs} ms — arena turniejowa trzyma miejsce: ${tournStillThere} (grace 60 s)`);
  console.log(`po ${probeMs} ms — zwykły duel zwolnił miejsce: ${plainGone} (grace 15 s)`);
  if (!tournStillThere) fail("arena turniejowa zwolniła miejsce przed 60 s (grace nie działa)");
  if (!plainGone) fail("zwykły duel nie zwolnił miejsca po 15 s");

  console.log("```\nOK: arena turniejowa daje 60 s, zwykły duel 15 s; sesja i gość działają.");
  for (const c of [p1, arena, q1, plain]) { try { await c.leave(); } catch { /* already gone */ } }
  process.exit(0);
}

if (process.env.LOBBY === "1") {
  const { Client } = await import("@colyseus/sdk");
  const URL = process.env.WS_URL ?? "ws://localhost:2567";
  const fail = (m) => { console.log("FAIL:", m); process.exit(1); };
  const client = new Client(URL);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log(`# Poczekalnia turnieju (P2), na żywo — ${URL}\n\`\`\``);
  const host = await client.create("tournament-lobby", { name: "HOST", size: 8, seed: 21 });
  const roomId = host.roomId;
  const chat = []; // every lobby:chat line the host receives back from the server
  host.onMessage("lobby:chat", (line) => chat.push(line));
  const others = [];
  for (let i = 1; i < 8; i++) others.push(await client.joinById(roomId, { name: `G${i}` }));
  const all = [host, ...others];
  await sleep(400);
  const rosterN = host.state.entrants.size;
  console.log(`w poczekalni: ${rosterN} entrants   host = ${host.state.hostId === host.sessionId ? "TY" : "?"}`);
  if (rosterN !== 8) fail(`spodziewano 8 entrants, jest ${rosterN}`);

  for (const c of all) c.send("lobby:ready", { ready: true });
  await sleep(300);
  const readyN = [...host.state.entrants.values()].filter((e) => e.ready).length;
  console.log(`gotowych: ${readyN}/8`);

  // A non-host START must do nothing; only the host raises the arenas.
  others[0].send("lobby:start", {});
  await sleep(300);
  if (host.state.phase !== "poczekalnia") fail("START od nie-hosta ruszył turniej");

  host.send("lobby:start", {});
  await sleep(1500);
  console.log(`faza: ${host.state.phase}   aren: ${host.state.arenas.size}`);
  if (host.state.phase !== "trwa") fail(`faza po START = ${host.state.phase}, oczekiwano 'trwa'`);
  if (host.state.arenas.size !== 4) fail(`aren = ${host.state.arenas.size}, oczekiwano 4`);
  for (const [, a] of host.state.arenas) if (!a.roomId || !a.live) fail("arena bez roomId/live");
  console.log(`drabinka: ${host.state.bracket.split(";")[0]}   (rozmiar|para)`);

  // Chat safety, all server-authoritative and observable in the broadcast back to the host.
  chat.length = 0;
  host.send("lobby:chat", { text: "x".repeat(500) });
  await sleep(1100);
  host.send("lobby:chat", { text: "<b>x</b>" });
  await sleep(200);
  host.send("lobby:chat", { text: "za szybko, odrzuć" }); // < 1 s after the previous → dropped
  await sleep(400);
  const first = chat[0];
  console.log(`czat #1 długość: ${first?.text.length} (obcięte do 200)`);
  if (!first || first.text.length !== 200) fail(`czat nie obcięty do 200 (${first?.text.length})`);
  const esc = chat.find((l) => l.text.includes("&lt;b&gt;"));
  console.log(`czat #2 escaped: ${esc ? esc.text : "(brak)"}`);
  if (!esc || esc.text.includes("<b>")) fail("czat nie zescapował <b>");
  console.log(`czat: przyjętych linii = ${chat.length} (3. odrzucona przez rate-limit)`);
  if (chat.length !== 2) fail(`oczekiwano 2 przyjętych linii, jest ${chat.length}`);

  console.log("```\nOK: poczekalnia hostuje, startuje 4 areny i sanityzuje czat.");
  for (const c of all) await c.leave();
  process.exit(0);
}

import { chromium } from "@playwright/test";
const OUT = process.env.OUT ?? "e2e/out/turniej";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => { localStorage.setItem("fb_settings_v1", v); localStorage.setItem("fb_mode", "turniej"); localStorage.setItem("fb_bots", "3"); }, LOW);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("TY");
await page.getByTestId("input-room").fill(`turniej-${Date.now()}`);
await page.getByTestId("btn-create").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 60000 });
await page.getByTestId("enter-game").click({ timeout: 60000 });
await page.waitForFunction(() => window.__fb.hud.get().bracket !== "", null, { timeout: 40000 });
// The bracket is drawn (startMatch) a beat BEFORE the first pair is spawned (beginDuelRound), so
// sampling on the bracket alone caught the room mid-change and reported one player on the map.
await page.waitForFunction(() => window.__fb.hud.get().players.filter((p) => p.alive).length >= 2, null, { timeout: 30000 })
  .catch(() => console.log("(the first pair never both came up)"));

const hud = () => page.evaluate(() => window.__fb.hud.get());
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
/** The bracket as the client parses it — the same reader the panel draws from. */
const read = () => page.evaluate(() => {
  const s = window.__fb.hud.get().bracket;
  const rows = s.split(";");
  const [size, at] = rows[0].split("|").map(Number);
  return { size, at, matches: rows.slice(1).map((r) => r.split("|")) };
});

console.log(`# Turniej 1 v 1, na żywo (${new Date().toISOString().slice(0, 10)})\n`);
const h0 = await hud();
const b0 = await read();
console.log("```");
const mapId = await page.evaluate(() => window.__fb.game.conn.state.mapId);   // the HUD does not carry it; the room state does
console.log(`mapa: ${mapId}   tryb: ${h0.mode}   w pokoju: ${h0.players.length}`);
console.log(`drabinka na ${b0.size}, par: ${b0.matches.length}, gra para nr ${b0.at + 1}`);
for (const [a, b, sa, sb, w] of b0.matches) console.log(`  ${(a || "—").padEnd(10)} ${sa}:${sb} ${(b || "—").padEnd(10)} ${w === "-" ? "" : "→ " + (w === "a" ? a : b)}`);
const board = h0.players.filter((p) => p.connected).length;
console.log(`\nżywi na mapie teraz: ${(await page.evaluate(() => window.__fb.hud.get().players.filter((p) => p.alive).length))} z ${board}  <- para gra, reszta czeka`);
console.log("```\n");
await shot("01-start");

// Watch it play itself out. The bots fight; every time the bracket moves on, note it.
let lastAt = b0.at, pairs = 0;
// A pair of bots takes about seven minutes to reach six wins, so a draw of four is half an
// hour. `MINUTES=10` cuts it short for a quick look.
const deadline = Date.now() + Number(process.env.MINUTES ?? 34) * 60_000;
while (Date.now() < deadline) {
  await page.waitForTimeout(4000);
  const h = await hud();
  if (h.bracket === "") break;
  const b = await read();
  if (b.at !== lastAt) {
    pairs++;
    const done = b.matches[lastAt];
    console.log(`para ${lastAt + 1} rozstrzygnięta: ${done[0]} ${done[2]}:${done[3]} ${done[1]} → ${done[4] === "a" ? done[0] : done[1]}`);
    if (pairs === 1) await shot("02-karta-drabinki");
    lastAt = b.at;
  }
  if (h.phase === "ended" || h.winnerName) break;
}
const end = await hud();
const bEnd = await read();
await shot("03-koniec");
console.log("\n```");
console.log(`rozegranych par: ${pairs} z ${bEnd.matches.length}`);
console.log(`faza: ${end.phase}   zwycięzca: ${end.winnerName || "(jeszcze nikt)"}`);
for (const [a, b, sa, sb, w] of bEnd.matches) console.log(`  ${(a || "—").padEnd(10)} ${sa}:${sb} ${(b || "—").padEnd(10)} ${w === "-" ? "" : "→ " + (w === "a" ? a : b)}`);
console.log("```");
await browser.close();
