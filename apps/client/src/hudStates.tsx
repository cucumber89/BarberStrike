/**
 * HUD state gallery — the RUNNER (dev page, not shipped — Vite's build input is `index.html` alone:
 * see `vite.config.ts`, which sets no `rollupOptions.input`, so root pages like this one are served
 * by the dev server and never built).
 *
 * Drop U's brief: the in-game UI is "a thousand captions, tiny counters and no time to read any of
 * it" — make it feel like CS / Call of Duty, the HUD AND the moments around it: warm-up, countdown,
 * round end, halftime, death, pause, match end. Every one of those is a moment a player reaches
 * only by playing a match up to it, so nobody could put them side by side and "it is cluttered"
 * stayed an opinion. This page puts the REAL <Hud> (or the real <Loading>, or the real <Menu>) into
 * any of them on demand — `?s=<scenario>` — with a whole match behind it: five against five with
 * Polish nicks, a kill feed, a wallet, a score and clocks that read real numbers.
 * `e2e/tools/hud-states.mjs` photographs every scenario at three sizes and measures words, text
 * blocks, font sizes, zones, gaps and animations, so "simpler" is a number before and after, not an
 * impression.
 *
 * The scenarios themselves live in `gallery/`: one file per drop-U package (`gallery/index.ts`
 * merges them, `gallery/fixtures.ts` holds the clocks, the roster and the builders). This file only
 * RUNS one: it mounts the view, plays the edge, presses the keys, checks every package's pins
 * (docs/UI_U_SPEC.md §8.8) and reports to the tool through `window.hudStates`.
 *
 * Determinism: the gallery owns every clock the HUD reads. `performance.now()` is pinned (the kill
 * feed, the respawn countdown, the damage arrow, the flag notice and the HUD's own 4 Hz clock all
 * read it), `serverNow` is a constant the scenario's deadlines are computed from, and once the
 * moment is on screen every CSS animation is paused at the same offset. The same scenario renders
 * the same pixels on every run.
 *
 * What a returning player sees: the first-run hints are marked as seen (they show once ever, on a
 * timer), and the DEV-only frame counter is hidden unless `&debug=1` — a built game shows it only
 * when the player turns it on in the settings.
 *
 * A round BREAK is not a state but an edge: the HUD recognises it as "the first Prep after
 * Playing" (ui/hud/RoundBanner.tsx, `breakEndsAt`), so those scenarios play the `before` state first and then
 * the break, exactly as the network delivers it. A scenario photographed some time AFTER its edge
 * says so with `elapsed` (see `Scenario.elapsed`).
 */
// The same cascade as the game. `App` imports `Menu`, which imports menu.css, and main.tsx's own
// sheets are evaluated after its imports — so menu.css comes first, then the fonts, styles.css, the
// HUD's ui/hud/index.css and cinematic.css. Measured font sizes and colours are only the game's if the
// cascade is.
import "./ui/menu.css";
import "@fontsource/bebas-neue";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./ui/styles.css";
import "./ui/hud/index.css";
import "./ui/cinematic.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { Hud } from "./ui/Hud";
import { Loading } from "./ui/Loading";
import { HINTS, saveSeen } from "./ui/hintRules";
import { ERROR_TEXT } from "./ui/hud/copy";
import { hud, initialHud, type HudState } from "./game/store";
import { defaultSettings } from "./settings";
import { GALLERY_PROBLEMS, PINS, SCENARIOS, type OwnedScenario, type TaggedPins } from "./gallery/index";
import { S, T, ZONES } from "./gallery/fixtures";

// ------------------------------------------------------------------------------------ clocks

let clock = T;
performance.now = () => clock;
/** Where every CSS animation is paused once the moment is on screen. */
const FREEZE_AT_MS = 600;
/** When animations are counted: this long after the last input (the edge, a key, a click). */
const ANIM_SAMPLE_MS = 50;

// ------------------------------------------------------------------------------------ page API

/** One animation the page ran, as the tool reports it (`anims`, `animMaxMs`). */
interface AnimRow {
  /** `animation-name`, or `transition:<property>`. */
  name: string;
  /** The nearest `[data-zone]` of its target, or `none`. */
  zone: string;
  target: string;
  delay: number;
  duration: number;
  /** `null` for an infinite animation (a pulse), which is listed apart from `animMaxMs`. */
  iterations: number | null;
  /** delay + active duration; `null` when infinite. */
  endMs: number | null;
}
/** A row of the catalogue as the tool reads it. */
interface CatalogRow {
  id: string; n: number; owner: string; isNew: boolean; maxWords: number | null; view: string;
  mode: string; phase: string; roundMode: boolean; elapsed: number; moment: string;
}

