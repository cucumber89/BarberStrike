import { describe, expect, it } from "vitest";
import type { PartBox } from "./weaponFit";
import { attachParts, boxGap, checkAnchors, judgeWeapon, pickReceiver, pointGap, summaryLine, type NamedBox } from "./weaponParts";

const box = (name: string, min: [number, number, number], max: [number, number, number]): NamedBox => ({ name, box: { min, max } });

describe("boxGap / pointGap", () => {
  it("is zero for overlapping and touching boxes, the axis gap for separated ones", () => {
    const a: PartBox = { min: [0, 0, 0], max: [1, 1, 1] };
    expect(boxGap(a, { min: [0.5, 0.5, 0.5], max: [2, 2, 2] })).toBe(0);
    expect(boxGap(a, { min: [1, 0, 0], max: [2, 1, 1] })).toBe(0);
    expect(boxGap(a, { min: [1.003, 0, 0], max: [2, 1, 1] })).toBeCloseTo(0.003, 9);
    // Diagonal separation is the Euclidean norm of the per-axis gaps.
    expect(boxGap(a, { min: [1.003, 1.004, 0], max: [2, 2, 1] })).toBeCloseTo(0.005, 9);
    expect(pointGap([0.5, 0.5, 0.5], a)).toBe(0);
    expect(pointGap([1.01, 0.5, 0.5], a)).toBeCloseTo(0.01, 9);
  });
});

describe("pickReceiver", () => {
  it("prefers a part named as a receiver over the biggest part", () => {
    const parts = [box("Magazine", [0, -0.2, 0], [0.03, 0, 0.03]), box("Stock", [0, 0, -0.3], [0.05, 0.08, 0]), box("frame", [0, 0, 0], [0.03, 0.03, 0.2])];
    expect(pickReceiver(parts)?.name).toBe("frame");
  });
  it("falls back to the largest part that is not excluded", () => {
    const parts = [box("Magazine", [0, -0.2, 0], [0.03, 0, 0.03]), box("Handguard", [0, 0, 0], [0.05, 0.05, 0.2]), box("Barrel", [0, 0, 0], [0.01, 0.01, 0.4])];
    expect(pickReceiver(parts, ["Magazine"])?.name).toBe("Handguard");
    // A big magazine must not win by volume.
    const drum = [box("Magazine", [-0.1, -0.2, -0.1], [0.1, 0, 0.1]), box("part0:metal", [0, 0, 0], [0.05, 0.05, 0.2])];
    expect(pickReceiver(drum, ["Magazine"])?.name).toBe("part0:metal");
  });
});

describe("attachParts", () => {
  const receiver = box("receiver", [-0.02, 0, 0], [0.02, 0.05, 0.2]);
  it("attaches through a chain and reports both distances", () => {
    const handguard = box("Handguard", [-0.02, 0, 0.2], [0.02, 0.04, 0.4]);   // touches the receiver
    const barrel = box("Barrel", [-0.01, 0.01, 0.4], [0.01, 0.03, 0.6]);        // touches the handguard only
    const rows = attachParts([receiver, handguard, barrel], receiver);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Barrel.attached).toBe(true);
    expect(byName.Barrel.toReceiver).toBeCloseTo(0.2, 9);
    expect(byName.Barrel.nearest).toBe("Handguard");
    expect(byName.Barrel.toNearest).toBe(0);
    expect(byName.receiver.attached).toBe(true);
  });
  it("flags a part further than the tolerance from everything", () => {
    const sight = box("Rear_Sight", [-0.005, 0.056, 0.05], [0.005, 0.07, 0.06]);  // 6 mm above the receiver
    const rows = attachParts([receiver, sight], receiver);
    expect(rows.find((r) => r.name === "Rear_Sight")?.attached).toBe(false);
    expect(attachParts([receiver, sight], receiver, 0.0061).find((r) => r.name === "Rear_Sight")?.attached).toBe(true);
  });
  it("does not attach a cluster that only touches itself", () => {
    const a = box("A", [0, 0.1, 0], [0.01, 0.11, 0.01]);
    const b = box("B", [0, 0.11, 0], [0.01, 0.12, 0.01]);
    const rows = attachParts([receiver, a, b], receiver);
    expect(rows.filter((r) => !r.attached).map((r) => r.name)).toEqual(["A", "B"]);
  });
});

