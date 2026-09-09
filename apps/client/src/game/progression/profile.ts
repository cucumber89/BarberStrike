import {
  BADGES, DEFAULT_HAIRCUT, HAIRCUTS, addMatch, emptyLifetime, haircutDef, hashString, isHaircutId, levelFor, mulberry32,
  newBadges, newHaircuts, ownedHaircuts, titleFor, xpForMatch,
  type HaircutDef, type LevelState, type LifetimeStats, type MatchStats, type XpLine,
} from "@frankibarber/shared";
import { DEFAULT_BUILD, isBuildId } from "@frankibarber/shared";
import { DEFAULT_OUTFIT, DROPPABLE_OUTFITS, isOutfitId, outfitDef, type OutfitDef, type OutfitRarity } from "@frankibarber/shared";
import { WEAPON_ORDER, encodeCosmetics, type WeaponId } from "@frankibarber/shared";
import { catalog, fitsWeapon, skinById, type SkinInstance } from "@frankibarber/skins";

/**
 * The local player profile: lifetime XP, badges and stats, in localStorage.
 *
 * No accounts (a settled project decision), so there is nowhere else to put it. That has one honest
 * consequence worth stating rather than hiding: clearing site data resets it, and it does not follow
 * you to another browser. It buys the thing that matters instead — nobody has to sign up to play
 * with their friends on a Friday.
 */

const KEY = "bs_profile_v1";

export interface Profile {
  xp: number;
  life: LifetimeStats;
  /** Ids of `BADGES`, in the order they were first earned. */
  badges: string[];
  /**
   * Drop E: the equipped haircut id. Which haircuts are OWNED is not stored — it is recomputed from
   * `life` by `ownedHaircuts`, so a stored list can never disagree with the counters that earned it,
   * and a catalog that grows later hands out what a player already qualifies for.
   */
  haircut: string;
  /**
   * The body build (`shared/builds.ts`). Unlike a haircut there is nothing to own — every build is
   * available from the first launch (Decisions, 2026-09-09) — so the only migration it needs is the
   * one every field here gets: an id this build does not know falls back to the default rather than
   * being trusted. A profile edited by hand cannot conjure a seventh body.
   */
  build: string;
  /**
   * The equipped outfit, and the ones this profile has pulled out of a crate.
   *
   * Unlike a build, an outfit IS owned: it is a crate drop, so the list has to be stored — there is
   * no counter to recompute it from the way `ownedHaircuts` recomputes haircuts from `life`. The kit
   * is never in the list and never needs to be; `ownedFits` puts it at the front of every profile.
   */
  outfit: string;
  fits: string[];
  skins: SkinInstance[];
  equip: Partial<Record<WeaponId, string>>;
  crates: number;
  crateDay: string;
  crateCuts: string[];
  challengeClaims: string[];
  challengeBase: { matches: number; kills: number; headshots: number };
}

export const emptyProfile = (): Profile => ({ xp: 0, life: emptyLifetime(), badges: [], haircut: DEFAULT_HAIRCUT, build: DEFAULT_BUILD, outfit: DEFAULT_OUTFIT, fits: [], skins: [], equip: {}, crates: 0, crateDay: "", crateCuts: [], challengeClaims: [], challengeBase: { matches: 0, kills: 0, headshots: 0 } });

/**
 * Reads the profile, repairing anything the shape has outgrown.
 *
 * Every field is defaulted individually rather than trusting the blob: a profile written by an
 * older build is the normal case, not the exception, and a missing counter must not turn the
 * summary screen into NaN.
 */
