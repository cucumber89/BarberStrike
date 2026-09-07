import type { GameMode } from "./types";

/**
 * Progression (2.0): experience, levels, titles and badges.
 *
 * DELIBERATELY COSMETIC. The owner's call, and the right one for a game played by a few friends in
 * an evening: every weapon is available at level 1 and always will be. Nothing here changes what a
 * player can bring to a fight — a newcomer who joins on Friday is not weaker than the people who
 * played on Thursday, which is the one thing that actually spoils a session in a small group.
 * Levels buy a number, a title and badges to show off.
 *
 * IT LIVES ON THE CLIENT. There are no accounts (a settled project decision), so the profile is
 * localStorage and the maths runs where it is read. That makes it trivially forgeable and the
 * threat model is "a player lies to themselves", which is not a threat. The rules are HERE rather
 * than in the client so they can be unit-tested without a browser, and so a server-side or synced
 * profile later reuses the same numbers instead of inventing a second set.
 */

/** What one match is worth. Tuned so a normal seven-minute match is roughly a level early on. */
export const XP = {
  kill: 100,
  /** On top of the kill: aiming is the skill worth paying for. */
  headshot: 50,
  assist: 50,
  /** Domination capture. */
  capture: 150,
  /** Surviving a whole wave, i.e. still alive when the preparation window opens (2.0 drop 7). */
  waveSurvived: 25,
  /** Finishing the match at all, win or lose: showing up is worth something. */
  played: 100,
  win: 500,
  /** A draw pays half a win; losing pays nothing extra. */
  draw: 250,
} as const;

/** One match, as the client counted it. */
export interface MatchStats {
  kills: number;
  headshots: number;
  assists: number;
  deaths: number;
  captures: number;
  wavesSurvived: number;
  /** 1 win, 0 draw, -1 loss. */
  result: 1 | 0 | -1;
  mode: GameMode;
}

export interface XpLine { label: string; xp: number }

/**
 * The XP a match is worth, broken into the lines the summary screen shows.
 *
 * Returns the lines rather than just a total because the screen has to explain itself: "+1400" tells
 * a player nothing, "8 kills, 3 headshots, a win" tells them what to do more of.
 */
export function xpForMatch(s: MatchStats): { lines: XpLine[]; total: number } {
  const lines: XpLine[] = [];
  const add = (label: string, xp: number): void => { if (xp > 0) lines.push({ label, xp }); };
  add(`Zabójstwa ×${s.kills}`, s.kills * XP.kill);
  add(`Trafienia w głowę ×${s.headshots}`, s.headshots * XP.headshot);
  add(`Asysty ×${s.assists}`, s.assists * XP.assist);
  add(`Przejęcia ×${s.captures}`, s.captures * XP.capture);
  add(`Przetrwane fale ×${s.wavesSurvived}`, s.wavesSurvived * XP.waveSurvived);
  add("Rozegrany mecz", XP.played);
  if (s.result === 1) add("Wygrana", XP.win);
  else if (s.result === 0) add("Remis", XP.draw);
  return { lines, total: lines.reduce((n, l) => n + l.xp, 0) };
}

/**
 * XP needed to go from `level` to the next one.
 *
 * Linear growth, not exponential: the point is a steady drip of small rewards over the handful of
 * evenings this will actually be played, not a curve that makes level 20 unreachable. Level 1 → 2
 * costs 1 000 (about one good match), and each level after that costs 250 more.
 */
export const xpToNext = (level: number): number => 1000 + 250 * (Math.max(1, level) - 1);

export interface LevelState { level: number; into: number; need: number; total: number }

/** Level, progress into it, and what the next one costs, from a lifetime XP total. */
export function levelFor(totalXp: number): LevelState {
  let level = 1;
  let left = Math.max(0, Math.floor(totalXp));
  for (;;) {
    const need = xpToNext(level);
    if (left < need || level >= MAX_LEVEL) return { level, into: left, need, total: Math.max(0, Math.floor(totalXp)) };
    left -= need;
    level += 1;
  }
}

/** A ceiling, so the bar always means something and the loop above always ends. */
export const MAX_LEVEL = 50;

/**
 * The title shown next to a level. Barber-shop ranks, because that is the joke the game is built
 * on; they change rarely enough that reaching one is worth noticing.
 */
