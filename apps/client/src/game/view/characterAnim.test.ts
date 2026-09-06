import { describe, expect, it } from "vitest";
import { PACK_CLIPS, locomotion, pickClip, type ClipName } from "./characterAnim";

/** Drop 6b: the locomotion blend and one-shot choice for the Quaternius rigs. */

const sum = (w: [ClipName, number][]) => w.reduce((a, [, x]) => a + x, 0);
const of = (w: [ClipName, number][], c: ClipName) => w.find(([n]) => n === c)?.[1] ?? 0;

describe("locomotion", () => {
  const RUN = 3.4;

  it("always sums to 1 so the skeleton is never under-driven", () => {
    for (const speed of [0, 0.2, 1, 2.5, 3.4, 5, 7.6]) {
      for (let d = -Math.PI; d <= Math.PI; d += Math.PI / 8) {
        for (const grounded of [true, false]) {
          expect(sum(locomotion(speed, d, grounded, RUN)), `speed=${speed} dir=${d.toFixed(2)}`).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it("stands on the gun idle when still or airborne", () => {
    expect(locomotion(0, 0, true, RUN)).toEqual([["Idle_Gun", 1]]);
    expect(locomotion(7, 0, false, RUN)).toEqual([["Idle_Gun", 1]]);
  });

  it("runs forward, backward and sideways on the matching clip at full speed", () => {
    expect(of(locomotion(7, 0, true, RUN), "Run")).toBeCloseTo(1);
    expect(of(locomotion(7, Math.PI, true, RUN), "Run_Back")).toBeCloseTo(1);
    expect(of(locomotion(7, Math.PI / 2, true, RUN), "Run_Right")).toBeCloseTo(1);
    expect(of(locomotion(7, -Math.PI / 2, true, RUN), "Run_Left")).toBeCloseTo(1);
  });

  it("splits a diagonal between the two neighbouring clips", () => {
    const w = locomotion(7, Math.PI / 4, true, RUN);
    expect(of(w, "Run")).toBeCloseTo(0.5, 1);
    expect(of(w, "Run_Right")).toBeCloseTo(0.5, 1);
    expect(of(w, "Run_Back")).toBe(0);
    expect(of(w, "Run_Left")).toBe(0);
    // And it leans towards the nearer clip, not 50/50, when the angle is not exactly diagonal.
    const near = locomotion(7, Math.PI / 8, true, RUN);
    expect(of(near, "Run")).toBeGreaterThan(of(near, "Run_Right"));
  });

  it("wraps around the back without a discontinuity", () => {
    const a = locomotion(7, Math.PI - 0.01, true, RUN);
    const b = locomotion(7, -Math.PI + 0.01, true, RUN);
    expect(of(a, "Run_Back")).toBeCloseTo(of(b, "Run_Back"), 1);
    expect(of(a, "Run")).toBe(0);
    expect(of(b, "Run")).toBe(0);
  });

  it("walks at low speed and crossfades into the run clips", () => {
    expect(of(locomotion(1, 0, true, RUN), "Walk")).toBeCloseTo(1);
    expect(of(locomotion(1, 0, true, RUN), "Run")).toBe(0);
    const mid = locomotion(3, 0, true, RUN);
    expect(of(mid, "Walk")).toBeGreaterThan(0);
    expect(of(mid, "Run")).toBeGreaterThan(0);
    expect(of(locomotion(6, 0, true, RUN), "Walk")).toBe(0);
  });
});

describe("pickClip", () => {
  const base = { dead: false, firing: false, flinch: null as null | "body" | "head", throwing: false, reloading: false };
  it("puts death above everything and nothing above death", () => {
    expect(pickClip({ ...base, dead: true, firing: true, flinch: "head", throwing: true })).toBe("Death");
  });
  it("orders flinch over throw over fire over reload", () => {
    expect(pickClip({ ...base, flinch: "body", throwing: true, firing: true })).toBe("HitRecieve");
    expect(pickClip({ ...base, flinch: "head" })).toBe("HitRecieve_2");
    expect(pickClip({ ...base, throwing: true, firing: true })).toBe("Punch_Right");
    expect(pickClip({ ...base, firing: true, reloading: true })).toBe("Gun_Shoot");
    expect(pickClip({ ...base, reloading: true })).toBe("Interact");
    expect(pickClip(base)).toBeNull();
  });
  it("only ever names clips the pack actually ships", () => {
    const used: ClipName[] = ["Idle_Gun", "Walk", "Run", "Run_Back", "Run_Left", "Run_Right", "Death", "HitRecieve", "HitRecieve_2", "Punch_Right", "Gun_Shoot", "Interact"];
    for (const c of used) expect(PACK_CLIPS, `${c} is not in the pack`).toContain(c);
  });
});
