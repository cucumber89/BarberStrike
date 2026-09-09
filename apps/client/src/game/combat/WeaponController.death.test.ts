import { describe, expect, it } from "vitest";
import { WEAPONS, RESPAWN_DELAY_MS } from "@frankibarber/shared";
import { WeaponController } from "./WeaponController";
import type { Connection, NetPlayer } from "../net/Connection";
import type { LocalPlayer } from "../player/LocalPlayer";

/**
 * A reload the corpse was halfway through is not the next life's problem.
 *
 * Nothing used to clear it. `syncFrom` cancels a reload only when the server has also finished one
 * and we are within 150 ms of when we expected it — which is never true if the weapon's reload
 * outlasts the respawn timer. The MG-4's is 5 200 ms against `RESPAWN_DELAY_MS` 3 200, so a player
 * who died mid-reload came back with a gun that would not fire, would not reload, and blocked
 * grenades and inspect through `busy()`, for the two seconds until a timer from their previous life
 * ran out. No sound, no HUD state, nothing to explain it.
 */
function rig(weapon: "lmg" | "rifle") {
  const sent: string[] = [];
  const cleared: number[] = [];
  const conn = { send: (type: string) => sent.push(type), serverNow: () => 0 } as unknown as Connection;
  const player = {
    alive: true, frozen: false, yaw: 0, pitch: 0,
    eyePosition: (o: number[]) => { o[0] = 0; o[1] = 1.62; o[2] = 0; },
    aimDir: (d: number[]) => { d[0] = 0; d[1] = 0; d[2] = 1; },
    addRecoil: () => {}, isSprinting: () => false, isTacSprinting: () => false, isAiming: () => false,
    isCrouching: () => false, isMoving: () => false, isAirborne: () => false, aimBlend: 0,
    workAction: () => {}, clearWeaponState: () => { cleared.push(1); }, bipod: false,
  } as unknown as LocalPlayer;
  const w = new WeaponController(conn, player);
  w.syncFrom({ weapon, owned: [weapon], ammo: 10, reserve: 90, reloading: false } as unknown as NetPlayer);
  return { w, player, sent, cleared };
}

/** The controller's timers are `performance.now()` based, so a test clock has to start after it. */
const base = (): number => performance.now() + 10_000;

describe("dying mid-reload", () => {
  it("does not carry the reload into the next life", () => {
    const { w, player, cleared } = rig("lmg");
    const t = base();
    w.requestReload(t);
    expect(w.reloading).toBe(true);
    expect(WEAPONS.lmg.reloadMs).toBeGreaterThan(RESPAWN_DELAY_MS); // the case that made this a bug

    // Killed a moment into the reload.
    player.alive = false;
    w.cancel();
    expect(w.reloading).toBe(false);
    expect(cleared.length).toBeGreaterThan(0); // the gun's action / bipod dwell went too

    // Respawned before the old reload would have ended, with a full magazine from the server.
    player.alive = true;
    w.syncFrom({ weapon: "lmg", owned: ["lmg"], ammo: WEAPONS.lmg.magazine, reserve: 60, reloading: false } as unknown as NetPlayer);
    const after = t + RESPAWN_DELAY_MS;
    w.update(after, 16.7, false);
    expect(w.reloading, "still reloading on the new life").toBe(false);
    expect(w.busy(after), "the gun is busy for a reload nobody asked for").toBe(false);
  });

  it("fires on the new life at the moment the old reload would have finished", () => {
    // The specific symptom: the trigger did nothing until the dead man's timer expired.
    const { w, player } = rig("lmg");
    const t = base();
    w.requestReload(t);
    player.alive = false;
    w.cancel();
    player.alive = true;
    w.syncFrom({ weapon: "lmg", owned: ["lmg"], ammo: WEAPONS.lmg.magazine, reserve: 60, reloading: false } as unknown as NetPlayer);
    const shots: string[] = [];
    w.onShot = (s) => shots.push(s.weapon);
    // Past the equip animation of the respawn, well before the old 5 200 ms reload would have ended.
    let now = t + RESPAWN_DELAY_MS + WEAPONS.lmg.equipMs + 50;
    for (let i = 0; i < 3; i++) { w.update(now, 16.7, true); now += 40; }
    expect(shots.length).toBeGreaterThan(0);
  });

  it("does not complete a reload while the player is dead", () => {
    // The completion branch sits above the alive check, so before `cancel()` it ran on a corpse.
    const { w, player } = rig("rifle");
    const t = base();
    w.requestReload(t);
    player.alive = false;
    w.cancel();
    const ammoAtDeath = w.ammo, reserveAtDeath = w.reserve;
    w.update(t + WEAPONS.rifle.reloadMs + 100, 16.7, false);
    expect(w.ammo).toBe(ammoAtDeath);
    expect(w.reserve).toBe(reserveAtDeath);
  });
});
