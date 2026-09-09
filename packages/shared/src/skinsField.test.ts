import { expect, it } from "vitest";
import { decodeBuild, decodeCosmetics, decodeSkins, encodeCosmetics, encodeSkins, sanitizeSkins } from "./skinsField";
import { DEFAULT_BUILD } from "./builds";
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

it("carries the body build in the same field, without a schema field for it", () => {
  const map = { rifle: "osy" };
  // The build leads, so an overflowing field loses a gun's paint rather than the player's shape.
  expect(encodeCosmetics(map, "byk")).toBe("body=byk,rifle=osy");
  expect(decodeCosmetics("body=byk,rifle=osy")).toEqual({ skins: map, build: "byk" });
  // The default is the ABSENCE of an entry: every player who never opened the wardrobe sends the
  // same field they always did, so nothing on the wire changes for them.
  expect(encodeCosmetics(map, DEFAULT_BUILD)).toBe("rifle=osy");
  expect(decodeCosmetics("rifle=osy").build).toBe(DEFAULT_BUILD);
});
it("never trusts a build id off the wire", () => {
  for (const forged of ["body=nonsense", "body=<script>", "body=", "body=BYK", "body=byk=byk", "BODY=byk"]) {
    expect(decodeBuild(forged), forged).toBe(DEFAULT_BUILD);
  }
  expect(decodeBuild(null)).toBe(DEFAULT_BUILD);
  expect(sanitizeSkins("body=nonsense,rifle=osy")).toBe("rifle=osy");
  expect(sanitizeSkins("body=byk,rifle=osy")).toBe("body=byk,rifle=osy");
});
it("still fits every weapon plus a build inside the bound", () => {
  const map = Object.fromEntries(WEAPON_ORDER.map(w => [w, "a".repeat(64)]));
  const field = encodeCosmetics(map, "przygarbiony");
  expect(field.length).toBeLessThanOrEqual(400);
  expect(decodeCosmetics(field).build).toBe("przygarbiony");
  // A flood of entries cannot push the build out or smuggle a twelfth weapon in.
  expect(Object.keys(decodeCosmetics(Array(30).fill("rifle=osy").join(",")).skins).length).toBe(1);
});
it("the build key is not a weapon id", () => {
  // The whole scheme rests on this: if a weapon were ever called `body`, one would silently eat
  // the other. Cheap to assert, impossible to notice otherwise.
  expect(WEAPON_ORDER as readonly string[]).not.toContain("body");
});
