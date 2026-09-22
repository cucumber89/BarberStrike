#!/usr/bin/env node
/**
 * The settings panel, one screenshot per tab, at the two sizes that break layouts.
 *
 * The panel is six tabs now (CS2's shape) and each has to be legible on its own: the point of the
 * rework was that nobody should scroll past every shadow option to find the mouse sensitivity. A
 * picture per tab is what a reviewer — or a playtester reading this from a file — can actually
 * judge. It also fails loudly on the two things that make a settings screen unusable: text under
 * 11 px, and a control that is off the card.
 *
 *   node apps/client/e2e/tools/settings-shots.mjs [--url http://localhost:5174]
 *
 * Output: apps/client/e2e/out/settings/<tab>-<viewport>.png and settings-fit.md
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/settings");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("--url", "http://localhost:5174");

const TABS = ["gra", "sterowanie", "obraz", "dzwiek", "celownik", "o-grze"];
const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x576", width: 1024, height: 576 }, // 720p at 125 % interface scaling
];

mkdirSync(OUT, { recursive: true });
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const rows = [];
let bad = 0;

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId("btn-settings").click();
  await page.waitForSelector('[data-testid="settings"]');
  for (const tab of TABS) {
    await page.getByTestId(`set-tab-${tab}`).click();
    await page.waitForTimeout(120);
    const m = await page.evaluate(() => {
      const panel = document.querySelector(".settings");
      const faults = [];
      let smallest = 99, smallestOn = "";
      for (const el of panel.querySelectorAll("*")) {
        if (!el.textContent?.trim() || el.children.length) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const px = parseFloat(cs.fontSize);
        if (px < smallest) { smallest = px; smallestOn = el.className || el.tagName; }
      }
      // MEASURE THE REAL SCROLLER. `.set-body` is the scroller in the pause card and NOT in the
      // menu (there the shell scrolls and the body is `overflow: visible`), so reading it here
      // reported "nothing scrolls" while the tab was clipped by the viewport. Take whichever
      // ancestor actually overflows, and say how far past the fold the content runs.
      const body = panel.querySelector(".set-body");
      const controls = panel.querySelectorAll("button, input").length;
      for (const b of panel.querySelectorAll("button")) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) faults.push(`zero-sized control: ${b.textContent?.trim().slice(0, 20)}`);
        if (r.right > innerWidth + 0.5 || r.left < -0.5) faults.push(`control off screen sideways: ${b.textContent?.trim().slice(0, 20)}`);
      }
      const shell = panel.closest(".mm-content") ?? body;
      const scroller = [body, shell].filter(Boolean).find((el) => el.scrollHeight > el.clientHeight + 1);
      const rect = panel.getBoundingClientRect();
      const belowFold = Math.max(0, Math.round(rect.bottom - innerHeight));
      if (belowFold > 0 && !scroller) faults.push(`${belowFold} px of this tab is off screen and nothing scrolls`);
      return {
        faults, smallest, smallestOn, controls,
        scroll: scroller ? `${scroller.scrollHeight}/${scroller.clientHeight} (${scroller.className.split(" ")[0]})` : "nie trzeba",
        belowFold,
      };
    });
    if (m.smallest < 12) { m.faults.push(`${m.smallest} px text (${m.smallestOn})`); }
    if (m.faults.length) bad++;
    rows.push({ size: size.name, tab, ...m });
    await page.screenshot({ path: `${OUT}/${tab}-${size.name}.png` });
  }
  await page.close();
}
await browser.close();

const md = [
  "# Ustawienia — fit per tab",
  "",
  "| Viewport | Zakładka | Kontrolki | Najmniejszy tekst | Przewijanie | Poza ekranem | Uwagi |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.size} | ${r.tab} | ${r.controls} | ${r.smallest} px (${r.smallestOn}) | ${r.scroll} | ${r.belowFold} px | ${r.faults.length ? r.faults.join("; ") : "brak"} |`),
  "",
  "Screenshots: `apps/client/e2e/out/settings/<tab>-<viewport>.png`.",
].join("\n");
writeFileSync(`${OUT}/settings-fit.md`, md + "\n");
console.log(md);
process.exit(bad ? 1 : 0);
