/**
 * What is underfoot (owner, 2026-09-28: a new sound mechanic for walking, jumping and the rest).
 *
 * Every solid on every map already carries a `MaterialTag` for the renderer. Before this the audio
 * ignored it: one pink-noise step for tile, steel grating, a lawn and a pool alike. Now a step, a
 * jump, a landing and a falling case all ask the map what they touch, and the ear can tell the
 * catwalk from the concrete under it — which is information, not just flavour: a player on the
 * mezzanine above you SOUNDS like metal.
 *
 * Pure apart from the solids it is given; `surfaces.test.ts` judges it against the real maps.
 */
import type { MaterialTag, Solid } from "@frankibarber/shared";

/** The families the sound design distinguishes. */
export type Surface = "concrete" | "tile" | "wood" | "metal" | "gravel" | "grass" | "water" | "soft";

export const SURFACES: readonly Surface[] = ["concrete", "tile", "wood", "metal", "gravel", "grass", "water", "soft"];

/** One place maps the renderer's materials onto what a boot sounds like on them. */
export function surfaceOf(mat: MaterialTag): Surface {
  switch (mat) {
    case "floor_tile": case "wall_tile": case "floor_epoxy": case "roof_tile":
    case "glass": case "glass_dark": case "glass_car": case "mirror":
      return "tile";
    case "floor_wood": case "wood": case "counter": case "wall_panel":
      return "wood";
    case "floor_metal": case "metal": case "brass": case "fence":
    case "corrugated_red": case "corrugated_blue": case "corrugated_green":
      return "metal";
    case "gravel": return "gravel";
    case "grass": case "foliage": case "soil": return "grass";
    case "water": return "water";
    case "leather": case "rubber": return "soft";
    default: return "concrete"; // asphalt, paving, plaster, brick, paint, blocks: hard mineral
  }
}

/** How far below the feet a top face may be and still be "the ground" (a step, a slope, a lag). */
const BELOW = 0.45;
/** How far above: the body can be pushed a few cm into a floor by prediction. */
const ABOVE = 0.12;
const CELL = 4;

/**
 * Answers "which surface is under (x, y, z)" from the map's solids: the highest top face within a
 * short reach below the feet whose footprint contains the point. Bucketed on a 4 m XZ grid so a
 * query touches a handful of boxes — twenty remotes stepping three times a second is nothing.
 */
export class SurfaceProbe {
  private cells = new Map<number, number[]>();

  constructor(private readonly solids: readonly Solid[]) {
    for (let i = 0; i < solids.length; i++) {
      const b = solids[i].box;
      const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
      const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
      // A map-sized slab spans hundreds of cells; that is fine once, at load.
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let list = this.cells.get(k);
        if (!list) { list = []; this.cells.set(k, list); }
        list.push(i);
      }
    }
  }

  /** The solid the feet stand on, or null in the air / off the map. */
  solidUnder(x: number, y: number, z: number): Solid | null {
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best: Solid | null = null;
    let top = -Infinity;
    for (const i of list) {
      const s = this.solids[i], b = s.box;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.maxY > y + ABOVE || b.maxY < y - BELOW) continue;
      if (b.maxY > top) { top = b.maxY; best = s; }
    }
    return best;
  }

  /** The surface family under the feet; concrete when nothing is found (the safe, neutral step). */
  under(x: number, y: number, z: number): Surface {
    const s = this.solidUnder(x, y, z);
    return s ? surfaceOf(s.mat) : "concrete";
  }
}

const key = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);
