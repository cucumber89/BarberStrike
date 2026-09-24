import { memo } from "react";
import { GUN_GAME, MODES, MatchPhase, TEAM_NAMES, WEAPONS, ladderDone, ladderWeapon, scoreLimitFor, type GameMode } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import { pairNames } from "../Bracket";
import { OSTRZYZENI_SIDES } from "../resultText";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P2): the top strip (zone `top`) — score and clock in team modes, me against
 * the leader in FFA (drop 4), my rung against the leader's in Gun Game (drop D). Moved out of
 * `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 */

/** The strip's clock as it prints today, `mm:ss` (the mode lines use it too). */
export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Drop T: in a tournament the two sides are two people, so the bar carries their nicknames. */
export const sideNamesOf = (mode: GameMode, bracket: string): readonly [string, string] =>
  mode === "ostrzyzeni" ? OSTRZYZENI_SIDES : (bracket ? pairNames(bracket) : null) ?? TEAM_NAMES;

// The match deadline stays fixed through every individual death and respawn.
const matchLeftOf = (h: HudState): number => h.bomb && h.phase === MatchPhase.Playing
  ? (h.bomb.stage === "planted" ? h.bomb.endsAt : h.bomb.roundEndsAt) - h.serverNow
  : h.matchEndsAt ? h.matchEndsAt - h.serverNow : 0;
const timeLeftOf = (h: HudState): number => (h.phaseEndsAt ? h.phaseEndsAt - h.serverNow : 0);
/** What the clock prints: selected as a string, so the strip re-renders when the digits change. */
const clockOf = (h: HudState): string =>
  h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep ? fmtTime(matchLeftOf(h))
    : h.phase === MatchPhase.Countdown ? `START ${Math.max(0, Math.ceil(timeLeftOf(h) / 1000))}`
    : h.phase === MatchPhase.Waiting ? "ROZGRZEWKA" : "KONIEC";
const urgentOf = (h: HudState): boolean => { const left = matchLeftOf(h); return left > 0 && left <= 30000; };

export const TopStrip = memo(function TopStrip(_props: ZoneProps) {
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const mode = useHudSlice((s) => s.mode);
  const myTeam = useHudSlice((s) => s.myTeam);
  const myId = useHudSlice((s) => s.myId);
  const players = useHudSlice((s) => s.players);
  const scoreA = useHudSlice((s) => s.scoreA);
  const scoreB = useHudSlice((s) => s.scoreB);
  const bracket = useHudSlice((s) => s.bracket);
  const clock = useHudSlice(clockOf);
  const urgent = useHudSlice(urgentOf);
  if (ended) return null;
  // Drop 4: mode-aware scoring. FFA shows my kills against the leader; Domination adds the flag row.
  const teams = MODES[mode].teams;
  const meRow = players.find((r) => r.id === myId);
  const leader = players.find((r) => r.id !== myId) ?? null;
  const myKills = meRow?.kills ?? 0;
  const leading = !leader || myKills >= leader.kills;
  // Drop D: Gun Game replicates the ladder rung as `score` (0..11; 11 = finished). The top bar shows
  // the rung, the gun it hands you and the next one, against the leader's rung instead of kills.
  const gunGame = mode === "gungame";
  const myRung = meRow?.score ?? 0;
  const leaderRung = leader?.score ?? 0;
  const rungLabel = (rung: number) => `${Math.min(GUN_GAME.ladder.length, rung + 1)}/${GUN_GAME.ladder.length}`;
  const rungGun = WEAPONS[ladderWeapon(myRung)].name;
  const nextGun = myRung + 1 < GUN_GAME.ladder.length ? WEAPONS[ladderWeapon(myRung + 1)].name : null;
  const ladderLeading = !leader || myRung >= leaderRung;
  const sideNames = sideNamesOf(mode, bracket);
  return (
    // Top: score + timer (team modes) or me vs the leader (FFA, drop 4)
    <div className="top-bar" data-zone="top" data-mode={mode}>
      {teams
        ? <div className={`team-score t0 ${myTeam === 0 ? "mine" : ""}`}><span className="tname">{sideNames[0]}</span><span className="tscore" data-testid="score-a">{scoreA}</span></div>
        : gunGame
          ? <div className="ffa-score mine ladder"><span className="tname">BROŃ</span><span className="tscore" data-testid="ladder">{rungLabel(myRung)}</span>
              <span className="ladder-gun" data-testid="ladder-gun">{ladderDone(myRung) ? <b>DRABINKA ZALICZONA</b> : <><b>{rungGun}</b>{nextGun && <small>NASTĘPNA: {nextGun}</small>}</>}</span></div>
          : <div className="ffa-score mine"><span className="tname">TY</span><span className="tscore" data-testid="score-a">{myKills}</span></div>}
      <div className={`timer ${urgent ? "urgent" : ""}`} data-testid="timer">
        {clock}
        {/* TDM's target follows the size of the room (`scoreLimitFor`), so it is printed rather
            than left to a mode blurb that would be wrong in half the rooms. */}
        {mode === "tdm" && <small className="timer-goal" data-testid="score-goal">DO {scoreLimitFor("tdm", players.length)}</small>}
      </div>
      {teams
        ? <div className={`team-score t1 ${myTeam === 1 ? "mine" : ""}`}><span className="tscore" data-testid="score-b">{scoreB}</span><span className="tname">{sideNames[1]}</span></div>
        : gunGame
          ? <div className={`ffa-score ${ladderLeading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader ? rungLabel(leaderRung) : "–"}</span><span className="tname">{leader?.name ?? "NIKT"}</span></div>
          : <div className={`ffa-score ${leading ? "" : "lead"}`}><span className="tscore" data-testid="score-b">{leader?.kills ?? 0}</span><span className="tname">{leader?.name ?? "NIKT"}</span></div>}
    </div>
  );
});
