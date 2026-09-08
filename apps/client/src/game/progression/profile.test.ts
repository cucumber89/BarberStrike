import { describe, expect, it } from "vitest";
import { BADGES, XP, levelFor, xpToNext, type MatchStats } from "@frankibarber/shared";
import { applyMatch, emptyProfile } from "./profile";

const match = (over: Partial<MatchStats> = {}): MatchStats => ({
  kills: 0, headshots: 0, assists: 0, deaths: 0, captures: 0, wavesSurvived: 0, result: -1, mode: "tdm", ...over,
});

describe("applying a match to a profile", () => {
  it("does not touch the profile it was given", () => {
    const p = emptyProfile();
    const { profile } = applyMatch(p, match({ kills: 5, result: 1 }), 0);
    expect(p.xp, "the caller decides when to save; this must not write behind their back").toBe(0);
    expect(p.life.kills).toBe(0);
    expect(profile.xp).toBeGreaterThan(0);
  });

  it("reports the level it started at and the one it ended at", () => {
    const p = { ...emptyProfile(), xp: xpToNext(1) - XP.played }; // one "played" short of level 2
    const { reward } = applyMatch(p, match(), 0);
    expect(reward.before.level).toBe(1);
    expect(reward.after.level).toBe(2);
    expect(reward.levelsGained).toBe(1);
  });

  it("announces a badge exactly once, however many matches follow", () => {
    let p = emptyProfile();
    const first = applyMatch(p, match({ kills: 1 }), 0);
    expect(first.reward.earned).toContain("first-blood");
    p = first.profile;
    const second = applyMatch(p, match({ kills: 1 }), 0);
    expect(second.reward.earned).not.toContain("first-blood");
    expect(second.profile.badges.filter((b) => b === "first-blood")).toHaveLength(1);
  });

  it("keeps every badge it has ever earned, and only real ones", () => {
    let p = emptyProfile();
    for (let i = 0; i < 30; i++) p = applyMatch(p, match({ kills: 5, headshots: 1, result: 1 }), 1).profile;
    const known = new Set(BADGES.map((b) => b.id));
    expect(p.badges.every((b) => known.has(b))).toBe(true);
    expect(new Set(p.badges).size).toBe(p.badges.length);
    expect(p.badges).toContain("kills-100");
    expect(levelFor(p.xp).level).toBeGreaterThan(1);
  });

  it("survives a match where nothing happened", () => {
    const { profile, reward } = applyMatch(emptyProfile(), match(), 0);
    expect(reward.total).toBe(XP.played);
    expect(reward.earned).toEqual([]);
    expect(profile.life.matches).toBe(1);
    expect(Number.isFinite(profile.xp)).toBe(true);
  });
});
