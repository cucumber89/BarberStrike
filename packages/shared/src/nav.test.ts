import { describe, expect, it } from "vitest";
import { NIGHT_DISTRICT } from "./map";
import { PLAYER } from "./constants";
import { JUMP_UP, WALK_GRID, walkable } from "./mapWalk";
import { findPath, standHeight } from "./nav";
import { BOT_PRESETS, BOT_NAMES, MAX_BOTS, botId, isBotId } from "./bots";

/** Drop 5: bot paths on the walk grid. */

describe("findPath", () => {
  const map = NIGHT_DISTRICT;
  const walk = walkable(map);

  it("connects a south spawn to a north spawn with grid-adjacent steps that respect the jump rule", () => {
    const a = map.spawns.find((s) => s.team === 0)!;
    const b = map.spawns.find((s) => s.team === 1)!;
    const path = findPath(walk, a, b);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(4);
    // Ends at the goal cell.
    const last = path![path!.length - 1];
    expect(Math.abs(last.x - b.x)).toBeLessThan(WALK_GRID);
    expect(Math.abs(last.z - b.z)).toBeLessThan(WALK_GRID);
    // Every waypoint is a real standing spot, and every LEG between two of them is WALKABLE the
    // whole way: sampled every quarter cell, the ground is always there and never rises by more
    // than the mover's own step. Step, not jump — a bot only presses jump at a waypoint, so a leg
    // needing one halfway along is a leg it gets stuck on. Checked through `standHeight` rather
    // than the smoother's own helper, so this reads the grid independently and is not the
    // string-puller agreeing with itself.
    for (const p of path!) expect(standHeight(walk, p.x, p.z, p.y)).toBeCloseTo(p.y, 6);
    for (let i = 1; i < path!.length; i++) {
      const p = path![i - 1], q = path![i];
      const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (WALK_GRID / 2));
      let y = p.y;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const h = standHeight(walk, p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t, y);
        expect(h).toBeDefined();
        expect(h! - y).toBeLessThanOrEqual(PLAYER.stepHeight + 1e-6);
        y = h!;
      }
      expect(y).toBeCloseTo(q.y, 6);
    }
  });

  it("cuts diagonally instead of walking the axes in right angles", () => {
    // The reason for the rewrite, stated as a test: a four-neighbour search can only step along x
    // or z, so it crossed open ground in staircases. At least one leg must now be a real diagonal.
    const a = map.spawns.find((s) => s.team === 0)!;
    const b = map.spawns.find((s) => s.team === 1)!;
    const path = findPath(walk, a, b)!;
    const diagonal = path.some((q, i) =>
      i > 0 && Math.abs(q.x - path[i - 1].x) > 1e-6 && Math.abs(q.z - path[i - 1].z) > 1e-6);
    expect(diagonal).toBe(true);
  });

  it("reaches every flag from the spawns and gives up cleanly off the grid", () => {
    const a = map.spawns[0];
    for (const f of map.flags) expect(findPath(walk, a, f)).not.toBeNull();
    expect(findPath(walk, a, { x: 999, y: 0, z: 999 })).toBeNull();
    expect(standHeight(walk, 999, 999, 0)).toBeUndefined();
  });

  it("finds the mezzanine (a height change inside one cell column)", () => {
    const a = map.spawns[0];
    const mezz = { x: 14, y: 3, z: 11 };
    const path = findPath(walk, a, mezz);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1].y).toBeGreaterThan(2.5);
  });
});

describe("bot presets", () => {
  it("get sharper from easy to hard", () => {
    expect(BOT_PRESETS.easy.aimError).toBeGreaterThan(BOT_PRESETS.normal.aimError);
    expect(BOT_PRESETS.normal.aimError).toBeGreaterThan(BOT_PRESETS.hard.aimError);
    expect(BOT_PRESETS.easy.reactionMs).toBeGreaterThan(BOT_PRESETS.hard.reactionMs);
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(MAX_BOTS);
    expect(isBotId(botId(3))).toBe(true);
    expect(isBotId("abc123")).toBe(false);
  });
});
