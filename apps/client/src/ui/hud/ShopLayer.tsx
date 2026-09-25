import { memo, useLayoutEffect } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHud, useHudSlice } from "../../game/store";
import { Shop, type ShopApi } from "../Shop";
import { uiFlags } from "./uiFlags";
import { useKeepMounted } from "./useKeepMounted";
import type { ZoneProps } from "./types";

/**
 * The buy menu's mount (B): mounted only while the shop is open and the match has not ended, with
 * the whole state, the shop's actions and the HUD clock. The mount stays CONDITIONAL (veto): on
 * close the card stays 160 ms for its exit (§6.1) with its keys off (`live={false}`), then leaves
 * the tree (`useKeepMounted`). `uiFlags.overlay.shop` is published while it is open — not while it
 * is leaving — so the zones it hid come back as it fades (§4.5).
 *
 * Zone `shop` is on the shop's own root (`Shop.tsx`), which has a box: the `display: contents`
 * wrapper P0 used to mark it is gone.
 */
const EXIT_MS = 160;

export const ShopLayer = memo(function ShopLayer({ api, now }: ZoneProps & { api: ShopApi; now: number }) {
  const open = useHudSlice((s) => s.shopOpen && s.phase !== MatchPhase.Ended);
  const mount = useKeepMounted(open, EXIT_MS);
  useLayoutEffect(() => { uiFlags.set({ overlay: { shop: open } }); }, [open]);
  useLayoutEffect(() => () => uiFlags.set({ overlay: { shop: false } }), []);
  return mount === "closed" ? null : <ShopMount api={api} now={now} closing={mount === "closing"} />;
});

function ShopMount({ api, now, closing }: { api: ShopApi; now: number; closing: boolean }) {
  const h = useHud();
  return <div className={closing ? "shop-exit" : "shop-enter"}><Shop h={h} api={api} now={now} live={!closing} /></div>;
}
