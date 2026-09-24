#!/usr/bin/env node
/**
 * The HUD at every moment of a match, photographed and MEASURED — drop U's instrument.
 *
 * The brief is "a thousand captions, tiny counters, no time to read anything; make it feel like
 * CS / Call of Duty". Each of those words is a count: how many words are on screen, in how many
 * separate pieces, at what size, in which zone, how close to the next zone, moving for how long.
 * So this opens `hud-states.html` (the real <Hud> / <Loading> / <Menu> in a frozen, realistic match
 * state — see src/hudStates.tsx and src/gallery/) once per scenario and size, takes a picture, and
 * reads the numbers off the DOM, so every later change is judged against the same table
 * (docs/UI_U_SPEC.md §7.0 gates G3/G5, the integration runs and the final gate).
 *
 *   node apps/client/e2e/tools/hud-states.mjs [--url http://127.0.0.1:5199] [--label before]
 *        [--only a,b] [--sizes 1600x900,1280x720,1024x576] [--zones top,top-line]
 *        [--budget] [--reduced-motion]
 *
 *   --sizes           viewports, default 1600x900,1280x720,1024x576 (`--size WxH` is one of them).
 *   --zones           the scope of the gates (§7.0 G3): only these zones' budgets, fonts, own
 *                     `apart` pairs and animations are gated. Without it the scope is every zone
 *                     plus the whole-scenario checks of the final gate.
 *   --budget          exit non-zero on any breach in the scope (without it breaches are reported).
 *   --reduced-motion  emulate `prefers-reduced-motion: reduce`; `anims` must then be 0 (G5).
 *
 * Writes apps/client/e2e/out/u/<label>/<scenario>.png at 1600x900 and <scenario>@<w>x<h>.png at
 * every other size, plus states.md and states.json. Exits non-zero when any scenario fails to
 * render its moment — a page error, or any package's pin (§8.8; pins always run and always gate) —
 * and, with --budget, when anything in the scope is over its limit.
 *
 * What is counted — visible text only, inside the viewport (display, visibility and opacity-0
 * ancestors excluded; occlusion by other elements is NOT subtracted; canvas text is invisible to
 * the DOM and is reported through `window.__canvasText` instead):
 *   words        whitespace-separated tokens holding a letter or a digit ("·", "/" are not words;
 *                `countWords` in ui/hud/format.ts is the same rule and its test reads this file)
 *   blocks       distinct separately-laid-out text boxes: a text node's nearest ancestor whose
 *                display is not inline — so <b> inside a sentence is one block with it, while each
 *                flex item / label is its own
 *   min font px  smallest computed font-size among visible text; <12px / <13px count the visible
 *                text nodes rendered below 12 / 13 px
 *   sizes        distinct computed font sizes among visible text (§2 principle 3: ≤ 6)
 *   zones        words per zone: a text node belongs to its nearest `[data-zone]` ancestor (§4.2),
 *                `none` when it has none. The breakdown below the table adds each zone's min font,
 *                its <13px count, its rows (the element children of the zone root, below any single
 *                wrapper — one row, chip or item each) and its §5.1 budget
 *   zone box     what a zone root paints: the union of its own box and the boxes of its visible
 *                descendant elements and text, each cut by the overflow of the ancestors between
 *                it and the root. The root's own box is not enough: the crosshair is a 0×0 anchor
 *                its arms hang from, and a `display: contents` wrapper has no box at all — with
 *                the root alone their `apart` pairs were silently never measured. (Pseudo-elements
 *                and shadows are not in it; a root that paints nothing has no box.)
 *   overlaps     pairs of visible zone boxes of different zones intersecting by more than 2 px on
 *                both axes; veil, fade, scoreboard, result, shop, pause, settings and loading are
 *                excluded (§4.2)
 *   apart        §4.3 pairs whose zones are both visible, failed / checked; the gap of two boxes is
 *                the larger of their horizontal and vertical separations (negative when they overlap)
 *   anims        the most `document.getAnimations()` running at once, sampled 50 ms after the last
 *                input (the edge, a key, a click) — with --reduced-motion that is G5's number
 *   animMaxMs    the largest delay + active duration over the animations with finite iterations;
 *                infinite ones (pulses) are listed apart
 *   canvasMin    the smallest font px in `window.__canvasText` (the radar's letters, P3); – when
 *                nothing was drawn
 *   maxWords     the scenario's §5.2 cap on words at 1600x900 (– = none)
 *
 * Not gated, only reported: the `menu-error` view (the untouched menu, which answers to its pins
 * alone) and the text inside zone `settings` (the settings panel is out of scope, §4.2 / §9).
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
const BASE = arg("--url", "http://127.0.0.1:5199");
const LABEL = arg("--label", "run");
const ONLY = list(arg("--only", ""));
const SIZES = list(arg("--sizes", arg("--size", "1600x900,1280x720,1024x576"))).map((s) => { const [w, h] = s.split("x").map(Number); return { w, h, key: `${w}x${h}` }; });
const SCOPE = list(arg("--zones", ""));
const BUDGET = has("--budget");
const REDUCED = has("--reduced-motion");
const OUT = resolve(HERE, "../out/u", LABEL);
const EXE = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
const MAIN = "1600x900";

// ------------------------------------------------------------------------------------ the spec's tables

/** §4.2: every zone id and the package that owns it (the gallery's `ZONES` must say the same). */
const OWNER = {
  top: "P2", "top-line": "P2", action: "P2", bracket: "P2",
  radar: "P3", wallet: "P3", plan: "P3", chat: "P3", hint: "P3",
  vitals: "P4", perks: "P4", inv: "P4", gear: "P4", weapon: "P4", feed: "P4", crosshair: "P4",
  banner: "P5", alert: "P5", intro: "P5",
  death: "P1", prompt: "P7", veil: "P1/P4/P5",
  scoreboard: "P6", result: "P6", shop: "P7", pause: "P7", settings: "P7", loading: "P7", fade: "P7",
};
const ZONES = Object.keys(OWNER);
/** §4.2: full-screen and modal zones, left out of `overlaps` (and never in an `apart` pair). */
const UNBOXED = new Set(["veil", "fade", "scoreboard", "result", "shop", "pause", "settings", "loading"]);
/** §4.3: [zone a, zone b, min gap px, "cross" or the package whose own pair it is]. */
const APART = [
  ["banner", "crosshair", 16, "cross"], ["intro", "crosshair", 16, "cross"], ["bracket", "crosshair", 16, "cross"],
  ["banner", "feed", 12, "cross"], ["bracket", "feed", 12, "cross"],
  ["banner", "wallet", 12, "cross"], ["bracket", "wallet", 12, "cross"], ["intro", "wallet", 12, "cross"],
  ["feed", "top", 16, "cross"],
  ["chat", "perks", 12, "cross"], ["action", "chat", 12, "cross"], ["death", "chat", 12, "cross"], ["intro", "chat", 12, "cross"], ["bracket", "chat", 12, "cross"], ["prompt", "chat", 12, "cross"],
  ["hint", "vitals", 12, "cross"], ["hint", "inv", 12, "cross"], ["alert", "feed", 12, "cross"], ["top-line", "feed", 12, "cross"], ["weapon", "death", 12, "cross"],
  ["top", "top-line", 8, "P2"], ["bracket", "top", 16, "P2"],
  ["chat", "wallet", 12, "P3"], ["plan", "chat", 12, "P3"], ["hint", "chat", 12, "P3"],
  ["wallet", "radar", 8, "P3"], ["plan", "wallet", 8, "P3"],
  ["vitals", "perks", 8, "P4"], ["inv", "gear", 8, "P4"], ["gear", "weapon", 8, "P4"],
];
const MIN_FONT = 13;
const MAX_SIZES = 6;
const MAX_ANIM_MS = 600;
const CANVAS_MIN = 14;
/** §5.2: the 28 pre-drop scenarios together, at 1600x900. */
const OLD_TOTAL_MAX = 958;

