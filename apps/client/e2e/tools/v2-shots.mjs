// Quick capture of the drop V follow-up screens (owner's tweaks): the account gate, the main menu
// with its profile card + mini hall of fame, and the /viewer tournament admin console with the seat
// slider. Needs the client dev server (:5174) and the game server (:2567).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out/v/shots/", import.meta.url));
await mkdir(OUT, { recursive: true });
const CLIENT = process.env.CLIENT_URL ?? "http://localhost:5174";
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });

await page.goto(CLIENT, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
await shot("v2-account-gate");

const guest = page.locator("[data-testid=play-guest]");
if (await guest.count()) { await guest.click(); await page.waitForTimeout(600); }
const skip = page.locator("[data-testid=onb-skip]");
if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }
await shot("v2-menu-profile");

await page.goto(`${CLIENT}/viewer`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await shot("v2-viewer-gate");
const enter = page.locator("[data-testid=admin-enter]");
if (await enter.count()) { await enter.click(); await page.waitForTimeout(1000); }
await shot("v2-viewer-admin");

await browser.close();
console.log("done: v2-account-gate, v2-menu-profile, v2-viewer-gate, v2-viewer-admin");
