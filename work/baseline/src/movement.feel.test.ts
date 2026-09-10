import { describe, expect, it } from "vitest";
import { CollisionWorld, boxFrom } from "./collision";
import { PLAYER } from "./constants";
import { NIGHT_DISTRICT } from "./map";
import { MOVE, createBody, simulateBody, sprintActive } from "./movement";
import { Btn, type BodyState, type PlayerInput } from "./types";

/**
 * Feel tests: these pin the numbers that make the movement read as a fast arena shooter.
 * Every expectation is a measured property (seconds, metres), not a constant, so retuning
 * PLAYER.* is allowed as long as the feel targets still hold.
 */

const flatWorld = () => {
  const w = new CollisionWorld();
  w.add(boxFrom(-50, -1, -50, 100, 1, 100));
  return w;
};

const input = (buttons: number, yaw = 0, dt = 1000 / 60): PlayerInput => ({ seq: 0, dt, buttons, yaw, pitch: 0 });
const hspeed = (b: BodyState) => Math.hypot(b.vx, b.vz);

/** Runs `frames` steps; returns the elapsed simulated time in seconds. */
function run(world: CollisionWorld, body: BodyState, buttons: number, frames: number, yaw = 0, dt = 1000 / 60, prev = 0): number {
  for (let i = 0; i < frames; i++) {
    simulateBody(world, body, input(buttons, yaw, dt), 1, prev);
    prev = buttons;
  }
  return (frames * dt) / 1000;
}

/** Settles a body on the floor (and clears landing cooldown). */
function settled(world: CollisionWorld, x = 0, y = 0, z = 0): BodyState {
  const b = createBody(x, y, z);
  run(world, b, 0, 20);
  return b;
}

/** Time (s) until horizontal speed reaches `fraction` of `target`. */
function timeToSpeed(buttons: number, target: number, fraction = 0.95, dt = 1000 / 60): number {
  const w = flatWorld();
  const b = settled(w);
  let prev = 0;
  for (let i = 1; i <= 600; i++) {
    simulateBody(w, b, input(buttons, 0, dt), 1, prev);
    prev = buttons;
    if (hspeed(b) >= target * fraction) return (i * dt) / 1000;
  }
  return Infinity;
}

describe("movement feel: acceleration and stopping", () => {
  it("reaches walk speed in 0.15–0.25 s", () => {
    const t = timeToSpeed(Btn.Forward, PLAYER.walkSpeed);
    expect(t).toBeGreaterThanOrEqual(0.15);
    expect(t).toBeLessThanOrEqual(0.25);
  });

  it("reaches sprint speed in 0.15–0.25 s (same curve as walk)", () => {
    const t = timeToSpeed(Btn.Forward | Btn.Sprint, PLAYER.sprintSpeed);
    expect(t).toBeGreaterThanOrEqual(0.15);
    expect(t).toBeLessThanOrEqual(0.25);
  });

  it("stops within 0.5 m from a walk", () => {
    const w = flatWorld();
    const b = settled(w);
    run(w, b, Btn.Forward, 60);
    expect(hspeed(b)).toBeCloseTo(PLAYER.walkSpeed, 1);
    const z0 = b.z;
    let frames = 0;
    while (hspeed(b) > 0.05 && frames < 120) { simulateBody(w, b, input(0), 1, Btn.Forward); frames++; }
    expect(b.z - z0).toBeLessThan(0.5);
    expect(b.z - z0).toBeGreaterThan(0.1); // not an instant stop either: a hint of weight
    expect(frames / 60).toBeLessThan(0.3);
  });

  it("stops from a sprint in under 0.8 m", () => {
    const w = flatWorld();
    const b = settled(w);
    run(w, b, Btn.Forward | Btn.Sprint, 60);
    const z0 = b.z;
    run(w, b, 0, 60);
    expect(hspeed(b)).toBeLessThan(0.05);
    expect(b.z - z0).toBeLessThan(0.8);
  });

  it("ADS slows movement by the shared factor (server and client agree by construction)", () => {
    const w = flatWorld();
    const b = settled(w);
    run(w, b, Btn.Forward | Btn.Aim, 60);
    expect(hspeed(b)).toBeCloseTo(PLAYER.walkSpeed * MOVE.adsSpeedScale, 1);
  });

  it("aiming or firing cancels sprint", () => {
    expect(sprintActive(Btn.Forward | Btn.Sprint, false)).toBe(true);
    expect(sprintActive(Btn.Forward | Btn.Sprint | Btn.Aim, false)).toBe(false);
    expect(sprintActive(Btn.Forward | Btn.Sprint | Btn.Fire, false)).toBe(false);
    expect(sprintActive(Btn.Forward | Btn.Sprint, true)).toBe(false);
    expect(sprintActive(Btn.Sprint | Btn.Left, false)).toBe(false);
    const w = flatWorld();
    const b = settled(w);
    run(w, b, Btn.Forward | Btn.Sprint | Btn.Fire, 60);
    expect(hspeed(b)).toBeCloseTo(PLAYER.walkSpeed, 1);
  });
});

