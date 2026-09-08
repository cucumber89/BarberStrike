import { describe, expect, it } from "vitest";
import { HINTS, nextHint, type HintContext } from "./hintRules";

const base: HintContext = {
  alive: true, connected: true, shopOpen: false, buyWindowLeft: 0, mode: "bomb",
  bombStage: "", carrying: false, planVoteMine: false, teamTotals: [3, 3], myTeam: 0, elapsedMs: 60_000,
};
const ctx = (o: Partial<HintContext> = {}): HintContext => ({ ...base, ...o });
const none = new Set<string>();

describe("first-run hints", () => {
  it("says nothing before the player is even connected", () => {
    expect(nextHint(ctx({ connected: false }), none)).toBeNull();
  });

  it("waits a moment before the first general hint, rather than greeting a wall of text", () => {
    expect(nextHint(ctx({ elapsedMs: 200 }), none)).toBeNull();
    expect(nextHint(ctx({ elapsedMs: 3000 }), none)?.id).toBe("move");
  });

  it("shows each hint once and then never again", () => {
    const seen = new Set<string>();
    for (let i = 0; i < HINTS.length * 3; i++) {
      const h = nextHint(ctx({ buyWindowLeft: 5000, carrying: true, planVoteMine: true, teamTotals: [5, 2] }), seen);
      if (!h) break;
      expect(seen.has(h.id), `${h.id} was offered twice`).toBe(false);
      seen.add(h.id);
    }
    expect(nextHint(ctx({ buyWindowLeft: 5000, carrying: true, planVoteMine: true, teamTotals: [5, 2] }), seen)).toBeNull();
  });

  it("puts the thing on screen first", () => {
    // A plan vote is a decision with a clock on it; it outranks everything else.
    expect(nextHint(ctx({ planVoteMine: true, buyWindowLeft: 5000, carrying: true }), none)?.id).toBe("plan");
    expect(nextHint(ctx({ buyWindowLeft: 5000, carrying: true }), none)?.id).toBe("buy");
    expect(nextHint(ctx({ carrying: true }), none)?.id).toBe("objective");
  });

  it("does not talk over a menu that already explains itself", () => {
    expect(nextHint(ctx({ shopOpen: true, buyWindowLeft: 5000 }), none)).toBeNull();
  });

  it("mentions switching sides only when a side is actually short", () => {
    expect(nextHint(ctx({ teamTotals: [3, 3] }), new Set(["move", "pause"]))).toBeNull();
    expect(nextHint(ctx({ teamTotals: [4, 3] }), new Set(["move", "pause"]))).toBeNull();
    expect(nextHint(ctx({ teamTotals: [5, 3] }), new Set(["move", "pause"]))?.id).toBe("team");
  });

  it("does not tell a dead player to defuse", () => {
    expect(nextHint(ctx({ bombStage: "planted", alive: false }), new Set(["move", "pause"]))).toBeNull();
    expect(nextHint(ctx({ bombStage: "planted", alive: true }), new Set(["move", "pause"]))?.id).toBe("defuse");
  });

  it("keeps every hint short enough to read mid-round", () => {
    for (const h of HINTS) {
      expect(h.text.length, h.id).toBeLessThan(78);
      expect(h.ms).toBeGreaterThanOrEqual(6000);
    }
  });
});
