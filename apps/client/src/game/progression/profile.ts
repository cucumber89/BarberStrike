import {
  BADGES, addMatch, addWeaponKills, advanceDaily, dayKey, emptyLifetime, levelFor, masteryUps, newBadges, titleFor, xpForMatch,
  type ChallengeDef, type DailyState, type GameMode, type LevelState, type LifetimeStats, type MasteryUp, type MatchStats, type WeaponKills, type XpLine,
} from "@frankibarber/shared";

/**
 * The local player profile: lifetime XP, badges, stats, weapon mastery and the day's challenges,
 * in localStorage.
 *
 * No accounts (a settled project decision), so there is nowhere else to put it. That has one honest
 * consequence worth stating rather than hiding: clearing site data resets it, and it does not follow
 * you to another browser. It buys the thing that matters instead — nobody has to sign up to play
 * with their friends on a Friday. The menu offers an export / import of the blob for anyone who
 * wants to carry it over.
 */

const KEY = "bs_profile_v1";

/** One finished match, as the profile page lists it. */
export interface RecentMatch {
  /** Wall-clock ms when it ended. */
  at: number;
  mode: GameMode;
  kills: number;
  deaths: number;
  assists: number;
  result: 1 | 0 | -1;
  xp: number;
}

export const RECENT_MAX = 12;

export interface Profile {
  xp: number;
  life: LifetimeStats;
  /** Ids of `BADGES`, in the order they were first earned. */
  badges: string[];
  /** 2.1: lifetime kills per weapon (mastery). */
  weapons: WeaponKills;
  /** 2.1: the day's challenge progress; null until the first match of the day. */
  daily: DailyState | null;
  /** 2.1: the last few matches, newest first. */
  recent: RecentMatch[];
}

export const emptyProfile = (): Profile => ({ xp: 0, life: emptyLifetime(), badges: [], weapons: {}, daily: null, recent: [] });

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
    return repairProfile(JSON.parse(raw));
  } catch {
    // A corrupt or unreadable profile is not worth a crash on the way into a match.
    return emptyProfile();
  }
}

/** Coerces an untrusted blob (storage, an import file) into a valid profile. */
export function repairProfile(input: unknown): Profile {
  const p = (input && typeof input === "object" ? input : {}) as Partial<Profile>;
  const life = { ...emptyLifetime(), ...(p.life && typeof p.life === "object" ? p.life : {}) };
  for (const k of Object.keys(life) as (keyof LifetimeStats)[]) {
    if (!Number.isFinite(life[k])) life[k] = 0;
    life[k] = Math.max(0, Math.floor(life[k]));
  }
  const known = new Set(BADGES.map((b) => b.id));
  const weapons: WeaponKills = {};
  if (p.weapons && typeof p.weapons === "object") {
    for (const [id, n] of Object.entries(p.weapons)) if (typeof n === "number" && Number.isFinite(n) && n > 0) weapons[id] = Math.floor(n);
  }
  let daily: DailyState | null = null;
  const d = p.daily;
  if (d && typeof d === "object" && typeof d.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) {
    const progress: Record<string, number> = {};
    if (d.progress && typeof d.progress === "object") {
      for (const [id, n] of Object.entries(d.progress)) if (typeof n === "number" && Number.isFinite(n)) progress[id] = Math.max(0, Math.floor(n));
    }
    daily = { day: d.day, progress, done: Array.isArray(d.done) ? d.done.filter((x): x is string => typeof x === "string") : [] };
  }
  const recent: RecentMatch[] = Array.isArray(p.recent)
    ? p.recent.filter((m): m is RecentMatch => !!m && typeof m === "object" && Number.isFinite((m as RecentMatch).at)).slice(0, RECENT_MAX)
    : [];
  return {
    xp: Number.isFinite(p.xp) ? Math.max(0, Math.floor(p.xp as number)) : 0,
    life,
    badges: Array.isArray(p.badges) ? p.badges.filter((b): b is string => typeof b === "string" && known.has(b)) : [],
    weapons,
    daily,
    recent,
  };
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode, quota: play anyway */ }
}

/** Wipes the stored profile (the menu's "reset progress", after a confirmation). */
export function clearProfile(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
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
  /** 2.1: mastery tiers reached and daily challenges finished by this match. */
  mastery: MasteryUp[];
  challenges: ChallengeDef[];
}

/**
 * Applies one match to a profile and returns both the new profile and what to show.
 *
 * Pure in the profile it is given — it does not write. The caller saves, so a summary can be
 * computed and rendered without committing anything, and the test does not need storage.
 *
 * `clipperKills` is kept as its own argument for the badge that predates `weaponKills`; the two
 * agree whenever the tracker fills both.
 */
export function applyMatch(profile: Profile, stats: MatchStats, clipperKills: number, weaponKills: WeaponKills = {}, day: string = dayKey(), now: number = Date.now()): { profile: Profile; reward: MatchReward } {
  const base = xpForMatch(stats);
  const lines = [...base.lines];
  const before = levelFor(profile.xp);
  const life = addMatch(profile.life, stats, clipperKills);
  const earned = newBadges(profile.life, life);
  const weapons = addWeaponKills(profile.weapons, weaponKills);
  const mastery = masteryUps(profile.weapons, weapons);
  for (const up of mastery) lines.push({ label: `${up.name} · ${up.tier.name}`, xp: up.tier.xp });
  const daily = advanceDaily(profile.daily, day, stats, weaponKills);
  for (const c of daily.completed) lines.push({ label: `Wyzwanie: ${c.text}`, xp: c.xp });
  const total = lines.reduce((n, l) => n + l.xp, 0);
  const xp = profile.xp + total;
  const after = levelFor(xp);
  const recent: RecentMatch[] = [
    { at: now, mode: stats.mode, kills: stats.kills, deaths: stats.deaths, assists: stats.assists, result: stats.result, xp: total },
    ...profile.recent,
  ].slice(0, RECENT_MAX);
  return {
    profile: { xp, life, badges: [...profile.badges, ...earned.filter((b) => !profile.badges.includes(b))], weapons, daily: daily.state, recent },
    reward: { lines, total, before, after, levelsGained: after.level - before.level, earned, title: titleFor(after.level), mastery, challenges: daily.completed },
  };
}
