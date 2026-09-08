import { DEFAULT_MAP_ID, MAPS, buildCollisionWorld, prepareNav, walkable, type CollisionWorld, type MapDef, type Walk } from "@frankibarber/shared";

/**
 * One process, one grid PER MAP: the collision world and the walk grid are built once per map id
 * here and shared by every room on that map instead of being rebuilt per room.
 *
 * Why it was per room and why it is safe not to be: `walkable()` returns a fresh object each call,
 * and `nav.ts` keys its index cache on that object, so every room creation rebuilt the grid
 * (~200 ms of parsing 15 604 keys and allocating five 46 812-entry arrays) and the nav index on the
 * event loop — a stall felt by every match already running — and then held 2–3 MB per room.
 * Nothing writes to either structure after construction (`CollisionWorld.add` is only called by the
 * builder; the walk grid is read by `findPath`, whose scratch buffers are module-level and, on a
 * single thread, never interleave between two searches), so sharing them is a pure win.
 *
 * Drop G: two maps, so the caches are keyed by map id. A room on GÓRA must never be handed
 * NIGHT_DISTRICT's grid, and a room on either map must still pay for its grid only once.
 *
 * Lazy, not at import: the harness builds rooms without bots that never need the grid, and a cold
 * `import` should not pay for it either — and with two maps registered, a process that only ever
 * runs one of them must not build the other.
 */
const DEFAULT_MAP = MAPS[DEFAULT_MAP_ID];
const worlds = new Map<string, CollisionWorld>();
const walks = new Map<string, Walk>();

export function sharedCollisionWorld(map: MapDef = DEFAULT_MAP): CollisionWorld {
  let w = worlds.get(map.id);
  if (!w) worlds.set(map.id, w = buildCollisionWorld(map));
  return w;
}

/**
 * A collision world this ROOM owns, so a tactical plan (see `plans.ts`) can take a wall out of it
 * for one round without every other match on the process losing that wall too.
 *
 * Costs one array of ~376 pointers and 0.03 ms to build. The walk grid stays shared and is NOT
 * rebuilt: plans only ever REMOVE geometry, so a stale grid is a subset of what is walkable —
 * bots ignore the new route rather than walking into a wall that is no longer there.
 */
export function roomCollisionWorld(map: MapDef = DEFAULT_MAP): CollisionWorld {
  return buildCollisionWorld(map);
}

/** The map's walk grid with its nav index built and the search warmed (see `prepareNav`). */
export function sharedWalk(map: MapDef = DEFAULT_MAP): Walk {
  let w = walks.get(map.id);
  if (!w) { w = walkable(map); prepareNav(w); walks.set(map.id, w); }
  return w;
}
