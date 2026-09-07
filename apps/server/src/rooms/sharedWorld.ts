import { NIGHT_DISTRICT, buildCollisionWorld, prepareNav, walkable, type CollisionWorld, type Walk } from "@frankibarber/shared";

/**
 * One map, one process, one thread: the collision world and the walk grid are built ONCE here and
 * shared by every room instead of per room.
 *
 * Why it was per room and why it is safe not to be: `walkable()` returns a fresh object each call,
 * and `nav.ts` keys its index cache on that object, so every room creation rebuilt the grid
 * (~200 ms of parsing 15 604 keys and allocating five 46 812-entry arrays) and the nav index on the
 * event loop — a stall felt by every match already running — and then held 2–3 MB per room.
 * Nothing writes to either structure after construction (`CollisionWorld.add` is only called by the
 * builder; the walk grid is read by `findPath`, whose scratch buffers are module-level and, on a
 * single thread, never interleave between two searches), so sharing them is a pure win.
 *
 * Lazy, not at import: the harness builds rooms without bots that never need the grid, and a cold
 * `import` should not pay for it either.
 */
let world: CollisionWorld | null = null;
let walk: Walk | null = null;

export function sharedCollisionWorld(): CollisionWorld {
  return (world ??= buildCollisionWorld(NIGHT_DISTRICT));
}

/** The walk grid with its nav index built and the search warmed (see `prepareNav`). */
export function sharedWalk(): Walk {
  if (!walk) { walk = walkable(NIGHT_DISTRICT); prepareNav(walk); }
  return walk;
}
