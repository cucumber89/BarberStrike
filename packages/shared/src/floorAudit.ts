import { NIGHT_DISTRICT, sitesOf, type MapDef, type Solid } from "./map";
import type { Box } from "./collision";
import { BOMB } from "./bomb";

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

/** The six face directions of a box, as the audit names them. */
export type FaceDir = "-X" | "+X" | "-Y" | "+Y" | "-Z" | "+Z";

export interface CoplanarFacePair {
  a: string;
  b: string;
  /** Which face of both solids lies on the shared plane. */
  dir: FaceDir;
  dyMm: number;
  area: number;
  exact: boolean;
  x: number;
  y: number;
  z: number;
}

/**
 * The same defect as `coplanarTopFaces`, on all six directions instead of one.
 *
 * The top-face audit exists because a floor that z-fights is what a player reported as "the floor
 * lags". Nothing about that argument is specific to floors: two surfaces facing the same way on the
 * same plane cannot be ordered by a depth buffer, so the pixels flip as the camera moves, and a
 * wall does it just as visibly as a floor. NIGHT_DISTRICT passed the top-face audit with zero pairs
 * while carrying **54** of these — the biggest 9.1 m², and twenty of them one mistake repeated in
 * the helper that builds the depot and the cafe.
 *
 * Two solids that merely BUTT are not a defect and are not reported: their shared plane carries one
 * face pointing each way, and backface culling settles which is drawn. Only solids that actually
 * interpenetrate can put two same-facing surfaces on one plane, so that is the whole search.
 */
export function coplanarFaces(solids: readonly Solid[] = NIGHT_DISTRICT.solids): CoplanarFacePair[] {
  const out: CoplanarFacePair[] = [];
  const lo = (b: Box, axis: number) => (axis === 0 ? b.minX : axis === 1 ? b.minY : b.minZ);
  const hi = (b: Box, axis: number) => (axis === 0 ? b.maxX : axis === 1 ? b.maxY : b.maxZ);
  const DIRS: FaceDir[] = ["-X", "+X", "-Y", "+Y", "-Z", "+Z"];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const A = solids[i].box, B = solids[j].box;
    const over = [0, 1, 2].map((axis) => Math.min(hi(A, axis), hi(B, axis)) - Math.max(lo(A, axis), lo(B, axis)));
    if (over[0] <= 0 || over[1] <= 0 || over[2] <= 0) continue;
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const area = over[u] * over[v];
      if (area < MIN_OVERLAP_M2) continue;
      for (const sign of [-1, 1]) {
        const d = sign < 0 ? lo(A, axis) - lo(B, axis) : hi(A, axis) - hi(B, axis);
        if (Math.abs(d) > EPS_NEAR) continue;
        const mid = (axis2: number) => (Math.max(lo(A, axis2), lo(B, axis2)) + Math.min(hi(A, axis2), hi(B, axis2))) / 2;
        out.push({
          a: label(solids[i]), b: label(solids[j]), dir: DIRS[axis * 2 + (sign > 0 ? 1 : 0)],
          dyMm: Math.round(d * 100000) / 100, area: Math.round(area * 100) / 100,
          exact: Math.abs(d) <= EPS_EXACT, x: mid(0), y: mid(1), z: mid(2),
        });
      }
    }
  }
  return out.sort((p, q) => q.area - p.area);
}

export interface SiteLoad { site: string; name: string; areaM2: number; solids: number; props: number }

/**
 * A plantable site is a CIRCLE of `BOMB.useRadius` around its point (main's #14 replaced the old
 * 10 x 8 rectangles). The load figures below use a wider disc than that — a player watching a site
 * stands off it, so the geometry that costs them frames is the geometry around it, not only the
 * few metres they can plant in.
 */
const SITE_LOAD_RADIUS = BOMB.useRadius + 5;

const inside = (x: number, z: number, s: { x: number; z: number }, radius: number): boolean =>
  Math.hypot(x - s.x, z - s.z) <= radius;

/** How much geometry sits inside each plant zone — the frame-rate half of the diagnosis. */
export function siteLoad(map: MapDef = NIGHT_DISTRICT): SiteLoad[] {
  return sitesOf(map).map((s) => ({
    site: s.id,
    name: s.name,
    areaM2: Math.round(Math.PI * SITE_LOAD_RADIUS * SITE_LOAD_RADIUS),
    solids: map.solids.filter((v) => inside((v.box.minX + v.box.maxX) / 2, (v.box.minZ + v.box.maxZ) / 2, s, SITE_LOAD_RADIUS)).length,
    props: (map.props ?? []).filter((p) => inside(p.x, p.z, s, SITE_LOAD_RADIUS)).length,
  }));
}

/** The bomb site a coplanar pair sits in or beside — a shimmer is seen from well outside the site. */
export function siteOf(x: number, z: number, map: MapDef = NIGHT_DISTRICT): string | null {
  return sitesOf(map).find((s) => inside(x, z, s, SITE_LOAD_RADIUS + 6))?.id ?? null;
}
