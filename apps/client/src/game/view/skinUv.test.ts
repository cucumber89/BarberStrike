import { expect, it } from "vitest";
import { genericFrame } from "@frankibarber/skins";
import { boxProjectUvs, sideProjectUvs } from "./skinUv";

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

it("side-projects each flank into its own band and rejects mismatched buffers", () => {
  const f = genericFrame("rifle");
  const uv = sideProjectUvs([.02, .04, .1, -.02, .04, .1, 0, .08, .1], [1, 0, 0, -1, 0, 0, 0, 1, 0], f);
  expect(uv[0]).toBe(uv[2]); expect(uv[1]).toBeGreaterThan(.5); expect(uv[3]).toBeLessThan(.5);
  for (const v of uv) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
  expect(() => sideProjectUvs([0, 0, 0], [0, 0], f)).toThrow();
});
