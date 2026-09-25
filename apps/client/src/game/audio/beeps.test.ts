import { describe, expect, it } from "vitest";
import { BOMB, DUEL, MATCH, MatchPhase, OSTRZYZENI } from "@frankibarber/shared";
import { beepTimes, bombBeepInterval } from "./beeps";

const NOW = 1_000_000;

describe("the match's beeps (§6.1, §6.4)", () => {
  it("freeze beeps at endsAt−3000/−2000/−1000", () => {
    // A 15 s freeze after a break (Prep → Prep) and after the countdown: the "go" beep is the last
    // second before the release — not 11 s early, as `MATCH.prepMs − i·1000` put it.
    for (const prev of [MatchPhase.Prep, MatchPhase.Countdown]) {
      const endsAt = NOW + DUEL.prepMs;
      expect(beepTimes(MatchPhase.Prep, prev, endsAt, NOW)).toEqual([
        { at: endsAt - 3000, final: false }, { at: endsAt - 2000, final: false }, { at: endsAt - 1000, final: true },
      ]);
    }
    // Ostrzyżeni's 10 s freeze counts down to ITS deadline too.
    expect(beepTimes(MatchPhase.Prep, MatchPhase.Prep, NOW + OSTRZYZENI.prepMs, NOW).map((b) => b.at - NOW)).toEqual([7000, 8000, 9000]);
    // Joined 1.5 s from the release: only the beep still ahead.
    expect(beepTimes(MatchPhase.Prep, MatchPhase.Prep, NOW + 1500, NOW)).toEqual([{ at: NOW + 500, final: true }]);
  });

  it("countdown beeps from phaseEndsAt", () => {
    const endsAt = NOW + MATCH.countdownMs;
    expect(beepTimes(MatchPhase.Countdown, MatchPhase.Waiting, endsAt, NOW).map((b) => b.at)).toEqual([endsAt - 3000, endsAt - 2000, endsAt - 1000]);
    // The event arrived 300 ms late: the schedule is the deadline's, not the event's.
    expect(beepTimes(MatchPhase.Countdown, MatchPhase.Waiting, endsAt, NOW + 300).map((b) => b.at)).toEqual([endsAt - 3000, endsAt - 2000, endsAt - 1000]);
    expect(beepTimes(MatchPhase.Countdown, MatchPhase.Waiting, 0, NOW)).toEqual([]); // no deadline, no guess
  });

  it("no beeps in a break", () => {
    // The Prep after Playing is the round break (and turniej's pair card): it is not a release.
    expect(beepTimes(MatchPhase.Prep, MatchPhase.Playing, NOW + BOMB.breakMs, NOW)).toEqual([]);
    expect(beepTimes(MatchPhase.Prep, MatchPhase.Playing, NOW + BOMB.halftimeMs, NOW)).toEqual([]);
    for (const p of [MatchPhase.Playing, MatchPhase.Ended, MatchPhase.Waiting]) expect(beepTimes(p, MatchPhase.Prep, NOW + 5000, NOW)).toEqual([]);
  });

  it("bomb beep 1000 ms at plant → 150 ms at 0", () => {
    expect(bombBeepInterval(BOMB.fuseMs)).toBe(1000);
    expect(bombBeepInterval(0)).toBe(150);
    expect(bombBeepInterval(BOMB.fuseMs / 2)).toBe(575); // a straight line
    expect(bombBeepInterval(BOMB.fuseMs + 5000)).toBe(1000);
    expect(bombBeepInterval(-200)).toBe(150);
    // The whole fuse is about 90 beeps, ever faster: never slower than the one before.
    let left = BOMB.fuseMs, n = 0, last = Infinity;
    while (left > 0) { const dt = bombBeepInterval(left); expect(dt).toBeLessThanOrEqual(last); last = dt; left -= dt; n++; }
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(120);
  });
});