/**
 * §5.1, the zone word budgets: the checks one zone owes in one scenario, as [what, value, max].
 * `z` is the zone's measurement, `m` the scenario's, `meta` the gallery's row for it.
 */
function zoneBudget(zone, z, m, meta, h) {
  const words = [["words", z.words]];
  const cap = (max) => words.map(([what, v]) => [what, v, max]);
  const rowMax = (z.rows ?? []).reduce((a, b) => Math.max(a, b), 0);
  switch (zone) {
    case "top": return cap(meta.mode === "ostrzyzeni" ? 11 : ["gungame", "ffa", "turniej"].includes(meta.mode) ? 10 : 9);
    case "top-line": return cap(6);
    case "action": return cap(5);
    case "bracket": return cap(18);
    case "radar": return cap(0);
    case "wallet": return cap(4);
    case "plan": return cap(meta.phase === "prep" ? 24 : 3);
    case "chat": {
      const planUp = (m.zones.plan?.words ?? 0) > 0;
      return [["lines", z.chatLines ?? 0, h <= 600 ? (planUp ? 2 : 3) : h <= 760 ? 4 : 6]];
    }
    case "hint": return cap(14);
    case "vitals": return cap(meta.mode === "boys" ? 4 : 2);
    case "perks": return [["words per chip", rowMax, 2]];
    case "inv": return cap(2);
    case "gear": return [["words per item", rowMax, 2]];
    case "weapon": return cap(3);
    case "feed": return [["words per row", rowMax, 3], ["rows", (z.rows ?? []).length, 5]];
    case "crosshair": return cap(3);
    case "banner": return cap(12);
    case "alert": return cap(6);
    case "intro": return cap(8);
    case "death": {
      const card = z.has?.card ? (meta.roundMode ? 16 : 9) : 0;
      const bar = z.has?.spectate ? 12 : 0;
      return cap(card + bar || (meta.roundMode ? 16 : 9));
    }
    case "prompt": return cap(4);
    case "scoreboard": return cap(110);
    case "result": return cap(m.stage === "B" ? 8 : meta.roundMode ? 42 : 48);
    case "shop": return cap(130);
    case "pause": return cap(z.has?.teamPicker ? 46 : z.has?.leaveConfirm ? 26 : 20);
    case "loading": return cap(z.has?.enterGame ? 26 : 16);
    default: return []; // settings (out of scope, §9), veil, fade, none
  }
}

