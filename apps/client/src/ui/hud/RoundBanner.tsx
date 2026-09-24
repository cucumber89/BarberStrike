import { memo, useEffect, useRef, useState } from "react";
import { MatchPhase, type GameMode } from "@frankibarber/shared";
import { useHud, useHudSlice, type HudState } from "../../game/store";
import { roundEnd } from "./roundText";
import type { PhaseModel } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P5): the round-end banner (zone `banner`), moved here from
 * `MatchResult.tsx` (`RoundBreak`) verbatim, with the gate that mounted it in `Hud.tsx`
 * (docs/UI_U_SPEC.md §7 P0 0d).
 *
 * `RoundBanner({h, model?, standalone?})` is the frozen standalone signature `uiFit.tsx` mounts
 * (§7.0); in P0 it draws the card from `h` alone. `RoundBannerLayer` is the HUD's mount: it watches
 * the phase from the HUD's mount on and shows the card in the break.
 */

/**
 * Between rounds (Bomb, 1 v 1, Ostrzyżeni): who took the round, why, the score, the clock to the
 * next one. Shown only during the break that follows a round — `breakEndsAt` is the deadline of
 * the first Prep window after Playing, so the buy window that follows (a second Prep with a new
 * deadline) never shows a stale reason.
 */
export function RoundBanner({ h }: { h: HudState; model?: PhaseModel; standalone?: boolean }) {
  // `roundResult` and not `bomb.result`: the bomb block is only mirrored in Bomb, so the 1 v 1 —
  // which runs on the same round machine — was passing "" here and the card NEVER appeared. Its
  // players were told who won a round nowhere at all.
  const end = roundEnd(h.mode as GameMode, h.roundResult, h.roundWinner, h.bomb ? (h.bomb.attackTeam as 0 | 1) : -1, h.myTeam);
  if (!end) return null;
  const [a, b] = h.mode === "ostrzyzeni" ? ["OCALENI", "OSTRZYŻENI"] : ["FADE", "TAPER"];
  const left = Math.max(0, Math.ceil((h.phaseEndsAt - h.serverNow) / 1000));
  // The 1 v 1 carries a loadout between rounds (CS's rule), and whether YOURS carried is decided
  // by whether you are standing here. That is worth one line: it is the difference between the
  // next round being a rifle round and a pistol round.
  const carry = h.mode === "duel" ? (h.alive ? "Przeżyłeś — broń i płyta zostają z tobą" : "Zginąłeś — broń przepada, wracasz z pistoletem") : "";
  return (
    <div className={`round-end ${end.mine === null ? "even" : end.mine ? "mine" : "theirs"}`} data-zone="banner" data-testid="round-end" role="status">
      <div className="round-end-title">{end.title}</div>
      <div className="round-end-why">{end.why}</div>
      {carry && <div className="round-end-carry" data-testid="round-end-carry">{carry}</div>}
      <div className="round-end-score">{a} <b>{h.scoreA}</b> : <b>{h.scoreB}</b> {b}</div>
      <div className="round-end-next">następna runda za {left} s</div>
    </div>
  );
}

/**
 * Between rounds: who took it and why, from the round's real signals. The break after a round is
 * the FIRST Prep window after Playing; the buy window that follows is a second Prep with a new
 * deadline. Remembering the break's deadline is what tells them apart.
 */
export const RoundBannerLayer = memo(function RoundBannerLayer({ model }: ZoneProps) {
  const phase = useHudSlice((s) => s.phase);
  const phaseEndsAt = useHudSlice((s) => s.phaseEndsAt);
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const prevPhase = useRef(phase);
  const [breakEndsAt, setBreakEndsAt] = useState(0);
  useEffect(() => {
    if (prevPhase.current === MatchPhase.Playing && phase === MatchPhase.Prep) setBreakEndsAt(phaseEndsAt);
    prevPhase.current = phase;
  }, [phase, phaseEndsAt]);
  const inBreak = phase === MatchPhase.Prep && breakEndsAt !== 0 && breakEndsAt === phaseEndsAt;
  return inBreak && !shopOpen ? <RoundBannerMount model={model} /> : null;
});

/** The card needs the whole state (`roundEnd` reads six fields and the clock); only while it shows. */
function RoundBannerMount({ model }: ZoneProps) {
  const h = useHud();
  return <RoundBanner h={h} model={model} />;
}
