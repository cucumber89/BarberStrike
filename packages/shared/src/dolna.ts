/**
 * DOLNA 17 — the third map, v3: the owner's plot EXACTLY as he drew it (`plan-owner.png`,
 * 2026-09-27), measured pixel by pixel, and every room furnished from the voxel kit so the house,
 * the barber shed and the detailing garage live like the real place. Built for EVERY mode.
 *
 * THE DRAWING, MEASURED (site plan, 12.25 px per metre — the house is 150 px = 12.25 m; the
 * plot between the hedges 480 × 323 px = 39.2 × 26.4 m; distances from the WEST hedge and from
 * the ROAD LINE at the plot's south edge):
 *   house 8.6…20.6 m E, 5.1…16.9 m N (12 × 12);  annex on the house's NE corner 16.6…20.6 × 17.2…20.1;
 *   balcony 1 on the garden face 12.3…15.9 (floor plan: 5.1 m wide — 4.5 m built);
 *   barber shed 21.3…26.4 × 6.8…15.0 (5.1 × 8.2), 0.7 m east of the house — built 1.5 m off it,
 *     the narrowest gap a body (0.7) walks and the walk grid (0.5) cells; a 0.7 m gap is a wall;
 *   detailing garage 29.6…38.5 × 0…14.4 (9 × 14.4) ON the road line, 0.7 m short of the east
 *     hedge — built 1.5 m short: the drawn gap becomes a service alley from the road to the lawn;
 *   pool: a circle Ø 3.3 m at 27.8 E, 23.3 N — a round above-ground frame pool, 1.3 m high;
 *   road 5.1 m wide along the south; the BMW on it at 8.2…12.9 E, 1.6…4 m south of the line;
 *   garage spawn: the NE corner, 0.6…2.7 m from the east wall, 1.0…4.6 m from the north wall.
 * The east hedge is drawn stopping 3.4 m short of the north hedge; we close the corner (a hole in
 * the boundary is a hole in the map, D-W3-v3).
 *
 * THE FLOOR PLANS (his, scaled to the 12 m house; every wall below cites its room):
 *   PARTER: the hall strip 4.0…6.1 m from the west face runs from the front door north to the
 *     stairs; salon NW; stairs west of the hall; the small bathroom north of the hall; kitchen
 *     strip and bedroom east; kotłownia SW; the house garage SE with its gate on the road face;
 *     the annex off the bedroom.
 *   1 PIĘTRO: the salon across the whole north with the balcony; stairs; a corridor; bedroom SW;
 *     bathroom; the big kitchen SE.
 *   2 PIĘTRO: a room NW; the stairs and an open hall west; ONE big room east (6.3 × 12 m) with
 *     the east balcony and the spawn in its south end — he drew no wall across it, so there is
 *     none; the furniture breaks its lines.
 *   BARAK: the mirror wall is the WEST wall — TV in its NW corner, the barber table 4.2 m long
 *     with three seats facing it; the couch on the north wall; the wash unit ("myjka") on the
 *     south wall; the bathroom in the SW corner with its door north; the door in the MIDDLE of
 *     the east wall with a window each side of it.
 *   GARAŻ: two cars nose-north in the south half, each behind its own gate; the spawn pocket NE.
 *
 * WHAT WE ADDED, AND WHY (the doors are ours — he drew none): a second shed door north to the
 * pool (one door = a grenade trap); the front fence with a wicket at the front door and a gate at
 * the house garage; garden doors from the salon, the kitchen and the annex so the house is a
 * loop; a partition and a screen that hide the garage spawn; trees and thujas that cut the long
 * lines; the alley east of the garage.
 *
 * CONSTRUCTION (unchanged from v2, proven by `dolna.test.ts`): storeys of 3.5 m on 0.25 m slabs
 * that lie on the walls; a switchback stair of 0.35 × 0.5 treads; doors 1.5 m wide, 2.2 m high;
 * balconies with a 1.35 m parapet; cover in one language — ≤ 0.8 low, 1.3 / 1.45 crouch, ≥ 1.9
 * full. FURNITURE is a voxel prop (drawn, no collision) plus an INVISIBLE proxy the size of the
 * piece, its height snapped to the language (`furn`), so a couch is a low cover and a wardrobe a
 * wall, for the mover, the bots and the audit alike.
 *
 * +X east (along the road), +Z north (into the plot), floor top y = 0. Metres.
 */
import { type Box, boxFrom } from "./collision";
import type { LightHint, MapDef, MaterialTag, PropHint, Solid, SolidLook, SpawnPoint } from "./map";

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

const solids: Solid[] = [];
const props: PropHint[] = [];
const lights: LightHint[] = [];
const add = (...s: Solid[]) => solids.push(...s);
type Gap = [number, number];

function wallX(name: string, x0: number, x1: number, z0: number, z1: number, h: number, mat: MaterialTag, gaps: Gap[] = [], lintel = 2.2, y0 = 0): void {
  if (!gaps.length) { add(S(x0, y0, z0, x1 - x0, h, z1 - z0, mat, name)); return; }
  const top = Math.min(lintel, h);
  let x = x0; let i = 0;
  for (const [a, b] of gaps) { if (a > x) add(S(x, y0, z0, a - x, top, z1 - z0, mat, `${name}_j${i++}`)); x = b; }
  if (x < x1) add(S(x, y0, z0, x1 - x, top, z1 - z0, mat, `${name}_j${i++}`));
  if (h > top) add(S(x0, y0 + top, z0, x1 - x0, h - top, z1 - z0, mat, `${name}_band`));
}
function wallZ(name: string, z0: number, z1: number, x0: number, x1: number, h: number, mat: MaterialTag, gaps: Gap[] = [], lintel = 2.2, y0 = 0): void {
  if (!gaps.length) { add(S(x0, y0, z0, x1 - x0, h, z1 - z0, mat, name)); return; }
  const top = Math.min(lintel, h);
  let z = z0; let i = 0;
  for (const [a, b] of gaps) { if (a > z) add(S(x0, y0, z, x1 - x0, top, a - z, mat, `${name}_j${i++}`)); z = b; }
  if (z < z1) add(S(x0, y0, z, x1 - x0, top, z1 - z, mat, `${name}_j${i++}`));
  if (h > top) add(S(x0, y0 + top, z0, x1 - x0, h - top, z1 - z0, mat, `${name}_band`));
}
function tree(name: string, cx: number, cz: number, crown = 3.0): void {
  add(S(cx - 0.25, 0, cz - 0.25, 0.5, 6.0, 0.5, "wood", `${name}_trunk`));
  add(S(cx - crown / 2, 6.0, cz - crown / 2, crown, 3.5, crown, "foliage", `${name}_crown`));
}
function pane(name: string, x0: number, x1: number, z0: number, z1: number, y: number, h = 1.4): void {
  add(S(x0, y, z0, x1 - x0, h, z1 - z0, "glass_dark", name));
}

// ======================= FURNITURE: a voxel prop and its proxy =======================
/**
 * Footprints of every model the map places (w × h × d, metres, the model's own local +Z being
 * its front). The proxy is built from THIS table, not from the model, so the map loads and is
 * judged whether or not a model is drawn yet; `dolna.test.ts` checks the table against the
 * library. The proxy height snaps to the cover language: ≤ 0.8 stays (a jump), 0.81–1.25 → 0.8,
 * 1.26–1.69 → 1.45 (crouch, not a step), ≥ 1.7 → at least 1.9 (a wall).
 */
