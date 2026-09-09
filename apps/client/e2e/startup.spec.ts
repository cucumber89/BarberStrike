import { test, expect } from "@playwright/test";
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
  // The one-screen shop: every aisle is on screen at once, so a grenade and a gun are both
  // reachable without a click. (This used to click GRENADES and CLASSES tabs, which the
  // one-screen layout replaced with aisle headings and a role strip.)
  for (const aisle of ["PRIMARY", "SIDEARM", "GRENADES", "EQUIPMENT"]) {
    await expect(page.getByText(aisle, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("shop-smoke")).toBeVisible();
  await expect(page.getByTestId("shop-smg")).toBeVisible();
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

/** Drop D: the picker offers main's four modes and both party modes. */
test("the lobby offers six modes", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-play").click();
  await expect(page.getByRole("heading", { name: "01 TRYB GRY" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /02 MAPA/ })).toBeVisible();
  for (const m of ["tdm", "boys", "dom", "bomb", "gungame", "ostrzyzeni"]) {
    await expect(page.getByTestId(`mode-${m}`)).toBeVisible();
  }
  await expect(page.getByTestId("mode-ffa")).toHaveCount(0);
  await expect(page.getByTestId("haircut-picker")).toContainText("WYGLĄD POSTACI");
  await page.getByRole("button", { name: /OTWÓRZ SZAFĘ/ }).click();
  await expect(page.getByTestId("armoury")).toBeVisible();
  await page.getByTestId("armoury-haircuts").click();
  await expect(page.getByTestId("armoury-haircut-cap")).toBeVisible();
});
