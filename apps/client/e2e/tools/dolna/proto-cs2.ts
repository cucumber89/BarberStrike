/**
 * proto-cs2 — DOLNA, the "Wierny CS2" layout for the design table.
 *
 * Grammar: two homes and a mid. Team 0's home is the PLOT (the black barber shed under the balcony
 * is its start pocket, the garage bay and the three gaps in the front line — hedge gap, wicket,
 * gate — are its forward line, the detailing hall is its back). Team 1's home is the BUILDING SITE
 * (the ground-floor shell is its start pocket, the three gaps in the construction mesh — west gap,
 * site gate, east gap — are its forward line). The MID is the STREET: the one long line of the
 * map, 5.5 m wide and 60 m long, broken by the parked car, the van, the poles and the pine trunks.
 * Contested places are on the street, so both duellists reach them within 250 ms and neither owns
 * the long line for free. Three lanes: WEST (hedge gap ↔ west mesh gap, the pole and the toi-toi),
 * MID (wicket/garage ↔ site gate, the skips), EAST (gate/drive ↔ east mesh gap, the van and car).
 *
 * +X east (along the street), +Z north (into the plot). Floor top y = 0. Metres.
 * Thin walls are placed so the plan tool can draw them (a 0.3 m wall must straddle a half-metre
 * in z or a quarter-metre in x); roofs are named roof_* and checked by hand in section 6.
 */
import { boxFrom } from "../../../../../packages/shared/src/collision";
import type { MapDef, MaterialTag, Solid, SolidLook, SpawnPoint } from "../../../../../packages/shared/src/map";

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

const solids: Solid[] = [];
const add = (...s: Solid[]) => solids.push(...s);
type Gap = [number, number];

/**
 * A wall along X (z0..z1 thick) from x0 to x1, height h, with door openings [a, b] cut from the
 * floor to `lintel`; the band above the lintel spans the whole wall, so it sits on the jambs and
 * nothing floats. A wall whose lintel is its full height gets no band (a fence with gaps).
 */
function wallX(name: string, x0: number, x1: number, z0: number, z1: number, h: number, mat: MaterialTag, gaps: Gap[] = [], lintel = 2.2): void {
  if (!gaps.length) { add(S(x0, 0, z0, x1 - x0, h, z1 - z0, mat, name)); return; }
  const top = Math.min(lintel, h);
  let x = x0; let i = 0;
  for (const [a, b] of gaps) { if (a > x) add(S(x, 0, z0, a - x, top, z1 - z0, mat, `${name}_j${i++}`)); x = b; }
  if (x < x1) add(S(x, 0, z0, x1 - x, top, z1 - z0, mat, `${name}_j${i++}`));
  if (h > top) add(S(x0, top, z0, x1 - x0, h - top, z1 - z0, mat, `${name}_band`));
}
/** The same wall along Z (x0..x1 thick), gaps in z. */
function wallZ(name: string, z0: number, z1: number, x0: number, x1: number, h: number, mat: MaterialTag, gaps: Gap[] = [], lintel = 2.2): void {
  if (!gaps.length) { add(S(x0, 0, z0, x1 - x0, h, z1 - z0, mat, name)); return; }
  const top = Math.min(lintel, h);
  let z = z0; let i = 0;
  for (const [a, b] of gaps) { if (a > z) add(S(x0, 0, z, x1 - x0, top, a - z, mat, `${name}_j${i++}`)); z = b; }
  if (z < z1) add(S(x0, 0, z, x1 - x0, top, z1 - z, mat, `${name}_j${i++}`));
  if (h > top) add(S(x0, top, z0, x1 - x0, h - top, z1 - z0, mat, `${name}_band`));
}
/** A garden tree: a 1.4 m trunk with a low crown from 1.4 m — a 2.4 m blob that blocks the eye line. */
function tree(name: string, cx: number, cz: number, crown = 2.4): void {
  add(S(cx - 0.3, 0, cz - 0.3, 0.6, 1.4, 0.6, "wood", `${name}_trunk`));
  add(S(cx - crown / 2, 1.4, cz - crown / 2, crown, 3.1, crown, "foliage", `${name}_crown`));
}

