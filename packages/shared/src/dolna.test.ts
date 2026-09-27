import { describe, expect, it } from "vitest";
import { DOLNA, DOLNA_BOUNDARY, DOLNA_EXITS, DOLNA_FURNITURE, DOLNA_GROUND, DOLNA_PLACES, DOLNA_STOREY, coverHeight } from "./dolna";
import { VOXEL_LIBRARY } from "./voxelLibrary";
import { voxelBounds } from "./voxel";
import { buildCollisionWorld, type Solid } from "./map";
import { makeRayHit } from "./collision";
import { PLAYER } from "./constants";
import { MOVE } from "./movement";
import { walkable, reachable } from "./mapWalk";
import { findPath, prepareNav, type NavPoint } from "./nav";

/**
 * DOLNA 17's own rules — what the owner's plot claims that the generic suite cannot express,
 * re-derived from the finished solids. GÓRA proves fairness by symmetry; a real place has no twin,
 * so DOLNA proves it by MEASUREMENT: both starts walk to the same contested places on the same
 * walk grid and the paths must be within 250 ms of sprint (1.9 m) of each other. The starts sit
 * where the owner drew them — the garage pocket and the top-floor SE room — and the six contested
 * places are the equal-cost frontier between them, found on a 1 m grid (`docs/MAP_3_DOLNA.md`,
 * "DOLNA 17 v2").
 *
 * The house is three storeys, which the roof deck of GÓRA never had to prove anything about: every
 * room on every floor, both balconies and the pool basin must be walkable for a bot; the roofs
 * must not. A naive climb chain (hop from any top to any lower top within a sprint jump) "hops"
 * through walls on a house — from a bed on the first floor onto the annex roof outside — so the
 * chain here is WALL-AWARE: a hop is a straight flight at body-centre height that the collision
 * world does not intersect. That is what proves the balconies' 1.35 m parapets keep the roofs
 * beside them roofs.
 */

const APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity);   // 0.931 m
const MANTLE = APEX + MOVE.airStepCrouch;                                            // 1.251 m
const REACH = (2 * PLAYER.jumpVelocity / -PLAYER.gravity) * PLAYER.sprintSpeed;      // 4.42 m
const HW = PLAYER.halfWidth, H = PLAYER.height;
/** 250 ms of sprint: the brief's tolerance for a contested place, as path length. */
const FAIR_M = 0.25 * PLAYER.sprintSpeed;
const Y = (s: number) => s * DOLNA_STOREY;
const world = buildCollisionWorld(DOLNA);
const walk = walkable(DOLNA);
prepareNav(walk);
const t0 = DOLNA.spawns.filter((s) => s.team === 0), t1 = DOLNA.spawns.filter((s) => s.team === 1);
const start0 = t0[0], start1 = t1[0];
const name = (s: Solid) => s.name ?? "?";
const sees = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  return !world.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit;
};
const len = (p: NavPoint[]) => p.slice(1).reduce((a, c, i) => a + Math.hypot(c.x - p[i].x, c.z - p[i].z), 0);
const pathFrom = (from: { x: number; y: number; z: number }, to: NavPoint) => findPath(walk, { x: from.x, y: from.y, z: from.z }, to, 60000);
/** Every reachable surface as a point, from the T0 duel start. */
const surfaces = (): NavPoint[] => {
  const out: NavPoint[] = [];
  for (const k of reachable(walk, start0)) {
    const at = k.indexOf("@");
    const [cx, cz] = k.slice(0, at).split(",").map(Number);
    out.push({ x: cx / 2 - 0.25, y: Number(k.slice(at + 1)), z: cz / 2 - 0.25 });
  }
  return out;
};

