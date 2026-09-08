import { describe, expect, it } from "vitest";
import { buildCollisionWorld, MAPS, type MapDef } from "./map";
import { makeRayHit } from "./collision";
import { PLAYER } from "./constants";
import { cellReached, reachable, walkable } from "./mapWalk";

/**
 * Map validity is a test, not an eyeball check. For every map:
 * - each spawn has a floor under it and a free player-sized volume above it;
 * - all spawns are mutually reachable on a 0.5 m walk grid using the real step height and a
 *   0.9 m jump-up (v²/2g with the movement constants), any drop allowed down to the kill plane;
 * - no team-0 spawn can see a team-1 spawn (eye to eye raycast);
 * - prop anchors lie inside the bounds and not inside a solid;
 * - solids of the same material do not overlap deeply (copy-paste errors).
 */

const HW = PLAYER.halfWidth, H = PLAYER.height;

for (const map of Object.values(MAPS)) {
  describe(`map ${map.id}`, () => {
    const world = buildCollisionWorld(map);

    it("has both teams' spawns, each on a floor with free headroom", () => {
      expect(map.spawns.filter((s) => s.team === 0).length).toBeGreaterThanOrEqual(6);
      expect(map.spawns.filter((s) => s.team === 1).length).toBeGreaterThanOrEqual(6);
      for (const s of map.spawns) {
        const free = !world.overlaps(s.x - HW, s.y + 0.02, s.z - HW, s.x + HW, s.y + H, s.z + HW);
        expect(free, `spawn ${JSON.stringify(s)} intersects a solid`).toBe(true);
        const hit = world.raycast(s.x, s.y + 0.5, s.z, 0, -1, 0, 1.2, makeRayHit());
        expect(hit.hit, `spawn ${JSON.stringify(s)} has no floor within 0.7 m`).toBe(true);
      }
    });

    it("puts every arena spawn on reachable floor too (FFA, Gun Game, the Ostrzyżeni chaser)", () => {
      // `spawns` is what the team modes draw from and what the tests above judge; `arenaSpawns` is
      // the pool FFA, Gun Game and a returning Ostrzyżony use, and nothing judged it. Drop G's roof
      // spawn sat over the loft-stair opening: free, reachable, and a three-metre drop on arrival.
      const walk = walkable(map);
      const seen = reachable(walk, map.spawns[0]);
      for (const s of map.arenaSpawns ?? []) {
        const free = !world.overlaps(s.x - HW, s.y + 0.02, s.z - HW, s.x + HW, s.y + H, s.z + HW);
        expect(free, `arena spawn ${JSON.stringify(s)} intersects a solid`).toBe(true);
        const hit = world.raycast(s.x, s.y + 0.5, s.z, 0, -1, 0, 1.2, makeRayHit());
        expect(hit.hit, `arena spawn ${JSON.stringify(s)} has nothing under it`).toBe(true);
        expect(cellReached(seen, s.x, s.z), `arena spawn ${JSON.stringify(s)} unreachable`).toBe(true);
      }
    });

    it("keeps every spawn inside the bounds and above the kill plane", () => {
      const b = map.bounds;
      for (const s of map.spawns) {
        expect(s.x).toBeGreaterThan(b.minX); expect(s.x).toBeLessThan(b.maxX);
        expect(s.z).toBeGreaterThan(b.minZ); expect(s.z).toBeLessThan(b.maxZ);
        expect(s.y).toBeGreaterThan(map.killY);
      }
    });

    it("connects all spawns on foot (0.5 m grid, real step height, jump-up allowed)", () => {
      const walk = walkable(map);
      const seen = reachable(walk, map.spawns[0]);
      const unreachable = map.spawns.filter((s) => !cellReached(seen, s.x, s.z));
      expect(unreachable, `unreachable spawns: ${JSON.stringify(unreachable)}`).toEqual([]);
      // Sanity: the walkable set is a real chunk of the map, not a corner.
      expect(seen.size).toBeGreaterThan(400);
    });

    it("hides every team-0 spawn from every team-1 spawn (eye to eye)", () => {
      const eye = PLAYER.eyeHeight;
      const t0 = map.spawns.filter((s) => s.team === 0), t1 = map.spawns.filter((s) => s.team === 1);
      const visible: string[] = [];
      for (const a of t0) for (const b of t1) {
        const dx = b.x - a.x, dy = b.y + eye - (a.y + eye), dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz);
        const hit = world.raycast(a.x, a.y + eye, a.z, dx / len, dy / len, dz / len, len - 0.05, makeRayHit());
        if (!hit.hit) visible.push(`(${a.x},${a.z}) sees (${b.x},${b.z})`);
      }
      expect(visible).toEqual([]);
    });

    it("places props inside the bounds and outside solids", () => {
      const b = map.bounds;
      const bad = map.props.filter((p) => p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ || p.y < b.minY || p.y > b.maxY);
      expect(bad).toEqual([]);
      // Wall-mounted props sit a few cm off a wall; an anchor inside an opaque solid is a mistake
      // (stickers on glass are fine — glass is translucent and the plane shows through).
      const opaque = buildCollisionWorld({ ...map, solids: map.solids.filter((s) => s.mat !== "glass") });
      // Probe a sliver just above the anchor: props standing ON a solid (chair on its base, clippers
      // on a station) and props hanging FROM a ceiling both pass; an anchor inside a wall fails.
      const buried = map.props.filter((p) => opaque.overlaps(p.x - 0.01, p.y + 0.01, p.z - 0.01, p.x + 0.01, p.y + 0.04, p.z + 0.01) && !/^(wheel|pipe|cable|lamp)$/.test(p.kind));
      expect(buried.map((p) => `${p.kind}@${p.x},${p.y},${p.z}`)).toEqual([]);
    });

    it("mounts wall props on a wall and stands posts on the ground (nothing floats)", () => {
      // Playtest 1.0: "signs float around the map". Wall-mounted kinds must touch a solid within
      // a few cm of the anchor; floor-standing kinds must have ground right under the anchor.
      const WALL = new Set(["sign", "board", "poster", "graffiti", "neon", "sticker", "vent", "ac_unit", "mirror", "shelf"]);
      const FLOOR = new Set(["trash", "crate", "dumpster", "pole", "barber_chair", "wheel"]);
      const floating: string[] = [];
      for (const p of map.props) {
        if (p.kind === "neon" && p.variant === "station") continue; // buy-station holograms float by design
        // Anchor semantics differ: plates/planes sit at the wall; shelves, AC units and signs (with
        // their lamp arms) are anchored at their own centre, so they may stand off the wall by more.
        const r = p.kind === "shelf" || p.kind === "ac_unit" || p.kind === "sign" ? 0.3 : 0.12;
        if (WALL.has(p.kind) && !world.overlaps(p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r)) floating.push(`${p.kind}@${p.x},${p.y},${p.z}`);
        if (p.kind === "lamp" && p.variant === "wall" && !world.overlaps(p.x - 0.4, p.y - 0.2, p.z - 0.4, p.x + 0.4, p.y + 0.2, p.z + 0.4)) floating.push(`lamp(wall)@${p.x},${p.y},${p.z}`);
        if ((FLOOR.has(p.kind) || (p.kind === "lamp" && p.variant !== "wall" && p.variant !== "head")) && !world.raycast(p.x, p.y + 0.3, p.z, 0, -1, 0, 0.5, makeRayHit()).hit) floating.push(`${p.kind}@${p.x},${p.y},${p.z} (no ground)`);
        // A lamp "head" sits on top of its post solid: the post must be right below.
        if (p.kind === "lamp" && p.variant === "head" && !world.raycast(p.x, p.y + 0.05, p.z, 0, -1, 0, 0.3, makeRayHit()).hit) floating.push(`lamp(head)@${p.x},${p.y},${p.z} (no post)`);
      }
      expect(floating).toEqual([]);
    });

    it("has buy stations that are reachable, in the open, and spread across lanes", () => {
      expect(map.stations.length).toBeGreaterThanOrEqual(3);
      const walk = walkable(map);
      const seen = reachable(walk, map.spawns[0]);
      for (const st of map.stations) {
        expect(world.overlaps(st.x - HW, st.y + 0.02, st.z - HW, st.x + HW, st.y + H, st.z + HW), `station ${st.name} inside a solid`).toBe(false);
        expect(cellReached(seen, st.x, st.z), `station ${st.name} unreachable`).toBe(true);
      }
      const xs = map.stations.map((s) => s.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
    });

    it("has no deeply overlapping solids of the same material", () => {
      const s = map.solids;
      const overlaps: string[] = [];
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
        if (s[i].mat !== s[j].mat) continue;
        const a = s[i].box, b = s[j].box;
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ox > 0.35 && oy > 0.35 && oz > 0.35) overlaps.push(`${s[i].name} × ${s[j].name}`);
      }
      expect(overlaps).toEqual([]);
    });
  });
}
