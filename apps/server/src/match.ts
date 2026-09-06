import { MATCH, MatchPhase, type Team } from "@frankibarber/shared";

/**
 * Pure match-phase transition logic (no room dependencies) so it can be unit-tested.
 * Returns the phase the room should be in given the clock and player count.
 *
 * TWO CLOCKS (drop 7). Before respawn waves there was one: `phaseEndsAt` meant "when the current
 * phase ends", and during PLAYING that was the end of the match. Waves need both — a wave ends
 * every MATCH.waveMs while the match runs for MATCH.durationMs — so `phaseEndsAt` keeps its
 * literal meaning (the end of THIS phase, now a wave or a prep window) and the match deadline
 * moved to its own field. Overloading one field would have made the match end whenever a wave did.
 *
 * The match deadline wins over the wave: from either Playing or Prep, `matchEndsAt` is checked
 * BEFORE the window clock, so neither a wave nor a preparation window can hold the result screen
 * open past the end of the match. A wave that starts shortly before the deadline is simply cut
 * short by it — it is not prevented from starting, and nothing here tries to.
 */
export function nextPhase(
  phase: MatchPhase,
  now: number,
  phaseEndsAt: number,
  connectedPlayers: number,
  matchEndsAt: number,
): MatchPhase {
  switch (phase) {
    case MatchPhase.Waiting:
      return connectedPlayers >= MATCH.minPlayers ? MatchPhase.Countdown : MatchPhase.Waiting;
    case MatchPhase.Countdown:
      if (connectedPlayers < MATCH.minPlayers) return MatchPhase.Waiting;
      return now >= phaseEndsAt ? MatchPhase.Playing : MatchPhase.Countdown;
    case MatchPhase.Playing:
      if (connectedPlayers === 0) return MatchPhase.Waiting;
      if (now >= matchEndsAt) return MatchPhase.Ended;
      return now >= phaseEndsAt ? MatchPhase.Prep : MatchPhase.Playing;
    case MatchPhase.Prep:
      if (connectedPlayers === 0) return MatchPhase.Waiting;
      if (now >= matchEndsAt) return MatchPhase.Ended;
      return now >= phaseEndsAt ? MatchPhase.Playing : MatchPhase.Prep;
    case MatchPhase.Ended:
      return now >= phaseEndsAt ? MatchPhase.Waiting : MatchPhase.Ended;
  }
}

/** Assigns the smaller team; ties go to team 0. */
export function teamForNewPlayer(existing: Team[]): Team {
  let a = 0, b = 0;
  for (const t of existing) { if (t === 0) a++; else b++; }
  return a <= b ? 0 : 1;
}
