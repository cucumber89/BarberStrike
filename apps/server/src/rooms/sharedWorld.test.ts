import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomHarness } from "./testHarness";
import { MAPS, NIGHT_DISTRICT, prepareNav, walkable } from "@frankibarber/shared";
import { roomCollisionWorld, sharedWalk } from "./sharedWorld";

/** Real wall clock, captured before the fake timers (which also freeze `performance` and `hrtime`) go in. */
const realNow = performance.now.bind(performance);
const ms = () => realNow();

/**
 * Task 1 of the performance pass: the second room must not rebuild the map. MEASURED before that
 * change: a room with bots took ~200 ms to create because `walkable()` ran again and the nav index
 * was keyed on the fresh object.
 *
 * The WALK GRID is still shared and that is where all of the cost was. The COLLISION WORLD is now
 * per room, deliberately: a tactical plan (see plans.ts) takes a wall out of a room's world for one
 * round, and a shared world would take it out of every other match on the process too. This test
 * pins both halves — grid shared, world not — and measures what the split costs, so the trade is a
 * number rather than an assurance.
 */
let rooms: RoomHarness[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { for (const h of rooms) await h.dispose(); rooms = []; vi.useRealTimers(); });

it("two rooms share one walk grid, own their collision worlds, and the second is still cheap", async () => {
  // What every room used to pay, for the record: a fresh grid and its index.
  const tw = ms(); const fresh = walkable(NIGHT_DISTRICT); prepareNav(fresh); const perRoomBefore = ms() - tw;
  const t0 = ms();
  const a = await RoomHarness.create({ room: "share-a", mode: "tdm", bots: 2, seed: 1 }); rooms.push(a);
  const first = ms() - t0;
  const t1 = ms();
  const b = await RoomHarness.create({ room: "share-b", mode: "tdm", bots: 2, seed: 2 }); rooms.push(b);
  const second = ms() - t1;
  const inner = (h: RoomHarness) => h.room as unknown as { world: { boxes: unknown[] }; walk: unknown };
  // The expensive thing stays shared.
  expect(inner(a).walk).toBe(sharedWalk());
  expect(inner(b).walk).toBe(inner(a).walk);
  // The cheap thing does not, so one room's plan cannot reshape another room's map.
  expect(inner(a).world).not.toBe(inner(b).world);
  expect(inner(a).world.boxes.length).toBe(inner(b).world.boxes.length);
  const tworld = ms(); roomCollisionWorld(); const perRoomWorld = ms() - tworld;
  console.log(`grid + nav index per room before: ${perRoomBefore.toFixed(1)} ms; per-room collision world now: ${perRoomWorld.toFixed(2)} ms; room creation: first ${first.toFixed(1)} ms, second ${second.toFixed(1)} ms`);
  // What the per-room world costs, stated rather than assumed: it is an array of box pointers.
  expect(perRoomWorld, "a per-room collision world must stay far cheaper than the walk grid").toBeLessThan(20);
  // The second room must not pay for the grid again (generous bound: a busy CI runner).
  expect(second).toBeLessThan(Math.max(80, perRoomBefore * 0.5));
});

/**
 * Drop G: the caches are keyed by map id. Sharing one grid across every room was right when there
 * was one map; with two it would hand a GÓRA room Night District's walkable floor, and its bots
 * would path through a flat they are not in. Per map, still once per process.
 */
it("keys both caches by map id: a GÓRA room gets GÓRA's grid, and only builds it once", async () => {
  const night = await RoomHarness.create({ room: "map-n", mode: "tdm", bots: 2, seed: 1 }); rooms.push(night);
  const g1 = await RoomHarness.create({ room: "map-g1", mode: "tdm", map: "gora", bots: 2, seed: 2 }); rooms.push(g1);
  const t = ms();
  const g2 = await RoomHarness.create({ room: "map-g2", mode: "tdm", map: "gora", bots: 2, seed: 3 }); rooms.push(g2);
  const secondGora = ms() - t;
  const inner = (h: RoomHarness) => h.room as unknown as { world: { boxes: unknown[] }; walk: unknown };
  expect(inner(night).walk).toBe(sharedWalk(NIGHT_DISTRICT));
  expect(inner(g1).walk).toBe(sharedWalk(MAPS.gora));
  expect(inner(g1).walk).not.toBe(inner(night).walk);
  // Second room on the same map: the same grid object, so it cost nothing to build again.
  expect(inner(g2).walk).toBe(inner(g1).walk);
  expect(secondGora).toBeLessThan(80);
  // Collision worlds stay per room, on either map (a plan must not reach another match).
  expect(inner(g1).world).not.toBe(inner(g2).world);
  expect(inner(g1).world.boxes.length).toBe(MAPS.gora.solids.length);
  expect(inner(night).world.boxes.length).toBe(NIGHT_DISTRICT.solids.length);
});