// ------------------------------------------------------------------------------------ arguments

const bad = (msg) => { console.error(msg); process.exit(2); };
if (!SIZES.length || SIZES.some((s) => !(s.w > 0 && s.h > 0))) bad(`bad --sizes ${arg("--sizes", arg("--size"))}`);
const unknownZones = SCOPE.filter((z) => !ZONES.includes(z));
if (unknownZones.length) bad(`unknown zone(s) in --zones: ${unknownZones.join(", ")} — known: ${ZONES.join(", ")}`);
const inScope = (zone) => (SCOPE.length ? SCOPE.includes(zone) : true);
const FULL = SCOPE.length === 0;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const contextFor = (s) => browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, ...(REDUCED ? { reducedMotion: "reduce" } : {}) });

// ------------------------------------------------------------------------------------ in the page

/** Runs inside the page: the numbers in the header comment, per zone as well as in all. */
function measure() {
  const vw = innerWidth, vh = innerHeight;
  const blockOf = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const d = getComputedStyle(e).display;
      if (d !== "inline" && d !== "contents") return e;
    }
    return document.body;
  };
  const shows = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const blocks = new Set();
  const texts = [];
  const sizes = new Set();
  const zones = {};
  const counted = [];
  let words = 0, small = 0, under13 = 0, minFont = Infinity;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || el.closest("script,style,noscript,template")) continue;
    if (!shows(el)) continue;
    const cs = getComputedStyle(el);
    if (/rgba?\([^)]*,\s*0\)$/.test(cs.color) || cs.color === "transparent") continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const onScreen = [...range.getClientRects()].some((r) => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh);
    if (!onScreen) continue;
    const px = parseFloat(cs.fontSize);
    const count = text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    words += count;
    blocks.add(blockOf(el));
    if (px < minFont) minFont = px;
    if (px < 12) small++;
    if (px < 13) under13++;
    sizes.add(Math.round(px * 10) / 10);
    const root = el.closest("[data-zone]");
    const zone = root?.getAttribute("data-zone") ?? "none";
    const z = (zones[zone] ??= { words: 0, minFont: Infinity, under13: 0, under12: 0, texts: 0 });
    z.words += count; z.texts++;
    (z.sizeSet ??= new Set()).add(Math.round(px * 10) / 10);
    if (px < z.minFont) z.minFont = px;
    if (px < 13) z.under13++;
    if (px < 12) z.under12++;
    if (root) counted.push({ root, el, count });
    texts.push({ text: text.length > 60 ? `${text.slice(0, 57)}…` : text, px: Math.round(px * 10) / 10, zone });
  }
  // Rows: the element children of a zone root, below any single-child wrapper (ul > li, …).
  const rowsOf = (root) => { let c = root; while (c.children.length === 1) c = c.children[0]; return [...c.children]; };
  const rowWords = new Map();
  for (const { root, el, count } of counted) {
    if (!count) continue;
    let per = rowWords.get(root);
    if (!per) { per = { rows: rowsOf(root), words: new Map() }; rowWords.set(root, per); }
    const i = per.rows.findIndex((r) => r.contains(el));
    per.words.set(i, (per.words.get(i) ?? 0) + count);
  }
  for (const [root, per] of rowWords) {
    const zone = root.getAttribute("data-zone");
    (zones[zone].rows ??= []).push(...per.words.values());
  }
  // Zone boxes (the header's "zone box"), and what each zone holds that its budget depends on.
  // Overflow cuts what an element holds, at its padding box — except that an absolutely or fixed
  // positioned box answers only to its containing block's chain: the ancestors between it and that
  // block do not cut it. `display: contents` and inline elements cut nothing.
  const holdsFixed = (cs) => cs.transform !== "none" || cs.perspective !== "none" || cs.filter !== "none"
    || (cs.backdropFilter ?? "none") !== "none" || /layout|paint|strict|content/.test(cs.contain) || /transform|perspective|filter/.test(cs.willChange);
  const cut = (q, from, root, mode) => {
    let x = q.left, y = q.top, r = q.right, b = q.bottom;
    for (let p = from; p; p = p === root ? null : p.parentElement) {
      const cs = getComputedStyle(p);
      if (mode === "fixed" ? !holdsFixed(cs) : mode === "absolute" && cs.position === "static" && !holdsFixed(cs)) continue;
      mode = cs.position;
      if (cs.display === "contents" || cs.display === "inline" || (cs.overflowX === "visible" && cs.overflowY === "visible")) continue;
      const pr = p.getBoundingClientRect();
      // A transform that scales the element leaves clientWidth unscaled: use the border box then.
      const flat = p instanceof HTMLElement && Math.abs(pr.width - p.offsetWidth) < 0.5 && Math.abs(pr.height - p.offsetHeight) < 0.5;
      const px = flat ? pr.left + p.clientLeft : pr.left, pw = flat ? p.clientWidth : pr.width;
      const py = flat ? pr.top + p.clientTop : pr.top, ph = flat ? p.clientHeight : pr.height;
      if (cs.overflowX !== "visible") { x = Math.max(x, px); r = Math.min(r, px + pw); }
      if (cs.overflowY !== "visible") { y = Math.max(y, py); b = Math.min(b, py + ph); }
    }
    return { x, y, r, b };
  };
  // The union of what the root paints; null when it paints nothing. A descendant inside a nested
  // zone root is that zone's (the rule text follows, §4.2), not this one's.
  const footprint = (root, contents) => {
    const own = (el) => el.closest("[data-zone]") === root;
    const parts = [];
    if (!contents) { const q = root.getBoundingClientRect(); parts.push({ x: q.left, y: q.top, r: q.right, b: q.bottom }); }
    for (const el of root.querySelectorAll("*")) {
      if (own(el) && shows(el)) parts.push(cut(el.getBoundingClientRect(), el.parentElement, root, getComputedStyle(el).position));
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const el = n.parentElement;
      if (!el || !(n.textContent ?? "").trim() || !own(el) || !shows(el)) continue;
      const color = getComputedStyle(el).color;
      if (/rgba?\([^)]*,\s*0\)$/.test(color) || color === "transparent") continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      parts.push(cut(range.getBoundingClientRect(), el, root, "static"));
    }
    const on = parts.filter((q) => q.r - q.x >= 1 && q.b - q.y >= 1);
    if (!on.length) return null;
    return { x: Math.min(...on.map((q) => q.x)), y: Math.min(...on.map((q) => q.y)), r: Math.max(...on.map((q) => q.r)), b: Math.max(...on.map((q) => q.b)) };
  };
  const boxes = [];
  const blank = []; // zones whose root is on screen but paints nothing (an empty kill feed): no box
  const HAS = { card: "[data-testid=death]", spectate: "[data-testid=spectate]", teamPicker: "[data-testid=team-picker]", leaveConfirm: "[data-testid=btn-leave-confirm]", enterGame: "[data-testid=enter-game]" };
  for (const root of document.querySelectorAll("[data-zone]")) {
    // `display: contents` has no box, so checkVisibility is false for it whatever it holds: such a
    // wrapper is on screen when something it holds is painted.
    const contents = getComputedStyle(root).display === "contents";
    if (!contents && !shows(root)) continue;
    const box = footprint(root, contents);
    if (contents && !box) continue;
    const zone = root.getAttribute("data-zone");
    const z = (zones[zone] ??= { words: 0, minFont: Infinity, under13: 0, under12: 0, texts: 0 });
    for (const [k, sel] of Object.entries(HAS)) {
      const hit = root.matches(sel) ? root : root.querySelector(sel);
      if (hit && shows(hit)) (z.has ??= {})[k] = true;
    }
    if (box) boxes.push({ zone, ...box });
    else if (!blank.includes(zone)) blank.push(zone);
  }
  const chatLines = [...document.querySelectorAll("[data-testid=chat-line]")].filter((el) => el.closest("[data-zone]")?.getAttribute("data-zone") === "chat" && shows(el)).length;
  if (zones.chat) zones.chat.chatLines = chatLines;
  for (const z of Object.values(zones)) {
    z.minFont = Number.isFinite(z.minFont) ? Math.round(z.minFont * 10) / 10 : null;
    z.sizeList = [...(z.sizeSet ?? [])].sort((a, b) => a - b);
    delete z.sizeSet;
  }
  const stage = document.querySelector(".hud")?.getAttribute("data-stage") || document.querySelector("[data-testid=result]")?.getAttribute("data-stage") || "";
  const canvas = Array.isArray(window.__canvasText) ? window.__canvasText : [];
  texts.sort((a, b) => a.px - b.px);
  return {
    words, blocks: blocks.size, minFontPx: Number.isFinite(minFont) ? Math.round(minFont * 10) / 10 : null, under12: small, under13,
    sizes: sizes.size, sizeList: [...sizes].sort((a, b) => a - b), textNodes: texts.length, smallest: texts.slice(0, 8),
    zones, boxes, blank: blank.filter((zone) => !boxes.some((b) => b.zone === zone)), stage,
    canvasMin: canvas.length ? Math.min(...canvas.map((t) => t.px)) : null, canvasTexts: canvas.length,
  };
}

