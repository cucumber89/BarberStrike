import { describe, expect, it } from "vitest";
import { WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { gunTail } from "../audio/sfx";
import {
  BIPOD, WEAPON_FEEL, bipodDeployed, closestPair, feelOf, lookScale, pelletRing,
  signatureDistance, signatureOf, swayScaleOf, unscopeForSprint,
} from "./weaponFeel";

/**
 * The matrix (`docs/WEAPON_MATRIX.md`) made checkable. The claim Drop B exists to support is
 * "a player who fires each weapon at a wall can name it from the feel alone"; the closest-pair
 * assertion below is that claim with a number attached.
 */
describe("weapon feel", () => {
  it("has a row for every weapon in the roster", () => {
    for (const id of WEAPON_ORDER) expect(feelOf(id), id).toBeDefined();
    expect(Object.keys(WEAPON_FEEL).sort()).toEqual([...WEAPON_ORDER].sort());
  });

  it("keeps no two weapons closer than the signature threshold", () => {
    // D-B4, frozen from the first real run (2026-09-08): the closest pair in the roster is
    // shotgun vs launcher at 0.984 — both slow, heavy and single-shot — against a median pair of
    // 4.0 and a maximum of 8.2. The floor sits just under the measurement, so an innocuous tweak
    // does not fail the build but any real convergence does. Lowering this number is an admission
    // that two weapons started to feel the same; fix the weapons instead.
    const pair = closestPair(gunTail);
    expect(pair.distance, `${pair.a} vs ${pair.b}`).toBeGreaterThan(0.9);
  });

  it("separates the two SMGs and the two long-range rifles, which look alike", () => {
    // Art review round 3 flagged smg/smg2 and dmr/sniper as near-identical silhouettes. Geometry
    // cannot tell them apart; feel has to, so these two pairs are held to more than the floor.
    const d = (a: WeaponId, b: WeaponId) =>
      signatureDistance(signatureOf(a, gunTail(a)), signatureOf(b, gunTail(b)));
    expect(d("smg", "smg2")).toBeGreaterThan(1.5);
    expect(d("dmr", "sniper")).toBeGreaterThan(1.5);
  });

  it("orders handling weight the way the matrix describes it", () => {
    const sprintOut = (id: WeaponId) => feelOf(id).sprintOutMs;
    // The sniper is the slowest thing to bring back up, the VZ-9 the fastest gun.
    expect(Math.max(...WEAPON_ORDER.map(sprintOut))).toBe(sprintOut("sniper"));
    expect(sprintOut("smg2")).toBeLessThan(sprintOut("smg"));
    // The LMG carries the heaviest sway, the VZ-9 the lightest of the guns.
    const guns = WEAPON_ORDER.filter((id) => WEAPONS[id].kind !== "melee");
    expect(Math.max(...guns.map((id) => feelOf(id).sway))).toBe(feelOf("lmg").sway);
    expect(Math.min(...guns.map((id) => feelOf(id).sway))).toBe(feelOf("smg2").sway);
    // Visual violence tracks the report: the sniper and the launcher shake hardest.
    expect(feelOf("sniper").shake).toBeGreaterThan(feelOf("rifle").shake);
    expect(feelOf("shotgun").shake).toBeGreaterThan(feelOf("rifle").shake);
  });

  it("gives brass to the guns that cycle and holds it back for the ones worked by hand", () => {
    // A pump gun does not throw a case per shot; it comes out with the action.
    for (const id of ["revolver", "shotgun", "sniper"] as const) {
      expect(feelOf(id).casings, id).toBe(0);
      expect(feelOf(id).actionMs, id).toBeGreaterThan(0);
    }
    for (const id of ["pistol", "smg", "smg2", "rifle", "lmg", "dmr"] as const) {
      expect(feelOf(id).casings, id).toBe(1);
    }
    // Nothing fires on the melee weapon, and the shell is its own tracer.
    expect(feelOf("clippers").flash).toBe(0);
    expect(feelOf("launcher").tracer).toBe(0);
  });

  it("scales look sensitivity with the zoom actually applied (R1)", () => {
    expect(lookScale(0.28, 0)).toBe(1); // hip: untouched
    expect(lookScale(0.28, 1)).toBeCloseTo(0.28, 6); // fully scoped: the sniper's own zoom
    expect(lookScale(0.28, 0.5)).toBeCloseTo(0.64, 6); // and it tracks the blend on the way in
    expect(lookScale(1, 1)).toBe(1); // a weapon that does not zoom does not change sensitivity
  });

  it("deploys the bipod only for the LMG, crouched and settled (B1)", () => {
    expect(bipodDeployed(feelOf("lmg"), true, BIPOD.stillMs)).toBe(true);
    expect(bipodDeployed(feelOf("lmg"), true, BIPOD.stillMs - 1)).toBe(false);
    expect(bipodDeployed(feelOf("lmg"), false, 9999)).toBe(false);
    expect(bipodDeployed(feelOf("rifle"), true, 9999)).toBe(false);
    expect(swayScaleOf(feelOf("lmg"), true)).toBeCloseTo(feelOf("lmg").sway * BIPOD.sway, 6);
    expect(swayScaleOf(feelOf("lmg"), false)).toBe(feelOf("lmg").sway);
  });

  it("draws the spread ring only where a cone the crosshair cannot show exists (C1)", () => {
    expect(pelletRing("shotgun")).toBe(true);
    for (const id of WEAPON_ORDER.filter((w) => w !== "shotgun")) expect(pelletRing(id), id).toBe(false);
  });

  it("scopes the sniper and the DMR, and holds breath only for the sniper (D-B2)", () => {
    expect(feelOf("sniper").scope).toBe("tube");
    expect(feelOf("dmr").scope).toBe("ring");
    expect(feelOf("sniper").breath).toBe(true);
    expect(feelOf("dmr").breath).toBe(false);
    expect(feelOf("dmr").scopeDrift).toBeLessThan(feelOf("sniper").scopeDrift);
    for (const id of WEAPON_ORDER.filter((w) => w !== "sniper" && w !== "dmr")) {
      expect(feelOf(id).scope, id).toBeNull();
    }
  });

  it("drops the scope for a player who asks to run, and only then (S2)", () => {
    const sniper = feelOf("sniper");
    expect(unscopeForSprint(sniper, true, true, true)).toBe(true);
    expect(unscopeForSprint(sniper, true, true, false)).toBe(false); // standing still: that is breath
    expect(unscopeForSprint(sniper, false, true, true)).toBe(false); // not aiming: nothing to drop
    expect(unscopeForSprint(feelOf("rifle"), true, true, true)).toBe(false); // no scope to leave
  });
});
