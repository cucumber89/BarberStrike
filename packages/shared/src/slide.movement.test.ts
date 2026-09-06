import { describe, expect, it } from "vitest";
import { CollisionWorld, boxFrom } from "./collision";
import { PLAYER } from "./constants";
import { SLIDE, createBody, simulateBody } from "./movement";
import { Btn, type PlayerInput } from "./types";

/**
 * Slide (2.3). Sprint, tap crouch: a burst past sprint speed at crouch height that bleeds off on its
 * own, the same on the server and the predicting client because it is one rule on one body.
 */
const flat = () => { const w = new CollisionWorld(); w.add(boxFrom(-50, -1, -50, 100, 1, 100)); return w; };
const input = (buttons: number, dt = 1000 / 60): PlayerInput => ({ seq: 0, dt, buttons, yaw: 0, pitch: 0 });
const SPRINT = Btn.Forward | Btn.Sprint;
function run(w: CollisionWorld, b: ReturnType<typeof createBody>, buttons: number, frames: number, prev = 0, dt = 1000 / 60) {
  for (let i = 0; i < frames; i++) { simulateBody(w, b, input(buttons, dt), 1, prev); prev = buttons; }
  return prev;
}
const speed = (b: { vx: number; vz: number }) => Math.hypot(b.vx, b.vz);

describe("slide", () => {
  it("crouch out of a sprint bursts past sprint speed at crouch height, then bleeds off and ends", () => {
    const w = flat(); const b = createBody();
    run(w, b, SPRINT, 60);
    const z0 = b.z;
    simulateBody(w, b, input(SPRINT | Btn.Crouch), 1, SPRINT);
    expect(b.slide).toBeGreaterThan(0); expect(b.crouching).toBe(true);
    expect(speed(b)).toBeGreaterThan(PLAYER.sprintSpeed);
    run(w, b, SPRINT | Btn.Crouch, 12, SPRINT | Btn.Crouch);
    expect(speed(b), "still well above the crouch walk a fifth of a second in").toBeGreaterThan(PLAYER.crouchSpeed * 2);
    run(w, b, SPRINT | Btn.Crouch, 60, SPRINT | Btn.Crouch);
    expect(b.slide).toBe(0);
    expect(b.slideCd).toBeGreaterThan(0);
    expect(b.crouching, "still crouched when it ends, crouch is held").toBe(true);
    expect(speed(b)).toBeLessThanOrEqual(PLAYER.crouchSpeed + 0.05);
    expect(b.z - z0, "ground covered by the slide").toBeGreaterThan(3.5);
  });
  it("needs a real sprint: crouching from a walk just crouches", () => {
    const w = flat(); const b = createBody();
    run(w, b, Btn.Forward, 60);
    simulateBody(w, b, input(Btn.Forward | Btn.Crouch), 1, Btn.Forward);
    expect(b.slide).toBe(0); expect(b.crouching).toBe(true);
  });
  it("letting go of crouch stands up out of it, and the cooldown refuses an immediate second one", () => {
    const w = flat(); const b = createBody();
    run(w, b, SPRINT, 60);
    simulateBody(w, b, input(SPRINT | Btn.Crouch), 1, SPRINT);
    run(w, b, SPRINT | Btn.Crouch, 6, SPRINT | Btn.Crouch);
    expect(b.slide).toBeGreaterThan(0);
    simulateBody(w, b, input(SPRINT), 1, SPRINT | Btn.Crouch);
    expect(b.slide).toBe(0); expect(b.crouching).toBe(false); expect(b.slideCd).toBe(SLIDE.cooldownMs);
    run(w, b, SPRINT, 10, SPRINT);
    simulateBody(w, b, input(SPRINT | Btn.Crouch), 1, SPRINT);
    expect(b.slide, "cooldown").toBe(0);
    run(w, b, SPRINT, Math.ceil(SLIDE.cooldownMs / (1000 / 60)) + 2, SPRINT);
    expect(b.slideCd).toBe(0);
    simulateBody(w, b, input(SPRINT | Btn.Crouch), 1, SPRINT);
    expect(b.slide, "after the cooldown").toBeGreaterThan(0);
  });
  it("a jump out of a slide carries the speed into the air", () => {
    const w = flat(); const b = createBody();
    run(w, b, SPRINT, 60);
    simulateBody(w, b, input(SPRINT | Btn.Crouch), 1, SPRINT);
    run(w, b, SPRINT | Btn.Crouch, 6, SPRINT | Btn.Crouch);
    simulateBody(w, b, input(SPRINT | Btn.Crouch | Btn.Jump), 1, SPRINT | Btn.Crouch);
    expect(b.grounded).toBe(false); expect(b.slide).toBe(0);
    expect(speed(b)).toBeGreaterThan(PLAYER.walkSpeed);
  });
  it("covers the same distance at 30 and 60 fps (within 4%)", () => {
    const dist = (dt: number) => {
      const w = flat(); const b = createBody();
      run(w, b, SPRINT, Math.round(1000 / dt), 0, dt);
      const z0 = b.z;
      simulateBody(w, b, input(SPRINT | Btn.Crouch, dt), 1, SPRINT);
      run(w, b, SPRINT | Btn.Crouch, Math.round(1200 / dt), SPRINT | Btn.Crouch, dt);
      return b.z - z0;
    };
    const a = dist(1000 / 60), c = dist(1000 / 30);
    expect(Math.abs(a - c) / a).toBeLessThan(0.04);
  });
});