// ======================= EXTENTS =======================
const SX0 = -30, SX1 = 30;            // the street, 60 m
const ROAD0 = -6.7, ROAD1 = -1.5;     // the road, 5.2 m (soil, ruts); north verge 1.2 m to the fence line
const VERGE_S = -8.4;                 // far verge with the pines: -8.4..-6.7 in front of the site, 1 m elsewhere
const FRONT = -0.5;                   // the front line (fence / hedge feet start here); the plot-side verge is 1.0 m
const PX0 = -11.8, PX1 = 11.8;        // the plot between the hedges (23.6 m)
const PZ1 = 42;                       // the north hedge line
const HX0 = -5, HX1 = 5, HZ0 = 6.3, HZ1 = 16.8;  // the house 10 × 10.5
const HH = 6.5;                       // house walls (two storeys)
const GX1 = 1.3, GZ1 = 12.6;          // garage bay interior: x -4.7..1.3, z 6.6..12.6 (6 × 6)
const SHX0 = -3.9, SHX1 = 3.9, SHZ0 = HZ1, SHZ1 = 20.7;   // the shed 7.8 × 3.9 × 2.8 under the balcony
const HALLX0 = -11.8, HALLX1 = 0.3, HALLZ0 = 35.4, HALLZ1 = 42;  // the hall 12.1 × 6.6 × 4 (NW corner)
const SITEX0 = -14, SITEX1 = 8, SITEZ0 = -28.6, SITEZ1 = VERGE_S; // the building site yard
const SHELLX0 = -8, SHELLX1 = 4, SHELLZ0 = -28.6, SHELLZ1 = -21.3; // the shell 12 × 7.3 × 2.8

// ======================= GROUND (non-overlapping panels) =======================
add(S(SX0, -1, ROAD0, SX1 - SX0, 1, ROAD1 - ROAD0, "soil", "ground_road"));
add(S(SX0, -1, ROAD1, SX1 - SX0, 1, FRONT - ROAD1, "soil", "ground_verge_n"));
add(S(SX0, -1, VERGE_S, SX1 - SX0, 1, ROAD0 - VERGE_S, "soil", "ground_verge_s"));
add(S(SITEX0 - 0.5, -1, SITEZ0 - 0.5, SITEX1 - SITEX0 + 1, 1, SITEZ1 - SITEZ0 + 0.5, "soil", "ground_site"));
add(S(PX0 - 0.6, -1, FRONT, PX1 - PX0 + 1.2, 1, HZ0 - FRONT, "floor_concrete", "ground_front"));  // front yard + drive
add(S(HX1, -1, HZ0, PX1 + 0.6 - HX1, 1, HZ1 - HZ0, "floor_concrete", "ground_drive"));           // east lane
add(S(HX0, -1, HZ0, HX1 - HX0, 1, HZ1 - HZ0, "floor_concrete", "ground_garage"));                // under the house
add(S(PX0 - 0.6, -1, HZ0, HX0 - PX0 + 0.6, 1, HZ1 - HZ0, "soil", "ground_lawn_w"));              // west lane
add(S(PX0 - 0.6, -1, HZ1, PX1 - PX0 + 1.2, 1, PZ1 + 0.6 - HZ1, "soil", "ground_lawn_n"));        // the garden
add(S(SX0, -1, FRONT, PX0 - 0.6 - SX0, 1, 0.6, "soil", "ground_nb_w"));                           // neighbours' hedge feet
add(S(PX1 + 0.6, -1, FRONT, SX1 - PX1 - 0.6, 1, 0.6, "soil", "ground_nb_e"));

