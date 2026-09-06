import { describe, expect, it } from "vitest";
import { CollisionWorld, boxFrom } from "./collision";
import { PLAYER } from "./constants";
import { NIGHT_DISTRICT } from "./map";
import { createBody, simulateBody } from "./movement";
import { Btn, type PlayerInput } from "./types";
import { WEAPONS } from "./weapons";
import { traceBullet } from "./hitscan";

const flatWorld = () => {
  const w = new CollisionWorld();
  w.add(boxFrom(-50, -1, -50, 100, 1, 100));
  return w;
};

const input = (buttons: number, yaw = 0, dt = 1000 / 60): PlayerInput => ({ seq: 0, dt, buttons, yaw, pitch: 0 });

function run(world: CollisionWorld, body: ReturnType<typeof createBody>, buttons: number, frames: number, yaw = 0) {
  let prev = 0;
  for (let i = 0; i < frames; i++) {
    simulateBody(world, body, input(buttons, yaw), 1, prev);
    prev = buttons;
  }
}

describe("movement", () => {
  it("rests on the floor and does not fall through", () => {
    const w = flatWorld();
    const b = createBody(0, 0.5, 0);
    run(w, b, 0, 120);
    expect(b.y).toBeCloseTo(0, 2);
    expect(b.grounded).toBe(true);
  });

  it("reaches walk speed forward and stops with friction", () => {
    const w = flatWorld();
    const b = createBody(0, 0, 0);
    run(w, b, Btn.Forward, 60);
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(PLAYER.walkSpeed, 1);
    expect(b.z).toBeGreaterThan(3);
    run(w, b, 0, 60);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThan(0.05);
  });

  it("sprint is faster than walk, crouch is slower", () => {
    const w = flatWorld();
    const a = createBody(); run(w, a, Btn.Forward | Btn.Sprint, 60);
    const c = createBody(); run(w, c, Btn.Forward | Btn.Crouch, 60);
    expect(Math.hypot(a.vx, a.vz)).toBeCloseTo(PLAYER.sprintSpeed, 1);
    expect(Math.hypot(c.vx, c.vz)).toBeCloseTo(PLAYER.crouchSpeed, 1);
    expect(c.crouching).toBe(true);
  });

  it("jumps once per press and lands again", () => {
    const w = flatWorld();
    const b = createBody();
    run(w, b, 0, 20); // settle + landing cooldown
    simulateBody(w, b, input(Btn.Jump), 1, 0);
    expect(b.grounded).toBe(false);
    expect(b.vy).toBeGreaterThan(0);
    let maxY = 0;
    for (let i = 0; i < 120; i++) { simulateBody(w, b, input(Btn.Jump), 1, Btn.Jump); maxY = Math.max(maxY, b.y); }
    expect(maxY).toBeGreaterThan(0.8);
    expect(b.grounded).toBe(true);
    expect(b.y).toBeCloseTo(0, 2);
  });

  it("is blocked by walls and slides along them", () => {
    const w = flatWorld();
    w.add(boxFrom(-5, 0, 3, 10, 3, 0.3)); // wall across +Z at z=3
    const b = createBody();
    run(w, b, Btn.Forward, 120);
    expect(b.z).toBeLessThan(3 - PLAYER.halfWidth + 0.01);
    expect(b.z).toBeGreaterThan(2.5);
    // diagonal into wall: should slide along X
    const c = createBody(0, 0, 2.5);
    run(w, c, Btn.Forward | Btn.Right, 60);
    expect(c.x).toBeGreaterThan(1);
  });

  it("steps up small ledges but not tall ones", () => {
    const w = flatWorld();
    w.add(boxFrom(-5, 0, 2, 10, 0.3, 5)); // 0.3 step
    w.add(boxFrom(-5, 0, 8, 10, 1.0, 5)); // 1.0 wall
    const b = createBody();
    run(w, b, Btn.Forward, 60);
    expect(b.y).toBeCloseTo(0.3, 2);
    run(w, b, Btn.Forward, 120);
    expect(b.z).toBeLessThan(8);
  });

  it("cannot stand up under a low ceiling", () => {
    const w = flatWorld();
    w.add(boxFrom(-5, 1.4, -5, 10, 1, 10));
    const b = createBody();
    run(w, b, Btn.Crouch, 10);
    expect(b.crouching).toBe(true);
    run(w, b, 0, 10);
    expect(b.crouching).toBe(true);
  });

  it("is deterministic for identical input sequences", () => {
    const w = flatWorld();
    w.add(boxFrom(1, 0, 1, 1, 0.3, 1));
    const seq = [Btn.Forward, Btn.Forward | Btn.Jump, Btn.Forward | Btn.Right, Btn.Left, 0, Btn.Sprint | Btn.Forward];
    const a = createBody(), b = createBody();
    let prev = 0;
    for (let i = 0; i < 300; i++) {
      const btn = seq[i % seq.length];
      simulateBody(w, a, input(btn, i * 0.01), 1, prev);
      simulateBody(w, b, input(btn, i * 0.01), 1, prev);
      prev = btn;
    }
    expect(a).toEqual(b);
  });
});

describe("map", () => {
  it("all spawns are inside free space and above a floor", () => {
    const w = new CollisionWorld();
    w.addBoxes(NIGHT_DISTRICT.solids.map((s) => s.box));
    for (const s of NIGHT_DISTRICT.spawns) {
      const hw = PLAYER.halfWidth;
      expect(w.overlaps(s.x - hw, s.y + 0.01, s.z - hw, s.x + hw, s.y + PLAYER.height, s.z + hw), `spawn ${s.x},${s.z} overlaps`).toBe(false);
      const b = createBody(s.x, s.y, s.z);
      run(w, b, 0, 30);
      expect(b.y, `spawn ${s.x},${s.z} fell`).toBeGreaterThan(-1);
      expect(b.grounded).toBe(true);
    }
  });
});

describe("hitscan", () => {
  it("hits a player box in front and reports headshots", () => {
    const w = flatWorld();
    const body = traceBullet(w, WEAPONS.rifle, 0, 1.6, 0, 0, 0, 1, [{ id: "b", x: 0, y: 0, z: 5, crouching: false }], "a");
    expect(body.targetId).toBe("b");
    expect(body.headshot).toBe(true);
    const chest = traceBullet(w, WEAPONS.rifle, 0, 1.0, 0, 0, 0, 1, [{ id: "b", x: 0, y: 0, z: 5, crouching: false }], "a");
    expect(chest.headshot).toBe(false);
    expect(chest.damage).toBe(WEAPONS.rifle.damage);
  });

  it("walls occlude players", () => {
    const w = flatWorld();
    w.add(boxFrom(-2, 0, 2, 4, 3, 0.2));
    const r = traceBullet(w, WEAPONS.rifle, 0, 1.0, 0, 0, 0, 1, [{ id: "b", x: 0, y: 0, z: 5, crouching: false }], "a");
    expect(r.targetId).toBeNull();
    expect(r.ez).toBeCloseTo(2, 3);
  });

  it("applies damage falloff", () => {
    const w = flatWorld();
    const far = traceBullet(w, WEAPONS.smg, 0, 1.0, 0, 0, 0, 1, [{ id: "b", x: 0, y: 0, z: 30, crouching: false }], "a");
    expect(far.damage).toBeLessThan(WEAPONS.smg.damage);
    expect(far.damage).toBeGreaterThanOrEqual(WEAPONS.smg.damageMin);
  });
});
