import { test, expect, type Page } from "@playwright/test"; import { mkdirSync, writeFileSync } from "node:fs"; import { fileURLToPath } from "node:url";
const low = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: .5, shadows: "off", postProcessing: false, effects: .3, antialiasing: false, importedModels: false } });
test("clean entry, deferred spawn, visible buy timer and shop categories", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(value => { localStorage.setItem("fb_settings_v1", value); localStorage.setItem("fb_bots", "2"); localStorage.setItem("fb_mode", "boys"); }, low);
  await page.goto("/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill("Startup test");
  await page.getByTestId("input-room").fill(`startup-${Date.now()}`);
  await page.getByTestId("btn-create").click();
  await expect(page.getByTestId("loading")).toBeVisible();
  await expect(page.getByTestId("menu")).toHaveCount(0);
  await expect(page.getByTestId("hud")).toHaveCount(0);
  await expect(page.getByTestId("enter-game")).toBeVisible({ timeout: 75000 });
  await expect(page.getByTestId("pause")).toHaveCount(0);
  expect(await page.evaluate(() => window.__fb.hud.get().alive)).toBe(false);
  await page.screenshot({ path: info.outputPath("ready.png") });
  await page.getByTestId("enter-game").click();
  await expect(page.getByTestId("loading")).toHaveCount(0);
  await expect(page.getByTestId("hud")).toBeVisible();
  // Whatever goes fullscreen has to CONTAIN the UI. A fullscreen element is promoted to the
  // browser's top layer, and everything outside it stops being painted and stops taking clicks —
  // when it was the canvas host alone, entering a match left the player with the barbershop and no
  // HUD, no buy menu, no pause card (MEASURED: a screenshot at an open buy menu showed no UI, and
  // a click meant for a BUY button was reported as intercepted by the canvas). A browser that
  // refuses fullscreen is fine and normal; one that grants it around half the app is not.
  expect(await page.evaluate(() => {
    const fs = document.fullscreenElement, hud = document.querySelector('[data-testid="hud"]');
    return fs === null || (!!hud && fs.contains(hud));
  }), "fullscreen must cover the HUD, not just the canvas").toBe(true);
  // Software browsers may reject real pointer lock; exercise the same event the browser delivers.
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  await expect.poll(() => page.evaluate(() => window.__fb.hud.get().alive)).toBe(true);
  await expect(page.getByTestId("pause")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__fb.hud.get().phase), { timeout: 20000 }).toBe("playing");
  // Random spawns can be next to a station, where buying intentionally has no limit.
  await page.evaluate(() => {
    const flag = window.__fb.game.mapDefinition.flags[0];
    (window.__fb.game as unknown as { conn: { send(t: string, m: unknown): void } }).conn.send("dev:teleport", { x: flag.x, y: flag.y, z: flag.z });
  });
  await expect.poll(() => page.evaluate(() => {
    const left = window.__fb.hud.get().buyWindowLeft;
    return Number.isFinite(left) && left > 20000 && left <= 30000;
  }), { timeout: 10000 }).toBe(true);
  const left = await page.evaluate(() => window.__fb.hud.get().buyWindowLeft);
  expect(left).toBeGreaterThan(20000); expect(left).toBeLessThanOrEqual(30000);
  await expect(page.getByTestId("buy-countdown")).toHaveText(/\d+s/);
  await page.screenshot({ path: info.outputPath("hud.png") });
  await page.evaluate(() => window.__fb.game.setShopOpen(true));
  await expect(page.getByTestId("shop-countdown")).toContainText(/\d+s/);
  // CS2's five aisles on the rail, each also a digit key: pistols, the mid-tier, the rifles, gear,
  // grenades. Every tab has to be reachable by click as well as by key.
  for (const t of [1, 2, 3, 4, 5]) await expect(page.getByTestId(`shop-tab-${t}`)).toBeVisible();
  await page.getByTestId("shop-tab-2").click();
  await expect(page.getByTestId("shop-smg")).toBeVisible();
  await page.getByTestId("shop-tab-5").click();
  await expect(page.getByTestId("shop-smoke")).toBeVisible();
  await page.getByTestId("shop-tab-1").click();
  await page.screenshot({ path: info.outputPath("shop.png") });
  await expect(page.getByTestId("boys-picker")).toBeVisible();
  expect(errors).toEqual([]);
});
test("cancelled connection cannot replace the menu with a late game", async ({ page }) => {
  await page.route("**/matchmake/**", async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto("/"); await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill("Cancel test");
  await page.getByTestId("btn-create").click();
  await page.getByTestId("loading-cancel").click();
  await expect(page.getByTestId("menu")).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId("loading")).toHaveCount(0);
  await expect(page.getByTestId("hud")).toHaveCount(0);
  await expect(page.locator(".game-canvas-host canvas")).toHaveCount(0);
});

