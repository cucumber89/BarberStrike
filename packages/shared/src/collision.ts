/**
 * Minimal static collision world made of axis-aligned boxes.
 * Used by the server (authoritative movement + hitscan) and by the client (prediction).
 * Kept allocation-free on hot paths: callers pass scratch objects.
 */

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface RayHit {
  hit: boolean;
  t: number;
  /** Hit point. */
  x: number;
  y: number;
  z: number;
  /** Surface normal. */
  nx: number;
  ny: number;
  nz: number;
}

export const makeRayHit = (): RayHit => ({ hit: false, t: Infinity, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 });

export class CollisionWorld {
  readonly boxes: Box[] = [];

  add(b: Box): void {
    this.boxes.push(b);
  }

  addBoxes(list: Box[]): void {
    for (const b of list) this.boxes.push(b);
  }

  /** True if the AABB overlaps any static box (with a tiny tolerance so touching faces don't count). */
  overlaps(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const e = 1e-4;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (minX < b.maxX - e && maxX > b.minX + e && minY < b.maxY - e && maxY > b.minY + e && minZ < b.maxZ - e && maxZ > b.minZ + e) {
        return true;
      }
    }
    return false;
  }

  /**
   * Ray vs all boxes (slab method). Writes the nearest hit into `out` (reused by caller).
   * `maxT` limits the search distance.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: RayHit): RayHit {
    out.hit = false;
    out.t = maxT;
    const idx = 1 / dx;
    const idy = 1 / dy;
    const idz = 1 / dz;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      let tmin = 0;
      let tmax = out.t;
      let axis = -1;
      let sign = 0;

      let t1 = (b.minX - ox) * idx;
      let t2 = (b.maxX - ox) * idx;
      let s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;

      t1 = (b.minY - oy) * idy;
      t2 = (b.maxY - oy) * idy;
      s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;

      t1 = (b.minZ - oz) * idz;
      t2 = (b.maxZ - oz) * idz;
      s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;

      if (tmin < out.t && tmin >= 0 && axis >= 0) {
        out.hit = true;
        out.t = tmin;
        out.nx = axis === 0 ? sign : 0;
        out.ny = axis === 1 ? sign : 0;
        out.nz = axis === 2 ? sign : 0;
      }
    }
    if (out.hit) {
      out.x = ox + dx * out.t;
      out.y = oy + dy * out.t;
      out.z = oz + dz * out.t;
    }
    return out;
  }
}

/** Ray vs a single AABB. Returns entry distance or -1. */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box, maxT: number): number {
  let tmin = 0;
  let tmax = maxT;
  const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz;
  let t1 = (b.minX - ox) * idx, t2 = (b.maxX - ox) * idx;
  if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
  tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  if (tmin > tmax) return -1;
  t1 = (b.minY - oy) * idy; t2 = (b.maxY - oy) * idy;
  if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
  tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  if (tmin > tmax) return -1;
  t1 = (b.minZ - oz) * idz; t2 = (b.maxZ - oz) * idz;
  if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
  tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
  if (tmin > tmax) return -1;
  return tmin;
}

/** Convenience for map authoring: box from centre + size. */
export function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Box {
  return {
    minX: cx - sx / 2, minY: cy - sy / 2, minZ: cz - sz / 2,
    maxX: cx + sx / 2, maxY: cy + sy / 2, maxZ: cz + sz / 2,
  };
}

/** Box from min corner + size (floor-anchored authoring). */
export function boxFrom(minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number): Box {
  return { minX, minY, minZ, maxX: minX + sx, maxY: minY + sy, maxZ: minZ + sz };
}
