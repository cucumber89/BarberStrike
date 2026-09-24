import React, { memo } from "react";
import { DUEL, MATCH, MODES, MatchPhase, OSTRZYZENI } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import { roundReasonText } from "../resultText";
import { fmtTime, sideNamesOf } from "./TopStrip";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P2): the mode line under the strip (zone `top-line`) — the bomb round's
 * line, Ostrzyżeni's and the 1 v 1's — and the mode's objective in the warm-up and the countdown.
 * Moved out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2). `ModeLine` and `Objective`
 * mount at the two places the lines had in the HUD's paint order.
 */

const inRound = (h: HudState): boolean => h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep;
const timeLeftOf = (h: HudState): number => (h.phaseEndsAt ? h.phaseEndsAt - h.serverNow : 0);

export const ModeLine = memo(function ModeLine(_props: ZoneProps) {
  const bomb = useHudSlice((s) => !!s.bomb && inRound(s));
  const infection = useHudSlice((s) => s.mode === "ostrzyzeni" && inRound(s));
  const duel = useHudSlice((s) => s.mode === "duel" && inRound(s));
  return <>{bomb && <BombLine />}{infection && <InfectionLine />}{duel && <DuelLine />}</>;
});

function BombLine() {
  const bomb = useHudSlice((s) => s.bomb);
  const phase = useHudSlice((s) => s.phase);
  const myTeam = useHudSlice((s) => s.myTeam);
  const myId = useHudSlice((s) => s.myId);
  const alive = useHudSlice((s) => s.alive);
  const buyWindowLeft = useHudSlice((s) => s.buyWindowLeft);
  const timeLeft = useHudSlice(timeLeftOf);
  if (!bomb) return null;
  return (
    <div className={`bomb-hud ${bomb.stage === "planted" ? "armed" : ""}`} data-zone="top-line" data-testid="bomb-hud">
      <b>RUNDA {bomb.round} / 12 · {bomb.attackTeam === myTeam ? "ATAK" : "OBRONA"} · DO 7</b>
      {/* The objective ALWAYS, and while CS's buy tail runs it carries that too — the shop being
          open a few seconds into the round is no use to anybody who does not know it is, and the
          first five seconds of a round is exactly when a player needs to be told their job. */}
      <span>{bomb.stage === "buy" ? `${bomb.round === 7 ? "ZMIANA STRON · " : ""}B: SKLEP · START ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
        : phase === MatchPhase.Prep ? `${roundReasonText(bomb.result)} · NASTĘPNA RUNDA ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`
        : (bomb.stage === "planted" ? `ŁADUNEK NA ${bomb.site} · ${bomb.attackTeam === myTeam ? "PILNUJ ŁADUNKU" : "PRZYTRZYMAJ T, ŻEBY ROZBROIĆ"}`
          : bomb.carrier === myId ? "MASZ ŁADUNEK · PRZYTRZYMAJ T NA A / B, ŻEBY PODŁOŻYĆ"
          : bomb.attackTeam !== myTeam ? "BROŃ PUNKTÓW A / B"
          : bomb.stage === "dropped" ? "ŁADUNEK UPUSZCZONY · PODEJDŹ, ŻEBY PODNIEŚĆ" : "OSŁANIAJ NIOSĄCEGO ŁADUNEK")
          + (alive && buyWindowLeft > 0 ? ` · SKLEP (B) JESZCZE ${Math.max(0, Math.ceil(buyWindowLeft / 1000))}s` : "")}</span>
      {bomb.actor && <><div className="bomb-progress"><i style={{ "--v": bomb.progress } as React.CSSProperties} /></div><small>{bomb.actor === myId ? "TRZYMAJ T · NIE RUSZAJ SIĘ" : bomb.stage === "planted" ? "ROZBRAJANIE" : "PODKŁADANIE"}</small></>}
    </div>
  );
}

/** Ostrzyżeni (drop D): the round, how many heads are left, and which side the clock favours. */
function InfectionLine() {
  const phase = useHudSlice((s) => s.phase);
  const round = useHudSlice((s) => s.round);
  const players = useHudSlice((s) => s.players);
  const myId = useHudSlice((s) => s.myId);
  const timeLeft = useHudSlice(timeLeftOf);
  // The sides are the teams, so the only new reads are who is still unshaved (counted from the
  // scoreboard rows the HUD already has) and which side I am on.
  const meShaved = !!players.find((r) => r.id === myId)?.shaved;
  const unshavedLeft = players.filter((r) => r.connected && r.alive && !r.shaved).length;
  return (
    <div className={`bomb-hud infection ${meShaved ? "shaved" : ""}`} data-zone="top-line" data-testid="infection-line">
      <b>RUNDA {Math.min(OSTRZYZENI.rounds, round + 1)} / {OSTRZYZENI.rounds} · {unshavedLeft} NIEOSTRZYŻONYCH · {fmtTime(timeLeft)}</b>
      <span>{phase === MatchPhase.Prep
        ? (meShaved ? "OSTRZYSZ ICH ZA CHWILĘ — maszynka w dłoni" : `PRZYGOTOWANIE · B: SKLEP · RUNDA ZA ${Math.max(0, Math.ceil(timeLeft / 1000))}s`)
        : meShaved ? "JESTEŚ OSTRZYŻONY — goń ich z maszynką"
        : "PRZEŻYJ — nie daj się ostrzyc"}</span>
    </div>
  );
}

/**
 * GÓRA's 1 v 1: the round number, the score, the clock; one life a round. Two different Preps run
 * through here — the fifteen-second FREEZE you buy in, and the three-second BREAK after a round —
 * and they used to print the same words ("B: SKLEP · RUNDA ZA 3s") while the shop was shut in one
 * of them. What tells them apart is the buy window itself, which the HUD already knows:
 * `buyWindowLeft`.
 */
function DuelLine() {
  const mode = useHudSlice((s) => s.mode);
  const phase = useHudSlice((s) => s.phase);
  const round = useHudSlice((s) => s.round);
  const myTeam = useHudSlice((s) => s.myTeam);
  const alive = useHudSlice((s) => s.alive);
  const buyWindowLeft = useHudSlice((s) => s.buyWindowLeft);
  const scoreA = useHudSlice((s) => s.scoreA);
  const scoreB = useHudSlice((s) => s.scoreB);
  const roundResult = useHudSlice((s) => s.roundResult);
  const bracket = useHudSlice((s) => s.bracket);
  const timeLeft = useHudSlice(timeLeftOf);
  const sideNames = sideNamesOf(mode, bracket);
  const secs = Math.max(0, Math.ceil(timeLeft / 1000));
  const buying = buyWindowLeft > 0 && alive;
  const buySecs = buyWindowLeft === Infinity ? null : Math.max(0, Math.ceil(buyWindowLeft / 1000));
  const mine = myTeam === 0 ? scoreA : scoreB, theirs = myTeam === 0 ? scoreB : scoreA;
  const matchPoint = Math.max(mine, theirs) === DUEL.wins - 1;
  const swapping = round > 0 && round % DUEL.halfRounds === 0;
  return (
    <div className="bomb-hud duel" data-zone="top-line" data-testid="duel-line">
      <b>RUNDA {round + 1} · {sideNames[myTeam]} {mine} : {theirs} · DO {DUEL.wins}{matchPoint ? (mine > theirs ? " · MECZBOL" : " · BRONISZ MECZBOLU") : ""} · {fmtTime(timeLeft)}</b>
      <span>{phase === MatchPhase.Prep
        ? buying
          ? `${swapping ? "ZMIANA STRON · " : ""}ZAMROŻENIE · B: SKLEP · START ZA ${secs}s`
          : `${roundResult ? `${roundReasonText(roundResult)} · ` : ""}NASTĘPNA RUNDA ZA ${secs}s`
        : buying
          // CS's buy time runs past the freeze; say so, or nobody uses it.
          ? `SKLEP OTWARTY JESZCZE ${buySecs}s · B, ŻEBY DOKUPIĆ`
          : "JEDNO ŻYCIE · po czasie wygrywa więcej zdrowia"}</span>
    </div>
  );
}

/**
 * The mode's goal in one sentence, while there is nothing else to read: the warm-up and the
 * countdown. Once the match runs, the mode's own line (bomb, rounds, flags) takes over.
 */
export const Objective = memo(function Objective(_props: ZoneProps) {
  const phase = useHudSlice((s) => s.phase);
  const connected = useHudSlice((s) => s.connected);
  const mode = useHudSlice((s) => s.mode);
  if (!((phase === MatchPhase.Waiting || phase === MatchPhase.Countdown) && connected)) return null;
  return (
    <div className="center-sub objective" data-zone="top-line" data-testid="objective">
      {phase === MatchPhase.Waiting && <b>ROZGRZEWKA · czekamy na graczy (potrzeba {MATCH.minPlayers})</b>}
      <span>{MODES[mode].objective}</span>
    </div>
  );
});
