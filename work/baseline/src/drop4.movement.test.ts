import { describe, expect, it } from "vitest";
import { CollisionWorld, boxFrom } from "./collision";
import { PLAYER } from "./constants";
import { LEAN, TAC, createBody, leanClearance, leanEye, leanOf, simulateBody, tacActive } from "./movement";
import { Btn, type PlayerInput } from "./types";

/** Drop 4: tactical sprint and lean in the shared simulation. */

function flatWorld(): CollisionWorld {
  const w = new CollisionWorld();
  w.addBoxes([boxFrom(-50, -1, -50, 100, 1, 100)]);
  return w;
}

const input = (seq: number, buttons: number): PlayerInput => ({ seq, dt: 16.67, buttons, yaw: 0, pitch: 0 });

function run(world: CollisionWorld, buttons: number, ticks: number, tacStart = TAC.budgetMs) {
  const b = createBody(0, 0, 0);
  b.grounded = true; b.tac = tacStart;
  let prev = 0;
  for (let i = 1; i <= ticks; i++) { simulateBody(world, b, input(i, buttons), 1, prev); prev = buttons; }
  return b;
}

describe("tactical sprint", () => {
  const world = flatWorld();
  const SPRINT = Btn.Forward | Btn.Sprint;
  const TACS = SPRINT | Btn.Tac;

  it("is measurably faster than a sprint and drains the budget", () => {
    const s = run(world, SPRINT, 90);
    const t = run(world, TACS, 90);
    expect(Math.hypot(t.vx, t.vz)).toBeCloseTo(PLAYER.sprintSpeed * TAC.speedScale, 1);
    expect(t.z).toBeGreaterThan(s.z * 1.1);
    expect(t.tac).toBeLessThan(TAC.budgetMs - 1000);
    expect(s.tac).toBe(TAC.budgetMs);
  });

  it("stops when the budget is empty and refills while walking", () => {
    const b = run(world, TACS, 400); // 6.7 s > 4 s budget
    expect(b.tac).toBe(0);
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(PLAYER.sprintSpeed, 1);
    expect(tacActive(TACS, b)).toBe(false);
    let prev = TACS;
    for (let i = 1; i <= 60; i++) { simulateBody(world, b, input(1000 + i, Btn.Forward), 1, prev); prev = Btn.Forward; }
    expect(b.tac).toBeGreaterThan(300);
    expect(b.tac).toBeLessThan(TAC.budgetMs);
  });

  it("needs a real sprint: crouching, aiming and firing all cancel it", () => {
    const b = createBody();
    expect(tacActive(TACS, b)).toBe(true);
    expect(tacActive(TACS | Btn.Aim, b)).toBe(false);
    expect(tacActive(TACS | Btn.Fire, b)).toBe(false);
    expect(tacActive(Btn.Sprint | Btn.Tac, b)).toBe(false); // no forward
    b.crouching = true;
    expect(tacActive(TACS, b)).toBe(false);
  });
});

describe("lean", () => {
  it("reads the keys, cancels on sprint and on both keys", () => {
    expect(leanOf(Btn.LeanL, false)).toBe(-1);
    expect(leanOf(Btn.LeanR, false)).toBe(1);
    expect(leanOf(Btn.LeanL | Btn.LeanR, false)).toBe(0);
    expect(leanOf(Btn.LeanR | Btn.Forward | Btn.Sprint, false)).toBe(0);
    expect(leanOf(Btn.LeanR | Btn.Forward | Btn.Sprint, true)).toBe(1); // crouched: not sprinting, lean allowed
  });

  it("moves the eye sideways by the full offset in the open and not at all into a wall", () => {
    const world = flatWorld();
    const b = createBody(0, 0, 0);
    const out: [number, number, number] = [0, 0, 0];
    leanEye(world, b, 0, 1, out);
    // Yaw 0 looks along +Z; right is +X.
    expect(out[0]).toBeCloseTo(LEAN.offset);
    expect(out[1]).toBeCloseTo(PLAYER.eyeHeight - LEAN.drop);
    expect(out[2]).toBeCloseTo(0);
    leanEye(world, b, 0, -1, out);
    expect(out[0]).toBeCloseTo(-LEAN.offset);
    leanEye(world, b, 0, 0, out);
    expect(out).toEqual([0, PLAYER.eyeHeight, 0]);
    // A wall against the right side of the head: no clearance that way, full clearance the other way.
    const walled = flatWorld();
    walled.addBoxes([boxFrom(LEAN.headHalf + 0.01, 0, -2, 0.3, 3, 4)]);
    expect(leanClearance(walled, b, 0, 1)).toBe(0);
    expect(leanClearance(walled, b, 0, -1)).toBe(1);
    // Half a metre of room: a partial lean.
    const partial = flatWorld();
    partial.addBoxes([boxFrom(0.45, 0, -2, 0.3, 3, 4)]);
    const c = leanClearance(partial, b, 0, 1);
    expect(c).toBeGreaterThan(0.3);
    expect(c).toBeLessThan(0.8);
  });

  it("follows the view yaw", () => {
    const world = flatWorld();
    const b = createBody(0, 0, 0);
    const out: [number, number, number] = [0, 0, 0];
    leanEye(world, b, Math.PI / 2, 1, out); // looking along +X: right is -Z
    expect(out[0]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(-LEAN.offset);
  });
});
