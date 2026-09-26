import { describe, expect, it } from "vitest";
import { DOLNA, DOLNA_BOUNDARY, DOLNA_EXITS, DOLNA_GROUND, DOLNA_PLACES } from "./dolna";
import { buildCollisionWorld, type Solid } from "./map";
import { makeRayHit } from "./collision";
import { PLAYER } from "./constants";
import { MOVE } from "./movement";
import { walkable, reachable } from "./mapWalk";
import { findPath, prepareNav, type NavPoint } from "./nav";

/**
 * DOLNA's own rules — what the 1 v 1 map of a real plot claims that the generic suite cannot
 * express, re-derived from the finished solids. GÓRA proves fairness by symmetry; a real place has
 * no twin, so DOLNA proves it by MEASUREMENT: both starts walk to the same contested places on the
 * same walk grid and the paths must be within 250 ms of sprint (1.9 m) of each other. The numbers
 * behind every threshold are in `docs/MAP_3_DOLNA.md` §5.8.
 */

const APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity);   // 0.931 m
const MANTLE = APEX + MOVE.airStepCrouch;                                            // 1.251 m
const REACH = (2 * PLAYER.jumpVelocity / -PLAYER.gravity) * PLAYER.sprintSpeed;      // 4.42 m
const HW = PLAYER.halfWidth, H = PLAYER.height;
/** 250 ms of sprint: the brief's tolerance for a contested place, as path length. */
const FAIR_M = 0.25 * PLAYER.sprintSpeed;
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
/** Every reachable surface as a point, from the duel start. */
const surfaces = (): NavPoint[] => {
  const out: NavPoint[] = [];
  for (const k of reachable(walk, start0)) {
    const at = k.indexOf("@");
    const [cx, cz] = k.slice(0, at).split(",").map(Number);
    out.push({ x: cx / 2 - 0.25, y: Number(k.slice(at + 1)), z: cz / 2 - 0.25 });
  }
  return out;
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

  it("shows each duel start only to its own pocket and doorway (nothing beyond 16 m), and no cell sees both", () => {
    // Measured 14.7 m (T0) and 14.5 m (T1): the far end of the garden lawn through the shed's west
    // door, the yard through the shell's north door. A start seen from the street is sniped on the
    // buzzer; a cell that sees BOTH starts would decide the round before anybody moved.
    const far: string[] = [], both: string[] = [];
    for (const c of surfaces()) {
      const s0 = sees(c.x, c.y + PLAYER.eyeHeight, c.z, start0.x, start0.y + PLAYER.eyeHeight, start0.z);
      const s1 = sees(c.x, c.y + PLAYER.eyeHeight, c.z, start1.x, start1.y + PLAYER.eyeHeight, start1.z);
      if (s0 && Math.hypot(c.x - start0.x, c.z - start0.z) > 16) far.push(`T0 from (${c.x}, ${c.z})`);
      if (s1 && Math.hypot(c.x - start1.x, c.z - start1.z) > 16) far.push(`T1 from (${c.x}, ${c.z})`);
      if (s0 && s1) both.push(`(${c.x}, ${c.z})`);
    }
    expect(far, "surfaces over 16 m away with a line to a duel start").toEqual([]);
    expect(both, "surfaces that see both starts").toEqual([]);
  });

  it("keeps every spawn free, on the ground, and on the walk grid", () => {
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

  it("puts the starts 35–46 m of path apart: a meeting in the street inside a 60 s round", () => {
    const p = pathFrom(start0, { x: start1.x, y: start1.y, z: start1.z });
    expect(p).not.toBeNull();
    expect(len(p!)).toBeGreaterThan(35);
    expect(len(p!)).toBeLessThan(46);
  });

  it("gives each start at least three exits within 15 m of walked path", () => {
    for (const [label, s] of [["T0", start0], ["T1", start1]] as const) {
      const near = Object.entries(DOLNA_EXITS).filter(([, e]) => { const p = pathFrom(s, e); return p && len(p) <= 15; }).map(([k]) => k);
      expect(near.length, `${label} exits within 15 m: ${near.join(", ")}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("connects every named place to every other for a bot, both ways", () => {
    const places: NavPoint[] = [start0, start1, ...Object.values(DOLNA_PLACES), ...DOLNA.flags, ...DOLNA.sites!, ...DOLNA.stations]
      .map((p) => ({ x: p.x, y: p.y, z: p.z }));
    const missing: string[] = [];
    for (const a of places) for (const b of places) {
      if (a === b) continue;
      if (!findPath(walk, a, b, 60000)) missing.push(`(${a.x},${a.z}) → (${b.x},${b.z})`);
    }
    expect(missing).toEqual([]);
  });
});

describe("DOLNA's cover speaks one language", () => {
  const ground = (s: Solid) => DOLNA_GROUND.test(name(s));
  const boundary = (s: Solid) => DOLNA_BOUNDARY.test(name(s));

  it("uses three heights: low (jump on it), crouch (cannot be climbed), full (over a standing head)", () => {
    const off: string[] = [];
    for (const s of DOLNA.solids) {
      if (s.invisible || ground(s) || boundary(s)) continue;
      if (s.box.minY > 0.011) continue;                       // pieces stacked on something are judged by their base
      const h = s.box.maxY;
      const low = h <= APEX - 0.1, crouch = Math.abs(h - 1.3) < 0.01 || Math.abs(h - 1.45) < 0.06, full = h >= PLAYER.height + 0.1 - 1e-9;
      if (!(low || crouch || full)) off.push(`${name(s)} ${h}`);
      if (crouch && h <= MANTLE) off.push(`${name(s)} ${h} could be mantled`);
    }
    expect(off).toEqual([]);
  });

  it("lets nothing be climbed to 1.9 m or onto a roof, a hedge or the mesh (chained real jumps)", () => {
    type Top = { name: string; y: number; box: Solid["box"]; from?: string };
    const tops: Top[] = DOLNA.solids.map((s) => ({ name: name(s), y: s.box.maxY, box: s.box }));
    const gap = (a: Solid["box"], b: Solid["box"]) => Math.hypot(Math.max(0, b.minX - a.maxX, a.minX - b.maxX), Math.max(0, b.minZ - a.maxZ, a.minZ - b.maxZ));
    const canHop = (k: Top, t: Top) => {
      const d = gap(k.box, t.box), rise = t.y - k.y;
      if (d >= REACH) return false;
      if (rise <= 0) return true;
      if (d <= 0.6) return rise <= MANTLE;
      const u = d / REACH;
      return rise <= MOVE.airStepCrouch + 4 * APEX * u * (1 - u);
    };
    const room = (t: Top) => {
      for (let x = t.box.minX + 0.15; x <= t.box.maxX - 0.15 + 1e-9; x += 0.3)
        for (let z = t.box.minZ + 0.15; z <= t.box.maxZ - 0.15 + 1e-9; z += 0.3)
          if (!world.overlaps(x - 0.2, t.y + 0.02, z - 0.2, x + 0.2, t.y + PLAYER.crouchHeight, z + 0.2)) return true;
      return false;
    };
    const standable: Top[] = tops.filter((t) => DOLNA_GROUND.test(t.name));
    for (let grew = true; grew;) {
      grew = false;
      for (const t of tops) {
        if (standable.includes(t) || !room(t)) continue;
        const k = standable.find((k) => Math.abs(t.y - k.y) > 0.01 && canHop(k, t));
        if (k) { t.from = k.name; standable.push(t); grew = true; }
      }
    }
    const high = standable.filter((t) => t.y >= 1.9).map((t) => `${t.name} ${t.y} (from ${t.from})`);
    const forbidden = standable.filter((t) => DOLNA_BOUNDARY.test(t.name)).map((t) => `${t.name} (from ${t.from})`);
    expect(high, "standable tops at or above 1.9 m").toEqual([]);
    expect(forbidden, "roofs, hedges or the mesh are standable").toEqual([]);
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
        // Embedded: the roof plates sit INSIDE the wall bands, a hand below the wall tops (a parapet
        // that the plan tool still draws as one structure), so their underside meets a jamb's side.
        if (o.box.minY < s.box.minY && o.box.maxY > s.box.minY) return true;
      }
      return false;
    };
    const floating = DOLNA.solids.filter((s) => !s.invisible && !rests(s)).map((s) => `${name(s)} at y ${s.box.minY}`);
    expect(floating).toEqual([]);
  });
});