export const DOLNA_FURNITURE: Readonly<Record<string, [number, number, number]>> = {
  fridge: [0.6, 1.9, 0.6], stove: [0.6, 0.9, 0.7], kitchen_counter: [1.8, 0.9, 0.7], kitchen_sink: [0.6, 0.9, 0.7], kitchen_upper: [1.8, 0.7, 0.3],
  microwave: [0.5, 0.3, 0.4], kitchen_table: [1.2, 0.8, 0.8], chair: [0.45, 0.9, 0.45],
  sofa: [2.1, 0.9, 0.9], armchair: [0.9, 0.9, 0.9], coffee_table: [1.0, 0.5, 0.6], tv: [1.4, 0.9, 0.15], tv_stand: [1.6, 0.5, 0.4],
  bookshelf: [0.9, 2.0, 0.4], rug: [2.0, 0.1, 1.4], floor_lamp: [0.4, 1.6, 0.4], plant: [0.4, 1.0, 0.4],
  bed_double: [1.6, 0.55, 2.0], bed_single: [0.9, 0.55, 2.0], wardrobe: [1.2, 2.1, 0.6], nightstand: [0.45, 0.5, 0.4], desk: [1.4, 0.75, 0.7], office_chair: [0.6, 1.1, 0.6],
  toilet: [0.4, 0.8, 0.7], washbasin: [0.6, 0.85, 0.5], bathtub: [1.7, 0.6, 0.75], shower: [0.9, 2.0, 0.9], washing_machine: [0.6, 0.85, 0.6],
  boiler_tank: [0.6, 1.6, 0.6], gas_boiler: [0.45, 0.75, 0.35], rack: [0.9, 1.8, 0.4],
  workbench: [1.8, 0.9, 0.7], tool_chest: [0.7, 1.0, 0.5], tyre_stack: [0.65, 0.9, 0.65], pressure_washer: [0.4, 0.9, 0.5], shop_vac: [0.4, 0.7, 0.4],
  detail_shelf: [0.9, 1.8, 0.35], bucket: [0.3, 0.3, 0.3], compressor: [0.5, 0.8, 0.9], hose_reel: [0.4, 0.4, 0.25], polisher: [0.5, 0.15, 0.2],
  barber_station: [1.4, 0.85, 0.45], wash_unit: [0.7, 1.0, 1.4], coat_rack: [0.4, 1.7, 0.4], shelf_bottles: [0.9, 0.45, 0.2],
  shoe_rack: [0.8, 0.5, 0.3], coat_hooks: [0.8, 0.2, 0.15],
  deck_chair: [0.6, 0.8, 1.6], garden_table: [1.2, 0.72, 0.8], garden_bench: [1.5, 0.45, 0.4], grill: [0.6, 0.95, 0.5], pool_ladder: [0.5, 1.0, 0.6],
  mailbox: [0.3, 1.2, 0.25], wheelie_bin: [0.6, 1.1, 0.7], wheelie_bin_black: [0.6, 1.1, 0.7], bike: [1.7, 1.0, 0.4], flower_bed: [1.0, 0.35, 0.5], dog_house: [0.9, 0.85, 1.1],
  hex_light: [2.4, 0.08, 2.0], bmw_m240i: [2.05, 1.5, 4.45],
};
/** The cover language, applied to a piece's real height. */
export const coverHeight = (h: number): number => (h <= 0.8 ? h : h <= 1.25 ? 0.8 : h < 1.7 ? 1.45 : Math.max(1.9, h));
let furnN = 0;
/**
 * Places a model with its footprint CENTRED on (x, z), standing on y, turned by `yaw` (the prop's
 * front, local +Z, turned about y — a quarter turn swaps the footprint's sides); `wall` places
 * it without a proxy (a thing hung above head height or thin enough to ignore).
 */
function furn(model: string, x: number, z: number, yaw = 0, y = 0, opts: { wall?: boolean; name?: string; ceil?: number; scale?: number } = {}): void {
  const size = DOLNA_FURNITURE[model];
  if (!size) throw new Error(`dolna: no footprint for "${model}"`);
  props.push({ kind: "voxel", model, x, y, z, yaw, scale: opts.scale });
  if (opts.wall) return;
  const quarter = Math.round(yaw / (Math.PI / 2)) % 2 !== 0;
  const w = quarter ? size[2] : size[0], d = quarter ? size[0] : size[2];
  let h = coverHeight(size[1]);
  // A full piece indoors is a wall to the ceiling: a fridge beside a counter would otherwise be
  // a 1.9 m perch (counter 0.8 + mantle 1.25 reaches it), and a perch under a ceiling is nothing.
  if (h >= 1.9) h = Math.max(h, opts.ceil ?? ceilingAt(x, z) - 0.01);
  add(S(x - w / 2, y, z - d / 2, w, h, d, "none", opts.name ?? `furn_${model}_${furnN++}`, true));
}
/** The room height over a point: the garage's 4 m, the shed's 2.8, the house's 3.25, the open sky's 1.9 (no cap). */
function ceilingAt(x: number, z: number): number {
  if (x >= 9.1 && x <= 18.1 && z >= 0.5 && z <= 14.9) return 4.0;
  if (x >= 2.5 && x <= 7.6 && z >= 7.3 && z <= 15.5) return 2.8;
  if (x >= -11 && x <= 1 && z >= 5.5 && z <= 20.5) return 3.25;
  return 1.9;
}
/** A wall-hung model at height `y` (no proxy). */
const hang = (model: string, x: number, z: number, yaw: number, y: number) => furn(model, x, z, yaw, y, { wall: true });

// ======================= EXTENTS (the drawing, in metres) =======================
const WT = 0.25;
const ST = 3.5, WH = 3.25, SLAB = 0.25;
const Y = (s: number) => s * ST;
const RISE = 0.35, TREAD = 0.5;
const PX0 = -19.6, PX1 = 19.6;                 // the plot between the hedges (39.2 m)
const PZ0 = 0.5, PZ1 = 26.9;                   // road line … north hedge (26.4 m)
const ROAD0 = -4.5, VERGE0 = -6;
const HEDGE = 3.0, HW = 0.6;
const HX0 = -11, HX1 = 1, HZ0 = 5.5, HZ1 = 17.5;          // the house 12 × 12, 8.6 m from the west hedge
const AX0 = -3, AZ1 = 20.5;                                // the annex 4 × 3 off the NE corner
const B1X0 = -7.75, B1X1 = -3.25, B1Z1 = 19.25;            // balcony 1, 4.5 × 1.75
const B2Z0 = 8.5, B2Z1 = 13, B2X1 = 2.4;                   // balcony 2, 1.4 × 4.5 on the east face, its posts 10 cm off the shed
const SHX0 = 2.5, SHX1 = 7.6, SHZ0 = 7.3, SHZ1 = 15.5;    // the shed 5.1 × 8.2 × 2.8, 1.5 m east of the house
const SHH = 2.8;
const GX0 = 9.1, GX1 = 18.1, GZ0 = PZ0, GZ1 = 14.9;       // the detailing garage 9 × 14.4 × 4 on the road line
const GH = 4.0;
const POOL = { cx: 8.2, cz: 23.8 };                        // the round frame pool Ø 3.6, 1.45 high
const EXT: MaterialTag = "wall_white";                     // the house render: white
const INT: MaterialTag = "wall_plaster";

// ======================= GROUND (non-overlapping panels; the outermost run under the hedges) =======================
const GXW = PX0 - HW - 0.5, GXE = PX1 + HW + 0.5;          // the ground reaches under the hedges
add(S(GXW, -1, ROAD0, GXE - GXW, 1, PZ0 - ROAD0, "gravel", "ground_road"));
add(S(GXW, -1, VERGE0, GXE - GXW, 1, ROAD0 - VERGE0, "gravel", "ground_verge"));
// the front yard: lawn west, a paved drive in front of the house garage and the front door, lawn east up to the garage
add(S(GXW, -1, PZ0, -7.5 - GXW, 1, HZ0 - PZ0, "grass", "ground_front_w"));
add(S(-7.5, -1, PZ0, 8.5, 1, HZ0 - PZ0, "paving", "ground_drive"));
add(S(1, -1, PZ0, GX0 - 1, 1, HZ0 - PZ0, "grass", "ground_front_e"));
add(S(GX0, -1, GZ0, GX1 - GX0, 1, GZ1 - GZ0, "floor_epoxy", "ground_garage"));
add(S(GX1, -1, GZ0, GXE - GX1, 1, GZ1 - GZ0, "paving", "ground_alley"));
// the west lawn beside the house, the house's own floors, the annex
add(S(GXW, -1, HZ0, HX0 - GXW, 1, PZ1 + HW + 0.5 - HZ0, "grass", "ground_lawn_w"));
add(S(HX0, -1, HZ0, 4, 1, HZ1 - HZ0, "floor_wood", "ground_house_w"));            // stairs bay + kotłownia + salon west
add(S(-7, -1, HZ0, 8, 1, 9.5 - HZ0, "floor_concrete", "ground_house_s"));          // hall + house garage
add(S(-7, -1, 9.5, 8, 1, HZ1 - 9.5, "floor_wood", "ground_house_n"));              // hall north, bathroom, kitchen, bedroom, salon east
add(S(AX0, -1, HZ1, HX1 - AX0, 1, AZ1 - HZ1, "floor_wood", "ground_annex"));
add(S(HX0, -1, HZ1, AX0 - HX0, 1, PZ1 + HW + 0.5 - HZ1, "grass", "ground_lawn_n1"));
add(S(AX0, -1, AZ1, HX1 - AX0, 1, PZ1 + HW + 0.5 - AZ1, "grass", "ground_lawn_n2"));
// between the house and the shed, the shed's floor, east of the shed up to the garage
add(S(HX1, -1, HZ0, SHX0 - HX1, 1, HZ1 - HZ0, "paving", "ground_passage"));
add(S(SHX0, -1, SHZ0, SHX1 - SHX0, 1, SHZ1 - SHZ0, "floor_tile", "ground_shed"));
add(S(SHX0, -1, HZ0, SHX1 - SHX0, 1, SHZ0 - HZ0, "grass", "ground_shed_s"));
add(S(SHX0, -1, SHZ1, SHX1 - SHX0, 1, HZ1 - SHZ1, "grass", "ground_shed_n"));
add(S(SHX1, -1, HZ0, GX0 - SHX1, 1, HZ1 - HZ0, "grass", "ground_lawn_mid"));
add(S(GX0, -1, GZ1, GXE - GX0, 1, HZ1 - GZ1, "grass", "ground_lawn_e1"));
// the north lawn east of the house, with the pool's paved ring
const PR = 2.6;                                                                    // the pool's paved ring, half-size
add(S(HX1, -1, HZ1, POOL.cx - PR - HX1, 1, PZ1 + HW + 0.5 - HZ1, "grass", "ground_lawn_ne1"));
add(S(POOL.cx - PR, -1, HZ1, 2 * PR, 1, POOL.cz - PR - HZ1, "grass", "ground_lawn_ne2"));
add(S(POOL.cx - PR, -1, POOL.cz - PR, 2 * PR, 1, 2 * PR, "paving", "ground_pool_ring"));
add(S(POOL.cx - PR, -1, POOL.cz + PR, 2 * PR, 1, PZ1 + HW + 0.5 - POOL.cz - PR, "grass", "ground_lawn_ne3"));
add(S(POOL.cx + PR, -1, HZ1, GXE - POOL.cx - PR, 1, PZ1 + HW + 0.5 - HZ1, "grass", "ground_lawn_e2"));

