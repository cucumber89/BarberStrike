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

/** Broadphase cell size in metres. A player capsule is ~0.8 m wide, the map ~100 × 70 m. */
const CELL = 4;
/** Below this a linear scan wins: building and walking a grid costs more than testing the boxes. */
const GRID_MIN_BOXES = 24;

export class CollisionWorld {
  readonly boxes: Box[] = [];

  /**
   * Uniform XZ grid over `boxes`, in CSR form: `start[c]..start[c+1]` indexes into `items`, which
   * holds box indices. Built lazily on the first query and thrown away by `add`.
   *
   * MEASURED (see `collision.bench.test.ts`): every query used to be a linear scan of every box on
   * the map. Standing still that is hundreds of AABB tests per tick; pressed against cover the
   * movement code runs the sweep AND a failed step-up, and it was thousands. A client mispredict
   * replays up to 240 inputs in one frame, so the same scan runs 240 times inside one 16.7 ms
   * budget. That is the frame-time spike players feel as the game hitching while they move around
   * cover — and both bomb sites are ringed with cover.
   */
  private gStart: Int32Array | null = null;
  private gItems = new Int32Array(0);
  private gStamp = new Int32Array(0);
  private gVisit = 0;
  private gx0 = 0; private gz0 = 0; private gnx = 0; private gnz = 0;

  add(b: Box): void {
    this.boxes.push(b);
    this.gStart = null;
  }

  addBoxes(list: Box[]): void {
    for (const b of list) this.boxes.push(b);
    this.gStart = null;
  }

