import { NIGHT_DISTRICT, type Solid } from "./map";
import { BOMB_SITES, type BombSite } from "./bomb";

/**
 * Floor audit — the diagnosis behind the report that "the floor at A and B lags".
 *
 * "Lag" from a player is a symptom with several possible causes, and they need separating before
 * anything is changed. This module measures the map DATA, which is where two of them live:
 *
 *  1. COPLANAR TOP FACES. Two solids whose upper surfaces sit at the same Y and overlap in XZ.
 *     The depth buffer cannot order them, so which surface wins flips per pixel and per frame as
 *     the camera moves. On screen that is a crawling shimmer over the whole shared area, and a
 *     shimmering floor is exactly what a player describes as the floor lagging. Pure data, so it
 *     is fixable here and provable by a test.
 *  2. NEAR-COPLANAR faces (within 5 mm). The same failure at distance, once a perspective depth
 *     buffer has spent its precision.
 *  3. LOAD. Solids and props packed into a site zone, which is what a real frame-rate drop
 *     localised at A and B would look like.
 *
 * A coplanar pair is a defect whatever the cause of the report, so the test gates on (1).
 */

/** Same Y to within a millimetre: the depth buffer has no chance. */
export const EPS_EXACT = 0.001;
/** Within 5 mm: safe up close, fights at distance. */
export const EPS_NEAR = 0.005;
/** Below this shared area a pair is trim meeting trim, not a floor a player stands on. */
export const MIN_OVERLAP_M2 = 0.25;

export interface CoplanarPair {
  a: string;
  b: string;
  /** Height of the two faces. */
  y: number;
  /** Vertical separation in millimetres. */
  dyMm: number;
  /** Shared footprint in m². */
  area: number;
  /** True when the pair is within EPS_EXACT — unorderable at any distance. */
  exact: boolean;
  x: number;
  z: number;
}

/** `Solid.name` is optional; an unnamed solid is still worth reporting, by where it is. */
const label = (s: Solid): string => s.name ?? `unnamed@${s.box.minX},${s.box.minY},${s.box.minZ}`;

const sharedFootprint = (a: Solid, b: Solid): number => {
  const w = Math.min(a.box.maxX, b.box.maxX) - Math.max(a.box.minX, b.box.minX);
  const d = Math.min(a.box.maxZ, b.box.maxZ) - Math.max(a.box.minZ, b.box.minZ);
  return w > 0 && d > 0 ? w * d : 0;
};

/** Every pair of solids whose TOP faces are coplanar (or nearly) and overlap, worst first. */
export function coplanarTopFaces(solids: readonly Solid[] = NIGHT_DISTRICT.solids): CoplanarPair[] {
  const out: CoplanarPair[] = [];
  // Sorting by top face turns the O(n²) sweep into a short scan per solid: once the partner's top
  // is more than EPS_NEAR above, no later one can match either.
  const sorted = [...solids].sort((p, q) => p.box.maxY - q.box.maxY);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const dy = b.box.maxY - a.box.maxY;
      if (dy > EPS_NEAR) break;
      const area = sharedFootprint(a, b);
      if (area < MIN_OVERLAP_M2) continue;
      out.push({
        a: label(a), b: label(b), y: a.box.maxY, dyMm: Math.round(dy * 100000) / 100, area: Math.round(area * 100) / 100,
        exact: dy <= EPS_EXACT,
        x: (Math.max(a.box.minX, b.box.minX) + Math.min(a.box.maxX, b.box.maxX)) / 2,
        z: (Math.max(a.box.minZ, b.box.minZ) + Math.min(a.box.maxZ, b.box.maxZ)) / 2,
      });
    }
  }
  return out.sort((p, q) => q.area - p.area);
}

export interface SiteLoad { site: "A" | "B"; name: string; areaM2: number; solids: number; props: number }

const inside = (x: number, z: number, s: BombSite, pad = 0): boolean =>
  x >= s.x - s.hw - pad && x <= s.x + s.hw + pad && z >= s.z - s.hd - pad && z <= s.z + s.hd + pad;

/** How much geometry sits inside each plant zone — the frame-rate half of the diagnosis. */
export function siteLoad(map = NIGHT_DISTRICT): SiteLoad[] {
  return BOMB_SITES.map((s) => ({
    site: s.id,
    name: s.name,
    areaM2: s.hw * 2 * s.hd * 2,
    solids: map.solids.filter((v) => inside((v.box.minX + v.box.maxX) / 2, (v.box.minZ + v.box.maxZ) / 2, s)).length,
    props: (map.props ?? []).filter((p) => inside(p.x, p.z, s)).length,
  }));
}

/** The bomb site a coplanar pair sits in or beside (6 m of slack: a shimmer is seen from outside). */
export function siteOf(x: number, z: number): "A" | "B" | null {
  return BOMB_SITES.find((s) => inside(x, z, s, 6))?.id ?? null;
}
