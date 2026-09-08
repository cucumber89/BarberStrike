#!/usr/bin/env node
/**
 * Shoots both sides' kits, front and back, so a claim about how they look is a picture and not an
 * opinion (plan L3). `teamKit.test.ts` proves the two bodies are geometrically identical and that
 * the palettes separate; this is what a reviewer actually looks at.
 *
 *   node apps/client/e2e/tools/team-kit.mjs [--url http://localhost:5173]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/kits");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5173");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("[page]", e.message));
await page.goto(`${BASE}/team-kit.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.review?.ready, null, { timeout: 30_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/kits-front.png` });
// From behind: the back panel is half of how a side is read in play.
await page.evaluate(() => window.review.view([0, 1.55, -4.6], [0, 1.0, 0]));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/kits-back.png` });
// Close in on the Marcovia body so the trim and the panels can be judged.
await page.evaluate(() => window.review.view([-0.85, 1.25, 1.9], [-0.85, 1.05, 0]));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/marcovia-close.png` });
await browser.close();
console.log(`wrote ${OUT}/kits-front.png, kits-back.png and marcovia-close.png`);
