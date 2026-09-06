import { MATCH, MatchPhase, type Team } from "@frankibarber/shared";

/** Continuous combat: only the match deadline or score limit ends play. */
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
      return MatchPhase.Playing;
    case MatchPhase.Prep:
      if (connectedPlayers === 0) return MatchPhase.Waiting;
      if (now >= matchEndsAt) return MatchPhase.Ended;
      return MatchPhase.Playing;
    case MatchPhase.Ended:
      return now >= phaseEndsAt ? MatchPhase.Waiting : MatchPhase.Ended;
  }
}

/** Assign the smaller team; ties go to team 0. */
export function teamForNewPlayer(existing: Team[]): Team {
  let a = 0, b = 0;
  for (const t of existing) { if (t === 0) a++; else b++; }
  return a <= b ? 0 : 1;
}
