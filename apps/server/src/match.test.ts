import { describe, expect, it } from "vitest";
import { MATCH, MatchPhase } from "@frankibarber/shared";
import { nextPhase, teamForNewPlayer } from "./match";

/** Far enough away that the match clock never decides anything, for the cases that are not about it. */
const OPEN = 1e9;

describe("match phases", () => {
  it("waits until enough players then counts down", () => {
    expect(nextPhase(MatchPhase.Waiting, 0, 0, 1, 0)).toBe(MatchPhase.Waiting);
    expect(nextPhase(MatchPhase.Waiting, 0, 0, MATCH.minPlayers, 0)).toBe(MatchPhase.Countdown);
  });
  it("countdown aborts if players leave, starts when timer elapses", () => {
    expect(nextPhase(MatchPhase.Countdown, 100, 500, 1, OPEN)).toBe(MatchPhase.Waiting);
    expect(nextPhase(MatchPhase.Countdown, 100, 500, 2, OPEN)).toBe(MatchPhase.Countdown);
    expect(nextPhase(MatchPhase.Countdown, 500, 500, 2, OPEN)).toBe(MatchPhase.Playing);
  });
  it("keeps the match live after an old wave deadline", () => {
    // The wave clock is `phaseEndsAt`; the match clock is separate and still far away.
    expect(nextPhase(MatchPhase.Playing, 10, 20, 2, OPEN)).toBe(MatchPhase.Playing);
    expect(nextPhase(MatchPhase.Playing, 20, 20, 2, OPEN)).toBe(MatchPhase.Playing);
    expect(nextPhase(MatchPhase.Playing, 60000, 20, 2, OPEN)).toBe(MatchPhase.Playing);
    expect(nextPhase(MatchPhase.Prep, 10, 20, 2, OPEN)).toBe(MatchPhase.Playing);
    expect(nextPhase(MatchPhase.Prep, 20, 20, 2, OPEN)).toBe(MatchPhase.Playing);
  });
  it("the match clock outranks the wave clock, from either phase", () => {
    // Otherwise a match could not end during a preparation window, and a wave that started just
    // before the final whistle would run past it.
    expect(nextPhase(MatchPhase.Playing, 100, 200, 2, 100)).toBe(MatchPhase.Ended);
    expect(nextPhase(MatchPhase.Prep, 100, 200, 2, 100)).toBe(MatchPhase.Ended);
    expect(nextPhase(MatchPhase.Playing, 99, 200, 2, 100)).toBe(MatchPhase.Playing);
  });
  it("an empty room goes back to waiting from a wave or from preparation", () => {
    expect(nextPhase(MatchPhase.Playing, 5, 20, 0, OPEN)).toBe(MatchPhase.Waiting);
    expect(nextPhase(MatchPhase.Prep, 5, 20, 0, OPEN)).toBe(MatchPhase.Waiting);
    // Empty beats the match clock too: an empty room must not sit on a result screen.
    expect(nextPhase(MatchPhase.Prep, 200, 20, 0, 100)).toBe(MatchPhase.Waiting);
  });
  it("ended returns to waiting", () => {
    expect(nextPhase(MatchPhase.Ended, 5, 20, 2, 0)).toBe(MatchPhase.Ended);
    expect(nextPhase(MatchPhase.Ended, 20, 20, 2, 0)).toBe(MatchPhase.Waiting);
  });
});

describe("team assignment", () => {
  it("balances teams", () => {
    expect(teamForNewPlayer([])).toBe(0);
    expect(teamForNewPlayer([0])).toBe(1);
    expect(teamForNewPlayer([0, 1])).toBe(0);
    expect(teamForNewPlayer([0, 1, 0])).toBe(1);
  });
});
