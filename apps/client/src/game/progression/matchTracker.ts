import { MatchPhase, type MatchStats, type GameMode, type Team, type WeaponKills } from "@frankibarber/shared";

/**
 * Counts one match for the progression profile.
 *
 * SPLIT ON PURPOSE. Kills, deaths and assists are read from the player's own scoreboard row at the
 * whistle, because that is the server's tally and the only number that cannot drift. Head shots,
 * captures, clipper kills and waves survived have no replicated counter, so they are counted here
 * from the events the client already receives — and counted only for the local player.
 *
 * Everything is reset by `start`, which the match-start transition calls: a room is reused between
 * matches, so a tracker that only ever added up would pay a player twice for the same kill.
 */
export class MatchTracker {
  private myId = "";
  headshots = 0;
  captures = 0;
  clipperKills = 0;
  wavesSurvived = 0;
  /** 2.1: kills per weapon or grenade this match, for mastery and the daily challenges. */
  weaponKills: WeaponKills = {};
  /** Deaths seen live, used only as a fallback when the scoreboard row has gone (a disconnect). */
  private deathsSeen = 0;

  start(myId: string): void {
    this.myId = myId;
    this.headshots = 0;
    this.captures = 0;
    this.clipperKills = 0;
    this.wavesSurvived = 0;
    this.weaponKills = {};
    this.deathsSeen = 0;
  }

  onKill(e: { killer: string; victim: string; weapon: string; headshot: boolean }): void {
    if (e.victim === this.myId && e.killer !== this.myId) this.deathsSeen += 1;
    if (e.killer !== this.myId || e.victim === this.myId) return; // suicides pay nothing
    if (e.headshot) this.headshots += 1;
    if (e.weapon === "clippers") this.clipperKills += 1;
    this.weaponKills[e.weapon] = (this.weaponKills[e.weapon] ?? 0) + 1;
  }

  /** A Domination flag changed hands; `by` are the names that captured it. */
  onFlag(e: { by: string[] }, myName: string): void {
    if (myName && e.by.includes(myName)) this.captures += 1;
  }

  /**
   * A phase change. Reaching the preparation window ALIVE is a wave survived — which is the only
   * moment that can be judged, because everyone is alive again a tick later.
   */
  onPhase(phase: MatchPhase, alive: boolean): void {
    if (phase === MatchPhase.Prep && alive) this.wavesSurvived += 1;
  }

  /** The finished match, from the scoreboard row plus what was counted here. */
  finish(row: { kills: number; deaths: number; assists: number } | undefined, result: 1 | 0 | -1, mode: GameMode): MatchStats {
    return {
      kills: row?.kills ?? 0,
      headshots: this.headshots,
      assists: row?.assists ?? 0,
      deaths: row?.deaths ?? this.deathsSeen,
      captures: this.captures,
      wavesSurvived: this.wavesSurvived,
      result,
      mode,
    };
  }
}

/** Did the local player win, draw or lose? */
export function matchResult(teams: boolean, myTeam: Team, winner: number, winnerId: string, myId: string): 1 | 0 | -1 {
  if (teams) return winner === -1 ? 0 : winner === myTeam ? 1 : -1;
  // FFA: a dead heat leaves no winner id at all, which is a draw for everyone in it.
  if (!winnerId) return 0;
  return winnerId === myId ? 1 : -1;
}
