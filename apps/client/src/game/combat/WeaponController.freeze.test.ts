import { describe, expect, it } from "vitest";
import { WEAPONS } from "@frankibarber/shared";
import { WeaponController } from "./WeaponController";
import type { Connection, NetPlayer } from "../net/Connection";
import type { LocalPlayer } from "../player/LocalPlayer";

/**
 * Drop 7: the gun obeys the frozen preparation window on the client too.
 *
 * The server refuses the shot regardless, so this looks cosmetic and is not: without it the client
 * plays the muzzle flash and the report, spends a round out of its own magazine and then resyncs —
 * a gunfight the player hears during a countdown in which nobody can be hurt.
 */
function rig() {
  const sent: string[] = [];
  const conn = { send: (type: string) => sent.push(type), serverNow: () => 0 } as unknown as Connection;
  const player = {
    alive: true, frozen: false, yaw: 0, pitch: 0, lastSeq: 1,
    eyePosition: (o: number[]) => { o[0] = 0; o[1] = 1.62; o[2] = 0; },
    aimDir: (d: number[]) => { d[0] = 0; d[1] = 0; d[2] = 1; },
    addRecoil: () => {}, isSprinting: () => false, isTacSprinting: () => false, isAiming: () => false, isCrouching: () => false, isMoving: () => false, isAirborne: () => false, aimBlend: 0,
  } as unknown as LocalPlayer;
  const w = new WeaponController(conn, player);
  w.syncFrom({ weapon: "rifle", owned: ["rifle"], ammo: 30, reserve: 90, reloading: false } as unknown as NetPlayer);
  const shots: string[] = [];
  w.onShot = (s) => shots.push(s.weapon);
  return { w, player, shots, sent };
}

/**
 * The controller compares its timers against `performance.now()`, so a test clock of literal
 * milliseconds is in the PAST once the suite has been running for a second — the equip timer never
 * elapses and nothing fires, which made this pass alone and fail in the full run. Start after the
 * real clock and the test measures the freeze rather than the ordering.
 */
const base = (): number => performance.now() + 10_000;

describe("WeaponController and the frozen preparation window", () => {
  it("does not fire, and does not spend a round, while frozen", () => {
    const { w, player, shots } = rig();
    const t0 = base();
    const ammo0 = w.ammo;
    (player as unknown as { frozen: boolean }).frozen = true;
    for (let t = t0; t < t0 + 1000; t += 16) w.update(t, 16, true);
    expect(shots).toEqual([]);
    expect(w.ammo).toBe(ammo0);
  });

  it("fires again the moment the wave is released", () => {
    const { w, player, shots } = rig();
    const t0 = base();
    (player as unknown as { frozen: boolean }).frozen = true;
    for (let t = t0; t < t0 + 200; t += 16) w.update(t, 16, true);
    expect(shots).toEqual([]);
    (player as unknown as { frozen: boolean }).frozen = false;
    for (let t = t0 + 200; t < t0 + 400; t += 16) w.update(t, 16, true);
    expect(shots.length).toBeGreaterThan(0);
    expect(w.ammo).toBeLessThan(WEAPONS.rifle.magazine);
  });
});
