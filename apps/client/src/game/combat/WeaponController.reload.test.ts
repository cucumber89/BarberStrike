import { describe, expect, it } from "vitest";
import { C2S, WEAPONS } from "@frankibarber/shared";
import { WeaponController } from "./WeaponController";
import type { Connection, NetPlayer } from "../net/Connection";
import type { LocalPlayer } from "../player/LocalPlayer";

/**
 * Reload priority and interruption, as the player feels them:
 * - R during the draw is held and sent the moment the gun is up (it used to be dropped);
 * - a switch cancels the reload AND the held request;
 * - the player object mirrors the reload flag, which is what keeps the sights down during it;
 * - the reload event says what the hands will do: how many rounds, and whether the chamber was empty.
 */
function rig() {
  const sent: string[] = [];
  const reloads: { weapon: string; shells: number; empty: boolean }[] = [];
  const conn = { send: (type: string) => sent.push(type), serverNow: () => 0 } as unknown as Connection;
  const player = {
    alive: true, frozen: false, yaw: 0, pitch: 0, reloading: false, weapon: "rifle",
    eyePosition: (o: number[]) => { o[0] = 0; o[1] = 1.62; o[2] = 0; },
    aimDir: (d: number[]) => { d[0] = 0; d[1] = 0; d[2] = 1; },
    addRecoil: () => {}, isSprinting: () => false, isTacSprinting: () => false, isAiming: () => false,
    workAction: () => {}, clearWeaponState: () => {}, bipod: false,
    body: { vx: 0, vy: 0, vz: 0, grounded: true, crouching: false },
  } as unknown as LocalPlayer & { reloading: boolean };
  const w = new WeaponController(conn, player);
  w.onReload = (weapon, shells, empty) => reloads.push({ weapon, shells, empty });
  w.syncFrom({ weapon: "rifle", owned: ["pistol", "rifle"], ammo: 10, reserve: 90, reloading: false } as unknown as NetPlayer);
  return { w, player, sent, reloads };
}

const base = (): number => performance.now() + 10_000;

describe("reload priority", () => {
  it("holds an R pressed during the draw and sends it when the gun is up", () => {
    const { w, sent } = rig();
    const t = base();
    w.requestWeapon("pistol", t);
    w.syncFrom({ weapon: "pistol", owned: ["pistol", "rifle"], ammo: 4, reserve: 60, reloading: false } as unknown as NetPlayer);
    w.requestReload(t + 50);               // mid-draw
    expect(w.reloading).toBe(false);
    expect(sent.filter((s) => s === C2S.Reload).length).toBe(0);
    w.update(t + 100, 16, false);
    expect(w.reloading).toBe(false);       // still drawing
    w.update(t + WEAPONS.pistol.equipMs + 1, 16, false);
    expect(w.reloading).toBe(true);        // the moment the gate opens
    expect(sent.filter((s) => s === C2S.Reload).length).toBe(1);
  });

  it("a switch cancels both the running reload and a held request", () => {
    const { w, player, sent } = rig();
    const t = base();
    w.requestReload(t);
    expect(w.reloading).toBe(true);
    expect(player.reloading).toBe(true);
    w.requestWeapon("pistol", t + 100);
    expect(w.reloading).toBe(false);
    expect(player.reloading).toBe(false);
    // And a request held behind the new draw dies with a second switch.
    w.requestReload(t + 120);
    w.requestWeapon("rifle", t + 140);
    w.update(t + 2000, 16, false);
    expect(w.reloading).toBe(false);
    expect(sent.filter((s) => s === C2S.Reload).length).toBe(1);
  });

  it("mirrors the reload on the player and clears it when the magazine is full again", () => {
    const { w, player } = rig();
    const t = base();
    w.requestReload(t);
    expect(player.reloading).toBe(true);
    w.update(t + WEAPONS.rifle.reloadMs + 1, 16, false);
    expect(player.reloading).toBe(false);
    expect(w.ammo).toBe(WEAPONS.rifle.magazine);
  });

  it("tells the hands what they are doing: rounds going in, and whether the chamber was empty", () => {
    const { w, reloads } = rig();
    const t = base();
    w.requestReload(t);                    // 10 in the mag: a tactical reload of 20
    expect(reloads[0]).toEqual({ weapon: "rifle", shells: WEAPONS.rifle.magazine - 10, empty: false });
    w.cancel();
    w.syncFrom({ weapon: "rifle", owned: ["pistol", "rifle"], ammo: 0, reserve: 7, reloading: false } as unknown as NetPlayer);
    w.requestReload(t + 1000);             // empty, and only seven rounds left in reserve
    expect(reloads[1]).toEqual({ weapon: "rifle", shells: 7, empty: true });
  });
});