// ======================= BOUNDARY =======================
const HEDGE = 3.0;
add(S(PX0 - 0.6, 0, FRONT, 0.6, HEDGE, PZ1 + 0.6 - FRONT, "foliage", "hedge_w"));
add(S(PX1, 0, FRONT, 0.6, HEDGE, PZ1 + 0.6 - FRONT, "foliage", "hedge_e"));
add(S(PX0, 0, PZ1, PX1 - PX0, HEDGE, 0.6, "foliage", "hedge_n"));
// Front line: thuja hedge left of the house with a 1.2 m gap (DZIURA), then the 1.5 m wooden
// fence with the 1.0 m wicket (FURTKA) left of centre and the 3.2 m gate (BRAMA) on the right.
const GAP: Gap = [-10.35, -9.15];
const WICKET: Gap = [-2.75, -1.75];
const GATE: Gap = [6.5, 9.7];
wallX("hedge_front_w", PX0, -6, FRONT, FRONT + 0.6, HEDGE, "foliage", [GAP], HEDGE);
wallX("fence_front", -6, PX1, FRONT, FRONT + 0.3, 1.5, "wood", [WICKET, GATE], 1.5);
// The neighbours along the street: thuja 3 m, nobody gets over.
add(S(SX0, 0, FRONT, PX0 - 0.6 - SX0, HEDGE, 0.6, "foliage", "hedge_nb_w"));
add(S(PX1 + 0.6, 0, FRONT, SX1 - PX1 - 0.6, HEDGE, 0.6, "foliage", "hedge_nb_e"));
// Street ends and the far side outside the site: invisible walls to 5 m (butting, never crossing).
add(S(SX0 - 0.5, 0, VERGE_S - 0.5, 0.5, 5, FRONT + 0.6 - VERGE_S + 0.5, "none", "wall_edge_w", true));
add(S(SX1, 0, VERGE_S - 0.5, 0.5, 5, FRONT + 0.6 - VERGE_S + 0.5, "none", "wall_edge_e", true));
add(S(SX0, 0, -8.5, SITEX0 - SX0, 5, 0.5, "none", "wall_edge_s_w", true));
add(S(SITEX1, 0, -8.5, SX1 - SITEX1, 5, 0.5, "none", "wall_edge_s_e", true));
// The building site: construction mesh 2.0 m with a 3.2 m gate and two gaps where panels are
// missing; an invisible band above it to 5 m so its top is never a step.
const MESH_GAP_W: Gap = [-11.55, -9.95];
const MESH_GATE: Gap = [-4.85, -1.65];
const MESH_GAP_E: Gap = [4.15, 5.35];
wallX("fence_site", SITEX0, SITEX1, VERGE_S - 0.3, VERGE_S, 2.0, "fence", [MESH_GAP_W, MESH_GATE, MESH_GAP_E], 2.0);
// The invisible band above each mesh panel (never over a gap), so the mesh top is never a step.
{
  let x = SITEX0; let i = 0;
  for (const [a, b] of [MESH_GAP_W, MESH_GATE, MESH_GAP_E, [SITEX1, SITEX1] as Gap]) { if (a > x) add(S(x, 2.0, VERGE_S - 0.3, a - x, 3.0, 0.3, "none", `wall_edge_site_top_${i++}`, true)); x = b; }
}
add(S(SITEX0 - 0.5, 0, SITEZ0, 0.5, 5, -8.5 - SITEZ0, "none", "wall_edge_site_w", true));
add(S(SITEX1, 0, SITEZ0, 0.5, 5, -8.5 - SITEZ0, "none", "wall_edge_site_e", true));
add(S(SITEX0 - 0.5, 0, SITEZ0 - 0.5, SITEX1 - SITEX0 + 1, 5, 0.5, "none", "wall_edge_site_s", true));

// ======================= THE HOUSE (closed, except the garage bay) =======================
add(S(GX1, 0, HZ0, HX1 - GX1, HH, HZ1 - HZ0, "paint_white", "house_main_e"));
add(S(HX0, 0, GZ1, GX1 - HX0, HH, HZ1 - GZ1, "paint_white", "house_main_n"));
const GARAGE_FRONT: Gap = [-3.95, -1.55];   // the left (recessed) gate, open, 2.4 m
const GARAGE_BACK: Gap = [10.65, 11.85];    // 1.2 m door in the west wall to the west lane
wallZ("garage_wall_w", HZ0, GZ1, HX0, HX0 + 0.3, HH, "paint_white", [GARAGE_BACK]);
wallX("garage_wall_s", HX0 + 0.3, GX1, HZ0, HZ0 + 0.3, HH, "paint_white", [GARAGE_FRONT]);
add(S(HX0 + 0.4, HH, HZ0 + 0.4, HX1 - HX0 - 0.8, 2.0, HZ1 - HZ0 - 0.8, "paint_red", "roof_house"));
// The car in the bay: crouch cover, leaves a 4 m aisle from the front gate to the back door.
add(O(-0.7, 0, 7.1, 1.8, 1.45, 4.4, "glass_car", "car", "garage_car"));

