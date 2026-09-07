import { describe, expect, it } from "vitest";
import { WEAPON_ORDER, WEAPONS, type WeaponId } from "@frankibarber/shared";
import { partAabb, proceduralParts, weaponMetrics } from "./weaponMeshes";
import { sizeOf } from "./weaponFit";

/**
 * The procedural weapons as pure geometry: every part's AABB in root space, without a Scene. This
 * is what a headless "nothing floats" check measures against, so it has to cover every weapon and
 * agree with the metrics the loader path already uses.
 */

const ids = Object.keys(WEAPONS) as WeaponId[];

describe("proceduralParts", () => {
  it("covers every WeaponId", () => {
    expect(ids.sort()).toEqual([...WEAPON_ORDER].sort());
  });

  for (const id of ids) {
    it(`${id}: has parts, well-formed boxes and the declared metrics`, () => {
      const p = proceduralParts(id);
      expect(p.parts.length).toBeGreaterThan(0);
      for (const { name, box } of [...p.parts, ...p.magazine]) {
        expect(name).toMatch(/^(part|action|mag)\d+:[a-z]+$/);
        for (let k = 0; k < 3; k++) {
          expect(Number.isFinite(box.min[k])).toBe(true);
          expect(Number.isFinite(box.max[k])).toBe(true);
          expect(box.min[k]).toBeLessThanOrEqual(box.max[k]);
        }
      }
      const m = weaponMetrics(id);
      expect(p.length).toBe(m.length);
      expect(p.actionKind).toBe(m.actionKind);
      expect(p.hasMagazine).toBe(m.hasMagazine);
      expect(p.magazine.length > 0).toBe(m.hasMagazine);
      expect(p.parts.some((n) => n.name.startsWith("action"))).toBe(m.actionKind !== "none");
    });
  }

  it("translates magazine parts by magazinePos", () => {
    // The rifle's first magazine part is a box centred on its node, which sits at (0, -0.1, 0.2).
    const mag0 = proceduralParts("rifle").magazine[0].box;
    expect(mag0.min[1] + mag0.max[1]).toBeCloseTo(-0.2);
    expect(mag0.min[2] + mag0.max[2]).toBeCloseTo(0.4);
  });
});

describe("partAabb", () => {
  it("rotating a box a quarter turn about Z swaps its X and Y extents", () => {
    const box = partAabb({ kind: "box", w: 0.1, h: 0.02, d: 0.02, x: 1, y: 2, z: 3, mat: "metal", rz: Math.PI / 2 });
    const [sx, sy, sz] = sizeOf(box);
    expect(sx).toBeCloseTo(0.02, 6);
    expect(sy).toBeCloseTo(0.1, 6);
    expect(sz).toBeCloseTo(0.02, 6);
    expect((box.min[0] + box.max[0]) / 2).toBeCloseTo(1);
    expect((box.min[1] + box.max[1]) / 2).toBeCloseTo(2);
    expect((box.min[2] + box.max[2]) / 2).toBeCloseTo(3);
  });

  it("an unrotated box and an axis-aligned cylinder are their plain extents", () => {
    expect(partAabb({ kind: "box", w: 0.1, h: 0.02, d: 0.04, x: 0, y: 0, z: 0, mat: "metal" })).toEqual({ min: [-0.05, -0.01, -0.02], max: [0.05, 0.01, 0.02] });
    expect(sizeOf(partAabb({ kind: "cyl", dia: 0.02, len: 0.1, x: 0, y: 0, z: 0, mat: "steel" }))).toEqual([0.02, 0.02, 0.1]);
    expect(sizeOf(partAabb({ kind: "cyl", dia: 0.02, len: 0.1, x: 0, y: 0, z: 0, mat: "steel", axis: "x" }))).toEqual([0.1, 0.02, 0.02]);
    expect(sizeOf(partAabb({ kind: "cyl", dia: 0.02, len: 0.1, x: 0, y: 0, z: 0, mat: "steel", axis: "y" }))).toEqual([0.02, 0.1, 0.02]);
  });
});
