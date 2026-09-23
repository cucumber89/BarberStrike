import type { WeaponId } from "./weapons";

/**
 * COUNTER-STRIKE'S ROUND AND ECONOMY, in one place, because two modes are built on them.
 *
 * Bomb has been CS-shaped since it shipped (1:55 rounds, a 40 s fuse, $800 to start, $3,250 for a
 * round, the loss ladder) and the 1 v 1 was rebuilt to match. They had those numbers separately,
 * in `BOMB` and in `DUEL`, which is how two modes that are supposed to feel like the same game
 * drift apart: the duel paid a kill by the weapon that made it while Bomb paid a flat $300, and
 * the duel opened a fifteen-second freeze while Bomb froze for thirty and shut its shop the
 * instant the round began.
 *
 * Anything here is "what CS does". A mode's own departures stay in that mode's own block —
 * `DUEL.economy.floor` is the one we have, and it is the owner's.
 */

/** The window: `mp_freezetime`, and `mp_buytime` counted from the start of the round. */
export const CS_ROUND = {
  /** Frozen at spawn, shop open. */
  freezeMs: 15000,
  /**
   * How much longer the shop stays open once the round is live. CS counts `mp_buytime` (20 s) from
   * the start of the round, and the freeze is the first 15 of those — so this is the remainder,
   * and it is why a CS player can fix a forgotten plate on the way out of spawn.
   */
  buyTailMs: 5000,
} as const;

export const CS_ECONOMY = {
  /** The pistol round, and the first round of every half. */
  start: 800,
  /** Nobody carries more than this. */
  max: 16000,
  /** Winning a round. */
  win: 3250,
  /** The loss ladder: the first loss, each further one in a row, and where it stops climbing. */
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  /** Planting the bomb pays the planter this, whoever ends up winning. */
  plant: 300,
  /** ...and if the attack loses a round it PLANTED in, the whole attacking side is paid this. */
  plantedLoss: 800,
} as const;

/** What the ladder pays after `losses` consecutive lost rounds (0 = this is the first). */
export const csLossBonus = (losses: number): number =>
  Math.min(CS_ECONOMY.lossMax, CS_ECONOMY.lossBase + CS_ECONOMY.lossStep * Math.max(0, losses));

/**
 * What a kill pays, by the weapon that made it — CS's table, mapped onto this roster: the clippers
 * are the knife, the shotguns are the shotguns, anything that fires like an SMG pays like one, the
 * sniper pays almost nothing, and everything else is the flat rifle award.
 *
 * It is the one piece of the economy a player feels while shooting rather than while buying: a
 * clippers kill is worth five rifle kills, which in a game whose melee weapon is a pair of
 * clippers is the joke landing twice.
 */
export const CS_KILL_REWARD: Partial<Record<WeaponId, number>> = {
  clippers: 1500,
  shotgun: 900,
  autoshotgun: 900,
  smg: 600,
  smg2: 600,
  machinepistol: 600,
  sniper: 100,
};
/** The flat award for everything not in the table (pistols, rifles, the launcher). */
export const CS_KILL_REWARD_DEFAULT = 300;
export const csKillReward = (weapon: string): number =>
  CS_KILL_REWARD[weapon as WeaponId] ?? CS_KILL_REWARD_DEFAULT;
