// HUD state screenshots with mocked store values (scoreboard, death, result) — dev servers running.
import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-0/-home-user-sidequest/1d2f80ee-f8c5-5282-b5fc-eb567dff361c/scratchpad/shots";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.6, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false } });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
const page = await ctx.newPage();
await page.goto("http://localhost:5174/");
await page.getByTestId("btn-play").click();
await page.getByTestId("input-name").fill("FRANKI");
await page.getByTestId("input-room").fill("hud-" + Date.now());
await page.getByTestId("btn-quickplay").click();
await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 60000 });
await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await page.waitForTimeout(800);
const rows = [
  { id: "a", name: "FRANKI", team: 0, kills: 7, deaths: 3, score: 750, ping: 24, alive: true, connected: true },
  { id: "b", name: "SCISSORHANDS", team: 0, kills: 4, deaths: 5, score: 400, ping: 61, alive: true, connected: true },
  { id: "c", name: "TAPER_KING", team: 1, kills: 6, deaths: 6, score: 650, ping: 38, alive: false, connected: true },
  { id: "d", name: "LOWFADE", team: 1, kills: 2, deaths: 5, score: 200, ping: 120, alive: true, connected: false },
];
await page.evaluate((rows) => window.__fb.hud.set({ players: rows, myId: "a", scoreA: 11, scoreB: 8, killFeed: [{ killer: "a", killerName: "FRANKI", killerTeam: 0, victim: "c", victimName: "TAPER_KING", victimTeam: 1, weapon: "rifle", headshot: true, at: performance.now(), key: 1 }, { killer: "c", killerName: "TAPER_KING", killerTeam: 1, victim: "b", victimName: "SCISSORHANDS", victimTeam: 0, weapon: "shotgun", headshot: false, at: performance.now(), key: 2 }] }), rows);
await page.keyboard.down("Tab"); await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/30-scoreboard.png` });
await page.keyboard.up("Tab");
await page.evaluate(() => window.__fb.hud.set({ alive: false, health: 0, killerName: "TAPER_KING", killerWeapon: "dmr", respawnAt: performance.now() + 2600 }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/31-death.png` });
await page.evaluate(() => window.__fb.hud.set({ alive: true, health: 100, phase: "ended", winner: 0, phaseEndsAt: window.__fb.hud.get().serverNow + 9000 }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/32-result.png` });
console.log("ok");
await browser.close();
