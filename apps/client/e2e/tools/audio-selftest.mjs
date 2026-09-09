// Audio self-test driver. Joins a room in headless Chromium (no audio device, but the WebAudio
// graph runs), sends a user gesture, then runs the in-page harness `window.__fbAudio.selfTest()`.
// Usage: node apps/client/e2e/tools/audio-selftest.mjs   (dev servers must be running)
import { chromium } from "@playwright/test";

const CHROME = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false } });
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const room = "audio-" + Date.now();
const errors = [];
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { errors.push(`[${name}] ${e.message}`); console.log(`[${name} pageerror]`, e.message); });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${name} console.${m.type()}]`, m.text()); });
  await page.goto("http://localhost:5174/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(room);
  await page.getByTestId("btn-quickplay").click();
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "", null, { timeout: 30000 });
  return page;
}
const a = await mk("ALPHA");
const b = await mk("BRAVO"); // gives ALPHA a remote player for positional paths
await a.waitForFunction(() => window.__fbAudio && window.__fb.game.frameCount > 5, null, { timeout: 60000 });
await a.mouse.click(300, 200); // user gesture → resume()
await a.keyboard.press("Shift");
const report = await a.evaluate(() => window.__fbAudio.selfTest());
console.log("contextState:", report.contextState, "| voices after:", report.voicesAfter);
for (const o of report.offline) console.log(`${o.ok ? "ok  " : "FAIL"} ${o.name.padEnd(24)} peak ${String(o.peakDb).padStart(6)} dBFS  sustain ${String(o.sustainDb).padStart(6)} dBFS  (${o.seconds.toFixed(2)} s)`);
for (const l of report.live) if (!l.ok) console.log("FAIL live", l.name, l.error);
console.log(`live steps: ${report.live.filter((l) => l.ok).length}/${report.live.length} ok`);
// Let the remote footstep/reload paths run for a moment with BRAVO moving.
await b.keyboard.down("KeyW"); await a.waitForTimeout(1500); await b.keyboard.up("KeyW");
await b.keyboard.press("KeyR");
await a.waitForTimeout(1200);
const after = await a.evaluate(() => ({ state: window.__fbAudio.engine.state, voices: window.__fbAudio.engine.activeVoices }));
console.log("after remote activity:", JSON.stringify(after));
console.log(report.passed && errors.length === 0 ? "AUDIO SELF-TEST PASSED" : "AUDIO SELF-TEST FAILED");
await browser.close();
process.exit(report.passed && errors.length === 0 ? 0 : 1);
