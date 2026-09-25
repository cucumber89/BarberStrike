import { describe, expect, it } from "vitest";
import { PLANS, planOffer } from "@frankibarber/shared";
import { countWords } from "./format";
import {
  AUTO_CLOSE_MS, CLOSED_FLASH_MS, NO_SHOP, PLAN_CARD_WORDS, SHOP_CLOSED, TOAST_MS,
  buyRow, chipName, closedItself, mergeToasts, planCard, planCardText, toastLeaving, toastText,
  type BuyRowInput, type PlanCardInput, type ToastIn,
} from "./walletToasts";

/** Drop U, P3 (docs/UI_U_SPEC.md §7 P3 ACCEPTANCE): the wallet's toast and its buy row. */

const T = 100_000;
const t = (key: number, delta: number, reason: string, ago: number): ToastIn => ({ key, delta, reason, at: T - ago });

describe("the money toast", () => {
  it("changes within 2500 ms merge into one +$N", () => {
    // A kill, its assist and a second kill, each inside 2500 ms of the one before: one toast.
    const burst = [t(1, 300, "kill", 2_000), t(2, 100, "assist", 1_200), t(3, 300, "kill", 100)];
    const m = mergeToasts(null, burst, T);
    expect(m).not.toBeNull();
    expect(toastText(m!)).toBe("+$700");
    expect(m!.key, "keyed by the last change, so the rise plays again").toBe(3);
    // Folding the same store again (the next render) counts nothing twice.
    expect(mergeToasts(m, burst, T + 250)).toEqual(m);
    // The store prunes each change 2500 ms after it arrived; the toast keeps its sum until it leaves.
    const later = mergeToasts(m, burst.slice(2), T + 2_300);
    expect(toastText(later!)).toBe("+$700");
    // It leaves 2500 ms after the last change…
    expect(mergeToasts(later, [], T - 100 + TOAST_MS)).toBeNull();
    // …and a change after that starts a new toast instead of adding to the old one.
    const next = mergeToasts(later, [t(4, 50, "capture", -TOAST_MS)], T + TOAST_MS);
    expect(toastText(next!)).toBe("+$50");
  });

  it("reset and buy never toast", () => {
    expect(mergeToasts(null, [t(1, -1_400, "buy", 100)], T)).toBeNull();
    expect(mergeToasts(null, [t(1, 800, "reset", 100)], T)).toBeNull();
    // Beside a kill they are simply left out of the sum.
    const m = mergeToasts(null, [t(1, 300, "kill", 900), t(2, -2_700, "buy", 600), t(3, 800, "reset", 300)], T);
    expect(toastText(m!)).toBe("+$300");
  });

  it("a toast is 1 word", () => {
    for (const delta of [50, 300, 3_250, 16_000, 1_400]) expect(countWords(toastText({ delta })), String(delta)).toBe(1);
    expect(toastText({ delta: 3_250 })).toBe("+$3,250");
    // No reason word rides along any more (it was „ZABÓJSTWO”, „W GŁOWĘ”…).
    const m = mergeToasts(null, [t(1, 300, "kill", 0), t(2, 150, "headshot", 0), t(3, 1_400, "round", 0)], T);
    expect(countWords(toastText(m!))).toBe(1);
  });

  it("fades over its last 500 ms", () => {
    const m = mergeToasts(null, [t(1, 300, "kill", 0)], T)!;
    expect(toastLeaving(m, T + 1_999)).toBe(false);
    expect(toastLeaving(m, T + 2_000)).toBe(true);
  });
});

