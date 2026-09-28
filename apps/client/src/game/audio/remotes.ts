/**
 * Positional audio for other players: gunshots at the muzzle, footsteps derived from the
 * interpolated speed/grounded state (stride accumulator per remote), jumps and landings from the
 * interpolated height, reload sequences from the replicated `reloading` flag.
 *
 * 2026-09-28 (the sound mechanic): every one of those now goes through the world first — what the
 * remote is standing on (`surfaces.ts`) decides what a step, a jump and a landing sound like, and
 * the space between them and the ear (`acoustics.ts`) muffles them behind walls, dulls them with
 * distance and, for a gunshot across the map, delays them by their travel time.
 */
import { PLAYER, WEAPONS, isWeaponId, type WeaponId } from "@frankibarber/shared";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameContext } from "../context";
import type { RemotePlayer } from "../player/RemotePlayer";
import { AudioEngine, Priority, type PlayOptions } from "./engine";
import { gunshot, reload } from "./sfx";
import { gearOf, jumpOff, land, step, type Gait } from "./foley";
import type { Acoustics } from "./acoustics";
import type { SurfaceProbe } from "./surfaces";

/** Roll-off (inverse model, refDistance 1): gunshots carry ~40 m, footsteps die by ~12 m. */
export const ROLLOFF = { gunshot: 0.32, footstep: 2.4, reload: 2.8, body: 2.0 } as const;
export const HEAR = { footstep: 14, reload: 9, gunshotDistant: 22, body: 18 } as const;

interface Track {
  stride: number;
  reloading: boolean;
  /** Air state for jumps and landings: where the feet left the ground and the highest point since. */
  air: boolean;
  airMs: number;
  takeoffY: number;
  topY: number;
  jumped: boolean;
}

const scratch = new Vector3();
const G = Math.abs(PLAYER.gravity);

/** Air time below this is a stair or an interpolation wobble, not a jump worth a sound. */
const MIN_AIR_MS = 140;

export class RemoteAudio {
  private tracks = new Map<string, Track>();

  constructor(private ctx: GameContext, private engine: AudioEngine, private acoustics: Acoustics, private surfaces: SurfaceProbe) {}

  /** A voice at (x, y, z) through the world: occlusion, air absorption, travel time. */
  private at(x: number, y: number, z: number, base: PlayOptions, travel = false): PlayOptions {
    const h = this.acoustics.hear(x, y, z);
    return { ...base, position: { x, y, z }, gain: (base.gain ?? 1) * h.gain, lowpass: h.lowpass, delay: travel ? h.delay : 0 };
  }

  shot(player: RemotePlayer | null, weapon: WeaponId, origin: [number, number, number]): void {
    let x = origin[0], y = origin[1], z = origin[2];
    if (player) { player.muzzle(scratch); x = scratch.x; y = scratch.y; z = scratch.z; }
    const d = this.engine.distanceToListener(x, y, z);
    this.engine.play(gunshot(weapon, d > HEAR.gunshotDistant), this.at(x, y, z, { rolloff: ROLLOFF.gunshot, priority: Priority.gunshot, gain: 1.15 }, true));
  }

  forget(id: string): void { this.tracks.delete(id); }

  /** Per frame: derive footsteps, jumps, landings and reload starts for every remote. */
  update(dtMs: number): void {
    const players = this.ctx.connection.state.players;
    for (const r of this.ctx.remotes.values()) {
      let tr = this.tracks.get(r.id);
      if (!tr) { tr = { stride: 0, reloading: false, air: false, airMs: 0, takeoffY: r.y, topY: r.y, jumped: false }; this.tracks.set(r.id, tr); }
      if (!r.alive) { tr.stride = 0; tr.reloading = false; tr.air = false; continue; }
      const gear = gearOf(r.weapon);
      this.air(r, tr, dtMs, gear);
      const speed = r.speed;
      if (r.grounded && speed > 1.0) {
        const stride = r.crouch ? 0.55 : speed > 6 ? 0.78 : 0.68;
        tr.stride += speed * (dtMs / 1000);
        if (tr.stride >= stride) {
          tr.stride -= stride;
          const gait: Gait = r.crouch ? "crouch" : speed > 6 ? "sprint" : "walk";
          const surface = this.surfaces.under(r.x, r.y, r.z);
          if (this.engine.distanceToListener(r.x, r.y, r.z) <= HEAR.footstep) {
            this.engine.play(step(surface, gait, gear, true), this.at(r.x, r.y + 0.1, r.z, { rolloff: ROLLOFF.footstep, priority: Priority.movement, gain: 0.8 }));
          }
        }
      } else {
        tr.stride = Math.min(tr.stride, 0.3);
      }
      const np = players.get(r.id);
      const reloading = !!np?.reloading;
      if (reloading && !tr.reloading && this.engine.distanceToListener(r.x, r.y, r.z) <= HEAR.reload) {
        const w = np && isWeaponId(np.weapon) ? np.weapon : "rifle";
        this.engine.play(reload(w, WEAPONS[w].reloadMs), this.at(r.x, r.y + 1.3, r.z, { rolloff: ROLLOFF.reload, priority: Priority.reload, gain: 0.7 }));
      }
      tr.reloading = reloading;
    }
    if (this.tracks.size > this.ctx.remotes.size + 8) {
      for (const id of this.tracks.keys()) if (!this.ctx.remotes.has(id)) this.tracks.delete(id);
    }
  }

  /**
   * Jumps and landings from the interpolated body. A jump is heard once the body has actually
   * RISEN off the ground (walking off a ledge is not a push-off); a landing is sized by the height
   * fallen since the top of the arc, which is what the impact speed of a real drop is.
   */
  private air(r: RemotePlayer, tr: Track, dtMs: number, gear: number): void {
    if (!r.grounded) {
      if (!tr.air) { tr.air = true; tr.airMs = 0; tr.takeoffY = r.y; tr.topY = r.y; tr.jumped = false; }
      tr.airMs += dtMs;
      tr.topY = Math.max(tr.topY, r.y);
      if (!tr.jumped && tr.airMs < 250 && r.y > tr.takeoffY + 0.08) {
        tr.jumped = true;
        if (this.engine.distanceToListener(r.x, r.y, r.z) <= HEAR.body) {
          const surface = this.surfaces.under(r.x, tr.takeoffY, r.z);
          this.engine.play(jumpOff(surface, gear), this.at(r.x, tr.takeoffY + 0.1, r.z, { rolloff: ROLLOFF.body, priority: Priority.movement, gain: 0.6 }));
        }
      }
      return;
    }
    if (!tr.air) return;
    tr.air = false;
    if (tr.airMs < MIN_AIR_MS) return;
    const impact = Math.sqrt(2 * G * Math.max(0, tr.topY - r.y));
    if (impact < 2.5 || this.engine.distanceToListener(r.x, r.y, r.z) > HEAR.body) return;
    const surface = this.surfaces.under(r.x, r.y, r.z);
    this.engine.play(land(surface, impact, gear, true), this.at(r.x, r.y + 0.1, r.z, { rolloff: ROLLOFF.body, priority: Priority.movement, gain: 0.8 }));
  }
}