// ======================= THE POOL: a round frame pool, 1.3 m — crouch cover nobody mantles =======================
// A circle out of boxes: a stepped octagon ring (four wall bands and four corner steps), the
// water a hand's width under the rim. Its top, at 1.3, is the language's crouch height: a body
// beside it hides crouching, and 1.3 cannot be mantled (1.25), so nobody stands in the water.
{
  const { cx, cz } = POOL, R = 1.8, L = 1.1, T = 0.12, PH = 1.45, WL = 1.3;
  const M: MaterialTag = "paint_blue";
  add(S(cx - R, 0, cz - L, T, PH, 2 * L, M, "pool_wall_w"));
  add(S(cx + R - T, 0, cz - L, T, PH, 2 * L, M, "pool_wall_e"));
  add(S(cx - L, 0, cz + R - T, 2 * L, PH, T, M, "pool_wall_n"));
  add(S(cx - L, 0, cz - R, 2 * L, PH, T, M, "pool_wall_s"));
  // the corner steps: from the band's end to the lobe's side
  for (const [sx, sz, tag] of [[-1, 1, "nw"], [1, 1, "ne"], [-1, -1, "sw"], [1, -1, "se"]] as const) {
    const x0 = sx < 0 ? cx - R : cx + L, z0 = sz < 0 ? cz - R : cz + L;
    add(S(x0, 0, z0, R - L, PH, T, M, `pool_step_h_${tag}`));                                   // horizontal step band
    add(S(sx < 0 ? cx - L - T : cx + L, 0, sz < 0 ? cz - R : cz + L, T, PH, R - L, M, `pool_step_v_${tag}`)); // vertical step band
  }
  // the water 15 cm under the rim: both heights are the language's crouch heights, and a body
  // that gets in (over a lounger) stands in the water to its knees, not on it
  add(S(cx - R + T, 0, cz - L, 2 * R - 2 * T, WL, 2 * L, "water", "pool_water_mid"));
  add(S(cx - L, 0, cz + L, 2 * L, WL, R - L - T, "water", "pool_water_n"));
  add(S(cx - L, 0, cz - R + T, 2 * L, WL, R - L - T, "water", "pool_water_s"));
}

// ======================= BOUNDARY: thuja hedges 3 m, the far side of the road invisible =======================
add(S(PX0 - HW, 0, PZ0, HW, HEDGE, PZ1 - PZ0, "foliage", "hedge_w"));
add(S(PX1, 0, PZ0, HW, HEDGE, PZ1 - PZ0, "foliage", "hedge_e"));
add(S(PX0 - HW, 0, PZ1, PX1 - PX0 + 2 * HW, HEDGE, HW, "foliage", "hedge_n"));
add(S(PX0 - HW - 0.5, 0, VERGE0, HW, HEDGE, PZ0 - VERGE0, "foliage", "hedge_road_w"));
add(S(PX1 + 0.5, 0, VERGE0, HW, HEDGE, PZ0 - VERGE0, "foliage", "hedge_road_e"));
add(S(GXW, 0, VERGE0 - 0.5, GXE - GXW, 5, 0.5, "none", "wall_edge_s", true));
const WICKET: Gap = [-6.7, -5.2];
const GATE: Gap = [-4.25, -1.05];
wallX("fence_front", PX0, GX0, PZ0, PZ0 + WT, 1.5, "wood", [WICKET, GATE], 1.5);

