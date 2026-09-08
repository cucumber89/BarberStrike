import { describe, expect, it } from "vitest";
import { DynamicScale } from "./dynamicScale";

const feed = (d: DynamicScale, ms: number, frames: number): number[] => {
  const changes: number[] = [];
  for (let i = 0; i < frames; i++) { const s = d.update(ms); if (s !== null) changes.push(s); }
  return changes;
};

describe("DynamicScale", () => {
  it("recovers at a stable 60 Hz when targeting 60 FPS", () => {
    const d = new DynamicScale({target:1}); d.setTargetFps(60);
    feed(d, 40, 200); expect(d.scale).toBeLessThan(1);
    feed(d, 1000/60, 900); expect(d.scale).toBe(1);
  });
  it("can lower resolution again when the first reduction was insufficient", () => {
    const d = new DynamicScale({target:1});
    const changes = feed(d, 30, 400);
    expect(changes.length).toBeGreaterThan(1);
    expect(d.scale).toBeCloseTo(.6);
  });
  it("ignores invalid timings without poisoning the smoother", () => {
    const d = new DynamicScale({target:1});
    for (const dt of [NaN, Infinity, -1, 0]) expect(d.update(dt)).toBeNull();
    expect(Number.isFinite(d.smoothedMs)).toBe(true);
    expect(feed(d, 16, 200)).toEqual([]);
  });
  it("starts at the user's target and stays there while frames are fast enough", () => {
    const d = new DynamicScale({ target: 1 });
    expect(d.scale).toBe(1);
    expect(feed(d, 15, 600)).toEqual([]);
    expect(d.scale).toBe(1);
  });

  it("steps down as far as the measurement says, not one notch at a time", () => {
    // 30 ms frames want sqrt(17/30) = 0.75 of the scale, so two notches at once.
    const d = new DynamicScale({ target: 1 });
    const changes = feed(d, 30, 400);
    expect(changes[0]).toBeCloseTo(0.8, 5);
    // Each decision waits hold (600 ms) + cooldown (1500 ms) ≈ 70 frames at 30 ms.
    expect(changes.length).toBeLessThanOrEqual(3);
  });

  it("reaches the floor in one step when the machine is far too slow", () => {
    // The case that made this worth changing: the software renderer needed all four notches and
    // took 8.5 s of unplayable frames to crawl there, one notch per 2.1 s.
    const d = new DynamicScale({ target: 1, minFactor: 0.6 });
    const changes = feed(d, 200, 40); // ~8 s of 200 ms frames — but only ~2.1 s are needed
    expect(changes.length).toBe(1);
    expect(changes[0]).toBeCloseTo(0.6, 5);
  });

  it("still climbs back one notch at a time", () => {
    // Overshooting downwards costs sharpness for a second; overshooting upwards costs frames.
    const d = new DynamicScale({ target: 1, minFactor: 0.6 });
    feed(d, 200, 40);
    expect(d.scale).toBeCloseTo(0.6, 5);
    const up = feed(d, 5, 2000);
    expect(up[0]).toBeCloseTo(0.7, 5);
    expect(up[1]).toBeCloseTo(0.8, 5);
  });

  it("never drops below the floor", () => {
    const d = new DynamicScale({ target: 1, minFactor: 0.6 });
    feed(d, 50, 5000);
    expect(d.scale).toBeCloseTo(0.6, 5);
    expect(new DynamicScale({ target: 0.6 }).scale).toBe(0.6);
    const low = new DynamicScale({ target: 0.6 });
    feed(low, 50, 5000);
    expect(low.scale).toBeGreaterThanOrEqual(0.5); // absolute floor
  });

  it("recovers when frames get fast again, and does not oscillate in the dead band", () => {
    const d = new DynamicScale({ target: 1 });
    feed(d, 30, 200);
    const dropped = d.scale;
    expect(dropped).toBeLessThan(1);
    // 16 ms is between fast (12.5) and slow (20): hold position.
    expect(feed(d, 16, 400)).toEqual([]);
    expect(d.scale).toBe(dropped);
    // Fast frames: climb back to the target.
    feed(d, 8, 3000);
    expect(d.scale).toBe(1);
  });

  it("ignores a single spike (EMA + hold time)", () => {
    const d = new DynamicScale({ target: 1 });
    feed(d, 14, 100);
    expect(d.update(90)).toBeNull();
    expect(feed(d, 14, 100)).toEqual([]);
    expect(d.scale).toBe(1);
  });

  it("retarget restarts from the new user scale", () => {
    const d = new DynamicScale({ target: 1 });
    feed(d, 30, 300);
    d.retarget(0.75);
    expect(d.scale).toBe(0.75);
  });
});
