import { describe, expect, it } from "vitest";
import { CollisionWorld, boxFrom } from "./collision";
import { GRENADES, createProjectile, explosionDamage, flashMs, flashStrength, stepProjectile, type Projectile } from "./grenades";
import { TICK_MS } from "./constants";

/** A room: floor at y 0, a wall at x 5 (facing −x), a ceiling at y 4. */
const room = () => {
  const w = new CollisionWorld();
  w.add(boxFrom(-100, -1, -100, 200, 1, 200));
  w.add(boxFrom(5, 0, -100, 1, 6, 200));
  w.add(boxFrom(-100, 4, -100, 200, 1, 200));
  return w;
};

const fly = (world: CollisionWorld, p: Projectile, maxMs: number) => {
  const log: string[] = [];
  for (let t = 0; t < maxMs; t += TICK_MS) {
    const r = stepProjectile(world, p, TICK_MS);
    log.push(r);
    if (r === "detonate" || r === "stuck") break;
  }
  return log;
};

describe("projectile flight", () => {
  it("a frag thrown up and forward lands, bounces, comes to rest and detonates at the fuse", () => {
    const world = room();
    const p = createProjectile(1, "frag", "a", [0, 1.6, 0], [0, 0.5, 0.866]);
    const log = fly(world, p, 6000);
    expect(log[log.length - 1]).toBe("detonate");
    expect(p.bounces).toBeGreaterThan(0);
    expect(p.resting).toBe(true);
    expect(p.y).toBeGreaterThan(0);          // never sank into the floor
    expect(p.y).toBeLessThan(0.2);
    expect(p.z).toBeGreaterThan(5);          // travelled forward
    expect(p.ageMs).toBeGreaterThanOrEqual(GRENADES.frag.fuseMs);
    expect(p.ageMs).toBeLessThan(GRENADES.frag.fuseMs + TICK_MS * 2);
  });

  it("cooking shortens the fuse", () => {
    const p = createProjectile(1, "frag", "a", [0, 1.6, 0], [0, 0, 1], 2000);
    expect(p.fuseMs).toBe(GRENADES.frag.fuseMs - 2000);
    const f = createProjectile(2, "flash", "a", [0, 1.6, 0], [0, 0, 1], 2000);
    expect(f.fuseMs).toBe(GRENADES.flash.fuseMs); // not cookable
  });

  it("bounces off a wall: the x velocity flips and shrinks", () => {
    const world = room();
    const p = createProjectile(1, "frag", "a", [3, 1.6, 0], [1, 0, 0]);
    let r = stepProjectile(world, p, TICK_MS);
    for (let i = 0; i < 60 && p.bounces === 0; i++) r = stepProjectile(world, p, TICK_MS);
    expect(p.bounces).toBe(1);
    expect(p.vx).toBeLessThan(0);
    expect(Math.abs(p.vx)).toBeLessThan(GRENADES.frag.throwSpeed * GRENADES.frag.restitution + 0.01);
    expect(p.x).toBeLessThan(5);
    expect(r).toBe("flying");
  });

  it("a molotov detonates on first impact; a knife sticks", () => {
    const world = room();
    const m = createProjectile(1, "molotov", "a", [3, 1.6, 0], [1, 0, 0]);
    expect(fly(world, m, 2000).at(-1)).toBe("detonate");
    expect(m.x).toBeLessThan(5); expect(m.x).toBeGreaterThan(4.5);
    const k = createProjectile(2, "knife", "a", [3, 1.6, 0], [1, 0, 0]);
    expect(fly(world, k, 2000).at(-1)).toBe("stuck");
    expect(k.stuck).toBe(true);
    expect(k.nx).toBeLessThan(0); // stuck facing the wall's −x face
    expect(stepProjectile(world, k, TICK_MS)).toBe("stuck");
  });

  it("is deterministic: the same throw stepped twice gives identical positions", () => {
    const a = createProjectile(1, "frag", "a", [0, 1.6, 0], [0.2, 0.4, 0.89]);
    const b = createProjectile(1, "frag", "a", [0, 1.6, 0], [0.2, 0.4, 0.89]);
    const world = room();
    fly(world, a, 3000); fly(world, b, 3000);
    expect([a.x, a.y, a.z]).toEqual([b.x, b.y, b.z]);
  });
});

