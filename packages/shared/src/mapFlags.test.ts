import { describe, expect, it } from "vitest";
import { buildCollisionWorld, MAPS } from "./map";
import { makeRayHit } from "./collision";
import { DOM } from "./dom";
import { PLAYER } from "./constants";
import { cellReached, reachable, walkable } from "./mapWalk";

/** Drop 4: every map carries three Domination flags on open, reachable floor, spread across the map. */

const HW = PLAYER.halfWidth, H = PLAYER.height;

for (const map of Object.values(MAPS)) {
  describe(`flags of ${map.id}`, () => {
    const world = buildCollisionWorld(map);

    it("has three flags A/B/C with free headroom on a floor", () => {
      expect(map.flags.map((f) => f.id)).toEqual(["A", "B", "C"]);
      for (const f of map.flags) {
        const free = !world.overlaps(f.x - HW, f.y + 0.02, f.z - HW, f.x + HW, f.y + H, f.z + HW);
        expect(free, `flag ${f.id} intersects a solid`).toBe(true);
        const hit = world.raycast(f.x, f.y + 0.5, f.z, 0, -1, 0, 1.2, makeRayHit());
        expect(hit.hit, `flag ${f.id} has no floor`).toBe(true);
      }
    });

    it("can be walked to from the spawns and are not on top of each other", () => {
      const walk = walkable(map);
      const seen = reachable(walk, map.spawns[0]);
      for (const f of map.flags) expect(cellReached(seen, f.x, f.z), `flag ${f.id} unreachable`).toBe(true);
      for (let i = 0; i < map.flags.length; i++) for (let j = i + 1; j < map.flags.length; j++) {
        const a = map.flags[i], b = map.flags[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(DOM.radius * 4);
      }
    });
  });
}
