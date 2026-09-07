import { describe, expect, it } from "vitest";
import { HAND_SIZE, sizeOf } from "./weaponFit";
import { ATTACH_TOL, attachParts, pickReceiver } from "./weaponParts";
import { handParts, type HandSide } from "./handSpec";

/**
 * The viewmodel hands, judged by the rule the guns pass in `weaponParts.check.test.ts`: every part
 * attached to the palm within 5 mm, in the pose-independent frame the spec is written in.
 */
describe.each<HandSide>(["right", "left"])("handSpec: %s hand", (side) => {
  const parts = handParts(side);
  const palm = parts.find((p) => p.name === "palm")!;

  it("has a palm box of exactly HAND_SIZE centred on the pivot", () => {
    expect(palm).toBeDefined();
    expect(sizeOf(palm.box).map((v) => +v.toFixed(9))).toEqual(HAND_SIZE);
    for (let i = 0; i < 3; i++) expect(palm.box.min[i] + palm.box.max[i]).toBeCloseTo(0, 9);
  });

  it("is at most five boxes, with a palm, fingers, a thumb and a forearm", () => {
    expect(parts.length).toBeLessThanOrEqual(5);
    expect(parts.map((p) => p.name)).toEqual(expect.arrayContaining(["palm", "fingers", "thumb", "forearm"]));
    for (const p of parts) for (let i = 0; i < 3; i++) expect(p.box.max[i], `${p.name} axis ${i}`).toBeGreaterThan(p.box.min[i]);
  });

  it("is one attached object: every part within 5 mm of the palm", () => {
    // The forearm out-volumes the palm; the palm is the biggest of the hand proper.
    const receiver = pickReceiver(parts, ["forearm"]);
    expect(receiver?.name).toBe("palm");
    const rows = attachParts(parts, receiver!, ATTACH_TOL);
    const floating = rows.filter((r) => !r.attached).map((r) => `${r.name} (${(r.toReceiver * 1000).toFixed(1)} mm)`);
    expect(floating).toEqual([]);
    // Not merely chained: each part TOUCHES the palm itself.
    for (const r of rows) expect(r.toReceiver, `${r.name} to palm`).toBeLessThanOrEqual(ATTACH_TOL);
  });

  it("hangs the forearm from a wrist joint on the palm's back face", () => {
    const forearm = parts.find((p) => p.name === "forearm")!;
    expect(forearm.joint).toBeDefined();
    const at = forearm.joint!.at;
    // The joint is on the palm's wrist (−Z) face, inside its outline, and on the forearm's near face.
    expect(at[2]).toBeCloseTo(palm.box.min[2], 9);
    expect(at[0]).toBeGreaterThanOrEqual(palm.box.min[0]); expect(at[0]).toBeLessThanOrEqual(palm.box.max[0]);
    expect(at[1]).toBeGreaterThanOrEqual(palm.box.min[1]); expect(at[1]).toBeLessThanOrEqual(palm.box.max[1]);
    expect(forearm.box.max[2]).toBeCloseTo(at[2], 9);
    // The elbow tilts down and swings outward: right to +X, left to −X (Babylon's Y rotation sends
    // the −Z far end towards −X for a positive angle).
    const [rx, ry] = forearm.joint!.rotation;
    expect(rx).toBeLessThan(0);
    const elbowX = -Math.sin(ry) * (forearm.box.max[2] - forearm.box.min[2]);
    expect(Math.sign(elbowX)).toBe(side === "right" ? 1 : -1);
  });

  it("puts the thumb on the inner side and the fingers below the palm's front edge", () => {
    const thumb = parts.find((p) => p.name === "thumb")!, fingers = parts.find((p) => p.name === "fingers")!;
    const thumbX = (thumb.box.min[0] + thumb.box.max[0]) / 2;
    expect(Math.sign(thumbX)).toBe(side === "right" ? -1 : 1);
    expect(fingers.box.min[1]).toBeLessThan(palm.box.min[1]);
    expect(fingers.box.max[2]).toBeGreaterThan(palm.box.max[2]);
  });
});

describe("handSpec: the two hands mirror", () => {
  it("left is right reflected in x, for every part", () => {
    const r = handParts("right"), l = handParts("left");
    expect(l.map((p) => p.name)).toEqual(r.map((p) => p.name));
    for (let i = 0; i < r.length; i++) {
      expect(l[i].box.min[0]).toBeCloseTo(-r[i].box.max[0], 9);
      expect(l[i].box.max[0]).toBeCloseTo(-r[i].box.min[0], 9);
      expect(l[i].box.min.slice(1)).toEqual(r[i].box.min.slice(1));
      expect(l[i].box.max.slice(1)).toEqual(r[i].box.max.slice(1));
    }
  });
});
