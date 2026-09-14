// Screenshots every skin (or a named subset) on a set of weapons in the skin-review page, plus the
// painted texture itself, into e2e/out/skins/. Usage:
//   node apps/client/e2e/tools/skin-review-shots.mjs [--weapons rifle,pistol] [--skins osy,talk] [--views side,back,front]
// Requires `pnpm dev` (or a Vite server on 5174) and the pre-installed Playwright Chromium.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1] ?? ""] : []).filter(Boolean));
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../out/skins"); mkdirSync(out, { recursive: true });
const base = process.env.SKIN_REVIEW_URL ?? "http://localhost:5174/e2e/tools/skin-review.html";
const weapons = (args.weapons ?? "rifle").split(",").filter(Boolean);
const views = (args.views ?? "side").split(",").filter(Boolean);

// `PW_CHROMIUM` (or the container's pre-installed binary) sidesteps a Playwright/browser version mismatch.
const executablePath = process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", e => console.error("pageerror", e.message));
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("[data-testid=skin-review]");
if (args.sheet) {
  // One screenshot per collection section: the 2D art of every card, the fastest way to review the catalogue.
  for (const weapon of weapons) {
    await page.click(`[data-testid=weapon-${weapon}]`); await page.waitForTimeout(300);
    const sections = await page.$$("main > section");
    for (const [i, section] of sections.entries()) { await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(700); await section.screenshot({ path: `${out}/sheet--${weapon}--${i + 1}.png` }); }
  }
  await browser.close(); process.exit(0);
}
const skins = args.skins ? args.skins.split(",") : await page.$$eval("[data-testid^=skin-][data-testid!=skin-review][data-testid!=skin-preview]", els => els.map(e => e.dataset.testid.slice(5)));
for (const weapon of weapons) {
  await page.click(`[data-testid=weapon-${weapon}]`);
  for (const skin of skins) {
    const card = await page.$(`[data-testid=skin-${skin}]`);
    if (!card) { console.warn("no card", skin); continue; }
    if (await card.evaluate(e => e.disabled)) continue;
    await card.click();
    await page.waitForFunction(() => document.querySelector("[data-testid=skin-preview]")?.dataset.ready === "true", null, { timeout: 30000 });
    for (const view of views) {
      await page.click(`[data-testid=view-${view}]`).catch(() => {});
      await page.waitForTimeout(view === views[0] ? 350 : 250);
      await page.locator(".stage").screenshot({ path: `${out}/${weapon}--${skin}--${view}.png` });
    }
    if (args.texture !== "no") await page.locator("[data-testid=skin-texture]").screenshot({ path: `${out}/${weapon}--${skin}--texture.png` }).catch(() => {});
  }
}
console.log(JSON.stringify(await page.evaluate(() => globalThis.__skinDiagnostics?.()), null, 0));
await browser.close();