describe("checkAnchors", () => {
  const receiver = box("receiver", [-0.02, 0, 0], [0.02, 0.05, 0.2]);
  const grip = box("Grip", [-0.015, -0.1, -0.02], [0.015, 0, 0.02]);
  const barrel = box("Barrel", [-0.008, 0.02, 0.2], [0.008, 0.036, 0.45]);
  const front = box("Front_Sight", [-0.003, 0.05, 0.42], [0.003, 0.07, 0.43]);
  const rear = box("Rear_Sight", [-0.01, 0.05, 0.02], [0.01, 0.06, 0.03]);
  const mag = box("Magazine", [-0.012, -0.15, 0.05], [0.012, 0.0, 0.08]);
  const handguard = box("Handguard", [-0.02, -0.012, 0.2], [0.02, 0.045, 0.4]);
  const parts = [receiver, grip, barrel, front, rear, mag, handguard];

  it("passes anchors that sit on their parts", () => {
    const checks = checkAnchors({
      gripOrigin: [0, 0, 0], muzzle: [0, 0.028, 0.45], aimPoint: [0, 0.06, 0.025], eject: [0.02, 0.04, 0.1],
      supportHand: { centre: [-0.03, -0.035, 0.3], size: [0.058, 0.04, 0.075] },
      grip: [grip], barrel: [barrel], sights: [front, rear], magazine: [mag],
    }, parts, receiver);
    expect(checks.map((c) => [c.anchor, c.ok])).toEqual([["grip", true], ["muzzle", true], ["aimPoint", true], ["eject", true], ["magazine", true], ["supportHand", true]]);
  });

  it("fails a muzzle short of the barrel, a floating aim point, an unseated magazine and a hand in the air", () => {
    const loose = box("Magazine", [-0.012, -0.15, 0.05], [0.012, -0.01, 0.08]);   // 10 mm below the receiver
    const checks = checkAnchors({
      gripOrigin: [0, 0.03, 0], muzzle: [0, 0.028, 0.5], aimPoint: [0, 0.09, 0.025], eject: [0.02, 0.04, 0.1],
      supportHand: { centre: [-0.03, -0.1, 0.3], size: [0.058, 0.04, 0.075] },
      grip: [grip], barrel: [barrel], sights: [front, rear], magazine: [loose],
    }, [receiver, grip, barrel, front, rear, loose], receiver);
    const bad = checks.filter((c) => !c.ok).map((c) => c.anchor);
    expect(bad).toEqual(["grip", "muzzle", "aimPoint", "magazine", "supportHand"]);
    expect(checks.find((c) => c.anchor === "muzzle")?.gap).toBeCloseTo(0.05, 9);
    expect(checks.find((c) => c.anchor === "magazine")?.gap).toBeCloseTo(0.01, 9);
  });

  it("fails a hand that touches the gun but sits at the muzzle", () => {
    const checks = checkAnchors({
      gripOrigin: [0, 0, 0], muzzle: [0, 0.028, 0.45], aimPoint: [0, 0.06, 0.025],
      supportHand: { centre: [-0.03, 0.028, 0.43], size: [0.058, 0.04, 0.075] }, grip: [grip], barrel: [barrel], sights: [front, rear],
    }, parts, receiver);
    const hand = checks.find((c) => c.anchor === "supportHand")!;
    expect(hand.gap).toBe(0);
    expect(hand.ok).toBe(false);
    expect(hand.note).toMatch(/from the muzzle/);
  });

  it("falls back to 'anywhere on the gun' when the rig named no part, and says so", () => {
    const checks = checkAnchors({ gripOrigin: [0, 0, 0], muzzle: [0, 0.028, 0.45], aimPoint: [0, 0.05, 0.1] }, parts, receiver);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks[0].note).toMatch(/^no grip part named; nearest /);
  });
});

describe("judgeWeapon / summaryLine", () => {
  it("reports floating parts and misplaced anchors in the summary", () => {
    const receiver = box("receiver", [-0.02, 0, 0], [0.02, 0.05, 0.2]);
    const orphan = box("Bipod", [0, -0.2, 0.3], [0.01, -0.1, 0.31]);
    const good = judgeWeapon("rifle", "gltf", [receiver], receiver, { gripOrigin: [0, 0, 0], muzzle: [0, 0.02, 0.2], aimPoint: [0, 0.05, 0.1] });
    const bad = judgeWeapon("lmg", "procedural", [receiver, orphan], receiver, { gripOrigin: [0, 0, 0], muzzle: [0, 0.02, 0.3], aimPoint: [0, 0.05, 0.1] });
    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.floating).toEqual(["Bipod"]);
    expect(bad.misplaced).toEqual(["muzzle"]);
    expect(summaryLine([good, bad])).toBe("weapon-parts: 1/2 pass — FAIL lmg[float:Bipod,anchor:muzzle]");
  });
});
