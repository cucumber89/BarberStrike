import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MAPS } from "@frankibarber/shared";
import { buildArchitecture } from "./architecture";
import { hasDistrictDressing } from "./MapBuilder";

/**
 * `architecture.ts` (and the `streetscape.ts` it calls) are literal NIGHT_DISTRICT coordinates and
 * NIGHT_DISTRICT solid names. Built for GÓRA they were 206 boxes of shopfront and street furniture
 * floating through a flat, so `buildMap` asks first — this counts what the gate lets through.
 */
const dressingPieces = (mapId: string): number => {
  const scene = new Scene(new NullEngine());
  const add = vi.fn();
  const map = MAPS[mapId];
  if (hasDistrictDressing(map)) buildArchitecture(scene, map, add);
  const n = add.mock.calls.length;
  scene.dispose();
  return n;
};

describe("district dressing", () => {
  it("adds nothing at all to a map that is not the district (Drop G: GÓRA is a flat)", () => {
    expect(hasDistrictDressing(MAPS.gora)).toBe(false);
    expect(dressingPieces("gora")).toBe(0);
  });

  it("still dresses NIGHT_DISTRICT, which is what it was written for", () => {
    expect(hasDistrictDressing(MAPS.night_district)).toBe(true);
    expect(dressingPieces("night_district")).toBeGreaterThan(200);
  });
});
