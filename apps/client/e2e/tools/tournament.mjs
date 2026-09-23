/**
 * The 1 v 1 tournament, played out on the shipped client over real websockets.
 *
 * One human in a four-player bracket with three bots, which is the smallest thing that exercises
 * everything: a draw, a pair on the map while the others wait, a result that sends somebody up
 * rather than ending the evening, the bracket card between pairs, and a champion at the end.
 *
 * Needs the dev servers (`FB_DEV_TOOLS=1 node apps/server/dist/index.js` on 2567, vite on 5174).
 * Run from apps/client: `PW_CHROMIUM=/opt/pw-browsers/chromium node e2e/tools/tournament.mjs`
 */
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