// ------------------------------------------------------------------------------------ geometry

const overlapsOf = (boxes) => {
  const out = [];
  const bx = boxes.filter((b) => !UNBOXED.has(b.zone));
  for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
    const a = bx[i], b = bx[j];
    if (a.zone === b.zone) continue;
    const ix = Math.min(a.r, b.r) - Math.max(a.x, b.x), iy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    if (ix > 2 && iy > 2) out.push({ a: a.zone, b: b.zone, w: Math.round(ix), h: Math.round(iy) });
  }
  return out;
};
const gap = (a, b) => Math.max(Math.max(b.x - a.r, a.x - b.r), Math.max(b.y - a.b, a.y - b.b));
const apartOf = (boxes) => APART.flatMap(([za, zb, min, kind]) => {
  const as = boxes.filter((b) => b.zone === za), bs = boxes.filter((b) => b.zone === zb);
  if (!as.length || !bs.length) return [];
  const g = Math.min(...as.flatMap((a) => bs.map((b) => gap(a, b))));
  return [{ a: za, b: zb, min, kind, gap: Math.round(g * 10) / 10, ok: g >= min }];
});

// ------------------------------------------------------------------------------------ run

// The scenario list is the page's own, so the tool can never drift from it.
async function catalogue() {
  const ctx = await contextFor(SIZES[0]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/hud-states.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.hudStates, null, { timeout: 30_000 });
  const st = await page.evaluate(() => window.hudStates);
  await ctx.close();
  return st;
}

