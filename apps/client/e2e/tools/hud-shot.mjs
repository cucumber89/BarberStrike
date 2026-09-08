#!/usr/bin/env node
/**
 * A picture of the real HUD, so a claim about how it looks is a picture and not an opinion
 * (plan L3). Uses the bench page, which mounts the actual component with a full match state.
 *
 *   node apps/client/e2e/tools/hud-shot.mjs [--url http://localhost:5199] [--label before]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/ui");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:5199");
const LABEL = arg("--label", "hud");
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.error("[page]", e.message));
await page.goto(`${BASE}/hud-bench.html`, { waitUntil: "networkidle" });
// A dark frame behind it: the HUD is drawn over a night map, never over white.
await page.addStyleTag({ content: "body{background:linear-gradient(160deg,#1b1f26 0%,#2a2f38 40%,#12151a 100%)!important}" });
await page.waitForSelector(".hud");
await page.waitForFunction(() => window.bench?.done === true, null, { timeout: 20_000 });
await page.screenshot({ path: `${OUT}/hud-${LABEL}.png` });
await browser.close();
console.log(`wrote ${OUT}/hud-${LABEL}.png`);