// ======================= THE SHED — BARBER (T0 start pocket, 3 doors) =======================
const SHED_W_DOOR: Gap = [17.65, 18.85];
const SHED_E_DOOR: Gap = [18.65, 19.85];
const SHED_N_DOOR: Gap = [-0.85, 0.35];
wallZ("shed_wall_w", SHZ0, SHZ1, SHX0, SHX0 + 0.2, 2.8, "wall_panel", [SHED_W_DOOR]);
wallZ("shed_wall_e", SHZ0, SHZ1, SHX1 - 0.2, SHX1, 2.8, "wall_panel", [SHED_E_DOOR]);
wallX("shed_wall_n", SHX0 + 0.2, SHX1 - 0.2, SHZ1 - 0.3, SHZ1, 2.8, "wall_panel", [SHED_N_DOOR]);
add(S(SHX0 + 0.1, 2.5, SHZ0 + 0.1, SHX1 - SHX0 - 0.2, 0.25, SHZ1 - SHZ0 - 0.2, "wall_panel", "roof_shed"));
// Two chairs (crouch cover, collision the size of the drawn chair) and the counter (low).
add(S(-2.6, 0, 16.9, 0.8, 1.45, 0.9, "leather", "shed_chair_1"));
add(S(-0.6, 0, 16.9, 0.8, 1.45, 0.9, "leather", "shed_chair_2"));
add(S(1.5, 0, 16.9, 1.9, 0.9, 0.9, "counter", "shed_counter"));

// ======================= THE HALL — DETAILING (T0's back) =======================
const ROLLER: Gap = [-9, -5];
const HALL_SIDE_DOOR: Gap = [38.65, 39.85];
wallX("hall_wall_s", HALLX0, HALLX1, HALLZ0, HALLZ0 + 0.3, 4.0, "corrugated_blue", [ROLLER], 3.0);
wallZ("hall_wall_e", HALLZ0 + 0.3, HALLZ1, HALLX1 - 0.2, HALLX1, 4.0, "corrugated_blue", [HALL_SIDE_DOOR]);
wallX("hall_wall_n", HALLX0, HALLX1 - 0.2, HALLZ1 - 0.6, HALLZ1, 4.0, "corrugated_blue");
wallZ("hall_wall_w", HALLZ0 + 0.3, HALLZ1 - 0.6, HALLX0, HALLX0 + 0.3, 4.0, "corrugated_blue");
add(S(HALLX0 + 0.1, 3.7, HALLZ0 + 0.1, HALLX1 - HALLX0 - 0.2, 0.25, HALLZ1 - HALLZ0 - 0.2, "corrugated_blue", "roof_hall"));
// The car on the two-post lift: walk under it (2.0 m), nobody gets on it (0.25 m to the roof).
add(S(-8.6, 0, 38.2, 0.4, 2.0, 0.4, "metal", "hall_lift_post_w"));
add(S(-5.3, 0, 38.2, 0.4, 2.0, 0.4, "metal", "hall_lift_post_e"));
add(O(-9.0, 2.0, 37.5, 4.4, 1.45, 1.8, "glass_car", "car", "hall_car_raised"));
add(O(-11.2, 0, 40.4, 3.4, 2.0, 0.6, "metal", "lockers", "hall_cabinets"));
add(O(-2.6, 0, 40.2, 1.0, 0.9, 1.0, "metal", "drums", "hall_drums_1"));
add(O(-1.5, 0, 40.2, 1.0, 0.9, 1.0, "metal", "drums", "hall_drums_2"));
add(S(-2.2, 0, 36.2, 1.0, 0.8, 1.0, "rubber", "hall_tyres_1"));
add(S(-1.4, 0, 38.0, 1.0, 0.8, 1.0, "rubber", "hall_tyres_2"));

// ======================= THE GARDEN =======================
// The 3–4 tall thujas beside the house on the left (Z2) and the thujas and shrubs on the right:
// 6 m screens that cut both lanes beside the house, each leaving a 2.2–2.4 m passage.
add(S(-8.6, 0, 6.3, 3.6, 6, 4, "foliage", "thuja_sw"));
add(S(5.0, 0, 6.3, 3.6, 6, 4, "foliage", "thuja_se"));
// The garden's few trees (Z3), crowns low enough to break the lanes and the lawn.
tree("tree_w", -9.4, 16, 3.4);
tree("tree_e", 9.4, 16, 3.4);
tree("tree_mid", 0, 28);
tree("tree_n", -4, 33);
// The thing under the dark tarp behind the house (Z2): a covered trailer, full cover mid-garden.
add(O(4.5, 0, 26, 2.0, 2.0, 4.0, "glass_dark", "container", "trailer_tarp"));
// The green slide: tower 1.3 (cannot be climbed from the ground), ramp 0.8 (a step onto the tower).
add(S(7.8, 0, 36.0, 1.2, 1.3, 1.2, "paint_green", "slide_tower"));
add(S(5.4, 0, 36.2, 2.4, 0.8, 0.8, "paint_green", "slide_ramp"));

