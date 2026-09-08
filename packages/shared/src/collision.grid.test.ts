import { describe, expect, it } from "vitest";
import { CollisionWorld, makeRayHit, type Box, type RayHit } from "./collision";
import { NIGHT_DISTRICT } from "./map";
import { mulberry32 } from "./hitscan";

/**
 * The broadphase must be a pure speed-up: same answers, always.
 *
 * `CollisionWorld` gained a uniform XZ grid because every query was a linear scan of every box on
 * the map, which is the frame-time spike players feel while moving around cover. A wrong
 * broadphase is far worse than a slow one — it makes bullets miss and players fall through floors
 * — so these tests re-implement the ORIGINAL algorithms verbatim below and assert the grid agrees
 * with them over thousands of random queries against the real map.
 */

/** The pre-grid `overlaps`, kept verbatim as the reference. */
function bruteOverlaps(boxes: readonly Box[], minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
  const e = 1e-4;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (minX < b.maxX - e && maxX > b.minX + e && minY < b.maxY - e && maxY > b.minY + e && minZ < b.maxZ - e && maxZ > b.minZ + e) return true;
  }
  return false;
}

/** The pre-grid `raycast`, kept verbatim as the reference (first box wins an exact tie). */
function bruteRaycast(boxes: readonly Box[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: RayHit): RayHit {
  out.hit = false; out.t = maxT;
  const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    let tmin = 0, tmax = out.t, axis = -1, sign = 0;
    let t1 = (b.minX - ox) * idx, t2 = (b.maxX - ox) * idx, s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) continue;
    t1 = (b.minY - oy) * idy; t2 = (b.maxY - oy) * idy; s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) continue;
    t1 = (b.minZ - oz) * idz; t2 = (b.maxZ - oz) * idz; s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) continue;
    if (tmin < out.t && tmin >= 0 && axis >= 0) {
      out.hit = true; out.t = tmin;
      out.nx = axis === 0 ? sign : 0; out.ny = axis === 1 ? sign : 0; out.nz = axis === 2 ? sign : 0;
    }
  }
  if (out.hit) { out.x = ox + dx * out.t; out.y = oy + dy * out.t; out.z = oz + dz * out.t; }
  return out;
}

const world = () => { const w = new CollisionWorld(); w.addBoxes(NIGHT_DISTRICT.solids.map((s) => s.box)); return w; };
const BOXES = NIGHT_DISTRICT.solids.map((s) => s.box);

describe("collision broadphase agrees with the linear scan it replaced", () => {
  it("answers every overlap query identically (4000 random AABBs over the whole map)", () => {
    const w = world();
    const rnd = mulberry32(0xB0DE);
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      // A spread of sizes: a player capsule, a grenade, a thrown crate, a whole room.
      const size = [0.8, 0.25, 1.4, 12][i & 3];
      const x = -50 + rnd() * 105, y = -2 + rnd() * 10, z = -25 + rnd() * 72;
      const a = w.overlaps(x, y, z, x + size, y + size * 2, z + size);
      const b = bruteOverlaps(BOXES, x, y, z, x + size, y + size * 2, z + size);
      if (a !== b) expect.fail(`overlaps disagreed at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) size ${size}: grid ${a}, scan ${b}`);
      if (a) hits++;
    }
    // Sanity: the queries actually touched the map rather than all missing into empty space.
    expect(hits).toBeGreaterThan(400);
  });

  it("finds the same nearest hit for every ray (3000 random rays, including exact ties)", () => {
    const w = world();
    const rnd = mulberry32(0x5EED);
    const got = makeRayHit(), want = makeRayHit();
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const ox = -50 + rnd() * 105, oy = 0.2 + rnd() * 6, oz = -25 + rnd() * 72;
      // Mostly near-horizontal, like a shot; some steep, like a grenade probe.
      const yaw = rnd() * Math.PI * 2, pitch = (rnd() - 0.5) * (i % 5 === 0 ? 2.4 : 0.5);
      const cp = Math.cos(pitch);
      const dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;
      const maxT = [2, 15, 60, 200][i & 3];
      w.raycast(ox, oy, oz, dx, dy, dz, maxT, got);
      bruteRaycast(BOXES, ox, oy, oz, dx, dy, dz, maxT, want);
      if (got.hit !== want.hit || got.t !== want.t || got.nx !== want.nx || got.ny !== want.ny || got.nz !== want.nz) {
        expect.fail(`ray ${i} disagreed from (${ox.toFixed(3)}, ${oy.toFixed(3)}, ${oz.toFixed(3)}) dir (${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)}) maxT ${maxT}\n  grid: ${JSON.stringify(got)}\n  scan: ${JSON.stringify(want)}`);
      }
      if (got.hit) hits++;
    }
    expect(hits).toBeGreaterThan(1500);
  });

  it("handles the axis-aligned rays a DDA is most likely to get wrong", () => {
    const w = world();
    const got = makeRayHit(), want = makeRayHit();
    const dirs: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],   // exactly along a cell boundary axis
      [0, 1, 0], [0, -1, 0],                            // purely vertical: never leaves its cell
      [0.7071, 0, 0.7071], [-0.7071, 0, -0.7071],       // exactly diagonal: both tMax tie every step
    ];
    for (const [dx, dy, dz] of dirs) {
      // Origins ON a cell boundary (multiples of 4 from the grid origin) and between them.
      for (const [ox, oy, oz] of [[0, 1, 0], [-27, 1, 24], [-35, 0.05, 24.5], [43, 0.05, 24.5], [2.5, 3.3, 13.7], [-45, 1, -22]] as const) {
        w.raycast(ox, oy, oz, dx, dy, dz, 150, got);
        bruteRaycast(BOXES, ox, oy, oz, dx, dy, dz, 150, want);
        expect({ ...got }, `dir ${dx},${dy},${dz} from ${ox},${oy},${oz}`).toEqual({ ...want });
      }
    }
  });

  it("still works when boxes are added after the grid was built", () => {
    const w = world();
    expect(w.overlaps(0, 0, 0, 1, 1, 1)).toBe(bruteOverlaps(BOXES, 0, 0, 0, 1, 1, 1));
    const extra = { minX: 200, minY: 0, minZ: 200, maxX: 202, maxY: 2, maxZ: 202 };
    w.add(extra);
    expect(w.overlaps(200.5, 0.5, 200.5, 201.5, 1.5, 201.5)).toBe(true);
    const got = makeRayHit();
    w.raycast(198, 1, 201, 1, 0, 0, 10, got);
    expect(got.hit).toBe(true);
    expect(got.t).toBeCloseTo(2, 6);
  });

  it("a world too small to be worth a grid still answers correctly", () => {
    const w = new CollisionWorld();
    w.add({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 });
    expect(w.overlaps(0.5, 0.5, 0.5, 0.6, 0.6, 0.6)).toBe(true);
    expect(w.overlaps(5, 5, 5, 6, 6, 6)).toBe(false);
    const got = makeRayHit();
    w.raycast(-3, 0.5, 0.5, 1, 0, 0, 10, got);
    expect(got.hit).toBe(true);
    expect(got.t).toBeCloseTo(3, 6);
  });
});