// ======================= THE HOUSE: three storeys, his plan per storey =======================
const FRONT_DOOR: Gap = [-6.7, -5.2];        // the hall strip 4.0…6.1 m from the west face
const GARAGE0_GATE: Gap = [-4, -0.8];
const SALON_GDOOR: Gap = [-9.75, -7.75];     // patio doors, 2 m
const KITCHEN_GDOOR: Gap = [-4.5, -3.0];
const ANNEX_DOOR: Gap = [-1.5, 0];
const BALCONY1_DOOR: Gap = [-6.25, -4.75];
const GARAGE0_EDOOR: Gap = [6, 7.5];
const BALCONY2_DOOR: Gap = [10, 11.5];
for (const s of [0, 1, 2]) {
  const y0 = Y(s), t = `house${s}`;
  wallZ(`${t}_wall_w`, HZ0 + WT, HZ1 - WT, HX0, HX0 + WT, WH, EXT, [], 2.2, y0);
  wallZ(`${t}_wall_e`, HZ0 + WT, HZ1 - WT, HX1 - WT, HX1, WH, EXT, s === 0 ? [GARAGE0_EDOOR] : s === 2 ? [BALCONY2_DOOR] : [], 2.2, y0);
  wallX(`${t}_wall_s`, HX0, HX1, HZ0, HZ0 + WT, WH, EXT, s === 0 ? [FRONT_DOOR, GARAGE0_GATE] : [], s === 0 ? 2.4 : 2.2, y0);
  wallX(`${t}_wall_n`, HX0, HX1, HZ1 - WT, HZ1, WH, EXT, s === 0 ? [SALON_GDOOR, KITCHEN_GDOOR, ANNEX_DOOR] : s === 1 ? [BALCONY1_DOOR] : [], 2.2, y0);
}
// The stair bay on every floor: x -11…-7, lanes A (south) and B (north).
const STX = -7.25;                          // east end of the treads; the threshold wall is x -7.25…-7
const LANE_A: Gap = [9.5, 11.5], LANE_B: Gap = [11.5, 13.5];
// --- PARTER
{
  const y0 = Y(0);
  wallZ("house0_hall_w", HZ0 + WT, 9.5, -7.25, -7, WH, INT, [[6.5, 8]], 2.2, y0);                           // kotłownia | hall (door)
  wallZ("house0_hall_e", HZ0 + WT, HZ1 - WT, -4.9, -4.65, WH, INT, [[6.5, 8], [10, 11.5], [14.5, 16]], 2.2, y0); // hall | garage, hall | kitchen, salon | kitchen
  wallX("house0_boiler_n", HX0 + WT, -7.25, 9.25, 9.5, WH, INT, [], 2.2, y0);                               // kotłownia | stairs (south of lane A)
  wallX("house0_garage_n", -4.65, HX1 - WT, 9.5, 9.75, WH, INT, [], 2.2, y0);                               // house garage | kitchen, bedroom
  wallX("house0_bath_s", -7, -4.9, 11.5, 11.75, WH, INT, [[-6.5, -5]], 2.2, y0);                            // the bathroom door, from the hall
  wallX("house0_salon_s", HX0 + WT, -4.9, 13.5, 13.75, WH, INT, [], 2.2, y0);                               // salon | stairs, bathroom
  wallZ("house0_kitchen_e", 9.75, HZ1 - WT, -2.2, -1.95, WH, INT, [[12, 13.5]], 2.2, y0);                   // kitchen | bedroom
  // The annex: one room off the bedroom with its own door to the garden.
  wallZ("annex_wall_w", HZ1, AZ1 - WT, AX0, AX0 + WT, WH, EXT, [], 2.2, y0);                              // the balcony post stands 25 cm off this wall
  wallX("annex_wall_n", AX0, HX1, AZ1 - WT, AZ1, WH, EXT, [[-2, -0.5]], 2.2, y0);                          // its garden door faces north
  wallZ("annex_wall_e", HZ1, AZ1 - WT, HX1 - WT, HX1, WH, EXT, [], 2.2, y0);
  add(S(AX0, WH, HZ1, HX1 - AX0, SLAB, AZ1 - HZ1, "roof_tile", "roof_annex_slab"));
  add(S(AX0 + 0.5, WH + SLAB, HZ1 + 0.5, HX1 - AX0 - 1, 0.35, AZ1 - HZ1 - 1, "roof_tile", "roof_annex_cap"));
}
// --- 1 PIĘTRO
{
  const y0 = Y(1);
  wallZ("house1_bedroom_e", HZ0 + WT, 9.5, -7.25, -7, WH, INT, [[6.5, 8]], 2.2, y0);                        // bedroom | corridor (door)
  wallZ("house1_bath_w", HZ0 + WT, 9.5, -5.5, -5.25, WH, INT, [[6.5, 8]], 2.2, y0);                          // corridor | bathroom (door)
  wallZ("house1_kitchen_w", HZ0 + WT, 13.5, -3.7, -3.45, WH, INT, [[10.5, 12]], 2.2, y0);                    // bathroom, corridor | kitchen (door from the corridor)
  wallX("house1_bath_n", -5.25, -3.7, 9.5, 9.75, WH, INT, [], 2.2, y0);                                      // bathroom | corridor
  wallX("house1_bedroom_n", HX0 + WT, -7.25, 9.25, 9.5, WH, INT, [], 2.2, y0);                               // bedroom | stairs (south of lane A)
  wallX("house1_salon_s", HX0 + WT, HX1 - WT, 13.5, 13.75, WH, INT, [[-6.75, -5.25], [-2, -0.5]], 2.2, y0); // salon | stairs, corridor (open), kitchen (door)
}
// --- 2 PIĘTRO
{
  const y0 = Y(2);
  wallZ("house2_east_w", HZ0 + WT, HZ1 - WT, -5.3, -5.05, WH, INT, [[11.5, 13]], 2.2, y0);                 // hall, NW room | the big east room (door)
  wallX("house2_nw_s", HX0 + WT, -5.3, 14, 14.25, WH, INT, [[-6.9, -5.4]], 2.2, y0);                          // NW room | hall (the door east of the well)
  add(S(HX0 + WT, y0, 13.5, 3.0, 1.3, WT, "metal", "house2_stair_rail_n"));                                  // the well's north rail
  wallX("house2_stair_s", HX0 + WT, -7.25, 9.25, 9.5, 1.3, "metal", [], 1.3, y0);                            // the well's south rail, on the slab
  add(S(-7.75, y0, 9.5, WT, 1.3, 2.0, "metal", "house2_stair_rail"));                                        // the well's east rail, on the patch
}
// --- Slabs: five panels around the stair well, the patch over the first tread carrying the next flight's foot.
for (const s of [1, 2]) {
  const y = Y(s) - SLAB;
  add(S(HX0, y, HZ0, HX1 - HX0, SLAB, LANE_A[0] - HZ0, "floor_wood", `floor_${s}_s`));
  add(S(HX0, y, LANE_A[0], WT, SLAB, LANE_B[1] - LANE_A[0], "floor_wood", `floor_${s}_w`));
  add(S(-7.75, y, LANE_A[0] - 0.01, 0.75, SLAB, LANE_A[1] - LANE_A[0] + 0.01, "floor_wood", `floor_${s}_patch`));
  add(S(-7, y, LANE_A[0], 7 + HX1, SLAB, LANE_B[1] - LANE_A[0], "floor_wood", `floor_${s}_e`));
  add(S(HX0, y, LANE_B[1], HX1 - HX0, SLAB, HZ1 - LANE_B[1], "floor_wood", `floor_${s}_n`));
}
add(S(HX0, Y(3) - SLAB, HZ0, HX1 - HX0, SLAB, HZ1 - HZ0, "roof_tile", "roof_house_slab"));
add(S(HX0 + 0.5, Y(3), HZ0 + 0.5, HX1 - HX0 - 1, 0.75, HZ1 - HZ0 - 1, "roof_tile", "roof_house_1"));
add(S(HX0 + 2, Y(3) + 0.75, HZ0 + 2, HX1 - HX0 - 4, 0.75, HZ1 - HZ0 - 4, "roof_tile", "roof_house_2"));
add(S(-3, Y(3) + 1.5, 7, 0.6, 1.0, 0.6, "wall_brick", "roof_chimney"));

// --- The stairs: a switchback. Lane A climbs west from the hall/corridor, the landing turns,
// lane B climbs east onto the threshold wall whose top is the next floor.
for (let i = 1; i <= 4; i++) add(S(STX - TREAD * i, 0, LANE_A[0], TREAD, RISE * i, LANE_A[1] - LANE_A[0], "wood", `stair_a0_step_${i}`));
add(S(HX0 + WT, 0, LANE_A[0], STX - 4 * TREAD - HX0 - WT, 5 * RISE, LANE_B[1] - LANE_A[0], "wood", "stair_landing_0"));
for (let j = 1; j <= 4; j++) add(S(STX - 4 * TREAD + TREAD * (j - 1), 0, LANE_B[0], TREAD, 5 * RISE + RISE * j, LANE_B[1] - LANE_B[0], "wood", `stair_b0_step_${j}`));
add(S(STX, 0, LANE_B[0], WT, Y(1), LANE_B[1] - LANE_B[0], INT, "house0_stair_wall"));
for (let i = 1; i <= 4; i++) add(S(STX - TREAD * i, Y(1) + RISE * (i - 1), LANE_A[0], TREAD + 0.05, RISE, LANE_A[1] - LANE_A[0], "wood", `stair_a1_step_${i}`));
add(S(HX0 + WT, Y(1) + 4 * RISE, LANE_A[0], STX - 4 * TREAD - HX0 - WT + 0.05, RISE, LANE_B[1] - LANE_A[0], "wood", "stair_landing_1"));
for (let j = 1; j <= 4; j++) add(S(STX - 4 * TREAD + TREAD * (j - 1) - 0.05, Y(1) + 5 * RISE + RISE * (j - 1), LANE_B[0], TREAD + 0.05 + (j === 4 ? 0.05 : 0), RISE, LANE_B[1] - LANE_B[0], "wood", `stair_b1_step_${j}`));
add(S(STX, Y(2) - RISE, LANE_B[0], WT, RISE, LANE_B[1] - LANE_B[0], "floor_wood", "floor_2_threshold"));

// --- Balconies: a slab on two posts, a 1.35 m parapet on the open sides.
add(S(B1X0, Y(1) - SLAB, HZ1, B1X1 - B1X0, SLAB, B1Z1 - HZ1, "floor_concrete", "balcony1_slab"));
add(S(B1X0, 0, B1Z1 - WT, WT, Y(1) - SLAB, WT, "wood", "balcony1_post_w"));
add(S(B1X1 - WT, 0, B1Z1 - WT, WT, Y(1) - SLAB, WT, "wood", "balcony1_post_e"));
add(S(B1X0, Y(1), B1Z1 - WT, B1X1 - B1X0, 1.35, WT, EXT, "balcony1_parapet_n"));
add(S(B1X0, Y(1), HZ1, WT, 1.35, B1Z1 - WT - HZ1, EXT, "balcony1_parapet_w"));
add(S(B1X1 - WT, Y(1), HZ1, WT, 1.35, B1Z1 - WT - HZ1, EXT, "balcony1_parapet_e"));
add(S(HX1, Y(2) - SLAB, B2Z0, B2X1 - HX1, SLAB, B2Z1 - B2Z0, "floor_concrete", "balcony2_slab"));
add(S(B2X1 - WT, 0, B2Z0, WT, Y(2) - SLAB, WT, "wood", "balcony2_post_s"));
add(S(B2X1 - WT, 0, B2Z1 - WT, WT, Y(2) - SLAB, WT, "wood", "balcony2_post_n"));
add(S(B2X1 - WT, Y(2), B2Z0, WT, 1.35, B2Z1 - B2Z0, EXT, "balcony2_parapet_e"));
add(S(HX1, Y(2), B2Z0, B2X1 - WT - HX1, 1.35, WT, EXT, "balcony2_parapet_s"));
add(S(HX1, Y(2), B2Z1 - WT, B2X1 - WT - HX1, 1.35, WT, EXT, "balcony2_parapet_n"));

