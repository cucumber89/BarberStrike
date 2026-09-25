import { memo, useRef } from "react";
import { useHudSlice } from "../../game/store";
import { pairCard, type PairCard } from "../Bracket";
import { useKeepMounted } from "./useKeepMounted";
import type { ZoneProps } from "./types";

/**
 * Drop U, P2: the pair card (zone `bracket`, docs/UI_U_SPEC.md §5.2 rows 30 and 31, §6.1 "Between
 * pairs") — shown ONLY in the 9 s between two pairs of a tournament, in the banner's box (§3.7),
 * when the bus schedules no banner (§6.5), so the two never meet:
 *
 *                 ZDZICHU PRZECHODZI DALEJ          eyebrow, t1 (WALKOWER · ZDZICHU DALEJ)
 *              6 : 4 · Przeciwnik wyeliminowany     the verdict, t2 (none after a walkover)
 *                  NASTĘPNA PARA · FINAŁ            title, t3
 *                     Kowal vs ZDZICHU              the next pair, t2
 *                        GRASZ TERAZ                my standing, t1
 *
 * It comes in over 320 ms (scale .96 → 1 with a fade) and leaves in 240 when the next pair's
 * freeze begins. The whole bracket is on Tab (P6) and on the result's DRABINKA tab; the old card
 * that covered every freeze with it is gone, and the pair's stage is on the strip's second row.
 */

/** How long the card stays mounted after the break ends, for its exit (`--hud-out`). */
const EXIT_MS = 240;

export const BracketHud = memo(function BracketHud({ model }: ZoneProps) {
  const open = model.moment === "betweenPairs";
  const state = useKeepMounted(open, EXIT_MS);
  const key = useHudSlice((s) => {
    if (!open || !s.bracket) return "";
    const me = s.players.find((r) => r.id === s.myId)?.name ?? "";
    const c = pairCard(s.bracket, me, s.roundResult);
    return c ? JSON.stringify(c) : "";
  });
  // The card leaving keeps the words it had: the next freeze has already moved the board on.
  const last = useRef<PairCard | null>(null);
  if (key) last.current = JSON.parse(key) as PairCard;
  const card = open ? (key ? last.current : null) : last.current;
  if (state === "closed" || !card) return null;
  return (
    <div className={`bracket-card${state === "closing" ? " closing" : ""}${card.walkover ? " walkover" : ""}`} data-zone="bracket" data-testid="bracket-card">
      <p className="bc-eyebrow">{card.eyebrow}</p>
      {card.verdict && <p className="bc-verdict">{card.verdict}</p>}
      <h3 className="bc-title">{card.title}</h3>
      {card.next && <p className="bc-next">{card.next}</p>}
      {card.standing && <p className={`bc-standing ${card.standingKind}`}>{card.standing}</p>}
    </div>
  );
});
