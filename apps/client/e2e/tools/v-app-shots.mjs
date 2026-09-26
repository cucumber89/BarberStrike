#!/usr/bin/env node
/**
 * Drop V "show your friends" gallery: the live app screens, shot with Playwright.
 * Navigates the real client at --url (default 5174), 1600x900, waits for a testid, saves a PNG.
 *
 *   PW_CHROMIUM=<chrome.exe> node e2e/tools/v-app-shots.mjs [--url http://127.0.0.1:5174]
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/v/shots");
const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const BASE = arg("--url", "http://127.0.0.1:5174");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const done = [];
const failed = [];

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("  pageerror:", e.message));
  return { ctx, page };
}

// Onboarding welcome overlay covers the menu the first time — dismiss it if present.
async function dismissWelcome(page) {
  const skip = page.locator('[data-testid="onb-skip"]');
  try { if (await skip.isVisible({ timeout: 1500 })) await skip.click(); } catch {}
}

async function typeNick(page) {
  const inp = page.locator('[data-testid="input-name"]').first();
  await inp.waitFor({ state: "visible", timeout: 5000 });
  await inp.fill("GRACZ");
}

async function shot(page, name, sel, { settle = 700 } = {}) {
  try {
    if (sel) await page.locator(sel).first().waitFor({ state: "visible", timeout: 12000 });
    await page.waitForTimeout(settle);
    const file = `${OUT}/${name}.png`;
    await page.screenshot({ path: file });
    done.push(name);
    console.log("ok  ", name);
  } catch (e) {
    failed.push(`${name}: ${e.message.split("\n")[0]}`);
    console.error("FAIL", name, e.message.split("\n")[0]);
  }
}

// 1. Menu główne
{
  const { ctx, page } = await fresh();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await shot(page, "menu-main", '[data-testid="mm-hero"]', { settle: 1200 });
  await ctx.close();
}

// 2. Panel KONTA
{
  const { ctx, page } = await fresh();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await page.locator('[data-testid="btn-account"]').click();
  await shot(page, "account", '[data-testid="account-panel"]', { settle: 800 });
  await ctx.close();
}

// 3. Ekran zakładania turnieju (tournament-setup) — pick 8 seats, fill nick
{
  const { ctx, page } = await fresh();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await page.locator('[data-testid="turniej-zaloz"]').click();
  await page.locator('[data-testid="tournament-setup"]').waitFor({ state: "visible", timeout: 8000 });
  try { await page.locator('[data-testid="tourn-size-8"]').click(); } catch {}
  await typeNick(page);
  await shot(page, "tournament-setup", '[data-testid="tournament-setup"]', { settle: 700 });

  // 4. Poczekalnia turnieju — press ZAŁÓŻ, wait for the lobby roster (needs server 2567)
  try {
    await page.locator('[data-testid="tourn-create"]').click();
    await shot(page, "tournament-lobby", '[data-testid="lobby-roster"]', { settle: 1500 });
  } catch (e) {
    failed.push(`tournament-lobby: ${e.message.split("\n")[0]}`);
    console.error("FAIL tournament-lobby", e.message.split("\n")[0]);
  }
  await ctx.close();
}

// 5. Tablica sławy /stats
{
  const { ctx, page } = await fresh();
  await page.goto(`${BASE}/stats`, { waitUntil: "networkidle" });
  await shot(page, "hall-of-fame", '[data-testid="hall-of-fame"]', { settle: 1000 });
  await ctx.close();
}

await browser.close();
console.log("\n=== DONE", done.length, "===", done.join(", "));
if (failed.length) console.log("=== FAILED", failed.length, "===\n" + failed.join("\n"));
