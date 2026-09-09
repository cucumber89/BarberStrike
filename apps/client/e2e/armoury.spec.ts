import { expect, test } from "@playwright/test";

test("the main menu exposes the six launch skins and remembers an equipped finish", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByTestId("btn-armoury").click();

  await expect(page.getByTestId("armoury")).toBeVisible();
  await expect(page.getByTestId("crate-count")).toHaveText("1");
  for (const id of ["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy"]) {
    await expect(page.getByTestId(`skin-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });

  await page.getByTestId("armoury-weapon-pistol").click();
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "false");
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.getByTestId("skin-osy").click();
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "false");
  await expect(page.getByTestId("skin-preview")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.getByTestId("skin-osy")).toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bs_profile_v1") ?? "{}").equip?.pistol)).toBe("osy");
  await page.screenshot({ path: info.outputPath("armoury.png"), fullPage: true });
  await page.getByTestId("crate-open").click();
  await expect(page.getByTestId("crate-prize")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("crate-count")).toHaveText("0");
  expect(errors).toEqual([]);
});
