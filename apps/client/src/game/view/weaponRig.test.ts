import { describe, expect, it } from "vitest";
import { buildRig } from "./weaponRig";
import fixture from "./weaponRig.fixture.json";

/**
 * Drop 6b: the part classifier runs against the REAL node names of every firearm in
 * `public/models/raw/firearms` (captured in weaponRig.fixture.json), because every rule in
 * weaponRig.ts exists because of a trap in one of these files.
 */

const rig = (id: keyof typeof fixture) => buildRig(fixture[id]);

describe("buildRig on the real firearm models", () => {
  it("finds the magazine and never a magazine RELEASE button or the group node", () => {
    expect(rig("P320").magazine).toBe("Magazine");
    expect(rig("P226").magazine).toBe("Magazine");
    expect(rig("MK14").magazine).toBe("Magazine");
    expect(rig("SRSA1").magazine).toBe("Magazine");
    expect(rig("SR1MP").magazine).toBe("Magazine");
    expect(rig("Mpa").magazine).toBe("Magazine");
    // MPX only has `Magazine_Standard` plus the `Magazines` group.
    expect(rig("MPX").magazine).toBe("Magazine_Standard");
    for (const id of Object.keys(fixture) as (keyof typeof fixture)[]) {
      const m = rig(id).magazine;
      expect(m === undefined || !/release|^magazines$/i.test(m), `${id} picked ${m}`).toBe(true);
    }
    // A revolver has no detachable magazine.
    expect(rig("Revolver").magazine).toBeUndefined();
  });

  it("picks the right action part and kind per weapon family", () => {
    expect(rig("P320")).toMatchObject({ action: "slide", actionKind: "slide" });
    expect(rig("P226")).toMatchObject({ action: "slide", actionKind: "slide" });
    expect(rig("SR1MP")).toMatchObject({ action: "Slide", actionKind: "slide" });
    // SRSA1 has a real `Bolt` and ten decorative `Bolt_1..Bolt_10` screws.
    expect(rig("SRSA1")).toMatchObject({ action: "Bolt", actionKind: "bolt" });
    expect(rig("MK14")).toMatchObject({ action: "Bolt", actionKind: "bolt" });
    // Bullpup / roller guns expose only a charging handle.
    expect(rig("MDR").actionKind).toBe("charge");
    expect(rig("MDR").action).toMatch(/charging_handle/i);
    expect(rig("Mpa").actionKind).toBe("charge");
    // A revolver swings its cylinder out instead.
    expect(rig("Revolver")).toMatchObject({ action: "Revolving_Cylinder", actionKind: "cylinder", cylinder: "Revolving_Cylinder" });
    expect(rig("Revolver-AnsEmKwuu7").actionKind).toBe("cylinder");
  });

  it("never mistakes furniture named after the action for the action", () => {
    for (const id of Object.keys(fixture) as (keyof typeof fixture)[]) {
      const a = rig(id).action;
      if (!a) continue;
      expect(/_(stop|release|firing|ball|arm)$/i.test(a), `${id} picked ${a}`).toBe(false);
      expect(/^bolt_\d+$/i.test(a), `${id} picked a screw: ${a}`).toBe(false);
    }
  });

  it("finds sights without falling for mounts, housings, screws or glow inserts", () => {
    expect(rig("P320")).toMatchObject({ frontSight: "Front_Sight", rearSight: "Rear_Sight" });
    expect(rig("P226")).toMatchObject({ frontSight: "Front_Sight", rearSight: "Rear_Sight" });
    expect(rig("Revolver").rearSight).toBe("Rear_Sights");
    expect(rig("RPG Launcher")).toMatchObject({ frontSight: "Front_Sight", rearSight: "Rear_Sight" });
    for (const id of Object.keys(fixture) as (keyof typeof fixture)[]) {
      const r = rig(id);
      for (const s of [r.frontSight, r.rearSight]) {
        if (!s) continue;
        expect(/mount|housing|screw|connector|adjuster|block/i.test(s), `${id} picked ${s}`).toBe(false);
      }
    }
  });

  it("finds a muzzle part on every weapon that has one, preferring the flash hider over the barrel", () => {
    expect(rig("MK14").muzzle).toBe("Flashhider_Short");
    expect(rig("M21 EBR").muzzle).toBe("Flashhider_Long");
    expect(rig("MPX").muzzle).toBe("Flashhider");
    expect(rig("SRSA1").muzzle).toBe("Compensator");
    expect(rig("P320").muzzle).toBe("Barrel");
    expect(rig("Revolver").muzzle).toBe("Snub_38_Barrel");
    expect(rig("Revolver-AnsEmKwuu7").muzzle).toBe("Magnum_Barrel");
    // The launcher's bore is its `Tube`; the MK14's `Gas_Tube` must never win that way.
    expect(rig("RPG Launcher").muzzle).toBe("Tube");
    expect(rig("MK14").muzzle).not.toMatch(/gas/i);
    // The MP5SD is the documented exception: its suppressor IS the handguard, so there is no barrel
    // node to find and the loader falls back to the model's forward-most point.
    expect(rig("Mpsd").muzzle).toBeUndefined();
    for (const id of Object.keys(fixture) as (keyof typeof fixture)[]) {
      if (id === "Mpsd") continue;
      expect(rig(id).muzzle, `${id} has no muzzle part`).toBeDefined();
    }
  });

  it("does not read the MP5SD's stock `Cylinder` as a revolver action", () => {
    expect(rig("Mpsd").actionKind).toBe("charge");
    expect(rig("Mpsd").cylinder).toBeUndefined();
  });

  it("finds the RPG's rocket so the launcher can hide it after firing", () => {
    expect(rig("RPG Launcher").projectile).toBe("Rocket");
    expect(rig("P320").projectile).toBeUndefined();
  });

  it("is empty and safe on a model with nothing recognisable", () => {
    expect(buildRig([])).toEqual({ actionKind: "none" });
    expect(buildRig(["Mesh.001", "Cube", "Empty"])).toEqual({ actionKind: "none" });
  });
});

describe("hand anchors", () => {
  it("finds the bare grip and never a grip-shaped lever or handle", () => {
    expect(rig("Revolver").grip).toBe("Grip");
    expect(rig("MDR").grip).toBe("Pistol_Grip");
    // SR1MP only has `Grip_Safety` — a lever, not somewhere to put a hand.
    expect(rig("SR1MP").grip).toBeUndefined();
    // The RPG's grips are `Bottom_Grip_Ring` / `Side_Grip_Left`: carry handles, all furniture.
    expect(rig("RPG Launcher").grip).toBeUndefined();
  });

  it("falls back to the trigger, and never to the trigger GUARD", () => {
    const mk14 = rig("MK14");
    expect(mk14.trigger).toBe("Trigger");
    expect(rig("P320").trigger).toBe("Trigger");
    // The RPG has neither, so the loader uses its geometric fallback.
    expect(rig("RPG Launcher").trigger).toBeUndefined();
  });
});