// --- Windows: dark panes on every face, one per room.
for (const s of [0, 1, 2]) {
  const y = Y(s) + 0.9;
  pane(`win${s}_s_w`, -10, -8.5, HZ0 - 0.04, HZ0 + 0.01, y);
  if (s > 0) pane(`win${s}_s_m`, -6.5, -5, HZ0 - 0.04, HZ0 + 0.01, y);
  pane(`win${s}_s_e`, -1.5, 0, HZ0 - 0.04, HZ0 + 0.01, y);
  pane(`win${s}_w_s`, HX0 - 0.04, HX0 + 0.01, 7, 8.5, y);
  pane(`win${s}_w_n`, HX0 - 0.04, HX0 + 0.01, 15, 16.5, y);
  pane(`win${s}_e_n`, HX1 - 0.01, HX1 + 0.04, 14.5, 16, y);
  if (s < 2) pane(`win${s}_e_s`, HX1 - 0.01, HX1 + 0.04, 11, 12.5, y);
  pane(`win${s}_n_w`, s === 0 ? -7 : -10.5, s === 0 ? -5.5 : -9, HZ1 - 0.01, HZ1 + 0.04, y);
  if (s > 0) pane(`win${s}_n_e`, -2, -0.5, HZ1 - 0.01, HZ1 + 0.04, y);
}
pane("win_annex_n", -2.5, -0.5, AZ1 - 0.01, AZ1 + 0.04, 0.9);

// ======================= THE HOUSE, FURNISHED (from the voxel kit; each room lives) =======================
// A piece's front (local +Z) faces north / east / west / south. Babylon turns about y in a
// LEFT-handed world: rotation.y = +π/2 takes +z to +x (east) — the owner's screenshots had every
// sideways piece facing the wrong way while these two were swapped.
const N = 0, E = Math.PI / 2, W = -Math.PI / 2, SO = Math.PI;
{
  // PARTER — kotłownia (x -11…-7.25, z 5.75…9.5): the tank, the wall boiler, two racks.
  furn("boiler_tank", -10.4, 8.9, N);
  hang("gas_boiler", -7.45, 8.5, W, 1.2);
  furn("rack", -8.5, 5.95, N, 0, {});
  furn("rack", -10.28, 5.95, N);
  // the hall (x -7…-4.9, z 5.75…11.5): shoes, hooks, a mirror by the door
  furn("shoe_rack", -6.85, 9, E);
  hang("coat_hooks", -5.0, 9.6, W, 1.5);
  props.push({ kind: "mirror", x: -4.92, y: 1.5, z: 9, yaw: W, w: 0.6, h: 1.2 });
  // the bathroom (x -7…-4.9, z 11.75…13.5)
  furn("toilet", -6.7, 13.15, SO);
  furn("washbasin", -5.3, 13.2, SO);
  props.push({ kind: "mirror", x: -5.3, y: 1.6, z: 13.48, yaw: SO, w: 0.6, h: 0.6 });
  furn("washing_machine", -6.65, 12.1, E);
  // the house garage (x -4.65…0.75, z 5.75…9.5): a bench, the chest, tyres, a bike
  furn("workbench", -2, 9.15, SO, 0, { name: "garage0_bench" });
  furn("tool_chest", -4.3, 8.9, E);
  furn("tyre_stack", 0.4, 9.1, N);
  furn("bike", 0.5, 6.8, E);                     // along the east wall, clear of the gate
  furn("rack", -4.4, 6.3, E);
  // the kitchen (x -4.65…-2.2, z 9.75…17.5): the run along the east wall, the table by the window
  furn("kitchen_counter", -2.55, 15.5, W);
  furn("kitchen_sink", -2.55, 14.25, W);
  furn("stove", -2.55, 13.6, W);
  furn("fridge", -2.5, 10.1, W);
  hang("kitchen_upper", -2.35, 15.5, W, 1.5);
  hang("microwave", -2.5, 16.3, W, 0.95);
  // The galley is 2.45 m wide: the table stands along the west wall between the two doors, one
  // chair at its north end, and the 0.95 m aisle by the counters stays clear (the owner's screenshot).
  furn("kitchen_table", -4.25, 12.5, E);
  furn("chair", -4.25, 13.5, SO);
  // the bedroom (x -1.95…0.75, z 9.75…17.5): the bed against the south wall, the wardrobe east
  furn("bed_double", -0.9, 11, N);
  furn("nightstand", 0.5, 10.05, N);
  furn("wardrobe", 0.4, 13.8, W);
  furn("plant", -1.6, 16.9, N);
  // the annex (x -2.75…0.75, z 17.75…20.25): a second fridge, a rack, a bench
  furn("fridge", 0.4, 19.9, W);
  furn("rack", -2.55, 19.0, E);                  // on the west wall, clear of the garden door
  furn("garden_bench", 0.55, 18.7, W);
  // the salon (x -10.75…-4.9, z 13.75…17.5): the couch faces the TV on the west wall
  hang("rug", -8.5, 15.2, N, 0);
  furn("sofa", -6.9, 15.5, W);
  furn("armchair", -8.2, 14.4, N);
  furn("coffee_table", -8.1, 15.5, N);
  furn("tv_stand", -10.5, 15.5, E);
  hang("tv", -10.68, 15.5, E, 0.5);
  furn("bookshelf", -5.2, 14.2, W);
  furn("floor_lamp", -10.4, 14.05, N);
  furn("plant", -10.5, 17.1, N);
  // 1 PIĘTRO — the bedroom SW (x -10.75…-7.25, z 5.75…9.5)
  const y1 = Y(1);
  furn("bed_double", -9.5, 6.85, N, y1);
  furn("nightstand", -8.0, 5.98, N, y1);
  furn("wardrobe", -10.5, 8.6, E, y1);
  furn("desk", -7.6, 8.85, SO, y1);
  furn("office_chair", -7.6, 8.0, N, y1);
  // the bathroom (x -5.25…-3.7, z 5.75…9.5): the tub along the south, the rest along the east
  furn("bathtub", -4.5, 6.15, N, y1);
  furn("toilet", -3.95, 8.3, E, y1);
  furn("washbasin", -4.0, 7.2, E, y1);
  furn("washing_machine", -4.9, 9.15, SO, y1);
  // the corridor (x -7…-5.5, z 5.75…13.5): hooks and a bookshelf
  hang("coat_hooks", -5.52, 8.6, W, y1 + 1.5);   // on the bathroom's wall — the corridor has no wall at z 11
  furn("bookshelf", -6.8, 9.0, E, y1);
  // the kitchen SE (x -3.45…0.75, z 5.75…13.5): the run along the east wall, the table west
  furn("fridge", 0.4, 6.1, W, y1);
  furn("kitchen_counter", 0.4, 7.85, W, y1);
  furn("stove", 0.4, 9.15, W, y1);
  furn("kitchen_sink", 0.4, 9.8, W, y1);
  furn("kitchen_counter", 0.4, 11.0, W, y1);
  hang("kitchen_upper", 0.6, 7.85, W, y1 + 1.5);
  hang("kitchen_upper", 0.6, 11.0, W, y1 + 1.5);
  hang("microwave", 0.5, 11.9, W, y1 + 0.95);
  furn("kitchen_table", -2.2, 9.5, N, y1);
  furn("chair", -2.9, 9.5, E, y1); furn("chair", -1.5, 9.5, W, y1); furn("chair", -2.2, 8.9, N, y1); furn("chair", -2.2, 10.1, SO, y1);
  furn("plant", -3.1, 13.1, N, y1);
  // the salon (x -10.75…0.75, z 13.75…17.5): an L of couches around the table, the TV on the east wall
  hang("rug", -4.2, 15.6, N, y1);
  furn("sofa", -3.5, 16.9, SO, y1);
  furn("sofa", -7.6, 15.5, E, y1);
  furn("armchair", -3.2, 14.3, N, y1);
  furn("coffee_table", -5.2, 15.6, N, y1);
  furn("tv_stand", 0.3, 15.5, W, y1);
  hang("tv", 0.67, 15.5, W, y1 + 0.5);
  furn("bookshelf", -8.5, 17.05, N, y1);
  furn("floor_lamp", -0.1, 14.1, N, y1);
  furn("plant", -10.5, 17.1, N, y1);
  furn("plant", 0.5, 17.1, N, y1);
  // 2 PIĘTRO — the NW room (x -10.75…-5.3, z 14.25…17.5): a single bed, a desk, a wardrobe
  const y2 = Y(2);
  furn("bed_single", -10.2, 16.2, N, y2);
  furn("desk", -7.5, 16.9, N, y2);
  furn("office_chair", -7.5, 16.1, N, y2);
  furn("wardrobe", -5.6, 15.5, W, y2);
  furn("bookshelf", -9.5, 14.5, N, y2);
  // the hall (x -10.75…-5.3, z 5.75…14 around the well): a wardrobe wall, shoes, a shelf
  furn("wardrobe", -10.4, 6.6, E, y2);
  furn("wardrobe", -10.4, 7.9, E, y2);
  furn("shoe_rack", -8.0, 5.98, N, y2);
  furn("bookshelf", -5.6, 8.0, W, y2);
  furn("plant", -5.6, 13.6, N, y2);
  // the big east room (x -5.05…0.75, z 5.75…17.5): the bed south (the spawn's cover), the desk
  // east under the window, the wardrobe, a couch and the TV north, the balcony door mid-east.
  furn("bed_double", -3.5, 6.85, N, y2);
  furn("nightstand", -4.75, 5.98, N, y2);
  furn("wardrobe", -0.2, 6.1, SO, y2);
  furn("desk", 0.3, 8.6, E, y2);
  furn("office_chair", -0.5, 8.6, E, y2);
  furn("bookshelf", -4.8, 9.2, E, y2);
  hang("rug", -2.2, 13.5, N, y2);
  furn("sofa", -2.2, 14.7, SO, y2);
  furn("coffee_table", -2.2, 13.3, N, y2);
  furn("tv_stand", -2.2, 16.9, N, y2);
  hang("tv", -2.2, 17.17, N, y2 + 0.5);
  furn("armchair", -4.4, 15.5, E, y2);
  furn("plant", 0.4, 17.1, N, y2);
  furn("floor_lamp", 0.4, 12.5, N, y2);
}