export const TITLES: readonly { from: number; name: string }[] = [
  { from: 1, name: "PRAKTYKANT" },
  { from: 5, name: "GOLIBRODA" },
  { from: 10, name: "FRYZJER" },
  { from: 16, name: "STYLISTA" },
  { from: 23, name: "MISTRZ NOŻYC" },
  { from: 31, name: "BARBER" },
  { from: 40, name: "LEGENDA ZAKŁADU" },
];

export const titleFor = (level: number): string => {
  let name = TITLES[0].name;
  for (const t of TITLES) if (level >= t.from) name = t.name;
  return name;
};

/** Everything the profile counts over a lifetime, for badges. */
export interface LifetimeStats {
  matches: number;
  wins: number;
  kills: number;
  headshots: number;
  assists: number;
  deaths: number;
  captures: number;
  clipperKills: number;
  /** Matches finished without dying once. */
  flawless: number;
  bestKills: number;
  wavesSurvived: number;
}

export const emptyLifetime = (): LifetimeStats => ({
  matches: 0, wins: 0, kills: 0, headshots: 0, assists: 0, deaths: 0,
  captures: 0, clipperKills: 0, flawless: 0, bestKills: 0, wavesSurvived: 0,
});

export interface BadgeDef {
  id: string;
  name: string;
  blurb: string;
  /** Earned when this returns true. Pure, so the whole set can be re-evaluated on any change. */
  earned: (s: LifetimeStats) => boolean;
}

/**
 * Badges. Each one names a thing a player did, not a thing they were given for turning up: the
 * point of a cosmetic-only progression is that the cosmetics have to MEAN something.
 */
export const BADGES: readonly BadgeDef[] = [
  { id: "first-blood", name: "PIERWSZA KREW", blurb: "Pierwsze zabójstwo", earned: (s) => s.kills >= 1 },
  { id: "kills-100", name: "SETKA", blurb: "100 zabójstw", earned: (s) => s.kills >= 100 },
  { id: "kills-500", name: "MASZYNKA", blurb: "500 zabójstw", earned: (s) => s.kills >= 500 },
  { id: "hs-25", name: "CELNE OKO", blurb: "25 trafień w głowę", earned: (s) => s.headshots >= 25 },
  { id: "hs-100", name: "NA JEDNO CIĘCIE", blurb: "100 trafień w głowę", earned: (s) => s.headshots >= 100 },
  { id: "clippers-10", name: "NA SUCHO", blurb: "10 zabójstw maszynką", earned: (s) => s.clipperKills >= 10 },
  { id: "assists-50", name: "DRUGA PARA RĄK", blurb: "50 asyst", earned: (s) => s.assists >= 50 },
  { id: "caps-25", name: "GOSPODARZ", blurb: "25 przejętych punktów", earned: (s) => s.captures >= 25 },
  { id: "flawless", name: "BEZ DRAŚNIĘCIA", blurb: "Mecz bez śmierci", earned: (s) => s.flawless >= 1 },
  { id: "wins-10", name: "STAŁY KLIENT", blurb: "10 wygranych", earned: (s) => s.wins >= 10 },
  { id: "best-15", name: "DOBRY WIECZÓR", blurb: "15 zabójstw w jednym meczu", earned: (s) => s.bestKills >= 15 },
  { id: "waves-100", name: "TWARDZIEL", blurb: "100 przetrwanych fal", earned: (s) => s.wavesSurvived >= 100 },
];

/** Adds one match to a lifetime total. Pure: the caller decides what to do with the result. */
export function addMatch(life: LifetimeStats, s: MatchStats, clipperKills: number): LifetimeStats {
  return {
    matches: life.matches + 1,
    wins: life.wins + (s.result === 1 ? 1 : 0),
    kills: life.kills + s.kills,
    headshots: life.headshots + s.headshots,
    assists: life.assists + s.assists,
    deaths: life.deaths + s.deaths,
    captures: life.captures + s.captures,
    clipperKills: life.clipperKills + clipperKills,
    flawless: life.flawless + (s.deaths === 0 && s.kills > 0 ? 1 : 0),
    bestKills: Math.max(life.bestKills, s.kills),
    wavesSurvived: life.wavesSurvived + s.wavesSurvived,
  };
}

/** Badge ids earned by `after` that were not earned by `before`. */
export function newBadges(before: LifetimeStats, after: LifetimeStats): string[] {
  return BADGES.filter((b) => b.earned(after) && !b.earned(before)).map((b) => b.id);
}
