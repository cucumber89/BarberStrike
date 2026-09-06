import { PLAYER } from "./constants";
import { JUMP_UP, cellKey, snapCoord, type Walk } from "./mapWalk";

/**
 * Bot navigation: A* over the map's walk grid (`mapWalk`, 0.5 m cells, each carrying the heights a
 * body can stand at). A move between neighbouring cells allows any drop and a jump-up of JUMP_UP —
 * the same rule `reachable()` uses, so wherever the map validity test says the spawns connect, a
 * bot can get there.
 *
 * Rewritten from an exhaustive 4-neighbour BFS over a string-keyed Map, which was wrong on three
 * counts (drop 6d). All three were measured, and all three were felt by the player:
 *
 *  - COST. 11.5 ms for ONE search on Night District (15 604 cells), against a 16.7 ms server tick.
 *    A bot re-plans whenever a fight ends, so a few bots could put several ticks of pathfinding
 *    into one frame. The server stuttered and every player felt it as the game running badly.
 *  - THE KEYS. Nearly all of that was string building: `cellKey` + `Map.get` costs ~120 ns against
 *    ~4 ns for an integer index into a typed array — MEASURED at 30× over two million lookups. The
 *    grid is now indexed once per map into flat arrays, and the search touches no strings at all.
 *  - SHAPE. Four neighbours means a bot can only walk along the axes, so it crossed open ground in
 *    right-angled staircases. Eight neighbours (with both orthogonal cells checked before a
 *    diagonal, so it cannot cut through the join between two walls) plus a line-of-sight pull over
 *    the result gives the straight diagonal a person would take.
 */

export interface NavPoint { x: number; y: number; z: number }

/** The standing height in the cell containing (x, z) nearest to `y`, or undefined off the grid. */
export function standHeight(walk: Walk, x: number, z: number, y: number): number | undefined {
  const ys = walk.cells.get(cellKey(x, z));
  if (!ys || ys.length === 0) return undefined;
  let best = ys[0];
  for (const h of ys) if (Math.abs(h - y) < Math.abs(best - y)) best = h;
  return best;
}

/**
 * The walk grid as flat arrays: cell (cx, cz) lives at `cz * w + cx`, and its standing heights at
 * `heights[(cell * H) + i]` for `i < count[cell]`. Built once per map and cached, because the
 * point of the exercise is that the search never builds a key or walks a Map.
 *
 * A SLOT is one (cell, height) pair — `cell * H + i`. Slots, not cells, are the search nodes: a
 * mezzanine cell stands at two heights, and which one the bot is on decides where it can step
 * next. Collapsing them was the bug that lost a third of the routes on the first attempt.
 */
interface WalkIndex {
  w: number; d: number; H: number;
  /** World x/z of the centre of cell (0, 0). */
  ox: number; oz: number;
  grid: number;
  count: Uint8Array;
  heights: Float32Array;
  /** Scratch, reused across searches; `stamp` says which search wrote a slot. */
  cost: Float32Array;
  parent: Int32Array;
  stamp: Int32Array;
  /** `done[slot] === gen` once the slot has been expanded — see the pop loop. */
  done: Int32Array;
  gen: number;
}

const INDEX = new WeakMap<Walk, WalkIndex>();

/**
 * Build the index AND warm the search, so neither cost lands inside a server tick.
 *
 * The index parses 15 604 string keys and allocates five arrays of 46 812 entries. Left to happen
 * lazily on the first search, that lands on the frame where the first bot plans — MEASURED at 44 ms
 * for "one search" against a 16.7 ms tick. The throwaway search that follows is for the same
 * reason: the first two real searches in a fresh process MEASURED 24.1 and 19.0 ms where every
 * later one was under 6, which is the interpreter running the loop before the JIT gets to it.
 *
 * Both now happen at room creation, where nothing is waiting. Calling this is optional: skipping it
 * costs the old behaviour, not a wrong answer.
 */
