import { describe, expect, it } from "vitest";
import { MASTERY_MAX_TIER, MASTERY_TIERS, addWeaponKills, masteryFor, masteryName, masteryUps, totalWeaponKills } from "./mastery";

describe("weapon mastery", () => {
  it("starts unranked and the bar never overflows", () => {
    expect(masteryFor(0)).toMatchObject({ tier: 0, into: 0, need: MASTERY_TIERS[1].kills, maxed: false });
    for (const k of [0, 1, 9, 10, 11, 74, 75, 299, 300, 10_000]) {
      const m = masteryFor(k);
      expect(m.into, `into at ${k}`).toBeGreaterThanOrEqual(0);
      if (!m.maxed) expect(m.into, `into at ${k}`).toBeLessThan(m.need);
    }
  });

  it("reaches each tier exactly at its threshold", () => {
    for (const t of MASTERY_TIERS) {
      expect(masteryFor(t.kills).tier).toBe(t.tier);
      if (t.kills > 0) expect(masteryFor(t.kills - 1).tier).toBe(t.tier - 1);
    }
    expect(masteryFor(1e9).maxed).toBe(true);
    expect(masteryFor(1e9).tier).toBe(MASTERY_MAX_TIER);
  });

  it("tolerates garbage counts", () => {
    expect(masteryFor(NaN).tier).toBe(0);
    expect(masteryFor(-5).kills).toBe(0);
  });

  it("adds a match to the tally without touching the old one", () => {
    const life = { rifle: 8 };
    const after = addWeaponKills(life, { rifle: 3, shotgun: 1, frag: 0, knife: -2 });
    expect(life).toEqual({ rifle: 8 });
    expect(after).toEqual({ rifle: 11, shotgun: 1 });
    expect(totalWeaponKills(after)).toBe(12);
  });

  it("lists every tier crossed, once, with a readable name", () => {
    const ups = masteryUps({ rifle: 8 }, { rifle: 31, shotgun: 2 });
    expect(ups.map((u) => [u.weapon, u.tier.tier])).toEqual([["rifle", 1], ["rifle", 2]]);
    expect(ups[0].name).toBe(masteryName("rifle"));
    expect(masteryName("frag")).toBe("Frag");
    expect(masteryName("whatever")).toBe("whatever");
    expect(masteryUps({ rifle: 31 }, { rifle: 40 })).toEqual([]);
  });

  it("pays more for higher tiers", () => {
    for (let i = 1; i < MASTERY_TIERS.length; i++) {
      expect(MASTERY_TIERS[i].kills).toBeGreaterThan(MASTERY_TIERS[i - 1].kills);
      expect(MASTERY_TIERS[i].xp).toBeGreaterThan(MASTERY_TIERS[i - 1].xp);
    }
  });
});
