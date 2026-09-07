import { describe, expect, it } from "vitest";
import { HAND_SIZE, fitAnchors, fitScale, gripOrigin, guessForward, sizeOf, supportHandHome, unionBox, type PartBox } from "./weaponFit";

/** Drop 6b: the measured anchors that let a glTF gun drop into the procedural viewmodel poses. */

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): PartBox =>
  ({ min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });

describe("fitScale", () => {
  it("scales the model's forward extent to the weapon's declared length", () => {
    expect(fitScale(box(-1, -1, 0, 1, 1, 20), 0.8)).toBeCloseTo(0.04);
    expect(fitScale(box(0, 0, -5, 1, 1, 5), 0.2)).toBeCloseTo(0.02);
  });
  it("never divides by zero or flips on a degenerate model", () => {
    expect(fitScale(box(0, 0, 0, 1, 1, 0), 0.8)).toBe(1);
    expect(fitScale(box(0, 0, 0, 1, 1, 10), 0)).toBe(1);
  });
});

describe("unionBox / sizeOf", () => {
  it("covers every part", () => {
    const u = unionBox([box(0, 0, 0, 1, 1, 1), box(-2, 0.5, 3, -1, 4, 5)]);
    expect(u.min).toEqual([-2, 0, 0]);
    expect(u.max).toEqual([1, 4, 5]);
    expect(sizeOf(u)).toEqual([3, 4, 5]);
  });
});

describe("fitAnchors", () => {
  // A rifle-shaped model: 20 units long, sights on top, barrel poking out the front.
  const whole = box(-1, -3, 0, 1, 3, 20);
  const base = { whole, targetLength: 0.8 };

  it("puts the muzzle at the front of the gun, on the bore's axis, in scaled space", () => {
    const a = fitAnchors({ ...base, barrel: box(-0.3, 0.5, 12, 0.3, 1.1, 20) });
    expect(a.length).toBe(0.8);
    expect(a.muzzle[2]).toBeCloseTo(0.8);            // 20 units × 0.04
    expect(a.muzzle[0]).toBeCloseTo(0);              // bore is centred laterally
    expect(a.muzzle[1]).toBeCloseTo(0.8 * 0.04);     // bore centre height 0.8 units
  });

  it("keeps the muzzle at the front even when the barrel node ends inside the shell (bullpup)", () => {
    const a = fitAnchors({ ...base, barrel: box(-0.3, 0.5, 4, 0.3, 1.1, 14) });
    expect(a.muzzle[2]).toBeCloseTo(0.8);
  });

  it("falls back to the whole model when no barrel node was found (suppressed MP5SD)", () => {
    const a = fitAnchors(base);
    expect(a.muzzle[2]).toBeCloseTo(0.8);
    expect(Number.isFinite(a.muzzle[0])).toBe(true);
  });

  it("takes the aim point from the rear sight raised to the front sight's height", () => {
    const a = fitAnchors({
      ...base,
      rearSight: box(-0.2, 2.4, 5, 0.2, 2.8, 5.6),
      frontSight: box(-0.15, 2.6, 18, 0.15, 3.0, 18.4),
    });
    expect(a.aimPoint[2]).toBeCloseTo(5.3 * 0.04);   // rear sight's Z
    expect(a.aimPoint[1]).toBeCloseTo(2.8 * 0.04);   // the higher of the two sight tops
    expect(a.aimPoint[0]).toBeCloseTo(0);
  });

  it("uses whichever single sight exists, and a sane receiver top when there is none", () => {
    const rearOnly = fitAnchors({ ...base, rearSight: box(-0.2, 2.4, 5, 0.2, 2.8, 5.6) });
    expect(rearOnly.aimPoint[1]).toBeCloseTo(2.8 * 0.04);
    const none = fitAnchors(base);
    expect(none.aimPoint[1]).toBeCloseTo(3 * 0.04);  // top of the receiver
    expect(none.aimPoint[2]).toBeGreaterThan(0);
    expect(none.aimPoint[2]).toBeLessThan(0.8);
  });

  it("puts the ejection port on the right of the receiver when the model has none", () => {
    const a = fitAnchors(base);
    expect(a.eject[0]).toBeGreaterThan(0);           // +X is right
    const measured = fitAnchors({ ...base, eject: box(0.8, 1.0, 8, 1.0, 1.6, 9) });
    expect(measured.eject[0]).toBeCloseTo(0.9 * 0.04);
    expect(measured.eject[2]).toBeCloseTo(8.5 * 0.04);
  });

  it("returns finite anchors for every combination of missing parts", () => {
    for (const barrel of [undefined, box(-0.3, 0.5, 12, 0.3, 1.1, 20)])
      for (const rearSight of [undefined, box(-0.2, 2.4, 5, 0.2, 2.8, 5.6)])
        for (const frontSight of [undefined, box(-0.15, 2.6, 18, 0.15, 3.0, 18.4)])
          for (const eject of [undefined, box(0.8, 1.0, 8, 1.0, 1.6, 9)]) {
            const a = fitAnchors({ ...base, barrel, rearSight, frontSight, eject });
            for (const v of [...a.muzzle, ...a.eject, ...a.aimPoint, a.length]) expect(Number.isFinite(v)).toBe(true);
          }
  });
});

