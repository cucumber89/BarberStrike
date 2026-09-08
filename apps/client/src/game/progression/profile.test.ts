import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BADGES, DEFAULT_HAIRCUT, HAIRCUTS, XP, levelFor, xpToNext, type MatchStats } from "@frankibarber/shared";
import { applyMatch, emptyProfile, loadProfile, ownedCuts, saveProfile, equipHaircut, equippedHaircut, equipSkin, equippedSkins } from "./profile";

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
    // Turning up once IS the first haircut's requirement — a player who does nothing still leaves
    // with something to wear, which is the whole shape of a cosmetic-only progression.
    expect(reward.haircuts).toEqual(["buzz"]);
    expect(profile.life.matches).toBe(1);
    expect(Number.isFinite(profile.xp)).toBe(true);
  });
});

/** Drop E: the wardrobe. Owned is derived, equipped is stored, and neither buys anything. */
describe("haircuts in the profile", () => {
  // This suite runs in node, where there is no storage. `loadProfile` swallows that by design (a
  // browser in private mode is the normal case), which would make every assertion below pass
  // vacuously — so give it a real one to write to.
  const mem = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
    };
  });
  afterAll(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });
  beforeEach(() => mem.clear());

  it("migrates an old profile and repairs skin fields without losing progression", () => {
    mem.set("bs_profile_v1", JSON.stringify({ xp: 123, life: { kills: 7 } }));
    expect(loadProfile()).toMatchObject({ xp: 123, life: { kills: 7 }, skins: [], equip: {} });
    mem.set("bs_profile_v1", JSON.stringify({ xp: 123, life: { kills: 7 }, skins: [null, 12, { skin: "removed" }, { skin: "osy", wear: 4, rolledAt: -1 }], equip: { rifle: "removed", pistol: "osy", smg: "talk" } }));
    expect(loadProfile()).toMatchObject({ xp: 123, life: { kills: 7 }, skins: [{ skin: "osy", wear: 1, rolledAt: 0 }], equip: { pistol: "osy" } });
  });

  it("equips owned recipes only and preserves duplicate instances through a match", () => {
    const skins = [{ skin: "osy", wear: .1, rolledAt: 1 }, { skin: "osy", wear: .8, rolledAt: 2 }];
    saveProfile({ ...emptyProfile(), skins });
    expect(equipSkin("rifle", "talk")).toBe(""); expect(equipSkin("rifle", "osy")).toBe("osy");
    expect(equippedSkins()).toBe("rifle=osy");
    expect(applyMatch(loadProfile(), match(), 0).profile).toMatchObject({ skins, equip: { rifle: "osy" } });
    expect(equipSkin("rifle", "")).toBe(""); expect(equippedSkins()).toBe("");
  });

  it("starts with the cap alone and hands out the first haircut for turning up once", () => {
    expect(ownedCuts(emptyProfile()).map((h) => h.id)).toEqual([DEFAULT_HAIRCUT]);
    const { profile, reward } = applyMatch(emptyProfile(), match(), 0);
    expect(reward.haircuts).toEqual(["buzz"]);
    expect(ownedCuts(profile).map((h) => h.id)).toEqual([DEFAULT_HAIRCUT, "buzz"]);
    // And it is announced exactly once, like a badge.
    expect(applyMatch(profile, match(), 0).reward.haircuts).toEqual([]);
  });

  it("counts shaves given towards the catalog, and only shaves", () => {
    let p = emptyProfile();
    p = applyMatch(p, match({ kills: 5 }), 5, 0).profile;   // five clipper kills, none from behind
    expect(p.life.shaves).toBe(0);
    expect(ownedCuts(p).some((h) => h.id === "mohawk")).toBe(false);
    p = applyMatch(p, match({ kills: 5 }), 5, 5).profile;
    expect(p.life.shaves).toBe(5);
    expect(ownedCuts(p).some((h) => h.id === "mohawk")).toBe(true);
  });

  it("equips only what is owned, and never silently equips something locked", () => {
    expect(equippedHaircut()).toBe(DEFAULT_HAIRCUT);
    expect(equipHaircut("mohawk")).toBe(DEFAULT_HAIRCUT);   // not earned: refused, not thrown
    saveProfile(applyMatch(emptyProfile(), match(), 0).profile);
    expect(equipHaircut("buzz")).toBe("buzz");
    expect(equippedHaircut()).toBe("buzz");
    expect(loadProfile().haircut).toBe("buzz");
  });

  it("repairs an equipped id the player cannot justify", () => {
    // A blob from another browser, an edited profile, or a catalog that shrank.
    saveProfile({ ...emptyProfile(), haircut: "bleach" });
    expect(loadProfile().haircut).toBe(DEFAULT_HAIRCUT);
    saveProfile({ ...emptyProfile(), haircut: "not-a-haircut" });
    expect(loadProfile().haircut).toBe(DEFAULT_HAIRCUT);
    // Nothing in the catalog is reachable without a counter to justify it (L1).
    expect(HAIRCUTS.every((h) => h.id === DEFAULT_HAIRCUT || !h.unlockedBy(emptyProfile().life))).toBe(true);
  });
});
