#!/usr/bin/env node
/**
 * The HUD at every moment of a match, photographed and MEASURED — drop U's instrument.
 *
 * The brief is "a thousand captions, tiny counters, no time to read anything; make it feel like
 * CS / Call of Duty". Each of those words is a count: how many words are on screen, in how many
 * separate pieces, at what size. So this opens `hud-states.html` (the real <Hud> / <Loading> in a
 * frozen, realistic match state — see src/hudStates.tsx) once per scenario, takes a picture, and
 * reads the numbers off the DOM, so every later change is judged against the same table.
 *
 *   node apps/client/e2e/tools/hud-states.mjs [--url http://127.0.0.1:5199] [--label before]
 *        [--only a,b] [--size 1600x900]
 *
 * Writes apps/client/e2e/out/u/<label>/<scenario>.png, states.md and states.json. Exits non-zero
 * when any scenario fails to render its moment (the page checks its own selectors / words).
 *
 * What is counted — visible text only, inside the viewport (display, visibility and opacity-0
 * ancestors excluded; occlusion by other elements is NOT subtracted, and canvas text such as the
 * minimap's compass letters is invisible to the DOM):
 *   words        whitespace-separated tokens holding a letter or a digit ("·", "/" are not words)
 *   blocks       distinct separately-laid-out text boxes: a text node's nearest ancestor whose
 *                display is not inline — so <b> inside a sentence is one block with it, while each
 *                flex item / label is its own
 *   min font px  smallest computed font-size among visible text
 *   <12px        visible text nodes rendered below 12 px
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://127.0.0.1:5199");
const LABEL = arg("--label", "run");
const ONLY = (arg("--only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const [W, H] = (arg("--size", "1600x900") || "1600x900").split("x").map(Number);
const OUT = resolve(HERE, "../out/u", LABEL);
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

if (!(W > 0 && H > 0)) { console.error(`bad --size ${arg("--size")}`); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});

/** Runs inside the page: the numbers in the header comment. */
function measure() {
  const vw = innerWidth, vh = innerHeight;
  const blockOf = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const d = getComputedStyle(e).display;
      if (d !== "inline" && d !== "contents") return e;
    }
    return document.body;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const blocks = new Set();
  const texts = [];
  let words = 0, small = 0, minFont = Infinity;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || el.closest("script,style,noscript,template")) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
    const cs = getComputedStyle(el);
    if (/rgba?\([^)]*,\s*0\)$/.test(cs.color) || cs.color === "transparent") continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const onScreen = [...range.getClientRects()].some((r) => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
    if (!onScreen) continue;
    const px = parseFloat(cs.fontSize);
    words += text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    blocks.add(blockOf(el));
    if (px < minFont) minFont = px;
    if (px < 12) small++;
    texts.push({ text: text.length > 60 ? `${text.slice(0, 57)}…` : text, px: Math.round(px * 10) / 10 });
  }
  texts.sort((a, b) => a.px - b.px);
  return {
    words, blocks: blocks.size, minFontPx: Number.isFinite(minFont) ? Math.round(minFont * 10) / 10 : null, under12: small,
    textNodes: texts.length, smallest: texts.slice(0, 8),
  };
}

// The scenario list is the page's own, so the tool can never drift from it.
async function scenarioList() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/hud-states.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.hudStates, null, { timeout: 30_000 });
  const ids = await page.evaluate(() => window.hudStates.scenarios);
  await ctx.close();
  return ids;
}

const all = await scenarioList();
const unknown = ONLY.filter((id) => !all.includes(id));
if (unknown.length) { console.error(`unknown scenario(s): ${unknown.join(", ")} — known: ${all.join(", ")}`); await browser.close(); process.exit(2); }
const ids = ONLY.length ? all.filter((id) => ONLY.includes(id)) : all;

const results = [];
for (const id of ids) {
  // A fresh context per scenario: no local storage, timers or listeners carried from the last one.
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // An uncaught exception fails the scenario; a console error (a React dev warning, say) is kept
  // in states.json as a warning, because the frame still rendered.
  const errors = [];
  const warnings = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") warnings.push(m.text().slice(0, 300)); });
  const png = `${id}.png`;
  let row = { id, ok: false, png };
  try {
    await page.goto(`${BASE}/hud-states.html?s=${encodeURIComponent(id)}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.hudStates && (window.hudStates.ready || window.hudStates.error), null, { timeout: 30_000 });
    const st = await page.evaluate(() => window.hudStates);
    await page.screenshot({ path: `${OUT}/${png}` });
    const m = await page.evaluate(measure);
    row = { ...row, ...m, moment: st.moment ?? "", ok: !!st.ready && errors.length === 0, error: st.error ?? (errors.length ? errors.join(" | ") : undefined), warnings: warnings.length ? warnings : undefined };
  } catch (e) {
    row.error = String(e?.message ?? e).split("\n")[0];
  }
  await ctx.close();
  results.push(row);
  console.log(`${row.ok ? "ok  " : "FAIL"} ${id.padEnd(24)} words ${String(row.words ?? "-").padStart(4)}  blocks ${String(row.blocks ?? "-").padStart(3)}  min ${String(row.minFontPx ?? "-").padStart(4)} px  <12px ${String(row.under12 ?? "-").padStart(3)}${row.error ? `  — ${row.error}` : ""}`);
}
await browser.close();

const failed = results.filter((r) => !r.ok);
const sum = (k) => results.reduce((s, r) => s + (r[k] ?? 0), 0);
const md = [
  `# HUD states — ${LABEL}`,
  "",
  `${results.length} scenario(s) at ${W}x${H}, ${new Date().toISOString().slice(0, 10)}. Regenerate: \`node apps/client/e2e/tools/hud-states.mjs --label ${LABEL}\` (page: \`apps/client/hud-states.html?s=<scenario>\`).`,
  "Visible DOM text only (canvas text excluded, occlusion not subtracted); see the tool's header for the definitions.",
  "",
  "| scenario | words | blocks | min font px | <12px count | png |",
  "|---|---:|---:|---:|---:|---|",
  ...results.map((r) => `| ${r.ok ? r.id : `${r.id} **FAILED**`} | ${r.words ?? "–"} | ${r.blocks ?? "–"} | ${r.minFontPx ?? "–"} | ${r.under12 ?? "–"} | [${r.png}](${r.png}) |`),
  `| **total** | ${sum("words")} | ${sum("blocks")} | ${Math.min(...results.map((r) => r.minFontPx ?? Infinity))} | ${sum("under12")} | |`,
  "",
  "## Smallest text per scenario",
  "",
  ...results.filter((r) => r.smallest?.length).map((r) => `- **${r.id}**: ${r.smallest.slice(0, 5).map((t) => `${t.px}px “${t.text.replace(/\|/g, "\\|")}”`).join(" · ")}`),
  ...(failed.length ? ["", "## Failed", "", ...failed.map((r) => `- **${r.id}**: ${r.error ?? "not ready"}`)] : []),
  "",
].join("\n");
writeFileSync(`${OUT}/states.md`, md);
writeFileSync(`${OUT}/states.json`, JSON.stringify({ label: LABEL, size: [W, H], base: BASE, scenarios: results }, null, 2));
console.log(`\nwrote ${OUT}/states.md, states.json and ${results.length} png — ${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
