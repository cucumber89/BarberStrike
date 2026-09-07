import {
  BADGES, addMatch, emptyLifetime, levelFor, newBadges, titleFor, xpForMatch,
  type LevelState, type LifetimeStats, type MatchStats, type XpLine,
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
}

export const emptyProfile = (): Profile => ({ xp: 0, life: emptyLifetime(), badges: [] });

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
  title: string;
}

/**
 * Applies one match to a profile and returns both the new profile and what to show.
 *
 * Pure in the profile it is given — it does not write. The caller saves, so a summary can be
 * computed and rendered without committing anything, and the test does not need storage.
 */
export function applyMatch(profile: Profile, stats: MatchStats, clipperKills: number): { profile: Profile; reward: MatchReward } {
  const { lines, total } = xpForMatch(stats);
  const before = levelFor(profile.xp);
  const life = addMatch(profile.life, stats, clipperKills);
  const earned = newBadges(profile.life, life);
  const xp = profile.xp + total;
  const after = levelFor(xp);
  return {
    profile: { xp, life, badges: [...profile.badges, ...earned.filter((b) => !profile.badges.includes(b))] },
    reward: { lines, total, before, after, levelsGained: after.level - before.level, earned, title: titleFor(after.level) },
  };
}