// ======================= THE STREET =======================
add(S(-16.2, 0, -1.65, 0.35, 8, 0.35, "concrete_block", "pole_w"));
add(S(13.85, 0, -1.65, 0.35, 8, 0.35, "concrete_block", "pole_e"));
for (const x of [-28, -25, -22, -19, -16, -8, -6, 2, 13.5, 16, 18.5, 21, 23.5, 26, 28.5]) add(S(x - 0.3, 0, x < SITEX0 || x > SITEX1 ? -8.0 : -8.4, 0.6, 6, 0.6, "wood", `pine_${x < 0 ? "w" : "e"}${String(Math.abs(x)).replace(".", "_")}`));
add(S(-13.9, 0, -8.0, 1.1, 2.3, 1.1, "paint_blue", "toitoi"));
add(O(6, 0, -8.4, 2.0, 1.3, 2.0, "metal", "skip", "skip_1"));
add(O(9.5, 0, -8.0, 3.0, 1.3, 2.0, "metal", "skip", "skip_2"));
add(O(-1, 0, -7.2, 5.0, 2.2, 2.0, "paint_white", "van", "van_white"));
add(O(24, 0, -3.5, 4.4, 1.45, 1.8, "glass_car", "car", "car_dark"));
add(O(-26, 0, -3.5, 4.4, 1.45, 1.8, "glass_car", "car", "car_dark_2"));

// ======================= THE SHELL — BUILDING SITE (T1 start pocket) =======================
const SHELL_DOOR_N: Gap = [-6.35, -5.15];
const SHELL_DOOR_E: Gap = [-26.35, -25.15];
const SHELL_DOOR_W: Gap = [-24.35, -23.15];
wallX("shell_wall_n", SHELLX0, SHELLX1, SHELLZ1 - 0.3, SHELLZ1, 2.8, "paint_white", [SHELL_DOOR_N]);
wallZ("shell_wall_e", SHELLZ0 + 0.3, SHELLZ1 - 0.3, SHELLX1 - 0.3, SHELLX1, 2.8, "paint_white", [SHELL_DOOR_E]);
wallZ("shell_wall_w", SHELLZ0 + 0.3, SHELLZ1 - 0.3, SHELLX0, SHELLX0 + 0.3, 2.8, "paint_white", [SHELL_DOOR_W]);
wallX("shell_wall_s", SHELLX0 + 0.3, SHELLX1 - 0.3, SHELLZ0, SHELLZ0 + 0.3, 2.8, "paint_white");
add(S(-2.3, 0, SHELLZ0 + 0.3, 0.3, 2.8, 4.7, "paint_white", "shell_partition"));
add(O(1.0, 0, -24.0, 1.2, 0.8, 1.2, "wood", "pallets", "shell_pallets"));
add(O(-7.2, 0, -28.0, 1.2, 1.3, 1.2, "metal", "machine", "shell_mixer"));
// The yard: a heap of sand (low) and a pallet of bricks (crouch).
add(S(-13, 0, -15, 2.0, 0.8, 2.0, "soil", "site_sand"));
add(O(5.5, 0, -13.5, 1.2, 1.3, 1.2, "wood", "pallets", "site_bricks"));

// ======================= SPAWNS =======================
const spawns: SpawnPoint[] = [
  // team 0 — THE PLOT. First = the duel start, inside the shed.
  { x: -3.1, y: 0, z: 18.4, yaw: -Math.PI / 2, team: 0 },
  { x: -7, y: 0, z: 26, yaw: Math.PI, team: 0 },
  { x: -2, y: 0, z: 24, yaw: Math.PI, team: 0 },
  { x: 4, y: 0, z: 22.5, yaw: Math.PI, team: 0 },
  { x: 7, y: 0, z: 31, yaw: Math.PI, team: 0 },
  { x: -3.5, y: 0, z: 40.5, yaw: Math.PI, team: 0 },
  // team 1 — THE BUILDING SITE. First = the duel start, inside the shell's west room.
  { x: -4.8, y: 0, z: -27.5, yaw: 0, team: 1 },
  { x: -6.5, y: 0, z: -23, yaw: 0, team: 1 },
  { x: 1, y: 0, z: -26, yaw: 0, team: 1 },
  { x: 3, y: 0, z: -23, yaw: 0, team: 1 },
  { x: -11, y: 0, z: -19, yaw: 0, team: 1 },
  { x: 7, y: 0, z: -11.5, yaw: 0, team: 1 },
];

