/**
 * THE ROUTE FROM THE WAITING ROOM INTO THE MATCH, in a real browser.
 *
 * This is the check the first live tournament needed and nobody had: the bracket drew, every arena
 * came up, and not one player could get into a match — because on the client NOTHING listened to the
 * „lobby:goto” that says which arena is yours. An arena is raised by the matchmaker, so it has no
 * name to type and appears in no listing: that message is the only way in, and a screen that ignores
 * it leaves its player looking at a bracket.
 *
 * So: a two-seat tournament is hosted over the SDK (the same thing the /viewer console does, minus a
 * second browser tab to go flaky on us), one REAL browser player joins the waiting room through the
 * invite link, both flip ready, the host presses START — and the player's page has to end up inside
 * the arena raised for their pair. Nothing here reaches into the game: it clicks what a player clicks
 * and then reads which room the client ended up in.
 *
 * Needs the dev servers: `node apps/server/dist/index.js` on 2567 and vite on 5174. Run from
 * apps/client:  PW_CHROMIUM=/opt/pw-browsers/chromium node e2e/tools/lobby-play.mjs
 */
import { chromium } from "@playwright/test";
import { Client } from "@colyseus/sdk";

const BASE = process.env.BASE ?? "http://localhost:5174";
const WS = process.env.WS_URL ?? "ws://localhost:2567";
const fail = (m) => { console.log("FAIL:", m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settings = JSON.stringify({
  nickname: "GRACZ1",
  graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false },
});

console.log(`# Z poczekalni na arenę, w przeglądarce — ${BASE}\n\`\`\``);
const room = `lobtest-${Date.now().toString(36)}`;

// ------------------------------------------------------------------ the host raises the tournament
const host = await new Client(WS).create("tournament-lobby", { name: "ADMIN", size: 2, room, map: "dolna", adminKey: process.env.ADMIN_PASSWORD ?? "" });
host.send("lobby:ready", { ready: true });
console.log(`turniej „${room}" na 2 miejsca założony (poczekalnia ${host.roomId})`);

// ------------------------------------------------------------------ one real player joins the lobby
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => { localStorage.setItem("fb_settings_v1", v); localStorage.setItem("bs_guest_ok", "1"); }, settings);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await p.goto(`${BASE}/r/${room}?mode=lobby`);
await p.getByTestId("lobby-roster").waitFor({ timeout: 20000 });
await p.waitForFunction(() => document.querySelectorAll('[data-testid="lobby-entrant"]').length >= 2, null, { timeout: 20000 })
  .catch(() => fail("gracz nie trafił do TEJ poczekalni (link i pokój muszą się zgadzać)"));
const roster = await p.$$eval('[data-testid="lobby-entrant"]', (ns) => ns.map((n) => n.textContent));
console.log(`poczekalnia widziana przez gracza: ${roster.length} — ${roster.join(" | ")}`);

await p.getByTestId("lobby-ready-toggle").click();
for (let i = 0; i < 40 && [...host.state.entrants.values()].filter((e) => e.ready).length < 2; i++) await sleep(150);
const ready = [...host.state.entrants.values()].filter((e) => e.ready).length;
if (ready < 2) fail(`gotowych ${ready}/2 — START nie ma czego rozstawić`);
host.send("lobby:start", {});
console.log(`gotowych: ${ready}/2 → START`);

// ------------------------------------------------------- and the player lands in their pair's arena
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 })
  .catch(() => fail("gracz NIE wszedł do areny po STARCIE — dokładnie ta usterka, co na żywo"));
await p.getByTestId("enter-game").click({ timeout: 30000 });
const inside = await p.evaluate(() => ({
  roomName: window.__fb.game.conn.state.roomName,
  mode: window.__fb.game.conn.state.mode,
  mapId: window.__fb.game.conn.state.mapId,
}));
const arena = [...host.state.arenas.values()][0];
console.log(`gracz w pokoju: „${inside.roomName}"   tryb: ${inside.mode}   mapa: ${inside.mapId}`);
console.log(`arena pary nr ${arena?.matchIndex} w poczekalni: ${arena?.roomId}`);
if (inside.mode !== "duel") fail(`tryb areny = ${inside.mode}, oczekiwano 'duel'`);
if (inside.roomName !== `${host.roomId}-m${arena?.matchIndex}`) fail(`„${inside.roomName}" to nie arena tej pary`);
console.log("```\nOK: gracz z poczekalni wchodzi do areny swojej pary po STARCIE.");
await host.leave();
await browser.close();
process.exit(0);
