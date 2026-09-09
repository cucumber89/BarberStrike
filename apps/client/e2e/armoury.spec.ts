import { expect, test } from "@playwright/test";

test("the main menu exposes the six launch skins and remembers an equipped finish", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByTestId("btn-armoury").click();

  await expect(page.getByTestId("armoury")).toBeVisible();
  for (const id of ["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy"]) {
    await expect(page.getByTestId(`skin-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });

  await page.getByTestId("armoury-weapon-pistol").click();
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.getByTestId("skin-osy").click();
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.getByTestId("skin-osy")).toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bs_profile_v1") ?? "{}").equip?.pistol)).toBe("osy");

  await page.getByTestId("armoury-haircuts").click();
  await expect(page.getByTestId("armoury-haircut-cap")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("armoury-haircut-slickback")).toBeDisabled();
  await page.screenshot({ path: info.outputPath("haircuts.png"), fullPage: true });

  // POSTAĆ: the body picker. Unlike the haircuts nothing here is locked — builds are not earned
  // (Decisions, 2026-09-09) — so every card is clickable from an untouched profile.
  await page.getByTestId("armoury-body").click();
  await expect(page.getByTestId("armoury-build-klasyk")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("character-preview")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  for (const id of ["klasyk", "byk", "tyczka", "barylka", "zylasty", "przygarbiony"]) {
    await expect(page.getByTestId(`armoury-build-${id}`)).toBeEnabled();
  }
  await page.getByTestId("armoury-build-byk").click();
  await expect(page.getByTestId("armoury-build-byk")).toHaveClass(/\bon\b/);
  // The renderer rebuilt the body for the new pick, not just the card's border.
  await expect(page.getByTestId("character-preview")).toHaveAttribute("data-build", "byk");
  await expect(page.getByTestId("character-preview")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bs_profile_v1") ?? "{}").build)).toBe("byk");
  await page.screenshot({ path: info.outputPath("body.png"), fullPage: true });

  // ...and it is still BYK after a reload, which is the whole point of writing it down.
  await page.reload();
  await page.getByTestId("btn-armoury").click();
  await page.getByTestId("armoury-body").click();
  await expect(page.getByTestId("armoury-build-byk")).toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bs_profile_v1") ?? "{}").build)).toBe("byk");

  await page.getByTestId("armoury-skins").click();

  await page.screenshot({ path: info.outputPath("armoury.png"), fullPage: true });
  await page.getByTestId("armoury-crates").click();
  await expect(page.getByTestId("crate-count")).toHaveText("1");
  await page.getByTestId("crate-open").click();
  await expect(page.getByTestId("crate-opening")).toBeVisible();
  await page.screenshot({ path: info.outputPath("crate-rolling.png"), fullPage: true });
  await expect(page.getByTestId("crate-prize")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-winning="true"]')).toBeVisible();
  const [marker, winning] = await Promise.all([
    page.locator(".reel-window > i").boundingBox(),
    page.locator('[data-winning="true"]').boundingBox(),
  ]);
  expect(Math.abs((marker?.x ?? 0) - ((winning?.x ?? 0) + (winning?.width ?? 0) / 2))).toBeLessThan(2);
  await expect(page.getByTestId("crate-count")).toHaveText("0");
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath("crate-prize.png"), fullPage: true });
  expect(errors).toEqual([]);
});
