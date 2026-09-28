/**
 * How the world between a sound and the ear changes it (owner, 2026-09-28: a new sound mechanic).
 *
 * Four physical effects, each cheap and each something a player can USE:
 *
 * - **Air absorption.** High frequencies die first over distance, so a rifle 40 m away is a dull
 *   thud and one 5 m away is a crack. Before this every distance got the same bright voice, only
 *   quieter — which is why range was hard to judge by ear.
 * - **Occlusion.** A ray from the ear to the source: a wall in between muffles and lowers the sound
 *   instead of letting it through untouched. "He is behind that wall" and "he is in the open" now
 *   sound different, so footsteps upstairs through a slab read as upstairs.
 * - **Travel time.** Sound moves at 343 m/s: at 30 m the report lands 90 ms after the flash. Tiny
 *   up close, unmistakable across a street — the gap is itself a range cue.
 * - **The room.** A few rays around the listener measure how enclosed they are; a tiled barber shop
 *   rings, an open yard barely answers. The reverb's level and tone follow, so the same gunshot
 *   sounds like the place it was fired in.
 *
 * The pure functions are tested (`acoustics.test.ts`); `Acoustics` wraps them around the world.
 */
import { makeRayHit, type CollisionWorld } from "@frankibarber/shared";

export const SPEED_OF_SOUND = 343;
/** Delays past this are capped: beyond it a shot is a distant rumble anyway, and a queue of late voices is a lie about now. */
const MAX_DELAY_S = 0.25;

/** Seconds for sound to cross `d` metres. Nothing under 3 m: that close, the gap is below perception and would only add latency. */
export function travelDelay(d: number): number {
  if (d < 3) return 0;
  return Math.min(MAX_DELAY_S, d / SPEED_OF_SOUND);
}

/**
 * Low-pass cutoff (Hz) for air absorption over `d` metres. 20 kHz (transparent) up close, falling
 * roughly exponentially — about 7 kHz at 25 m, 3 kHz at 60 m — and floored so a far shot is dull
 * but still a shot.
 */
export function airCutoff(d: number): number {
  return Math.max(1400, 20000 * Math.exp(-d / 24));
}

/** What a wall between the ear and the source does: through `walls` solids, this gain and low-pass. */
export function occlusion(walls: number): { gain: number; cutoff: number } {
  if (walls <= 0) return { gain: 1, cutoff: 20000 };
  // One wall: a muffled, still clearly present sound. Two or more: mostly the low end is left.
  return walls === 1 ? { gain: 0.55, cutoff: 1100 } : { gain: 0.32, cutoff: 600 };
}

export interface Heard { gain: number; lowpass: number; delay: number }

/** The combined filter for a sound `d` metres away behind `walls` walls. */
export function heard(d: number, walls: number): Heard {
  const o = occlusion(walls);
  return { gain: o.gain, lowpass: Math.min(o.cutoff, airCutoff(d)), delay: travelDelay(d) };
}

/**
 * Room character from the probe rays: `hits` of `rays` found a surface within `reach`, at a mean
 * distance `meanDist`, and `ceiling` says whether one was found overhead. Returns the reverb send
 * multiplier (1 = today's mix) and the reverb's low-pass (a small hard room is brighter and denser,
 * the open air darker and thinner).
 */
export function roomOf(hits: number, rays: number, meanDist: number, ceiling: boolean): { wet: number; tone: number } {
  const closed = rays > 0 ? hits / rays : 0;
  const enclosure = Math.min(1, closed * (ceiling ? 1 : 0.55));
  // Smaller rooms ring more densely; a hall with far walls is wetter but darker.
  const small = Math.max(0, Math.min(1, 1 - (meanDist - 2) / 14));
  const wet = 0.45 + 1.15 * enclosure;
  const tone = 1800 + 2200 * enclosure * (0.5 + 0.5 * small);
  return { wet, tone };
}

/** Probe directions: eight around the horizon plus straight up (unit vectors). */
const PROBES: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; out.push([Math.cos(a), 0.12, Math.sin(a)]); }
  return out.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as [number, number, number]; });
})();
const PROBE_REACH = 22;

/** Ties the pure rules to the collision world and the listener. */
export class Acoustics {
  private readonly hit = makeRayHit();
  private lx = 0; private ly = 0; private lz = 0;
  /** Smoothed room, so walking through a door blends the reverb instead of switching it. */
  wet = 1;
  tone = 2600;
  private probeAt = -Infinity;

  constructor(private readonly world: CollisionWorld) {}

  setListener(x: number, y: number, z: number): void { this.lx = x; this.ly = y; this.lz = z; }

  /**
   * Solids crossed on the straight line from the ear to (x, y, z), counted up to two. The source's
   * last 0.4 m is ignored so a player's own floor, or the wall a gun is pressed against, does not
   * muffle them.
   */
  wallsTo(x: number, y: number, z: number): number {
    let ox = this.lx, oy = this.ly, oz = this.lz;
    const dx = x - ox, dy = y - oy, dz = z - oz;
    let left = Math.hypot(dx, dy, dz) - 0.4;
    if (left <= 0.2) return 0;
    const inv = 1 / Math.hypot(dx, dy, dz);
    const ux = dx * inv, uy = dy * inv, uz = dz * inv;
    let walls = 0;
    while (walls < 2 && left > 0.05) {
      this.world.raycast(ox, oy, oz, ux, uy, uz, left, this.hit);
      if (!this.hit.hit) break;
      walls++;
      // Step through the solid: past the hit point by its thickness is unknown, so hop 0.35 m
      // (thicker than any interior wall on the maps) and look again.
      const hop = this.hit.t + 0.35;
      ox += ux * hop; oy += uy * hop; oz += uz * hop;
      left -= hop;
    }
    return walls;
  }

  /** Everything the world does to a sound at (x, y, z). */
  hear(x: number, y: number, z: number): Heard {
    const d = Math.hypot(x - this.lx, y - this.ly, z - this.lz);
    return heard(d, this.wallsTo(x, y, z));
  }

  /** Re-measures the room every `everyMs` and eases `wet` / `tone` towards it every frame. */
  probe(nowMs: number, dtMs: number, everyMs = 250): void {
    if (nowMs - this.probeAt >= everyMs) {
      this.probeAt = nowMs;
      let hits = 0, sum = 0;
      for (const [x, y, z] of PROBES) {
        this.world.raycast(this.lx, this.ly, this.lz, x, y, z, PROBE_REACH, this.hit);
        if (this.hit.hit) { hits++; sum += this.hit.t; }
      }
      this.world.raycast(this.lx, this.ly, this.lz, 0, 1, 0, 12, this.hit);
      const target = roomOf(hits, PROBES.length, hits ? sum / hits : PROBE_REACH, this.hit.hit);
      this.targetWet = target.wet; this.targetTone = target.tone;
    }
    const k = 1 - Math.exp(-dtMs / 400);
    this.wet += (this.targetWet - this.wet) * k;
    this.tone += (this.targetTone - this.tone) * k;
  }
  private targetWet = 1;
  private targetTone = 2600;
}
