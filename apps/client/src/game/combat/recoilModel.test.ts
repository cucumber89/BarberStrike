import { describe, expect, it } from "vitest";
import { WEAPONS, WEAPON_ORDER, fireIntervalMs } from "@frankibarber/shared";
import { AimRecoil, STANCE, Spring, ViewPunch, criticalStep, peakFactor, springRate, stanceScale } from "./recoilModel";
import { feelOf } from "./weaponFeel";

/** Runs the aim recoil at 60 fps for `ms`, starting from `t0`; returns the clock after. */
function run(r: AimRecoil, t0: number, ms: number, frame = 1000 / 60): number {
  let t = t0;
  for (let e = 0; e < ms; e += frame) { t += frame; r.step(frame / 1000, t); }
  return t;
}

describe("realistic recoil: the aim", () => {
  it("delivers exactly the pattern step, but over the rise time instead of in one frame", () => {
    const r = new AimRecoil();
    r.kick(0.05, 0.01, 30, 8, 90, 0);
    // The view has not teleported: the first frame carries only part of the kick.
    r.step(1 / 60, 1000 / 60);
    expect(-r.pitch).toBeGreaterThan(0.02);
    expect(-r.pitch).toBeLessThan(0.05);
    // The committed total is the full step from the first instant (what the signature tool reads).
    expect(r.totalPitch).toBeCloseTo(-0.05, 6);
    expect(r.totalYaw).toBeCloseTo(0.01, 6);
    // By the end of the rise (still inside the hold) the view is where the pattern put it.
    run(r, 1000 / 60, 50);
    expect(r.pitch).toBeCloseTo(-0.05, 3);
    expect(r.yaw).toBeCloseTo(0.01, 3);
  });

  it("holds, then comes back with a spring that starts slowly and never overshoots", () => {
    const r = new AimRecoil();
    r.kick(0.06, 0, 30, 8, 90, 0);
    let t = run(r, 0, 80);
    const atHold = r.pitch;
    expect(atHold).toBeCloseTo(-0.06, 3);
    // First frame of the return: an exponential would drop 12 % here, the spring barely moves.
    t = run(r, t, 1000 / 60);
    expect(Math.abs(r.pitch)).toBeGreaterThan(Math.abs(atHold) * 0.97);
    // Settled to 5 % at the moment the old exponential would have (3 / recoverPerSec).
    let min = 0;
    const settle = (3 / 8) * 1000;
    t = run(r, t, settle);
    for (let i = 0; i < 120; i++) { t = run(r, t, 1000 / 60); min = Math.max(min, r.pitch); }
    expect(Math.abs(r.pitch)).toBeLessThan(0.003);
    expect(min).toBeLessThanOrEqual(0); // never swung past centre into a downward kick
  });

  it("stacks a burst: the arms do not pull back between rounds while the hold is running", () => {
    const r = new AimRecoil();
    let t = 0;
    for (let i = 0; i < 6; i++) { r.kick(0.008, 0.002, 24, 10, 90, t); t = run(r, t, 71); }
    expect(r.pitch).toBeLessThan(-0.045);
  });

  it("lets a pull-down spend the recoil so the view does not spring back over the correction", () => {
    const r = new AimRecoil();
    r.kick(0.05, 0, 30, 8, 90, 0);
    run(r, 0, 60);
    r.spendPitch(0.03);   // mouse pulls down 30 mrad against a -50 mrad climb
    expect(r.pitch).toBeCloseTo(-0.02, 3);
    r.spendPitch(-0.03);  // moving further UP is not a correction
    expect(r.pitch).toBeCloseTo(-0.02, 3);
    r.spendPitch(1);      // cannot spend past zero
    expect(r.pitch).toBe(0);
  });

  it("is framerate-independent: 30 fps and 144 fps land in the same place", () => {
    const at = (fps: number) => {
      const r = new AimRecoil();
      r.kick(0.07, 0.012, 45, 6, 100, 0);
      run(r, 0, 300, 1000 / fps);
      return r.pitch;
    };
    expect(at(30)).toBeCloseTo(at(144), 2);
  });

  it("the critical spring step is exact", () => {
    const out: [number, number] = [0, 0];
    // Two half steps equal one full step (the closed form composes).
    const [x1, v1] = criticalStep(1, 0, 10, 0.05, out);
    const [x2] = criticalStep(x1, v1, 10, 0.05, [0, 0]);
    expect(x2).toBeCloseTo(criticalStep(1, 0, 10, 0.1, [0, 0])[0], 10);
    expect(springRate(3)).toBeCloseTo(4.74, 2);
  });
});

