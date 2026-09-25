#!/usr/bin/env node
/**
 * Does the buy menu actually fit, and can it be read? Measured, not asserted.
 *
 * Drives the real `Shop` component (via `ui-fit.html`, same cascade as the game) in a real
 * browser at every resolution the brief names. Since drop U (P7) the shop is CS2's five aisles
 * side by side, so ONE screen holds every item; the tool reads off the DOM, per size:
 *
 *   - does the card or the aisle grid overflow its box (scrollHeight > clientHeight)?
 *   - is every button inside the viewport (nothing below the fold, nothing zero-sized), and are
 *     all five aisle headers (`shop-tab-1..5`) on screen together?
 *   - type floors: names ≥ 16 px, a tile's price or tag ≥ 13 px, everything ≥ 10 px;
 *   - is any name, price or tag truncated (scrollWidth > clientWidth)?
 *   - does every tile print a shortcut whose key the handler accepts (aisle 1–5, then 1–9 / 0)?
 *   - is every tile ≤ 6 words (key, name, price, one tag — docs/UI_U_SPEC.md §5.2 #49), counted
 *     with the gallery's rule (`countWords`, §3.10)?
 *   - does every header click arm its aisle (the armed line names the aisle)?
 *
 * Exit code is non-zero if any size fails, so this can gate. The report is
 * `apps/client/e2e/out/u/p7/shop-fit[-<mode>].md` (the default mode, tdm, writes `shop-fit.md`),
 * with screenshots beside it.
 *
 *   node apps/client/e2e/tools/ui-fit.mjs [--url http://localhost:5174] [--mode tdm|bomb|boys|duel]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/u/p7");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("--url", "http://localhost:5174");
const MODE = arg("--mode", "tdm");

const FLOORS = { name: 16, role: 13, any: 10 };
/**
 * §5.2 #49 / P7 WORK 6: a tile is the key, the name, the price and at most one tag, ≤ 6 words. The
 * spec's own pins cannot all hold at 6 on a three-word name: `multiplayer.spec.ts:377` wants
 * „Brakuje $1,400” on the DMR, „M-1 Clean Line” — key 1 + name 3 + tag 2 + price 1 = 7. So the
 * count gives the name at most two words (`nameWords`: a third word of a WEAPONS name, shared
 * data P7 does not own, is not held against the tile) and the STRUCTURE is gated on its own: a
 * price on every tile, never two tags. The spec conflict is reported to Ultron (audit P7-1).
 */