export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw) as Partial<Profile>;
    const life = { ...emptyLifetime(), ...(p.life ?? {}) };
    for (const k of Object.keys(life) as (keyof LifetimeStats)[]) {
      if (!Number.isFinite(life[k])) life[k] = 0;
    }
    const known = new Set(BADGES.map((b) => b.id));
    const fits: string[] = Array.isArray(p.fits)
      ? [...new Set(p.fits.filter((id): id is string => typeof id === "string" && isOutfitId(id) && id !== DEFAULT_OUTFIT))]
      : [];
    const skins: SkinInstance[] = Array.isArray(p.skins) ? p.skins.flatMap(instance => {
      if (!instance || typeof instance !== "object" || typeof instance.skin !== "string" || !skinById(instance.skin)) return [];
      return [{ skin: instance.skin, wear: Number.isFinite(instance.wear) ? Math.max(0, Math.min(1, instance.wear)) : 0,
        rolledAt: Number.isFinite(instance.rolledAt) ? Math.max(0, instance.rolledAt) : 0 }];
    }) : [];
    const equip: Profile["equip"] = {};
    for (const weapon of WEAPON_ORDER) {
      const id = p.equip?.[weapon]; const skin = typeof id === "string" ? skinById(id) : undefined;
      if (skin && fitsWeapon(skin, weapon) && skins.some(instance => instance.skin === id)) equip[weapon] = id;
    }
    return {
      skins, equip,
      crates: Number.isFinite(p.crates) ? Math.max(0, Math.floor(p.crates as number)) : 0,
      crateDay: typeof p.crateDay === "string" ? p.crateDay : "",
      crateCuts: Array.isArray(p.crateCuts) ? p.crateCuts.filter(id => typeof id === "string" && isHaircutId(id)) : [],
      challengeClaims: Array.isArray(p.challengeClaims) ? p.challengeClaims.filter(id => typeof id === "string") : [],
      challengeBase: { matches: Number(p.challengeBase?.matches) || 0, kills: Number(p.challengeBase?.kills) || 0, headshots: Number(p.challengeBase?.headshots) || 0 },
      xp: Number.isFinite(p.xp) ? Math.max(0, Math.floor(p.xp as number)) : 0,
      life,
      badges: Array.isArray(p.badges) ? p.badges.filter((b) => known.has(b)) : [],
      // An id from a build that had a haircut this one does not, or one the player has not earned
      // (a cleared profile, an edited blob), falls back to the cap rather than to nothing.
      haircut: isHaircutId(p.haircut) && (ownedHaircuts(life).some((h) => h.id === p.haircut) || (p.crateCuts ?? []).includes(p.haircut as string)) ? (p.haircut as string) : DEFAULT_HAIRCUT,
      build: isBuildId(p.build) ? p.build : DEFAULT_BUILD,
      fits,
      // Equipped only if still owned AND still in the catalog — the same rule the haircut gets, and
      // for the same reason: a blob from another build, or an edited one, must not dress a player
      // in something they never rolled.
      outfit: isOutfitId(p.outfit) && (p.outfit === DEFAULT_OUTFIT || fits.includes(p.outfit)) ? p.outfit : DEFAULT_OUTFIT,
    };
  } catch {
    // A corrupt or unreadable profile is not worth a crash on the way into a match.
    return emptyProfile();
  }
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode, quota: play anyway */ }
}

/** What the summary screen shows after a match. */
export interface MatchReward {
  lines: XpLine[];
  total: number;
  before: LevelState;
  after: LevelState;
  levelsGained: number;
  /** Badge ids earned by THIS match. */
  earned: string[];
  /** Drop E: haircut ids unlocked by THIS match, shown next to the badges. */
  haircuts: string[];
  title: string;
}

/**
 * Applies one match to a profile and returns both the new profile and what to show.
 *
 * Pure in the profile it is given — it does not write. The caller saves, so a summary can be
 * computed and rendered without committing anything, and the test does not need storage.
 */
export function applyMatch(profile: Profile, stats: MatchStats, clipperKills: number, shaves = 0): { profile: Profile; reward: MatchReward } {
  const { lines, total } = xpForMatch(stats);
  const before = levelFor(profile.xp);
  const life = addMatch(profile.life, stats, clipperKills, shaves);
  const earned = newBadges(profile.life, life);
  const haircuts = newHaircuts(profile.life, life);
  const xp = profile.xp + total;
  const after = levelFor(xp);
  const next = claimChallengeCrates({
      ...profile,
      xp, life,
      badges: [...profile.badges, ...earned.filter((b) => !profile.badges.includes(b))],
      haircut: profile.haircut,
      build: profile.build,
      outfit: profile.outfit, fits: profile.fits,
  });
  return {
    profile: next,
    reward: { lines, total, before, after, levelsGained: after.level - before.level, earned, haircuts, title: titleFor(after.level) },
  };
}

// ------------------------------------------------------------------ Drop E: the wardrobe

/** The haircuts this profile has earned, catalog order. Always at least the cap. */
export const ownedCuts = (p: Profile = loadProfile()): HaircutDef[] => HAIRCUTS.filter(h => h.unlockedBy(p.life) || p.crateCuts.includes(h.id));

/**
 * The equipped haircut id, for the join options.
 *
 * Storage-first and defensive: this is called on the way INTO a match, where a throw would cost the
 * player the match rather than the haircut.
 */
