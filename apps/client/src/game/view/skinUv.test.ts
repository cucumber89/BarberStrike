import { expect, it } from "vitest";
import { boxProjectUvs } from "./skinUv";

it("keeps adjacent parts continuous at a shared root-space edge", () => {
  const left = boxProjectUvs([0, 0, 0, 0, .16, .32], [1, 0, 0, 1, 0, 0]);
  const right = boxProjectUvs([0, .16, .32, 0, .16, .64], [1, 0, 0, 1, 0, 0]);
  expect([...left.slice(2)]).toEqual([...right.slice(0, 2)]);
  expect(right[2] - right[0]).toBe(1);
});
it("projects every dominant normal, deterministically without normalising tiles", () => {
  const p = [0, .32, .64, .32, 0, .64, .64, .32, 0];
  const n = [-1, 0, 0, 0, -1, 0, 0, 0, 1];
  expect([...boxProjectUvs(p, n)]).toEqual([2.5, 1.5, 2.5, 1.5, 2.5, 1.5]);
  expect(boxProjectUvs(p, n)).toEqual(boxProjectUvs(p, n));
  expect(() => boxProjectUvs(p, n, 0)).toThrow();
});
