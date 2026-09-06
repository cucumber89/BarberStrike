import { describe, expect, it } from "vitest";
import { NIGHT_DISTRICT } from "./map";
import { walkable } from "./mapWalk";
import { findPath } from "./nav";

/**
 * A budget, not a benchmark. Bots re-plan on the server's 16.7 ms tick, and a search that takes a
 * meaningful slice of one is felt by every player in the room as the game running badly — which is
 * exactly what happened: the 4-neighbour BFS this replaced measured 11.5 ms per search here.
 *
 * The thresholds are deliberately loose (this runs on whatever CI machine is free) but they are far
 * below the old cost, so a regression of that kind cannot pass again.
 */
describe("pathfinder cost on the real map", () => {
  it("stays well inside a server tick, and finds what the grid says is there", () => {
    const walk = walkable(NIGHT_DISTRICT);
    const pts = [...walk.cells.entries()].map(([k, ys]) => {
      const [cx, cz] = k.split(",").map(Number);
      return { x: cx / 2, y: ys[0], z: cz / 2 };
    });
    // Spread the endpoints across the whole grid: the first cells in iteration order are all in one
    // corner, and a pair of neighbours makes the search bail instantly — measuring nothing.
    const step = Math.max(1, Math.floor(pts.length / 41));
    const pairs: [number, number][] = [];
    for (let i = 0; i < 40; i++) pairs.push([(i * step) % pts.length, ((i + 20) * step) % pts.length]);

    let ok = 0, len = 0, hitMs = 0, missMs = 0, misses = 0;
    for (const [a, b] of pairs) {
      const t = process.hrtime.bigint();
      const p = findPath(walk, pts[a], pts[b]);
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      if (p) { ok++; len += p.length; hitMs += ms; } else { misses++; missMs += ms; }
    }
    console.log(
      `${pairs.length} searches over ${walk.cells.size} cells: ${ok} found in ${(hitMs / Math.max(1, ok)).toFixed(2)} ms each ` +
      `(avg ${(len / Math.max(1, ok)).toFixed(1)} waypoints), ${misses} unreachable in ${(missMs / Math.max(1, misses)).toFixed(2)} ms each`);

    expect(ok).toBeGreaterThanOrEqual(20);
    expect(hitMs / Math.max(1, ok)).toBeLessThan(8);
    // Giving up has to be cheap too: it is the case a bot hits over and over when its goal is
    // walled off, and it is the one that has to flood the whole component before it can say so.
    expect(missMs / Math.max(1, misses)).toBeLessThan(16);
  }, 60000);
});
