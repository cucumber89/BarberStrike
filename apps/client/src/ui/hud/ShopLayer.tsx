import { memo, useLayoutEffect } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHud, useHudSlice } from "../../game/store";
import { Shop, type ShopApi } from "../Shop";
import { uiFlags } from "./uiFlags";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P7): the buy menu's mount (B), exactly as `Hud.tsx` had it — mounted only
 * while the shop is open and the match has not ended, with the whole state, the shop's actions and
 * the HUD clock (docs/UI_U_SPEC.md §7 P0 0d; the conditional mount stays, veto). It publishes
 * `uiFlags.overlay.shop` while the card shows.
 *
 * Zone `shop`: `Shop`'s root lives in `Shop.tsx` (P7's), so P0 marks it with a `display: contents`
 * wrapper — no box of its own, no change to the layout or the paint — and P7 moves the attribute
 * onto the card.
 */
export const ShopLayer = memo(function ShopLayer({ api, now }: ZoneProps & { api: ShopApi; now: number }) {
  const open = useHudSlice((s) => s.shopOpen && s.phase !== MatchPhase.Ended);
  useLayoutEffect(() => { uiFlags.set({ overlay: { shop: open } }); }, [open]);
  useLayoutEffect(() => () => uiFlags.set({ overlay: { shop: false } }), []);
  return open ? <ShopMount api={api} now={now} /> : null;
});

const CONTENTS = { display: "contents" } as const;

function ShopMount({ api, now }: { api: ShopApi; now: number }) {
  const h = useHud();
  return <div data-zone="shop" style={CONTENTS}><Shop h={h} api={api} now={now} /></div>;
}
