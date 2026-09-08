#!/usr/bin/env node
/**
 * Does the buy menu actually fit? Measured, not asserted.
 *
 * The player report was that the shop needs scrolling. The rebuilt menu claims to fit one screen
 * with nothing cut off. This drives the real component in a real browser at every resolution the
 * brief names, and reads three things off the DOM per size:
 *
 *   - does any part of the card overflow its own box (scrollHeight > clientHeight)?
 *   - is every interactive control inside the viewport (nothing below the fold)?
 *   - is any text smaller than 9 px (the "shrink it until it fits" failure)?
 *
 * Exit code is non-zero if any size fails, so this can gate. Screenshots land in
 * `apps/client/e2e/out/ui/`.
 *
 *   node apps/client/e2e/tools/ui-fit.mjs [--url http://localhost:5173]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/ui");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("--url", "http://localhost:5173");
// TDM is the worst case for fit: 21 items against bomb mode's 17.
const MODE = arg("--mode", "tdm");

const SIZES = [
  // The three the brief names.
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
  // Interface scaling. Browser zoom does NOT scale the page inside a fixed viewport — it shrinks
  // the CSS viewport, so 1280x720 at 125 % reports as 1024x576. Those are the sizes to test, and
  // they are the ones that actually break a layout.
  { name: "1280x720@110%", width: 1164, height: 655 },
  { name: "1280x720@125%", width: 1024, height: 576 },
  { name: "1366x768@125%", width: 1093, height: 614 },
  { name: "1920x1080@150%", width: 1280, height: 720 },
];

mkdirSync(OUT, { recursive: true });
// This container ships one Chromium build; the pinned Playwright may want a different one.
// PW_CHROMIUM points at the preinstalled binary rather than downloading a second copy.
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const rows = [];
let bad = 0;

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  await page.goto(`${BASE}/ui-fit.html?mode=${MODE}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".shop-card");
  await page.waitForTimeout(250);

  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const card = q(".shop-card"), body = q(".shop-body");
    const vw = innerWidth, vh = innerHeight;
    const over = (el) => el ? { scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth } : null;
    // Every control a player must be able to reach.
    const controls = [...document.querySelectorAll("button")];
    const offscreen = controls.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom > vh + 0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.left < -0.5 || r.width === 0 || r.height === 0;
    }).map((b) => `${b.dataset.testid ?? b.textContent?.trim().slice(0, 18)}`);
    // Smallest rendered text anywhere in the card.
    let smallest = 99, smallestOn = "";
    for (const el of card.querySelectorAll("*")) {
      if (!el.textContent?.trim() || el.children.length) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < smallest) { smallest = px; smallestOn = el.className || el.tagName; }
    }
    const cardBox = card.getBoundingClientRect();
    return {
      vw, vh, card: over(card), body: over(body), offscreen, smallest, smallestOn,
      cardTop: Math.round(cardBox.top), cardBottom: Math.round(cardBox.bottom),
      rows: document.querySelectorAll(".shop-row").length,
    };
  });

  const cardOverflows = m.card.scrollH > m.card.clientH + 1 || m.card.scrollW > m.card.clientW + 1;
  const bodyScrolls = m.body.scrollH > m.body.clientH + 1;
  const cut = m.cardTop < 0 || m.cardBottom > m.vh + 1;
  const tiny = m.smallest < 9;
  const ok = !cardOverflows && !bodyScrolls && !cut && !tiny && m.offscreen.length === 0;
  if (!ok) bad++;
  rows.push({ size: size.name, ok, cardOverflows, bodyScrolls, cut, offscreen: m.offscreen, smallest: +m.smallest.toFixed(1), smallestOn: m.smallestOn, items: m.rows, bodyNeed: m.body.scrollH, bodyHave: m.body.clientH });
  await page.screenshot({ path: `${OUT}/shop-${size.name}.png` });
  await page.close();
}
// The living arena's vote panel, at the smallest supported size.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}/ui-fit.html?panel=plan`, { waitUntil: "networkidle" });
  await page.waitForSelector(".plan");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/plan-vote.png` });
  await page.close();
}
await browser.close();

const md = [
  `# Buy menu fit (${MODE} — ${MODE === "tdm" ? "the worst case, 21 items" : "17 items"})\n`,
  "Measured with `node apps/client/e2e/tools/ui-fit.mjs` against the real component. `body need` /",
  "`body have` are the aisle content height and the space it is given: need ≤ have means no scroll.\n",
  "| viewport | verdict | card overflows | body scrolls | cut off screen | controls off screen | smallest text | items | body need / have |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.size} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.cardOverflows} | ${r.bodyScrolls} | ${r.cut} | ${r.offscreen.length ? r.offscreen.join(", ") : "none"} | ${r.smallest} px (${r.smallestOn}) | ${r.items} | ${r.bodyNeed} / ${r.bodyHave} px |`),
  "",
  `Screenshots: \`apps/client/e2e/out/ui/shop-<viewport>.png\`.`,
].join("\n");
writeFileSync(`${OUT}/shop-fit.md`, md + "\n");
writeFileSync(`${OUT}/shop-fit.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(md);
process.exitCode = bad === 0 ? 0 : 1;
