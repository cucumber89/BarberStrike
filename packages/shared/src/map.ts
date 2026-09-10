import { BOMB_SITES, type BombSite } from "./bomb";
import { type Box, boxFrom, CollisionWorld } from "./collision";
import { expandDistrict } from "./districtExpansion";
import { GORA } from "./gora";
import type { Team } from "./types";

/**
 * Map definition shared by server and client.
 * - `solids` are collision boxes (also rendered by the client with the given material tag, or
 *   dressed as a recognisable object when they carry a `look`).
 * - `props` are visual-only (no collision) hints for the client; the server ignores them.
 * - `spawns` are per-team spawn points.
 *
 * Coordinate system: +X east, +Y up, +Z north. Yaw 0 looks along +Z.
 */

export type MaterialTag =
  | "wall_sand" | "wall_teal"
  | "floor_tile" | "floor_concrete" | "floor_wood" | "floor_asphalt" | "floor_metal"
  | "wall_plaster" | "wall_brick" | "wall_tile" | "wall_concrete" | "wall_panel" | "ceiling"
  | "counter" | "wood" | "metal" | "paint" | "glass" | "mirror" | "leather" | "brass" | "rubber" | "none"
  // 1.0 beta: colour and object materials, so cover reads as objects instead of grey boxes.
  | "paint_red" | "paint_blue" | "paint_green" | "paint_white" | "paint_yellow" | "paint_orange"
  | "corrugated_red" | "corrugated_blue" | "corrugated_green" | "glass_dark" | "glass_car" | "fence" | "concrete_block" | "soil" | "foliage";

/**
 * How the client dresses a solid. The collision box is always the `box`; the look only adds
 * visual detail inside/around it (wheels, windows, lids, ribs, doors).
 */
export type SolidLook =
  | "van" | "car" | "truck" | "container" | "dumpster" | "crate" | "lockers" | "drums" | "planter"
  | "cabinet" | "bin" | "pallets" | "machine" | "skip" | "shelter_roof" | "portacabin" | "kiosk_counter";

export interface Solid {
  box: Box;
  mat: MaterialTag;
  /** Optional name, useful for debugging / props anchoring. */
  name?: string;
  /** Hide the mesh (collision only), e.g. invisible walls at map bounds. */
  invisible?: boolean;
  /** Dressed object (see SolidLook). Facing (+Z in local space) is given by `yaw`. */
  look?: SolidLook;
  yaw?: number;
}

export type PropKind =
  | "barber_chair" | "mirror" | "shelf" | "sign" | "lamp" | "trash" | "crate" | "dumpster" | "pole" | "sink"
  | "counter_top" | "neon" | "graffiti" | "vent" | "poster" | "bottle_row" | "towel_stack" | "board"
  | "clippers" | "terminal" | "receipt" | "sticker" | "tube_light" | "cable" | "pendant" | "wheel" | "ac_unit" | "pipe" | "barber_pole";

export interface PropHint {
  kind: PropKind;
  x: number; y: number; z: number;
  yaw?: number;
  scale?: number;
  text?: string;
  /** Optional fixture emission, shared with its practical light. */
  color?: string;
  /** Kind-specific variant (e.g. lamp: "post" | "wall"; poster: 0..n). */
  variant?: string;
  /** Optional size hints (metres) for kinds that stretch (tube_light length, cable length, sign width). */
  w?: number; h?: number;
}

export interface LightHint {
  kind: "point" | "spot";
  x: number; y: number; z: number;
  color: string;
  intensity: number;
  range: number;
  /** For spot lights: direction. */
  dx?: number; dy?: number; dz?: number;
  angle?: number;
  shadows?: boolean;
  /** Higher = preferred when a mesh is affected by more lights than the material allows. */
  priority?: number;
}

/** Amber = public frontage; mercury = work/service routes; rose = destination signs only. */
export const DISTRICT_LIGHTS = { amber: "#ffbf70", mercury: "#9adce5", accent: "#fa709a" } as const;

export interface SpawnPoint { x: number; y: number; z: number; yaw: number; team: Team }

/** Buy station: standing within ECONOMY.stationRadius opens the shop at any time. */
export interface Station { x: number; y: number; z: number; name: string }

/** Domination flag (drop 4): a capture zone of DOM.radius around the pole. */
export interface Flag { id: string; name: string; x: number; y: number; z: number }

export interface MapDef {
  id: string;
  name: string;
  solids: Solid[];
  props: PropHint[];
  lights: LightHint[];
  spawns: SpawnPoint[];
  arenaSpawns?: SpawnPoint[];
  stations: Station[];
  flags: Flag[];
  /**
   * Bomb Plant sites. Optional so NIGHT_DISTRICT keeps the pair that used to be a module constant
   * (`bomb.ts`, `BOMB_SITES`); `sitesOf(map)` is what every reader should call.
   */
  sites?: readonly BombSite[];
  /**
   * Ostrzyżeni: how far a returning chaser has to be from the nearest living survivor. It is a
   * property of the map's size, not of the mode — 14 m on a 121 m diagonal is a different rule
   * from 14 m on a 39 m one — so a small map may lower it. Defaults to `OSTRZYZENI.huntSpawnMinM`.
   */
  huntSpawnMinM?: number;
  /** Kill plane: falling below this respawns the player. */
  killY: number;
  bounds: Box;
}

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name?: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
/** Dressed object: collision box + look (+ yaw of its local +Z). */
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

/**
 * FRANKIBARBER — NIGHT DISTRICT (2.0, "1.0 beta")
 *
 * 62 × 68 m block. The 0.1 beta core (shop / neighbour unit / back hall / storage / alley) keeps its
 * coordinates — the movement tests and stairs live there — and the district grows around it:
 *
 *        z=45 ┌──────────────────────────────────────────────────────────────┐
 *             │  NORTH COMPOUND: portacabins, skip, fence line — team 1 spawns │
 *        z=36 │ - - - - - - - - - - chain-link fence (gaps) - - - - - - - - - │
 *             │  LOADING YARD: containers (climbable stack), box truck, dock  │
 *        z=28 ├──────────┬──────────┬───────────────┬───────────────┬────────┤
 *             │ BACKLOT  │ ALLEY    │  BACK HALL    │ STORAGE + MEZZ│ CAR    │ east
 *        z=18 │ kiosk    │ zigzag   ├───────────────┼───────────────┤ WASH   │ lane
 *             │ garages  │          │ BARBER SHOP   │ NEIGHBOUR UNIT│ gantry │ (x 32..35)
 *        z=0  ├──────────┴──────────┴───────────────┴───────────────┤ CAR PARK (canopy)
 *             │  MAIN STREET: two lanes, median planters, bus shelter, parked vehicles          │
 *       z=-22 └──────────────────────────────────────────────────────────────┘ ← team 0 spawns
 *            x=-27      x=-14      x=-4           x=8            x=20    x=35
 *
 * Lanes (TDM): WEST (street → backlot → kiosk → yard), CENTRE (shop → hall → yard), EAST
 * (car park → car wash → yard). Vertical: storage stairs → mezzanine → catwalk (west) or gantry
 * over the car park (east) → stairs down to the yard; container stack in the yard.
 */
