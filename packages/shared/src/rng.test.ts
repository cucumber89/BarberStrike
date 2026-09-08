import { describe, expect, it } from "vitest";
import { hashString, mulberry32, pick, weightedPick } from "./rng";

describe("cosmetic randomness", () => {
  it("pins the stream and uint32 hashing", () => {
    const rng = mulberry32(1);
    expect(Array.from({ length: 3 }, rng)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(hashString("hello")).toBe(1335831723);
    expect(mulberry32(-1)()).toBe(mulberry32(4294967295)());
  });
  it("picks positive weights only and rejects invalid tables", () => {
    const table = [{ value: "off", weight: 0 }, { value: "a", weight: 1 }, { value: "b", weight: 3 }];
    expect(weightedPick(() => 0, table)).toBe("a");
    expect(weightedPick(() => .25, table)).toBe("b");
    expect(() => weightedPick(Math.random, [])).toThrow();
    expect(() => weightedPick(Math.random, [{ value: 1, weight: NaN }])).toThrow();
    expect(pick(() => .5, [1, 2])).toBe(2);
    expect(() => pick(Math.random, [])).toThrow();
  });
});