export function equippedHaircut(): string {
  try { return loadProfile().haircut; } catch { return DEFAULT_HAIRCUT; }
}

/** Equips a haircut the player owns. Returns what is equipped afterwards. */
export function equipHaircut(id: string): string {
  const p = loadProfile();
  if (!ownedCuts(p).some((h) => h.id === id)) return p.haircut;
  saveProfile({ ...p, haircut: id });
  return haircutDef(id).id;
}

/**
 * The one cosmetic field for the join options: finishes and body together.
 *
 * Storage-first and defensive for the same reason `equippedHaircut` is — this runs on the way INTO
 * a match, where a throw would cost the player the match rather than the look.
 */
export const equippedSkins = (): string => {
  try { const p = loadProfile(); return encodeCosmetics(p.equip, p.build, p.outfit); } catch { return ""; }
};

/** The equipped build id, for the wardrobe and the preview. */
export function equippedBuild(): string {
  try { return loadProfile().build; } catch { return DEFAULT_BUILD; }
}

/**
 * Picks a body. Returns what is equipped afterwards, like `equipHaircut`.
 *
 * There is no ownership test, and that is the decision rather than an oversight: builds are not
 * earned (see `Profile.build`). An unknown id still cannot be stored — `isBuildId` is the same gate
 * `loadProfile` applies, so the write and the read agree.
 */
/** The outfits this profile can wear, catalog order. Always at least the kit. */
export const ownedFits = (p: Profile = loadProfile()): OutfitDef[] =>
  [outfitDef(DEFAULT_OUTFIT), ...DROPPABLE_OUTFITS.filter((o) => p.fits.includes(o.id))];

/** The equipped outfit id, for the wardrobe and the join options. */
export function equippedOutfit(): string {
  try { return loadProfile().outfit; } catch { return DEFAULT_OUTFIT; }
}

/** Wears an outfit the player owns. Refused, never thrown, like `equipHaircut`. */
export function equipOutfit(id: string): string {
  const p = loadProfile();
  if (!ownedFits(p).some((o) => o.id === id)) return p.outfit;
  saveProfile({ ...p, outfit: id });
  return id;
}

export function equipBuild(id: string): string {
  const p = loadProfile();
  if (!isBuildId(id)) return p.build;
  saveProfile({ ...p, build: id });
  return id;
}

export const CRATE_CHALLENGES = [
  { id: "mecz", label: "Rozegraj 1 mecz", stat: "matches" as const, target: 1 },
  { id: "zabojstwa", label: "Zdobądź 10 zabójstw", stat: "kills" as const, target: 10 },
  { id: "glowy", label: "Traf 3 razy w głowę", stat: "headshots" as const, target: 3 },
];

