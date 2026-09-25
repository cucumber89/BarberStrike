import { describe, expect, it } from "vitest";
import { cutBeforeRead, HINT_READ_MS, HINTS, nextHint, type HintContext } from "./hintRules";

const base: HintContext = {
  alive: true, connected: true, shopOpen: false, covered: false, buyWindowLeft: 0,
  planVoteMine: false, teamTotals: [3, 3], myTeam: 0, elapsedMs: 60_000,
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
      const h = nextHint(ctx({ buyWindowLeft: 5000, planVoteMine: true, teamTotals: [5, 2] }), seen);
      if (!h) break;
      expect(seen.has(h.id), `${h.id} was offered twice`).toBe(false);
      seen.add(h.id);
    }
    expect(nextHint(ctx({ buyWindowLeft: 5000, planVoteMine: true, teamTotals: [5, 2] }), seen)).toBeNull();
  });

  it("puts the thing on screen first", () => {
    // A plan vote is a decision with a clock on it; it outranks everything else.
    expect(nextHint(ctx({ planVoteMine: true, buyWindowLeft: 5000 }), none)?.id).toBe("plan");
    expect(nextHint(ctx({ buyWindowLeft: 5000 }), none)?.id).toBe("buy");
  });

  it("does not talk over a menu that already explains itself", () => {
    expect(nextHint(ctx({ shopOpen: true, buyWindowLeft: 5000 }), none)).toBeNull();
  });

  it("never spends the one-time plan hint under the shop, Tab or the pause card", () => {
    // ULTRON P3 defect (hint burn): the plan hint was picked BEFORE the shop check, and the zone is
    // hidden under every overlay (§4.5), so pressing B as the vote opened used it up unseen.
    expect(nextHint(ctx({ planVoteMine: true, shopOpen: true }), none)).toBeNull();
    expect(nextHint(ctx({ planVoteMine: true, covered: true }), none)).toBeNull();
    for (const o of [{ buyWindowLeft: 5000 }, { teamTotals: [5, 2] as [number, number] }, {}])
      expect(nextHint(ctx({ ...o, covered: true }), none)).toBeNull();
    // …and it is still there, unspent, once the overlay closes and the vote is still open.
    expect(nextHint(ctx({ planVoteMine: true }), none)?.id).toBe("plan");
  });

  it("gives back a hint that a cover cut before it could be read", () => {
    expect(cutBeforeRead(0, 8000)).toBe(true);
    expect(cutBeforeRead(HINT_READ_MS - 1, 8000)).toBe(true);
    expect(cutBeforeRead(HINT_READ_MS, 8000)).toBe(false);
    expect(cutBeforeRead(7000, 8000)).toBe(false);
    for (const h of HINTS) expect(cutBeforeRead(h.ms, h.ms), h.id).toBe(false); // ran its course
  });

  it("mentions switching sides only when a side is actually short", () => {
    expect(nextHint(ctx({ teamTotals: [3, 3] }), new Set(["move", "pause"]))).toBeNull();
    expect(nextHint(ctx({ teamTotals: [4, 3] }), new Set(["move", "pause"]))).toBeNull();
    expect(nextHint(ctx({ teamTotals: [5, 3] }), new Set(["move", "pause"]))?.id).toBe("team");
  });

  it("never repeats what the mode line and the action slot already say about the bomb", () => {
    // Drop U (P3): „MASZ ŁADUNEK” / „PRZYTRZYMAJ [T] · PODŁÓŻ” / „ROZBRÓJ [T]” have their one place.
    expect(HINTS.map((h) => h.id)).not.toContain("objective");
    expect(HINTS.map((h) => h.id)).not.toContain("defuse");
    for (const h of HINTS) expect(h.text, h.id).not.toMatch(/ładunek|podłoż|rozbr/i);
  });

  it("keeps every hint short enough to read mid-round", () => {
    for (const h of HINTS) {
      expect(h.text.length, h.id).toBeLessThan(78);
      expect(h.ms).toBeGreaterThanOrEqual(6000);
    }
  });
});
