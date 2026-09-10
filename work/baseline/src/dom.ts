import type { Flag } from "./map";
import type { Team } from "./types";

/**
 * Domination (drop 4): three flags, capture by standing in the zone, points tick for every flag
 * held. Pure rules — the room feeds it occupant counts per tick and reacts to the result.
 *
 * Numbers: a lone capturer needs `captureMs`; each extra capturer (up to `maxCapturers`) adds
 * `extraCapturerBonus` of the base rate. Progress is frozen while both teams stand in the zone,
 * bleeds off when the zone empties and bleeds off twice as fast while the owning team holds it.
 */
export const DOM = {
  captureMs: 6000,
  tickMs: 3000,
  pointsPerTick: 1,
  scoreLimit: 100,
  radius: 3.5,
  /** Vertical tolerance for "in the zone" (a mezzanine above the flag does not count). */
  heightTolerance: 2.2,
  extraCapturerBonus: 0.5,
  maxCapturers: 3,
  /** Wallet reward per capturer on a capture. */
  captureReward: 150,
  /** Personal score per capturer on a capture. */
  captureScore: 50,
} as const;

export interface FlagSim {
  /** Owning team or -1 (neutral). */
  owner: Team | -1;
  /** Team whose capture is in progress, -1 if none. */
  capTeam: Team | -1;
  /** Capture progress 0..1 for `capTeam`. */
  cap: number;
}

export const neutralFlag = (): FlagSim => ({ owner: -1, capTeam: -1, cap: 0 });

/** Whether a body at (x, y, z) stands inside the flag's zone. */
export function inFlagZone(f: Flag, x: number, y: number, z: number): boolean {
  return Math.abs(y - f.y) <= DOM.heightTolerance && Math.hypot(x - f.x, z - f.z) <= DOM.radius;
}

/**
 * Advances one flag by `dtMs` given the alive occupants of each team.
 * Returns the team that completed a capture this step, or -1.
 */
export function stepFlag(f: FlagSim, n0: number, n1: number, dtMs: number): Team | -1 {
  const rate = dtMs / DOM.captureMs;
  if (n0 > 0 && n1 > 0) return -1; // contested: nothing moves
  const team: Team | -1 = n0 > 0 ? 0 : n1 > 0 ? 1 : -1;
  const bleed = (k: number) => { f.cap = Math.max(0, f.cap - rate * k); if (f.cap === 0) f.capTeam = -1; };
  if (team === -1) { bleed(1); return -1; }
  if (team === f.owner) { bleed(2); return -1; }
  const n = team === 0 ? n0 : n1;
  const speed = 1 + Math.min(DOM.maxCapturers - 1, n - 1) * DOM.extraCapturerBonus;
  // A different attacker starts from scratch (two-team game: this only happens on a neutral flag).
  if (f.capTeam !== team) { f.capTeam = team; f.cap = 0; }
  f.cap = Math.min(1, f.cap + rate * speed);
  // Fixed-step sums never land on exactly 1.0; a hair of tolerance keeps the capture at captureMs.
  if (f.cap >= 1 - 1e-6) { f.owner = team; f.capTeam = -1; f.cap = 0; return team; }
  return -1;
}

/** Points each team earns on a score tick: one per flag held. */
export function domTick(flags: readonly FlagSim[]): [number, number] {
  let a = 0, b = 0;
  for (const f of flags) { if (f.owner === 0) a += DOM.pointsPerTick; else if (f.owner === 1) b += DOM.pointsPerTick; }
  return [a, b];
}

/** Capture state a HUD can read at a glance. */
export type FlagStatus = "neutral" | "owned" | "capturing" | "contested";
export function flagStatus(f: FlagSim, contested: boolean): FlagStatus {
  if (contested) return "contested";
  if (f.capTeam !== -1 && f.cap > 0) return "capturing";
  return f.owner === -1 ? "neutral" : "owned";
}