const TILE_WORDS = 6;

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
  if (tabs !== 5) faults.push(`${tabs} aisle headers, not 5`);
  const m = await page.evaluate(({ floors, maxWords }) => {
    const q = (s) => document.querySelector(s);
    const card = q(".shop-card"), grid = q(".shop-grid");
    const vw = innerWidth, vh = innerHeight;
    const faults = [];
    const over = (el, what) => { if (el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) faults.push(`${what} overflows ${el.scrollHeight}/${el.clientHeight}`); };
    over(card, "card"); over(grid, "grid");
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.bottom > vh + 0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.left < -0.5 || r.width === 0 || r.height === 0)
        faults.push(`control off screen: ${b.dataset.testid ?? b.textContent?.trim().slice(0, 18)}`);
    }
    // All five aisle headers on screen at once: the whole shop is one screen, not a tab strip.
    const heads = [...document.querySelectorAll('[data-testid^="shop-tab-"]')].map((el) => el.getBoundingClientRect());
    const headsIn = heads.filter((r) => r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5 && r.width > 0).length;
    if (headsIn !== 5) faults.push(`${headsIn}/5 aisle headers inside the viewport`);
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
    // The gallery's word rule (hud-states.mjs, format.ts countWords): tokens holding a letter or a
    // digit, over the tile's visible text nodes (the sr-only „LUNETA” included, as the tool does).
    const words = (root) => {
      let n = 0;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        const el = t.parentElement;
        if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        n += (t.textContent ?? "").replace(/\s+/g, " ").trim().split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      }
      return n;
    };
    const tiles = [...document.querySelectorAll(".shop-tile")];
    let maxTileWords = 0;
    for (const tile of tiles) {
      const id = tile.dataset.testid;
      // Every tile prints its price (§5.2 #49); its one tag (a refusal, „nosisz”, SPRZEDAJ…) sits
      // BESIDE it, never in its place (audit P7-1).
      const name = tile.querySelector(".tile-name"), price = tile.querySelector(".tile-price"), key = tile.querySelector(".tile-key");
      const tags = [...tile.querySelectorAll(".tile-tag")].filter((t) => t.checkVisibility());
      const px = (el) => parseFloat(getComputedStyle(el).fontSize);
      if (!price || !price.checkVisibility() || !/\$\d/.test(price.textContent ?? "")) { faults.push(`${id}: no price on the tile`); continue; }
      if (tags.length > 1) faults.push(`${id}: ${tags.length} tags > 1`);
      if (px(name) < floors.name) faults.push(`${id}: name ${px(name)} px < ${floors.name}`);
      if (px(price) < floors.role) faults.push(`${id}: price ${px(price)} px < ${floors.role}`);
      if (name.scrollWidth > name.clientWidth + 1) faults.push(`${id}: name truncated (${name.scrollWidth} > ${name.clientWidth})`);
      if (price.scrollWidth > price.clientWidth + 1) faults.push(`${id}: price truncated (${price.scrollWidth} > ${price.clientWidth})`);
      const pr = price.getBoundingClientRect(), tr = tile.getBoundingClientRect();
      if (pr.bottom > tr.bottom + 0.5 || pr.right > tr.right + 0.5) faults.push(`${id}: price outside its tile`);
      for (const t of tags) {
        if (!t.classList.contains("sell") && px(t) < floors.role) faults.push(`${id}: tag ${px(t)} px < ${floors.role}`);
        if (t.scrollWidth > t.clientWidth + 1) faults.push(`${id}: tag truncated (${t.scrollWidth} > ${t.clientWidth})`);
        const r = t.getBoundingClientRect();
        if (r.bottom > tr.bottom + 0.5 || r.right > tr.right + 0.5) faults.push(`${id}: tag outside its tile`);
      }
      const rr = tile.getBoundingClientRect();
      if (rr.bottom > vh + 0.5 || rr.top < -0.5) faults.push(`${id}: tile off screen`);
      // The printed shortcut must be a key the handler accepts: <cat>·<1-9|0>.
      if (!/^[1-5]·[0-9]$/.test(key.textContent ?? "")) faults.push(`${id}: bad shortcut "${key.textContent}"`);
      // The name counts at most two words (see TILE_WORDS).
      const w = words(tile) - Math.max(0, words(name) - 2);
      maxTileWords = Math.max(maxTileWords, w);
      if (w > maxWords) faults.push(`${id}: ${w} words > ${maxWords}`);
    }
    return { faults, smallest, smallestOn, items: tiles.length, maxTileWords, headsIn };
  }, { floors: FLOORS, maxWords: TILE_WORDS });
  const smallest = m.smallest, smallestOn = m.smallestOn, items = m.items;
  if (m.smallest < FLOORS.any) faults.push(`${m.smallest} px text (${m.smallestOn})`);
  faults.push(...m.faults);
  // Every header arms its aisle (§5.2 #49): the result line names it and asks for the tile's number.
  const labels = ["PISTOLETY", "ŚREDNIA PÓŁKA", "KARABINY", "WYPOSAŻENIE", "GRANATY"];
  for (let t = 1; t <= tabs; t++) {
    await page.locator(`[data-testid="shop-tab-${t}"]`).click();
    await page.waitForTimeout(60);
    const line = await page.locator('[data-testid="shop-result"]').textContent();
    if (!line?.includes(labels[t - 1]) || !line.includes("numer z kafelka")) faults.push(`tab ${t}: armed line reads "${line}"`);
    await page.locator(`[data-testid="shop-tab-${t}"]`).click(); // and a second click disarms it
  }
  await page.screenshot({ path: `${OUT}/shop-${MODE}-${size.name}.png` });
  const ok = faults.length === 0;
  if (!ok) bad++;
  rows.push({ size: size.name, ok, faults, smallest: +smallest.toFixed(1), smallestOn, items, maxTileWords: m.maxTileWords, headsIn: m.headsIn });
  await page.close();
}
// The match-end screen: every case the brief lists, at 720p and at 720p @ 125 %. The verdict, the
// score line and the footer's LEAVE must be on screen; the body may scroll inside the card.
const RESULT_CASES = ["win", "loss", "draw", "ffa", "spectator", "noreward", "ostrzyzeni", "turniej"];
for (const size of [SIZES[0], SIZES[4]]) {
  for (const c of RESULT_CASES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.goto(`${BASE}/ui-fit.html?panel=result&case=${c}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".result-card");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const faults = [];
    // The bracket is a third tab, and only a tournament has one — so it is measured where it
    // exists and skipped where it does not, rather than failing every other result screen.
    const tabs = ["summary", "table", ...(await page.locator('[data-testid="result-tab-bracket"]').count() ? ["bracket"] : [])];
    for (const tab of tabs) {
      await page.locator(`[data-testid="result-tab-${tab}"]`).click();
      if (tab === "summary") { const t = page.locator('[data-testid="summary-toggle"]'); if (await t.count()) await t.click(); }
      await page.waitForTimeout(80);
      const m = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight, f = [];
        const inView = (el, what) => { const r = el.getBoundingClientRect(); if (r.top < -0.5 || r.bottom > vh + 0.5 || r.left < -0.5 || r.right > vw + 0.5 || r.height === 0) f.push(`${what} off screen`); };
        const q = (s) => document.querySelector(s);
        inView(q(".result-title"), "title"); inView(q(".result-score"), "score"); inView(q(".result-why"), "why"); inView(q('[data-testid="result-leave"]'), "LEAVE"); inView(q('[data-testid="result-countdown"]'), "countdown");
        const card = q(".result-card");
        if (card.scrollWidth > card.clientWidth + 1) f.push("card scrolls sideways");
        if (document.documentElement.scrollWidth > vw + 1) f.push("page scrolls sideways");
        const px = (el) => parseFloat(getComputedStyle(el).fontSize);
        if (px(q(".result-title")) < 40) f.push(`title ${px(q(".result-title"))} px`);
        for (const el of card.querySelectorAll("*")) {
          if (!el.textContent?.trim() || el.children.length) continue;
          const cs = getComputedStyle(el); if (cs.display === "none") continue;
          if (parseFloat(cs.fontSize) < 10) f.push(`${el.className || el.tagName} ${cs.fontSize}`);
        }
        for (const n of document.querySelectorAll("td.sb-name")) if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).textOverflow !== "ellipsis") f.push("nick overflows without ellipsis");
        return f;
      });
      faults.push(...m.map((x) => `${tab}: ${x}`));
      await page.screenshot({ path: `${OUT}/result-${c}-${size.name}-${tab}.png` });
    }
    const ok = faults.length === 0;
    if (!ok) bad++;
    rows.push({ size: `result ${c} @ ${size.name}`, ok, faults, smallest: 0, smallestOn: "-", items: 0 });
    await page.close();
  }
}
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}/ui-fit.html?panel=round`, { waitUntil: "networkidle" });
  await page.waitForSelector(".round-end");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/round-end.png` });
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

const shopRows = rows.filter((r) => !r.size.startsWith("result"));
const md = [
  `# Buy menu fit — mode ${MODE}\n`,
  "Measured with `node apps/client/e2e/tools/ui-fit.mjs` against the real component: the five aisles side by side,",
  `every item on one screen, at every size. Floors: names ≥ ${FLOORS.name} px, a tile's price or tag ≥ ${FLOORS.role} px, all text ≥ ${FLOORS.any} px;`,
  `no scroll, no control off screen, all five aisle headers in the viewport, no truncated name, price or tag, every printed`,
  `shortcut a real key, every tile ≤ ${TILE_WORDS} words (a name counted as at most two: the spec's own „Brakuje $1,400” on`,
  `„M-1 Clean Line” is 7), a price on every tile and at most one tag beside it, every header arming its aisle.\n`,
  `**Shop: ${shopRows.filter((r) => r.ok).length}/${shopRows.length} sizes pass.**\n`,
  "| viewport | verdict | smallest text | tiles | most words on a tile | headers in view | faults |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.size} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.smallest} px (${r.smallestOn}) | ${r.items} | ${r.maxTileWords ?? "–"} | ${r.headsIn ?? "–"} | ${r.faults.length ? r.faults.slice(0, 6).join("; ") + (r.faults.length > 6 ? ` … +${r.faults.length - 6}` : "") : "none"} |`),
  "",
  `Screenshots: \`apps/client/e2e/out/u/p7/shop-${MODE}-<viewport>.png\`; the match-end rows (P6's screen) are measured as before.`,
].join("\n");
const base = MODE === "tdm" ? "shop-fit" : `shop-fit-${MODE}`;
writeFileSync(`${OUT}/${base}.md`, md + "\n");
writeFileSync(`${OUT}/${base}.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(md);
process.exitCode = bad === 0 ? 0 : 1;