describe("guessForward", () => {
  const box = (min: [number, number, number], max: [number, number, number]) => ({ min, max });

  it("leaves a model already pointing down +Z alone", () => {
    const whole = box([-0.05, -0.1, -0.2], [0.05, 0.1, 0.4]);
    const barrel = box([-0.02, 0, 0.2], [0.02, 0.04, 0.4]);
    expect(guessForward(whole, barrel)).toBe(0);
  });

  it("turns a model pointing down −Z by half a turn", () => {
    const whole = box([-0.05, -0.1, -0.4], [0.05, 0.1, 0.2]);
    const barrel = box([-0.02, 0, -0.4], [0.02, 0.04, -0.2]);
    expect(guessForward(whole, barrel)).toBeCloseTo(Math.PI, 6);
  });

  it("turns +X onto +Z with a quarter turn the left-handed way", () => {
    const whole = box([-0.2, -0.1, -0.05], [0.4, 0.1, 0.05]);
    const barrel = box([0.2, 0, -0.02], [0.4, 0.04, 0.02]);
    const yaw = guessForward(whole, barrel);
    expect(yaw).toBeCloseTo(-Math.PI / 2, 6);
    // Sanity: apply Babylon's own left-handed Y rotation to the bore direction and land on +Z.
    const dir = [1, 0, 0];
    const z = dir[0] * -Math.sin(yaw) + dir[2] * Math.cos(yaw);
    expect(z).toBeCloseTo(1, 6);
  });

  it("uses the magazine as the OPPOSITE end when no barrel is named", () => {
    // Suppressed SMG: no barrel node, magazine sits at the rear (−Z), so the muzzle is +Z.
    const whole = box([-0.05, -0.2, -0.3], [0.05, 0.1, 0.3]);
    const magazine = box([-0.03, -0.2, -0.25], [0.03, -0.05, -0.1]);
    expect(guessForward(whole, undefined, magazine)).toBe(0);
  });

  it("assumes +Z when nothing tells it otherwise", () => {
    expect(guessForward(box([-0.05, -0.1, -0.2], [0.05, 0.1, 0.4]))).toBe(0);
  });

  it("ignores a barrel centred on the model (no usable signal)", () => {
    const whole = box([-0.05, -0.1, -0.3], [0.05, 0.1, 0.3]);
    const barrel = box([-0.02, 0, -0.001], [0.02, 0.04, 0.001]);
    expect(guessForward(whole, barrel)).toBe(0);
  });
});

describe("gripOrigin", () => {
  const box = (min: [number, number, number], max: [number, number, number]) => ({ min, max });

  it("puts the origin on TOP of the grip — the web of the hand, not its middle", () => {
    const whole = box([-0.05, -0.15, -0.1], [0.05, 0.1, 0.4]);
    const grip = box([-0.02, -0.15, -0.06], [0.02, -0.02, 0.0]);
    expect(gripOrigin(whole, grip)).toEqual([0, -0.02, -0.03]);
  });

  it("falls back to the trigger centre", () => {
    const whole = box([-0.05, -0.15, -0.1], [0.05, 0.1, 0.4]);
    const trigger = box([-0.005, -0.03, 0.01], [0.005, 0.01, 0.03]);
    const o = gripOrigin(whole, undefined, trigger);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeCloseTo(-0.01, 6);
    expect(o[2]).toBeCloseTo(0.02, 6);
  });

  it("falls back to a proportion of the box when the model names neither", () => {
    const whole = box([-0.05, 0, 0], [0.05, 0.2, 1.0]);
    const o = gripOrigin(whole);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeCloseTo(0.11, 6);   // 55 % up
    expect(o[2]).toBeCloseTo(0.3, 6);    // 30 % back from the rear
  });
});