describe("explosion and flash", () => {
  it("frag damage falls off with distance and is zero through walls / beyond the radius", () => {
    const d = GRENADES.frag;
    expect(explosionDamage(d, 0, false)).toBe(d.damage);
    expect(explosionDamage(d, d.radius / 2, false)).toBeLessThan(d.damage);
    expect(explosionDamage(d, d.radius / 2, false)).toBeGreaterThan(d.minDamage);
    expect(explosionDamage(d, d.radius, false)).toBe(0);
    expect(explosionDamage(d, 1, true)).toBe(0);
  });

  it("flash strength: facing it is worst, looking away still hurts, walls block, distance fades", () => {
    const f = GRENADES.flash;
    const facing = flashStrength(f, 3, 1, false), side = flashStrength(f, 3, 0.3, false), away = flashStrength(f, 3, -1, false);
    expect(facing).toBeGreaterThan(side);
    expect(side).toBeGreaterThan(away);
    expect(away).toBeGreaterThan(0);
    expect(flashStrength(f, 3, 1, true)).toBe(0);
    expect(flashStrength(f, f.radius + 1, 1, false)).toBe(0);
    expect(flashStrength(f, 12, 1, false)).toBeLessThan(facing);
    expect(flashMs(1)).toBeGreaterThan(flashMs(0.3));
  });
});

/**
 * What a grenade does once it has stopped flying and is just leaning on something.
 *
 * CHARACTERISATION, not a bug demonstration — said plainly because it would be easy to read these as
 * regression tests for something that was broken. A review flagged two hazards in `contact` and the
 * sub-step loop: a swept ray that hits at zero distance consumes no time, so the loop could in
 * principle run the same contact three times in one step; and `p.bounces++` sits above the
 * "already separating" return, so a contact the grenade is moving away from would still count as a
 * bounce (and `bounces` is read for exactly one thing — whether to play a bounce sound).
 *
 * MEASURED against a grenade driven into a corner over 30 ticks: `travel` was never zero (the
 * sphere push-out keeps the body clear of the surface, so the ray almost never starts inside the
 * radius — the one non-negative reading was 0.0083 m) and no step ever produced more than one
 * bounce. Neither hazard reproduces, so neither was "fixed": changing a deterministic physics path
 * on a hazard nobody can trigger is how feel gets broken. These tests pin the behaviour as it is, so
 * that if either ever does start happening, something says so.
 */
describe("a grenade resting against something", () => {
  /** A corner: the room's floor and its wall at x 5 meet, and a second wall closes the z side. */
  const corner = () => {
    const w = room();
    w.add(boxFrom(-100, 0, 5, 200, 6, 1));
    return w;
  };

  it("does not spend its whole step bouncing off the same surface", () => {
    const world = corner();
    const p = createProjectile(1, "frag", "a", [4.6, 0.3, 4.6], [0, 0, 0]);
    p.vx = 3; p.vz = 3; p.vy = 0;
    const before = p.bounces;
    stepProjectile(world, p, TICK_MS);
    expect(p.bounces - before, "one step, more than one bounce").toBeLessThanOrEqual(1);
  });

  it("does not count a contact it is moving away from as a bounce", () => {
    const world = room();
    const p = createProjectile(2, "frag", "a", [4.7, 0.3, 0], [0, 0, 0]);
    p.vx = -2; p.vy = 0; p.vz = 0; // already travelling AWAY from the wall at x 5
    const before = p.bounces;
    for (let i = 0; i < 4; i++) stepProjectile(world, p, TICK_MS);
    expect(p.bounces).toBe(before);
  });

  it("still bounces off a wall it is travelling into", () => {
    const world = room();
    const p = createProjectile(3, "frag", "a", [3, 1, 0], [0, 0, 0]);
    p.vx = 9; p.vy = 0; p.vz = 0;
    for (let i = 0; i < 30; i++) stepProjectile(world, p, TICK_MS);
    expect(p.bounces).toBeGreaterThan(0);
    expect(p.vx).toBeLessThan(0); // it came back off the wall
  });

  it("settles in a corner rather than jittering forever", () => {
    const world = corner();
    const p = createProjectile(4, "frag", "a", [4.5, 1.2, 4.5], [0, 0, 0]);
    p.fuseMs = 60_000; // outlive the test: we are measuring rest, not the fuse
    p.vx = 5; p.vz = 5; p.vy = -1;
    let rested = false;
    for (let t = 0; t < 6000 && !rested; t += TICK_MS) rested = stepProjectile(world, p, TICK_MS) === "resting";
    expect(rested, "never came to rest in a corner").toBe(true);
  });
});
