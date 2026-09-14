#!/usr/bin/env node
/**
 * Does the buy menu actually fit, and can it be read? Measured, not asserted.
 *
 * Drives the real `Shop` component (via `ui-fit.html`, same cascade as the game) in a real
 * browser at every resolution the brief names, opens EVERY aisle tab, and reads off the DOM:
 *
 *   - does the card or the aisle panel overflow its box (scrollHeight > clientHeight)?
 *   - is every button inside the viewport (nothing below the fold, nothing zero-sized)?
 *   - type floors: names ≥ 16 px, role / reason lines ≥ 13 px, everything ≥ 10 px;
 *   - is any name, role or reason truncated (scrollWidth > clientWidth)?
 *   - does every row print a shortcut whose key the handler accepts (1–9, 0)?
 *
 * Exit code is non-zero if any size fails, so this can gate. Screenshots land in
 * `apps/client/e2e/out/ui/`.
 *
 *   node apps/client/e2e/tools/ui-fit.mjs [--url http://localhost:5174] [--mode tdm|bomb|boys]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/ui");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("--url", "http://localhost:5174");
const MODE = arg("--mode", "tdm");

const FLOORS = { name: 16, role: 13, any: 10 };

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
  { name: "1920x1080@125%", width: 1536, height: 864 },
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
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  const tabs = await page.locator(".shop-tab").count();
  const faults = [];
  let smallest = 99, smallestOn = "", items = 0;
  for (let t = 1; t <= tabs; t++) {
    await page.locator(`[data-testid="shop-tab-${t}"]`).click();
    await page.waitForTimeout(80);
    const m = await page.evaluate((floors) => {
      const q = (s) => document.querySelector(s);
      const card = q(".shop-card"), panel = q(".shop-panel"), grid = q(".shop-grid");
      const vw = innerWidth, vh = innerHeight;
      const faults = [];
      const over = (el, what) => { if (el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) faults.push(`${what} overflows ${el.scrollHeight}/${el.clientHeight}`); };
      over(card, "card"); over(panel, "panel"); over(grid, "grid");
      for (const b of document.querySelectorAll("button")) {
        const r = b.getBoundingClientRect();
        if (r.bottom > vh + 0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.left < -0.5 || r.width === 0 || r.height === 0)
          faults.push(`control off screen: ${b.dataset.testid ?? b.textContent?.trim().slice(0, 18)}`);
      }
      const cardBox = card.getBoundingClientRect();
      if (cardBox.top < 0 || cardBox.bottom > vh + 1) faults.push("card cut by the viewport");
      let smallest = 99, smallestOn = "";
      for (const el of card.querySelectorAll("*")) {
        if (!el.textContent?.trim() || el.children.length) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const px = parseFloat(cs.fontSize);
        if (px < smallest) { smallest = px; smallestOn = el.className || el.tagName; }
      }
      const rows = [...document.querySelectorAll(".shop-row")];
      for (const row of rows) {
        const id = row.dataset.testid;
        const name = row.querySelector(".shop-row-name"), role = row.querySelector(".shop-row-role"), key = row.querySelector(".shop-key");
        const px = (el) => parseFloat(getComputedStyle(el).fontSize);
        if (px(name) < floors.name) faults.push(`${id}: name ${px(name)} px < ${floors.name}`);
        if (px(role) < floors.role) faults.push(`${id}: role ${px(role)} px < ${floors.role}`);
        if (name.scrollWidth > name.clientWidth + 1) faults.push(`${id}: name truncated (${name.scrollWidth} > ${name.clientWidth})`);
        if (role.scrollWidth > role.clientWidth + 1) faults.push(`${id}: role/reason truncated (${role.scrollWidth} > ${role.clientWidth})`);
        const rr = row.getBoundingClientRect();
        if (rr.bottom > vh + 0.5 || rr.top < -0.5) faults.push(`${id}: row off screen`);
        // The printed shortcut must be a key the handler accepts: <cat>·<1-9|0>.
        if (!/^[1-4]·[0-9]$/.test(key.textContent ?? "")) faults.push(`${id}: bad shortcut "${key.textContent}"`);
      }
      return { faults, smallest, smallestOn, rows: rows.length, panelNeed: grid?.scrollHeight ?? 0, panelHave: grid?.clientHeight ?? 0 };
    }, FLOORS);
    if (m.smallest < smallest) { smallest = m.smallest; smallestOn = m.smallestOn; }
    if (m.smallest < FLOORS.any) faults.push(`tab ${t}: ${m.smallest} px text (${m.smallestOn})`);
    faults.push(...m.faults.map((f) => `tab ${t}: ${f}`));
    items += m.rows;
    await page.screenshot({ path: `${OUT}/shop-${MODE}-${size.name}-tab${t}.png` });
  }
  await page.locator('[data-testid="shop-tab-1"]').click();
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/shop-${MODE}-${size.name}.png` });
  const ok = faults.length === 0;
  if (!ok) bad++;
  rows.push({ size: size.name, ok, faults, smallest: +smallest.toFixed(1), smallestOn, items });
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
  `# Buy menu fit — mode ${MODE}\n`,
  "Measured with `node apps/client/e2e/tools/ui-fit.mjs` against the real component, every aisle tab",
  `at every size. Floors: names ≥ ${FLOORS.name} px, role / reason lines ≥ ${FLOORS.role} px, all text ≥ ${FLOORS.any} px;`,
  "no scroll, no control off screen, no truncated name or reason, every printed shortcut a real key.\n",
  "| viewport | verdict | smallest text | items (all tabs) | faults |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.size} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.smallest} px (${r.smallestOn}) | ${r.items} | ${r.faults.length ? r.faults.slice(0, 6).join("; ") + (r.faults.length > 6 ? ` … +${r.faults.length - 6}` : "") : "none"} |`),
  "",
  `Screenshots: \`apps/client/e2e/out/ui/shop-${MODE}-<viewport>[-tabN].png\`.`,
].join("\n");
writeFileSync(`${OUT}/shop-fit-${MODE}.md`, md + "\n");
writeFileSync(`${OUT}/shop-fit-${MODE}.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(md);
process.exitCode = bad === 0 ? 0 : 1;
