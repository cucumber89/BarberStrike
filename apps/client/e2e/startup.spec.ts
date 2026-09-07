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
  await page.getByRole("button", { name: "GRENADES", exact: true }).click();
  await expect(page.getByTestId("shop-smoke")).toBeVisible();
  await expect(page.getByTestId("shop-smg")).toBeHidden();
  await page.screenshot({ path: info.outputPath("shop.png") });
  await page.getByRole("button", { name: "CLASSES", exact: true }).click();
  await expect(page.getByText("THE BOYS · CHOOSE YOUR ROLE")).toBeVisible();
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