  /** Builds the CSR grid. Two passes (count, then fill) so there is exactly one allocation each. */
  private buildGrid(): void {
    const n = this.boxes.length;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const b = this.boxes[i];
      if (b.minX < x0) x0 = b.minX;
      if (b.minZ < z0) z0 = b.minZ;
      if (b.maxX > x1) x1 = b.maxX;
      if (b.maxZ > z1) z1 = b.maxZ;
    }
    this.gx0 = x0; this.gz0 = z0;
    this.gnx = Math.max(1, Math.ceil((x1 - x0) / CELL) + 1);
    this.gnz = Math.max(1, Math.ceil((z1 - z0) / CELL) + 1);
    const cells = this.gnx * this.gnz;
    const counts = new Int32Array(cells + 1);
    const span = (b: Box) => {
      const cx0 = Math.max(0, Math.min(this.gnx - 1, Math.floor((b.minX - this.gx0) / CELL)));
      const cx1 = Math.max(0, Math.min(this.gnx - 1, Math.floor((b.maxX - this.gx0) / CELL)));
      const cz0 = Math.max(0, Math.min(this.gnz - 1, Math.floor((b.minZ - this.gz0) / CELL)));
      const cz1 = Math.max(0, Math.min(this.gnz - 1, Math.floor((b.maxZ - this.gz0) / CELL)));
      return [cx0, cx1, cz0, cz1] as const;
    };
    let total = 0;
    for (let i = 0; i < n; i++) {
      const [cx0, cx1, cz0, cz1] = span(this.boxes[i]);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { counts[cz * this.gnx + cx + 1]++; total++; }
    }
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    const items = new Int32Array(total);
    const cursor = counts.slice(0, cells);
    for (let i = 0; i < n; i++) {
      const [cx0, cx1, cz0, cz1] = span(this.boxes[i]);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) items[cursor[cz * this.gnx + cx]++] = i;
    }
    this.gStart = counts;
    this.gItems = items;
    this.gStamp = new Int32Array(n);
    this.gVisit = 0;
  }

  /** True if the AABB overlaps any static box (with a tiny tolerance so touching faces don't count). */
  overlaps(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const e = 1e-4;
    const boxes = this.boxes;
    if (boxes.length < GRID_MIN_BOXES) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (minX < b.maxX - e && maxX > b.minX + e && minY < b.maxY - e && maxY > b.minY + e && minZ < b.maxZ - e && maxZ > b.minZ + e) return true;
      }
      return false;
    }
    if (!this.gStart) this.buildGrid();
    const start = this.gStart!, items = this.gItems, stamp = this.gStamp;
    const nx = this.gnx, nz = this.gnz;
    const cx0 = Math.max(0, Math.min(nx - 1, Math.floor((minX - this.gx0) / CELL)));
    const cx1 = Math.max(0, Math.min(nx - 1, Math.floor((maxX - this.gx0) / CELL)));
    const cz0 = Math.max(0, Math.min(nz - 1, Math.floor((minZ - this.gz0) / CELL)));
    const cz1 = Math.max(0, Math.min(nz - 1, Math.floor((maxZ - this.gz0) / CELL)));
    // A box spanning several cells appears in each; the stamp keeps it to one AABB test per query.
    const visit = ++this.gVisit;
    for (let cz = cz0; cz <= cz1; cz++) {
      const row = cz * nx;
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = row + cx;
        for (let k = start[c], end = start[c + 1]; k < end; k++) {
          const i = items[k];
          if (stamp[i] === visit) continue;
          stamp[i] = visit;
          const b = boxes[i];
          if (minX < b.maxX - e && maxX > b.minX + e && minY < b.maxY - e && maxY > b.minY + e && minZ < b.maxZ - e && maxZ > b.minZ + e) return true;
        }
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
    // Which boxes to test. Below the grid threshold, or with no grid, every box — otherwise only
    // the ones in the XZ cells the ray actually crosses (DDA), which for a hitscan across a corner
    // of the map is a handful of the map's several hundred boxes.
    //
    // The nearest-hit tie-break must not change: the old loop used a strict `tmin < out.t`, so on
    // exactly equal distances the box EARLIER in `boxes` won. Cell order is not array order, so the
    // comparison below carries the index explicitly and the result is identical either way.
    let best = Infinity;
    const useGrid = this.boxes.length >= GRID_MIN_BOXES;
    if (useGrid && !this.gStart) this.buildGrid();
    const order = useGrid ? this.rayCells(ox, oz, dx, dz, maxT) : null;
    const n = order ? order.length : this.boxes.length;
    for (let q = 0; q < n; q++) {
      const i = order ? order[q] : q;
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

      if ((tmin < out.t || (tmin === out.t && i < best)) && tmin >= 0 && axis >= 0) {
        out.hit = true;
        out.t = tmin;
        best = i;
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

  /** Scratch for `rayCells`, reused so a hot raycast allocates nothing. */
  private rayBuf = new Int32Array(0);

  /**
   * Box indices in the XZ cells the ray segment crosses, each index once, walked with a 2-D DDA.
   * Returned in traversal order; `raycast` does not depend on that order for correctness.
   */
  private rayCells(ox: number, oz: number, dx: number, dz: number, maxT: number): Int32Array {
    const start = this.gStart!, items = this.gItems, stamp = this.gStamp;
    const nx = this.gnx, nz = this.gnz;
    if (this.rayBuf.length < this.boxes.length) this.rayBuf = new Int32Array(this.boxes.length);
    const out = this.rayBuf;
    let m = 0;
    const visit = ++this.gVisit;
    const push = (c: number) => {
      for (let k = start[c], end = start[c + 1]; k < end; k++) {
        const i = items[k];
        if (stamp[i] === visit) continue;
        stamp[i] = visit;
        out[m++] = i;
      }
    };
    let cx = Math.floor((ox - this.gx0) / CELL);
    let cz = Math.floor((oz - this.gz0) / CELL);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDeltaX = stepX === 0 ? Infinity : Math.abs(CELL / dx);
    const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(CELL / dz);
    // Distance along the ray to the first cell boundary on each axis.
    let tMaxX = stepX === 0 ? Infinity : ((this.gx0 + (cx + (stepX > 0 ? 1 : 0)) * CELL) - ox) / dx;
    let tMaxZ = stepZ === 0 ? Infinity : ((this.gz0 + (cz + (stepZ > 0 ? 1 : 0)) * CELL) - oz) / dz;
    // A ray starting outside the grid: skip forward to where it enters, or give up if it never does.
    let guard = nx + nz + 2;
    while ((cx < 0 || cx >= nx || cz < 0 || cz >= nz) && guard-- > 0) {
      if (tMaxX < tMaxZ) { if (tMaxX > maxT) return out.subarray(0, m); cx += stepX; tMaxX += tDeltaX; }
      else { if (tMaxZ > maxT) return out.subarray(0, m); cz += stepZ; tMaxZ += tDeltaZ; }
      if (!Number.isFinite(tMaxX) && !Number.isFinite(tMaxZ)) return out.subarray(0, m);
    }
    while (cx >= 0 && cx < nx && cz >= 0 && cz < nz) {
      push(cz * nx + cx);
      if (tMaxX < tMaxZ) { if (tMaxX > maxT) break; cx += stepX; tMaxX += tDeltaX; }
      else { if (tMaxZ > maxT) break; cz += stepZ; tMaxZ += tDeltaZ; }
      if (stepX === 0 && stepZ === 0) break; // a purely vertical ray stays in one cell
    }
    return out.subarray(0, m);
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