export function prepareNav(walk: Walk): void {
  const idx = indexOf(walk);
  // A long diagonal across the grid: whether it connects does not matter — the point is to run the
  // heap, the neighbour walk and the smoother once each before the match starts.
  const corner = (fx: number, fz: number): NavPoint => ({
    x: idx.ox + Math.floor((idx.w - 1) * fx) * idx.grid,
    y: 0,
    z: idx.oz + Math.floor((idx.d - 1) * fz) * idx.grid,
  });
  findPath(walk, corner(0.1, 0.1), corner(0.9, 0.9));
  findPath(walk, corner(0.9, 0.1), corner(0.1, 0.9));
}

function indexOf(walk: Walk): WalkIndex {
  const cached = INDEX.get(walk);
  if (cached) return cached;
  let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity, H = 1;
  for (const [k, ys] of walk.cells) {
    const c = k.indexOf(",");
    const cx = Number(k.slice(0, c)), cz = Number(k.slice(c + 1));
    if (cx < minCx) minCx = cx; if (cx > maxCx) maxCx = cx;
    if (cz < minCz) minCz = cz; if (cz > maxCz) maxCz = cz;
    if (ys.length > H) H = ys.length;
  }
  if (!Number.isFinite(minCx)) { minCx = maxCx = minCz = maxCz = 0; }
  const w = maxCx - minCx + 1, d = maxCz - minCz + 1;
  const idx: WalkIndex = {
    w, d, H,
    // `cellKey` stores `round(snapCoord(v) / grid)`, and `snapCoord` returns a cell CENTRE, which
    // sits half a cell above that multiple — so key K is centred at `K * grid - grid / 2`. Being
    // out by that half cell put every waypoint on a cell CORNER: the search still ran, but no
    // waypoint was on the grid any more, so `clearLine` could never confirm one.
    ox: minCx * walk.grid - walk.grid / 2, oz: minCz * walk.grid - walk.grid / 2, grid: walk.grid,
    count: new Uint8Array(w * d),
    heights: new Float32Array(w * d * H),
    cost: new Float32Array(w * d * H),
    parent: new Int32Array(w * d * H),
    stamp: new Int32Array(w * d * H),
    done: new Int32Array(w * d * H),
    gen: 0,
  };
  for (const [k, ys] of walk.cells) {
    const c = k.indexOf(",");
    const cell = (Number(k.slice(c + 1)) - minCz) * w + (Number(k.slice(0, c)) - minCx);
    idx.count[cell] = Math.min(255, ys.length);
    for (let i = 0; i < ys.length && i < H; i++) idx.heights[cell * H + i] = ys[i];
  }
  INDEX.set(walk, idx);
  return idx;
}

/** Cell containing a world x (or out of [0, w) when off the grid). */
const cellX = (idx: WalkIndex, x: number): number => Math.round((snapCoord(x) - idx.ox) / idx.grid);
const cellZ = (idx: WalkIndex, z: number): number => Math.round((snapCoord(z) - idx.oz) / idx.grid);
const inGrid = (idx: WalkIndex, cx: number, cz: number): boolean =>
  cx >= 0 && cz >= 0 && cx < idx.w && cz < idx.d;

/**
 * The slot of the height in cell (cx, cz) nearest to `y`, or −1 off the grid. Used for the two ENDS
 * of a search only: the bot is already standing somewhere, and the goal is a place someone picked,
 * so neither is subject to the step rule — matching `standHeight`, which the callers use to place
 * those points in the first place.
 */
function nearestSlot(idx: WalkIndex, cx: number, cz: number, y: number): number {
  if (!inGrid(idx, cx, cz)) return -1;
  const cell = cz * idx.w + cx;
  const n = idx.count[cell];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const dd = Math.abs(idx.heights[cell * idx.H + i] - y);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best === -1 ? -1 : cell * idx.H + best;
}

/** Can a body at height `y` step into cell (cx, cz) at all? Any drop, or a rise of ≤ JUMP_UP. */
function canStep(idx: WalkIndex, cx: number, cz: number, y: number): boolean {
  if (!inGrid(idx, cx, cz)) return false;
  const cell = cz * idx.w + cx;
  const n = idx.count[cell];
  for (let i = 0; i < n; i++) if (idx.heights[cell * idx.H + i] - y <= JUMP_UP) return true;
  return false;
}

