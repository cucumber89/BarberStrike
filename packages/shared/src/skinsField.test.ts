import { expect, it } from "vitest";
import { decodeSkins, encodeSkins, sanitizeSkins } from "./skinsField";
import { WEAPON_ORDER } from "./weapons";

it("round-trips in canonical weapon order", () => {
  const map = { rifle: "slupek-frankiego", pistol: "osy" };
  expect(decodeSkins(encodeSkins(map))).toEqual(map);
  expect(sanitizeSkins("rifle=slupek-frankiego,pistol=osy")).toBe(encodeSkins(map));
});
it("rejects junk, invalid names, oversized ids and partial overflow entries", () => {
  expect(decodeSkins(null)).toEqual({});
  expect(decodeSkins("evil=osy,rifle=<img>,pistol=UPPER,smg=a=b,dmr=good-id")).toEqual({ dmr: "good-id" });
  expect(decodeSkins(`rifle=${"x".repeat(401)}`)).toEqual({});
  const map = Object.fromEntries(WEAPON_ORDER.map(w => [w, "a".repeat(64)]));
  const field = encodeSkins(map); expect(field.length).toBeLessThanOrEqual(400);
  expect(Object.keys(decodeSkins(field)).length).toBeLessThanOrEqual(11);
  expect(Object.values(decodeSkins(field)).every(v => v.length === 64)).toBe(true);
  expect(decodeSkins(Array(12).fill("rifle=osy").join(","))).toEqual({ rifle: "osy" });
});
