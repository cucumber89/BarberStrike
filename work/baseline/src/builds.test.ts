import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import {
  BODY_ENVELOPE, BUILDS, DEFAULT_BUILD, buildDef, buildRig, envelopeOf, frontalArea,
  headZoneStart, hitboxFor, isBuildId, profileDistance, silhouette, widthProfile,
} from "./builds";

/**
 * The test this feature is not allowed to ship without.
 *
 * Everything about a build is a look, and a look must not become a fight. Collision, hitscan and
 * lag compensation all read `PLAYER`, so the danger is not that a build changes those numbers — it
 * cannot reach them — but that the DRAWN body drifts inside them until the thing a player aims at
 * and the thing the server hits are two different objects. These are the assertions that keep the
 * two on top of each other, and they are written to fail loudly on any future catalog entry, not
 * only on the six that exist today.
 */

const rigs = BUILDS.map((b) => ({ id: b.id, rig: buildRig(b) }));
/** Sub-nanometre. Not `===` because the solver adds the joint chain in a different ORDER per build,
 *  and IEEE addition is not associative: 0.845 + 0.06 + 0.965 lands a few ulps from 1.87. */
const SAME = 12;

describe("what the server hits is the same for every build", () => {
  it("no build can express a size at all", () => {
    // The type has no height/width field, so this is a guard on the DATA rather than on the type:
    // a later entry that smuggles one in (a hand-edited catalog, a merge) fails here.
    const sizeish = /height|width|halfw|scale|size|eye|hitbox|radius/i;
    for (const b of BUILDS) {
      expect(Object.keys(b).filter((k) => sizeish.test(k))).toEqual([]);
    }
  });

  it("every build reports PLAYER's collision and headshot numbers, unchanged", () => {
    for (const b of BUILDS) {
      expect(hitboxFor(b)).toEqual({
        halfWidth: PLAYER.halfWidth, height: PLAYER.height, crouchHeight: PLAYER.crouchHeight,
        eyeHeight: PLAYER.eyeHeight, crouchEyeHeight: PLAYER.crouchEyeHeight, headFraction: PLAYER.headFraction,
      });
      // Bit for bit against the shared constants, not merely equal-looking numbers.
      expect(hitboxFor(b).eyeHeight).toBe(PLAYER.eyeHeight);
      expect(hitboxFor(b).halfWidth).toBe(PLAYER.halfWidth);
      expect(hitboxFor(b).headFraction).toBe(PLAYER.headFraction);
    }
    // ...and every build answers the same as every other one, which is the claim a player cares about.
    const answers = new Set(BUILDS.map((b) => JSON.stringify(hitboxFor(b))));
    expect(answers.size).toBe(1);
  });
});

describe("every build fills the same envelope", () => {
  it("crown, sole and widest point are identical", () => {
    for (const { id, rig } of rigs) {
      const e = envelopeOf(rig);
      expect(e.crownY, `${id} crown`).toBeCloseTo(BODY_ENVELOPE.crownY, SAME);
      expect(e.topY, `${id} top of the silhouette`).toBeCloseTo(BODY_ENVELOPE.topY, SAME);
      expect(e.footY, `${id} sole`).toBeCloseTo(BODY_ENVELOPE.footY, SAME);
      expect(e.halfW, `${id} widest point`).toBeCloseTo(BODY_ENVELOPE.halfW, SAME);
    }
  });

  it("the drawn head sits inside the band the server scores as a head", () => {
    const zone = headZoneStart();
    for (const { id, rig } of rigs) {
      const e = envelopeOf(rig);
      // Every millimetre of visible skull is in the head zone, with margin — a shot on the chin of
      // the biggest head must not land in the chest band.
      expect(e.headBottomY - zone, `${id} head-zone margin`).toBeGreaterThan(0.05);
      expect(e.headTopY, `${id} crown`).toBeCloseTo(BODY_ENVELOPE.crownY, SAME);
    }
  });

  it("the drawn head stays inside the footprint that can be hit", () => {
    // A hunch pushes the head FORWARD, and hitscan is an AABB about the player's position: a head
    // that leaned out of that footprint could be aimed at and missed sideways.
    for (const { id, rig } of rigs) {
      const e = envelopeOf(rig);
      expect(e.headHalfX, `${id} head width`).toBeLessThan(PLAYER.halfWidth);
      expect(e.headMaxZ, `${id} head reach`).toBeLessThan(PLAYER.halfWidth);
    }
  });

  it("the lateral solver is a no-op, so no build is a squashed copy of another", () => {
    // Normalisation is the safety net under the pinned shoulder frame, not the mechanism. A future
    // entry wide enough to need real scaling gets caught here rather than silently losing its shape.
    for (const { id, rig } of rigs) expect(rig.scaleX, `${id} lateral scale`).toBeCloseTo(1, 6);
  });
});

