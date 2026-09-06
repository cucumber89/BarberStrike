import { describe, expect, it } from "vitest";
import { effectiveSpread, WEAPONS } from "./weapons";

const stillHip = { moving: false, airborne: false, crouching: false, aiming: false };

describe("effectiveSpread", () => {
  it("uses one ordered rule for bloom and every movement modifier", () => {
    const w = WEAPONS.rifle;
    const bloom = 0.01;
    expect(effectiveSpread(w, bloom, stillHip)).toBeCloseTo(w.spread + bloom, 10);
    expect(effectiveSpread(w, bloom, { ...stillHip, aiming: true })).toBeCloseTo((w.spread + bloom) * w.spreadAim, 10);
    expect(effectiveSpread(w, bloom, { ...stillHip, moving: true, airborne: true, crouching: true, aiming: true }))
      .toBeCloseTo((w.spread + bloom) * w.spreadMove * w.spreadAir * 0.8 * w.spreadAim, 10);
  });

  it("keeps shotgun pellets subject to ADS, movement and air penalties", () => {
    const w = WEAPONS.shotgun;
    const hip = effectiveSpread(w, 0, stillHip);
    const aimed = effectiveSpread(w, 0, { ...stillHip, aiming: true });
    const airborne = effectiveSpread(w, 0, { ...stillHip, airborne: true });
    expect(aimed).toBeCloseTo(hip * w.spreadAim, 10);
    expect(airborne).toBeCloseTo(hip * w.spreadAir, 10);
    expect(airborne).toBeGreaterThan(hip);
  });
});
