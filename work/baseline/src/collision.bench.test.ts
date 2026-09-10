import { describe, expect, it } from "vitest";
import { CollisionWorld, makeRayHit, type Box } from "./collision";
import { NIGHT_DISTRICT } from "./map";
import { BOMB_SITES } from "./bomb";
import { mulberry32 } from "./hitscan";
import { simulateBody } from "./movement";
import type { BodyState } from "./types";
import { Btn } from "./types";

/**
 * What the broadphase is worth, measured — not asserted from theory.
 *
 * The numbers this prints go in the session report; the assertions are deliberately loose (a CI
 * box under load is not a benchmark rig) and only guard against the grid REGRESSING to linear.
 */

const BOXES: Box[] = NIGHT_DISTRICT.solids.map((s) => s.box);

/** A world that never builds a grid, so the two paths can be compared on the same data. */
class LinearWorld extends CollisionWorld {
  override overlaps(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const e = 1e-4;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (minX < b.maxX - e && maxX > b.minX + e && minY < b.maxY - e && maxY > b.minY + e && minZ < b.maxZ - e && maxZ > b.minZ + e) return true;
    }
    return false;
  }
}

const fill = <T extends CollisionWorld>(w: T): T => { w.addBoxes(BOXES); return w; };
const ms = (f: () => void): number => { const t = performance.now(); f(); return performance.now() - t; };

describe("collision broadphase: measured cost", () => {
  it("cuts the per-query cost of the movement sweep", () => {
    const grid = fill(new CollisionWorld()), linear = fill(new LinearWorld());
    // Warm both: JIT, and the grid's one-off build.
    grid.overlaps(0, 0, 0, 1, 1, 1); linear.overlaps(0, 0, 0, 1, 1, 1);
    const N = 60_000;
    const rnd = mulberry32(1234);
    const pts: number[] = [];
    // Query where players actually are: around the two bomb sites, which are ringed with cover.
    for (let i = 0; i < N; i++) {
      const s = BOMB_SITES[i & 1];
      pts.push(s.x + (rnd() - 0.5) * 16, 0.05 + rnd() * 0.5, s.z + (rnd() - 0.5) * 14);
    }
    const run = (w: CollisionWorld) => () => {
      for (let i = 0; i < N * 3; i += 3) w.overlaps(pts[i] - 0.4, pts[i + 1], pts[i + 2] - 0.4, pts[i] + 0.4, pts[i + 1] + 1.8, pts[i + 2] + 0.4);
    };
    const tLinear = Math.min(ms(run(linear)), ms(run(linear)));
    const tGrid = Math.min(ms(run(grid)), ms(run(grid)));
    const speedup = tLinear / tGrid;
    console.log(`overlaps around the bomb sites, ${N} queries over ${BOXES.length} boxes: linear ${tLinear.toFixed(1)} ms, grid ${tGrid.toFixed(1)} ms — ${speedup.toFixed(1)}× faster`);
    expect(speedup, `grid ${tGrid.toFixed(1)} ms vs linear ${tLinear.toFixed(1)} ms`).toBeGreaterThan(2);
  });

  it("cuts the cost of a hitscan ray", () => {
    const grid = fill(new CollisionWorld());
    const out = makeRayHit();
    grid.raycast(0, 1, 0, 1, 0, 0, 10, out);
    const N = 40_000;
    const rnd = mulberry32(99);
    const rays: number[] = [];
    for (let i = 0; i < N; i++) {
      const s = BOMB_SITES[i & 1], yaw = rnd() * Math.PI * 2;
      rays.push(s.x + (rnd() - 0.5) * 14, 1.6, s.z + (rnd() - 0.5) * 12, Math.sin(yaw), (rnd() - 0.5) * 0.4, Math.cos(yaw));
    }
    const runGrid = () => { for (let i = 0; i < N * 6; i += 6) grid.raycast(rays[i], rays[i + 1], rays[i + 2], rays[i + 3], rays[i + 4], rays[i + 5], 120, out); };
    // Reference: the same maths over every box, which is what raycast did before.
    const runLinear = () => {
      for (let i = 0; i < N * 6; i += 6) {
        const ox = rays[i], oy = rays[i + 1], oz = rays[i + 2];
        const idx = 1 / rays[i + 3], idy = 1 / rays[i + 4], idz = 1 / rays[i + 5];
        let best = 120;
        for (let k = 0; k < BOXES.length; k++) {
          const b = BOXES[k];
          let tmin = 0, tmax = best;
          let t1 = (b.minX - ox) * idx, t2 = (b.maxX - ox) * idx;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue;
          t1 = (b.minY - oy) * idy; t2 = (b.maxY - oy) * idy;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue;
          t1 = (b.minZ - oz) * idz; t2 = (b.maxZ - oz) * idz;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) continue;
          if (tmin < best && tmin >= 0) best = tmin;
        }
      }
    };
    const tLinear = Math.min(ms(runLinear), ms(runLinear));
    const tGrid = Math.min(ms(runGrid), ms(runGrid));
    console.log(`hitscan from the bomb sites, ${N} rays over ${BOXES.length} boxes: linear ${tLinear.toFixed(1)} ms, grid ${tGrid.toFixed(1)} ms — ${(tLinear / tGrid).toFixed(1)}× faster`);
    expect(tLinear / tGrid).toBeGreaterThan(1.5);
  });

  it("costs a mispredict replay far less than one frame", () => {
    // The worst realistic case: the client replays its whole pending-input buffer in one frame.
    const grid = fill(new CollisionWorld()), linear = fill(new LinearWorld());
    const body = (): BodyState => ({ x: BOMB_SITES[1].x, y: 0.05, z: BOMB_SITES[1].z - 6, vx: 0, vy: 0, vz: 0, grounded: true, crouching: false, yaw: 0, sprintBudget: 1, tac: 0, lean: 0 } as unknown as BodyState);
    const REPLAY = 240;
    const run = (w: CollisionWorld) => () => {
      const b = body();
      let prev = 0;
      for (let i = 0; i < REPLAY; i++) {
        const btn = Btn.Forward | Btn.Sprint;
        simulateBody(w, b, { buttons: btn, yaw: 0, pitch: 0, dtMs: 1000 / 60, seq: i } as never, 1, prev);
        prev = btn;
      }
    };
    run(grid)(); run(linear)();
    const tLinear = Math.min(ms(run(linear)), ms(run(linear)), ms(run(linear)));
    const tGrid = Math.min(ms(run(grid)), ms(run(grid)), ms(run(grid)));
    console.log(`replaying ${REPLAY} pending inputs into cover at site B: linear ${tLinear.toFixed(2)} ms, grid ${tGrid.toFixed(2)} ms — ${(tLinear / tGrid).toFixed(1)}× faster (one frame at 60 fps is 16.7 ms)`);
    expect(tGrid, "a mispredict replay must fit inside a frame").toBeLessThan(16.7);
  });
});
