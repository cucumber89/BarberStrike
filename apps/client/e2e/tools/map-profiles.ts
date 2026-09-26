/**
 * map-profiles — what the map tools (`map-plan`, `map-duel`, `map-rotation`) need to know about a
 * map beyond its `MapDef`, keyed by map id.
 *
 * WHY. The tools were pinned to GÓRA: they imported `GORA` directly, hard-coded its extents and
 * measured "the same place from the other side" by rotating a point 180° (`rot`), which is only
 * true of a map that is its own rotation. DOLNA is a real plot and has no twin, so its places are
 * an explicit table (`DOLNA_PLACES`: both starts are timed to the SAME point, and a leading "*"
 * marks a contested place). This module holds, per map, the twin function when one exists, the
 * place and exit tables, and the name patterns for the ground, the boundary and the backdrop, so a
 * tool can run on any listed map while GÓRA's output stays bit-identical (its profile reproduces
 * exactly what the tools used to hard-code).
 */
import { MAPS, type MapDef } from "../../../../packages/shared/src/map";
import { GORA_PERCH_Y } from "../../../../packages/shared/src/gora";
import { DOLNA_PLACES, DOLNA_EXITS, DOLNA_GROUND, DOLNA_BOUNDARY } from "../../../../packages/shared/src/dolna";
import type { NavPoint } from "../../../../packages/shared/src/nav";

export interface MapProfile {
  map: MapDef;
  /** The 180° twin of a point, for a map that is its own rotation; absent when the map has none. */
  twin?: (p: NavPoint) => NavPoint;
  /** Solids a body walks on at y = 0 (the climb chain's base; drawn as `·`). */
  ground: RegExp;
  /** Solids that must never be standable (fences, hedges, the cage) — drawn as `~`. */
  boundary: RegExp;
  /** Scenery outside the play area, exempt from every check. */
  backdrop: RegExp;
  /** Stair treads. */
  stairs: RegExp;
  /** Places timed from both starts. With `twin`: from T0, and its twin from T1. Without: the same point from both. */
  places: Readonly<Record<string, NavPoint>>;
  /** Exits counted within 15 / 30 m of walked path from each start (twinned the same way). */
  exits: Readonly<Record<string, NavPoint>>;
  /** The perch's top, when the map has one. */
  perchY?: number;
}

const rot = (p: NavPoint): NavPoint => ({ x: -p.x, y: p.y, z: -p.z });

export const PROFILES: Readonly<Record<string, MapProfile>> = {
  gora: {
    map: MAPS.gora,
    twin: rot,
    ground: /^dach$/,
    boundary: /^(siatka_|attyka_)/,
    backdrop: /^(blok_|podworko_dol)/,
    stairs: /^schody_/,
    places: {
      "own crossroads (podest W)": { x: -6.2, y: 0, z: 0 },
      "own stair top → perch": { x: 0, y: GORA_PERCH_Y, z: 0 },
      "own court, beside the chairs": { x: 2.6, y: 0, z: -5.0 },
      "own lane nook": { x: -3.2, y: 0, z: -9.4 },
      "own yard, the tank": { x: -12.6, y: 0, z: 3.0 },
      "own bunting corner (NW)": { x: -14.6, y: 0, z: 9.4 },
      "far lane half (S east)": { x: 5.4, y: 0, z: -9.4 },
      "far crossroads (podest E)": { x: 6.2, y: 0, z: 0 },
      "far court, beside the chairs": { x: -2.6, y: 0, z: 5.0 },
      "far yard, the tank": { x: 12.6, y: 0, z: -3.0 },
      "the other start's door": { x: 15.2, y: 0, z: 2.4 },
      "the other start": { x: MAPS.gora.spawns.find((s) => s.team === 1)!.x, y: 0, z: MAPS.gora.spawns.find((s) => s.team === 1)!.z },
    },
    exits: {
      "the door north (yard)": { x: -15.2, y: 0, z: -2.0 },
      "the mouth east (court / lane)": { x: -7.0, y: 0, z: -9.0 },
      "stair W (perch)": { x: -6.6, y: 0, z: 0 },
      "the lane nook": { x: -3.2, y: 0, z: -9.4 },
      "the court": { x: -2.0, y: 0, z: -5.0 },
      "the yard tank": { x: -12.0, y: 0, z: 5.0 },
      "the NW corner": { x: -14.6, y: 0, z: 9.4 },
    },
    perchY: GORA_PERCH_Y,
  },
  dolna: {
    map: MAPS.dolna,
    ground: DOLNA_GROUND,
    boundary: DOLNA_BOUNDARY,
    backdrop: /^$/,
    stairs: /^(schody_|stairs?_)/,
    places: DOLNA_PLACES,
    exits: DOLNA_EXITS,
  },
};

export const DEFAULT_PROFILE_ID = "gora";

/** The profile named on the command line (default GÓRA); an unknown id ends the run with code 2. */
export function pickProfile(id = process.argv[2] ?? DEFAULT_PROFILE_ID): MapProfile {
  const p = PROFILES[id];
  if (!p) {
    console.error(`unknown map id "${id}"; known: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(2);
  }
  return p;
}
