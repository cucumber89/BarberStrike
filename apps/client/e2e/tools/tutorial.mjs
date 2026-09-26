/**
 * Onboarding for new players (drop V, P8b — V_SPEC §5, §7 P8b), on the shipped client over real
 * websockets. Two things, both from the spec's acceptance line:
 *
 *   1. `onb-skip` marks the player welcomed (localStorage `bs_onboard_v1`), so the welcome never
 *      greets a returning player.
 *   2. In the five-step tutorial, five actions walk `tutorial-step` 1 → 5 over a live duel.
 *
 * The welcome shows once — a fresh browser context each run keeps localStorage empty, which is what
 * makes it appear at all. The five actions are driven the way a player performs them: WASD, the
 * right mouse button (aim), the left (fire), R (reload), a weapon key.
 *
 * Needs the dev servers (`FB_DEV_TOOLS=1 node apps/server/dist/index.js` on 2567, vite on 5174).
 * Run from apps/client: `PW_CHROMIUM=/opt/pw-browsers/chromium node e2e/tools/tutorial.mjs`
 */
import { chromium } from "@playwright/test";
const URL = process.env.URL ?? "http://localhost:5174/";
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 0.5, shadows: "off", postProcessing: false, effects: 0.4, antialiasing: false } });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`); if (!ok) failures++; };

console.log(`# Onboarding nowych graczy (${new Date().toISOString().slice(0, 10)})\n`);

// ------------------------------------------------------------------- 1. POMIŃ → welcomed
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(URL);
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 15000 });
  check(true, "ekran powitalny pokazany raz (bs_onboard_v1 puste)");
  check(await page.getByTestId("onb-tutorial").isVisible() && await page.getByTestId("onb-training").isVisible() && await page.getByTestId("onb-skip").isVisible(),
    "trzy wybory: onb-tutorial / onb-training / onb-skip");
  await page.getByTestId("onb-skip").click();
  await page.getByTestId("onboarding-welcome").waitFor({ state: "detached", timeout: 5000 });
  const welcomed = await page.evaluate(() => { try { return !!JSON.parse(localStorage.getItem("bs_onboard_v1") || "{}").welcomed; } catch { return false; } });
  check(welcomed, "onb-skip → bs_onboard_v1.welcomed = true");
  // A reload does not bring it back.
  await page.reload();
  await page.getByTestId("menu").waitFor({ timeout: 10000 });
  check(!(await page.getByTestId("onboarding-welcome").isVisible().catch(() => false)), "po ponownym wejściu powitanie się nie pokazuje");
  await ctx.close();
}

// ------------------------------------------------------- 2. SAMOUCZEK: 5 akcji → step 1→5
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(URL);
  await page.getByTestId("input-name").fill("NOWY").catch(() => {});
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 15000 });
  await page.getByTestId("onb-tutorial").click();
  // The menu unmounts and the duel loads; the overlay lives at the app root, so it is there through
  // the swap. Enter the match, then wait for the overlay and the first pair to be alive.
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 60000 });
  await page.getByTestId("enter-game").click({ timeout: 60000 });
  await page.getByTestId("tutorial-overlay").waitFor({ timeout: 40000 });
  await page.waitForFunction(() => window.__fb.hud.get().alive, null, { timeout: 40000 }).catch(() => {});

  const stepNow = () => page.getByTestId("tutorial-step").getAttribute("data-step").then(Number);
  const canvas = page.locator(".game-canvas");
  const box = await canvas.boundingBox();
  const cx = box ? box.x + box.width / 2 : 640, cy = box ? box.y + box.height / 2 : 360;

  check(await stepNow() === 1, "start na kroku 1");

  // The five actions, one per step, waiting for the overlay to advance after each.
  const advanceTo = async (n) => {
    await page.waitForFunction((want) => Number(document.querySelector('[data-testid="tutorial-step"]')?.getAttribute("data-step")) >= want, n, { timeout: 8000 })
      .then(() => true).catch(() => false);
  };

  // 1 → 2: move (WASD).
  await page.keyboard.press("KeyW"); await page.keyboard.press("KeyA"); await page.keyboard.press("KeyD");
  await advanceTo(2); check(await stepNow() >= 2, "akcja 1 (ruch WASD) → krok 2");

  // 2 → 3: aim down sights (right mouse button held).
  await page.mouse.move(cx, cy); await page.mouse.down({ button: "right" });
  await advanceTo(3); await page.mouse.up({ button: "right" });
  check(await stepNow() >= 3, "akcja 2 (celowanie PPM) → krok 3");

  // 3 → 4: fire (left mouse button).
  await page.mouse.down({ button: "left" }); await page.mouse.up({ button: "left" });
  await advanceTo(4); check(await stepNow() >= 4, "akcja 3 (strzał LPM) → krok 4");

  // 4 → 5: reload (R).
  await page.keyboard.press("KeyR");
  await advanceTo(5); check(await stepNow() >= 5, "akcja 4 (przeładowanie R) → krok 5");

  // 5 → finished: switch weapon (2 then 1), the overlay stops itself.
  await page.keyboard.press("Digit2"); await page.keyboard.press("Digit1");
  const gone = await page.getByTestId("tutorial-overlay").waitFor({ state: "detached", timeout: 8000 }).then(() => true).catch(() => false);
  check(gone, "akcja 5 (zmiana broni) → samouczek zakończony");

  await ctx.close();
}

console.log(`\n${failures === 0 ? "WSZYSTKO ZIELONE" : `${failures} NIEPOWODZEŃ`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
