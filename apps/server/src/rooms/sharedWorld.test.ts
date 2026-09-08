import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomHarness } from "./testHarness";
import { NIGHT_DISTRICT, prepareNav, walkable } from "@frankibarber/shared";
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
