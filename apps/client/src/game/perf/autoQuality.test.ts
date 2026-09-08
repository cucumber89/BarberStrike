import { describe, expect, it } from "vitest";
import { AutoQuality, type AutoTier } from "./autoQuality";

/** Feed `ms` frames for `forMs` of simulated time; returns every tier change seen. */
function run(q: AutoQuality, ms: number, forMs: number): AutoTier[] {
  const seen: AutoTier[] = [];
  for (let t = 0; t < forMs; t += ms) { const c = q.update(ms); if (c) seen.push(c); }
  return seen;
}

describe("automatic quality", () => {
  it("drops a level when the machine cannot hold the frame rate", () => {
    const q = new AutoQuality("high");
    // 40 ms frames = 25 fps against a 60 fps target.
    const changes = run(q, 40, 12_000);
    expect(changes[0]).toBe("medium");
    expect(q.tier).toBe("low");
  });

  it("raises a level when there is real headroom, but slowly", () => {
    const q = new AutoQuality("low");
    // 8 ms frames = 125 fps. Nothing may happen in the first few seconds.
    expect(run(q, 8, 5_000)).toEqual([]);
    expect(run(q, 8, 8_000)).toEqual(["medium"]);
  });

  it("does nothing at all while the frame rate is merely adequate", () => {
    // 15.5 ms: under the 16.7 ms budget, but without the headroom a step up needs. This band is
    // the anti-flap gap — a machine sitting here must be left alone indefinitely.
    const q = new AutoQuality("medium");
    expect(run(q, 15.5, 120_000)).toEqual([]);
    expect(q.tier).toBe("medium");
  });

  it("stops trying to climb once it has been knocked back twice", () => {
    const q = new AutoQuality("low");
    for (let i = 0; i < 6; i++) {
      run(q, 8, 12_000);   // looks fast at the current level → step up
      run(q, 40, 12_000);  // the new level cannot hold it → step back down
    }
    expect(q.state.locked).toBe(true);
    // Locked: however long it now looks fast, it will not climb again.
    const before = q.tier;
    expect(run(q, 6, 60_000)).toEqual([]);
    expect(q.tier).toBe(before);
  });

  it("never skips a level, however bad the frames are", () => {
    const q = new AutoQuality("high");
    const changes = run(q, 200, 30_000);
    expect(changes).toEqual(["medium", "low"]);
  });

  it("ignores one long hitch", () => {
    const q = new AutoQuality("high");
    run(q, 10, 6_000);            // comfortable
    for (let i = 0; i < 3; i++) q.update(400);  // three enormous frames: an asset decode, not the GPU
    expect(run(q, 10, 4_000)).toEqual([]);
    expect(q.tier).toBe("high");
  });

  it("does not judge a new level on the old level's frame times", () => {
    const q = new AutoQuality("high");
    run(q, 40, 4_000);
    expect(q.tier).toBe("medium");
    // Immediately after the step, the director must be settling rather than stepping again.
    expect(q.update(40)).toBe(null);
  });

  it("adopts a hand-picked level and forgets what it had concluded", () => {
    const q = new AutoQuality("low");
    for (let i = 0; i < 6; i++) { run(q, 8, 12_000); run(q, 40, 12_000); }
    expect(q.state.locked).toBe(true);
    q.reset("high");
    expect(q.tier).toBe("high");
    expect(q.state).toMatchObject({ locked: false, reversals: 0 });
  });

  it("follows the player's target frame rate", () => {
    const q = new AutoQuality("high", { targetFps: 120 });
    // 14 ms is a comfortable 71 fps — and far too slow for a 120 fps target.
    expect(run(q, 14, 10_000)[0]).toBe("medium");
  });
});
