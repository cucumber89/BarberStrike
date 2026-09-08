#!/usr/bin/env node
/**
 * Does the menu fit, and can you see the servers? Measured, not asserted.
 *
 * The brief for the 2.6 menu was "simple, obvious, and the servers must be easier to see". This
 * drives the REAL menu in a real browser at every resolution the shop's fit test uses, with the
 * room list stubbed so the browser can be photographed populated, empty and offline, and reads off
 * the DOM per size:
 *
 *   - is every control inside the viewport (nothing below the fold, nothing clipped)?
 *   - does the page itself scroll (it must not — the two lobby columns scroll inside themselves)?
 *   - how much of the screen does the SERVER BROWSER get, and are its rows on screen?
 *   - is any text smaller than 9 px (the "shrink it until it fits" failure)?
 *
 * Needs the client dev server only — the room list is stubbed, so no game server is required.
 *
 *   pnpm --filter @frankibarber/client dev
 *   node apps/client/e2e/tools/menu-fit.mjs [--url http://localhost:5174]
 *
 * Screenshots and the table land in `apps/client/e2e/out/menu/`. Non-zero exit if any size fails.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../out/menu");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("--url", "http://localhost:5174");

const SIZES = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x1080", width: 1920, height: 1080 },
  // Browser zoom SHRINKS the CSS viewport rather than scaling the page: 1280x720 at 125 % reports
  // as 1024x576, and those are the sizes that actually break a layout.
  { name: "1280x720@125%", width: 1024, height: 576 },
  { name: "1366x768@125%", width: 1093, height: 614 },
];

/** Six open matches, one of them full — enough to make the list scroll in the narrow column. */
const ROOMS = [
  { roomId: "aa1", clients: 5, maxClients: 12, metadata: { name: "late-shift", map: "night_district", mode: "tdm", bots: 2 } },
  { roomId: "aa2", clients: 12, maxClients: 12, metadata: { name: "razor-fade-42", map: "gora", mode: "bomb" } },
  { roomId: "aa3", clients: 2, maxClients: 12, metadata: { name: "neon-comb", map: "gora", mode: "ostrzyzeni", bots: 4 } },
  { roomId: "aa4", clients: 8, maxClients: 12, metadata: { name: "velvet-chair-19", map: "night_district", mode: "dom" } },
  { roomId: "aa5", clients: 1, maxClients: 12, metadata: { name: "quiet-trim", map: "night_district", mode: "gungame" } },
  { roomId: "aa6", clients: 6, maxClients: 12, metadata: { name: "brass-mirror-77", map: "gora", mode: "boys", bots: 1 } },
];

mkdirSync(OUT, { recursive: true });
// This container ships one Chromium build; the pinned Playwright may want a different one.
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});

/** Stub the room list so the browser is photographed in a known state, with no game server up. */
const stub = async (page, body) => {
  await page.route("**/rooms", (route) => body === null
    ? route.fulfill({ status: 500, body: "down" })
    : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
};

/** What a laid-out menu looks like from the DOM: overflow, off-screen controls, tiny text. */
const measure = (page) => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const root = document.querySelector(".menu");
  const controls = [...document.querySelectorAll(".menu button, .menu input")];
  /**
   * A control clipped by a SCROLLER it lives in is not "off screen" — the two lobby columns and
   * the room list scroll on purpose, and a six-room list on a short display has to end somewhere.
   * What must never leave the viewport is a control with nowhere to scroll (the launch bar, the
   * top bar) and the scrollers themselves; how much of the list is readable without scrolling is
   * reported separately as `rows visible`.
   */
  const scroller = (el) => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  };
  const outside = (r) => r.width === 0 || r.height === 0 || r.bottom > vh + 0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.left < -0.5;
  const offscreen = controls.filter((b) => !scroller(b) && outside(b.getBoundingClientRect()))
    .map((b) => b.dataset.testid ?? (b.textContent || b.getAttribute("aria-label") || b.tagName).trim().slice(0, 20));
  const scrollersOff = [".lb-setup", ".srv-list", ".lb-launch"]
    .filter((s) => { const el = document.querySelector(s); return el && outside(el.getBoundingClientRect()); });
  let smallest = 99, smallestOn = "";
  for (const el of root.querySelectorAll("*")) {
    if (!el.textContent?.trim() || el.children.length) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < smallest) { smallest = px; smallestOn = String(el.className || el.tagName); }
  }
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const list = document.querySelector(".srv-list");
  return {
    vw, vh, offscreen: [...offscreen, ...scrollersOff], smallest: +smallest.toFixed(1), smallestOn,
    pageScrolls: root.scrollHeight > root.clientHeight + 1 || [...root.querySelectorAll(".mm-content")].some((c) => c.scrollHeight > c.clientHeight + 1),
    servers: box(".lb-servers"), setup: box(".lb-setup"), launch: box(".lb-launch"),
    rowsVisible: [...document.querySelectorAll(".srv-row")].filter((r) => r.getBoundingClientRect().bottom <= (list?.getBoundingClientRect().bottom ?? vh) + 1).length,
    rowsTotal: document.querySelectorAll(".srv-row").length,
  };
});

