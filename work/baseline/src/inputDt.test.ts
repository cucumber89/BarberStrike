import { describe, expect, it } from "vitest";
import { InputDt } from "./inputDt";
import { INPUT_DT_STEP_MS, MAX_INPUT_DT_MS, TICK_MS } from "./constants";

/** What the old per-frame rounding did, kept here so the regression is a comparison, not a claim. */
const roundPerFrame = (dtMs: number): number => Math.min(MAX_INPUT_DT_MS, Math.max(1, Math.round(dtMs * 10) / 10));

/** Sum of `dt` a client would send for `frames` frames of `dtMs` each. */
function sent(dtMs: number, frames: number, q: InputDt): number {
  let total = 0;
  for (let i = 0; i < frames; i++) total += q.step(dtMs);
  return total;
}

describe("input dt quantisation", () => {
  it("sums to real time at the refresh rates people actually play on", () => {
    // 60 s of play at each rate. The bank's whole slack is 120 ms, so an error budget of one step
    // over a minute is the only one that means anything.
    for (const hz of [30, 60, 75, 100, 120, 144, 165, 240]) {
      const dtMs = 1000 / hz;
      const frames = hz * 60;
      const total = sent(dtMs, frames, new InputDt());
      expect(Math.abs(total - dtMs * frames), `${hz} Hz`).toBeLessThanOrEqual(INPUT_DT_STEP_MS);
    }
  });

  it("stops the 60 Hz overdraft that drained the server's time bank", () => {
    // 16.6667 rounds UP to 16.7, so the old code asked for 2 ms more than every second contained.
    const frames = 60 * 60; // one minute
    const dtMs = 1000 / 60;
    const real = dtMs * frames;
    let old = 0;
    for (let i = 0; i < frames; i++) old += roundPerFrame(dtMs);
    expect(old - real).toBeGreaterThan(100); // over the bank's entire 120 ms of slack in a minute
    expect(Math.abs(sent(dtMs, frames, new InputDt()) - real)).toBeLessThanOrEqual(INPUT_DT_STEP_MS);
  });

  it("never overdraws the bank on any frame time between 1 and 240 fps", () => {
    // The bank refills TICK_MS per tick, so a stream that stays at or under real time can always be
    // afforded. Swept rather than spot-checked: the failure above only showed up at one rate.
    for (let hz = 1; hz <= 240; hz++) {
      const dtMs = 1000 / hz;
      const q = new InputDt();
      let total = 0;
      for (let i = 0; i < hz * 10; i++) total += q.step(dtMs);
      const real = dtMs * hz * 10;
      expect(total - real, `${hz} Hz overdraft`).toBeLessThanOrEqual(INPUT_DT_STEP_MS);
      expect(total).toBeGreaterThan(0);
    }
  });

  it("clamps a stalled tab and does not hand the lost time back afterwards", () => {
    const q = new InputDt();
    expect(q.step(2000)).toBe(MAX_INPUT_DT_MS);
    // The next ordinary frame is an ordinary frame: no debt from the stall rides along with it.
    expect(q.step(TICK_MS)).toBeLessThanOrEqual(TICK_MS + INPUT_DT_STEP_MS);
  });

  it("never emits a free or negative input", () => {
    const q = new InputDt();
    for (const dt of [0, -5, 0.01, 0.04]) expect(q.step(dt)).toBeGreaterThanOrEqual(INPUT_DT_STEP_MS);
  });

  it("forgets its debt across a break in the stream", () => {
    const q = new InputDt();
    q.step(16.6667);
    q.reset();
    expect(q.step(10)).toBe(10);
  });
});
