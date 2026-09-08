import type { Solid } from "./map";

/**
 * THE LIVING ARENA — tactical plans.
 *
 * In selected rounds the attacking team picks one of two prepared changes to the map during the
 * buy window. The change is announced to both sides, lasts that round only, and reverts.
 *
 * WHY IT IS BUILT THE WAY IT IS. Four constraints shaped every decision here, and each one is a
 * "no" to something more exciting:
 *
 *  - **Server authority is untouched.** The plan table is a closed array on both ends and a client
 *    message carries only an INDEX into it — never geometry, never a name. Exactly the shape
 *    `C2S.Buy` already has.
 *  - **Prediction cannot diverge.** Client and server run this same pure filter over the same
 *    shared `NIGHT_DISTRICT.solids`, and both flip at the same server timestamp, so nobody plays
 *    half a round in a different world. Flipping on message arrival instead would give every
 *    player their own ping's worth of a different map.
 *  - **REMOVAL ONLY.** A plan can take a wall away; it cannot put one there. Adding geometry can
 *    close a player inside it and makes the bots' pre-baked walk grid actively WRONG rather than
 *    merely incomplete. Removing can do neither: the grid stays a subset of what is walkable, so
 *    a bot ignores the new route instead of walking into a new wall.
 *  - **No plan touches damage, health, money or speed.** Every one of them is a change to the
 *    SHAPE of the round. A plan that made you stronger would be a power-up, and a power-up
 *    decided by a vote is exactly the "random event that settles the match" the brief rules out.
 *
 * Every option cuts both ways, and that is the design rather than an oversight: a route you open
 * to attack through is a route you can be flanked through, and a perch you deny the defence is a
 * perch your own team no longer has.
 */

export interface TacticalPlan {
  /** 1-based; 0 means "no plan", which is also what a round with no votes gets. */
  id: number;
  name: string;
  /** What it does, in the words the HUD shows. */
  gain: string;
  /** What it costs — always something, and never a stat. */
  cost: string;
  /** Names in `NIGHT_DISTRICT.solids` this plan takes out of the world for one round. */
  removes: readonly string[];
  /** Roughly where it happens, so the announcement can point at it. */
  at: { x: number; z: number };
}

export const PLANS: readonly TacticalPlan[] = [
  {
    id: 1,
    name: "OPEN THE SHUTTER",
    gain: "The roller door on the neighbour unit's south wall goes up: a second way in off Main Street.",
    cost: "It is a doorway, not a one-way valve — the defence can come out of it too.",
    removes: ["roller_door"],
    at: { x: 12, z: 0 },
  },
  {
    id: 2,
    name: "BREAK THE ALLEY WALL",
    gain: "The middle span of the alley wall comes down: cross between alley and backlot anywhere.",
    cost: "That wall was waist-high cover. Crossing there is now done in the open.",
    removes: ["alley_wall_m"],
    at: { x: -14, z: 11 },
  },
  {
    id: 3,
    name: "PULL THE LOOKOUT STEPS",
    gain: "The ramp up to the yard lookout is gone: nobody holds that angle over the yard this round.",
    cost: "Nobody includes you. The perch is denied to both sides, not taken from one.",
    removes: Array.from({ length: 10 }, (_, i) => `lookout_step_${i}`),
    at: { x: -6, z: 29 },
  },
];

export const planById = (id: number): TacticalPlan | undefined => PLANS.find((p) => p.id === id);

/** How often a vote comes round. Every round would be a chore; never would be a gimmick. */
export const PLAN_EVERY = 3;

/**
 * The two plans on offer in a given round, or an empty list when this round has no vote.
 *
 * Derived from the round number alone, so client and server agree without replicating anything,
 * and both teams can see it coming — a surprise the defence cannot read is a random event.
 */
export function planOffer(round: number): number[] {
  if (round < 1 || round % PLAN_EVERY !== 2 % PLAN_EVERY) return [];
  const first = Math.floor((round - 2) / PLAN_EVERY) % PLANS.length;
  return [PLANS[first].id, PLANS[(first + 1) % PLANS.length].id];
}

/** True when this round offers a choice at all. */
export const planRound = (round: number): boolean => planOffer(round).length > 0;

/**
 * The winner of a vote. Most votes wins; a tie goes to the lower id so the result is a function of
 * the votes and nothing else (never a clock, never insertion order); no votes means no change.
 * Votes for something not on offer are discarded rather than trusted.
 */
export function tallyVotes(votes: readonly number[], offer: readonly number[]): number {
  if (!offer.length) return 0;
  const count = new Map<number, number>();
  for (const v of votes) if (offer.includes(v)) count.set(v, (count.get(v) ?? 0) + 1);
  let best = 0, bestN = 0;
  for (const id of [...offer].sort((a, b) => a - b)) {
    const n = count.get(id) ?? 0;
    if (n > bestN) { best = id; bestN = n; }
  }
  return bestN > 0 ? best : 0;
}

/**
 * The world with `planId` in force. Returns the SAME array when no plan is active, so the common
 * case allocates nothing and an identity check is a valid "did anything change".
 */
export function applyPlan(solids: readonly Solid[], planId: number): readonly Solid[] {
  const plan = planById(planId);
  if (!plan) return solids;
  const gone = new Set(plan.removes);
  return solids.filter((s) => !s.name || !gone.has(s.name));
}