/**
 * The height nearest `y` a body at `y` can WALK to in this cell, or −1. Walk, not step: the limit is
 * the mover's own step height rather than a jump, because this is what the smoother uses, and a leg
 * that needs a jump halfway along is a leg the bot gets stuck on — it only presses jump at a
 * waypoint. Keeping the climb as a waypoint is the whole point of leaving it in the path.
 */
function walkSlot(idx: WalkIndex, cx: number, cz: number, y: number): number {
  if (!inGrid(idx, cx, cz)) return -1;
  const cell = cz * idx.w + cx;
  const n = idx.count[cell];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const h = idx.heights[cell * idx.H + i];
    if (h - y > PLAYER.stepHeight) continue;
    const dd = Math.abs(h - y);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best === -1 ? -1 : cell * idx.H + best;
}

const HEAP: number[] = [];
const HEAP_F: number[] = [];

/** Eight neighbours; the last four are diagonals. */
const STEPS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const DIAG = Math.SQRT2;

/**
 * Shortest cell path from `from` to `to`, as waypoints with their standing height, or null when
 * either end is off the grid or the goal is not reachable within `maxExpand` expansions.
 *
 * `maxExpand` is a budget, not a safety net: a bot that cannot reach its goal must give up cheaply,
 * because it will ask again shortly. A real route costs a few hundred expansions and the longest
 * measured on this map 4 011; the cap only bites on genuinely unreachable goals, where the search
 * has to exhaust the connected component before it can say so. MEASURED over 40 spread-out pairs,
 * cap against (routes found / cost of giving up): 3 000 -> 18 / 1.80 ms, 6 000 -> 22 / 2.63 ms,
 * 10 000 -> 22 / 3.61 ms, 20 000 -> 22 / 4.11 ms. 6 000 is the knee: nothing more is ever found
 * above it, and every metre of headroom past it is paid for on the give-up.
 */