declare global {
  interface Window {
    hudStates?: {
      ready: boolean; scenario: string; scenarios: string[]; moment?: string; error?: string;
      /** Every scenario's catalogue row (§5.2 order), and the zone ids of §4.2. */
      catalog?: CatalogRow[]; zones?: readonly string[];
      /** The running scenario's row, pins and animations. */
      meta?: CatalogRow; pins?: TaggedPins[];
      anims?: { count: number; byZone: Record<string, number>; list: AnimRow[] };
    };
    /**
     * Canvas text drawn while the scenario ran, `{text, px}` per `fillText` (the radar's letters,
     * P3). The runner empties it before mount; the tool reports the smallest `px` as `canvasMin`.
     */
    __canvasText?: { text: string; px: number }[];
  }
}

const noop = () => {};
const shopApi = { buy: noop, sell: noop, close: noop, selectClass: noop } as never;
const settings = defaultSettings();
const params = new URLSearchParams(location.search);
const DEBUG = params.get("debug") === "1";

/**
 * The round modes (§6.3: one life a round, a freeze, a break), for the tool's round/continuous
 * budgets. Written out rather than imported: `phase.ts` belongs to P2 after P0, and this runner is
 * frozen, so it must not lean on a name P2 is free to move.
 */
const ROUND_MODES = new Set(["bomb", "duel", "turniej", "ostrzyzeni"]);
const catalogRow = (sc: OwnedScenario): CatalogRow => ({
  id: sc.id, n: sc.n, owner: sc.owner, isNew: !!sc.isNew, maxWords: sc.maxWords, view: sc.view ?? "hud",
  mode: sc.state.mode ?? "", phase: sc.state.phase ?? "", roundMode: ROUND_MODES.has(sc.state.mode ?? ""),
  elapsed: sc.elapsed ?? 0, moment: sc.moment,
});
const CATALOG = SCENARIOS.map(catalogRow);
const IDS = SCENARIOS.map((s) => s.id);

/**
 * Stands in for the game canvas: a night street (sky, facades, pavement) with a warm lamp and a
 * cold sign in it, because HUD text is read over a lit 3D scene and never over flat black.
 */
const SCENE: React.CSSProperties = {
  position: "absolute", inset: 0, zIndex: 0,
  background: [
    "radial-gradient(ellipse 16% 28% at 24% 36%, rgba(255,190,110,.30), transparent 70%)",
    "radial-gradient(ellipse 12% 20% at 74% 40%, rgba(120,170,255,.20), transparent 70%)",
    "linear-gradient(180deg, #0b0f17 0%, #161c28 30%, #252a33 49%, #3a3a3d 50%, #2a2a2e 72%, #151517 100%)",
  ].join(","),
};

function Gallery({ sc }: { sc: OwnedScenario }) {
  const view = sc.view ?? "hud";
  const radar = () => sc.radar ?? null;
  return (
    // `.app` is the game's own root (App.tsx), and the HUD's absolute layout is measured against it.
    <div className="app">
      {!DEBUG && <style>{"[data-testid=debug]{display:none!important}"}</style>}
      {view === "hud" && <div className="hs-scene" style={SCENE} aria-hidden="true" />}
      {view !== "loading" && (
        <Hud
          dormant={view === "loading-ready"}
          settings={settings} onSettings={noop} onLeave={noop}
          onResume={async () => true} onPause={noop} onFullscreen={async () => false}
          onChooseTeam={noop} onVotePlan={noop}
          shop={shopApi} chat={{ send: noop, close: noop }} radar={radar}
        />
      )}
      {view !== "hud" && <Loading ready={view === "loading-ready"} entering={false} onEnter={noop} onCancel={noop} />}
    </div>
  );
}

/** Unknown or missing `?s=`: a plain index of the moments, so the page is usable by hand too. */
function Index({ asked }: { asked: string }) {
  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif", color: "#ddd", overflow: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 20 }}>HUD state gallery</h1>
      {asked && <p style={{ color: "#f88" }}>Unknown scenario “{asked}”.</p>}
      {GALLERY_PROBLEMS.length > 0 && <ul style={{ color: "#f88" }}>{GALLERY_PROBLEMS.map((p) => <li key={p}>{p}</li>)}</ul>}
      <ol>{SCENARIOS.map((s) => <li key={s.id} value={s.n}><a style={{ color: "#9cf" }} href={`?s=${s.id}`}>{s.id}</a> — {s.moment} <small>({s.owner}{s.isNew ? ", new" : ""})</small></li>)}</ol>
    </div>
  );
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const frames = async (n: number) => { for (let i = 0; i < n; i++) await frame(); };
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
/** A whole state, not a patch: nothing from the previous state may leak into the next. */
const whole = (s: Partial<HudState>): HudState => ({ ...initialHud, ...s });

