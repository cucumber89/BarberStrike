import type { Team } from "./types";
import { TEAM_NAMES, TEAM_COLORS } from "./constants";

/**
 * Who is on which side, and when a player may change that.
 *
 * The rules live here, pure and shared, for one reason: the client greys out a side using exactly
 * the rule the server will enforce, so the picker never offers a switch that then bounces. The
 * server is still the only thing that writes `PlayerState.team`.
 */

export interface TeamMember {
  team: Team;
  /** A disconnected player still occupies a slot for a few seconds; they must not be counted. */
  connected: boolean;
  bot: boolean;
}

export interface TeamSizes {
  /** Humans per side — the number the balance rule cares about. */
  humans: [number, number];
  /** Everyone, bots included: what the picker shows, because a bot is a body in the round. */
  total: [number, number];
}

export function teamSizes(members: readonly TeamMember[]): TeamSizes {
  const humans: [number, number] = [0, 0];
  const total: [number, number] = [0, 0];
  for (const m of members) {
    if (!m.connected) continue;
    total[m.team]++;
    if (!m.bot) humans[m.team]++;
  }
  return { humans, total };
}

/**
 * Assign the smaller side; ties go to team 0.
 *
 * Counts bodies, not humans — a room filled with bots has to split them evenly, and the balance
 * rule below reads the same number. Disconnected players do NOT hold a seat: counting ghosts used
 * to send the next joiner to the side that was about to be short.
 */
export function teamForNewPlayer(members: readonly TeamMember[]): Team {
  const { total } = teamSizes(members);
  return total[0] <= total[1] ? 0 : 1;
}

export type SwitchRefusal = "same" | "mode" | "balance" | "cooldown" | "ended";

export interface SwitchVerdict {
  ok: boolean;
  reason?: SwitchRefusal;
  /** True when the switch is accepted but only takes effect at the next round. */
  deferred?: boolean;
}

/** How long a player must stay put after switching, so sides cannot be flipped every few seconds. */
export const TEAM_SWITCH_COOLDOWN_MS = 15_000;

export interface SwitchContext {
  /** The modes that have sides at all. FFA has none, so there is nothing to switch. */
  teamsMode: boolean;
  /** Bomb swaps attack/defend at halftime; changing sides mid-match breaks that bookkeeping. */
  roundBased: boolean;
  /** True while nobody is playing yet — a switch can then apply at once. */
  frozen: boolean;
  matchEnded: boolean;
  now: number;
  lastSwitchAt: number;
}

/**
 * May this player move from `from` to `to`, and does it happen now or next round?
 *
 * Balance rule: a switch may never leave the destination side more than one body ahead of the one
 * being left. 3v3 → 2v4 is refused; 3v1 → 2v2 is not.
 *
 * The count is TOTAL bodies, bots included — deliberately the same number the picker puts on
 * screen. A rule that runs on a hidden human-only count would grey out a side for reasons the
 * player cannot see, and a bot on the other side is still someone shooting at you.
 */
export function canSwitchTeam(from: Team, to: Team, sizes: TeamSizes, ctx: SwitchContext): SwitchVerdict {
  if (from === to) return { ok: false, reason: "same" };
  if (!ctx.teamsMode) return { ok: false, reason: "mode" };
  if (ctx.matchEnded) return { ok: false, reason: "ended" };
  if (ctx.now - ctx.lastSwitchAt < TEAM_SWITCH_COOLDOWN_MS) return { ok: false, reason: "cooldown" };
  const after: [number, number] = [...sizes.total] as [number, number];
  after[from]--; after[to]++;
  if (after[to] > after[from] + 1) return { ok: false, reason: "balance" };
  // Bomb's sides carry an attack/defend role that flips at halftime, and a live wave switch hands
  // the enemy a free kill and a free spawn. Both mean: accepted, but it lands at the next round.
  return { ok: true, deferred: ctx.roundBased && !ctx.frozen };
}

export const teamName = (t: Team): string => TEAM_NAMES[t];
export const teamColor = (t: Team): string => TEAM_COLORS[t];
