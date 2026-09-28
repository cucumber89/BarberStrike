import { describe, expect, it } from "vitest";
import { MAPS, NIGHT_DISTRICT, type Solid } from "@frankibarber/shared";
import { SURFACES, SurfaceProbe, surfaceOf } from "./surfaces";

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => ({ minX, minY, minZ, maxX, maxY, maxZ });

describe("what is underfoot", () => {
  it("maps every material on every map onto a surface the sound design knows", () => {
    for (const map of Object.values(MAPS)) for (const s of map.solids) expect(SURFACES, `${map.id} ${s.name ?? s.mat}`).toContain(surfaceOf(s.mat));
    expect(surfaceOf("floor_metal")).toBe("metal");
    expect(surfaceOf("floor_tile")).toBe("tile");
    expect(surfaceOf("floor_wood")).toBe("wood");
    expect(surfaceOf("gravel")).toBe("gravel");
    expect(surfaceOf("grass")).toBe("grass");
    expect(surfaceOf("water")).toBe("water");
    expect(surfaceOf("floor_asphalt")).toBe("concrete");
  });

  it("finds the highest floor within reach below the feet, and nothing in the air", () => {
    const solids: Solid[] = [
      { box: box(-10, -1, -10, 10, 0, 10), mat: "floor_concrete" },
      { box: box(0, 2.75, 0, 3, 3, 3), mat: "floor_metal" },   // a catwalk over it
      { box: box(5, 0, 5, 6, 0.3, 6), mat: "floor_wood" },     // a pallet
    ];
    const p = new SurfaceProbe(solids);
    expect(p.under(-5, 0, -5)).toBe("concrete");
    expect(p.under(1, 0, 1)).toBe("concrete");     // under the catwalk, on the ground
    expect(p.under(1, 3, 1)).toBe("metal");        // on the catwalk
    expect(p.under(1, 3.3, 1)).toBe("metal");      // a stair lip's worth above it
    expect(p.solidUnder(1, 1.5, 1)).toBeNull();    // mid-air between the two
    expect(p.under(5.5, 0.3, 5.5)).toBe("wood");   // stepped up onto the pallet
    expect(p.solidUnder(50, 0, 50)).toBeNull();    // off the map
    expect(p.under(50, 0, 50)).toBe("concrete");   // ...and the fallback is the neutral step
  });

  it("hears the real map's floors: the shop's tiles, the mezzanine's steel over the concrete", () => {
    const p = new SurfaceProbe(NIGHT_DISTRICT.solids);
    expect(p.under(2, 0, 5)).toBe("tile");
    expect(p.under(9.5, 3, 9)).toBe("metal");
    expect(p.under(9.5, 0, 9)).toBe("concrete");
  });

  it("puts a floor under every spawn on every map, and many kinds of floor across the roster", () => {
    const kinds = new Set<string>();
    for (const map of Object.values(MAPS)) {
      const p = new SurfaceProbe(map.solids);
      for (const s of map.spawns) {
        const under = p.solidUnder(s.x, s.y, s.z);
        expect(under, `${map.id} spawn ${s.x},${s.z}`).not.toBeNull();
        if (under) kinds.add(surfaceOf(under.mat));
      }
      for (const s of map.solids) if (s.box.maxY - s.box.minY <= 1.01) kinds.add(surfaceOf(s.mat));
    }
    // Concrete, tile, wood, metal, gravel, grass at the least: the floors the maps are built of.
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });
});