// ======================= THE SHED — BARBER (his interior; a north door added) =======================
const SHED_MAT: MaterialTag = "wall_panel";
const SHED_EDOOR: Gap = [10.5, 12];            // the middle of the east wall
const SHED_NDOOR: Gap = [3, 4.5];              // ours, to the pool
wallX("shed_wall_s", SHX0, SHX1, SHZ0, SHZ0 + WT, SHH, SHED_MAT);
wallX("shed_wall_n", SHX0, SHX1, SHZ1 - WT, SHZ1, SHH, SHED_MAT, [SHED_NDOOR]);
wallZ("shed_wall_w", SHZ0 + WT, SHZ1 - WT, SHX0, SHX0 + WT, SHH, SHED_MAT);
wallZ("shed_wall_e", SHZ0 + WT, SHZ1 - WT, SHX1 - WT, SHX1, SHH, SHED_MAT, [SHED_EDOOR]);
add(S(SHX0, SHH, SHZ0, SHX1 - SHX0, SLAB, SHZ1 - SHZ0, SHED_MAT, "roof_shed"));
// The bathroom in the SW corner (2.3 × 1.6), its door NORTH into the room as he drew it.
wallX("shed_bath_n", SHX0 + WT, 5.0, 8.9, 9.15, SHH, SHED_MAT, [[3.4, 4.9]]);
wallZ("shed_bath_e", SHZ0 + WT, 8.9, 4.75, 5.0, SHH, SHED_MAT);
furn("toilet", 3.15, 8.2, E);
furn("washbasin", 4.4, 7.8, N);
// The mirror wall: the table (three stations) along the WEST wall, the mirrors above it, the
// three seats a metre off the wall facing it; the TV in the NW corner; the couch on the north
// wall; the wash unit on the south wall; product shelves; the coat rack by the door.
for (const [z, tag] of [[10.5, "1"], [11.9, "2"], [13.3, "3"]] as const) {
  furn("barber_station", SHX0 + WT + 0.23, z, E, 0, { name: `shed_station_${tag}` });
  props.push({ kind: "mirror", x: SHX0 + WT + 0.02, y: 1.55, z, yaw: E, w: 1.3, h: 1.1 });
  if (tag === "3") continue;                       // two seats: the owner had the north one taken out
  add(S(3.35, 0.05, z - 0.4, 0.9, 0.45, 0.8, "none", `shed_chair_${tag}_seat`, true));
  add(S(3.35, 0.6, z - 0.4, 0.9, 0.85, 0.8, "none", `shed_chair_${tag}_back`, true));
  props.push({ kind: "barber_chair", x: 3.8, y: 0.55, z, yaw: W });
}
furn("tv", SHX0 + WT + 0.12, 14.4, E, 1.5, { wall: true, scale: 1.6 });   // a 2.2 m screen in the NW corner
furn("sofa", 5.6, SHZ1 - WT - 0.47, SO);
furn("wash_unit", 6.4, SHZ0 + WT + 0.72, N);
hang("shelf_bottles", SHX1 - WT - 0.12, 13.6, W, 1.3);
hang("shelf_bottles", SHX1 - WT - 0.12, 8.6, W, 1.3);
furn("coat_rack", SHX1 - WT - 0.35, 12.5, N);
furn("plant", SHX1 - WT - 0.35, 9.9, N);
pane("shed_win_n", SHX1 - 0.01, SHX1 + 0.04, 13, 14.5, 0.9, 1.2);
pane("shed_win_s", SHX1 - 0.01, SHX1 + 0.04, 7.8, 9.3, 0.9, 1.2);

// ======================= THE DETAILING GARAGE (T0's home; the photo's interior) =======================
const GMAT: MaterialTag = "wall_white";
const BRAMA1: Gap = [9.7, 12.4], BRAMA2: Gap = [14.6, 17.3];
const GARAGE_NDOOR: Gap = [11.5, 13];          // west of the booth wall, so the door never looks into the pocket
const GARAGE_WDOOR: Gap = [3, 4.5];
wallX("garage_wall_s", GX0, GX1, GZ0, GZ0 + WT, GH, GMAT, [BRAMA1, BRAMA2], 3.2);
wallX("garage_wall_n", GX0, GX1, GZ1 - WT, GZ1, GH, GMAT, [GARAGE_NDOOR]);
wallZ("garage_wall_w", GZ0 + WT, GZ1 - WT, GX0, GX0 + WT, GH, GMAT, [GARAGE_WDOOR]);
wallZ("garage_wall_e", GZ0 + WT, GZ1 - WT, GX1 - WT, GX1, GH, GMAT);
add(S(GX0, GH, GZ0, GX1 - GX0, SLAB, GZ1 - GZ0, "corrugated_blue", "roof_garage"));
pane("garage_win_w", GX0 - 0.04, GX0 + 0.01, 7, 9, 1.0, 1.6);                     // the black window on the west wall (the photo)
// The spawn pocket, NE corner, where he drew it: a 2.8 m partition closes it from both gates and
// the north door; its mouth faces west, 1.75 m wide, into a sluice behind a screen.
add(S(13.35, 0, 11.65, WT, 2.8, 3.0, "wall_panel", "garage_booth_w"));
add(S(13.35, 0, 9.9, GX1 - WT - 13.35, 2.8, WT, "wall_panel", "garage_booth_s"));
add(S(11.6, 0, 7.65, WT, 2.8, 4.25, "wall_panel", "garage_booth_screen"));
// The two cars nose-north in the south half, each behind its gate: the customer's white hatch
// under the hex light, a second car at the other gate.
add(O(9.9, 0, 2.7, 1.9, 1.45, 4.3, "paint_white", "car", "garage_car_1"));
add(O(14.85, 0, 2.7, 1.9, 1.45, 4.3, "paint_red", "car", "garage_car_2"));
// Tools along the walls — nothing low (≤ 1.25) beside a car (a step onto it).
furn("tyre_stack", 9.8, 11.5, N);
furn("tyre_stack", 9.8, 12.2, N);
furn("tool_chest", 9.75, 9.0, E);
furn("workbench", 15.6, 14.2, SO);
hang("polisher", 15.2, 14.3, N, 0.9);
furn("tool_chest", 17.45, 13.3, W);
furn("detail_shelf", 9.55, 13.6, E);
furn("detail_shelf", 10.3, 14.4, SO);                                      // west of the north door, not in it
furn("compressor", 17.4, 5.0, N);
furn("pressure_washer", 13.4, 1.4, N);
furn("shop_vac", 13.4, 2.4, N);
furn("bucket", 12.8, 3.2, N); furn("bucket", 13.2, 3.5, N); furn("bucket", 9.7, 7.2, N);
hang("hose_reel", GX0 + WT + 0.13, 6.0, E, 1.3);
hang("hex_light", 10.9, 5.0, N, GH - 0.08);
hang("hex_light", 16.0, 5.0, N, GH - 0.08);

