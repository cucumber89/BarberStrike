import { memo } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHud, useHudSlice } from "../../game/store";
import { MatchResult } from "../MatchResult";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P6): the match end's mount, exactly as `Hud.tsx` had it — `MatchResult`
 * mounted only in Ended, with the whole state, the HUD clock and `onLeave` (docs/UI_U_SPEC.md §7
 * P0 0d; the conditional mount stays, veto). Zone `result` is on MatchResult's own root.
 */
export const ResultLayer = memo(function ResultLayer({ now, onLeave }: ZoneProps & { now: number; onLeave: () => void }) {
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  return ended ? <ResultMount now={now} onLeave={onLeave} /> : null;
});

function ResultMount({ now, onLeave }: { now: number; onLeave: () => void }) {
  const h = useHud();
  return <MatchResult h={h} now={now} onLeave={onLeave} />;
}