/** One point per room on every floor, both balconies, the pool basin, the shed and its cubicle, the garage pocket. */
const ROOMS: Record<string, NavPoint> = {
  hall_0: { x: -5.95, y: 0, z: 8.5 }, bath_0: { x: -5.6, y: 0, z: 12.4 }, boiler_room: { x: -9, y: 0, z: 7.5 },
  house_garage: { x: -2, y: 0, z: 7.5 }, kitchen_0: { x: -3.5, y: 0, z: 14.5 }, bedroom_0: { x: -0.6, y: 0, z: 15.5 },
  salon_0: { x: -8.5, y: 0, z: 16.7 }, annex: { x: -1, y: 0, z: 19 }, stair_landing_0: { x: -10, y: 5 * 0.35, z: 11.5 },
  corridor_1: { x: -6.25, y: Y(1), z: 11 }, bath_1: { x: -4.75, y: Y(1), z: 7.5 }, bedroom_1: { x: -9, y: Y(1), z: 8.3 },
  kitchen_1: { x: -1.5, y: Y(1), z: 12 }, salon_1: { x: -6.4, y: Y(1), z: 15.8 }, stair_landing_1: { x: -10, y: Y(1) + 5 * 0.35, z: 11.5 },
  balcony_1: { x: -5.5, y: Y(1), z: 18.25 },
  hall_2: { x: -8.5, y: Y(2), z: 8.5 }, hall_2n: { x: -6.5, y: Y(2), z: 12.5 }, room_e_s: { x: -2, y: Y(2), z: 9.5 },
  room_e_n: { x: -1, y: Y(2), z: 12 }, room_nw: { x: -8.5, y: Y(2), z: 15.5 }, balcony_2: { x: 1.9, y: Y(2), z: 10.75 },
  shed: { x: 5.5, y: 0, z: 11.5 }, shed_bathroom: { x: 4.1, y: 0, z: 8.5 }, garage_pocket: { x: 16, y: 0, z: 12.5 },
  garage_west_door: { x: 8.5, y: 0, z: 3.75 }, pool_ring: { x: 8.2, y: 0, z: 20.5 }, garage_alley: { x: 18.85, y: 0, z: 7.5 },
};

describe("DOLNA's starts are hidden", () => {
  it("cannot see each other standing or crouching, either way round", () => {
    const eyes = [PLAYER.eyeHeight, PLAYER.crouchEyeHeight];
    const visible: string[] = [];
    for (const a of t0) for (const b of t1) for (const ea of eyes) for (const eb of eyes) {
      if (sees(a.x, a.y + ea, a.z, b.x, b.y + eb, b.z)) visible.push(`(${a.x},${a.z})@${ea} sees (${b.x},${b.z})@${eb}`);
    }
    expect(visible).toEqual([]);
  });

  it("shows each duel start only to its own pocket and doorway (nothing beyond 12 m), and no cell sees both", () => {
    // Measured 4.6 m (T0: the booth and its mouth, behind the screen) and 7.6 m (T1: the SE room,
    // its balcony and the corridor door). A start seen from the road is sniped on the buzzer; a
    // cell that sees BOTH starts would decide the round before anybody moved.
    const far: string[] = [], both: string[] = [];
    for (const c of surfaces()) {
      const s0 = sees(c.x, c.y + PLAYER.eyeHeight, c.z, start0.x, start0.y + PLAYER.eyeHeight, start0.z);
      const s1 = sees(c.x, c.y + PLAYER.eyeHeight, c.z, start1.x, start1.y + PLAYER.eyeHeight, start1.z);
      if (s0 && Math.hypot(c.x - start0.x, c.z - start0.z) > 12) far.push(`T0 from (${c.x}, ${c.z})`);
      if (s1 && Math.hypot(c.x - start1.x, c.z - start1.z) > 12) far.push(`T1 from (${c.x}, ${c.z})`);
      if (s0 && s1) both.push(`(${c.x}, ${c.z})`);
    }
    expect(far, "surfaces over 12 m away with a line to a duel start").toEqual([]);
    expect(both, "surfaces that see both starts").toEqual([]);
  });

  it("hides the garage pocket from the road, both gates and the north door of the garage", () => {
    // The owner drew the spawn in the garage's NE corner; the partition and the screen are ours,
    // and this is what they are for. Eye height at the gates' thresholds and along the road.
    const eye = PLAYER.eyeHeight;
    const seen: string[] = [];
    for (let x = -20; x <= 20; x += 1) for (const z of [-4, -2, 0]) if (sees(x, eye, z, start0.x, eye, start0.z)) seen.push(`road (${x}, ${z})`);
    for (let x = 9.75; x <= 17.25; x += 0.5) if (sees(x, eye, 1.25, start0.x, eye, start0.z)) seen.push(`gate (${x}, 1.25)`);
    for (let x = 11.75; x <= 12.75; x += 0.5) if (sees(x, eye, 15.25, start0.x, eye, start0.z)) seen.push(`north door (${x}, 15.25)`);
    expect(seen).toEqual([]);
  });

  it("keeps every spawn free, on a floor, and on the walk grid", () => {
    for (const s of [...DOLNA.spawns, ...(DOLNA.arenaSpawns ?? [])]) {
      expect(world.overlaps(s.x - HW, s.y + 0.02, s.z - HW, s.x + HW, s.y + H, s.z + HW), `spawn (${s.x}, ${s.z}) in a solid`).toBe(false);
      expect(world.raycast(s.x, s.y + 0.5, s.z, 0, -1, 0, 0.7, makeRayHit()).hit, `spawn (${s.x}, ${s.z}) has no ground`).toBe(true);
    }
  });
});

