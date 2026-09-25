import { describe, expect, it } from "vitest";
import { countWords } from "./format";
import {
  AUTO_CLOSE_MS, CLOSED_FLASH_MS, NO_SHOP, SHOP_CLOSED, TOAST_MS,
  buyRow, closedItself, mergeToasts, toastLeaving, toastText, type BuyRowInput, type ToastIn,
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
