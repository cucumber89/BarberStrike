import { GRENADES, type GrenadeId } from "./grenades";
import { WEAPONS, type WeaponId } from "./weapons";

/**
 * Weapon mastery (2.1): kills per weapon, in tiers.
 *
 * The second long-term loop next to levels. Levels reward playing at all; mastery rewards playing
 * EVERY weapon, which is what keeps a small group's evenings from collapsing into "rifle only" —
 * the shotgun nobody buys is suddenly worth carrying for a night. Like everything else in the
 * progression it is cosmetic: a tier is a name on the armoury page and a line on the summary,
 * never a stat.
 */

/** Anything that can be credited with a kill: a weapon, or a grenade (frag, molotov, knife, the launcher shell). */
export type MasteryKey = WeaponId | GrenadeId;

export interface MasteryTier {
  tier: number;
  name: string;
  /** Lifetime kills with the weapon needed to reach this tier. */
  kills: number;
  /** One-off XP paid the moment the tier is reached. */
  xp: number;
}

/**
 * Thresholds double-ish: the first tier comes inside one evening, the last takes a season. Names
 * are metals, not barber ranks — the level titles already own the joke, and two sets of jokes
 * on one summary screen read as noise.
 */
export const MASTERY_TIERS: readonly MasteryTier[] = [
  { tier: 0, name: "—", kills: 0, xp: 0 },
  { tier: 1, name: "BRĄZ", kills: 10, xp: 150 },
  { tier: 2, name: "SREBRO", kills: 30, xp: 300 },
  { tier: 3, name: "ZŁOTO", kills: 75, xp: 500 },
  { tier: 4, name: "PLATYNA", kills: 150, xp: 750 },
  { tier: 5, name: "DIAMENT", kills: 300, xp: 1000 },
];

export const MASTERY_MAX_TIER = MASTERY_TIERS[MASTERY_TIERS.length - 1].tier;

export interface MasteryState {
  tier: number;
  name: string;
  kills: number;
  /** Kills into the current tier and the size of the step to the next (0 / 0 at the top). */
  into: number;
  need: number;
  maxed: boolean;
}

/** Tier reached with `kills` lifetime kills, and the progress bar towards the next. */
export function masteryFor(kills: number): MasteryState {
  const k = Math.max(0, Math.floor(Number.isFinite(kills) ? kills : 0));
  let cur = MASTERY_TIERS[0];
  for (const t of MASTERY_TIERS) if (k >= t.kills) cur = t;
  const next = MASTERY_TIERS[cur.tier + 1];
  if (!next) return { tier: cur.tier, name: cur.name, kills: k, into: 0, need: 0, maxed: true };
  return { tier: cur.tier, name: cur.name, kills: k, into: k - cur.kills, need: next.kills - cur.kills, maxed: false };
}

/** Kills per weapon id. Sparse: a weapon never used is simply absent. */
export type WeaponKills = Partial<Record<string, number>>;

/** Adds one match's kills to a lifetime tally. Pure. */
export function addWeaponKills(life: WeaponKills, match: WeaponKills): WeaponKills {
  const out: WeaponKills = { ...life };
  for (const [id, n] of Object.entries(match)) {
    if (!n || !Number.isFinite(n) || n <= 0) continue;
    out[id] = (out[id] ?? 0) + Math.floor(n);
  }
  return out;
}

export interface MasteryUp { weapon: MasteryKey; name: string; tier: MasteryTier }

/**
 * Every tier crossed between two tallies, one entry per tier (a monster match that jumps two
 * tiers pays both — the summary lists both, the player earned both).
 */
export function masteryUps(before: WeaponKills, after: WeaponKills): MasteryUp[] {
  const ups: MasteryUp[] = [];
  for (const id of Object.keys(after)) {
    const a = masteryFor(before[id] ?? 0).tier;
    const b = masteryFor(after[id] ?? 0).tier;
    for (let t = a + 1; t <= b; t++) ups.push({ weapon: id as MasteryKey, name: masteryName(id), tier: MASTERY_TIERS[t] });
  }
  return ups;
}

/** Display name of anything a kill can be credited to. */
export function masteryName(id: string): string {
  if (id in WEAPONS) return WEAPONS[id as WeaponId].name;
  if (id in GRENADES) return GRENADES[id as GrenadeId].name;
  return id;
}

/** Lifetime total across every weapon — the armoury's "kills" header. */
export const totalWeaponKills = (w: WeaponKills): number => Object.values(w).reduce<number>((n, k) => n + (k ?? 0), 0);
