import { describe, expect, it } from "vitest";
import { CollisionWorld, boxFrom } from "./collision";
import { PLAYER } from "./constants";
import { SLIDE, createBody, simulateBody, slideSeenUntil } from "./movement";
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

/**
 * The slide is NOT on the wire, so an observer reconstructs it from what already is.
 *
 * The obvious idea — "crouching and faster than a crouch walk" — is measured false: the fastest
 * possible crouch walk is 3.555 m/s (Scout on an energy drink with a 1.06-mobility weapon) and this
 * slide ends at 3.2, so no threshold separates them and a Scout would have been drawn sliding
 * whenever they crouch-walked. `slideSeenUntil` arms on the entry burst instead and then runs the
 * slide's own duration. These tests are the reason to trust that, and the guard against the tempting
 * one-line version coming back.
 */
describe("a slide seen from outside, without a field on the wire", () => {
  /** Drives the observer's timer over a real slide, at the 20 Hz the snapshots actually arrive at. */
  function observe(entryButtons: number): { armedAt: number; laterFrames: number; covered: number; total: number } {
    const w = flat(); const b = createBody();
    run(w, b, SPRINT, 60);
    simulateBody(w, b, input(entryButtons), 1, SPRINT);
    let now = 0, until = 0, covered = 0, total = 0, armedAt = -1, laterFrames = 0;
    let prev = entryButtons;
    // Two seconds — well past the 800 ms slide — sampled every 50 ms like a snapshot.
    for (let i = 0; i < 40; i++) {
      until = slideSeenUntil(until, b.crouching, b.grounded, speed(b), now);
      const seen = until > now;
      if (seen && armedAt < 0) armedAt = now;
      if (b.slide > 0) { total++; if (seen) covered++; }
      else if (seen) laterFrames++;
      for (let k = 0; k < 3; k++) { simulateBody(w, b, input(prev), 1, prev); prev = entryButtons; }
      now += 50;
    }
    return { armedAt, laterFrames, covered, total };
  }

  it("sees the whole slide, and not a moment of it after it ends", () => {
    const r = observe(SPRINT | Btn.Crouch);
    expect(r.total, "the harness did not actually slide").toBeGreaterThan(5);
    expect(r.armedAt, "not recognised on the first snapshot after entry").toBe(0);
    expect(r.covered, "part of the slide was missed").toBe(r.total);
    // The observer's timer is the slide's own length, so it may lag by at most one snapshot.
    expect(r.laterFrames, "kept sliding after the slide was over").toBeLessThanOrEqual(1);
  });

  it("never mistakes any crouch movement for a slide, including the fastest one in the game", () => {
    const w = flat();
    for (const dir of [Btn.Forward, Btn.Back, Btn.Left, Btn.Right, Btn.Forward | Btn.Right, Btn.Forward | Btn.Sprint]) {
      // 1.15 Scout x 1.08 energy drink x 1.06 mobility: the fastest a crouched body can walk.
      const c = createBody();
      let prev = 0, until = 0, now = 0;
      for (let i = 0; i < 120; i++) {
        simulateBody(w, c, input(dir | Btn.Crouch), 1.15 * 1.08 * 1.06, prev);
        prev = dir | Btn.Crouch;
        until = slideSeenUntil(until, c.crouching, c.grounded, speed(c), now);
        now += 1000 / 60;
      }
      expect(speed(c), `crouch walk ${dir} should be the fast one`).toBeGreaterThan(PLAYER.crouchSpeed);
      expect(until > now, `crouch walk ${dir} read as a slide`).toBe(false);
    }
  });

  it("stands the pose up when the player stands up or jumps out of it", () => {
    const armed = 1000 + SLIDE.durationMs;
    expect(slideSeenUntil(armed, false, true, 5, 1000)).toBe(0);   // let go of crouch
    expect(slideSeenUntil(armed, true, false, 5, 1000)).toBe(0);   // jumped out of it
    expect(slideSeenUntil(armed, true, true, 3, 1000)).toBe(armed); // slow tail: still sliding
  });

  it("survives the wire's velocity quantisation", () => {
    // Velocities ride as int16 centimetres per second, so an observer reads a rounded speed.
    const w = flat(); const b = createBody();
    run(w, b, SPRINT, 60);
    simulateBody(w, b, input(SPRINT | Btn.Crouch), 1, SPRINT);
    const q = (v: number) => Math.round(v * 100) / 100;
    expect(slideSeenUntil(0, b.crouching, b.grounded, Math.hypot(q(b.vx), q(b.vz)), 0)).toBeGreaterThan(0);
  });
});
