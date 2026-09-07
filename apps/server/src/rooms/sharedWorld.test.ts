import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomHarness } from "./testHarness";
import { NIGHT_DISTRICT, prepareNav, walkable } from "@frankibarber/shared";
import { sharedCollisionWorld, sharedWalk } from "./sharedWorld";

/** Real wall clock, captured before the fake timers (which also freeze `performance` and `hrtime`) go in. */
const realNow = performance.now.bind(performance);
const ms = () => realNow();

/**
 * Task 1 of the performance pass: the second room must not rebuild the map. MEASURED before the
 * change (this machine): a room with bots took ~200 ms to create because `walkable()` ran again and
 * the nav index was keyed on the fresh object. Now both rooms hold the very same objects.
 */
let rooms: RoomHarness[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { for (const h of rooms) await h.dispose(); rooms = []; vi.useRealTimers(); });

it("two rooms share one collision world and one walk grid, and the second is cheap to create", async () => {
  // What every room used to pay, for the record: a fresh grid and its index.
  const tw = ms(); const fresh = walkable(NIGHT_DISTRICT); prepareNav(fresh); const perRoomBefore = ms() - tw;
  const t0 = ms();
  const a = await RoomHarness.create({ room: "share-a", mode: "tdm", bots: 2, seed: 1 }); rooms.push(a);
  const first = ms() - t0;
  const t1 = ms();
  const b = await RoomHarness.create({ room: "share-b", mode: "tdm", bots: 2, seed: 2 }); rooms.push(b);
  const second = ms() - t1;
  const inner = (h: RoomHarness) => h.room as unknown as { world: unknown; walk: unknown };
  expect(inner(a).world).toBe(sharedCollisionWorld());
  expect(inner(b).world).toBe(inner(a).world);
  expect(inner(a).walk).toBe(sharedWalk());
  expect(inner(b).walk).toBe(inner(a).walk);
  console.log(`grid + nav index per room before: ${perRoomBefore.toFixed(1)} ms; room creation now: first ${first.toFixed(1)} ms, second ${second.toFixed(1)} ms`);
  // The second room must not pay for the grid again (generous bound: a busy CI runner).
  expect(second).toBeLessThan(Math.max(80, perRoomBefore * 0.5));
});
