import {
  BADGES, DEFAULT_HAIRCUT, addMatch, emptyLifetime, haircutDef, isHaircutId, levelFor,
  newBadges, newHaircuts, ownedHaircuts, titleFor, xpForMatch,
  type HaircutDef, type LevelState, type LifetimeStats, type MatchStats, type XpLine,
} from "@frankibarber/shared";

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
}

export const emptyProfile = (): Profile => ({ xp: 0, life: emptyLifetime(), badges: [], haircut: DEFAULT_HAIRCUT });

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
    return {
      xp: Number.isFinite(p.xp) ? Math.max(0, Math.floor(p.xp as number)) : 0,
      life,
      badges: Array.isArray(p.badges) ? p.badges.filter((b) => known.has(b)) : [],
      // An id from a build that had a haircut this one does not, or one the player has not earned
      // (a cleared profile, an edited blob), falls back to the cap rather than to nothing.
      haircut: isHaircutId(p.haircut) && ownedHaircuts(life).some((h) => h.id === p.haircut) ? (p.haircut as string) : DEFAULT_HAIRCUT,
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
  return {
    profile: {
      xp, life,
      badges: [...profile.badges, ...earned.filter((b) => !profile.badges.includes(b))],
      haircut: profile.haircut,
    },
    reward: { lines, total, before, after, levelsGained: after.level - before.level, earned, haircuts, title: titleFor(after.level) },
  };
}

// ------------------------------------------------------------------ Drop E: the wardrobe

/** The haircuts this profile has earned, catalog order. Always at least the cap. */
export const ownedCuts = (p: Profile = loadProfile()): HaircutDef[] => ownedHaircuts(p.life);

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
