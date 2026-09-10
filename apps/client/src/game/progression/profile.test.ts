import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BADGES, BUILDS, DEFAULT_BUILD, DEFAULT_HAIRCUT, DEFAULT_OUTFIT, DROPPABLE_OUTFITS, HAIRCUTS, XP, decodeBuild, decodeOutfit, decodeSkins, levelFor, xpToNext, type MatchStats } from "@frankibarber/shared";
import { skinById } from "@frankibarber/skins";
import { applyMatch, emptyProfile, loadProfile, ownedCuts, ownedFits, saveProfile, equipBuild, equipHaircut, equipOutfit, equippedBuild, equippedHaircut, equippedOutfit, ensureStarterSkins, equipSkin, equippedSkins, refreshDailyCrates, openCrate } from "./profile";

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

/**
 * These suites run in node, where there is no storage. `loadProfile` swallows that by design (a
 * browser in private mode is the normal case), which would make every assertion below pass
 * vacuously — so give it a real one to write to.
 */
function memoryStorage(): Map<string, string> {
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
  return mem;
}

/** Drop E: the wardrobe. Owned is derived, equipped is stored, and neither buys anything. */
describe("haircuts in the profile", () => {
  const mem = memoryStorage();

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

  it("grants the launch collection once to old and new profiles", () => {
    const first = ensureStarterSkins(100);
    expect(first.skins.map((skin) => skin.skin)).toEqual(["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy"]);
    expect(ensureStarterSkins(200)).toEqual(first);
    expect(loadProfile().skins).toHaveLength(6);
  });

  it("grants one daily crate, rewards completed daily tasks once, and opens a cosmetic", () => {
    const morning = new Date(2026, 8, 9, 8);
    expect(refreshDailyCrates(morning).crates).toBe(1);
    expect(refreshDailyCrates(new Date(2026, 8, 9, 22)).crates).toBe(1);
    let p = applyMatch(loadProfile(), match({ kills: 10, headshots: 3 }), 0).profile;
    saveProfile(p);
    expect(p.crates).toBe(4);
    p = applyMatch(p, match({ kills: 10, headshots: 3 }), 0).profile;
    expect(p.crates).toBe(4);
    saveProfile(p);
    const opened = openCrate(new Date(2026, 8, 9, 23).getTime());
    expect(opened?.profile.crates).toBe(3);
    expect(opened?.prize.kind === "skin" || opened?.prize.kind === "haircut").toBe(true);
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

describe("the body build", () => {
  memoryStorage();

  it("starts on the default and survives a reload", () => {
    expect(equippedBuild()).toBe(DEFAULT_BUILD);
    expect(equipBuild("byk")).toBe("byk");
    expect(equippedBuild()).toBe("byk");
    // The reload: nothing is cached, the value comes back out of storage.
    expect(loadProfile().build).toBe("byk");
    expect(JSON.parse(localStorage.getItem("bs_profile_v1")!).build).toBe("byk");
  });

  it("refuses a build that does not exist, on the way in and on the way out", () => {
    // The way in: a caller with a junk id.
    saveProfile({ ...emptyProfile(), build: "byk" });
    expect(equipBuild("a-build-that-does-not-exist")).toBe("byk");
    expect(loadProfile().build, "a refused equip must not overwrite what was there").toBe("byk");
    // The way out: a blob from a build that had a body this one does not, or a hand-edited profile.
    for (const junk of ["not-a-build", "", null, 42, { id: "byk" }, "<script>"]) {
      saveProfile({ ...emptyProfile(), build: junk as string });
      expect(loadProfile().build, String(junk)).toBe(DEFAULT_BUILD);
    }
  });

  it("is not gated: every build is equippable from an empty profile", () => {
    // The decision (Decisions log, 2026-09-09) in a test, so a later change to gate them has to
    // change this line and say why. Contrast `equipHaircut`, which refuses what is not earned.
    for (const item of BUILDS) {
      saveProfile(emptyProfile());
      expect(equipBuild(item.id), item.id).toBe(item.id);
    }
  });

  it("rides to the room in the cosmetic field, next to the finishes", () => {
    saveProfile(emptyProfile());
    ensureStarterSkins();
    equipSkin("rifle", "osy");
    expect(equippedSkins()).toBe("rifle=osy");        // default build: no entry, unchanged on the wire
    equipBuild("tyczka");
    expect(equippedSkins()).toBe("body=tyczka,rifle=osy");
    expect(decodeBuild(equippedSkins())).toBe("tyczka");
    expect(decodeSkins(equippedSkins())).toEqual({ rifle: "osy" });
  });

  it("survives a profile written before builds existed", () => {
    // The real migration case: last week's blob, with no `build` key at all.
    const old = { ...emptyProfile(), xp: 900, haircut: DEFAULT_HAIRCUT } as Record<string, unknown>;
    delete old.build;
    localStorage.setItem("bs_profile_v1", JSON.stringify(old));
    const p = loadProfile();
    expect(p.build).toBe(DEFAULT_BUILD);
    expect(p.xp, "migrating one field must not cost the player the rest").toBe(900);
  });

  it("is carried through a match, like the haircut", () => {
    const p = { ...emptyProfile(), build: "barylka" };
    expect(applyMatch(p, match({ kills: 3 }), 0).profile.build).toBe("barylka");
  });
});

describe("outfits in the profile", () => {
  memoryStorage();

  it("starts with the kit and nothing else, and the kit is always wearable", () => {
    expect(equippedOutfit()).toBe(DEFAULT_OUTFIT);
    expect(ownedFits().map((o) => o.id)).toEqual([DEFAULT_OUTFIT]);
    expect(equipOutfit(DEFAULT_OUTFIT)).toBe(DEFAULT_OUTFIT);
  });

  it("refuses an outfit the player has not rolled", () => {
    // Unlike a build, an outfit IS earned, so this is the haircut rule and not the build rule.
    expect(equipOutfit("kibol")).toBe(DEFAULT_OUTFIT);
    saveProfile({ ...emptyProfile(), fits: ["kibol"] });
    expect(equipOutfit("kibol")).toBe("kibol");
    expect(loadProfile().outfit).toBe("kibol");
    expect(equipOutfit("nietoperz"), "still not owned").toBe("kibol");
  });

  it("repairs an equipped outfit the player cannot justify", () => {
    saveProfile({ ...emptyProfile(), outfit: "nietoperz", fits: [] });
    expect(loadProfile().outfit, "equipped but not owned").toBe(DEFAULT_OUTFIT);
    for (const junk of ["not-an-outfit", "", null, 42, "<script>"]) {
      saveProfile({ ...emptyProfile(), outfit: junk as string, fits: ["kibol"] });
      expect(loadProfile().outfit, String(junk)).toBe(DEFAULT_OUTFIT);
    }
    // ...and a junk ownership list is filtered rather than trusted.
    saveProfile({ ...emptyProfile(), fits: ["kibol", "kibol", "nope", 7, DEFAULT_OUTFIT] as string[] });
    expect(loadProfile().fits).toEqual(["kibol"]);
  });

  it("survives a profile written before outfits existed", () => {
    const old = { ...emptyProfile(), xp: 1200, build: "byk" } as Record<string, unknown>;
    delete old.outfit; delete old.fits;
    localStorage.setItem("bs_profile_v1", JSON.stringify(old));
    const p = loadProfile();
    expect(p.outfit).toBe(DEFAULT_OUTFIT);
    expect(p.fits).toEqual([]);
    expect(p.xp, "migrating two fields must not cost the rest").toBe(1200);
    expect(p.build).toBe("byk");
  });

  it("rides to the room in the same field as the build and the finishes", () => {
    saveProfile({ ...emptyProfile(), fits: ["menel"] });
    ensureStarterSkins();
    equipSkin("rifle", "osy");
    equipBuild("tyczka");
    equipOutfit("menel");
    expect(equippedSkins()).toBe("body=tyczka,fit=menel,rifle=osy");
    expect(decodeOutfit(equippedSkins())).toBe("menel");
  });
});

describe("what a crate rolls", () => {
  memoryStorage();

  it("hands out outfits, haircuts and finishes, and never the same outfit twice", () => {
    saveProfile({ ...emptyProfile(), crates: 400, crateDay: "2026-01-01", life: { ...emptyProfile().life, matches: 50, kills: 200, headshots: 60, assists: 40, wins: 20, shaves: 30 } });
    const kinds = new Set<string>(); const outfits: string[] = [];
    for (let i = 0; i < 400; i++) {
      const rolled = openCrate(1_700_000_000_000 + i * 137);
      if (!rolled) break;
      kinds.add(rolled.prize.kind);
      if (rolled.prize.kind === "outfit") outfits.push(rolled.prize.id);
    }
    expect([...kinds].sort()).toEqual(["haircut", "outfit", "skin"]);
    expect(new Set(outfits).size, "a rolled outfit is never rolled again").toBe(outfits.length);
    expect(outfits.length, "every droppable outfit is reachable").toBe(DROPPABLE_OUTFITS.length);
    // Everything it gave out is owned afterwards, and the kit was never handed out as a prize.
    const p = loadProfile();
    expect(p.fits.sort()).toEqual(DROPPABLE_OUTFITS.map((o) => o.id).sort());
    expect(p.fits).not.toContain(DEFAULT_OUTFIT);
  });

  it("stops rolling outfits once they are all owned, instead of giving duds", () => {
    saveProfile({ ...emptyProfile(), crates: 30, crateDay: "2026-01-01", fits: DROPPABLE_OUTFITS.map((o) => o.id) });
    for (let i = 0; i < 30; i++) {
      const rolled = openCrate(1_700_000_100_000 + i * 91);
      expect(rolled?.prize.kind, "an exhausted pool hands its share to the others").not.toBe("outfit");
    }
  });

  it("gives the common tiers out more often than the golden one", () => {
    // The weights as behaviour rather than as a table read back to itself.
    saveProfile({ ...emptyProfile(), crates: 600, crateDay: "2026-01-01" });
    const tiers: Record<string, number> = {};
    for (let i = 0; i < 600; i++) {
      const rolled = openCrate(1_700_000_200_000 + i * 53);
      if (rolled?.prize.kind !== "skin") continue;
      const rarity = skinById(rolled.prize.id)?.rarity ?? "?";
      tiers[rarity] = (tiers[rarity] ?? 0) + 1;
    }
    expect(tiers.pospolity ?? 0).toBeGreaterThan(tiers.zloty ?? 0);
  });
});