const rows = [];
let bad = 0;

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  await stub(page, ROOMS);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=menu]");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/title-${size.name}.png` });

  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill("FRANKI");
  await page.waitForSelector(".srv-row");
  await page.waitForTimeout(250);
  const m = await measure(page);
  await page.screenshot({ path: `${OUT}/lobby-${size.name}.png` });

  // The share of the screen the server browser gets — the number the brief is actually about.
  const share = m.servers ? Math.round((m.servers.w * m.servers.h) / (m.vw * m.vh) * 100) : 0;
  const ok = m.offscreen.length === 0 && !m.pageScrolls && m.smallest >= 9 && m.rowsVisible >= 3;
  if (!ok) bad++;
  rows.push({ size: size.name, ok, offscreen: m.offscreen, pageScrolls: m.pageScrolls, smallest: m.smallest, smallestOn: m.smallestOn, share, rowsVisible: m.rowsVisible, rowsTotal: m.rowsTotal, servers: m.servers, launch: m.launch });
  await page.close();
}

// The three states of the browser at the reference size, plus the panels behind the other two
// buttons and the lobby a friend's link opens.
const shots = [
  ["servers-empty", async (page) => { await stub(page, []); await page.goto(BASE); await page.getByTestId("btn-play").click(); await page.waitForSelector(".srv-empty"); }],
  ["servers-offline", async (page) => { await stub(page, null); await page.goto(BASE); await page.getByTestId("btn-play").click(); await page.waitForSelector(".srv-empty.err"); }],
  ["mode-boys", async (page) => { await stub(page, ROOMS); await page.goto(BASE); await page.getByTestId("btn-play").click(); await page.getByTestId("mode-boys").click(); await page.waitForSelector(".boys-class"); }],
  ["controls", async (page) => { await stub(page, ROOMS); await page.goto(BASE); await page.getByTestId("btn-controls").click(); await page.waitForSelector(".keys-grid"); }],
  ["settings", async (page) => { await stub(page, ROOMS); await page.goto(BASE); await page.getByTestId("btn-settings").click(); await page.waitForSelector(".settings"); }],
  ["link-join", async (page) => { await stub(page, ROOMS); await page.goto(`${BASE}/r/late-shift?mode=gungame`); await page.waitForSelector("[data-testid=link-join]"); }],
];
for (const [name, drive] of shots) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await drive(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
}
await browser.close();

const md = [
  "# Menu fit and server visibility (2.6)\n",
  "Measured with `node apps/client/e2e/tools/menu-fit.mjs` against the real menu, the room list",
  "stubbed with six matches (one of them full). `server share` is the fraction of the screen the",
  "server browser occupies; `rows` is how many of the six are visible without scrolling its column.\n",
  "| viewport | verdict | controls off screen | page scrolls | smallest text | server share | rows visible | launch bar |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.size} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.offscreen.length ? r.offscreen.join(", ") : "none"} | ${r.pageScrolls} | ${r.smallest} px (${r.smallestOn}) | ${r.share} % (${r.servers?.w}×${r.servers?.h}) | ${r.rowsVisible}/${r.rowsTotal} | ${r.launch?.h} px |`),
  "",
  "Screenshots: `apps/client/e2e/out/menu/` — `title-<viewport>.png`, `lobby-<viewport>.png`,",
  "`servers-empty.png`, `servers-offline.png`, `mode-boys.png`, `controls.png`, `settings.png`,",
  "`link-join.png`.",
].join("\n");
writeFileSync(`${OUT}/menu-fit.md`, md + "\n");
writeFileSync(`${OUT}/menu-fit.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(md);
process.exitCode = bad === 0 ? 0 : 1;
