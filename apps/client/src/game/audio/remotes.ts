/**
 * Positional audio for other players: gunshots at the muzzle, footsteps derived from the
 * interpolated speed/grounded state (stride accumulator per remote), reload sequences from
 * the replicated `reloading` flag (RemotePlayer does not expose it; read from net state).
 */
import { WEAPONS, isWeaponId, type WeaponId } from "@frankibarber/shared";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameContext } from "../context";
import type { RemotePlayer } from "../player/RemotePlayer";
import { AudioEngine, Priority } from "./engine";
import { footstep, gunshot, reload } from "./sfx";

/** Roll-off (inverse model, refDistance 1): gunshots carry ~40 m, footsteps die by ~12 m. */
export const ROLLOFF = { gunshot: 0.32, footstep: 2.4, reload: 2.8 } as const;
export const HEAR = { footstep: 14, reload: 9, gunshotDistant: 22 } as const;

interface Track { stride: number; reloading: boolean; }

const scratch = new Vector3();

export class RemoteAudio {
  private tracks = new Map<string, Track>();

  constructor(private ctx: GameContext, private engine: AudioEngine) {}

  shot(player: RemotePlayer | null, weapon: WeaponId, origin: [number, number, number]): void {
    let x = origin[0], y = origin[1], z = origin[2];
    if (player) { player.muzzle(scratch); x = scratch.x; y = scratch.y; z = scratch.z; }
    const d = this.engine.distanceToListener(x, y, z);
    this.engine.play(gunshot(weapon, d > HEAR.gunshotDistant), {
      position: { x, y, z }, rolloff: ROLLOFF.gunshot, priority: Priority.gunshot, gain: 1.15,
    });
  }

  forget(id: string): void { this.tracks.delete(id); }

  /** Per frame: derive footsteps and reload starts for every remote. */
  update(dtMs: number): void {
    const players = this.ctx.connection.state.players;
    for (const r of this.ctx.remotes.values()) {
      let tr = this.tracks.get(r.id);
      if (!tr) { tr = { stride: 0, reloading: false }; this.tracks.set(r.id, tr); }
      if (!r.alive) { tr.stride = 0; tr.reloading = false; continue; }
      const speed = r.speed;
      if (r.grounded && speed > 1.0) {
        const stride = r.crouch ? 0.55 : speed > 6 ? 0.78 : 0.68;
        tr.stride += speed * (dtMs / 1000);
        if (tr.stride >= stride) {
          tr.stride -= stride;
          this.engine.play(footstep(speed > 6, r.crouch, true), {
            position: { x: r.x, y: r.y + 0.1, z: r.z }, rolloff: ROLLOFF.footstep, priority: Priority.movement,
            maxDistance: HEAR.footstep, gain: 0.8,
          });
        }
      } else {
        tr.stride = Math.min(tr.stride, 0.3);
      }
      const np = players.get(r.id);
      const reloading = !!np?.reloading;
      if (reloading && !tr.reloading) {
        const w = np && isWeaponId(np.weapon) ? np.weapon : "rifle";
        this.engine.play(reload(w, WEAPONS[w].reloadMs), {
          position: { x: r.x, y: r.y + 1.3, z: r.z }, rolloff: ROLLOFF.reload, priority: Priority.reload,
          maxDistance: HEAR.reload, gain: 0.7,
        });
      }
      tr.reloading = reloading;
    }
    if (this.tracks.size > this.ctx.remotes.size + 8) {
      for (const id of this.tracks.keys()) if (!this.ctx.remotes.has(id)) this.tracks.delete(id);
    }
  }
}
