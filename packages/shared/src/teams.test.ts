import { describe, expect, it } from "vitest";
import { canSwitchTeam, teamForNewPlayer, teamSizes, TEAM_SWITCH_COOLDOWN_MS, type TeamMember } from "./teams";

const m = (team: 0 | 1, connected = true, bot = false): TeamMember => ({ team, connected, bot });
const ctx = (over: Partial<Parameters<typeof canSwitchTeam>[3]> = {}) => ({
  teamsMode: true, roundBased: false, frozen: true, matchEnded: false, now: 1_000_000, lastSwitchAt: 0, ...over,
});

describe("counting a side", () => {
  it("ignores players who have disconnected but not yet been cleaned up", () => {
    const s = teamSizes([m(0), m(0, false), m(1)]);
    expect(s.humans).toEqual([1, 1]);
    expect(s.total).toEqual([1, 1]);
  });

  it("counts bots as bodies in the round but not as humans holding a seat", () => {
    const s = teamSizes([m(0), m(0, true, true), m(1, true, true), m(1, true, true)]);
    expect(s.humans).toEqual([1, 0]);
    expect(s.total).toEqual([2, 2]);
  });

  it("splits a room full of bots evenly", () => {
    // Two bots added one after another must not both land on team 0.
    const roster: TeamMember[] = [];
    for (let i = 0; i < 4; i++) roster.push(m(teamForNewPlayer(roster), true, true));
    expect(roster.map((r) => r.team)).toEqual([0, 1, 0, 1]);
  });

  it("puts a joining player on the side with fewer bodies, ties to team 0", () => {
    expect(teamForNewPlayer([])).toBe(0);
    expect(teamForNewPlayer([m(0)])).toBe(1);
    expect(teamForNewPlayer([m(0), m(1)])).toBe(0);
    expect(teamForNewPlayer([m(0), m(0), m(1)])).toBe(1);
    // A ghost used to hold a seat and send the next joiner to the wrong side.
    expect(teamForNewPlayer([m(0), m(1, false), m(1, false)])).toBe(1);
  });
});

describe("switching sides", () => {
  const sizes = (a: number, b: number) => ({ humans: [a, b] as [number, number], total: [a, b] as [number, number] });

  it("lets a player even up a lopsided match", () => {
    expect(canSwitchTeam(0, 1, sizes(3, 1), ctx())).toEqual({ ok: true, deferred: false });
  });

  it("refuses a switch that would make the destination bigger than the side being left", () => {
    // 3v3 → 2v4 is the stacking move the rule exists to stop.
    expect(canSwitchTeam(0, 1, sizes(3, 3), ctx())).toEqual({ ok: false, reason: "balance" });
    expect(canSwitchTeam(0, 1, sizes(2, 3), ctx())).toEqual({ ok: false, reason: "balance" });
    // Evening a 3v1 to 2v2 is fine; so is joining the short side of a 1v2.
    expect(canSwitchTeam(0, 1, sizes(3, 2), ctx()).ok).toBe(true);
  });

  it("balances on the bodies the picker shows, bots included", () => {
    // Four bots and one human on team 0 against one human: 5v1 on screen, so moving to make it
    // 4v2 is exactly the switch the rule should allow.
    const lopsided = { humans: [1, 1] as [number, number], total: [5, 1] as [number, number] };
    expect(canSwitchTeam(0, 1, lopsided, ctx()).ok).toBe(true);
    // And the reverse: 1v5 on screen, joining the big side is refused even though the human
    // counts are level, because a player reading "1 v 5" would expect exactly that.
    const other = { humans: [1, 1] as [number, number], total: [1, 5] as [number, number] };
    expect(canSwitchTeam(0, 1, other, ctx())).toEqual({ ok: false, reason: "balance" });
  });

  it("has nothing to switch in a mode without sides", () => {
    expect(canSwitchTeam(0, 1, sizes(1, 1), ctx({ teamsMode: false }))).toEqual({ ok: false, reason: "mode" });
  });

  it("refuses the same side, and a finished match", () => {
    expect(canSwitchTeam(1, 1, sizes(1, 1), ctx())).toEqual({ ok: false, reason: "same" });
    expect(canSwitchTeam(0, 1, sizes(2, 1), ctx({ matchEnded: true }))).toEqual({ ok: false, reason: "ended" });
  });

  it("makes a player stay put for a while after switching", () => {
    const just = ctx({ lastSwitchAt: 1_000_000 - TEAM_SWITCH_COOLDOWN_MS + 1 });
    expect(canSwitchTeam(0, 1, sizes(2, 1), just)).toEqual({ ok: false, reason: "cooldown" });
    const later = ctx({ lastSwitchAt: 1_000_000 - TEAM_SWITCH_COOLDOWN_MS });
    expect(canSwitchTeam(0, 1, sizes(2, 1), later).ok).toBe(true);
  });

  it("defers a round-based switch made mid-wave, and applies a frozen one at once", () => {
    // Switching sides in the middle of a live bomb round hands the enemy a free kill and a free
    // spawn, and Bomb's attack/defend roles flip at halftime — so it lands at the next round.
    expect(canSwitchTeam(0, 1, sizes(2, 1), ctx({ roundBased: true, frozen: false }))).toEqual({ ok: true, deferred: true });
    expect(canSwitchTeam(0, 1, sizes(2, 1), ctx({ roundBased: true, frozen: true }))).toEqual({ ok: true, deferred: false });
  });
});
