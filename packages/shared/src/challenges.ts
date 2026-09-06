import { mulberry32 } from "./hitscan";
import type { MatchStats } from "./progression";
import type { WeaponKills } from "./mastery";

/**
 * Daily challenges (2.1): three goals a day, the same three for everyone, paid in XP.
 *
 * WHY DAILY, AND WHY THE SAME FOR EVERYONE. A goal that is only there today is a reason to open
 * the game today; a goal everyone shares is a reason to talk about it ("did you get the clipper
 * one?"). Both are what "engaging" means for a game a handful of friends play in the evening.
 *
 * DETERMINISTIC FROM THE DATE. There is no server-side account (settled decision), so the pick
 * has to be something every client can compute alone and agree on: a hash of the local calendar
 * day seeds the same PRNG everywhere. Friends in one time zone see the same set; the day rolls at
 * local midnight, which is what "today" means to a person.
 *
 * Counted from the same `MatchStats` the level XP is paid from, so nothing new is trusted.
 */

export interface ChallengeDef {
  id: string;
  /** What to do, in the player's words. */
  text: string;
  goal: number;
  xp: number;
  /** How much one finished match contributed. Pure. */
  count: (s: MatchStats, weaponKills: WeaponKills) => number;
}

const weapon = (id: string, text: string, goal: number, xp: number): ChallengeDef =>
  ({ id: `w-${id}-${goal}`, text, goal, xp, count: (_s, w) => w[id] ?? 0 });

/**
 * The pool. Goals are sized for one evening of two or three matches: a challenge that needs a
 * week is a chore, one that finishes in a single match is a coupon.
 */
export const CHALLENGE_POOL: readonly ChallengeDef[] = [
  { id: "kills-20", text: "Zdobądź 20 zabójstw", goal: 20, xp: 400, count: (s) => s.kills },
  { id: "kills-40", text: "Zdobądź 40 zabójstw", goal: 40, xp: 800, count: (s) => s.kills },
  { id: "hs-5", text: "Traf 5 razy w głowę", goal: 5, xp: 400, count: (s) => s.headshots },
  { id: "hs-12", text: "Traf 12 razy w głowę", goal: 12, xp: 800, count: (s) => s.headshots },
  { id: "assists-6", text: "Zalicz 6 asyst", goal: 6, xp: 350, count: (s) => s.assists },
  { id: "matches-2", text: "Rozegraj 2 mecze do końca", goal: 2, xp: 300, count: () => 1 },
  { id: "matches-4", text: "Rozegraj 4 mecze do końca", goal: 4, xp: 600, count: () => 1 },
  { id: "wins-1", text: "Wygraj mecz", goal: 1, xp: 500, count: (s) => (s.result === 1 ? 1 : 0) },
  { id: "wins-2", text: "Wygraj 2 mecze", goal: 2, xp: 900, count: (s) => (s.result === 1 ? 1 : 0) },
  { id: "caps-3", text: "Przejmij 3 punkty w Dominacji", goal: 3, xp: 450, count: (s) => s.captures },
  { id: "waves-8", text: "Przetrwaj 8 fal", goal: 8, xp: 400, count: (s) => s.wavesSurvived },
  { id: "dom-1", text: "Rozegraj mecz Dominacji", goal: 1, xp: 300, count: (s) => (s.mode === "dom" ? 1 : 0) },
  { id: "ffa-1", text: "Rozegraj mecz Free For All", goal: 1, xp: 300, count: (s) => (s.mode === "ffa" ? 1 : 0) },
  weapon("clippers", "Ogol 2 przeciwników maszynką", 2, 500),
  weapon("shotgun", "Zdobądź 5 zabójstw strzelbą", 5, 450),
  weapon("sniper", "Zdobądź 5 zabójstw snajperką", 5, 450),
  weapon("pistol", "Zdobądź 5 zabójstw pistoletem P9", 5, 450),
  weapon("revolver", "Zdobądź 4 zabójstwa rewolwerem", 4, 450),
  weapon("frag", "Zdobądź 3 zabójstwa granatem", 3, 450),
  weapon("knife", "Trafij 2 razy nożem do rzucania", 2, 500),
  weapon("launcher", "Zdobądź 3 zabójstwa granatnikiem", 3, 450),
  weapon("lmg", "Zdobądź 8 zabójstw z LMG", 8, 450),
  weapon("smg2", "Zdobądź 8 zabójstw z VZ-9", 8, 450),
  weapon("dmr", "Zdobądź 6 zabójstw z DMR", 6, 450),
];

export const DAILY_COUNT = 3;

/** Local calendar day as `YYYY-MM-DD`. Local, not UTC: "today" is the player's today. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** FNV-1a, so two days that differ in one digit do not seed neighbouring picks. */
function hashDay(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The day's three, distinct, and never two of the same family (two "kills" goals in one day is
 * one goal twice). Families are the part of the id before the first dash.
 */
export function dailyChallenges(day: string): ChallengeDef[] {
  const rand = mulberry32(hashDay(day));
  const pool = [...CHALLENGE_POOL];
  const out: ChallengeDef[] = [];
  const families = new Set<string>();
  // Shuffle, then walk it: a full permutation so the pick is independent of pool order changes
  // only in the way a seed change would be, and always terminates.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const c of pool) {
    const family = c.id.startsWith("w-") ? c.id.split("-")[1] : c.id.split("-")[0];
    if (families.has(family)) continue;
    families.add(family);
    out.push(c);
    if (out.length === DAILY_COUNT) break;
  }
  return out;
}

export interface DailyState {
  day: string;
  /** Progress per challenge id, capped at the goal. */
  progress: Record<string, number>;
  /** Ids finished today, in the order they were finished. */
  done: string[];
}

export const emptyDaily = (day: string): DailyState => ({ day, progress: {}, done: [] });

export interface DailyAdvance { state: DailyState; completed: ChallengeDef[] }

/**
 * Adds one finished match to the day. A state from another day is discarded first — yesterday's
 * half-finished goal is not carried over, that is what "daily" promises. Pure.
 */
export function advanceDaily(prev: DailyState | null | undefined, day: string, stats: MatchStats, weaponKills: WeaponKills): DailyAdvance {
  const state: DailyState = prev && prev.day === day
    ? { day, progress: { ...prev.progress }, done: [...prev.done] }
    : emptyDaily(day);
  const completed: ChallengeDef[] = [];
  for (const c of dailyChallenges(day)) {
    if (state.done.includes(c.id)) continue;
    const add = Math.max(0, Math.floor(c.count(stats, weaponKills)));
    const now = Math.min(c.goal, (state.progress[c.id] ?? 0) + add);
    state.progress[c.id] = now;
    if (now >= c.goal) { state.done.push(c.id); completed.push(c); }
  }
  return { state, completed };
}

/** Progress of one challenge in a day's state, for the menu. */
export function dailyProgress(state: DailyState | null | undefined, day: string, c: ChallengeDef): { have: number; done: boolean } {
  if (!state || state.day !== day) return { have: 0, done: false };
  return { have: Math.min(c.goal, state.progress[c.id] ?? 0), done: state.done.includes(c.id) };
}
