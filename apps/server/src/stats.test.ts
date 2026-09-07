import { describe, expect, it } from "vitest";
import { recordTick, tickStats } from "./stats";

describe("tick stats for /health", () => {
  it("reports the worst and the mean tick of the last minute and forgets older seconds", () => {
    const t0 = 1_700_000_000_000;
    recordTick(0.4, t0); recordTick(0.6, t0); recordTick(12.5, t0 + 1000); recordTick(0.5, t0 + 2000);
    let s = tickStats(t0 + 2500);
    expect(s.maxMs).toBe(12.5);
    expect(s.meanMs).toBeCloseTo((0.4 + 0.6 + 12.5 + 0.5) / 4, 3);
    // Sixty-one seconds later the 12.5 ms tick is out of the window; a fresh tick is in.
    recordTick(0.7, t0 + 62_000);
    s = tickStats(t0 + 62_000);
    expect(s.maxMs).toBe(0.7);
    expect(s.meanMs).toBe(0.7);
    expect(s.windowS).toBe(60);
  });
});
