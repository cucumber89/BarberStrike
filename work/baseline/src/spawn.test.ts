import { describe, expect, it } from "vitest";
import { NIGHT_DISTRICT } from "./map";
import { pickSpawn } from "./spawn";
import { mulberry32 } from "./hitscan";

/** Drop 4: FFA spawns use every point on the map and keep away from everyone alive. */

describe("FFA spawn selection", () => {
  const map = NIGHT_DISTRICT;
  it("prefers cover over distance and avoids burning spawn points", () => {
    const arena = { ...map, spawns: [0, 15, 35].map(x => ({ x, y: 0, z: 0, yaw: 0, team: 0 as const })) };
    const context = { enemies: [{ x: 45, y: 0, z: 0 }], allies: [], rand: () => 0,
      canSee: (_ax: number, _ay: number, _az: number, bx: number) => bx !== 15 };
    expect(pickSpawn(arena, 0, context).x).toBe(15);
    expect(pickSpawn(arena, 0, { ...context, danger: x => x === 15 }).x).toBe(0);
  });

  it("draws from both teams' points and picks the one farthest from the crowd", () => {
    const rand = mulberry32(7);
    const south = map.spawns.filter((s) => s.team === 0);
    // Everyone alive stands on the south pavement: the pick must come from the north compound.
    const enemies = south.map((s) => ({ x: s.x, y: s.y, z: s.z }));
    for (let i = 0; i < 10; i++) {
      const sp = pickSpawn(map, 0, { enemies, allies: [], rand }, true);
      expect(sp.team).toBe(1);
    }
    // And the other way round.
    const north = map.spawns.filter((s) => s.team === 1).map((s) => ({ x: s.x, y: s.y, z: s.z }));
    for (let i = 0; i < 10; i++) expect(pickSpawn(map, 1, { enemies: north, allies: [], rand }, true).team).toBe(0);
  });

  it("keeps team spawns when not asked for the whole pool", () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 10; i++) expect(pickSpawn(map, 1, { enemies: [], allies: [], rand }).team).toBe(1);
  });

  it("will not drop a player on top of a teammate, while still keeping the team together", () => {
    // A respawn wave (drop 7) spawns the whole team in one pass, and each player becomes a living
    // ally standing exactly on the point they took. Without a penalty for that, the mild "spawn
    // near your team" bonus pulls the next player onto the same spot — and with everyone frozen for
    // the countdown they stay stacked there.
    const rand = mulberry32(11);
    const own = map.spawns.filter((s) => s.team === 0);
    expect(own.length, "the map needs more than one south spawn for this to mean anything").toBeGreaterThan(1);
    const taken = own[0];
    for (let i = 0; i < 20; i++) {
      const sp = pickSpawn(map, 0, { enemies: [], allies: [{ x: taken.x, y: taken.y, z: taken.z }], rand });
      expect(Math.hypot(sp.x - taken.x, sp.z - taken.z), "picked the occupied point").toBeGreaterThan(3);
    }
    // The team is still kept together: a teammate 8 m away is a reason to spawn nearby, not to flee.
    const near = { x: own[0].x + 8, y: own[0].y, z: own[0].z };
    const picks = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const sp = pickSpawn(map, 0, { enemies: [], allies: [near], rand });
      picks.add(`${sp.x},${sp.z}`);
      expect(Math.hypot(sp.x - near.x, sp.z - near.z)).toBeLessThan(40);
    }
    expect(picks.size).toBeGreaterThan(0);
  });
});
