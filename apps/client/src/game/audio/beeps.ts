import { BOMB, MatchPhase } from "@frankibarber/shared";

/**
 * Drop U (P5): WHEN the match's beeps sound — a pure schedule, so it can be tested without an
 * audio context (docs/UI_U_SPEC.md §6.1, §6.4).
 *
 * The freeze beeps used to be `MATCH.prepMs − i·1000` after EVERY Prep, with the countdown's a
 * hard-coded 1/2/3 s: `prepMs` is a dead 5 s, so in a 15 s freeze the "go" beep landed about 11 s
 * before the release, and every round BREAK (also a Prep) counted down to a freeze that was not
 * the release at all. Now the beeps count down to the phase's own deadline (`endsAt`, which rides
 * on the match event), in the countdown and the freeze only.
 */

/** One beep: its server time, and whether it is the last, higher one. */
export interface Beep { at: number; final: boolean }

/** The last three seconds before the deadline, one a second; the last one is the "go". */
const LEADS_MS = [3000, 2000, 1000] as const;

/**
 * The beeps still to come for a phase that began with the match event `phase` (after `prevPhase`,
 * null when unknown) and ends at `endsAt` (server ms), as seen at `now`. A Prep that follows
 * Playing is a round BREAK — or turniej's pair card — and counts down to nothing: no beeps. Any
 * other Prep is a freeze, and the Countdown counts down to the match.
 */
export function beepTimes(phase: MatchPhase, prevPhase: MatchPhase | null, endsAt: number, now: number): Beep[] {
  if (!(endsAt > 0)) return [];
  const countsDown = phase === MatchPhase.Countdown || (phase === MatchPhase.Prep && prevPhase !== MatchPhase.Playing);
  if (!countsDown) return [];
  return LEADS_MS.map((lead, i) => ({ at: endsAt - lead, final: i === LEADS_MS.length - 1 })).filter((b) => b.at > now);
}

/** The planted bomb's beep, every this many ms at the start of the fuse and at its end (CS's C4). */
export const BOMB_BEEP_SLOWEST_MS = 1000;
export const BOMB_BEEP_FASTEST_MS = 150;

/**
 * How long until the next bomb beep with `fuseLeft` ms on the fuse: a straight line from 1000 ms at
 * the plant to 150 ms at the detonation (§6.1 "Bomb planted"), clamped outside the fuse.
 */
export function bombBeepInterval(fuseLeft: number): number {
  const f = Math.min(1, Math.max(0, fuseLeft / BOMB.fuseMs));
  return BOMB_BEEP_FASTEST_MS + (BOMB_BEEP_SLOWEST_MS - BOMB_BEEP_FASTEST_MS) * f;
}
