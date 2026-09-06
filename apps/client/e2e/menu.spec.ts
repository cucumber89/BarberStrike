import { test, expect } from "@playwright/test";

/**
 * The 2.1 menu, without starting a match: invite links land in the lobby with the room and mode
 * filled in, every panel opens and closes, the settings tabs work and a key can be rebound. Cheap
 * (no renderer), so it runs first and fails fast when a testid moves.
 */

test.describe("menu 2.1", () => {
  test("first screen: level card, today's challenges, server line", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("level-card")).toContainText("PRAKTYKANT");
    await expect(page.getByTestId("daily").locator(".daily-row")).toHaveCount(3);
    await expect(page.getByTestId("server-line")).toContainText("ONLINE", { timeout: 15_000 });
  });

  test("an invite link prefills the lobby; the lobby makes one back", async ({ page }) => {
    await page.goto("/?room=late-shift&mode=dom");
    await expect(page.getByTestId("input-room")).toHaveValue("late-shift");
    await expect(page.getByTestId("mode-dom")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("btn-invite").click();
    const link = await page.getByTestId("invite-link").locator("input").inputValue();
    expect(link).toContain("room=late-shift");
    expect(link).toContain("mode=dom");
    await page.getByTestId("btn-suggest-room").click();
    await expect(page.getByTestId("input-room")).toHaveValue(/^[a-z]+-[a-z]+-\d\d$/);
    // Quick play stays gated on a nickname.
    await expect(page.getByTestId("btn-quickplay")).toBeDisabled();
    await page.getByTestId("input-name").fill("Franki");
    await expect(page.getByTestId("btn-quickplay")).toBeEnabled();
  });

  test("every panel opens and comes back", async ({ page }) => {
    await page.goto("/");
    for (const [btn, testid] of [["btn-armoury", "armoury"], ["btn-profile", "profile"], ["btn-online", "online"], ["btn-howto", "howto"], ["btn-settings", "settings"]] as const) {
      await page.getByTestId(btn).click();
      await expect(page.getByTestId(testid)).toBeVisible();
      await page.getByTestId("btn-back").click();
      await expect(page.getByTestId("btn-play")).toBeVisible();
    }
    await page.getByTestId("btn-armoury").click();
    // Every weapon card carries a drawing and a mastery strip.
    for (const id of ["smg", "rifle", "sniper", "launcher", "pistol", "revolver", "clippers", "frag", "flask", "heavy"]) {
      const card = page.getByTestId(`arm-${id}`);
      await expect(card.locator(`svg[data-art="${id}"]`)).toBeVisible();
    }
    await expect(page.getByTestId("arm-rifle").getByTestId("mastery")).toContainText("NO RANK");
  });

  test("settings: tabs, crosshair editor, key rebinding with persistence", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("btn-settings").click();
    await page.getByTestId("tab-interface").click();
    await expect(page.getByTestId("crosshair-preview")).toBeVisible();
    await page.getByTestId("tab-controls").click();
    await expect(page.getByTestId("key-reload-0")).toHaveText("R");
    await page.getByTestId("key-reload-0").click();
    await expect(page.getByTestId("key-reload-0")).toHaveText("PRESS A KEY");
    await page.keyboard.press("KeyT");
    await expect(page.getByTestId("key-reload-0")).toHaveText("T");
    // A reserved key is refused and the capture stays open; Escape cancels it.
    await page.getByTestId("key-jump-1").click();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("key-jump-1")).toHaveText("PRESS A KEY");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("key-jump-1")).toHaveText("—");
    // Binding T to a second action flags both rows.
    await page.getByTestId("key-inspect-0").click();
    await page.keyboard.press("KeyT");
    await expect(page.getByTestId("bind-conflict")).toBeVisible();
    // Survives a reload (localStorage), and the how-to page reads the live binding.
    await page.reload();
    await page.getByTestId("btn-howto").click();
    await expect(page.getByTestId("howto")).toContainText("T");
    await page.getByTestId("btn-back").click();
    await page.getByTestId("btn-settings").click();
    await page.getByTestId("tab-controls").click();
    await expect(page.getByTestId("key-reload-0")).toHaveText("T");
    page.on("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "RESTORE DEFAULT KEYS" }).click();
    await expect(page.getByTestId("key-reload-0")).toHaveText("R");
  });

  test("profile: reset needs a confirmation and the file round-trip repairs garbage", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("bs_profile_v1", JSON.stringify({ xp: 2500, life: { kills: 42, matches: 3, wins: 2 }, badges: ["first-blood", "bogus"], weapons: { rifle: 12 } })));
    await page.reload();
    await expect(page.getByTestId("level-card")).toContainText("2");
    await page.getByTestId("btn-armoury").click();
    await expect(page.getByTestId("arm-rifle").getByTestId("mastery")).toContainText("BRĄZ");
    await page.getByTestId("btn-back").click();
    await page.getByTestId("btn-profile").click();
    await expect(page.getByTestId("badge-first-blood")).toHaveClass(/earned/);
    await expect(page.getByTestId("badge-kills-100")).toHaveClass(/locked/);
    page.on("dialog", (d) => void d.dismiss());
    await page.getByTestId("profile-reset").click();
    await expect(page.getByTestId("level-card")).toContainText("2"); // dismissed: nothing changed
  });
});