describe("the buy row", () => {
  const base: BuyRowInput = { noShop: false, alive: true, shopOpen: false, buyWindowLeft: 11_400, shopResult: null, autoClosedAt: Number.NEGATIVE_INFINITY, now: T };
  const row = (o: Partial<BuyRowInput>) => buyRow({ ...base, ...o });

  it("counts whole seconds, turns amber at 5 s and has no countdown for an endless window", () => {
    expect(row({})).toEqual({ kind: "buy", secs: 12, warn: false });
    expect(row({ buyWindowLeft: 2_600 })).toEqual({ kind: "buy", secs: 3, warn: true });
    expect(row({ buyWindowLeft: 5_000 })).toEqual({ kind: "buy", secs: 5, warn: true });
    expect(row({ buyWindowLeft: Infinity })).toEqual({ kind: "buy", secs: null, warn: false });
    // Dead, shopping already, or the window spent: no row.
    expect(row({ alive: false })).toBeNull();
    expect(row({ shopOpen: true })).toBeNull();
    expect(row({ buyWindowLeft: 0 })).toBeNull();
  });

  it("B outside the window crosses the cart: SKLEP ZAMKNIĘTY, or BEZ SKLEPU W TYM TRYBIE with no shop", () => {
    const closed = { reason: "closed", at: T - 600 };
    expect(row({ buyWindowLeft: 0, shopResult: closed })).toEqual({ kind: "closed", text: SHOP_CLOSED });
    expect(row({ buyWindowLeft: 0, shopResult: closed, noShop: true })).toEqual({ kind: "closed", text: NO_SHOP });
    expect(NO_SHOP).toBe("BEZ SKLEPU W TYM TRYBIE");
    // 1800 ms, then gone; a no-shop mode has no buy row at all otherwise.
    expect(row({ buyWindowLeft: 0, shopResult: { reason: "closed", at: T - CLOSED_FLASH_MS } })).toBeNull();
    expect(row({ noShop: true })).toBeNull();
    // Words per second (§6.5): 5 words in 1.8 s is under 3 a second.
    expect(countWords(NO_SHOP) / (CLOSED_FLASH_MS / 1000)).toBeLessThanOrEqual(3);
    expect(countWords(SHOP_CLOSED)).toBe(2);
  });

  it("crosses the cart for 600 ms when the shop closes itself", () => {
    expect(closedItself(true, false, 0)).toBe(true);
    expect(closedItself(true, false, 4_000), "closed by the player, window still open").toBe(false);
    expect(closedItself(false, false, 0)).toBe(false);
    expect(row({ buyWindowLeft: 0, autoClosedAt: T - 100 })).toEqual({ kind: "autoClosed" });
    expect(row({ buyWindowLeft: 0, autoClosedAt: T - AUTO_CLOSE_MS })).toBeNull();
  });
});

/**
 * The plan card's words (§5.1: ≤ 24 as the freeze card; §7 P3 ACCEPTANCE: in `bomb-freeze` the
 * wallet and the plan together ≤ 28). Walked over EVERY offer the rounds make — not only the one
 * the gallery photographs — for both sides, before and after votes, with and without my own.
 */
