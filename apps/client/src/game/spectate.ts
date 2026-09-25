import { MatchPhase, parseBracket, type GameMode, type Team } from "@frankibarber/shared";

/**
 * Drop U (P1): WHOM A DEAD PLAYER WATCHES, as CS2 answers it (docs/UI_U_SPEC.md §7 P1 (h), §6.1).
 *
 * Pure: the game feeds it the roster it already has and the clock, and gets back an id (or null).
 * The camera, the hidden body and the spectate bar all follow that one answer, so the bar can never
 * name somebody the camera is not looking through.
 *
 * - Teammates first, and only living, connected ones. Enemies only once my whole side is down
 *   (the 1 v 1 is that case from the first death: my side is me).
 * - In a tournament, only the two players of the pair on the board: the bystanders are dead
 *   bodies on both teams and are nobody's view.
 * - When the player I watch dies, the view HOLDS on the body for `TARGET_HOLD_MS`, then moves on —
 *   the kill is the moment worth seeing, a cut on the frame of it hides it.
 * - With nobody left the answer is null, and the bar says so.
 */

/** Round modes: one life a round, so the dead watch. Turniej is a duel everywhere. */
export const SPECTATE_MODES: ReadonlySet<GameMode> = new Set<GameMode>(["bomb", "duel", "turniej", "ostrzyzeni"]);

/** The death card appears this long after the death (the death cam gets the first beat alone). */
export const CARD_IN_MS = 300;
/** …and, in the round modes, collapses into the spectate bar this long after it (it holds 5000 ms). */
export const CARD_OUT_MS = 5300;
/**
 * The death's own beat (§6.1 "Death", 1000 ms): the vignette, the eye's fall and the turn to the
 * killer. Once the round is over there is no card to wait for, so the view moves on after it.
 */
export const DEATH_BEAT_MS = 1000;
/** How long the view stays on a spectated player who just died before it moves on. */
export const TARGET_HOLD_MS = 1000;
/** The black blink a cut hides in; the camera cuts at its middle. */
export const BLINK_MS = 120;

/** What `spectate` needs of a scoreboard row (`ScoreRow` fits). */
export interface SpectateRow { id: string; name: string; team: Team; alive: boolean; connected: boolean }

export interface SpectateCtx {
  myId: string;
  myTeam: Team;
  mode: GameMode;
  players: readonly SpectateRow[];
  /** The tournament bracket string (`HudState.bracket`); "" outside a tournament. */
  bracket: string;
}

/** The names of the pair on the board, or null (no bracket, or it is over). */
function pairOf(bracket: string): [string, string] | null {
  const b = parseBracket(bracket);
  const m = b?.matches[b.at];
  return m ? [m.a, m.b] : null;
}

/**
 * Everyone I may watch right now, in a stable order (by id, so LPM walks the same ring every time
 * and a re-sorted scoreboard does not shuffle it). Never me.
 */
export function candidates(ctx: SpectateCtx): SpectateRow[] {
  const byId = (list: SpectateRow[]) => list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let pool = ctx.players.filter((r) => r.alive && r.connected && r.id !== ctx.myId);
  if (ctx.mode === "turniej") {
    const pair = pairOf(ctx.bracket);
    pool = pair ? pool.filter((r) => pair.includes(r.name)) : [];
    // A bystander has no side in the pair: both of its players are fair to watch. A pair player
    // who is down watches the one opponent left — the duel's rule, below.
    const me = ctx.players.find((r) => r.id === ctx.myId);
    if (!pair || !me || !pair.includes(me.name)) return byId(pool);
  }
  const mates = pool.filter((r) => r.team === ctx.myTeam);
  return byId(mates.length ? mates : pool);
}

/**
 * LPM (`dir` 1) and PPM (`dir` −1): the next or previous player in the ring after `current`. A
 * current id that left the ring (died, left) starts from where it would have sorted.
 */
export function cycle(ctx: SpectateCtx, current: string | null, dir: 1 | -1): string | null {
  const ring = candidates(ctx);
  if (!ring.length) return null;
  if (!current) return ring[dir === 1 ? 0 : ring.length - 1].id;
  const at = ring.findIndex((r) => r.id === current);
  if (at >= 0) return ring[(at + dir + ring.length) % ring.length].id;
  // Not in the ring any more: the first id after it (LPM) or the last before it (PPM).
  const after = ring.findIndex((r) => r.id > current);
  if (dir === 1) return ring[after >= 0 ? after : 0].id;
  const before = (after >= 0 ? after : ring.length) - 1;
  return ring[(before + ring.length) % ring.length].id;
}

/** The spectator's memory between frames. */
export interface SpectateState {
  /** Whom the view follows; null = nobody (the bar reads „NIKOGO DO OBSERWOWANIA”). */
  targetId: string | null;
  /** Local time the target was seen dead (the hold starts), 0 while it lives. */
  lostAt: number;
}

export const NO_SPECTATE: SpectateState = Object.freeze({ targetId: null, lostAt: 0 });

/**
 * One step of the spectator: keep a living target; hold a dead one for `TARGET_HOLD_MS`, then move
 * to the next; pick one when there is none. Returns `s` itself when nothing changed.
 */
export function stepSpectate(s: SpectateState, ctx: SpectateCtx, now: number): SpectateState {
  const ring = candidates(ctx);
  if (s.targetId && ring.some((r) => r.id === s.targetId)) return s.lostAt ? { targetId: s.targetId, lostAt: 0 } : s;
  if (s.targetId) {
    // The target is down: hold on the body, then move on. One who left is not held.
    const row = ctx.players.find((r) => r.id === s.targetId);
    const body = !!row && row.connected;
    if (body && !s.lostAt) return { targetId: s.targetId, lostAt: now };
    if (body && now - s.lostAt < TARGET_HOLD_MS) return s;
    return { targetId: cycle(ctx, s.targetId, 1), lostAt: 0 };
  }
  const first = ring[0]?.id ?? null;
  return first ? { targetId: first, lostAt: 0 } : s;
}

/**
 * Does a dead player watch somebody right now? In a round mode, once the killer card has had its
 * beat (or at once, with no card to show: a late join, a tournament bystander), while the round is
 * being played or frozen. In the round's break the card is gone (§4.5), so only the death's own
 * beat is waited for — the 1 v 1's break is shorter than the card would have been. A respawn on a
 * timer never spectates: the card counts down instead.
 */
export function spectating(o: {
  mode: GameMode; phase: MatchPhase; alive: boolean; respawnAt: number; diedAt: number; now: number; noCard: boolean;
  /** The round is over and its break is on (`Prep` with the round's reason up). */
  inBreak?: boolean;
}): boolean {
  if (o.alive || !SPECTATE_MODES.has(o.mode) || o.respawnAt > 0) return false;
  if (o.phase !== MatchPhase.Playing && o.phase !== MatchPhase.Prep) return false;
  return o.noCard || o.now - o.diedAt >= (o.inBreak ? DEATH_BEAT_MS : CARD_OUT_MS);
}