describe("the six are really six", () => {
  it("no two builds have the same silhouette", () => {
    for (let i = 0; i < rigs.length; i++) {
      for (let j = i + 1; j < rigs.length; j++) {
        const d = profileDistance(widthProfile(rigs[i].rig), widthProfile(rigs[j].rig));
        expect(d, `${rigs[i].id} vs ${rigs[j].id}`).toBeGreaterThan(0.04); // 4 cm, well past a recolour
      }
    }
  });

  it("they differ where a body differs: hips, waist, limbs, neck, head", () => {
    const spread = (pick: (r: (typeof rigs)[number]["rig"]) => number): number => {
      const v = rigs.map((r) => pick(r.rig));
      return Math.max(...v) - Math.min(...v);
    };
    expect(spread((r) => r.hipY)).toBeGreaterThan(0.15);      // leg-to-torso ratio, the loudest signal
    expect(spread((r) => r.vestW)).toBeGreaterThan(0.2);      // gut
    expect(spread((r) => r.chestW)).toBeGreaterThan(0.1);     // ribcage
    expect(spread((r) => r.upperW)).toBeGreaterThan(0.03);    // limb thickness
    expect(spread((r) => r.skullH)).toBeGreaterThan(0.03);    // head size
    expect(spread((r) => r.headZ)).toBeGreaterThan(0.05);     // posture
  });

  it("but none of them is a bigger target than another", () => {
    // Frontal area is how many pixels a build presents. It is not free to vary — a short-legged
    // build carries more torso and therefore more area, which is real and cannot be designed away
    // without making every build the same shape. MEASURED spread: -7.0% (TYCZKA) to +6.9% (BYK)
    // against the default. Bounded here at a tenth, and it changes nothing about registration:
    // the AABB above is identical, so this is acquisition at range, not a duel outcome.
    const base = frontalArea(buildRig(DEFAULT_BUILD));
    for (const { id, rig } of rigs) {
      expect(Math.abs(frontalArea(rig) / base - 1), `${id} frontal area`).toBeLessThan(0.1);
    }
  });

  it("no structural box pokes out of the silhouette the envelope promises", () => {
    for (const { id, rig } of rigs) {
      for (const box of silhouette(rig)) {
        expect(box.halfW, `${id} ${box.name}`).toBeLessThanOrEqual(BODY_ENVELOPE.halfW + 1e-9);
        expect(box.y + box.h / 2, `${id} ${box.name} top`).toBeLessThanOrEqual(BODY_ENVELOPE.topY + 1e-9);
        expect(box.y - box.h / 2, `${id} ${box.name} bottom`).toBeGreaterThanOrEqual(BODY_ENVELOPE.footY - 1e-9);
      }
    }
  });
});

describe("the default build is the character the game already had", () => {
  it("reproduces the numbers Character.ts was written with", () => {
    const r = buildRig(DEFAULT_BUILD);
    const was: Partial<Record<keyof typeof r, number>> = {
      hipY: 0.95, torsoY: 0.06, headY: 0.62,
      pelvisW: 0.34, pelvisH: 0.16, pelvisD: 0.2,
      chestW: 0.42, chestH: 0.5, chestD: 0.24, chestY: 0.3, chestZ: 0,
      vestW: 0.44, vestH: 0.34, vestD: 0.27, vestZ: 0,
      shoulderX: 0.26, shoulderW: 0.12, shoulderH: 0.1, shoulderD: 0.22, shoulderY: 0.5, shoulderZ: 0,
      humpH: 0,
      neckW: 0.1, neckH: 0.08, neckY: -0.02,
      skullW: 0.22, skullH: 0.24, skullD: 0.24, skullY: 0.12, headZ: 0,
      armX: 0.3, armY: 0.48, upperW: 0.11, upperH: 0.3, foreY: -0.3, foreW: 0.09, foreH: 0.28,
      handW: 0.08, handH: 0.08, handD: 0.1, handY: -0.3,
      armStripeX: 0.058, legStripeX: 0.078, stripeW: 0.018, gunX: 0.16,
      legX: 0.1, legY: -0.05, thighW: 0.15, thighH: 0.42, thighD: 0.16,
      shinY: -0.44, calfW: 0.13, calfH: 0.4, calfD: 0.14,
      bootW: 0.14, bootH: 0.1, bootD: 0.26, bootY: -0.42,
      kneeW: 0.145, kneeH: 0.14, kneeD: 0.065,
    };
    for (const [key, value] of Object.entries(was)) {
      expect(r[key as keyof typeof r], key).toBeCloseTo(value, 9);
    }
  });
});

describe("the id is never trusted", () => {
  it("falls back to the default for anything unknown", () => {
    expect(isBuildId("byk")).toBe(true);
    expect(isBuildId("a-build-that-does-not-exist")).toBe(false);
    expect(isBuildId(42)).toBe(false);
    expect(isBuildId(undefined)).toBe(false);
    expect(buildDef("").id).toBe(DEFAULT_BUILD);
    expect(buildDef(null).id).toBe(DEFAULT_BUILD);
    expect(buildDef("<script>").id).toBe(DEFAULT_BUILD);
    expect(buildDef("byk").id).toBe("byk");
    // ...and an unknown id still yields a drawable body rather than a throw.
    expect(envelopeOf(buildRig("nonsense")).crownY).toBeCloseTo(BODY_ENVELOPE.crownY, SAME);
  });

  it("every catalog id is a safe wire value", () => {
    for (const b of BUILDS) expect(b.id).toMatch(/^[a-z0-9-]{1,32}$/);
    expect(new Set(BUILDS.map((b) => b.id)).size).toBe(BUILDS.length);
    expect(BUILDS[0].id).toBe(DEFAULT_BUILD);
  });
});
