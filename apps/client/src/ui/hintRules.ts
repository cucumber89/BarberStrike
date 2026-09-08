/**
 * First-run hints.
 *
 * The brief asks for "short, discreet hints during the first game, without a long compulsory
 * tutorial", so the rules here are deliberately strict:
 *
 *  - a hint fires only when its moment arrives (the shop is open, the bomb is down, a plan vote
 *    started) — never a wall of text at spawn;
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

export const HINTS: readonly HintDef[] = [
  { id: "move", text: "WASD to move · mouse to look · left click to fire", ms: 7000 },
  { id: "buy", text: "Press B to open the buy menu — then two numbers to buy, or click", ms: 8000 },
  { id: "pause", text: "ESC pauses and opens the menu. Your side and settings are in there.", ms: 7000 },
  { id: "objective", text: "Carry the charge to site A or B and hold your objective key to plant", ms: 8000 },
  { id: "defuse", text: "The charge is planted — get to it and hold your objective key to defuse", ms: 8000 },
  { id: "plan", text: "Your team is choosing how the map changes this round — F1 or F2", ms: 8000 },
  { id: "team", text: "Outnumbered? ESC → your side. Your money and gear come with you.", ms: 8000 },
];

const byId = new Map(HINTS.map((h) => [h.id, h]));

/** What the hint system needs to know about the round. Deliberately a flat, boring shape. */
export interface HintContext {
  alive: boolean;
  connected: boolean;
  shopOpen: boolean;
  /** Ms of buy window left; > 0 means buying is possible right now. */
  buyWindowLeft: number;
  mode: string;
  /** "buy" | "carried" | "dropped" | "planted" | "resolved" | "" */
  bombStage: string;
  /** True when this player carries the charge. */
  carrying: boolean;
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
  const pick = (id: string) => (seen.has(id) ? null : byId.get(id) ?? null);

  // Something is on screen asking for a decision: that hint first.
  if (ctx.planVoteMine) { const h = pick("plan"); if (h) return h; }
  if (ctx.shopOpen) return null;                       // the menu explains itself; do not talk over it
  if (ctx.buyWindowLeft > 0 && ctx.alive) { const h = pick("buy"); if (h) return h; }
  if (ctx.mode === "bomb" && ctx.carrying) { const h = pick("objective"); if (h) return h; }
  if (ctx.mode === "bomb" && ctx.bombStage === "planted" && ctx.alive) { const h = pick("defuse"); if (h) return h; }
  // A side two or more bodies short is worth mentioning once.
  const other = ctx.myTeam === 0 ? 1 : 0;
  if (ctx.teamTotals[ctx.myTeam] - ctx.teamTotals[other] >= 2) { const h = pick("team"); if (h) return h; }
  // The two general ones, and only after the player has had a moment to look around.
  if (ctx.alive && ctx.elapsedMs > 1500) { const h = pick("move"); if (h) return h; }
  if (ctx.elapsedMs > 25_000) { const h = pick("pause"); if (h) return h; }
  return null;
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
