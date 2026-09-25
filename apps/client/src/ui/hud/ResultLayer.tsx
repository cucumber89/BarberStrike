import { memo, useRef } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHud, useHudSlice, type HudState } from "../../game/store";
import { MatchResult, ResultClosing } from "../MatchResult";
import { RESULT_EXIT_MS } from "../resultText";
import { useKeepMounted } from "./useKeepMounted";
import type { ZoneProps } from "./types";

/**
 * The match end's mount (zone `result`, on MatchResult's own root; docs/UI_U_SPEC.md P6). Mounted
 * from the first frame of Ended — the card is there at opacity 0 through stage A, as e2e reads it
 * (`multiplayer.spec.ts:660-667`) — and, on Ended → Waiting, kept 400 ms more through
 * `useKeepMounted` so it can fade out, with its listeners off (the conditional mount stays, veto).
 * While it fades it shows the match that ended, not the warm-up that replaced it.
 */
export const ResultLayer = memo(function ResultLayer({ now, onLeave }: ZoneProps & { now: number; onLeave: () => void }) {
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const mount = useKeepMounted(ended, RESULT_EXIT_MS);
  return mount === "closed" ? null : <ResultMount now={now} onLeave={onLeave} live={mount === "open"} />;
});

function ResultMount({ now, onLeave, live }: { now: number; onLeave: () => void; live: boolean }) {
  const h = useHud();
  // The last Ended state: what the card keeps showing while it fades out.
  const last = useRef<HudState>(h);
  if (live) last.current = h;
  return (
    <ResultClosing.Provider value={!live}>
      <MatchResult h={live ? h : last.current} now={now} onLeave={onLeave} />
    </ResultClosing.Provider>
  );
}
