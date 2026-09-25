import { planById, type MoneyEvent, type PlanEvent } from "@frankibarber/shared";
import { countWords, money } from "./format";

/**
 * Drop U, P3: what the wallet says besides the money itself, decided here and drawn by
 * `Wallet.tsx` (docs/UI_U_SPEC.md §7 P3 WORK 2, §6.1 "Money toast", §6.5).
 *
 * Pure, so the three rules the brief cares about are unit-tested rather than eyeballed:
 *  - a burst of money is ONE number: every change within 2500 ms folds into a single „+$N”, with
 *    no reason word — today a kill and its assist were two rows and two captions;
 *  - resets and purchases never toast: you pressed the button, you know;
 *  - the buy row is a cart, a key and a number of seconds, or — after B outside the window — a
 *    crossed cart and two words for 1800 ms (five in a mode with no shop at all).
 *
 * The plan card under the wallet (`PlanPanel.tsx`) keeps its words here too, at the end: it is
 * the left column's other counted text, and this is the column's one pure, tested module.
 */

/** A merged toast lives this long after the LAST change in it; changes inside it merge. */
export const TOAST_MS = 2500;
/** …and fades over its last 500 ms (§6.1). */
export const TOAST_FADE_MS = 500;
/** „SKLEP ZAMKNIĘTY” after B outside the window (§5.2 #46; 2 words / 1.8 s, 5 / 1.8 = 2.8 w/s). */
export const CLOSED_FLASH_MS = 1800;
/** The crossed cart after the shop closed itself at the end of the window (§6.1 "Shop"). */
export const AUTO_CLOSE_MS = 600;
/** The buy countdown turns warn amber at this many seconds (§3.4 `--hud-warn`). */
export const BUY_WARN_S = 5;

/** The shop's words, in the HUD's case (pinned by the gallery; Principle 10). */
export const SHOP_CLOSED = "SKLEP ZAMKNIĘTY";
export const NO_SHOP = "BEZ SKLEPU W TYM TRYBIE";

/** One money change as the store keeps it (`HudState.moneyToasts`, written by `Game.ts`). */
export interface ToastIn {
  key: number;
  delta: number;
  reason: MoneyEvent["reason"] | string;
  /** Local clock (`performance.now()`) it arrived at. */
  at: number;
}

/** The one toast on screen. */
export interface MergedToast {
  /** The key of the last change folded in: a new change re-keys it, so the rise plays again. */
  key: number;
  /** The sum of every change folded in. */
  delta: number;
  /** When the last change arrived; the toast leaves `TOAST_MS` after it. */
  at: number;
  /** The highest store key already looked at, so a change is never counted twice. */
  seen: number;
}

/** Reasons that never toast: the round's reset to start money, and your own purchases. */
const QUIET: ReadonlySet<string> = new Set(["reset", "buy"]);

/**
 * Fold the store's money changes into the one toast on screen. `prev` is what the last call
 * returned (null at first): changes it already saw are skipped, so calling it on every render is
 * idempotent. A change within `TOAST_MS` of the previous one joins it; otherwise it starts anew.
 * Returns null when nothing is left to show.
 */
export function mergeToasts(prev: MergedToast | null, toasts: readonly ToastIn[], now: number): MergedToast | null {
  let cur = prev && now - prev.at < TOAST_MS ? prev : null;
  let seen = prev?.seen ?? Number.NEGATIVE_INFINITY;
  const fresh = toasts.filter((t) => t.key > seen);
  if (!fresh.length) return cur;
  for (const t of [...fresh].sort((a, b) => a.key - b.key)) {
    seen = Math.max(seen, t.key);
    if (QUIET.has(t.reason) || t.delta === 0 || now - t.at >= TOAST_MS) continue;
    cur = cur && t.at - cur.at < TOAST_MS
      ? { key: t.key, delta: cur.delta + t.delta, at: t.at, seen }
      : { key: t.key, delta: t.delta, at: t.at, seen };
  }
  return cur ? { ...cur, seen } : null;
}

/** „+$300”, „+$3,250”, „-$150”: one token, so one word (§3.10). */
export const toastText = (t: Pick<MergedToast, "delta">): string => (t.delta > 0 ? `+${money(t.delta)}` : money(t.delta));