/**
 * Drop D — join by link. The lobby a friend's `/r/<room>` link opens asks for a nickname and
 * nothing else, and CHANGE opens the full one with the link's room and mode already filled in.
 * (This lived in `menu.spec.ts`, which the structure refactor removed; the check did not.)
 */
test("a /r/<room> link asks for a nickname only, and CHANGE opens the full lobby", async ({ page }) => {
  await page.goto("/r/late-shift?mode=gungame");
  await expect(page.getByTestId("link-join")).toBeVisible();
  await expect(page.getByTestId("link-room")).toHaveText("late-shift");
  await expect(page.getByTestId("link-mode")).toHaveText("GUN");
  await expect(page.getByTestId("input-room")).toHaveCount(0);
  await expect(page.getByTestId("mode-picker")).toHaveCount(0);
  await expect(page.getByTestId("btn-quickplay")).toBeDisabled();
  await page.getByTestId("input-name").fill("Franki");
  await expect(page.getByTestId("btn-quickplay")).toBeEnabled();
  await page.getByTestId("btn-link-edit").click();
  await expect(page.getByTestId("input-room")).toHaveValue("late-shift");
  await expect(page.getByTestId("mode-gungame")).toHaveAttribute("aria-checked", "true");
  // And the lobby can MAKE one: the link names this room in this mode.
  await page.getByTestId("btn-invite").click();
  const link = await page.getByTestId("invite-link").inputValue();
  expect(link).toContain("/r/late-shift");
  expect(link).toContain("mode=gungame");
});

/** Drop D: the picker offers main's four modes and both party modes; drop T added the tournament. */
test("the lobby offers every mode it has", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-play").click();
  await expect(page.getByRole("heading", { name: "01 TRYB GRY" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /02 MAPA/ })).toBeVisible();
  for (const m of ["tdm", "boys", "dom", "bomb", "gungame", "ostrzyzeni", "duel", "turniej"]) {
    await expect(page.getByTestId(`mode-${m}`)).toBeVisible();
  }
  // The 1 v 1 and the tournament are both played on the arena, and the picker says so instead of
  // offering a map choice the server overrides.
  await page.getByTestId("mode-duel").click();
  await expect(page.getByTestId("map-fixed")).toBeVisible();
  await expect(page.getByTestId("map-gora")).toBeVisible();
  await expect(page.getByTestId("map-night_district")).toHaveCount(0);
  await page.getByTestId("mode-tdm").click();
  await expect(page.getByTestId("map-night_district")).toBeVisible();
  await expect(page.getByTestId("mode-ffa")).toHaveCount(0);
  await expect(page.getByTestId("haircut-picker")).toContainText("WYGLĄD POSTACI");
  await page.getByRole("button", { name: /OTWÓRZ SZAFĘ/ }).click();
  await expect(page.getByTestId("armoury")).toBeVisible();
  await page.getByTestId("armoury-haircuts").click();
  await expect(page.getByTestId("armoury-haircut-cap")).toBeVisible();
});

/**
 * Drop T: the front page is where you get into a match and where your crate lives.
 *
 * Both used to be somewhere else. The match rows on the title screen were `div`s — you could read
 * that a game was running and then had to press GRAJ and find the same row again in the browser to
 * join it — and the crate was two screens in, behind SZAFA and its SKRZYNKI tab.
 */
test("the front page joins a match and opens a crate", async ({ page }) => {
  // One stubbed match, so the row is there whatever the real server is doing.
  await page.route("**/rooms", (route) => route.fulfill({ json: [
    { roomId: "front-1", clients: 3, maxClients: 12, metadata: { name: "front-page", map: "night_district", mode: "tdm" } },
  ] }));
  // No crate is seeded: a profile that has never played is given its one daily crate on the spot,
  // which is the same starting point `armoury.spec.ts` measures the wardrobe from.
  await page.goto("/");

  // The match is a button on the title screen, and it carries the JOIN affordance.
  const row = page.getByTestId("room-front-1");
  await expect(row).toBeVisible();
  await expect(row).toContainText("front-page");
  expect(await row.evaluate((el) => el.tagName)).toBe("BUTTON");

  // Clicking it without a nickname does not navigate — it asks for the name, in place.
  await row.click();
  await expect(page.getByTestId("menu")).toBeVisible();
  await expect(page.getByTestId("input-name")).toBeFocused();

  // The crate is on this screen too, and it opens the same reel the wardrobe opens.
  await expect(page.getByTestId("crate-tile")).toBeVisible();
  await expect(page.getByTestId("crate-count")).toHaveText(/^MASZ1$/);
  await page.getByTestId("crate-open").click();
  await expect(page.getByTestId("crate-opening")).toBeVisible();
  await expect(page.getByTestId("crate-prize")).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("crate-count")).toHaveText(/^MASZ0$/);
});

/**
 * Drop U (P7, docs/UI_U_SPEC.md §6.1): every screen change goes through black. These two enter a
 * match and watch the black from inside the page.
 */