export const MAP: MapDef = {
  id: "dolna", name: "DOLNA",
  solids, props: [], lights: [], spawns,
  arenaSpawns: [
    { x: -27, y: 0, z: -4, yaw: Math.PI / 2, team: 0 }, { x: 27, y: 0, z: -6, yaw: -Math.PI / 2, team: 1 },
    { x: 10.5, y: 0, z: 12, yaw: Math.PI, team: 0 }, { x: -10.5, y: 0, z: 4, yaw: Math.PI, team: 1 },
    { x: -6, y: 0, z: 38, yaw: 0, team: 0 }, { x: 4, y: 0, z: -12.5, yaw: 0, team: 1 },
    { x: 3, y: 0, z: 31, yaw: Math.PI, team: 0 }, { x: -11, y: 0, z: -25, yaw: 0, team: 1 },
  ],
  stations: [{ x: -4, y: 0, z: 37.5, name: "HALA" }, { x: -25, y: 0, z: -6.5, name: "SOSNY" }, { x: 27, y: 0, z: -5, name: "ULICA" }],
  flags: [{ id: "A", name: "HALA", x: -7, y: 0, z: 36.8 }, { id: "B", name: "PODJAZD", x: 8.5, y: 0, z: 4 }, { id: "C", name: "BUDOWA", x: -9, y: 0, z: -13 }],
  sites: [{ id: "A", name: "HALA", x: -7, y: 0, z: 36.8 }, { id: "B", name: "BUDOWA", x: -9, y: 0, z: -13 }],
  huntSpawnMinM: 10,
  killY: -8,
  bounds: boxFrom(-32, -2, -30, 64, 20, 74),
};

/** Key places, timed from BOTH starts; a leading "*" marks a CONTESTED place (must be within 250 ms). */
export const PLACES = {
  "*street_w": { x: -20, y: 0, z: -3 },
  "*street_mid": { x: 0, y: 0, z: -4 },
  "*street_e": { x: 16, y: 0, z: -3 },
  "*pole_w": { x: -16, y: 0, z: -2.6 },
  "gate": { x: 8.25, y: 0, z: -0.35 },
  "wicket": { x: -2.25, y: 0, z: -0.35 },
  "hedge_gap": { x: -9.75, y: 0, z: -0.2 },
  "garage_door": { x: -2.75, y: 0, z: 6.9 },
  "shed_w_door": { x: -4.2, y: 0, z: 18.25 },
  "hall_mouth": { x: -7, y: 0, z: 34.8 },
  "site_gate": { x: -3.25, y: 0, z: -9.0 },
  "site_gap_w": { x: -10.75, y: 0, z: -9.0 },
  "site_gap_e": { x: 4.75, y: 0, z: -9.0 },
  "skips": { x: 7, y: 0, z: -5.7 },
  "car": { x: 26, y: 0, z: -4.5 },
  "street_w_end": { x: -27, y: 0, z: -4 },
  "street_e_end": { x: 27, y: 0, z: -6 },
  "other_start_T1": { x: -4.8, y: 0, z: -27.5 },
  "other_start_T0": { x: -3.1, y: 0, z: 18.4 },
};
/** Exits counted within 15 / 30 m of each start. */
export const EXITS = {
  shed_w_door: { x: -4.2, y: 0, z: 18.25 },
  shed_e_door: { x: 4.2, y: 0, z: 19.25 },
  shed_n_door: { x: -0.25, y: 0, z: 21.0 },
  garage_back_door: { x: -5.3, y: 0, z: 11.25 },
  east_lane: { x: 8.5, y: 0, z: 15 },
  shell_door_n: { x: -5.75, y: 0, z: -21.0 },
  shell_door_e: { x: 4.3, y: 0, z: -25.75 },
  shell_door_w: { x: -8.3, y: 0, z: -23.75 },
  yard_e: { x: 5.5, y: 0, z: -19 },
  site_gate: { x: -3.25, y: 0, z: -9.0 },
};
export const GROUND = /^ground_/;
export const BOUNDARY = /^(hedge_|fence_|wall_edge)/;