export function findPath(walk: Walk, from: NavPoint, to: NavPoint, maxExpand = 6000): NavPoint[] | null {
  const idx = indexOf(walk);
  const H = idx.H, w = idx.w;
  const scx = cellX(idx, from.x), scz = cellZ(idx, from.z);
  const gcx = cellX(idx, to.x), gcz = cellZ(idx, to.z);
  const startSlot = nearestSlot(idx, scx, scz, from.y);
  const goalSlot = nearestSlot(idx, gcx, gcz, to.y);
  if (startSlot < 0 || goalSlot < 0) return null;
  const point = (slot: number): NavPoint => {
    const cell = (slot / H) | 0;
    return { x: idx.ox + (cell % w) * idx.grid, y: idx.heights[slot], z: idx.oz + ((cell / w) | 0) * idx.grid };
  };
  if (startSlot === goalSlot) return [point(startSlot)];

  // Octile distance in CELLS: exact for 8-connected movement with a √2 diagonal, so it never
  // overestimates and A* stays optimal.
  const h = (cx: number, cz: number): number => {
    const dx = Math.abs(cx - gcx), dz = Math.abs(cz - gcz);
    return (dx + dz) - (2 - DIAG) * Math.min(dx, dz);
  };

  const gen = ++idx.gen;
  const { cost, parent, stamp, done, heights, count } = idx;

  // Binary heap over slot ids. The obvious "scan the array for the smallest f" is O(n) per pop and
  // measured no faster than the BFS this replaced — the frontier is where the saving lives. The two
  // arrays are module-level and reused: a search pushes thousands of entries, and handing the
  // collector two fresh arrays of that size on every search is work nobody asked for. Safe because
  // `findPath` is synchronous and never re-enters.
  const heap = HEAP, heapF = HEAP_F;
  heap.length = 0; heapF.length = 0;
  const push = (slot: number, f: number): void => {
    let i = heap.length;
    heap.push(slot); heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      const tf = heapF[p]; heapF[p] = heapF[i]; heapF[i] = tf;
      const ts = heap[p]; heap[p] = heap[i]; heap[i] = ts;
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const ls = heap.pop()!, lf = heapF.pop()!;
    if (heap.length) {
      heap[0] = ls; heapF[0] = lf;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heapF.length && heapF[l] < heapF[m]) m = l;
        if (r < heapF.length && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        const tf = heapF[m]; heapF[m] = heapF[i]; heapF[i] = tf;
        const ts = heap[m]; heap[m] = heap[i]; heap[i] = ts;
        i = m;
      }
    }
    return top;
  };

  stamp[startSlot] = gen; cost[startSlot] = 0; parent[startSlot] = -1; done[startSlot] = 0;
  push(startSlot, h(scx, scz));
  let found = false;
  let expanded = 0;

  while (heap.length && expanded < maxExpand) {
    const slot = pop();
    if (slot === goalSlot) { found = true; break; }
    // A cheaper route to `slot` may have been found after this entry was queued, and the heap has
    // no way to take the stale one back. Without this line the stale copies get expanded too, each
    // pushing its own stale children: MEASURED at 125 764 expansions over a 12 295-slot graph —
    // every node ten times over — which is why a route eight waypoints long blew the budget.
    if (done[slot] === gen) continue;
    done[slot] = gen;
    expanded++;
    const cell = (slot / H) | 0;
    const cx = cell % w, cz = (cell / w) | 0;
    const y = heights[slot];
    const g = cost[slot];
    for (let s = 0; s < 8; s++) {
      const dx = STEPS[s][0], dz = STEPS[s][1];
      const nx = cx + dx, nz = cz + dz;
      if (!inGrid(idx, nx, nz)) continue;
      // A diagonal may not cut a corner: both orthogonal neighbours must be steppable too, or the
      // bot walks through the join between two walls.
      if (s >= 4 && (!canStep(idx, nx, cz, y) || !canStep(idx, cx, nz, y))) continue;
      const next = g + (s >= 4 ? DIAG : 1);
      const ncell = nz * w + nx;
      const n = count[ncell];
      // EVERY height in the neighbour a body at `y` may step to, not just the nearest. A cell with
      // a floor and a mezzanine offers both, and picking one collapses the two storeys into one
      // node — which is how the first attempt lost the mezzanine and a third of the long routes.
      for (let i = 0; i < n; i++) {
        const ns = ncell * H + i;
        if (heights[ns] - y > JUMP_UP) continue;
        if (stamp[ns] === gen && cost[ns] <= next) continue;
        stamp[ns] = gen; cost[ns] = next; parent[ns] = slot;
        push(ns, next + h(nx, nz));
      }
    }
  }
  if (!found) return null;

  const raw: NavPoint[] = [];
  for (let s = goalSlot; s >= 0; s = parent[s]) {
    raw.push(point(s));
    if (s === startSlot) break;
  }
  raw.reverse();
  return smooth(idx, raw);
}

/**
 * String-pulling: drop every waypoint the bot can walk straight past.
 *
 * A grid path is a sequence of cell centres, and following it literally is what made bots look as
 * if they were feeling their way along a wall. Keeping only the corners the geometry actually
 * forces turns the same route into the two or three straight legs a person would walk.
 */
function smooth(idx: WalkIndex, raw: NavPoint[]): NavPoint[] {
  if (raw.length <= 2) return raw;
  const out: NavPoint[] = [raw[0]];
  let anchor = 0;
  for (let i = 2; i < raw.length; i++) {
    if (clearLine(idx, raw[anchor], raw[i])) continue;
    out.push(raw[i - 1]);
    anchor = i - 1;
  }
  out.push(raw[raw.length - 1]);
  return out;
}

/** Is the straight line between two waypoints walkable, sampled every half cell? */
function clearLine(idx: WalkIndex, a: NavPoint, b: NavPoint): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const steps = Math.ceil(Math.hypot(dx, dz) / (idx.grid * 0.5));
  if (steps <= 1) return true;
  let y = a.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const slot = walkSlot(idx, cellX(idx, a.x + dx * t), cellZ(idx, a.z + dz * t), y);
    if (slot < 0) return false;
    y = idx.heights[slot];
  }
  // The line must end where the path said it does, or it has wandered onto another storey.
  return Math.abs(y - b.y) < 0.01;
}

/** Squared horizontal distance helper for path following. */
export const dist2 = (ax: number, az: number, bx: number, bz: number): number => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
