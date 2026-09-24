import { memo, useMemo } from "react";
import { boysClass, MODES, MatchPhase } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P3): the wallet (drop 2) — money, the buy prompt, the money toasts and the
 * shop-closed hint, all zone `wallet` — moved out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0
 * 0d, §4.2).
 */

/** Today's money format: `$1,000`, and `$-300` for a negative delta (`format.ts` `money` differs). */
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const REASON_SHORT: Record<string, string> = { kill: "ZABÓJSTWO", headshot: "W GŁOWĘ", assist: "ASYSTA", buy: "", sell: "SPRZEDAŻ", reset: "", round: "WYGRANA RUNDA", loss: "BONUS ZA PRZEGRANĄ" };

export const Wallet = memo(function Wallet({ now }: ZoneProps & { now: number }) {
  const connected = useHudSlice((s) => s.connected);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const mode = useHudSlice((s) => s.mode);
  const boys = useHudSlice((s) => s.boysClass);
  const nextClass = useHudSlice((s) => s.nextClass);
  const cash = useHudSlice((s) => s.money);
  const alive = useHudSlice((s) => s.alive);
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const buyWindowLeft = useHudSlice((s) => s.buyWindowLeft);
  const nearStation = useHudSlice((s) => s.nearStation);
  const moneyToasts = useHudSlice((s) => s.moneyToasts);
  const shopResult = useHudSlice((s) => s.shopResult);
  const noShop = MODES[mode].shop === "none";
  const windowSecs = buyWindowLeft === Infinity ? null : Math.ceil(buyWindowLeft / 1000);
  const shopHint = shopResult && !shopOpen && shopResult.reason === "closed" && now - shopResult.at < 1800;
  const toasts = useMemo(() => moneyToasts.filter((t) => t.reason !== "reset" && t.reason !== "buy"), [moneyToasts]);
  return (
    <>
      {/* Wallet + buy prompt (drop 2) */}
      {connected && !noShop && !ended && (
        <div className="wallet" data-zone="wallet" data-testid="wallet">
          {mode === "boys" && <div className="wallet-role">{boysClass(boys).name} · B: rola / sklep{nextClass !== boys ? ` · następna: ${boysClass(nextClass).name}` : ""}</div>}
          <div className={`wallet-money ${cash >= 8000 ? "rich" : ""}`} data-testid="money">{money(cash)}</div>
          {alive && !shopOpen && buyWindowLeft > 0 && (
            <div className={`wallet-prompt ${nearStation ? "station" : ""} ${windowSecs !== null && windowSecs <= 5 ? "urgent" : ""}`} data-testid="buy-prompt">
              <kbd>B</kbd><span>SKLEP</span><strong data-testid="buy-countdown">{windowSecs !== null ? `${windowSecs}s` : "OTWARTY"}</strong>
            </div>
          )}
        </div>
      )}
      <div className="money-toasts" data-zone="wallet" aria-live="polite">
        {!ended && toasts.map((t) => (
          <div key={t.key} className={`money-toast ${t.delta < 0 ? "neg" : ""}`}>{t.delta > 0 ? "+" : ""}{money(t.delta)}<span className="why">{REASON_SHORT[t.reason] ?? t.reason.toUpperCase()}</span></div>
        ))}
      </div>
      {shopHint && !ended && <div className="shop-closed-hint" data-zone="wallet" data-testid="shop-closed">{noShop ? `W TRYBIE ${MODES[mode].name} NIE MA SKLEPU · BROŃ DAJĄ ZABÓJSTWA` : "SKLEP ZAMKNIĘTY · PODEJDŹ DO LADY $"}</div>}
    </>
  );
});
