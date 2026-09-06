import { describe, expect, it } from "vitest";
import { BADGES, XP, dailyChallenges, levelFor, xpToNext, type MatchStats } from "@frankibarber/shared";
import { RECENT_MAX, applyMatch, emptyProfile, repairProfile } from "./profile";

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

describe("2.1: mastery, daily challenges, recent matches", () => {
  it("pays a mastery tier the match it is reached, and lists it", () => {
    const p = { ...emptyProfile(), weapons: { rifle: 9 } };
    const { profile, reward } = applyMatch(p, match({ kills: 1 }), 0, { rifle: 1 }, "2026-09-06");
    expect(profile.weapons.rifle).toBe(10);
    expect(reward.mastery.map((u) => [u.weapon, u.tier.tier])).toEqual([["rifle", 1]]);
    expect(reward.lines.some((l) => l.label.includes("BRĄZ"))).toBe(true);
    expect(reward.total).toBe(XP.played + XP.kill + reward.mastery[0].tier.xp);
    expect(p.weapons.rifle, "pure").toBe(9);
  });

  it("finishes a daily challenge once and pays its XP once", () => {
    const day = "2026-09-06";
    const cs = dailyChallenges(day);
    const stats = match({ kills: 100, headshots: 50, assists: 20, captures: 10, wavesSurvived: 20, result: 1, mode: "dom" });
    const weapons = Object.fromEntries(["clippers", "shotgun", "sniper", "pistol", "revolver", "frag", "knife", "launcher", "lmg", "smg2", "dmr"].map((w) => [w, 50]));
    const first = applyMatch(emptyProfile(), stats, 50, weapons, day);
    expect(first.reward.challenges.length).toBeGreaterThan(0);
    for (const c of first.reward.challenges) expect(cs.map((x) => x.id)).toContain(c.id);
    const paid = first.reward.challenges.reduce((n, c) => n + c.xp, 0);
    expect(first.reward.lines.filter((l) => l.label.startsWith("Wyzwanie")).reduce((n, l) => n + l.xp, 0)).toBe(paid);
    const second = applyMatch(first.profile, stats, 50, weapons, day);
    for (const c of first.reward.challenges) expect(second.reward.challenges.map((x) => x.id)).not.toContain(c.id);
    expect(second.profile.daily?.day).toBe(day);
  });

  it("keeps the last matches, newest first, capped", () => {
    let p = emptyProfile();
    for (let i = 0; i < RECENT_MAX + 3; i++) p = applyMatch(p, match({ kills: i }), 0, {}, "2026-09-06", 1000 + i).profile;
    expect(p.recent).toHaveLength(RECENT_MAX);
    expect(p.recent[0].kills).toBe(RECENT_MAX + 2);
    expect(p.recent[0].at).toBeGreaterThan(p.recent[1].at);
  });

  it("repairs an old or damaged blob into a valid profile", () => {
    const old = repairProfile({ xp: 1234.9, life: { kills: 7, deaths: "x" }, badges: ["first-blood", "bogus"] });
    expect(old.xp).toBe(1234);
    expect(old.life.kills).toBe(7);
    expect(old.life.deaths).toBe(0);
    expect(old.badges).toEqual(["first-blood"]);
    expect(old.weapons).toEqual({});
    expect(old.daily).toBeNull();
    expect(old.recent).toEqual([]);
    const bad = repairProfile({ weapons: { rifle: -3, smg: 2.7, x: "no" }, daily: { day: "nope", progress: {}, done: [] }, recent: [null, { at: 5 }] });
    expect(bad.weapons).toEqual({ smg: 2 });
    expect(bad.daily).toBeNull();
    expect(bad.recent).toHaveLength(1);
    expect(repairProfile(null)).toEqual(emptyProfile());
    expect(repairProfile("garbage")).toEqual(emptyProfile());
  });
});
