import type { MaterialTag } from "@frankibarber/shared";

/** Metres from anchor minX / top / minZ. Roof furniture stays on closed roofs; the loading
 * stack and mezzanine get thin relief, preserving their traversable top surfaces.
 * Structural dimensions use .25 m, smaller detail .1 m and trim .05 m.
 */
export type LandmarkPiece = [number,number,number,number,number,number,MaterialTag,("cylinder"|"box")?,number?];
export interface DistrictLandmark { area: string; anchor: string; purpose: string; pieces: LandmarkPiece[] }
export const DISTRICT_LANDMARKS: DistrictLandmark[] = [];