describe("realistic recoil: the body", () => {
  it("scales the kick by stance the way a shooter braces", () => {
    const base = stanceScale({ crouching: false, moving: false, airborne: false, aiming: false });
    expect(base).toBe(1);
    expect(stanceScale({ crouching: true, moving: false, airborne: false, aiming: false })).toBeLessThan(1);
    expect(stanceScale({ crouching: false, moving: true, airborne: false, aiming: false })).toBeGreaterThan(1);
    const air = stanceScale({ crouching: false, moving: true, airborne: true, aiming: false });
    expect(air).toBe(STANCE.airborne); // in the air a crouch or a stride is not a stance
    expect(stanceScale({ crouching: true, moving: false, airborne: false, aiming: true })).toBeCloseTo(STANCE.crouch * STANCE.aimed, 6);
  });

  it("punches the camera and settles through a small overshoot inside a fifth of a second", () => {
    const p = new ViewPunch();
    p.hit(0.06, { kickMs: 30, punch: 0.5, roll: 0.02 }, false, () => 0.9);
    let peak = 0, over = 0;
    for (let i = 0; i < 12; i++) { p.step(1 / 60); peak = Math.min(peak, p.pitch.x); over = Math.max(over, p.pitch.x); }
    expect(peak).toBeLessThan(-0.02);           // up by about half the kick
    expect(peak).toBeGreaterThan(-0.04);
    expect(over).toBeGreaterThan(0);            // came back past centre...
    expect(over).toBeLessThan(-peak * 0.3);     // ...but only a little
    expect(Math.abs(p.pitch.x)).toBeLessThan(Math.abs(peak) * 0.15);
    expect(p.roll.x).not.toBe(0);
  });

  it("aims its impulse so a spring at rest peaks where it was told to", () => {
    for (const zeta of [0.4, 0.5, 0.7, 1]) {
      const s = new Spring(30, zeta);
      s.impulse(0.05);
      let peak = 0;
      for (let i = 0; i < 400; i++) { s.step(1 / 2000); peak = Math.max(peak, s.x); }
      expect(peak / 0.05, `zeta ${zeta}`).toBeCloseTo(1, 1);
    }
    expect(peakFactor(1)).toBeCloseTo(1 / Math.E, 6);
  });
});

describe("realistic recoil: the roster", () => {
  it("finishes every muzzle rise well before the next round of an automatic", () => {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const shape = feelOf(id).recoil;
      expect(shape.kickMs, id).toBeGreaterThan(0);
      if (w.kind === "melee") continue;
      // Half the interval: the next shot is aimed from a view that has finished moving, so the
      // shot direction and its input's angles agree (the server checks them, handoff P1).
      expect(shape.kickMs, id).toBeLessThanOrEqual(fireIntervalMs(w) / 2);
    }
  });

  it("gives the heavy hitters the slowest, hardest rise and the SMGs the quickest", () => {
    const k = (id: Parameters<typeof feelOf>[0]) => feelOf(id).recoil;
    expect(k("sniper").kickMs).toBeGreaterThan(k("rifle").kickMs);
    expect(k("shotgun").punch).toBeGreaterThan(k("rifle").punch);
    expect(k("smg2").kickMs).toBeLessThan(k("rifle").kickMs);
    expect(k("clippers").punch).toBe(0);
  });
});