describe("movement feel: jumping", () => {
  function jumpArc(dt: number): { apex: number; airtime: number } {
    const w = flatWorld();
    const b = settled(w);
    simulateBody(w, b, input(Btn.Jump, 0, dt), 1, 0);
    let apex = b.y, steps = 1;
    while (!b.grounded && steps < 400) { simulateBody(w, b, input(Btn.Jump, 0, dt), 1, Btn.Jump); apex = Math.max(apex, b.y); steps++; }
    return { apex, airtime: (steps * dt) / 1000 };
  }

  it("jump apex ≈ 0.9–1.1 m and airtime ≈ 0.55–0.7 s at 60 fps", () => {
    const { apex, airtime } = jumpArc(1000 / 60);
    expect(apex).toBeGreaterThanOrEqual(0.9);
    expect(apex).toBeLessThanOrEqual(1.1);
    expect(airtime).toBeGreaterThanOrEqual(0.55);
    expect(airtime).toBeLessThanOrEqual(0.7);
  });

  it("jump apex is frame-rate independent (30 fps vs 60 fps vs 144 fps within 1 cm)", () => {
    const a60 = jumpArc(1000 / 60).apex;
    const a30 = jumpArc(1000 / 30).apex;
    const a144 = jumpArc(1000 / 144).apex;
    expect(Math.abs(a30 - a60)).toBeLessThan(0.01);
    expect(Math.abs(a144 - a60)).toBeLessThan(0.01);
  });

  /** Runs at a wall of height `ledge` and jumps into it; returns whether the body ended on top. */
  function canClimb(ledge: number, crouch: boolean): boolean {
    const w = flatWorld();
    w.add(boxFrom(-5, 0, 2, 10, ledge, 6));
    const b = settled(w, 0, 0, 0.6);
    // Walk up to the wall, then jump forward (crouch mid-air for the crouch-jump).
    run(w, b, Btn.Forward, 20);
    let prev = Btn.Forward;
    for (let i = 0; i < 90; i++) {
      const btn = Btn.Forward | Btn.Jump | (crouch && i > 6 ? Btn.Crouch : 0);
      simulateBody(w, b, input(btn), 1, prev);
      prev = btn;
    }
    return b.y > ledge - 0.02 && b.grounded;
  }

  it("crouch-jump tops a 1.2 m crate", () => {
    expect(canClimb(1.2, true)).toBe(true);
  });

  it("cannot climb a 1.3 m wall, with or without crouching", () => {
    expect(canClimb(1.3, true)).toBe(false);
    expect(canClimb(1.3, false)).toBe(false);
  });

  it("a plain jump tops a 1.0 m counter but not the 1.2 m crate", () => {
    expect(canClimb(1.0, false)).toBe(true);
    expect(canClimb(1.2, false)).toBe(false);
  });
});

