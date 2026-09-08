/** Drop D evidence: the lobby picker with six modes, and Ostrzyżeni in play with bots. */
import { chromium } from "@playwright/test";
import fs from "node:fs";
const URL = process.env.HOST_URL ?? "http://localhost:2601";
const OUT = "apps/client/e2e/out/d/ostrzyzeni";
fs.mkdirSync(OUT, { recursive: true });
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: false } });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

await p.goto(URL);
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("OWNER");
await p.getByTestId("input-room").fill("ostrz-" + Date.now());
const modes = await p.getByTestId("mode-picker").locator("button").allInnerTexts();
console.log("lobby modes  :", JSON.stringify(modes));
await p.getByTestId("mode-ostrzyzeni").click();
console.log("blurb        :", (await p.getByTestId("mode-blurb").innerText()).slice(0, 100));
await p.getByTestId("mode-picker").screenshot({ path: `${OUT}/lobby-picker.png` });
// Four bots so a round has a chaser and survivors.
await p.getByTestId("bots-range").fill("4");
await p.getByTestId("btn-create").click();
await p.getByTestId("hud").waitFor({ timeout: 60000 });
await p.waitForFunction(() => window.__fb?.hud.get().myId !== "", null, { timeout: 60000 });
await p.waitForFunction(() => window.__fb.hud.get().phase === "prep" || window.__fb.hud.get().phase === "playing", null, { timeout: 60000 });
await p.waitForTimeout(2500);
const shot = async (name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); };
const state = () => p.evaluate(() => {
  const h = window.__fb.hud.get();
  const st = window.__fb.game.conn.state;
  const rows = [];
  st.players.forEach((q) => rows.push({ name: q.name, team: q.team, shaved: !!q.shaved, weapon: q.weapon, alive: q.alive, money: q.money }));
  return { phase: h.phase, round: h.round, scoreA: h.scoreA, scoreB: h.scoreB, mine: { shaved: h.players.find((r) => r.id === h.myId)?.shaved, buy: h.buyWindowLeft }, rows };
});
console.log("prep         :", JSON.stringify(await state()));
await shot("prep");
// Into the live round: watch the chaser convert people.
await p.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 60000 });
await p.waitForTimeout(1500);
console.log("round line   :", (await p.getByTestId("infection-line").innerText()).replace(/\n/g, " | "));
await shot("round-start");
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(10000);
  const s = await state();
  console.log(`t+${(i + 1) * 10}s      :`, `phase=${s.phase} shaved=${s.rows.filter(r => r.shaved).length}/${s.rows.length} A=${s.scoreA} B=${s.scoreB}`);
  if (i === 2) await shot("mid-round");
}
await shot("late-round");
console.log("errors       :", errors.length ? JSON.stringify(errors.slice(0, 3)) : "none");
await b.close();
