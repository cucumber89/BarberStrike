import type { MaterialTag } from "@frankibarber/shared";

/** Metres from anchor minX / top / minZ. Roof furniture stays on closed roofs; the loading
 * stack and mezzanine get thin relief, preserving their traversable top surfaces.
 * Structural dimensions use .25 m, smaller detail .1 m and trim .05 m.
 */
export type LandmarkPiece = [number,number,number,number,number,number,MaterialTag,("cylinder"|"box")?,number?];
export interface DistrictLandmark { area: string; anchor: string; purpose: string; pieces: LandmarkPiece[] }
export const DISTRICT_LANDMARKS: DistrictLandmark[] = [];

DISTRICT_LANDMARKS.push({
  "area": "west_yard",
  "anchor": "north_facade",
  "purpose": "Three stepped district-heating flues terminate the empty service corridor.",
  "pieces": [
    [
      4.25,
      0.125,
      0.15,
      4,
      0.25,
      1,
      "metal"
    ],
    [
      3,
      1,
      0.15,
      0.75,
      1.75,
      0.75,
      "paint_blue",
      "cylinder"
    ],
    [
      4.5,
      1.5,
      0.15,
      0.75,
      2.75,
      0.75,
      "paint_blue",
      "cylinder"
    ],
    [
      6,
      1.25,
      0.15,
      0.75,
      2.25,
      0.75,
      "paint_blue",
      "cylinder"
    ],
    [
      3,
      1.9,
      0.15,
      1,
      0.1,
      1,
      "paint_white",
      "cylinder"
    ],
    [
      4.5,
      2.9,
      0.15,
      1,
      0.1,
      1,
      "paint_white",
      "cylinder"
    ],
    [
      6,
      2.4,
      0.15,
      1,
      0.1,
      1,
      "paint_white",
      "cylinder"
    ]
  ]
});