export const NIGHT_DISTRICT: MapDef = (() => {
  const solids: Solid[] = [];
  const props: PropHint[] = [];
  const lights: LightHint[] = [];
  const spawns: SpawnPoint[] = [];

  const W = 0.3;   // wall thickness
  const H = 3.6;   // shop / back hall ceiling height
  const HX = 6.0;  // industrial (neighbour/storage) ceiling height
  const HP = 7.0;  // perimeter (facades of the surrounding block)
  const MEZ = 3.0; // mezzanine walking surface height
  const X0 = -27, X1 = 35, Z0 = -22, Z1 = 45; // playable extents

  // ---------- Ground ----------
  solids.push(S(X0, -1, Z0, X1 - X0, 1, 22, "floor_asphalt", "street"));
  solids.push(S(X0, -1, 0, 13, 1, 28, "floor_concrete", "backlot"));
  solids.push(S(-14, -1, 0, 10, 1, 18, "floor_concrete", "alley"));
  solids.push(S(-4, -1, 0, 12, 1, 10, "floor_tile", "shop_floor"));
  solids.push(S(8, -1, 0, 12, 1, 10, "floor_concrete", "neighbour"));
  solids.push(S(-4, -1, 10, 12, 1, 8, "floor_wood", "backhall"));
  solids.push(S(8, -1, 10, 12, 1, 8, "floor_metal", "storage"));
  solids.push(S(20, -1, 0, X1 - 20, 1, 18, "floor_asphalt", "east_block"));
  solids.push(S(-14, -1, 18, X1 + 14, 1, Z1 - 18, "floor_concrete", "yard"));
  solids.push(S(X0, -1, 28, 13, 1, Z1 - 28, "floor_concrete", "yard_west"));

  // ---------- Perimeter: facades of the surrounding block ----------
  solids.push(S(X0 - W, 0, Z0 - W, X1 - X0 + 2 * W, HP, W, "wall_brick", "south_facade"));
  solids.push(S(X0 - W, 0, Z1, X1 - X0 + 2 * W, HP, W, "wall_concrete", "north_facade"));
  solids.push(S(X0 - W, 0, Z0, W, HP, Z1 - Z0, "wall_brick", "west_facade"));
  solids.push(S(X1, 0, Z0, W, HP, Z1 - Z0, "wall_brick", "east_facade"));

  // ---------- Core block ceilings + parapets (unchanged from 0.1) ----------
  solids.push(S(-4, H, 0, 12, 0.3, 10, "ceiling", "shop_ceiling"));
  solids.push(S(-4, H, 10, 12, 0.3, 8, "ceiling", "hall_ceiling"));
  solids.push(S(8, HX, 0, 12, 0.3, 18, "ceiling", "industrial_ceiling"));
  solids.push(S(-4 - W, H, -W, 12 + W, 1.2, W, "wall_plaster", "shop_parapet_s"));
  solids.push(S(-4 - W, H, 18, 12 + W, 1.2, W, "wall_plaster", "hall_parapet_n"));
  solids.push(S(-4 - W, H, 0, W, 1.2, 18, "wall_plaster", "shop_parapet_w"));
  solids.push(S(8 - W / 2, H, 0, W, HX - H, 18, "wall_concrete", "party_wall_upper"));

  // ---------- Barber shop (x -4..8, z 0..10) ----------
  solids.push(S(-4, 0, 0, 4, H, W, "wall_plaster", "shop_front_w"));
  solids.push(S(2, 0, 0, 1, H, W, "wall_plaster", "shop_front_mid"));
  solids.push(S(3, 1.0, 0.1, 4, 1.8, 0.1, "glass", "shop_window"));
  solids.push(S(3, 0, 0, 4, 1.0, W, "wall_panel", "shop_window_sill"));
  solids.push(S(3, 2.8, 0, 4, H - 2.8, W, "wall_plaster", "shop_window_top"));
  solids.push(S(7, 0, 0, 1, H, W, "wall_plaster", "shop_front_e"));
  solids.push(S(0, 2.4, 0, 2, H - 2.4, W, "wall_plaster", "shop_door_top"));
  solids.push(S(-4 - W, 0, 0, W, H, 6, "wall_plaster", "shop_west_a"));
  solids.push(S(-4 - W, 0, 8, W, H, 2, "wall_plaster", "shop_west_b"));
  solids.push(S(-4 - W, 2.4, 6, W, H - 2.4, 2, "wall_plaster", "shop_west_door_top"));
  solids.push(S(8 - W / 2, 0, 0, W, H, 7, "wall_tile", "shop_east_a"));
  solids.push(S(8 - W / 2, 0, 9, W, H, 1, "wall_tile", "shop_east_b"));
  solids.push(S(8 - W / 2, 2.4, 7, W, H - 2.4, 2, "wall_tile", "shop_east_door_top"));
  solids.push(S(-4, 0, 10 - W / 2, 8, H, W, "wall_tile", "shop_north_a"));
  solids.push(S(6, 0, 10 - W / 2, 2, H, W, "wall_tile", "shop_north_b"));
  solids.push(S(4, 2.4, 10 - W / 2, 2, H - 2.4, W, "wall_tile", "shop_north_door_top"));
  const stationsZ = [0.8, 2.6, 4.4];
  for (let i = 0; i < 3; i++) {
    solids.push(S(-3.4, 0, stationsZ[i], 0.9, 0.9, 1.2, "wood", `station_${i + 1}`));
    solids.push(S(-2.2, 0, stationsZ[i] + 0.25, 0.7, 0.55, 0.7, "leather", `chair_${i + 1}`));
  }
  solids.push(S(4.4, 0, 1.3, 2.7, 1.05, 0.9, "counter", "reception_counter"));
  solids.push(S(0.6, 0, 4.4, 1.6, 1.0, 1.0, "counter", "display_island"));
  solids.push(S(5.4, 0, 5.6, 2.3, 1.1, 0.5, "wood", "product_shelf"));
  solids.push(S(0.4, 0, 8.6, 2.6, 0.5, 0.6, "leather", "bench"));

  // ---------- Neighbour unit (x 8..20, z 0..10) ----------
  solids.push(S(8, 0, 10 - W / 2, 3, MEZ - 0.25, W, "wall_concrete", "nb_north_under_catwalk"));
  solids.push(S(8, 5.4, 10 - W / 2, 3, HX - 5.4, W, "wall_concrete", "nb_north_over_catwalk"));
  solids.push(S(11, 0, 10 - W / 2, 2, HX, W, "wall_concrete", "nb_north_a"));
  solids.push(S(13, 2.4, 10 - W / 2, 2, HX - 2.4, W, "wall_concrete", "nb_north_door_top"));
  solids.push(S(15, 0, 10 - W / 2, 5, HX, W, "wall_concrete", "nb_north_b"));
  solids.push(S(8, 0, 0, 1, HX, W, "wall_concrete", "nb_south_a"));
  solids.push(S(9, 0, 0, 6, 3.2, W, "corrugated_blue", "roller_door"));
  solids.push(S(9, 3.2, 0, 6, HX - 3.2, W, "wall_concrete", "nb_south_over_roller"));
  solids.push(S(15, 0, 0, 2, HX, W, "wall_concrete", "nb_south_b"));
  solids.push(S(17, 2.4, 0, 2, HX - 2.4, W, "wall_concrete", "nb_south_door_top"));
  solids.push(S(19, 0, 0, 1, HX, W, "wall_concrete", "nb_south_c"));
  // East wall to the car park: door at z 4..6.
  solids.push(S(20, 0, 0, W, HX, 4, "wall_concrete", "nb_east_a"));
  solids.push(S(20, 0, 6, W, HX, 4, "wall_concrete", "nb_east_b"));
  solids.push(S(20, 2.4, 4, W, HX - 2.4, 2, "wall_concrete", "nb_east_door_top"));
  for (let i = 0; i < 9; i++) {
    const h = 2.7 - 0.3 * i;
    solids.push(S(8, 0, 7 - 0.6 * (i + 1), 1.6, h, 0.6, "metal", `nb_stair_${i}`));
  }
  solids.push(S(8, MEZ - 0.25, 7, 3, 0.25, 5.6, "floor_metal", "catwalk"));
  solids.push(S(10.9, MEZ, 7, 0.1, 1.0, 3, "metal", "catwalk_rail_e"));
  solids.push(S(9.6, MEZ, 7, 1.4, 1.0, 0.1, "metal", "catwalk_rail_s"));
  solids.push(O(11.5, 0, 2.5, 1.4, 1.2, 1.4, "wood", "pallets", "pallets_1"));
  solids.push(O(15.5, 0, 6.5, 1.8, 1.6, 1.2, "paint_green", "machine", "machine"));
  solids.push(S(12, 0, 7.5, 2.4, 0.95, 1.0, "metal", "workbench"));
  solids.push(O(17.5, 0, 3.5, 1.2, 2.2, 1.2, "paint_blue", "lockers", "lockers", -Math.PI / 2));
  solids.push(O(14.2, 0, 3.6, 1.2, 0.9, 1.2, "paint_yellow", "drums", "drums"));

  // ---------- Back hall (x -4..8, z 10..18) ----------
  solids.push(S(-4 - W, 0, 10, W, H, 4, "wall_plaster", "bh_west_a"), S(-4 - W, 0, 16, W, H, 2, "wall_plaster", "bh_west_b"), S(-4 - W, 2.4, 14, W, H - 2.4, 2, "wall_plaster", "bh_west_door_top"));
  solids.push(S(8 - W / 2, 0, 10, W, H, 3, "wall_plaster", "bh_east_a"), S(8 - W / 2, 0, 15, W, H, 3, "wall_plaster", "bh_east_b"), S(8 - W / 2, 2.4, 13, W, H - 2.4, 2, "wall_plaster", "bh_east_door_top"));
  solids.push(S(-4, 0, 18 - W / 2, 3, H, W, "wall_plaster", "bh_north_a"), S(1, 0, 18 - W / 2, 7, H, W, "wall_plaster", "bh_north_b"), S(-1, 2.4, 18 - W / 2, 2, H - 2.4, W, "wall_plaster", "bh_north_door_top"));
  solids.push(S(1.5, 0, 12.5, W, H, 3.5, "wall_tile", "bh_divider"));
  solids.push(S(1.5, 0, 12.5, 2.0, H, W, "wall_tile", "bh_divider_l"));
  solids.push(S(4.5, 0, 16.5, 2.0, 0.95, 0.7, "counter", "wash_station"));
  solids.push(O(-3.2, 0, 11, 1.2, 1.9, 0.6, "paint_white", "cabinet", "towel_cabinet", Math.PI / 2));
  solids.push(O(5.5, 0, 11, 1.2, 1.0, 0.8, "paint_white", "bin", "laundry_cart"));

  // ---------- Storage + stairs to mezzanine (x 8..20, z 10..18) ----------
  solids.push(S(8, 0, 18 - W / 2, 4, HX, W, "wall_concrete", "st_north_a"), S(14, 0, 18 - W / 2, 6, HX, W, "wall_concrete", "st_north_b"), S(12, 2.4, 18 - W / 2, 2, HX - 2.4, W, "wall_concrete", "st_north_door_top"));
  // East wall: solid below the mezzanine, opening onto the east gantry at z 10.6..12.6, y 3..5.4.
  solids.push(S(20, 0, 10, W, MEZ, 8, "wall_concrete", "st_east_low"));
  solids.push(S(20, MEZ, 10, W, HX - MEZ, 0.6, "wall_concrete", "st_east_up_a"));
  solids.push(S(20, MEZ, 12.6, W, HX - MEZ, 5.4, "wall_concrete", "st_east_up_b"));
  solids.push(S(20, 5.4, 10.6, W, HX - 5.4, 2.0, "wall_concrete", "st_east_gantry_top"));
  for (let i = 0; i < 10; i++) {
    solids.push(S(17.6, 0, 17 - i * 0.6 - 0.6, 2.4, 0.3 * (i + 1), 0.6, "metal", `stair_${i}`));
  }
  solids.push(S(17.6, 0, 10, 2.4, MEZ, 1.0, "metal", "stair_landing"));
  solids.push(S(11, MEZ - 0.25, 10, 6.6, 0.25, 2.6, "floor_metal", "mezzanine"));
  // The landing slab starts where the flight ENDS (z 11.6), and stops at the wall's inner face
  // (x 20). It used to start at z 11 — laid straight over tread 9, whose top is also MEZ — and to
  // run 0.3 m INTO the st_east_low wall, whose top is also MEZ: 1.44 m² and 0.48 m² of surfaces the
  // depth buffer cannot order. Walkable cover at y = MEZ is unbroken either way: stair_landing
  // (z 10..11) → tread 9 (z 11..11.6) → this slab (z 11.6..12.6).
  solids.push(S(17.6, MEZ - 0.25, 11.6, 2.4, 0.25, 1.0, "floor_metal", "mezzanine_east"));
  solids.push(S(9.4, MEZ, 12.5, 10.6, 1.0, 0.1, "metal", "mezzanine_rail"));
  solids.push(S(9.4, MEZ, 10, 0.1, 1.0, 2.6, "metal", "mezzanine_rail_w"));
  solids.push(O(10, 0, 14, 1.2, 1.2, 1.2, "wood", "crate", "crate_a"));
  solids.push(O(11.2, 0, 14, 1.2, 0.6, 1.2, "wood", "crate", "crate_b"));
  solids.push(S(13.5, 0, 12, 2.0, 1.0, 0.8, "metal", "shelving_unit"));
  solids.push(S(15, 0, 15, 1.5, 2.2, 1.0, "metal", "rack"));

  // ---------- Alley (x -14..-4, z 0..18) — zigzag lane, now open to the backlot on the west ----------
  solids.push(S(-14, 0, 4, 6.5, 4.2, 4, "wall_brick", "alley_annex"));
  solids.push(S(-9.5, 0, 10, 5.5, 2.6, 3.5, "corrugated_green", "alley_leanto"));
  solids.push(O(-13.5, 0, 8.6, 1.4, 1.4, 1.0, "paint_green", "dumpster", "dumpster_alley", Math.PI));
  solids.push(O(-6, 0, 1.6, 0.9, 1.1, 0.9, "paint", "bin", "bin_1"));
  solids.push(O(-12.5, 0, 15.5, 1.4, 0.7, 1.0, "wood", "pallets", "pallets_alley"));
  solids.push(O(-5.2, 0, 15.2, 1.0, 1.0, 1.0, "paint", "bin", "bin_2"));
  // Low wall between alley and backlot (waist-high, with a gap at z 14..16) keeps the zigzag readable.
  solids.push(S(-14 - W, 0, 0, W, 1.1, 4, "concrete_block", "alley_wall_s"));
  solids.push(S(-14 - W, 0, 8, W, 1.1, 6, "concrete_block", "alley_wall_m"));
  solids.push(S(-14 - W, 0, 16, W, 1.1, 2, "concrete_block", "alley_wall_n"));

  // ---------- Backlot (x -27..-14, z 0..28): garage row, kiosk ----------
  // The centre garage is an open repair bay: a second, sheltered west-lane route.
  solids.push(S(X0, 0, 4, 5, 3.5, 6, "wall_brick", "garage_west"));
  solids.push(S(-18, 0, 4, 4, 3.5, 6, "wall_brick", "garage_east"));
  solids.push(S(-22, 2.8, 4, 4, 0.7, W, "wall_brick", "garage_open_header"));
  solids.push(S(-22, 0, 9.7, 1.8, 3.5, W, "wall_brick", "garage_rear_cover"));
  solids.push(S(-20.2, 2.5, 9.7, 2.2, 1, W, "wall_brick", "garage_rear_header"));
  solids.push(S(-21.7, 0, 6, 0.65, 1, 2, "metal", "garage_toolbench"));
  solids.push(S(X0, 3.5, 3.6, 13, 0.3, 6.8, "corrugated_green", "garage_roof"));
  for (const i of [0, 2]) solids.push(S(X0 + 1 + i * 4.2, 0, 3.7, 3.2, 2.6, 0.3, "corrugated_blue", `garage_door_${i}`));
  props.push({ kind: "sign", x: -20, y: 3.1, z: 3.98, yaw: Math.PI, text: "SERWIS / GARAŻE", w: 3.5, h: 0.36 });
  props.push({ kind: "tube_light", x: -20, y: 3.42, z: 7, w: 1.8 });
  props.push({ kind: "crate", x: -21.38, y: 1, z: 6.5, variant: "small" });
  lights.push({ kind: "point", x: -20, y: 2.9, z: 7, color: DISTRICT_LIGHTS.mercury, intensity: 1.1, range: 7 });
  // Kiosk: small room, doors offset (south x -23..-21, north x -26..-24).
  solids.push(S(-26, 0, 14, 3, 3.0, W, "wall_plaster", "kiosk_s_a"), S(-21, 0, 14, 1, 3.0, W, "wall_plaster", "kiosk_s_b"), S(-23, 2.3, 14, 2, 0.7, W, "wall_plaster", "kiosk_s_top"));
  solids.push(S(-24, 0, 18, 4, 3.0, W, "wall_plaster", "kiosk_n_a"), S(-26, 2.3, 18, 2, 0.7, W, "wall_plaster", "kiosk_n_top"));
  solids.push(S(-26 - W, 0, 14, W, 3.0, 4.3, "wall_plaster", "kiosk_w"));
  solids.push(S(-20, 0, 14, W, 1.0, 4.3, "wall_panel", "kiosk_e_sill"), S(-20, 1.0, 14, 0.1, 1.2, 4.3, "glass", "kiosk_window"), S(-20, 2.2, 14, W, 0.8, 4.3, "wall_plaster", "kiosk_e_top"));
  solids.push(S(-26, 3.0, 13.7, 6.3, 0.3, 4.9, "ceiling", "kiosk_roof"));
  solids.push(O(-22.5, 0, 15.6, 2.0, 1.0, 0.8, "counter", "kiosk_counter", "kiosk_counter"));
  solids.push(O(-19, 0, 24, 1.6, 1.3, 1.2, "paint_blue", "dumpster", "dumpster_backlot", Math.PI / 2));
  solids.push(O(-25, 0, 22, 1.2, 1.2, 1.2, "wood", "crate", "crate_backlot"));
  solids.push(O(-17, 0, 1.2, 1.4, 0.8, 1.2, "wood", "pallets", "pallets_backlot"));
  solids.push(O(-24, 0, 0.6, 1.0, 1.0, 1.0, "paint", "bin", "bin_backlot"));
  solids.push(O(-16, 0, 11.5, 1.2, 1.9, 1.0, "paint_green", "cabinet", "backlot_cabinet"));

  // ---------- East block (x 20..35, z 0..18): car park under a canopy, gantry, car wash, booth ----------
  solids.push(S(22, 3.2, 0, 12, 0.2, 8, "metal", "canopy"));
  for (const [cx, cz] of [[22, 0.2], [22, 7.5], [28, 0.2], [28, 7.5], [33.7, 0.2], [33.7, 7.5]]) solids.push(S(cx, 0, cz, 0.3, 3.2, 0.3, "metal", `canopy_col_${cx}_${cz}`));
  solids.push(O(23, 0, 2, 4.2, 1.45, 1.8, "paint_white", "car", "car_park_a", Math.PI / 2));
  solids.push(O(29, 0, 2, 4.2, 1.45, 1.8, "paint_red", "car", "car_park_b", -Math.PI / 2));
  solids.push(O(25.5, 0, 5.2, 4.2, 1.45, 1.8, "paint_blue", "car", "car_park_c", Math.PI / 2));
  solids.push(O(20.3, 0, 12, 2.0, 2.6, 2.0, "paint_white", "portacabin", "booth"));
  // Gantry from the storage mezzanine over the car park to a staircase down into the yard.
  solids.push(S(20.3, MEZ - 0.25, 10.6, 9.7, 0.25, 2.0, "floor_metal", "gantry"));
  solids.push(S(20.3, MEZ, 10.6, 9.7, 1.0, 0.1, "metal", "gantry_rail_s"));
  solids.push(S(20.3, MEZ, 12.5, 9.5, 1.0, 0.1, "metal", "gantry_rail_n"));
  solids.push(S(30, MEZ - 0.25, 10.6, 2.4, 0.25, 2.0, "floor_metal", "gantry_landing"));
  for (let j = 0; j < 9; j++) solids.push(S(30, 0, 12.6 + 0.6 * j, 2.4, 2.7 - 0.3 * j, 0.6, "metal", `east_stair_${j}`));
  solids.push(S(32.4, MEZ, 10.6, 0.1, 1.0, 2.0, "metal", "gantry_rail_e"));
  // Car wash hall: doors south x 23..25 and north x 29..31 (offset breaks the straight line).
  const CW = 4.5;
  solids.push(S(22, 0, 14, 1, CW, W, "wall_concrete", "cw_s_a"), S(25, 0, 14, 7.3, CW, W, "wall_concrete", "cw_s_b"), S(23, 2.4, 14, 2, CW - 2.4, W, "wall_concrete", "cw_s_top"));
  solids.push(S(22, 0, 24, 7, CW, W, "wall_concrete", "cw_n_a"), S(31, 0, 24, 1.3, CW, W, "wall_concrete", "cw_n_b"), S(29, 2.4, 24, 2, CW - 2.4, W, "wall_concrete", "cw_n_top"));
  solids.push(S(22, 0, 14, W, CW, 10.3, "wall_concrete", "cw_w"));
  solids.push(S(32, 0, 14, W, CW, 4, "wall_concrete", "cw_e_a"), S(32, 0, 20, W, CW, 4.3, "wall_concrete", "cw_e_b"), S(32, 2.4, 18, W, CW - 2.4, 2, "wall_concrete", "cw_e_top"));
  solids.push(S(22, CW, 14, 10.3, 0.3, 10.3, "ceiling", "cw_roof"));
  solids.push(O(25, 0, 17.6, 4.2, 1.45, 1.8, "paint_yellow", "car", "cw_car", Math.PI / 2));
  solids.push(O(29.6, 0, 15, 1.8, 1.8, 1.2, "paint_blue", "machine", "cw_machine_a"));
  solids.push(O(22.4, 0, 21, 1.2, 0.9, 1.2, "paint_yellow", "drums", "cw_drums"));
  solids.push(S(23, 0, 14.4, 0.15, 2.0, 9.4, "metal", "cw_rail_w")); // guide rail (thin, waist-blocking? no — 2 m tall pillar strip)
  // East lane (x 32..35): shed + dumpster so the lane is not one straight sightline.
  solids.push(S(32.3, 0, 26, X1 - 32.3, 3.0, 4, "wall_brick", "east_shed"));
  solids.push(S(32.3, 3.0, 25.8, X1 - 32.3, 0.25, 4.4, "corrugated_red", "east_shed_roof"));
  solids.push(O(33, 0, 8.5, 1.6, 1.3, 1.2, "paint_green", "dumpster", "dumpster_lane", Math.PI));

  // ---------- Main street (z -22..0) ----------
  solids.push(S(X0, 0, -1.5, X1 - X0, 0.15, 1.5, "floor_concrete", "sidewalk_n"));
  solids.push(S(X0, 0, Z0, X1 - X0, 0.15, 2, "floor_concrete", "sidewalk_s"));
  for (const px of [-20, -10, 0, 10, 20]) solids.push(O(px, 0, -11, 4, 0.55, 1.5, "wall_concrete", "planter", `median_${px}`));
  solids.push(O(-18, 0, -15, 4.2, 1.45, 1.8, "paint_red", "car", "car_street_w", Math.PI / 2));
  solids.push(O(2, 0, -16, 5.2, 2.3, 2.3, "paint_white", "van", "van", Math.PI / 2));
  solids.push(O(20, 0, -14, 4.2, 1.45, 1.8, "paint_blue", "car", "car_street_e", -Math.PI / 2));
  solids.push(O(28, 0, -18, 6.5, 2.6, 2.6, "paint_orange", "truck", "truck", Math.PI / 2));
  solids.push(O(10, 0, -5.5, 5.2, 2.3, 2.2, "paint_green", "van", "van_n", Math.PI / 2));
  solids.push(O(-8, 0, -6.6, 4.2, 1.45, 1.8, "paint_white", "car", "car_n", Math.PI / 2));
  // Bus shelter on the south pavement (team 0 spawns behind it).
  solids.push(O(-7, 2.3, -20.6, 5.5, 0.15, 2.0, "metal", "shelter_roof", "shelter_roof"));
  solids.push(S(-7, 0.3, -20.6, 5.5, 2.0, 0.08, "glass", "shelter_back"));
  for (const px of [-7, -1.6]) solids.push(S(px, 0, -20.6, 0.1, 2.3, 0.1, "metal", `shelter_post_${px}`));
  solids.push(S(-6.5, 0, -20.4, 4.5, 0.45, 0.4, "wood", "shelter_bench"));
  for (const [lx, lz] of [[-9, -4.5], [4, -6], [18, -4.5], [-14, -19.5], [12, -19.5], [30, -4.5]]) solids.push(S(lx - 0.1, 0, lz - 0.1, 0.2, 3.6, 0.2, "metal", `lamp_post_${lx}_${lz}`));
  solids.push(O(-2, 0, -5, 1.0, 1.0, 1.0, "paint_green", "cabinet", "utility_box"));
  solids.push(S(15.5, 0, -2, 0.6, 0.9, 1.8, "wall_concrete", "bollards"));
  solids.push(O(17.2, 0, -7.4, 1.2, 1.2, 1.0, "paint", "bin", "street_bin"));
  solids.push(O(-24, 0, -19, 1.0, 1.0, 1.0, "paint", "bin", "bin_sw"));
  solids.push(O(-23, 0, -13.5, 1.8, 1.9, 1.0, "paint_green", "cabinet", "phone_box"));
  solids.push(O(32.5, 0, -12, 1.4, 1.6, 1.2, "paint_blue", "cabinet", "kiosk_box"));

  // Night market: two recognisable islands of cover with open sides for flanking.
  // Counters stop bullets; the canopy is high enough to run beneath it.
  for (const [x, color, title] of [[-19, "paint_red", "NOCNY BAR"], [23, "paint_blue", "PŁYTY / NOCĄ"]] as const) {
    solids.push(O(x, 0, -5.8, 3.6, 1.05, 0.8, color, "kiosk_counter", `market_counter_${x}`));
    solids.push(S(x - 0.15, 2.85, -7.2, 3.9, 0.16, 2.8, color, `market_canopy_${x}`));
    for (const px of [x, x + 3.4]) solids.push(S(px, 0, -7, 0.12, 2.85, 0.12, "metal", `market_post_${px}`));
    props.push({ kind: "sign", x: x + 1.8, y: 2.68, z: -7.22, yaw: Math.PI, text: title, w: 3.4, h: 0.35 });
    props.push({ kind: "tube_light", x: x + 1.8, y: 2.72, z: -5.8, w: 2.8 });
    lights.push({ kind: "point", x: x + 1.8, y: 2.5, z: -6.2, color: x < 0 ? "#ffc18a" : "#83d9ed", intensity: 9, range: 6, priority: 4 });
  }
  // Staggered waist-high roadworks break the exposed diagonal between the two stalls.
  solids.push(O(-13, 0, -8, 2.8, 1.05, 0.7, "paint_yellow", "crate", "market_barrier_w"));
  solids.push(O(18, 0, -9, 2.8, 1.05, 0.7, "paint_yellow", "crate", "market_barrier_e"));

  // ---------- Loading yard (z 18..36) ----------
  solids.push(S(14, 0, 18, 6, 1.0, 10, "floor_concrete", "loading_dock"));
  solids.push(S(11, 0, 24, 3, 1.0, 4, "floor_concrete", "dock_ramp_base"));
  // Four steps, not five: the fifth was 1.0 - 0.2 * 5 = ZERO high, so its top face sat exactly on
  // the yard slab (2.4 m² of z-fighting) while adding nothing to walk on. The 0.2 m bottom step
  // down to the yard is the same rise as every other step.
  for (let i = 0; i < 4; i++) solids.push(S(11 - 0.6 * (i + 1), 0, 24, 0.6, 1.0 - 0.2 * (i + 1), 4, "floor_concrete", `dock_step_${i}`));
  solids.push(O(0, 0, 22, 2.4, 2.5, 6, "corrugated_red", "container", "container"));
  solids.push(O(2.4, 0, 22, 2.4, 2.5, 6, "corrugated_blue", "container", "container_b"));
  solids.push(O(1.2, 2.5, 22.4, 2.4, 2.5, 6, "corrugated_green", "container", "container_top"));
  // Climb to the container roof: crate 0.6 → crate 1.2 → pallets 1.8 → container top 2.5.
  solids.push(O(4.8, 0, 27, 1.2, 0.6, 1.2, "wood", "crate", "climb_a"));
  solids.push(O(4.8, 0, 25.8, 1.2, 1.2, 1.2, "wood", "crate", "climb_b"));
  solids.push(O(4.8, 0, 24.6, 1.2, 1.8, 1.2, "wood", "pallets", "climb_c"));
  solids.push(S(0, 2.5, 22, 4.8, 0.05, 0.4, "metal", "container_lip"));

  // Second way onto the container roof: a stair-fed lookout with a narrow linking bridge.
  // The stairs work with the same collision/navigation data used by bots and human players.
  solids.push(S(-5, 2.3, 28, 5, 0.2, 3, "floor_metal", "yard_lookout"));
  solids.push(S(0, 2.3, 28, 1.2, 0.2, 1, "floor_metal", "yard_roof_link"));
  for (let i = 0; i < 10; i++) solids.push(S(-9 + i * 0.4, 0, 29, 0.4, (i + 1) * 0.25, 2, "floor_concrete", `lookout_step_${i}`));
  for (const px of [-4.8, -0.25]) for (const pz of [28.15, 30.7]) solids.push(S(px, 0, pz, 0.15, 2.3, 0.15, "metal", `lookout_support_${px}_${pz}`));
  solids.push(S(-5, 2.5, 30.9, 5, 0.85, 0.1, "paint_yellow", "lookout_rail_n"));
  solids.push(S(-5, 2.5, 28, 4, 0.85, 0.1, "paint_yellow", "lookout_rail_s"));
  props.push({ kind: "sign", x: -2.5, y: 2.06, z: 31.03, text: "TARAS / 02", w: 3.2, h: 0.35 });
  solids.push(O(-9, 0, 20, 1.6, 1.3, 1.2, "paint_blue", "dumpster", "dumpster_yard", Math.PI));
  solids.push(O(-11, 0, 25, 1.2, 1.2, 1.2, "wood", "crate", "crate_yard_a"));
  solids.push(O(-9.8, 0, 25, 1.2, 0.6, 1.2, "wood", "crate", "crate_yard_b"));
  solids.push(O(5, 0, 26, 3.0, 1.0, 1.0, "wall_concrete", "planter", "planter"));
  solids.push(S(-5, 0, 21, 0.3, 1.3, 3, "wall_concrete", "yard_lowwall"));
  solids.push(O(-3.2, 0, 20.2, 2.0, 1.9, 1.0, "paint_green", "cabinet", "yard_cabinet"));
  solids.push(S(-7, 0, 26.5, 0.25, 2.4, 0.25, "metal", "shed_post_a"));
  solids.push(S(-3.5, 0, 26.5, 0.25, 2.4, 0.25, "metal", "shed_post_b"));
  solids.push(S(-7.2, 2.4, 25.5, 4.2, 0.12, 2.5, "metal", "shed_roof"));
  solids.push(O(8, 0, 30, 3.0, 2.6, 7.0, "paint_white", "truck", "box_truck", 0));
  solids.push(O(22, 0, 30, 1.6, 1.3, 1.2, "paint_green", "dumpster", "dumpster_yard_e", Math.PI));
  solids.push(O(-20, 0, 30, 1.2, 1.2, 1.2, "wood", "crate", "crate_yard_w"));
  solids.push(O(16, 0, 32.5, 1.4, 0.8, 1.2, "wood", "pallets", "pallets_yard"));
  // Low wall between backlot and yard (gap z 22..24) — the west lane's last piece of cover.
  solids.push(S(-14 - W, 0, 18, W, 1.2, 4, "concrete_block", "yard_west_wall_a"));
  solids.push(S(-14 - W, 0, 24, W, 1.2, 4, "concrete_block", "yard_west_wall_b"));

  // ---------- North compound (z 36..45): fence line with gaps, portacabins, skip ----------
  const FZ = 36;
  for (const [fx0, fx1] of [[X0, -20], [-17, -6], [-3, 12], [15, 24], [27, X1]]) solids.push(S(fx0, 0, FZ, fx1 - fx0, 1.2, 0.06, "fence", `fence_${fx0}`));
  for (const fx of [X0, -20, -17, -6, -3, 12, 15, 24, 27]) solids.push(S(fx - 0.05, 0, FZ - 0.05, 0.1, 1.5, 0.16, "metal", `fence_post_${fx}`));
  solids.push(O(-16, 0, 38, 6, 2.8, 4, "paint_white", "portacabin", "cabin_w"));
  solids.push(O(24, 0, 38, 6, 2.8, 4, "paint_blue", "portacabin", "cabin_e"));
  solids.push(O(4, 0, 39.5, 4, 1.4, 2.2, "paint_yellow", "skip", "skip"));
  solids.push(O(-4, 0, 40.5, 1.6, 1.3, 1.2, "paint_green", "dumpster", "dumpster_north", 0));
  solids.push(O(12, 0, 41, 1.2, 1.2, 1.2, "wood", "crate", "crate_north"));
  solids.push(O(31, 0, 40, 1.2, 1.9, 1.0, "paint_green", "cabinet", "north_cabinet"));

  // ---------- Props (visual only) ----------
  for (let i = 0; i < 3; i++) {
    const z = stationsZ[i];
    props.push({ kind: "barber_chair", x: -1.85, y: 0.55, z: z + 0.6, yaw: Math.PI / 2 });
    props.push({ kind: "mirror", x: -3.98, y: 1.75, z: z + 0.6, yaw: Math.PI / 2, w: 0.9, h: 1.5 });
    props.push({ kind: "clippers", x: -2.95, y: 0.9, z: z + 0.4 + (i % 2) * 0.4, yaw: i * 0.7 });
    props.push({ kind: "bottle_row", x: -2.95, y: 0.9, z: z + 0.85, yaw: 0, w: 0.35, variant: "small" });
  }
  props.push({ kind: "shelf", x: -3.86, y: 2.75, z: 3.2, yaw: Math.PI / 2, w: 4.0 });
  props.push({ kind: "bottle_row", x: -3.86, y: 2.75, z: 3.2, yaw: Math.PI / 2, w: 3.6 });
  props.push({ kind: "bottle_row", x: 6.55, y: 1.1, z: 5.85, yaw: 0, w: 2.0 });
  props.push({ kind: "towel_stack", x: 6.9, y: 1.1, z: 5.85 });
  props.push({ kind: "terminal", x: 6.6, y: 1.05, z: 1.75, yaw: Math.PI });
  props.push({ kind: "receipt", x: 5.2, y: 1.05, z: 1.7, yaw: 0.4 });
  props.push({ kind: "counter_top", x: 5.75, y: 1.05, z: 1.75, w: 2.7, h: 0.9 });
  props.push({ kind: "sign", x: 2, y: 4.25, z: -0.32, yaw: Math.PI, text: "FRANKIBARBER", w: 5.0, h: 0.8 });
  props.push({ kind: "barber_pole", x: -0.7, y: 2.2, z: -0.42, yaw: 0, h: 0.7 }); // drop 6: by the door, on the street side
  props.push({ kind: "neon", x: 5.0, y: 2.35, z: 0.28, yaw: Math.PI, text: "PO GODZINACH", w: 2.6 });
  props.push({ kind: "board", x: 2.5, y: 1.9, z: 9.83, yaw: 0, text: "ZAPLECZE" });
  props.push({ kind: "poster", x: 7.83, y: 1.9, z: 4.0, yaw: -Math.PI / 2, variant: "cuts" });
  props.push({ kind: "sticker", x: 4.2, y: 1.5, z: 0.16, yaw: Math.PI, variant: "open" });
  props.push({ kind: "pendant", x: 1.0, y: 3.55, z: 4.5 });
  props.push({ kind: "pendant", x: 5.0, y: 3.55, z: 2.0 });
  props.push({ kind: "pendant", x: 5.5, y: 3.55, z: 8.0 });
  props.push({ kind: "trash", x: 3.6, y: 0, z: 1.4, variant: "bin" });
  props.push({ kind: "vent", x: 7.83, y: 3.1, z: 8.6, yaw: -Math.PI / 2 });
  props.push({ kind: "towel_stack", x: -2.6, y: 1.9, z: 11.3 });
  props.push({ kind: "sink", x: 5.5, y: 0.95, z: 16.85 });
  props.push({ kind: "poster", x: -3.99, y: 1.9, z: 12.5, yaw: Math.PI / 2, variant: "hours" });
  props.push({ kind: "tube_light", x: 2, y: 3.5, z: 14, yaw: 0, w: 1.4 });
  props.push({ kind: "tube_light", x: -2, y: 3.5, z: 16, yaw: Math.PI / 2, w: 1.2 });
  props.push({ kind: "board", x: -1.0, y: 1.9, z: 17.83, yaw: 0, text: "DYŻURY", variant: "shifts" });
  props.push({ kind: "vent", x: 19.96, y: 3.2, z: 6, yaw: -Math.PI / 2 });
  props.push({ kind: "pipe", x: 19.7, y: 4.8, z: 5, yaw: 0, w: 9.0 });
  props.push({ kind: "tube_light", x: 14, y: 5.7, z: 5, yaw: Math.PI / 2, w: 1.5 });
  props.push({ kind: "tube_light", x: 13, y: 5.7, z: 15, yaw: Math.PI / 2, w: 1.5 });
  props.push({ kind: "tube_light", x: 12, y: 5.4, z: 11.3, yaw: 0, w: 1.2 });
  props.push({ kind: "crate", x: 18.5, y: 0, z: 8.5, variant: "small" });
  props.push({ kind: "cable", x: 16, y: 5.9, z: 12, yaw: 0, w: 6 });
  props.push({ kind: "graffiti", x: 16, y: 1.5, z: 17.83, yaw: 0, variant: "tag" });
  props.push({ kind: "sticker", x: 8.16, y: 1.4, z: 9.5, yaw: Math.PI / 2, variant: "fb" }); // (z 5.5 was behind the west staircase, z 8.5 in the doorway; caught by map.test.ts)
  props.push({ kind: "graffiti", x: -7.49, y: 2.2, z: 6, yaw: Math.PI / 2, variant: "big" });
  props.push({ kind: "lamp", x: -4.35, y: 2.9, z: 7, yaw: -Math.PI / 2, variant: "wall" });
  props.push({ kind: "lamp", x: -4.35, y: 2.9, z: 15, yaw: -Math.PI / 2, variant: "wall" });
  props.push({ kind: "ac_unit", x: -4.51, y: 2.2, z: 2.5, yaw: -Math.PI / 2 });
  props.push({ kind: "pipe", x: -4.2, y: 0.3, z: 9, yaw: Math.PI / 2, w: 9.0, variant: "vertical" });
  props.push({ kind: "trash", x: -12, y: 0, z: 2.5, variant: "bags" });
  props.push({ kind: "trash", x: -5.2, y: 0, z: 14.2, variant: "bags" });
  props.push({ kind: "poster", x: -7.5, y: 2.0, z: 8.01, yaw: 0, variant: "gig" });
  // Backlot / kiosk.
  props.push({ kind: "sign", x: -23, y: 2.65, z: 13.97, yaw: Math.PI, text: "KIOSK 24H", w: 3.0, h: 0.5 });
  props.push({ kind: "neon", x: -19.88, y: 1.9, z: 16, yaw: -Math.PI / 2, text: "OTWARTE", w: 1.2, h: 0.4 });
  props.push({ kind: "graffiti", x: -16, y: 2.0, z: 10.01, yaw: 0, variant: "big", text: "OSTRE CIĘCIE" });
  props.push({ kind: "lamp", x: -22, y: 0, z: 24, variant: "post" });
  props.push({ kind: "tube_light", x: -23, y: 2.9, z: 16, yaw: Math.PI / 2, w: 1.2, variant: "cool" });
  props.push({ kind: "trash", x: -25.5, y: 0, z: 26, variant: "bags" });
  props.push({ kind: "poster", x: -26.99, y: 2.0, z: 20, yaw: Math.PI / 2, variant: "gig" });
  // Street.
  for (const [lx, lz] of [[-9, -4.5], [4, -6], [18, -4.5], [-14, -19.5], [12, -19.5], [30, -4.5]]) props.push({ kind: "lamp", x: lx, y: 3.6, z: lz, variant: "head" });
  props.push({ kind: "pole", x: 17.8, y: 0, z: -2.5, variant: "sign" });
  props.push({ kind: "sticker", x: -3.7, y: 1.2, z: -4.9, yaw: 0, variant: "fb" });
  props.push({ kind: "vent", x: 12, y: 4.2, z: -0.04, yaw: Math.PI, variant: "big" });
  props.push({ kind: "sign", x: -4.25, y: 2.0, z: -20.5, yaw: 0, text: "NOCNY / N01", w: 1.6, h: 0.4 });
  props.push({ kind: "poster", x: -8, y: 2.5, z: -21.99, yaw: 0, variant: "gig" });
  props.push({ kind: "poster", x: 24, y: 2.5, z: -21.99, yaw: 0, variant: "cuts" });
  props.push({ kind: "graffiti", x: -22, y: 2.2, z: -21.99, yaw: 0, variant: "big" });
  props.push({ kind: "neon", x: 8, y: 4.5, z: -21.99, yaw: 0, text: "DO PÓŹNA", w: 3.2, h: 0.6 });
  props.push({ kind: "trash", x: 22, y: 0.15, z: -20.5, variant: "bags" });
  // East block.
  props.push({ kind: "sign", x: 27, y: 2.93, z: 8.03, yaw: 0, text: "PARKING", w: 3.0, h: 0.5 });
  props.push({ kind: "tube_light", x: 25, y: 3.1, z: 4, yaw: Math.PI / 2, w: 1.5, variant: "cool" });
  props.push({ kind: "tube_light", x: 31, y: 3.1, z: 4, yaw: Math.PI / 2, w: 1.5, variant: "cool" });
  props.push({ kind: "sign", x: 27, y: 3.9, z: 13.97, yaw: Math.PI, text: "MYJNIA", w: 4.0, h: 0.7 });
  props.push({ kind: "tube_light", x: 27, y: 4.4, z: 19, yaw: Math.PI / 2, w: 1.5, variant: "cool" });
  props.push({ kind: "graffiti", x: 34.98, y: 1.8, z: 4, yaw: -Math.PI / 2, variant: "tag" });
  props.push({ kind: "lamp", x: 33.5, y: 0, z: 18, variant: "post" });
  props.push({ kind: "vent", x: 22.33, y: 3.5, z: 19, yaw: Math.PI / 2, variant: "big" });
  props.push({ kind: "pipe", x: 21.2, y: 0.3, z: 16, yaw: 0, w: 4.0, variant: "vertical" });
  // Yard.
  props.push({ kind: "lamp", x: -8, y: 0, z: 23, variant: "post" });
  props.push({ kind: "lamp", x: 9, y: 0, z: 20, variant: "post" });
  props.push({ kind: "lamp", x: 20, y: 0, z: 34, variant: "post" });
  props.push({ kind: "lamp", x: -6, y: 0, z: 33, variant: "post" });
  props.push({ kind: "trash", x: -12, y: 0, z: 27, variant: "bags" });
  props.push({ kind: "wheel", x: 12.5, y: 0, z: 20, variant: "tyres" });
  props.push({ kind: "crate", x: 17, y: 1.0, z: 26.5, variant: "small" });
  props.push({ kind: "graffiti", x: -0.05, y: 1.4, z: 25, yaw: -Math.PI / 2, variant: "fb" });
  props.push({ kind: "vent", x: 16, y: 4.5, z: 18.18, yaw: 0, variant: "big" });
  props.push({ kind: "pipe", x: 8.5, y: 0.3, z: 22, yaw: Math.PI / 2, w: 5.5, variant: "vertical" });
  props.push({ kind: "sign", x: 17, y: 4.2, z: 18.18, yaw: 0, text: "ROZŁADUNEK", w: 2.4, h: 0.5 });
  // North compound.
  props.push({ kind: "lamp", x: -8, y: 0, z: 42, variant: "post" });
  props.push({ kind: "lamp", x: 18, y: 0, z: 42, variant: "post" });
  props.push({ kind: "board", x: -13, y: 1.6, z: 37.98, yaw: Math.PI, text: "DYŻURKA", w: 1.2, h: 0.4 });
  props.push({ kind: "poster", x: 23.98, y: 1.7, z: 39.5, yaw: -Math.PI / 2, variant: "hours" });
  props.push({ kind: "graffiti", x: 10, y: 2.4, z: 44.98, yaw: Math.PI, variant: "big", text: "PO GODZINACH" });
  props.push({ kind: "trash", x: 29, y: 0, z: 43, variant: "bags" });

  // ---------- Lights ----------
  // Shop: warm tungsten practicals (main is a shadow-casting spot pointing down).
  lights.push({ kind: "spot", x: 1.0, y: 3.4, z: 4.5, dx: 0, dy: -1, dz: 0, angle: 2.4, color: DISTRICT_LIGHTS.amber, intensity: 26, range: 9, shadows: true, priority: 10 });
  lights.push({ kind: "point", x: 5.0, y: 3.3, z: 2.0, color: DISTRICT_LIGHTS.amber, intensity: 12, range: 7, priority: 6 });
  lights.push({ kind: "point", x: 5.5, y: 3.3, z: 8.0, color: DISTRICT_LIGHTS.amber, intensity: 10, range: 7, priority: 5 });
  lights.push({ kind: "point", x: -2.6, y: 2.2, z: 3.2, color: DISTRICT_LIGHTS.amber, intensity: 5, range: 5, priority: 4 });
  // Back hall: cool-white fluorescent with a slight green cast.
  lights.push({ kind: "point", x: 1.0, y: 3.3, z: 14.5, color: DISTRICT_LIGHTS.mercury, intensity: 11, range: 8, priority: 5 });
  // Neighbour unit: cold industrial. Storage: warm sodium.
  lights.push({ kind: "point", x: 14, y: 5.3, z: 5, color: DISTRICT_LIGHTS.mercury, intensity: 30, range: 11, priority: 6 });
  lights.push({ kind: "point", x: 13, y: 5.4, z: 15, color: DISTRICT_LIGHTS.amber, intensity: 24, range: 10, priority: 6 });
  lights.push({ kind: "point", x: 11, y: 4.9, z: 11.3, color: DISTRICT_LIGHTS.amber, intensity: 8, range: 6, priority: 3 });
  // Street lamps: warm sodium pools.
  for (const [lx, lz] of [[-9, -4.5], [4, -6], [18, -4.5], [-14, -19.5], [12, -19.5], [30, -4.5]]) {
    // The head projects 0.6 m from the post; light leaves its underside, not the solid pole.
    lights.push({ kind: "spot", x: lx, y: 3.5, z: lz + 0.6, dx: 0, dy: -1, dz: 0, angle: 2.6, color: DISTRICT_LIGHTS.amber, intensity: 32, range: 11, shadows: lx === -9, priority: 8 });
  }
  lights.push({ kind: "point", x: 2.0, y: 4.0, z: -1.2, color: DISTRICT_LIGHTS.amber, intensity: 9, range: 6, priority: 4 });
  lights.push({ kind: "point", x: -4.2, y: 2.2, z: -19.8, color: DISTRICT_LIGHTS.mercury, intensity: 10, range: 7, priority: 5 }); // bus shelter
  lights.push({ kind: "point", x: 8, y: 4.4, z: -21.5, color: DISTRICT_LIGHTS.accent, intensity: 8, range: 7, priority: 4 });     // "DO PÓŹNA" neon
  // Alley: cool blue-grey security light + warm bulb over the shop's side door.
  lights.push({ kind: "point", x: -8, y: 3.9, z: 15.5, color: DISTRICT_LIGHTS.mercury, intensity: 14, range: 9, priority: 5 });
  lights.push({ kind: "point", x: -4.7, y: 2.9, z: 7, color: DISTRICT_LIGHTS.amber, intensity: 8, range: 6, priority: 4 });
  lights.push({ kind: "point", x: -4.7, y: 2.8, z: 15, color: DISTRICT_LIGHTS.amber, intensity: 8, range: 6, priority: 4 });
  // Backlot / kiosk.
  lights.push({ kind: "point", x: -20, y: 3.4, z: 2, color: DISTRICT_LIGHTS.mercury, intensity: 14, range: 9, priority: 5 });
  lights.push({ kind: "point", x: -23, y: 2.8, z: 16, color: DISTRICT_LIGHTS.mercury, intensity: 12, range: 7, priority: 5 });
  lights.push({ kind: "point", x: -22, y: 3.5, z: 24, color: DISTRICT_LIGHTS.amber, intensity: 20, range: 10, priority: 6 });
  // East block: canopy cool tubes, car wash, lane lamp.
  lights.push({ kind: "point", x: 25, y: 3.0, z: 4, color: DISTRICT_LIGHTS.mercury, intensity: 16, range: 8, priority: 5 });
  lights.push({ kind: "point", x: 31, y: 3.0, z: 4, color: DISTRICT_LIGHTS.mercury, intensity: 16, range: 8, priority: 5 });
  lights.push({ kind: "point", x: 27, y: 4.2, z: 19, color: DISTRICT_LIGHTS.mercury, intensity: 22, range: 10, priority: 6 });
  lights.push({ kind: "point", x: 33.5, y: 3.5, z: 18, color: DISTRICT_LIGHTS.amber, intensity: 18, range: 9, priority: 5 });
  lights.push({ kind: "point", x: 26, y: 2.65, z: 11.6, color: DISTRICT_LIGHTS.amber, intensity: 8, range: 6, priority: 3 }); // below the gantry deck
  // Yard: cool main flood, purple accent on the west side, warm dock lamp, north floods.
  lights.push({ kind: "point", x: 3, y: 5.15, z: 23.5, color: DISTRICT_LIGHTS.mercury, intensity: 26, range: 13, priority: 7 });
  lights.push({ kind: "point", x: -8, y: 4.2, z: 23, color: DISTRICT_LIGHTS.accent, intensity: 16, range: 9, priority: 6 });
  lights.push({ kind: "point", x: 9, y: 4.3, z: 20, color: DISTRICT_LIGHTS.amber, intensity: 18, range: 9, priority: 6 });
  lights.push({ kind: "point", x: 20, y: 4.3, z: 34, color: DISTRICT_LIGHTS.amber, intensity: 20, range: 10, priority: 6 });
  lights.push({ kind: "point", x: -6, y: 4.3, z: 33, color: DISTRICT_LIGHTS.mercury, intensity: 20, range: 10, priority: 6 });
  lights.push({ kind: "point", x: -8, y: 4.3, z: 42, color: DISTRICT_LIGHTS.amber, intensity: 22, range: 10, priority: 6 });
  lights.push({ kind: "point", x: 18, y: 4.3, z: 42, color: DISTRICT_LIGHTS.amber, intensity: 22, range: 10, priority: 6 });

  // ---------- Spawns ----------
  // Team 0 (FADE): south pavement. Team 1 (TAPER): north compound. All behind cover, none visible
  // from an enemy spawn (map.test.ts checks eye-to-eye rays).
  const t0: [number, number, number][] = [[-24.5, -17, 0], [-16, -18, 0.2], [-9.5, -19, 0], [-3.8, -19.2, 0], [4, -19, 0], [12, -18.5, -0.2], [19.5, -18.7, 0], [30.5, -20.3, 0]];
  const t1: [number, number, number][] = [[-23, 42, Math.PI], [-13, 43.5, Math.PI], [-7, 41, Math.PI], [0, 42.5, Math.PI], [9.5, 41.5, Math.PI], [16, 42.5, Math.PI], [27, 43.5, Math.PI], [33.5, 42, Math.PI * 0.9]];
  for (const [x, z, yaw] of t0) spawns.push({ x, y: 0.2, z, yaw, team: 0 });
  for (const [x, z, yaw] of t1) spawns.push({ x, y: 0.05, z, yaw, team: 1 });

  // ---------- Buy stations: the barber's reception, the kiosk counter, the car-park booth ----------
  const stations: Station[] = [
    { x: 5.75, y: 0, z: 2.9, name: "RECEPTION" },
    { x: -22.5, y: 0, z: 17.0, name: "KIOSK" },
    { x: 21.3, y: 0, z: 10.4, name: "BOOTH" },
  ];
  for (const st of stations) props.push({ kind: "neon", x: st.x, y: 2.2, z: st.z, yaw: 0, text: "$ BUY", w: 1.2, h: 0.4, variant: "station" });

  // ---------- Domination flags (drop 4): west backlot, the shop itself, the car wash ----------
  // A and C sit one lane in from each team's side; B is the barber shop — the map's namesake and
  // the contested middle (three doors, the window and the back hall all open onto it).
  const flags: Flag[] = [
    { id: "A", name: "DEPOT", x: -35, y: 0, z: 24 },
    { id: "B", name: "THE SHOP", x: 3.4, y: 0, z: 7.2 },
    { id: "C", name: "COURTYARD", x: 43, y: 0, z: 24 },
  ];

  const arenaSpawns = expandDistrict(solids, props, lights, DISTRICT_LIGHTS);
  // Perimeter sconces light empty approaches without adding collision or shadow maps.
  for (const [x, z, yaw, color] of [
    [-44.95, -14, Math.PI / 2, DISTRICT_LIGHTS.amber],
    [-27.65, -16, -Math.PI / 2, DISTRICT_LIGHTS.amber],
    [-44.95, 38, Math.PI / 2, DISTRICT_LIGHTS.mercury],
    [-27.65, 40, -Math.PI / 2, DISTRICT_LIGHTS.mercury],
    [52.95, -14, -Math.PI / 2, DISTRICT_LIGHTS.amber],
    [35.35, -16, Math.PI / 2, DISTRICT_LIGHTS.amber],
    [52.95, 38, -Math.PI / 2, DISTRICT_LIGHTS.mercury],
    [35.35, 40, Math.PI / 2, DISTRICT_LIGHTS.mercury],
    [-26.95, 39, Math.PI / 2, DISTRICT_LIGHTS.mercury],
    [0, 44.95, Math.PI, DISTRICT_LIGHTS.mercury],
    [32, 44.95, Math.PI, DISTRICT_LIGHTS.mercury],
  ] as const) {
    props.push({ kind: "lamp", variant: "wall", x, y: 3, z, yaw, color });
    lights.push({ kind: "point", x: x + Math.sin(yaw) * .35, y: 2.9,
      z: z + Math.cos(yaw) * .35, color, intensity: 24, range: 14, priority: 5 });
  }
  // Fixtures and practicals use one palette; nearest matching source supplies the emission.
  for (const p of props) {
    if (!["lamp", "tube_light", "pendant", "neon", "barber_pole"].includes(p.kind) || p.color) continue;
    const py = p.y + (p.kind === "lamp" && p.variant === "post" ? 3.3 : 0);
    const nearby = [...lights].sort((a,b) => Math.hypot(a.x-p.x,a.y-py,a.z-p.z)-Math.hypot(b.x-p.x,b.y-py,b.z-p.z))[0];
    p.color = nearby.color;
  }

  return {
    id: "night_district",
    name: "Night District",
    solids, props, lights, spawns, arenaSpawns, stations, flags,
    killY: -10,
    bounds: boxFrom(-46, -2, Z0 - 1, 100, 12, Z1 - Z0 + 2),
  };
})();

export const MAPS: Record<string, MapDef> = { [NIGHT_DISTRICT.id]: NIGHT_DISTRICT, [GORA.id]: GORA };
export const DEFAULT_MAP_ID = NIGHT_DISTRICT.id;
export const MAP_ORDER: readonly string[] = [NIGHT_DISTRICT.id, GORA.id];

/** The map's bomb sites, or NIGHT_DISTRICT's pair for a map that predates the field. */
export const sitesOf = (map: MapDef): readonly BombSite[] => map.sites ?? BOMB_SITES;

/** Builds the static collision world for a map (used by both server and client prediction). */
/**
 * Replaces a world's boxes in place. The client's local player and the game context both hold the
 * CollisionWorld BY REFERENCE, so a tactical plan has to mutate the one they have rather than hand
 * out a new one. Clears the broadphase with it (`addBoxes` already invalidates the grid).
 */
export function rebuildWorldInto(w: CollisionWorld, solids: readonly Solid[]): void {
  w.boxes.length = 0;
  w.addBoxes(solids.map((s) => s.box));
}

export function buildCollisionWorld(map: MapDef): CollisionWorld {
  const w = new CollisionWorld();
  w.addBoxes(map.solids.map((s) => s.box));
  return w;
}