/** Is the toast in its last 500 ms (the fade)? */
export const toastLeaving = (t: Pick<MergedToast, "at">, now: number): boolean => now - t.at >= TOAST_MS - TOAST_FADE_MS;

/** What the buy row under the money shows. */
export type BuyRow =
  /** The cart, [B] and the seconds left (`null`: an endless window — no countdown at all). */
  | { kind: "buy"; secs: number | null; warn: boolean }
  /** B outside the window: the crossed cart and the words, for `CLOSED_FLASH_MS`. */
  | { kind: "closed"; text: string }
  /** The shop just closed itself: the crossed cart alone, for `AUTO_CLOSE_MS`. */
  | { kind: "autoClosed" };

export interface BuyRowInput {
  /** The mode has no shop at all (`MODES[mode].shop === "none"`: gun game). */
  noShop: boolean;
  alive: boolean;
  shopOpen: boolean;
  /** Ms of buy window left; `Infinity` at a counter or in the warm-up. */
  buyWindowLeft: number;
  /** The store's last shop answer; `reason: "closed"` is B pressed outside the window. */
  shopResult: { reason?: string; at: number } | null;
  /** When the shop last closed itself (local clock); -Infinity when it has not. */
  autoClosedAt: number;
  now: number;
}

/** The buy row, or null for none. */
export function buyRow(i: BuyRowInput): BuyRow | null {
  const r = i.shopResult;
  if (r && r.reason === "closed" && !i.shopOpen && i.now - r.at < CLOSED_FLASH_MS) return { kind: "closed", text: i.noShop ? NO_SHOP : SHOP_CLOSED };
  if (i.noShop || i.shopOpen) return null;
  if (i.now - i.autoClosedAt < AUTO_CLOSE_MS) return { kind: "autoClosed" };
  if (!i.alive || !(i.buyWindowLeft > 0)) return null;
  const secs = Number.isFinite(i.buyWindowLeft) ? Math.ceil(i.buyWindowLeft / 1000) : null;
  return { kind: "buy", secs, warn: secs !== null && secs <= BUY_WARN_S };
}

/**
 * Did the shop just close ITSELF? It was open, now it is not, and the window is spent — the
 * automatic close at the end of the window (`Game.ts` `syncHud`), not the player's own B or Esc.
 */
export const closedItself = (wasOpen: boolean, open: boolean, buyWindowLeft: number): boolean =>
  wasOpen && !open && !(buyWindowLeft > 0);

// ------------------------------------------------------------------------------------ the plan card

/** §5.1: the freeze card's word budget („PLAN RUNDY · 12s”, the rows, the gain and the cost). */
export const PLAN_CARD_WORDS = 24;

/** One option row of the freeze card: „[F1] OTWÓRZ ROLETĘ · 2”, and under the focused one its gain and cost. */
export interface PlanCardRow {
  id: number;
  /** „F1” / „F2” for the side that votes; null for the side that watches (no keys). */
  key: string | null;
  /** The name as printed: the full one, or its two-word short form (`chipName`). */
  name: string;
  /** The plan's full name (the row's accessible name when `name` is the short form). */
  full: string;
  votes: number;
  /** I voted for it. */
  chosen: boolean;
  /** It leads the tally right now (a tie to the lower id, as `tallyVotes` settles it). */
  leading: boolean;
  /** The gain and the cost, on the ONE focused row only; null elsewhere. */
  detail: { gain: string; cost: string } | null;
}

export interface PlanCard {
  /** „PLAN RUNDY” for the side that votes, „ATAK WYBIERA PLAN” for the side that watches. */
  title: string;
  /** „12s”: the seconds left in the vote. */
  secs: string;
  rows: PlanCardRow[];
}

export interface PlanCardInput extends Pick<PlanEvent, "options" | "tally"> {
  /** My side votes this round. */
  mine: boolean;
  /** The option I voted for this round, if any. */
  voted: number | null;
  /** Seconds left in the vote. */
  secs: number;
  /** A screen 600 px high or less: the header and the option rows only, short names (§4.2). */
  compact: boolean;
}

