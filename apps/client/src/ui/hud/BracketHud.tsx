import { memo } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { BracketPanel, bracketLine } from "../Bracket";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P2): drop T's bracket. Full size between pairs — the one moment anybody has
 * time to read it (zone `bracket`) — and one line under the strip while a pair is on (zone
 * `top-line`), so you always know which round of the draw you are in. On the result screen it is a
 * TAB of the result card rather than a card over it: floating, it covered the word PORAŻKA. Moved
 * out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 */
export const BracketHud = memo(function BracketHud(_props: ZoneProps) {
  const bracket = useHudSlice((s) => s.bracket);
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const phase = useHudSlice((s) => s.phase);
  if (!(bracket !== "" && !shopOpen && phase !== MatchPhase.Ended)) return null;
  return phase === MatchPhase.Prep
    ? <div className="bracket-card" data-zone="bracket" data-testid="bracket-card"><h3>DRABINKA</h3><BracketPanel bracket={bracket} /></div>
    : <div className="bracket-strip" data-zone="top-line" data-testid="bracket-strip">{bracketLine(bracket)}</div>;
});