describe("fitAnchors: derived ejection port lands on the gun (drop A)", () => {
  // Receiver 1 unit wide (x ±0.5); a bolt handle sticks out to x = 1.5 at a different height.
  const receiver = box(-0.5, 0, 0, 0.5, 2, 10);
  const handle = box(0.5, 0.2, 4, 1.5, 0.4, 4.5);
  const whole = unionBox([receiver, handle]);
  it("uses the widest point when it knows no parts (the old behaviour)", () => {
    const a = fitAnchors({ whole, targetLength: 0.4 });
    expect(a.eject[0]).toBeCloseTo(1.5 * 0.04);
  });
  it("takes the right face of the part that spans the point when parts are given", () => {
    const a = fitAnchors({ whole, targetLength: 0.4, parts: [receiver, handle] });
    // 40 % up from the centre and 25 % forward of it: on the receiver, not the handle.
    expect(a.eject[0]).toBeCloseTo(0.5 * 0.04);
    expect(a.eject[1]).toBeCloseTo((1 + 0.4) * 0.04);
    expect(a.eject[2]).toBeCloseTo((5 + 1.25) * 0.04);
  });
  it("slides onto the nearest part when no part spans the derived point (the RPG's tube)", () => {
    // Only the handle is known: the derived point (y 1.4, z 6.25) is above it, so it lands on the
    // handle's top-right edge at the nearest z.
    const a = fitAnchors({ whole, targetLength: 0.4, parts: [handle] });
    expect(a.eject[0]).toBeCloseTo(1.5 * 0.04);
    expect(a.eject[1]).toBeCloseTo(0.4 * 0.04);
    expect(a.eject[2]).toBeCloseTo(4.5 * 0.04);
  });
  it("still uses the widest point when it knows no parts at all", () => {
    expect(fitAnchors({ whole, targetLength: 0.4, parts: [] }).eject[0]).toBeCloseTo(1.5 * 0.04);
  });
});

describe("supportHandHome (drop A)", () => {
  it("keeps the sidearm rule for anything 20 cm or shorter", () => {
    expect(supportHandHome(0.2)).toEqual([-0.03, -0.065, -0.005]);
    expect(supportHandHome(0.2, [box(-0.02, 0, 0, 0.02, 0.05, 0.2)])).toEqual([-0.03, -0.065, -0.005]);
  });
  it("puts a long gun's hand half-way out, capped at 36 cm, when it knows no parts", () => {
    expect(supportHandHome(0.5)).toEqual([-0.03, -0.035, 0.26]);
    expect(supportHandHome(0.8)[2]).toBe(0.36);
  });
  it("rests the hand's top 4 mm inside the fore-end's underside, ignoring parts off the centre line", () => {
    const foreEnd = box(-0.02, 0.01, 0.15, 0.02, 0.05, 0.45);      // underside at y = 0.01
    const bipodLeg = box(0.03, -0.2, 0.2, 0.04, 0.0, 0.3);         // lower, but off to the right
    const stock = box(-0.02, -0.05, -0.4, 0.02, 0.05, -0.1);       // lower, but behind the hand
    const home = supportHandHome(0.5, [foreEnd, bipodLeg, stock]);
    expect(home[2]).toBe(0.26);
    expect(home[1]).toBeCloseTo(0.01 - HAND_SIZE[1] / 2 + 0.004, 9);
    expect(home[1] + HAND_SIZE[1] / 2).toBeCloseTo(0.014, 9);      // hand top 4 mm inside
  });
  it("falls back to the fixed height when nothing spans the hand", () => {
    expect(supportHandHome(0.5, [box(-0.02, 0, -0.3, 0.02, 0.05, 0.1)])).toEqual([-0.03, -0.035, 0.26]);
  });
});

describe("guessForward: sights outrank the barrel (drop A)", () => {
  // The RPG: one centred tube, no magazine, front sight at −Z, rear sight at +Z.
  const tube: PartBox = { min: [-0.035, -0.065, -0.25], max: [0.035, 0.005, 0.25] };
  const frontAtBack: PartBox = { min: [-0.015, -0.008, -0.23], max: [0.013, 0.053, -0.22] };
  const rearAtFront: PartBox = { min: [-0.01, -0.002, 0.15], max: [0.01, 0.053, 0.16] };
  it("turns a launcher whose front sight is at −Z by half a turn", () => {
    expect(guessForward(tube, tube, undefined)).toBe(0);                                   // no signal: assumed +Z
    expect(guessForward(tube, tube, undefined, { front: frontAtBack, rear: rearAtFront })).toBe(Math.PI);
  });
  it("leaves a gun alone when the front sight is already forward", () => {
    expect(guessForward(tube, tube, undefined, { front: rearAtFront, rear: frontAtBack })).toBe(0);
  });
  it("ignores sights that sit at the same station and falls through to the barrel", () => {
    const barrelFwd: PartBox = { min: [-0.01, -0.02, 0.05], max: [0.01, 0.0, 0.25] };
    expect(guessForward(tube, barrelFwd, undefined, { front: rearAtFront, rear: rearAtFront })).toBe(0);
    const barrelBack: PartBox = { min: [-0.01, -0.02, -0.25], max: [0.01, 0.0, -0.05] };
    expect(guessForward(tube, barrelBack, undefined, { front: rearAtFront, rear: rearAtFront })).toBe(Math.PI);
  });
});
