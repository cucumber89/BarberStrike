/**
 * First-run hints.
 *
 * The brief asks for "short, discreet hints during the first game, without a long compulsory
 * tutorial", so the rules here are deliberately strict:
 *
 *  - a hint fires only when its moment arrives (the buy window is open, a plan vote started, a
 *    side is short) — never a wall of text at spawn;
 *  - each one is shown ONCE, ever, and remembered across sessions;
 *  - one at a time, and it leaves on its own;
 *  - nothing blocks play, and nothing has to be dismissed to continue.
 *
 * Pure: `nextHint` is a function of state and what has been seen, so it is unit-tested rather than
 * discovered by playing.
 */

export interface HintDef {
  id: string;
  /** The sentence, written so it can be read at a glance mid-round. */
  text: string;
  /** How long it stays, ms. */
  ms: number;
}

/**
 * Drop U (P3, docs/UI_U_SPEC.md §7 P3 WORK 5): the two bomb hints („zanieś ładunek na A lub B…”,
 * „ładunek podłożony — dobiegnij…”) are gone. They said what the mode line and the action slot
 * already say at that moment („MASZ ŁADUNEK”, „PRZYTRZYMAJ [T] · PODŁÓŻ”, „ROZBRÓJ [T]”), and
 * one question gets one place (§2 Principle 1).
 */
export const HINTS: readonly HintDef[] = [
  { id: "move", text: "WASD — ruch · mysz — rozglądanie · lewy przycisk — strzał", ms: 7000 },
  { id: "buy", text: "B otwiera sklep — potem dwie cyfry (dział, pozycja) albo kliknij", ms: 8000 },
  { id: "pause", text: "ESC to pauza i menu: tam zmienisz stronę i ustawienia.", ms: 7000 },
  { id: "plan", text: "Twoja drużyna wybiera zmianę mapy na tę rundę — F1 albo F2", ms: 8000 },
  { id: "team", text: "Za dużo was? ESC → zmiana strony. Kasa i sprzęt idą z tobą.", ms: 8000 },
];

const byId = new Map(HINTS.map((h) => [h.id, h]));

/** What the hint system needs to know about the round. Deliberately a flat, boring shape. */
export interface HintContext {
  alive: boolean;
  connected: boolean;
  shopOpen: boolean;
  /**
   * Something hides the hint zone right now — the shop, Tab, the pause card or death (§4.5's hide
   * rows in `left.css`). A hint is shown once EVER, so picking one under a cover would spend it unseen.
   */
  covered: boolean;
  /** Ms of buy window left; > 0 means buying is possible right now. */
  buyWindowLeft: number;
  /** A plan vote is open and this player's team is the one voting. */
  planVoteMine: boolean;
  /** Team sizes as the picker shows them. */
  teamTotals: [number, number];
  myTeam: 0 | 1;
  /** Seconds the player has been in this match. */
  elapsedMs: number;
}

/**
 * The hint to show now, or null. Highest-value first: a hint about the thing the player is looking
 * at beats a general one.
 */
export function nextHint(ctx: HintContext, seen: ReadonlySet<string>): HintDef | null {
  if (!ctx.connected) return null;
  // Nothing is picked while the zone is hidden — not even the plan hint: the vote runs on under
  // the shop or Tab, and a hint picked there is remembered as seen but never read. It waits for
  // the overlay to close (the vote usually outlasts a quick buy). Death is a cover too: §4.5 hides
  // the hint zone under `data-alive=false`, so a pick while dead would be spent unseen.
  if (ctx.covered || ctx.shopOpen || !ctx.alive) return null;
  const pick = (id: string) => (seen.has(id) ? null : byId.get(id) ?? null);

  // Something is on screen asking for a decision: that hint first.
  if (ctx.planVoteMine) { const h = pick("plan"); if (h) return h; }
  if (ctx.buyWindowLeft > 0) { const h = pick("buy"); if (h) return h; }
  // A side two or more bodies short is worth mentioning once.
  const other = ctx.myTeam === 0 ? 1 : 0;
  if (ctx.teamTotals[ctx.myTeam] - ctx.teamTotals[other] >= 2) { const h = pick("team"); if (h) return h; }
  // The two general ones, and only after the player has had a moment to look around.
  if (ctx.elapsedMs > 1500) { const h = pick("move"); if (h) return h; }
  if (ctx.elapsedMs > 25_000) { const h = pick("pause"); if (h) return h; }
  return null;
}

/**
 * A hint that was on screen for less than this before something covered it (the shop, Tab, the
 * pause card, the match's end) was not read: it goes back to unseen and may come again.
 */
export const HINT_READ_MS = 2000;

/** Was a hint cut off before it could be read? Then it must not stay remembered as seen. */
export function cutBeforeRead(shownMs: number, ms: number): boolean {
  return shownMs < Math.min(HINT_READ_MS, ms);
}

const KEY = "fb_hints_seen_v1";

export function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : []);
  } catch { return new Set(); }
}

export function saveSeen(seen: ReadonlySet<string>): void {
  try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* storage unavailable */ }
}

/** For the settings panel: let a player ask to be shown them again. */
export function resetSeen(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
