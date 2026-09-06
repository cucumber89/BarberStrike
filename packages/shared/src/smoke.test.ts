import { expect, it } from "vitest";
import { smokeBlocks } from "./smoke";
const clouds = [{ x: 0, y: 0, z: 0, born: 0, until: 10000 }];
it("blocks sight across smoke and from inside it, but clears on expiry", () => {
  expect(smokeBlocks(clouds, 1000, -10, 1.6, 0, 10, 1.6, 0)).toBe(true);
  expect(smokeBlocks(clouds, 1000, 0, 1.6, 0, 10, 1.6, 0)).toBe(true);
  expect(smokeBlocks(clouds, 1000, -10, 1.6, 10, 10, 1.6, 10)).toBe(false);
  expect(smokeBlocks(clouds, 11000, -10, 1.6, 0, 10, 1.6, 0)).toBe(false);
});