describe("movement feel: walls and steps", () => {
  it("slides along a wall at a shallow angle without sticking", () => {
    const w = flatWorld();
    w.add(boxFrom(-50, 0, 3, 100, 3, 1)); // wall face at z=3 (normal -Z)
    const b = settled(w, 0, 0, 3 - PLAYER.halfWidth - 0.01);
    for (const deg of [3, 5, 15, 30, 60]) {
      const yaw = Math.PI / 2 - (deg * Math.PI) / 180; // forward = (sin yaw, cos yaw): mostly +X, `deg` into the wall
      b.x = 0; b.vx = b.vz = 0;
      const t = run(w, b, Btn.Forward, 90, yaw);
      const alongWall = b.x / t;
      // Only the component into the wall is lost (velocity is clipped to the wall plane), and the
      // per-axis sweep must never latch the body: at shallow angles that means near full walk speed.
      const expected = PLAYER.walkSpeed * Math.cos((deg * Math.PI) / 180);
      expect(alongWall, `sliding at ${deg}°`).toBeGreaterThan(expected * 0.95);
      if (deg <= 15) expect(alongWall, `sliding at ${deg}°`).toBeGreaterThan(PLAYER.walkSpeed * 0.9);
      expect(b.z).toBeLessThan(3 - PLAYER.halfWidth + 0.01);
    }
  });

  /**
   * The map's real stair boxes (`stair_0..9`: 0.3 m rises, 0.6 m treads, z 17 → 11, top at y=3.0)
   * on the storage floor. Tested in isolation: in the full map the balcony slab (y 3.0–3.25,
   * z 10–12.6) overhangs stairs 7–9, so a standing body hits its underside — a map issue for
   * the level workstream, not a movement one.
   */
  const stairWorld = () => {
    const w = new CollisionWorld();
    w.add(boxFrom(8, -1, 10, 12, 1, 8)); // storage floor
    // Ten steps plus the landing at the top (the mezzanine slab is not needed for these paths).
    const stairs = NIGHT_DISTRICT.solids.filter((s) => /^stair_(\d+|landing)$/.test(s.name ?? ""));
    expect(stairs.length).toBe(11);
    w.addBoxes(stairs.map((s) => s.box));
    return w;
  };

  it("sprints up the map's 0.3 m stairs (10 steps) without stopping", () => {
    const w = stairWorld();
    const b = settled(w, 18.8, 0, 17.4);
    // Face -Z (yaw π → forward (0,-1)). 6 m of stairs at sprint speed should take well under 1.5 s.
    let prev = 0, minSpeed = Infinity;
    for (let i = 0; i < 90 && b.z > 10.6; i++) { // stop on the landing (z 10..11)
      const btn = Btn.Forward | Btn.Sprint;
      simulateBody(w, b, input(btn, Math.PI), 1, prev);
      prev = btn;
      if (i > 20 && b.z > 11.5) minSpeed = Math.min(minSpeed, hspeed(b));
    }
    expect(b.y).toBeCloseTo(3.0, 2);
    expect(b.z).toBeLessThan(11.3);
    expect(b.grounded).toBe(true);
    // Stepping must not bleed speed: never below 90% of sprint while on the flight.
    expect(minSpeed).toBeGreaterThan(PLAYER.sprintSpeed * 0.9);
  });

  it("sprints up the stairs at 30 fps too", () => {
    const w = stairWorld();
    const b = settled(w, 18.8, 0, 17.4);
    let prev = 0;
    for (let i = 0; i < 45 && b.z > 10.6; i++) { simulateBody(w, b, input(Btn.Forward | Btn.Sprint, Math.PI, 1000 / 30), 1, prev); prev = Btn.Forward | Btn.Sprint; }
    expect(b.y).toBeCloseTo(3.0, 2);
    expect(b.grounded).toBe(true);
  });

  it("walks down the stairs staying grounded (no airborne flicker)", () => {
    const w = stairWorld();
    const b = settled(w, 18.8, 3.0, 11.3);
    expect(b.y).toBeCloseTo(3.0, 2);
    let airborneFrames = 0;
    let prev = 0;
    for (let i = 0; i < 120 && b.z < 17.4; i++) { // stop before the floor slab ends
      simulateBody(w, b, input(Btn.Forward, 0), 1, prev); // yaw 0 → +Z, i.e. down the flight
      prev = Btn.Forward;
      if (!b.grounded) airborneFrames++;
    }
    expect(b.y).toBeCloseTo(0, 2);
    expect(airborneFrames).toBe(0);
  });
});

describe("movement feel: frame-rate robustness", () => {
  it("straight walking covers the same distance at 16 ms and 33 ms steps (within 2%)", () => {
    const dist = (dt: number, totalMs: number) => {
      const w = flatWorld();
      const b = settled(w);
      run(w, b, Btn.Forward, Math.round(totalMs / dt), 0, dt);
      return b.z;
    };
    const d16 = dist(1000 / 60, 2000);
    const d33 = dist(1000 / 30, 2000);
    expect(Math.abs(d33 - d16) / d16).toBeLessThan(0.02);
  });

  it("sprint + stop lands within 2% at 33 ms steps", () => {
    const go = (dt: number) => {
      const w = flatWorld();
      const b = settled(w);
      run(w, b, Btn.Forward | Btn.Sprint, Math.round(1500 / dt), 0, dt);
      run(w, b, 0, Math.round(500 / dt), 0, dt, Btn.Forward | Btn.Sprint);
      return b.z;
    };
    const d16 = go(1000 / 60), d33 = go(1000 / 30);
    expect(Math.abs(d33 - d16) / d16).toBeLessThan(0.02);
  });

  it("clamps dt to 50 ms (a stalled tab cannot teleport)", () => {
    const w = flatWorld();
    const b = settled(w);
    run(w, b, Btn.Forward, 30);
    const z0 = b.z;
    simulateBody(w, b, input(Btn.Forward, 0, 1000), 1, Btn.Forward);
    expect(b.z - z0).toBeLessThanOrEqual(PLAYER.walkSpeed * 0.05 + 1e-6);
  });
});
