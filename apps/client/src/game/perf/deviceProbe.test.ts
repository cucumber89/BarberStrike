import { describe, expect, it } from "vitest";
import { tierFromMeasurement } from "./deviceProbe";

describe("choosing a starting level from measured frames", () => {
  it("keeps the guess when the frames agree with it", () => {
    expect(tierFromMeasurement("medium", 14)).toBe("medium");
    expect(tierFromMeasurement("high", 15)).toBe("high");
  });

  it("drops one level when the frames are merely over budget", () => {
    expect(tierFromMeasurement("high", 20)).toBe("medium");
    expect(tierFromMeasurement("medium", 20)).toBe("low");
  });

  it("drops two when they are far over, rather than crawling down one measurement at a time", () => {
    expect(tierFromMeasurement("high", 40)).toBe("low");
    expect(tierFromMeasurement("medium", 40)).toBe("low");
  });

  it("raises at most one level, however fast the opening seconds look", () => {
    // A quiet spawn room is not the heaviest part of a match, so easy frames buy one level, never two.
    expect(tierFromMeasurement("low", 3)).toBe("medium");
    expect(tierFromMeasurement("medium", 2)).toBe("high");
    expect(tierFromMeasurement("high", 1)).toBe("high");
  });

  it("never runs off either end of the scale", () => {
    expect(tierFromMeasurement("low", 500)).toBe("low");
    expect(tierFromMeasurement("high", 0.5)).toBe("high");
  });

  it("follows the target frame rate, not a fixed 60", () => {
    // 14 ms is comfortable at 60 fps. Against a 120 fps target it is 1.7x the budget, which is the
    // "far over" case — and asking for 120 fps IS asking to be dropped hard to get there.
    expect(tierFromMeasurement("high", 14, 60)).toBe("high");
    expect(tierFromMeasurement("high", 14, 120)).toBe("low");
    expect(tierFromMeasurement("high", 10, 120)).toBe("medium");
  });
});