const P7_OUT = fileURLToPath(new URL("./out/u/p7/", import.meta.url));

/** Menu → a fresh room with no bots → the READY card; the fade is back to clear before we go on. */
async function toReady(page: Page, name: string): Promise<void> {
  await page.addInitScript(value => { localStorage.setItem("fb_settings_v1", value); localStorage.setItem("fb_bots", "0"); }, low);
  await page.goto("/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(`fade-${Date.now()}`);
  await page.getByTestId("btn-create").click();
  await expect(page.getByTestId("enter-game")).toBeVisible({ timeout: 75000 });
  await expect.poll(() => fadeOpacity(page)).toBe(0);
}

const fadeOpacity = (page: Page): Promise<number> =>
  page.evaluate(() => { const f = document.querySelector('[data-testid="fade"]'); return f ? Number(getComputedStyle(f).opacity) : -1; });

/** One animation frame as the probe saw it. */
interface ProbeFrame { t: number; fade: number; loading: boolean; canvas: boolean; dormant: boolean }

test("fade on enter", async ({ page }) => {
  await toReady(page, "Fade test");
  await page.getByTestId("enter-game").click();
  // The black comes in over 200 ms and holds while the server spawns us… (the generous timeout is
  // headless Chromium's: entering fullscreen it draws no frame for seconds, measured up to 6 s)
  await expect.poll(() => fadeOpacity(page), { timeout: 10000 }).toBeGreaterThanOrEqual(0.99);
  // …the loading card leaves under it…
  await expect(page.getByTestId("loading")).toHaveCount(0, { timeout: 30000 });
  // …and from there the black is gone within 1200 ms (400 ms out, plus two frames on SwiftShader).
  await expect.poll(() => fadeOpacity(page), { timeout: 1200, intervals: [50] }).toBe(0);
  await expect(page.getByTestId("hud")).toBeVisible();
});

test("no shared frame", async ({ page }) => {
  await toReady(page, "Probe test");
  // Per animation frame: the fade's opacity, whether the loading card, the game canvas and a
  // dormant HUD are on screen. A frame that shows the loading card and the live canvas together,
  // or the canvas under a HUD that is not awake yet, must be black.
  await page.evaluate(() => {
    const log: ProbeFrame[] = [];
    const w = window as unknown as { __enterProbe: { log: ProbeFrame[]; stop: boolean } };
    w.__enterProbe = { log, stop: false };
    const t0 = performance.now();
    const tick = () => {
      const fade = document.querySelector('[data-testid="fade"]');
      const loading = document.querySelector('[data-testid="loading"]');
      const host = document.querySelector(".game-canvas-host");
      const hud = document.querySelector(".hud");
      log.push({
        t: Math.round(performance.now() - t0),
        fade: fade ? Number(getComputedStyle(fade).opacity) : 0,
        loading: !!loading && loading.checkVisibility(),
        canvas: !!host && getComputedStyle(host).visibility === "visible" && !!host.querySelector("canvas"),
        dormant: !!hud && hud.classList.contains("dormant"),
      });
      if (!w.__enterProbe.stop && log.length < 20000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId("enter-game").click();
  await expect(page.getByTestId("loading")).toHaveCount(0, { timeout: 30000 });
  await expect.poll(() => fadeOpacity(page), { timeout: 10000 }).toBe(0);
  // Two more frames of the match in the clear: SwiftShader draws a few a second, so time alone
  // (the first draft waited 200 ms) can end the log before the probe has seen one.
  const seen = await page.evaluate(() => (window as unknown as { __enterProbe: { log: ProbeFrame[] } }).__enterProbe.log.length);
  await page.waitForFunction((n) => (window as unknown as { __enterProbe: { log: ProbeFrame[] } }).__enterProbe.log.length >= n + 2, seen, { timeout: 10000 });
  const log = await page.evaluate(() => {
    const w = window as unknown as { __enterProbe: { log: ProbeFrame[]; stop: boolean } };
    w.__enterProbe.stop = true;
    return w.__enterProbe.log;
  });
  const shared = log.filter((f) => f.fade < 0.99 && ((f.loading && f.canvas) || (f.canvas && f.dormant)));
  mkdirSync(P7_OUT, { recursive: true });
  writeFileSync(`${P7_OUT}enter-probe.json`, JSON.stringify({ frames: log.length, shared: shared.length, sharedFrames: shared, log }, null, 2) + "\n");
  expect(log.some((f) => f.fade >= 0.99), "the screen went black on the way in").toBe(true);
  expect(log.some((f) => f.loading && f.fade < 0.01), "the probe saw the loading card before the black").toBe(true);
  expect(log.some((f) => f.canvas && !f.dormant && !f.loading && f.fade < 0.01), "…and the match after it").toBe(true);
  expect(shared, `${shared.length} of ${log.length} frames showed two screens at once`).toEqual([]);
});