// ======================= THE ROAD AND THE GARDEN =======================
// His car, 1:1 from the photos: the M240i on the road in front of the house, nose east.
furn("bmw_m240i", -9.05, -1.8, E);
props.push({ kind: "board", x: -6.76, y: 0.45, z: -1.8, yaw: W, text: "EL 3E504", w: 0.5, h: 0.11, variant: "plate" });
props.push({ kind: "board", x: -11.34, y: 0.45, z: -1.8, yaw: E, text: "EL 3E504", w: 0.5, h: 0.11, variant: "plate" });
tree("tree_w1", -16.5, 8.5);
tree("tree_w2", -16.5, 20);
tree("tree_n", 4.5, 22, 3.4);
tree("tree_e", 14.5, 18.5, 3.4);
add(S(-17.5, 0, 13, 2.5, 1.3, 1.5, "foliage", "shrub_w"));
add(S(-10, 0, 23, 3.0, 1.3, 1.5, "foliage", "shrub_n1"));
add(S(-2, 0, 24.5, 2.0, 1.3, 1.5, "foliage", "shrub_n2"));
add(S(12.5, 0, 16.5, 1.5, 1.3, 2.0, "foliage", "shrub_e"));
add(S(-18, 0, 24, 1.5, 1.3, 1.5, "foliage", "shrub_nw"));
add(S(3.5, 0, 18.5, 1.2, 2.8, 1.2, "foliage", "thuja_n"));
add(S(15.5, 0, 22.5, 1.2, 2.8, 1.2, "foliage", "thuja_e"));
// The garden's life: sun loungers and the ladder at the pool, the table with benches by the
// patio, the grill, the letterbox at the wicket, the bins at the gate, beds along the house, a
// kennel in the NW corner, a bicycle at the shed.
furn("deck_chair", 5.2, 24.6, E); furn("deck_chair", 5.2, 22.9, E);
furn("pool_ladder", 10.35, 23.8, W);
furn("garden_table", -6, 21.5, N); furn("garden_bench", -6, 20.85, N); furn("garden_bench", -6, 22.15, SO);
furn("grill", -8.5, 21.8, N);
furn("mailbox", -7.2, 0.9, SO);
furn("wheelie_bin", 1.6, 1.0, SO); furn("wheelie_bin_black", 2.3, 1.0, SO);
furn("flower_bed", -9.5, 4.95, N); furn("flower_bed", 0.4, 4.95, N); furn("flower_bed", -12, 8, E);   // none in front of the gate
furn("dog_house", -15.5, 25.3, SO);
furn("bike", 5.2, 6.5, N);

// ======================= PROPS (no collision) AND LIGHTS =======================
const AMBER = "#ffbf70", MERCURY = "#9adce5", ACCENT = "#fa709a", DAYLIGHT = "#eef3ff";
const point = (x: number, y: number, z: number, color: string, intensity: number, range: number, priority = 5) =>
  lights.push({ kind: "point", x, y, z, color, intensity, range, priority });
// The house: one pendant per room, hung 0.8 m under the ceiling.
const rooms: [string, number, number, number][] = [
  ["boiler0", -9, 0, 7.5], ["hall0", -5.95, 0, 8.5], ["garage0", -2, 0, 7.5], ["bath0", -5.95, 0, 12.6], ["salon0", -8, 0, 15.5],
  ["kitchen0", -3.4, 0, 13.5], ["bedroom0", -0.6, 0, 14], ["annex", -1, 0, 19],
  ["bedroom1", -9, 1, 7.5], ["corridor1", -6.25, 1, 11], ["bath1", -4.5, 1, 7.5], ["kitchen1", -1.5, 1, 9.5], ["salon1", -5, 1, 15.5], ["salon1e", -1, 1, 15.5],
  ["room_nw", -8, 2, 15.9], ["hall2", -8.5, 2, 7.5], ["hall2n", -6.5, 2, 12.5], ["room_e_s", -2, 2, 8], ["room_e_n", -2, 2, 14.5],
];
for (const [, x, s, z] of rooms) {
  props.push({ kind: "pendant", x, y: Y(s) + WH - 0.85, z, h: 0.8 });
  point(x, Y(s) + WH - 1.0, z, AMBER, 9, 7, 6);
}
for (const s of [0, 1, 2]) { props.push({ kind: "lamp", x: HX0 + WT + 0.02, y: Y(s) + 2.6, z: 11.5, yaw: E, variant: "wall" }); point(HX0 + 1, Y(s) + 2.6, 11.5, AMBER, 9, 7, 6); }
props.push({ kind: "sign", x: -4.5, y: 2.7, z: HZ0 - 0.02, yaw: SO, text: "17", w: 0.4, h: 0.3 });
props.push({ kind: "lamp", x: -5.95, y: 2.7, z: HZ0 - 0.02, yaw: SO, variant: "wall" });
point(-5.95, 2.7, HZ0 - 0.7, AMBER, 10, 9, 7);
props.push({ kind: "lamp", x: -2.4, y: 3.0, z: HZ0 - 0.02, yaw: SO, variant: "wall" });
point(-2.4, 3.0, HZ0 - 0.7, AMBER, 8, 8, 6);
props.push({ kind: "lamp", x: -8.75, y: 2.6, z: HZ1 + 0.02, yaw: N, variant: "wall" });
point(-8.75, 2.6, HZ1 + 0.7, AMBER, 8, 8, 6);
props.push({ kind: "lamp", x: -5.5, y: Y(1) + 2.4, z: HZ1 + 0.02, yaw: N, variant: "wall" });
point(-5.5, Y(1) + 2.4, HZ1 + 0.8, AMBER, 8, 7, 6);
props.push({ kind: "lamp", x: HX1 + 0.02, y: Y(2) + 2.4, z: 10.75, yaw: E, variant: "wall" });
point(HX1 + 0.8, Y(2) + 2.4, 10.75, AMBER, 8, 7, 6);
props.push({ kind: "lamp", x: HX1 + 0.02, y: 2.6, z: 6.75, yaw: E, variant: "wall" });
point(HX1 + 0.7, 2.6, 6.75, AMBER, 8, 8, 6);
props.push({ kind: "lamp", x: -1.25, y: 2.5, z: AZ1 + 0.02, yaw: N, variant: "wall" });
point(-1.25, 2.5, AZ1 + 0.7, AMBER, 7, 7, 5);
props.push({ kind: "sign", x: -4.8, y: 1.2, z: PZ0 - 0.02, yaw: SO, text: "17", w: 0.3, h: 0.35 });
// The shed: the neon over the mirrors, a tube light, a lamp over each door, the pole by the door.
props.push({ kind: "neon", x: SHX0 + WT + 0.04, y: 2.4, z: 11.9, yaw: E, text: "BARBER", w: 2.2, h: 0.42, color: ACCENT });
point(SHX0 + 0.9, 2.3, 11.9, ACCENT, 8, 6, 6);
props.push({ kind: "tube_light", x: 5, y: SHH - 0.1, z: 11.5, yaw: 0, w: 1.6 });
point(5, SHH - 0.3, 11.5, AMBER, 12, 8, 8);
props.push({ kind: "tube_light", x: 5.8, y: SHH - 0.1, z: 8.5, yaw: 0, w: 1.2 });
point(5.8, SHH - 0.3, 8.5, AMBER, 8, 6, 6);
props.push({ kind: "lamp", x: SHX1 + 0.02, y: 2.5, z: 11.25, yaw: E, variant: "wall" });
point(SHX1 + 0.7, 2.5, 11.25, AMBER, 7, 7, 6);
props.push({ kind: "lamp", x: 3.75, y: 2.5, z: SHZ1 + 0.02, yaw: N, variant: "wall" });
point(3.75, 2.5, SHZ1 + 0.7, AMBER, 7, 7, 6);
props.push({ kind: "barber_pole", x: SHX1 + 0.05, y: 1.5, z: 12.4, yaw: E });
props.push({ kind: "poster", x: 5.2, y: 1.6, z: SHZ0 + WT + 0.02, yaw: N, variant: "1", w: 0.6, h: 0.85 });
// The garage: the hex panels light the bays white, tubes over the north half, the sign over the gates.
point(10.9, GH - 0.4, 5.0, DAYLIGHT, 16, 10, 8);
point(16.0, GH - 0.4, 5.0, DAYLIGHT, 16, 10, 8);
props.push({ kind: "tube_light", x: 11.5, y: GH - 0.1, z: 11.5, yaw: E, w: 1.6 });
props.push({ kind: "tube_light", x: 16, y: GH - 0.1, z: 12.5, yaw: E, w: 1.6 });
point(11.5, GH - 0.4, 11.5, DAYLIGHT, 12, 9, 7);
point(16, GH - 0.4, 12.5, DAYLIGHT, 12, 8, 8);
props.push({ kind: "sign", x: 13.5, y: 3.6, z: GZ0 - 0.02, yaw: SO, text: "DETAILING", w: 2.4, h: 0.5 });
point(13.5, 3.6, GZ0 - 0.8, MERCURY, 8, 9, 6);
props.push({ kind: "lamp", x: 12.25, y: 3.0, z: GZ1 + 0.02, yaw: N, variant: "wall" });
point(12.25, 3.0, GZ1 + 0.7, MERCURY, 8, 8, 6);
props.push({ kind: "graffiti", x: 15.6, y: 1.6, z: 9.88, yaw: SO, text: "DOLNA 17", w: 2.2, h: 0.8 });
props.push({ kind: "poster", x: 11.58, y: 1.4, z: 9.5, yaw: W, variant: "2", w: 0.6, h: 0.85 });
// The road and the garden: two street lamps, three garden posts, the pool's lamp.
for (const [x, z] of [[-15, -5.3], [13, -5.3]] as const) { props.push({ kind: "lamp", x, y: 0, z, variant: "post", h: 4.5 }); point(x, 4.3, z, AMBER, 16, 16, 7); }
for (const [x, z] of [[-16, 16], [-4, 23.5], [3, 20.5]] as const) { props.push({ kind: "lamp", x, y: 0, z, variant: "post", h: 3.8 }); point(x, 3.6, z, MERCURY, 10, 12, 6); }
props.push({ kind: "lamp", x: 12, y: 0, z: 25.8, variant: "post", h: 3.8 });
point(12, 3.6, 25.8, MERCURY, 10, 11, 6);
point(POOL.cx, 1.1, POOL.cz, MERCURY, 6, 6, 5);

