import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MODES, MatchPhase } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { money } from "./format";
import { IconCart } from "./icons";
import { useLeftSlot } from "./LeftColumn";
import { polishWrap } from "../PlanPanel";
import { buyRow, closedItself, mergeToasts, toastLeaving, toastText, type BuyRow, type MergedToast } from "./walletToasts";
import type { ZoneProps } from "./types";

/**
 * Drop U, P3: the wallet, zone `wallet` (docs/UI_U_SPEC.md §7 P3 WORK 2), in the left column
 * under the radar (its slot, `LeftColumn.tsx`). Money is the one place money lives: CS2's
 * green „$4,100” at t3, visible while dead (the next buy depends on it), with the one merged
 * „+$N” toast beside it and, under it, the buy row — a cart, [B] and „12s”, amber from 5 s.
 * After B outside the window the cart is crossed out for 1800 ms with „SKLEP ZAMKNIĘTY” (or „BEZ
 * SKLEPU W TYM TRYBIE” where the mode has none); when the shop closes itself, for 600 ms with no
 * word. What shows is decided in `walletToasts.ts` (pure, tested); this only draws it.
 *
 * Four words at most: money, toast, B, seconds. The reason words („ZABÓJSTWO”, „W GŁOWĘ”…), the
 * word „SKLEP” and The Boys' „B: rola / sklep” line are gone; the class is P4's vitals header.
 */
export const Wallet = memo(function Wallet({ now }: ZoneProps & { now: number }) {
  const slot = useLeftSlot("wallet");
  const connected = useHudSlice((s) => s.connected);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const noShop = useHudSlice((s) => MODES[s.mode].shop === "none");
  const cash = useHudSlice((s) => s.money);
  const alive = useHudSlice((s) => s.alive);
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const buyWindowLeft = useHudSlice((s) => s.buyWindowLeft);
  const moneyToasts = useHudSlice((s) => s.moneyToasts);
  const shopResult = useHudSlice((s) => s.shopResult);

  // The shop closing ITSELF (the window ran out while it was open) crosses the cart for 600 ms.
  const [autoClosedAt, setAutoClosedAt] = useState(Number.NEGATIVE_INFINITY);
  const wasOpen = useRef(shopOpen);
  useEffect(() => {
    if (closedItself(wasOpen.current, shopOpen, buyWindowLeft)) setAutoClosedAt(performance.now());
    wasOpen.current = shopOpen;
  }, [shopOpen, buyWindowLeft]);

  // The one toast: folded from the store's changes on every render; idempotent, so a re-render
  // (or StrictMode's second one) never counts a change twice.
  const merged = useRef<MergedToast | null>(null);
  merged.current = mergeToasts(merged.current, moneyToasts, now);
  const toast = merged.current;

  const row = buyRow({ noShop, alive, shopOpen, buyWindowLeft, shopResult, autoClosedAt, now });
  if (!slot || !connected || ended || (noShop && !row)) return null;
  return createPortal(
    <div className="wallet" data-zone="wallet" data-testid="wallet">
      {!noShop && (
        <div className="wallet-cash">
          <span className="wallet-money" data-testid="money">{money(cash)}</span>
          {toast && " "}
          {toast && <span key={toast.key} className={`wallet-toast${toastLeaving(toast, now) ? " leaving" : ""}`} aria-live="polite">{toastText(toast)}</span>}
        </div>
      )}
      {row && <BuyRowView row={row} />}
    </div>,
    slot,
  );
});

/** The cart, crossed out when the shop is shut. */
function Cart({ crossed }: { crossed: boolean }) {
  return (
    <span className={`wallet-cart${crossed ? " crossed" : ""}`} aria-hidden="true">
      <IconCart size={20} />
      {crossed && <svg className="wallet-cart-x" viewBox="0 0 24 24" width={20} height={20}><path d="M3 21 21 3" /></svg>}
    </span>
  );
}

function BuyRowView({ row }: { row: BuyRow }) {
  if (row.kind === "buy") {
    return (
      <div className={`wallet-buy${row.warn ? " warn" : ""}`} data-testid="buy-prompt" aria-label="Sklep: B">
        <Cart crossed={false} />
        <kbd className="wallet-key">B</kbd>
        {row.secs !== null && " "}
        {row.secs !== null && <span className="wallet-secs" data-testid="buy-countdown">{`${row.secs}s`}</span>}
      </div>
    );
  }
  if (row.kind === "closed") {
    return (
      <div className="wallet-buy shut" data-testid="shop-closed" role="status">
        <Cart crossed />
        <span className="wallet-shut">{polishWrap(row.text)}</span>
      </div>
    );
  }
  return <div className="wallet-buy shut" aria-label="Sklep zamknięty"><Cart crossed /></div>;
}
