import { describe, expect, it } from "vitest";
import { Btn, MatchPhase } from "./types";
import { MOVEMENT_BUTTONS, frozenAt, isFrozen, isLive, maskInput, respawnInMs } from "./rounds";

describe("respawn waves", () => {
  it("calls warm-up and a live wave playable, and the freeze and the result screen not", () => {
    // Warm-up combat is deliberate and pinned elsewhere; the point here is that adding a phase did
    // not quietly turn the lobby into a waiting room.
    expect(isLive(MatchPhase.Waiting)).toBe(true);
    expect(isLive(MatchPhase.Countdown)).toBe(true);
    expect(isLive(MatchPhase.Playing)).toBe(true);
    expect(isLive(MatchPhase.Prep)).toBe(false);
    expect(isLive(MatchPhase.Ended)).toBe(false);
    expect(isFrozen(MatchPhase.Prep)).toBe(true);
    expect(isFrozen(MatchPhase.Ended)).toBe(false);
  });

  it("strips every button that moves a body, and keeps every button that does not", () => {
    const all = Btn.Forward | Btn.Back | Btn.Left | Btn.Right | Btn.Jump | Btn.Sprint | Btn.Tac
      | Btn.Crouch | Btn.LeanL | Btn.LeanR | Btn.Fire | Btn.Aim;
    const frozen = maskInput(all, true);
    for (const [name, bit] of [["Forward", Btn.Forward], ["Back", Btn.Back], ["Left", Btn.Left],
      ["Right", Btn.Right], ["Jump", Btn.Jump], ["Sprint", Btn.Sprint], ["Tac", Btn.Tac]] as const) {
      expect(frozen & bit, `${name} should be stripped while frozen`).toBe(0);
    }
    // Pose and intent survive: preparing is what the window is for, and nobody can shoot anyway.
    for (const [name, bit] of [["Crouch", Btn.Crouch], ["LeanL", Btn.LeanL], ["LeanR", Btn.LeanR],
      ["Fire", Btn.Fire], ["Aim", Btn.Aim]] as const) {
      expect(frozen & bit, `${name} should survive the freeze`).toBe(bit);
    }
    expect(MOVEMENT_BUTTONS & Btn.Crouch).toBe(0);
  });

  it("leaves input untouched when not frozen", () => {
    expect(maskInput(0xfff, false)).toBe(0xfff);
  });

  it("freezes and releases a client on the clock, in both directions, without a message", () => {
    // The wave ends at 5000: the client stops exactly there, message or no message.
    expect(frozenAt(MatchPhase.Playing, 5000, 4999)).toBe(false);
    expect(frozenAt(MatchPhase.Playing, 5000, 5000)).toBe(false);
    expect(frozenAt(MatchPhase.Playing, 5000, 9000)).toBe(false);
    // The preparation window ends at 5000: released exactly there, for the same reason. Waiting for
    // the message here would DISCARD movement (the client masks its own input before sending), and
    // discard it in proportion to ping — the higher your latency the later your wave starts.
    expect(frozenAt(MatchPhase.Prep, 5000, 4999)).toBe(true);
    expect(frozenAt(MatchPhase.Prep, 5000, 5000)).toBe(false);
    // A stale phase gives the right answer either way, which is the point of reading the clock.
    // A room with no match running has no window clock to trip over.
    expect(frozenAt(MatchPhase.Waiting, 0, 9e9)).toBe(false);
    expect(frozenAt(MatchPhase.Countdown, 0, 9e9)).toBe(false);
    expect(frozenAt(MatchPhase.Ended, 0, 9e9)).toBe(false);
    expect(frozenAt(MatchPhase.Prep, 0, 9e9)).toBe(true); // no clock yet: trust the phase
  });

  it("counts a dead player back in on the phase clock, and only inside a match", () => {
    expect(respawnInMs(MatchPhase.Playing, 5000, 1000)).toBe(4000);
    expect(respawnInMs(MatchPhase.Prep, 5000, 1000)).toBe(4000);
    expect(respawnInMs(MatchPhase.Playing, 5000, 6000)).toBe(0); // never negative
    // Warm-up respawns individually, so there is no wave to count down to and the HUD falls back
    // to its own estimate. Returning a number here would have made it show the wrong one.
    expect(respawnInMs(MatchPhase.Waiting, 5000, 1000)).toBe(0);
    expect(respawnInMs(MatchPhase.Countdown, 5000, 1000)).toBe(0);
    expect(respawnInMs(MatchPhase.Ended, 5000, 1000)).toBe(0);
  });
});