// ======================= SPAWNS =======================
const spawns: SpawnPoint[] = [
  // team 0 — THE GARAGE pocket, where he drew the spawn. First = the duel start, at the mouth.
  { x: 14.1, y: 0, z: 10.9, yaw: W, team: 0 },
  { x: 16.6, y: 0, z: 13.4, yaw: W, team: 0 },
  { x: 16.35, y: 0, z: 11.65, yaw: W, team: 0 },
  { x: 15.35, y: 0, z: 11.4, yaw: W, team: 0 },
  { x: 14.6, y: 0, z: 13.4, yaw: SO, team: 0 },
  { x: 12.35, y: 0, z: 12.5, yaw: SO, team: 0 },
  // team 1 — THE HOUSE, 2nd floor, the big east room's south end. First = the duel start.
  { x: -2, y: Y(2), z: 7.75, yaw: N, team: 1 },
  { x: -3.5, y: Y(2), z: 8.5, yaw: N, team: 1 },
  { x: -1.5, y: Y(2), z: 10.5, yaw: N, team: 1 },
  { x: -3, y: Y(2), z: 11.5, yaw: N, team: 1 },
  { x: -8.5, y: Y(2), z: 7.5, yaw: N, team: 1 },
  { x: -6.3, y: Y(1), z: 15, yaw: N, team: 1 },
];

export const DOLNA: MapDef = {
  id: "dolna", name: "DOLNA",
  solids, props, lights, spawns,
  arenaSpawns: [
    { x: -16, y: 0, z: -2.5, yaw: E, team: 0 }, { x: 16, y: 0, z: -2.5, yaw: W, team: 1 },
    { x: -16, y: 0, z: 22, yaw: SO, team: 0 }, { x: 14, y: 0, z: 24.5, yaw: SO, team: 1 },
    { x: 5, y: 0, z: 10.5, yaw: N, team: 0 }, { x: -0.6, y: 0, z: 13.5, yaw: SO, team: 1 },
    { x: -6, y: Y(1), z: 11.5, yaw: N, team: 0 }, { x: -8.5, y: Y(2), z: 8.5, yaw: N, team: 1 },
  ],
  stations: [{ x: 12.9, y: 0, z: 8.5, name: "GARAŻ" }, { x: -17.5, y: 0, z: -2.5, name: "ULICA" }, { x: -3.5, y: 0, z: 16.5, name: "KUCHNIA" }],
  flags: [{ id: "A", name: "PODJAZD", x: -3, y: 0, z: 2.5 }, { id: "B", name: "SALON", x: -8, y: 0, z: 16.6 }, { id: "C", name: "BASEN", x: 8.2, y: 0, z: 20.2 }],
  sites: [{ id: "A", name: "BASEN", x: 14, y: 0, z: 22 }, { id: "B", name: "ULICA", x: -14, y: 0, z: -2.5 }],
  huntSpawnMinM: 10,
  killY: -8,
  bounds: boxFrom(-22, -3, -8, 44, 23, 36),
};
for (const st of DOLNA.stations) props.push({ kind: "neon", x: st.x, y: st.y + 2.2, z: st.z, yaw: 0, text: "$ BUY", w: 1.2, h: 0.4, variant: "station" });

/** Key places, timed from BOTH starts; a leading "*" marks a CONTESTED place (must be within 250 ms). */
export const DOLNA_PLACES: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  // The equal-cost frontier, measured on the walk grid (2 m cells, ground only): the front of the
  // house, its kitchen, the west lawn and the road. (The shed and the lawn beside it are T0's since
  // the garage's north door is clear — the first build had a shelf standing in it.)
  "*drive": { x: -2.25, y: 0, z: 3.75 },
  "*road_gate": { x: -4.25, y: 0, z: 1.75 },
  "*wicket": { x: -6.25, y: 0, z: 1.75 },
  "*kitchen_0w": { x: -4.25, y: 0, z: 15.75 },
  "*lawn_w": { x: -14.25, y: 0, z: 11.75 },
  "*road_w": { x: -10.25, y: 0, z: -0.25 },
  passage_s: { x: 1.75, y: 0, z: 5.75 },
  shed_lawn_s: { x: 3.75, y: 0, z: 5.75 },
  shed_lawn_n: { x: 5.75, y: 0, z: 17.75 },
  shed: { x: 5.75, y: 0, z: 11.75 },
  garden_door: { x: -8.75, y: 0, z: 18.25 },
  porch: { x: -3.75, y: 0, z: 18.25 },
  east_passage: { x: 1.75, y: 0, z: 8.25 },
  lawn_nw: { x: -14.25, y: 0, z: 19.75 },
  annex_n_door: { x: -1.25, y: 0, z: 21 },
  road_sw: { x: -8.25, y: 0, z: -4.25 },
  road_ww: { x: -17, y: 0, z: -2.25 },
  front_door: { x: -5.95, y: 0, z: 4.75 },
  pool_ring: { x: 8.2, y: 0, z: 20.25 },
  shed_door: { x: 8.25, y: 0, z: 11.25 },
  stair_foot: { x: -6.25, y: 0, z: 10.5 },
  garage_w_door: { x: 8.5, y: 0, z: 3.75 },
  garage_gate_1: { x: 11, y: 0, z: 1.25 },
  garage_gate_2: { x: 16, y: 0, z: 1.25 },
  garage_north_door: { x: 12.25, y: 0, z: 15.5 },
  garage_alley: { x: 18.85, y: 0, z: 7.5 },
  shed_north_door: { x: 3.75, y: 0, z: 16.25 },
  salon_1: { x: -6.4, y: Y(1), z: 15.8 },
  balcony_1: { x: -5.5, y: Y(1), z: 18.25 },
  balcony_2: { x: 1.9, y: Y(2), z: 10.75 },
  kitchen_0: { x: -3.5, y: 0, z: 14.5 },
  annex: { x: -1, y: 0, z: 19 },
  road_e: { x: 17, y: 0, z: -2 },
  garden_nw: { x: -16, y: 0, z: 22 },
  other_start_T1: { x: -2, y: Y(2), z: 7.75 },
  other_start_T0: { x: 14.1, y: 0, z: 10.9 },
};
/** Exits counted within 15 / 30 m of each start. */
export const DOLNA_EXITS: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  booth_mouth: { x: 12.6, y: 0, z: 11 },
  garage_w_door: { x: 8.5, y: 0, z: 3.75 },
  garage_gate_1: { x: 11, y: 0, z: 1.25 },
  garage_gate_2: { x: 16, y: 0, z: 1.25 },
  garage_north_door: { x: 12.25, y: 0, z: 15.5 },
  hall_2: { x: -6, y: Y(2), z: 12.25 },
  balcony_2: { x: 1.9, y: Y(2), z: 10.75 },
  stairs_2_head: { x: -7.75, y: Y(2) - RISE, z: 12.5 },
  corridor_1: { x: -6.25, y: Y(1), z: 11 },
  hall_0: { x: -5.95, y: 0, z: 8.5 },
};
export const DOLNA_GROUND = /^ground_/;
export const DOLNA_BOUNDARY = /^(hedge_|fence_|wall_edge)/;
export const DOLNA_EXTENTS: Readonly<Record<string, Box>> = {
  road: boxFrom(GXW, 0, ROAD0, GXE - GXW, 0, PZ0 - ROAD0),
  plot: boxFrom(PX0, 0, PZ0, PX1 - PX0, 0, PZ1 - PZ0),
  house: boxFrom(HX0, 0, HZ0, HX1 - HX0, Y(3), HZ1 - HZ0),
  annex: boxFrom(AX0, 0, HZ1, HX1 - AX0, WH, AZ1 - HZ1),
  shed: boxFrom(SHX0, 0, SHZ0, SHX1 - SHX0, SHH, SHZ1 - SHZ0),
  garage: boxFrom(GX0, 0, GZ0, GX1 - GX0, GH, GZ1 - GZ0),
  pool: boxFrom(POOL.cx - 1.8, 0, POOL.cz - 1.8, 3.6, 1.45, 3.6),
  stairs: boxFrom(HX0 + WT, 0, LANE_A[0], STX - HX0 - WT, Y(2), LANE_B[1] - LANE_A[0]),
};
export const DOLNA_STOREY = ST;
