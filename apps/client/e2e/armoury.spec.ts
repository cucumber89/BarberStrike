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