describe("the plan card", () => {
  /** Every distinct offer a match can make (`planOffer` is a function of the round alone). */
  const offers = [...new Map(Array.from({ length: 60 }, (_, r) => planOffer(r + 1)).filter((o) => o.length).map((o) => [o.join(), o])).values()];
  const tallies = [[0, 0], [2, 1], [1, 2], [1, 1], [0, 3]];
  const every = (): PlanCardInput[] => offers.flatMap((options) => [true, false].flatMap((mine) =>
    tallies.flatMap((tally) => [null, ...options].map((voted) => ({ options, tally, mine, voted: mine ? voted : null, secs: 12, compact: false })))));
  /** „$4,100 [B] 12s”: the bomb freeze's wallet (money, key, seconds — no toast). */
  const WALLET_FREEZE = countWords("$4,100 B 12s");

  it("walks the three offers a match makes", () => {
    expect(offers.map((o) => o.join())).toEqual(["1,2", "2,3", "3,1"]);
  });

  it("holds its 24 words for every offer, and the bomb freeze its 28 with the wallet", () => {
    for (const input of every()) {
      const card = planCard(input);
      const words = countWords(planCardText(card));
      const at = `${input.options} ${input.mine ? "attack" : "defence"} tally ${input.tally} voted ${input.voted}`;
      expect(words, at).toBeLessThanOrEqual(PLAN_CARD_WORDS);
      expect(words + WALLET_FREEZE, at).toBeLessThanOrEqual(28);
      // …and it never pays for that with the gain and the cost: the focused option keeps both.
      const focus = input.voted ?? card.rows.find((r) => r.leading)?.id ?? null;
      expect(card.rows.filter((r) => r.detail).map((r) => r.id), at).toEqual(focus === null ? [] : [focus]);
      // The focused option, the one being explained, keeps its full name.
      for (const r of card.rows) if (r.detail) expect(r.name, at).toBe(r.full);
    }
  });

  it("prints §5.2 #10 word for word when it fits (the offer of round 2)", () => {
    const card = planCard({ options: [1, 2], tally: [2, 1], mine: true, voted: null, secs: 12, compact: false });
    expect(planCardText(card)).toBe(
      "PLAN RUNDY · 12s F1 OTWÓRZ ROLETĘ · 2 + Drugie wejście od Głównej ulicy. − Obrona też może nim wyjść. F2 ZBURZ MUR W ZAUŁKU · 1 ");
    expect(countWords(planCardText(card))).toBe(23);
    const def = planCard({ options: [1, 2], tally: [2, 1], mine: false, voted: null, secs: 12, compact: false });
    expect(def.title).toBe("ATAK WYBIERA PLAN");
    expect(def.rows.map((r) => r.key)).toEqual([null, null]);
  });

  it("shortens the OTHER option's name first when two long names would not fit (the offer of round 5)", () => {
    // Round 5 offers plans 2 and 3, both four-word names. In full, with F1 leading, the card was
    // 26 words (3 + 6 + 5 + 6 + 6): over the 24.
    const card = planCard({ options: [2, 3], tally: [2, 1], mine: true, voted: null, secs: 12, compact: false });
    expect(card.rows.map((r) => `${r.key} ${r.name} · ${r.votes}`)).toEqual(["F1 ZBURZ MUR W ZAUŁKU · 2", "F2 ZDEJMIJ SCHODY · 1"]);
    expect(card.rows[0].detail).toEqual({ gain: PLANS[1].gain, cost: PLANS[1].cost });
    expect(countWords(planCardText(card))).toBe(24);
    // My own vote moves the focus, and the full name with it.
    const mine = planCard({ options: [2, 3], tally: [2, 1], mine: true, voted: 3, secs: 12, compact: false });
    expect(mine.rows.map((r) => r.name)).toEqual(["ZBURZ MUR", "ZDEJMIJ SCHODY NA CZATOWNIĘ"]);
    expect(mine.rows[1].chosen).toBe(true);
    // Before any vote there is nothing to explain, and every name is printed in full.
    const none = planCard({ options: [2, 3], tally: [0, 0], mine: true, voted: null, secs: 12, compact: false });
    expect(none.rows.map((r) => [r.name, r.detail])).toEqual([["ZBURZ MUR W ZAUŁKU", null], ["ZDEJMIJ SCHODY NA CZATOWNIĘ", null]]);
  });

  it("tells the three plans apart by their short names", () => {
    expect(new Set(PLANS.map((p) => chipName(p.name))).size).toBe(PLANS.length);
    for (const p of PLANS) expect(countWords(chipName(p.name))).toBeLessThanOrEqual(2);
  });

  it("is its header and two rows on a short screen (§4.2)", () => {
    for (const input of every()) {
      const card = planCard({ ...input, compact: true });
      expect(card.rows.every((r) => !r.detail && countWords(r.name) <= 2)).toBe(true);
      expect(countWords(planCardText(card))).toBeLessThanOrEqual(12);
    }
  });
});