const dayKey = (now = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
export function refreshDailyCrates(now = new Date()): Profile {
  const p = loadProfile(); const day = dayKey(now);
  if (p.crateDay === day) return p;
  const next = { ...p, crates: p.crates + 1, crateDay: day, challengeClaims: [],
    challengeBase: { matches: p.life.matches, kills: p.life.kills, headshots: p.life.headshots } };
  saveProfile(next); return next;
}

export function claimChallengeCrates(profile: Profile): Profile {
  const claims = [...profile.challengeClaims]; let crates = profile.crates;
  for (const task of CRATE_CHALLENGES) {
    if (!claims.includes(task.id) && profile.life[task.stat] - profile.challengeBase[task.stat] >= task.target) {
      claims.push(task.id); crates++;
    }
  }
  return { ...profile, crates, challengeClaims: claims };
}

export type CratePrize = { kind: "skin"; id: string } | { kind: "haircut"; id: string } | { kind: "outfit"; id: string };

/**
 * How often a crate rolls each KIND of prize, before rarity is drawn inside it.
 *
 * Outfits get the largest single share, and that is a judgement rather than an accident: a finish
 * changes a gun the player is looking at, an outfit changes the person everyone ELSE is looking at,
 * which is the thing that gets talked about after a match. A kind whose pool is exhausted hands its
 * share to the others, so a player who owns every outfit never rolls a dud.
 */
export const CRATE_ODDS = { outfit: 0.38, haircut: 0.15, skin: 0.47 } as const;

/** Rarity weights, shared by outfits and finishes so one tier means one thing in both. */
const RARITY_WEIGHTS: Record<OutfitRarity, number> = { pospolity: 70, rzadki: 22, epicki: 6, legendarny: 1.7, zloty: 0.3 };

/** Draws a tier, then something in it the player does not already own. */
function rollByRarity<T extends { rarity: OutfitRarity }>(pool: readonly T[], rng: () => number): T | null {
  if (!pool.length) return null;
  const roll = rng() * 100;
  let cursor = 0;
  const tier = (Object.keys(RARITY_WEIGHTS) as OutfitRarity[]).find((r) => (cursor += RARITY_WEIGHTS[r]) >= roll) ?? "pospolity";
  // A tier with nothing left in it falls through to whatever the player is still missing, rather
  // than handing out a duplicate to satisfy the tier.
  const inTier = pool.filter((item) => item.rarity === tier);
  const from = inTier.length ? inTier : pool;
  return from[Math.floor(rng() * from.length)];
}

export function openCrate(now = Date.now()): { profile: Profile; prize: CratePrize } | null {
  const p = refreshDailyCrates(new Date(now)); if (p.crates < 1) return null;
  const rng = mulberry32(hashString(`${p.crateDay}:${now}:${p.skins.length}:${p.crateCuts.length}:${p.fits.length}`));
  const lockedFits = DROPPABLE_OUTFITS.filter((o) => !p.fits.includes(o.id));
  const lockedCuts = HAIRCUTS.filter(h => !h.id.startsWith("shave-") && h.id !== DEFAULT_HAIRCUT && !ownedCuts(p).some(o => o.id === h.id));

  // The kind first, then the tier inside it. Each kind's share is skipped when its pool is empty,
  // so the odds re-normalise onto what the player can still be given.
  const kinds = ([
    { kind: "outfit", share: CRATE_ODDS.outfit, empty: !lockedFits.length },
    { kind: "haircut", share: CRATE_ODDS.haircut, empty: !lockedCuts.length },
    { kind: "skin", share: CRATE_ODDS.skin, empty: false },
  ] as const).filter((k) => !k.empty);
  const total = kinds.reduce((sum, k) => sum + k.share, 0);
  let pick = rng() * total, chosen: CratePrize["kind"] = "skin";
  for (const k of kinds) { if ((pick -= k.share) <= 0) { chosen = k.kind; break; } }

  if (chosen === "outfit") {
    const outfit = rollByRarity(lockedFits, rng)!;
    const profile = { ...p, crates: p.crates - 1, fits: [...p.fits, outfit.id] };
    saveProfile(profile);
    return { profile, prize: { kind: "outfit", id: outfit.id } };
  }
  if (chosen === "haircut") {
    const cut = lockedCuts[Math.floor(rng() * lockedCuts.length)];
    const profile = { ...p, crates: p.crates - 1, crateCuts: [...p.crateCuts, cut.id] }; saveProfile(profile);
    return { profile, prize: { kind: "haircut", id: cut.id } };
  }
  const unowned = catalog.filter((skin) => !p.skins.some((i) => i.skin === skin.id));
  const skin = rollByRarity(unowned.length ? unowned : catalog, rng)!;
  const profile = { ...p, crates: p.crates - 1, skins: [...p.skins, { skin: skin.id, wear: rng() * .5, rolledAt: now }] }; saveProfile(profile);
  return { profile, prize: { kind: "skin", id: skin.id } };
}

/**
 * The six slice-4 finishes are the launch collection: until crates ship, hiding every recipe behind
 * an acquisition system that does not exist would leave a working renderer with no player path.
 * Existing instances are retained verbatim; only missing recipe ids are appended once.
 */
export function ensureStarterSkins(now = Date.now()): Profile {
  const profile = loadProfile();
  const owned = new Set(profile.skins.map((instance) => instance.skin));
  const starter = new Set(["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy"]);
  const missing = catalog.filter((skin) => starter.has(skin.id) && !owned.has(skin.id));
  if (!missing.length) return profile;
  const next = {
    ...profile,
    skins: [...profile.skins, ...missing.map((skin, index) => ({ skin: skin.id, wear: 0, rolledAt: now + index }))],
  };
  saveProfile(next);
  return next;
}

/** Factory finish is always available; ownership gates cosmetics only, never the weapon itself. */
export function equipSkin(weapon: WeaponId, id: string): string {
  const profile = loadProfile(); const skin = skinById(id);
  if (!WEAPON_ORDER.includes(weapon)) return "";
  if (id && (!skin || !fitsWeapon(skin, weapon) || !profile.skins.some(instance => instance.skin === id))) return profile.equip[weapon] ?? "";
  const equip = { ...profile.equip }; if (id) equip[weapon] = id; else delete equip[weapon];
  saveProfile({ ...profile, equip }); return id;
}
