import { buildCollisionWorld, type MapDef } from "./map";
import { PLAYER } from "./constants";

/**
 * Coarse walkability model of a map, used by the map validity tests (and available to tools):
 * a 0.5 m grid where each cell lists the heights a player can stand at (tops of solids under the
 * cell's footprint with a free body volume above). Moves between neighbouring cells allow the
 * real step height, a jump-up of v²/2g, and any drop THE AIR ALLOWS: a drop from y to a lower
 * standing height is legal only when nothing solid lies over the lower height up to the head of a
 * body at y (`clearance`). Without that rule a three-storey house (DOLNA 17) is one cell deep: a
 * cell under a slab lists the floor, the first floor and the second, and "any drop" walks a bot
 * straight through the slab — measured as every route from the top floor ending stuck against
 * the floor it was told to fall through.
 */

export const WALK_GRID = 0.5;
const HW = PLAYER.halfWidth, H = PLAYER.height;
export const JUMP_UP = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity) - 0.05; // ≈ 0.88 m

export interface Walk {
  cells: Map<string, number[]>;
  /** Per cell, per standing height: the underside of the lowest solid above a standing body there (Infinity for open sky). */
  clearance: Map<string, number[]>;
  grid: number;
}
/** May a body standing at `fromY` drop into height index `i` of the cell (never a question for a rise)? */
export const canDrop = (walk: Walk, key: string, i: number, fromY: number): boolean => {
  const ys = walk.cells.get(key);
  if (!ys || ys[i] >= fromY - 0.01) return true;
  const c = walk.clearance.get(key);
  return !c || fromY + PLAYER.height <= c[i] + 1e-3;
};

export const snapCoord = (v: number): number => Math.floor(v / WALK_GRID) * WALK_GRID + WALK_GRID / 2;
export const cellKey = (x: number, z: number): string => `${Math.round(snapCoord(x) * 2)},${Math.round(snapCoord(z) * 2)}`;

export function walkable(map: MapDef): Walk {
  const w = buildCollisionWorld(map);
  const b = map.bounds;
  const cells = new Map<string, number[]>();
  const clearance = new Map<string, number[]>();
  const foot = HW * 0.6;
  const STEP = PLAYER.stepHeight;
  for (let x = b.minX + WALK_GRID / 2; x < b.maxX; x += WALK_GRID) {
    for (let z = b.minZ + WALK_GRID / 2; z < b.maxZ; z += WALK_GRID) {
      // Candidate heights: tops of solids under the whole BODY footprint. A cell next to a kerb
      // must be able to stand at kerb height (the body overlaps the kerb at floor height and the
      // real mover steps up), so the candidate set is wider than the ground check below.
      const tops = new Set<number>();
      const under: number[] = [];
      const over: number[] = [];   // undersides of everything over the footprint, for the clearance
      for (const s of map.solids) {
        const bx = s.box;
        if (bx.maxX <= x - HW || bx.minX >= x + HW || bx.maxZ <= z - HW || bx.minZ >= z + HW) continue;
        over.push(bx.minY);
        if (bx.maxY <= map.killY || bx.maxY > b.maxY) continue;
        const t = Math.round(bx.maxY * 100) / 100;
        tops.add(t);
        if (!(bx.maxX <= x - foot || bx.minX >= x + foot || bx.maxZ <= z - foot || bx.minZ >= z + foot)) under.push(t);
      }
      const ys: number[] = [];
      for (const y of tops) {
        if (w.overlaps(x - HW, y + 0.02, z - HW, x + HW, y + H, z + HW)) continue;
        // Ground within a step below the feet (the mover would settle there and step up).
        if (!under.some((t) => t <= y + 0.001 && y - t <= STEP)) continue;
        ys.push(y);
      }
      if (ys.length) {
        ys.sort((p, q) => p - q);
        cells.set(cellKey(x, z), ys);
        clearance.set(cellKey(x, z), ys.map((y) => over.reduce((m, u) => (u >= y + H - 1e-6 && u < m ? u : m), Infinity)));
      }
    }
  }
  return { cells, clearance, grid: WALK_GRID };
}

/** Every "cell@height" reachable on foot from `from`. */
export function reachable(walk: Walk, from: { x: number; y: number; z: number }): Set<string> {
  const sx = snapCoord(from.x), sz = snapCoord(from.z);
  const ys = walk.cells.get(cellKey(sx, sz)) ?? [];
  let sy = ys[0];
  for (const y of ys) if (Math.abs(y - from.y) < Math.abs(sy - from.y)) sy = y;
  const seen = new Set<string>();
  if (sy === undefined) return seen;
  const stack: [number, number, number][] = [[sx, sz, sy]];
  seen.add(`${cellKey(sx, sz)}@${sy}`);
  while (stack.length) {
    const [x, z, y] = stack.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx * walk.grid, nz = z + dz * walk.grid;
      const nk = cellKey(nx, nz);
      const nys = walk.cells.get(nk);
      if (!nys) continue;
      for (let i = 0; i < nys.length; i++) {
        const ny = nys[i];
        if (ny - y > JUMP_UP || !canDrop(walk, nk, i, y)) continue;
        const k = `${nk}@${ny}`;
        if (seen.has(k)) continue;
        seen.add(k);
        stack.push([nx, nz, ny]);
      }
    }
  }
  return seen;
}

/** True if any standing height of the cell containing (x, z) is in the reachable set. */
export function cellReached(seen: Set<string>, x: number, z: number): boolean {
  const prefix = cellKey(x, z) + "@";
  for (const k of seen) if (k.startsWith(prefix)) return true;
  return false;
}