describe("DOLNA is fair by measurement, not by symmetry", () => {
  it("walks the same distance from either start to every contested place (within 250 ms of sprint)", () => {
    const contested = Object.entries(DOLNA_PLACES).filter(([k]) => k.startsWith("*"));
    expect(contested.length).toBeGreaterThanOrEqual(4);
    for (const [k, to] of contested) {
      const a = pathFrom(start0, to), b = pathFrom(start1, to);
      expect(a, `no path from T0 to ${k}`).not.toBeNull();
      expect(b, `no path from T1 to ${k}`).not.toBeNull();
      expect(Math.abs(len(a!) - len(b!)), `${k}: ${len(a!).toFixed(1)} vs ${len(b!).toFixed(1)} m`).toBeLessThan(FAIR_M);
    }
  });

  it("puts the starts 50–65 m of path apart: two storeys and a garden, a meeting in the middle at ~4 s", () => {
    // Measured 58.3 m. Longer than GÓRA's 39 because T1 has two flights of stairs to come down,
    // but the CONTESTED places are ~30 m from both, which is the 4 s a 60 s round needs.
    const p = pathFrom(start0, { x: start1.x, y: start1.y, z: start1.z });
    expect(p).not.toBeNull();
    expect(len(p!)).toBeGreaterThan(50);
    expect(len(p!)).toBeLessThan(65);
  });

  it("gives each start at least three exits within 15 m of walked path", () => {
    for (const [label, s] of [["T0", start0], ["T1", start1]] as const) {
      const near = Object.entries(DOLNA_EXITS).filter(([, e]) => { const p = pathFrom(s, e); return p && len(p) <= 15; }).map(([k]) => k);
      expect(near.length, `${label} exits within 15 m: ${near.join(", ")}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("connects every named place, every room on every floor, both balconies and the pool for a bot, both ways", { timeout: 20000 }, () => {
    // Every place to the T0 start and back: a → T0 → b composes into a → b, so the hub proves every
    // pair (the walk grid has one-way drops, which is why BOTH directions are walked). All pairs
    // (~5 500 searches) took 3.4 s here and timed out on the CI runner.
    const places: NavPoint[] = [start1, ...Object.values(DOLNA_PLACES), ...Object.values(ROOMS), ...DOLNA.flags, ...DOLNA.sites!, ...DOLNA.stations]
      .map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const hub: NavPoint = { x: start0.x, y: start0.y, z: start0.z };
    const missing: string[] = [];
    for (const p of places) {
      if (!findPath(walk, hub, p, 60000)) missing.push(`T0 → (${p.x},${p.y},${p.z})`);
      if (!findPath(walk, p, hub, 60000)) missing.push(`(${p.x},${p.y},${p.z}) → T0`);
    }
    expect(missing).toEqual([]);
  });

  it("reaches every room at its own floor height, not through the slab (the walk grid's air rule)", () => {
    // A cell under a slab lists the ground floor, the first and the second; a path must arrive at
    // the storey it was asked for, or the bot walks into the floor it was told to fall through.
    const bad: string[] = [];
    for (const [k, p] of Object.entries(ROOMS)) {
      const path = pathFrom(start0, p);
      if (!path) { bad.push(`${k}: no path`); continue; }
      const end = path[path.length - 1];
      if (Math.abs(end.y - p.y) > 0.36) bad.push(`${k}: arrives at y ${end.y}, asked for ${p.y}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("DOLNA's cover speaks one language", () => {
  const ground = (s: Solid) => DOLNA_GROUND.test(name(s));
  const boundary = (s: Solid) => DOLNA_BOUNDARY.test(name(s));
  const stairs = (s: Solid) => /^(stair_|pool_step_)/.test(name(s));

  it("uses three heights: low (jump on it), crouch (cannot be climbed), full (over a standing head)", () => {
    const off: string[] = [];
    for (const s of DOLNA.solids) {
      if (s.invisible || ground(s) || boundary(s) || stairs(s)) continue;
      if (s.box.minY > 0.011) continue;                       // pieces stacked on something are judged by their base
      const h = s.box.maxY;
      const low = h <= APEX - 0.1, crouch = Math.abs(h - 1.3) < 0.01 || Math.abs(h - 1.45) < 0.06, full = h >= PLAYER.height + 0.1 - 1e-9;
      if (!(low || crouch || full)) off.push(`${name(s)} ${h}`);
      if (crouch && h <= MANTLE) off.push(`${name(s)} ${h} could be mantled`);
    }
    expect(off).toEqual([]);
  });

  it("lets nothing be climbed above 1.9 m except the floors, stairs, landings and balconies; never a roof, a hedge, the garage top or the shed top", () => {
    // The chain starts on everything a body is MEANT to stand on (the ground, the floors, the
    // stairs, the balconies, the pool's steps and water) — the walk-grid test above proves those
    // connect — and grows by real hops: within a sprint jump, within the mantle for the rise, and
    // with a straight flight at body-centre height that hits nothing. That last clause is the
    // difference from GÓRA's chain: on a house a naive hop goes through the wall.
    type Top = { name: string; y: number; box: Solid["box"]; from?: string; pts?: NavPoint[] };
    const INTENDED = /^(ground_|floor_|stair_|balcony\d_slab$|pool_step_)/;
    const tops: Top[] = DOLNA.solids.map((s) => ({ name: name(s), y: s.box.maxY, box: s.box }));
    const gap = (a: Solid["box"], b: Solid["box"]) => Math.hypot(Math.max(0, b.minX - a.maxX, a.minX - b.maxX), Math.max(0, b.minZ - a.maxZ, a.minZ - b.maxZ));
    const riseOk = (d: number, rise: number) => {
      if (d >= REACH) return false;
      if (rise <= 0) return true;
      if (d <= 0.6) return rise <= MANTLE;
      const u = d / REACH;
      return rise <= MOVE.airStepCrouch + 4 * APEX * u * (1 - u);
    };
    /** Where a body can stand on a top (crouch-height free volume), on a 0.5 m grid. */
    const points = (t: Top): NavPoint[] => {
      if (t.pts) return t.pts;
      const out: NavPoint[] = [];
      for (let x = t.box.minX + 0.2; x <= t.box.maxX - 0.2 + 1e-9; x += 0.5)
        for (let z = t.box.minZ + 0.2; z <= t.box.maxZ - 0.2 + 1e-9; z += 0.5)
          if (!world.overlaps(x - 0.2, t.y + 0.02, z - 0.2, x + 0.2, t.y + PLAYER.crouchHeight, z + 0.2)) out.push({ x, y: t.y, z });
      return (t.pts = out);
    };
    const nearest = (pts: NavPoint[], b: Solid["box"], n: number) =>
      pts.map((p) => ({ p, d: Math.hypot(Math.max(0, b.minX - p.x, p.x - b.maxX), Math.max(0, b.minZ - p.z, p.z - b.maxZ)) }))
        .filter((e) => e.d < REACH).sort((a, c) => a.d - c.d).slice(0, n).map((e) => e.p);
    const canHop = (k: Top, t: Top): boolean => {
      if (!riseOk(gap(k.box, t.box), t.y - k.y)) return false;
      for (const a of nearest(points(k), t.box, 8)) for (const b of nearest(points(t), k.box, 8)) {
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (!riseOk(d, t.y - k.y)) continue;
        if (sees(a.x, k.y + 1.0, a.z, b.x, t.y + 1.0, b.z)) return true;
      }
      return false;
    };
    const standable: Top[] = tops.filter((t) => INTENDED.test(t.name));
    for (let grew = true; grew;) {
      grew = false;
      for (const t of tops) {
        if (standable.includes(t) || !points(t).length) continue;
        const k = standable.find((k) => Math.abs(t.y - k.y) > 0.01 && canHop(k, t));
        if (k) { t.from = k.name; standable.push(t); grew = true; }
      }
    }
    const gained = standable.filter((t) => !INTENDED.test(t.name));
    // Height ABOVE THE FLOOR a piece stands on: a bed on the top floor is 7.6 m up and 0.6 m high.
    const floorUnder = (t: Top) => Math.max(0, ...tops.filter((f) => INTENDED.test(f.name) && f.y <= t.box.minY + 0.011 &&
      f.box.minX < t.box.maxX && f.box.maxX > t.box.minX && f.box.minZ < t.box.maxZ && f.box.maxZ > t.box.minZ).map((f) => f.y));
    const high = gained.filter((t) => t.y - floorUnder(t) >= 1.9).map((t) => `${t.name} ${t.y} (from ${t.from})`);
    const forbidden = standable.filter((t) => DOLNA_BOUNDARY.test(t.name) || /^roof_/.test(t.name)).map((t) => `${t.name} (from ${t.from})`);
    expect(high, "standable tops at or above 1.9 m that are not floors, stairs or balconies").toEqual([]);
    expect(forbidden, "roofs, hedges or the fence are standable").toEqual([]);
    // And the proof has teeth: the chain does climb onto the low furniture it is meant to.
    expect(gained.map((t) => t.name)).toContain("garage0_bench");
  });

  it("guards every balcony with a parapet no body mantles, so the roofs beside them stay roofs", () => {
    for (const b of [1, 2]) {
      const slab = DOLNA.solids.find((s) => name(s) === `balcony${b}_slab`)!;
      const parapets = DOLNA.solids.filter((s) => name(s).startsWith(`balcony${b}_parapet`));
      expect(parapets.length).toBe(3);
      for (const p of parapets) expect(p.box.maxY - slab.box.maxY, `${name(p)} is a step`).toBeGreaterThan(MANTLE);
    }
  });

  it("gives every barber chair a collision the size of the drawn chair (a prop is never cover)", () => {
    const chairs = DOLNA.props.filter((p) => p.kind === "barber_chair");
    expect(chairs.length).toBe(2);
    for (const c of chairs) {
      const seat = DOLNA.solids.find((s) => s.invisible && s.box.minX < c.x && s.box.maxX > c.x && s.box.minZ < c.z && s.box.maxZ > c.z && s.box.minY < 0.1);
      const back = DOLNA.solids.find((s) => s.invisible && s.box.minX < c.x && s.box.maxX > c.x && s.box.minZ < c.z && s.box.maxZ > c.z && s.box.maxY > 1.4);
      expect(seat, `chair at (${c.x}, ${c.z}) has no seat proxy`).toBeDefined();
      expect(back, `chair at (${c.x}, ${c.z}) has no back proxy`).toBeDefined();
      expect(back!.box.minY - seat!.box.maxY).toBeLessThan(PLAYER.crouchHeight);
    }
  });

  it("stands every solid on the ground or on another solid", () => {
    const rests = (s: Solid) => {
      if (s.box.minY <= 0.011) return true;
      for (const o of DOLNA.solids) {
        if (o === s) continue;
        const ox = Math.min(s.box.maxX, o.box.maxX) - Math.max(s.box.minX, o.box.minX);
        const oz = Math.min(s.box.maxZ, o.box.maxZ) - Math.max(s.box.minZ, o.box.minZ);
        if (ox <= 0 || oz <= 0) continue;
        if (Math.abs(s.box.minY - o.box.maxY) < 0.011) return true;
        // Embedded: a window pane a centimetre into its wall, a slab patch a centimetre into the
        // wall it bears on — its underside meets the taller solid's side.
        if (o.box.minY < s.box.minY && o.box.maxY > s.box.minY) return true;
      }
      return false;
    };
    const floating = DOLNA.solids.filter((s) => !s.invisible && !rests(s)).map((s) => `${name(s)} at y ${s.box.minY}`);
    expect(floating).toEqual([]);
  });

  it("climbs its stairs in 0.35 m risers on 0.5 m treads, one riser per walk cell", () => {
    // 0.4 m treads put two risers under one 0.5 m cell and a 0.7 m step in the grid (a jump for a
    // bot, a stumble for the mover); 0.5 m treads give every cell its own riser.
    for (const flight of ["stair_a0_step_", "stair_b0_step_", "stair_a1_step_", "stair_b1_step_"]) {
      const treads = DOLNA.solids.filter((s) => name(s).startsWith(flight)).sort((a, b) => a.box.maxY - b.box.maxY);
      expect(treads.length, flight).toBe(4);
      for (let i = 1; i < treads.length; i++) expect(treads[i].box.maxY - treads[i - 1].box.maxY).toBeCloseTo(0.35, 5);
      for (const t of treads) expect(Math.abs((t.box.maxX - t.box.minX) - 0.5)).toBeLessThan(0.11);
    }
  });
});

describe("DOLNA is furnished from the voxel kit", () => {
  it("names only models the library has, and the footprint table matches each model within 15 cm", () => {
    const missing: string[] = [], off: string[] = [];
    for (const p of DOLNA.props) if (p.kind === "voxel" && !(p.model! in VOXEL_LIBRARY)) missing.push(p.model!);
    for (const [id, [w, h, d]] of Object.entries(DOLNA_FURNITURE)) {
      const m = VOXEL_LIBRARY[id];
      if (!m) { missing.push(id); continue; }
      const b = voxelBounds(m);
      // The table's height is the PROXY's: a tap, a lamp or a monitor may stand up to 0.6 m above it.
      if (Math.abs(b.w - w) > 0.15 || Math.abs(b.d - d) > 0.15 || h > b.h + 0.15 || h < b.h - 0.6) off.push(`${id}: table ${w}×${h}×${d}, model ${b.w}×${b.h}×${b.d}`);
    }
    expect([...new Set(missing)], "models the library does not have").toEqual([]);
    expect(off).toEqual([]);
  });

  it("gives every standing piece a proxy in the cover language, and hangs the rest above a head or on a wall", () => {
    expect(coverHeight(0.5)).toBe(0.5); expect(coverHeight(0.9)).toBe(0.8); expect(coverHeight(1.6)).toBe(1.45); expect(coverHeight(1.8)).toBe(1.9); expect(coverHeight(2.1)).toBe(2.1);
    const proxies = DOLNA.solids.filter((s) => s.invisible && (s.name ?? "").startsWith("furn_"));
    expect(proxies.length).toBeGreaterThan(60);
    const rooms = DOLNA.props.filter((p) => p.kind === "voxel");
    expect(rooms.length).toBeGreaterThan(proxies.length);
  });
});