// ------------------------------------------------------------------------------------ animations

const describe = (el: Element | null, pseudo: string | null): string =>
  el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${[...el.classList].map((c) => `.${c}`).join("")}${pseudo ?? ""}` : "?";

/** Samples `document.getAnimations()`: the most seen at once (in all and per zone), and each one. */
function animSampler() {
  const rows = new Map<Animation, AnimRow>();
  let count = 0;
  const byZone: Record<string, number> = {};
  return {
    sample() {
      const list = document.getAnimations();
      count = Math.max(count, list.length);
      const now: Record<string, number> = {};
      for (const a of list) {
        const eff = a.effect instanceof KeyframeEffect ? a.effect : null;
        const target = eff?.target ?? null;
        const zone = target?.closest("[data-zone]")?.getAttribute("data-zone") ?? "none";
        now[zone] = (now[zone] ?? 0) + 1;
        if (rows.has(a)) continue;
        const t = a.effect?.getComputedTiming();
        const delay = Number(t?.delay ?? 0);
        const duration = typeof t?.duration === "number" ? t.duration : 0;
        const it = Number(t?.iterations ?? 1);
        const active = Number(t?.activeDuration ?? duration);
        const name = "animationName" in a ? String((a as CSSAnimation).animationName)
          : "transitionProperty" in a ? `transition:${String((a as CSSTransition).transitionProperty)}` : (a.id || "animation");
        rows.set(a, {
          name, zone, target: describe(target, eff?.pseudoElement ?? null), delay, duration,
          iterations: Number.isFinite(it) ? it : null, endMs: Number.isFinite(it) && Number.isFinite(active) ? Math.round(delay + active) : null,
        });
      }
      for (const [z, c] of Object.entries(now)) byZone[z] = Math.max(byZone[z] ?? 0, c);
    },
    result: () => ({ count, byZone, list: [...rows.values()] }),
  };
}

// ------------------------------------------------------------------------------------ pins

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();
const visible = (el: Element): boolean => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

/** Every pin of every package on this scenario (§8.8), except `zoneWords`, which the tool counts. */
function checkPins(all: readonly TaggedPins[]): string[] {
  const out: string[] = [];
  const shown = document.body.innerText.toLocaleUpperCase("pl");
  const content = norm(document.body.textContent ?? "");
  for (const p of all) {
    const bad = (msg: string) => out.push(`[${p.pkg}] ${msg}`);
    for (const sel of p.expect ?? []) if (!document.querySelector(sel)) bad(`missing ${sel}`);
    for (const t of p.text ?? []) if (!shown.includes(t.toLocaleUpperCase("pl"))) bad(`missing text "${t}"`);
    for (const sel of p.absent ?? []) if (document.querySelector(sel)) bad(`present ${sel}`);
    for (const sel of p.invisible ?? []) {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) bad(`invisible ${sel}: no such element`);
      else if (els.some(visible)) bad(`visible ${sel}`);
    }
    for (const t of p.caseText ?? []) if (!content.includes(norm(t))) bad(`missing exact text "${t}"`);
    for (const { text, zone } of p.textAbsent ?? []) {
      const where = zone ? [...document.querySelectorAll<HTMLElement>(`[data-zone="${zone}"]`)] : [document.body];
      const want = text.toLocaleUpperCase("pl");
      if (where.some((el) => el.innerText.toLocaleUpperCase("pl").includes(want))) bad(`text "${text}" present${zone ? ` in zone ${zone}` : ""}`);
    }
    if (p.leftOf) {
      const [a, b] = p.leftOf;
      const ea = document.querySelector(a), eb = document.querySelector(b);
      if (!ea || !eb) bad(`leftOf ${a} ${b}: missing ${!ea ? a : b}`);
      else {
        const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
        if (ra.right > rb.left) bad(`leftOf ${a} ${b}: ${a} ends at ${Math.round(ra.right)}, ${b} starts at ${Math.round(rb.left)}`);
      }
    }
    for (const sel of p.noScroll ?? []) {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) bad(`noScroll ${sel}: no such element`);
      for (const el of els) if (el.scrollHeight > el.clientHeight + 1) bad(`noScroll ${sel}: scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}`);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------ run

async function main(): Promise<void> {
  const asked = params.get("s") ?? "";
  const sc = SCENARIOS.find((s) => s.id === asked);
  const root = createRoot(document.getElementById("root")!);
  const page = { scenarios: IDS, catalog: CATALOG, zones: ZONES };
  if (GALLERY_PROBLEMS.length || !sc) {
    root.render(<Index asked={sc ? "" : asked} />);
    const error = GALLERY_PROBLEMS.length ? `gallery: ${GALLERY_PROBLEMS.join("; ")}` : asked ? `unknown scenario "${asked}"` : "no ?s= given";
    window.hudStates = { ready: false, scenario: asked, ...page, error };
    return;
  }
  const pins = PINS[sc.id] ?? [];
  const e = sc.elapsed ?? 0;
  window.__canvasText = [];
  // A returning player: every first-run hint already seen (see the header).
  saveSeen(new Set(HINTS.map((h) => h.id)));
  // The moment before, one second earlier on the local clock, when the scenario is an edge; the
  // edge itself `elapsed` ms before the photograph, on both clocks (see `Scenario.elapsed`).
  clock = sc.before ? T - e - 1_000 : T - e;
  const atEdge = (s: Partial<HudState>): Partial<HudState> => (e ? { ...s, serverNow: (s.serverNow ?? S) - e } : s);
  hud.set(whole(sc.before ?? atEdge(sc.state)));
  if (sc.view === "menu-error") {
    // The menu polls the game server's room list. The gallery has no server, and must not depend on
    // whether one happens to listen on :2567 on this machine: the list reads as an empty server.
    const realFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      (input instanceof Request ? input.url : String(input)).endsWith("/rooms")
        ? Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }))
        : realFetch(input, init)) as typeof fetch;
    const { Menu } = await import("./ui/Menu");
    const error = sc.errorCode ? ERROR_TEXT[sc.errorCode] : undefined;
    root.render(<React.StrictMode><div className="app"><Menu settings={settings} onSettings={noop} connecting={false} error={error} onPlay={noop} /></div></React.StrictMode>);
  } else {
    root.render(<React.StrictMode><Gallery sc={sc} /></React.StrictMode>);
  }
  await frames(4);
  if (sc.before) {
    clock = T - e;
    hud.set(whole(atEdge(sc.state)));
    await frames(4);
  }
  if (e) {
    clock = T;
    hud.set(whole(sc.state));
    await frames(4);
  }
  const anims = animSampler();
  for (const code of sc.keys ?? []) window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true }));
  // Longer than the HUD's 300 ms pause arming (ui/hud/PauseMenu.tsx), so a scenario that would wrongly show the
  // pause card shows it before it is checked, not after it is photographed.
  await sleep(ANIM_SAMPLE_MS);
  anims.sample();
  await sleep(450 - ANIM_SAMPLE_MS);
  await frames(2);
  const problems: string[] = [];
  if (sc.clicks?.length) {
    for (const sel of sc.clicks) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) el.click(); else problems.push(`[runner] cannot click ${sel}: no such element`);
      await frames(2);
    }
    await sleep(ANIM_SAMPLE_MS);
    anims.sample();
    await sleep(450 - ANIM_SAMPLE_MS);
    await frames(2);
  }

  problems.push(...checkPins(pins));
  // The pause card arms itself whenever the pointer is free outside the shop; anywhere else it is
  // a scenario that forgot to hold the pointer, not a moment.
  const pointerFree = sc.state.pointerLocked === false && !sc.state.shopOpen;
  if (!sc.view && !pointerFree && document.querySelector("[data-testid=pause]")) problems.push("[runner] unexpected [data-testid=pause]");

  // Every animation stopped at the same offset: a pulse, a toast rising, a reload bar filling.
  anims.sample();
  for (const a of document.getAnimations()) {
    try { a.pause(); a.currentTime = FREEZE_AT_MS; } catch { /* an animation that cannot seek stays paused */ }
  }
  await frames(2);
  const report = { scenario: sc.id, ...page, moment: sc.moment, meta: catalogRow(sc), pins: [...pins], anims: anims.result() };
  window.hudStates = problems.length
    ? { ready: false, ...report, error: problems.join("; ") }
    : { ready: true, ...report };
}

void main().catch((e: unknown) => {
  window.hudStates = { ready: false, scenario: params.get("s") ?? "", scenarios: IDS, catalog: CATALOG, zones: ZONES, error: String(e) };
});