/** The option ahead right now, as `tallyVotes` would settle it (a tie to the lower id); null with no votes. */
export function leading(p: Pick<PlanEvent, "options" | "tally">): number | null {
  let best: number | null = null, bestN = 0;
  p.options.forEach((id, i) => {
    const n = p.tally[i] ?? 0;
    if (n > bestN || (n === bestN && n > 0 && best !== null && id < best)) { best = id; bestN = n; }
  });
  return best;
}

/**
 * The short name: its first two words („ZBURZ MUR W ZAUŁKU” → „ZBURZ MUR”). Each of the three plans
 * is told apart by its first two words alone (OTWÓRZ ROLETĘ, ZBURZ MUR, ZDEJMIJ SCHODY), so the
 * live chip „PLAN: …” stays within its 3 words (§5.1), and so does a row of the card that must
 * give way. The full name is always the element's accessible name.
 */
export const chipName = (name: string): string => name.split(/\s+/).slice(0, 2).join(" ");

/**
 * Polish typesetting: a one-letter word („W”, „a”, „i”, „z”) never ends a line — it is tied to the
 * next word with a no-break space, so „ZBURZ MUR W ZAUŁKU” wraps as „ZBURZ MUR / W ZAUŁKU”.
 */
export const polishWrap = (s: string): string => s.replace(/(^|\s)(\p{L})\s+/gu, "$1$2\u00a0");

/** The card as the tool reads it: every printed text, in order (for `countWords`). */
export const planCardText = (c: PlanCard): string => [
  `${c.title} · ${c.secs}`,
  ...c.rows.flatMap((r) => [`${r.key ?? ""} ${r.name} · ${r.votes}`, r.detail ? `+ ${r.detail.gain} − ${r.detail.cost}` : ""]),
].join(" ");

/**
 * The freeze card's words (§7 P3 WORK 3, §5.2 #10), within its 24 (§5.1) for EVERY offer.
 *
 * The gain and the cost go under ONE option: the one I voted for, else the one leading; before any
 * vote, under none. The names are printed in full while the card fits its words — the offer of
 * round 2, „[F1] OTWÓRZ ROLETĘ · 2”, „[F2] ZBURZ MUR W ZAUŁKU · 1” with F1's gain and cost, is 23 —
 * but two four-word names and a long gain and cost do not: round 5 offers plans 2 and 3, and that
 * card would be 26 words for the attack and 25 for the defence. So the card gives way in steps,
 * each only as far as it must, and the step it stops at is the first that fits:
 *  1. every name in full;
 *  2. the OTHER option's name short („F2 ZDEJMIJ SCHODY · 1”) — the focused one, the one being
 *     explained, keeps its full name beside its gain and cost;
 *  3. every name short;
 *  4. no gain and cost (never reached with today's three plans; the test walks every offer).
 * On a short screen (`compact`) the card is its header and rows with short names (§4.2).
 */
export function planCard(i: PlanCardInput): PlanCard {
  const title = i.mine ? "PLAN RUNDY" : "ATAK WYBIERA PLAN";
  const secs = `${Math.max(0, i.secs)}s`;
  const lead = leading(i);
  const focus = i.compact ? null : i.voted ?? lead;
  const build = (shortOther: boolean, shortFocus: boolean, detail: boolean): PlanCard => ({
    title, secs,
    rows: i.options.flatMap((id, k) => {
      const plan = planById(id);
      if (!plan) return [];
      const focused = id === focus;
      const short = i.compact || (focused ? shortFocus : shortOther);
      return [{
        id, key: i.mine ? `F${k + 1}` : null, name: short ? chipName(plan.name) : plan.name, full: plan.name,
        votes: i.tally[k] ?? 0, chosen: i.voted === id, leading: lead === id,
        detail: focused && detail ? { gain: plan.gain, cost: plan.cost } : null,
      }];
    }),
  });
  const steps: [boolean, boolean, boolean][] = [[false, false, true], [true, false, true], [true, true, true], [true, true, false]];
  for (const [other, own, detail] of steps) {
    const card = build(other, own, detail);
    if (countWords(planCardText(card)) <= PLAN_CARD_WORDS) return card;
  }
  return build(true, true, false);
}
