import { expect, it } from "vitest";
import { NIGHT_DISTRICT, buildCollisionWorld } from "./map";
import { BOMB_SITES } from "./bomb";
import { PLAYER } from "./constants";
import { walkable, reachable, cellReached } from "./mapWalk";
import { findPath } from "./nav";
const map = NIGHT_DISTRICT, world = buildCollisionWorld(map), walk = walkable(map);
it("connects every new arena spawn and both sites with real body clearance", () => {
  const seen = reachable(walk, map.spawns[0]);
  for (const p of [...map.arenaSpawns!, ...BOMB_SITES]) {
    expect(world.overlaps(p.x - PLAYER.halfWidth, p.y + .02, p.z - PLAYER.halfWidth, p.x + PLAYER.halfWidth, p.y + PLAYER.height, p.z + PLAYER.halfWidth), JSON.stringify(p)).toBe(false);
    expect(cellReached(seen, p.x, p.z), JSON.stringify(p)).toBe(true);
    expect(findPath(walk, map.spawns[0], p), JSON.stringify(p)).not.toBeNull();
  }
});
it("gives each site a path from both attack and defence and a cross-map rotation", () => {
  for (const site of BOMB_SITES) for (const team of [0, 1]) {
    const paths = map.spawns.filter(p => p.team === team).map(p => findPath(walk, p, site));
    expect(paths.filter(Boolean).length).toBeGreaterThanOrEqual(6);
  }
  expect(findPath(walk, BOMB_SITES[0], BOMB_SITES[1])).not.toBeNull();
});