const cat = await catalogue();
if (String(cat.error ?? "").startsWith("gallery:")) { await browser.close(); bad(cat.error); }
const pageZones = cat.zones ?? [];
if (pageZones.join() !== ZONES.join()) { await browser.close(); bad(`zone lists differ — gallery/fixtures.ts ZONES: ${pageZones.join(", ")}; this tool: ${ZONES.join(", ")}`); }
const all = cat.scenarios;
const metaOf = new Map((cat.catalog ?? []).map((c) => [c.id, c]));
const unknown = ONLY.filter((id) => !all.includes(id));
if (unknown.length) { await browser.close(); bad(`unknown scenario(s): ${unknown.join(", ")} — known: ${all.join(", ")}`); }
const ids = ONLY.length ? all.filter((id) => ONLY.includes(id)) : all;

const results = [];
for (const size of SIZES) {
  for (const id of ids) {
    // A fresh context per scenario: no local storage, timers or listeners carried from the last one.
    const ctx = await contextFor(size);
    const page = await ctx.newPage();
    // An uncaught exception fails the scenario; a console error (a React dev warning, say) is kept
    // in states.json as a warning, because the frame still rendered.
    const errors = [];
    const warnings = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") warnings.push(m.text().slice(0, 300)); });
    const png = size.key === MAIN ? `${id}.png` : `${id}@${size.key}.png`;
    let row = { id, size: size.key, ok: false, png, meta: metaOf.get(id) };
    try {
      await page.goto(`${BASE}/hud-states.html?s=${encodeURIComponent(id)}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.hudStates && (window.hudStates.ready || window.hudStates.error), null, { timeout: 30_000 });
      const st = await page.evaluate(() => window.hudStates);
      await page.screenshot({ path: `${OUT}/${png}` });
      const m = await page.evaluate(measure);
      // zoneWords is the one pin the page cannot check: the words are counted here.
      const pinFails = (st.pins ?? []).flatMap((p) => Object.entries(p.zoneWords ?? {})
        .filter(([zone, max]) => (m.zones[zone]?.words ?? 0) > max)
        .map(([zone, max]) => `[${p.pkg}] zoneWords ${zone} ${m.zones[zone].words} > ${max}`));
      const pageError = [st.error, ...errors, ...pinFails].filter(Boolean);
      row = {
        ...row, ...m, meta: st.meta ?? row.meta, moment: st.moment ?? "", anims: st.anims ?? null,
        ok: !!st.ready && errors.length === 0 && pinFails.length === 0,
        error: pageError.length ? pageError.join(" | ") : undefined, warnings: warnings.length ? warnings : undefined,
      };
    } catch (e) {
      row.error = String(e?.message ?? e).split("\n")[0];
    }
    await ctx.close();
    results.push(row);
    console.log(`${row.ok ? "ok  " : "FAIL"} ${`${id}${size.key === MAIN ? "" : `@${size.key}`}`.padEnd(34)} words ${String(row.words ?? "-").padStart(4)}  blocks ${String(row.blocks ?? "-").padStart(3)}  min ${String(row.minFontPx ?? "-").padStart(4)} px  <12px ${String(row.under12 ?? "-").padStart(3)}${row.error ? `  — ${row.error}` : ""}`);
  }
}
await browser.close();

// ------------------------------------------------------------------------------------ judge

/**
 * Everything each row owes, gated in the scope when --budget is given and reported otherwise:
 * zone budgets (§5.1), fonts, apart pairs, animations and — in the full scope — overlaps, sizes and
 * the scenario's maxWords (§5.2).
 */
for (const r of results) {
  if (r.words === undefined) continue;
  const meta = r.meta ?? {};
  const h = Number(r.size.split("x")[1]);
  const breaches = [];
  const add = (kind, what, value, max, zone = "") => breaches.push({ kind, zone, what, value, max });
  // The menu is not the HUD: drop U leaves `Menu.tsx` and its keyart untouched (§5.2 row 66, §6.1),
  // so the menu-error view answers to its pins alone. So does the settings panel's own text (§4.2:
  // out of scope, §9) — only its placement is P7's.
  const offHud = meta.view === "menu-error";
  for (const [zone, z] of Object.entries(r.zones)) {
    if (zone !== "none" && !ZONES.includes(zone)) { if (FULL) add("zone", "unknown zone id", zone, "one of §4.2", zone); continue; }
    if (offHud || zone === "settings" || (zone === "none" ? !FULL : !inScope(zone))) continue;
    for (const [what, value, max] of zone === "none" ? [] : zoneBudget(zone, z, r, meta, h)) if (value > max) add("budget", what, value, max, zone);
    if (z.minFont !== null && z.minFont < MIN_FONT) add("font", "min font px", z.minFont, `≥ ${MIN_FONT}`, zone);
    if (z.under12 > 0) add("font", "text under 12 px", z.under12, 0, zone);
  }
  r.overlaps = overlapsOf(r.boxes);
  r.apart = apartOf(r.boxes);
  for (const p of r.apart) {
    const gated = FULL || (p.kind !== "cross" && inScope(p.a) && inScope(p.b));
    p.gated = gated;
    if (gated && !p.ok) add("apart", `${p.a} × ${p.b} gap`, p.gap, `≥ ${p.min}`, `${p.a}×${p.b}`);
  }
  const anims = r.anims?.list ?? [];
  const scoped = anims.filter((a) => (FULL ? true : inScope(a.zone)));
  const finite = scoped.filter((a) => a.endMs !== null);
  r.animMaxMs = anims.some((a) => a.endMs !== null) ? Math.max(...anims.filter((a) => a.endMs !== null).map((a) => a.endMs)) : null;
  r.infinite = anims.filter((a) => a.endMs === null).map((a) => `${a.name} (${a.zone})`);
  if (!offHud) for (const a of finite) if (a.endMs > MAX_ANIM_MS) add("anim", `${a.name} on ${a.target} ms`, a.endMs, `≤ ${MAX_ANIM_MS}`, a.zone);
  const animCount = r.anims ? (FULL ? r.anims.count : SCOPE.reduce((s, z) => s + (r.anims.byZone[z] ?? 0), 0)) : 0;
  r.animsInScope = animCount;
  if (REDUCED && !offHud && animCount > 0) add("anim", "animations under reduced motion", animCount, 0);
  if (r.canvasMin !== null && inScope("radar") && r.canvasMin < CANVAS_MIN) add("canvas", "canvas font px", r.canvasMin, `≥ ${CANVAS_MIN}`, "radar");
  if (FULL && !offHud) {
    const gatedSizes = new Set(Object.entries(r.zones).filter(([zone]) => zone !== "settings").flatMap(([, z]) => z.sizeList)).size;
    if (r.overlaps.length) add("overlap", "zone boxes overlapping", r.overlaps.length, 0);
    if (gatedSizes > MAX_SIZES) add("sizes", "distinct font sizes", gatedSizes, `≤ ${MAX_SIZES}`);
    if (r.size === MAIN && meta.maxWords !== null && meta.maxWords !== undefined && r.words > meta.maxWords) add("maxWords", "words", r.words, `≤ ${meta.maxWords}`);
  }
  r.breaches = breaches;
}
const oldMain = results.filter((r) => r.size === MAIN && r.meta && !r.meta.isNew && r.words !== undefined);
const globalBreaches = [];
if (FULL && oldMain.length === 28) {
  const t = oldMain.reduce((s, r) => s + r.words, 0);
  if (t > OLD_TOTAL_MAX) globalBreaches.push(`the 28 pre-drop scenarios: ${t} words at ${MAIN} > ${OLD_TOTAL_MAX}`);
}

// ------------------------------------------------------------------------------------ report

const failed = results.filter((r) => !r.ok);
const breachRows = results.filter((r) => r.breaches?.length);
const breachCount = breachRows.reduce((s, r) => s + r.breaches.length, 0) + globalBreaches.length;
const esc = (s) => String(s).replace(/\|/g, "\\|");
const zoneCell = (r) => {
  const zs = Object.entries(r.zones ?? {}).filter(([, z]) => z.words > 0).sort((a, b) => b[1].words - a[1].words);
  const over = new Set((r.breaches ?? []).filter((b) => b.kind === "budget").map((b) => b.zone));
  return zs.map(([zone, z]) => `${zone} ${z.words}${over.has(zone) ? "✗" : ""}`).join(" · ") || "–";
};
const apartCell = (r) => (r.apart?.length ? `${r.apart.filter((p) => !p.ok).length}/${r.apart.length}` : "–");
const tableFor = (size) => {
  const rows = results.filter((r) => r.size === size.key);
  const done = rows.filter((r) => r.words !== undefined);
  const sum = (rs, k) => rs.reduce((s, r) => s + (r[k] ?? 0), 0);
  const min = (rs, k) => Math.min(...rs.map((r) => r[k] ?? Infinity));
  const old = done.filter((r) => r.meta && !r.meta.isNew);
  const totals = (name, rs) => `| **${name}** | ${sum(rs, "words")} | ${sum(rs, "blocks")} | ${min(rs, "minFontPx")} | ${sum(rs, "under12")} | ${sum(rs, "under13")} | ${Math.max(...rs.map((r) => r.sizes ?? 0))} | | ${sum(rs, "overlapsN")} | | | | | ${size.key === MAIN ? rs.reduce((s, r) => s + (r.meta?.maxWords ?? 0), 0) : ""} | |`;
  for (const r of rows) r.overlapsN = r.overlaps?.length ?? 0;
  return [
    `## ${size.key}`,
    "",
    "| scenario | words | blocks | min font px | <12px count | <13px | sizes | zones | overlaps | apart | anims | animMaxMs | canvasMin | maxWords | png |",
    "|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---|",
    ...rows.map((r) => `| ${r.ok ? r.id : `${r.id} **FAILED**`}${r.meta?.isNew ? " ⁿ" : ""} | ${r.words ?? "–"} | ${r.blocks ?? "–"} | ${r.minFontPx ?? "–"} | ${r.under12 ?? "–"} | ${r.under13 ?? "–"} | ${r.sizes ?? "–"} | ${esc(zoneCell(r))} | ${r.overlaps?.length ?? "–"} | ${apartCell(r)} | ${r.anims?.count ?? "–"} | ${r.animMaxMs ?? "–"} | ${r.canvasMin ?? "–"} | ${r.meta?.maxWords ?? "–"}${size.key === MAIN && r.meta?.maxWords != null && r.words > r.meta.maxWords ? " ✗" : ""} | [${r.png}](${r.png.replace("@", "%40")}) |`),
    ...(old.length ? [totals(`total (the ${old.length} pre-drop)`, old)] : []),
    ...(done.length ? [totals(`total (all ${done.length})`, done)] : []),
    "",
  ];
};
const first = SIZES[0];
const md = [
  `# HUD states — ${LABEL}`,
  "",
  `${ids.length} scenario(s) × ${SIZES.length} size(s) (${SIZES.map((s) => s.key).join(", ")}), ${new Date().toISOString().slice(0, 10)}. Regenerate: \`node apps/client/e2e/tools/hud-states.mjs --label ${LABEL}${ONLY.length ? ` --only ${ONLY.join(",")}` : ""} --sizes ${SIZES.map((s) => s.key).join(",")}${SCOPE.length ? ` --zones ${SCOPE.join(",")}` : ""}${BUDGET ? " --budget" : ""}${REDUCED ? " --reduced-motion" : ""}\` (page: \`apps/client/hud-states.html?s=<scenario>\`).`,
  `Scope: ${FULL ? "every zone, plus the whole-scenario checks (final gate)" : `zones ${SCOPE.join(", ")} (§7.0 G3)`}; breaches ${BUDGET ? "**gated**" : "reported, not gated"}; motion ${REDUCED ? "**reduced** (prefers-reduced-motion: reduce)" : "normal"}.`,
  "Visible DOM text only (canvas text excluded, occlusion not subtracted); see the tool's header for the definitions. ⁿ = seeded in drop U (§5.2 \"new\").",
  "",
  ...SIZES.flatMap(tableFor),
  `## Breaches (${BUDGET ? "gated" : "reported"}): ${breachCount}`,
  "",
  ...globalBreaches.map((b) => `- ${b}`),
  ...breachRows.map((r) => `- **${r.id}** @${r.size}: ${r.breaches.map((b) => `${b.kind}${b.zone ? ` [${b.zone}]` : ""} ${b.what} ${b.value} (${b.max})`).join("; ")}`),
  ...(breachCount ? [] : ["none"]),
  "",
  `## Zones at ${first.key}`,
  "",
  "words / budget · min font px · <13px · rows (words per row, chip or item)",
  "",
  ...results.filter((r) => r.size === first.key && r.zones).map((r) => `- **${r.id}**: ${Object.entries(r.zones).map(([zone, z]) => {
    const bud = zone === "none" ? [] : zoneBudget(zone, z, r, r.meta ?? {}, first.h);
    return `${zone} ${z.words}${bud.length ? `/${bud.map(([what, , max]) => (what === "words" ? max : `${what} ≤ ${max}`)).join(", ")}` : ""} · ${z.minFont ?? "–"}px · ${z.under13}${z.rows?.length ? ` · rows ${z.rows.join(",")}` : ""}${z.chatLines !== undefined ? ` · ${z.chatLines} lines` : ""}`;
  }).join(" | ")}`),
  "",
  "## Overlaps and apart pairs",
  "",
  "A zone on screen that paints nothing (an empty kill feed) has no box, so no pair with it is measured: it is listed as `no box`.",
  "",
  ...results.filter((r) => r.overlaps?.length || r.apart?.length || r.blank?.length).map((r) => `- **${r.id}** @${r.size}: ${[
    ...r.overlaps.map((o) => `overlap ${o.a} × ${o.b} ${o.w}×${o.h}px`),
    ...r.apart.map((p) => `${p.a} × ${p.b} ${p.gap}px (≥ ${p.min}, ${p.kind}${p.ok ? "" : ", FAILS"})`),
    ...(r.blank?.length ? [`no box: ${r.blank.join(", ")}`] : []),
  ].join("; ")}`),
  ...(results.some((r) => r.overlaps?.length || r.apart?.length) ? [] : ["no zone boxes on any page (no `[data-zone]` yet)"]),
  "",
  `## Animations at ${first.key}`,
  "",
  ...results.filter((r) => r.size === first.key && r.anims?.list?.length).map((r) => `- **${r.id}**: ${r.anims.count} at once; ${r.anims.list.map((a) => `${a.name} ${a.endMs === null ? "∞" : `${a.endMs}ms`} (${a.zone}, ${a.target})`).join(" · ")}`),
  "",
  `## Smallest text per scenario at ${first.key}`,
  "",
  ...results.filter((r) => r.size === first.key && r.smallest?.length).map((r) => `- **${r.id}**: ${r.smallest.slice(0, 5).map((t) => `${t.px}px “${esc(t.text)}”`).join(" · ")}`),
  ...(failed.length ? ["", "## Failed", "", ...failed.map((r) => `- **${r.id}** @${r.size}: ${esc(r.error ?? "not ready")}`)] : []),
  "",
].join("\n");
writeFileSync(`${OUT}/states.md`, md);
const strip = ({ boxes, ...r }) => ({ ...r, boxes: boxes?.map((b) => ({ ...b, x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.r), b: Math.round(b.b) })) });
writeFileSync(`${OUT}/states.json`, JSON.stringify({
  label: LABEL, sizes: SIZES.map((s) => s.key), base: BASE, scope: SCOPE.length ? SCOPE : "all", budget: BUDGET, reducedMotion: REDUCED,
  globalBreaches, scenarios: results.map(strip),
}, null, 2));
console.log(`\nwrote ${OUT}/states.md, states.json and ${results.filter((r) => r.words !== undefined).length} png — ${results.length - failed.length}/${results.length} ok, ${breachCount} breach(es) ${BUDGET ? "gated" : "reported"}`);
process.exit(failed.length || (BUDGET && breachCount) ? 1 : 0);
