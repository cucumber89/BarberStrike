import { describe, expect, it } from "vitest";
import { FpsMeter, fpsFromFrameMs, medianFrameMs, WARN_FPS, WARN_HOLD_MS } from "./fpsMeter";

describe("fpsMeter — median frame time and FPS", () => {
  it("has no reading before any frame", () => {
    const m = new FpsMeter();
    expect(m.reading()).toEqual({ frameMs: 0, fps: 0, samples: 0 });
    expect(m.warn).toBe(false);
  });

  it("reports the median frame time, not the mean, so one hitch does not decide it", () => {
    // Eight good frames and one 300 ms GC hitch: the mean is ~48 ms, the median is a good frame.
    const good = Array(8).fill(16.7);
    expect(medianFrameMs([...good, 300])).toBeCloseTo(16.7, 1);
  });

  it("averages the two middle samples on an even window", () => {
    expect(medianFrameMs([10, 20])).toBe(15);
    expect(medianFrameMs([20, 10, 30, 40])).toBe(25);
  });

  it("turns a median frame time into whole FPS", () => {
    expect(fpsFromFrameMs(16.7)).toBe(60);
    expect(fpsFromFrameMs(33.3)).toBe(30);
    expect(fpsFromFrameMs(20)).toBe(50);
    expect(fpsFromFrameMs(0)).toBe(0);
  });

  it("ignores non-frames (a zero, a NaN, a backgrounded-tab gap)", () => {
    const m = new FpsMeter();
    m.push(0); m.push(NaN); m.push(-5);
    expect(m.reading().samples).toBe(0);
    m.push(16.7);
    expect(m.reading().samples).toBe(1);
  });

  it("keeps only the last `window` frames", () => {
    const m = new FpsMeter({ window: 3 });
    for (const dt of [10, 10, 10, 100, 100, 100]) m.push(dt);
    expect(m.reading().samples).toBe(3);
    expect(m.reading().frameMs).toBe(100);
  });
});

describe("fpsMeter — the 'sprzęt ledwo nadąża' warning", () => {
  it("does not warn while frames stay at or above 40 fps", () => {
    const m = new FpsMeter();
    // 20 ms = 50 fps, comfortably above the 40-fps threshold, for well over the hold window.
    for (let t = 0; t < WARN_HOLD_MS * 2; t += 20) m.push(20);
    expect(m.warn).toBe(false);
  });

  it("latches only after FPS sits under 40 for at least three seconds", () => {
    // A small window so the median reads "low" from the first frame; every 30 ms frame ≈ 33 fps.
    const m = new FpsMeter({ window: 8 });
    // Feed frames worth just under three seconds of wall time: not yet warned.
    let t = 0;
    while (t + 30 <= WARN_HOLD_MS - 30) { m.push(30); t += 30; }
    expect(m.belowFor).toBeLessThan(WARN_HOLD_MS);
    expect(m.warn).toBe(false);
    // A few more frames cross the three-second hold: now it warns.
    while (m.belowFor < WARN_HOLD_MS) { m.push(30); t += 30; }
    expect(m.belowFor).toBeGreaterThanOrEqual(WARN_HOLD_MS);
    expect(m.warn).toBe(true);
  });

  it("clears once frames recover past the threshold", () => {
    const m = new FpsMeter({ window: 8 });
    for (let t = 0; t < WARN_HOLD_MS + 300; t += 30) m.push(30);
    expect(m.warn).toBe(true);
    // A run of comfortable frames flushes the (small) window back over 40 fps and drops the warning.
    for (let i = 0; i < 8; i++) m.push(16.7);
    expect(m.warn).toBe(false);
    expect(m.belowFor).toBe(0);
  });

  it("a single hitch inside a healthy stream never latches the warning", () => {
    const m = new FpsMeter();
    for (let i = 0; i < 120; i++) m.push(16.7);
    m.push(300); // one GC hitch
    expect(m.warn).toBe(false);
  });

  it("reset forgets samples and the warn state", () => {
    const m = new FpsMeter({ window: 8 });
    for (let t = 0; t < WARN_HOLD_MS + 300; t += 30) m.push(30);
    m.reset();
    expect(m.reading().samples).toBe(0);
    expect(m.warn).toBe(false);
    expect(m.belowFor).toBe(0);
  });

  it("exposes the spec thresholds it defends", () => {
    expect(WARN_FPS).toBe(40);
    expect(WARN_HOLD_MS).toBe(3000);
  });
});
