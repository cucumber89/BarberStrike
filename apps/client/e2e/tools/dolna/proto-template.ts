/**
 * proto-template — copy me to proto-<school>.ts. A prototype MapDef for the design table: only
 * what shapes the fight (ground, boundary, buildings as boxes with openings, cover at the right
 * heights, fences/hedges, starts, stations, flags, sites). Props and lights may stay empty.
 * Coordinates in metres, +X east, +Z north, floor top at y = 0. Names in English, no spaces.
 */
import { boxFrom } from "../../../../../packages/shared/src/collision";
import type { MapDef, MaterialTag, Solid, SolidLook, SpawnPoint } from "../../../../../packages/shared/src/map";

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

const solids: Solid[] = [];
// Ground as NON-overlapping panels laid up to the walls (floor audit): e.g. the street, the verge, the drive, the lawn.
solids.push(S(-35, -1, -12, 70, 1, 12, "soil", "ground_street"));
solids.push(S(-35, -1, 0, 70, 1, 40, "soil", "ground_plot"));
// Boundary: real hedges/fences where the photos have them, invisible walls elsewhere, to 5 m.
solids.push(S(-35, 0, -12, 70, 5, 0.3, "foliage", "hedge_south", true));
// ... buildings, cover, openings ...

const spawns: SpawnPoint[] = [
  // team 0: the FIRST one is the duel start
  { x: -20, y: 0, z: 30, yaw: Math.PI, team: 0 },
  // ... ≥ 6 per team ...
];

export const MAP: MapDef = {
  id: "dolna", name: "DOLNA",
  solids, props: [], lights: [], spawns,
  arenaSpawns: [],
  stations: [{ x: -30, y: 0, z: 30, name: "HALA" }, { x: 0, y: 0, z: 5, name: "BRAMA" }, { x: 30, y: 0, z: -6, name: "BUDOWA" }],
  flags: [{ id: "A", name: "HALA", x: -25, y: 0, z: 30 }, { id: "B", name: "PODJAZD", x: 0, y: 0, z: 8 }, { id: "C", name: "BUDOWA", x: 28, y: 0, z: -8 }],
  sites: [{ id: "A", name: "HALA", x: -25, y: 0, z: 30 }, { id: "B", name: "BUDOWA", x: 28, y: 0, z: -8 }],
  huntSpawnMinM: 10,
  killY: -8,
  bounds: boxFrom(-36, -2, -13, 72, 20, 54),
};
/** Key places, timed from BOTH starts; a leading "*" marks a CONTESTED place (must be within 250 ms). */
export const PLACES = { "*gate": { x: 5, y: 0, z: 1 }, "*garage": { x: 0, y: 0, z: 10 } };
/** Exits counted within 15 / 30 m of each start (defaults to PLACES). */
export const EXITS = PLACES;
export const GROUND = /^ground_/;
export const BOUNDARY = /^(hedge_|fence_edge|wall_edge|roof_)/;
