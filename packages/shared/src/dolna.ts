/**
 * DOLNA — the third map: a real plot and the street in front of it, built for the 1 v 1 tournament
 * (Drop W, `docs/MAP_3_DOLNA.md`; the owner's photos and his two changes — the black barber shed
 * under the balcony, the corrugated detailing hall where the gazebo stood).
 *
 * Grammar: two homes and a mid, like a CS map. Team 0's home is the PLOT (the black barber shed
 * under the balcony is its start pocket, the garage bay and the three gaps in the front line —
 * hedge gap, wicket, gate — are its forward line, the detailing hall is its back). Team 1's home is
 * the BUILDING SITE across the street (the ground-floor shell is its start pocket, the three gaps in
 * the construction mesh — west gap, site gate, east gap — are its forward line). The MID is the
 * STREET: the one long line of the map, 5.2 m of road and 60 m long, broken OFF-AXIS by the two
 * parked cars, the van and the two skips, the two poles and the pine trunks — a 1.7 m strip down
 * the crown of the road still sees all 60 m. Three lanes: WEST (hedge gap ↔ west mesh gap), MID
 * (wicket/garage ↔ site gate), EAST (gate/drive ↔ east mesh gap).
 *
 * FAIRNESS IS MEASURED, NOT BUILT. A real place has no 180° twin (GÓRA's trick), so the contested
 * places are the four points ON THE STREET and both starts reach them within 250 ms (measured
 * 150; `docs/MAP_3_DOLNA.md` §5.8); what each home has for free — the garage, the shed, the hall
 * on one side, the shell and the yard on the other — is evened by the side swap every three rounds.
 * The starts are 44.3 m of path apart, hidden from each other standing and crouching, and no cell
 * of the map sees both. `dolna.test.ts` re-derives all of that from the finished solids; the
 * design-table harness that produced the numbers is `apps/client/e2e/tools/dolna/measure.mts`.
 *
 * Cover speaks one language: 0.8 m = low, jump on it; 1.3 / 1.45–1.5 m = crouch behind it, cannot
 * be climbed from the ground (the mantle is 1.25 m); ≥ 2.0 m = full; ≥ 2.8 m = structures. The one
 * exception is deliberate: a car (1.45) beside a crate (0.8) is a staircase to 2.7 m, so nothing low
 * stands beside the cars, the van or the skips.
 *
 * Every route passage is ≥ 1.5 m clear (the walk grid is 0.5 m and the body 0.7 — a 1.2 m door has
 * no legal cell, which is how GÓRA lost a wing once). Thin walls straddle a half-metre in z or a
 * quarter-metre in x so the plan tool draws them. +X east (along the street), +Z north (into the
 * plot). Floor top y = 0. Metres.
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
/** A garden tree: a 1.4 m trunk with a low crown from 1.4 m — a blob that blocks the standing eye. */
function tree(name: string, cx: number, cz: number, crown = 2.4): void {
  add(S(cx - 0.3, 0, cz - 0.3, 0.6, 1.4, 0.6, "wood", `${name}_trunk`));
  add(S(cx - crown / 2, 1.4, cz - crown / 2, crown, 3.1, crown, "foliage", `${name}_crown`));
}

// ======================= EXTENTS =======================
const SX0 = -30, SX1 = 30;            // the street, 60 m
const ROAD0 = -6.7, ROAD1 = -1.5;     // the road, 5.2 m (soil, ruts); north verge 1.0 m to the fence line
const VERGE_S = -8.3;                 // far verge with the pines: 1.6 m; the construction mesh stands on its far edge
const FRONT = -0.5;                   // the front line (fence / hedge feet start here)
const PX0 = -11.8, PX1 = 11.8;        // the plot between the hedges (23.6 m)
const PZ1 = 42;                       // the north hedge line
const HX0 = -5, HX1 = 5, HZ0 = 5.3, HZ1 = 15.3;  // the house 10 × 10 (front yard 5.5 m from the fence)
const HH = 6.5;                       // house walls (two storeys)
const GX1 = 1.3, GZ1 = 12.1;          // garage bay interior: x -4.7..1.3, z 5.6..12.1 (6 × 6.5)
const SHX0 = -4, SHX1 = 4, SHZ0 = HZ1, SHZ1 = 19.6;   // the shed 8 × 4.3 × 2.8 under the balcony, on the house's north face
const HALLX0 = -10, HALLX1 = 2, HALLZ0 = 35, HALLZ1 = 42;   // the hall 12 × 7 × 4 (NW corner, 1.8 m slot to the west hedge)
const SITEX0 = -14, SITEX1 = 8, SITEZ0 = -24.6, SITEZ1 = VERGE_S; // the building site yard
const SHELLX0 = -8, SHELLX1 = 4, SHELLZ0 = SITEZ0, SHELLZ1 = -17.3; // the shell 12 × 7.3 × 2.8; its back wall is the map edge

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
// Front line: thuja hedge left of the house with a 1.5 m gap (DZIURA), then the 1.5 m wooden
// fence with the 1.5 m wicket (FURTKA) left of centre and the 3.2 m gate (BRAMA) on the right.
const GAP: Gap = [-11.5, -10.0];            // centred on one walk cell (x -10.25), in line with the west mesh gap
const WICKET: Gap = [-3.0, -1.5];
const GATE: Gap = [6.5, 9.7];
wallX("hedge_front_w", PX0, -6, FRONT, FRONT + 0.6, HEDGE, "foliage", [GAP], HEDGE);
wallX("fence_front", -6, PX1, FRONT, FRONT + 0.3, 1.5, "wood", [WICKET, GATE], 1.5);
// The neighbours along the street: thuja 3 m, nobody gets over.
add(S(SX0, 0, FRONT, PX0 - 0.6 - SX0, HEDGE, 0.6, "foliage", "hedge_nb_w"));
add(S(PX1 + 0.6, 0, FRONT, SX1 - PX1 - 0.6, HEDGE, 0.6, "foliage", "hedge_nb_e"));
// Street ends and the far side outside the site: invisible walls to 5 m (butting, never crossing).
add(S(SX0 - 0.5, 0, VERGE_S - 0.5, 0.5, 5, FRONT + 0.6 - VERGE_S + 0.5, "none", "wall_edge_w", true));
add(S(SX1, 0, VERGE_S - 0.5, 0.5, 5, FRONT + 0.6 - VERGE_S + 0.5, "none", "wall_edge_e", true));
add(S(SX0, 0, VERGE_S - 0.5, SITEX0 - SX0, 5, 0.5, "none", "wall_edge_s_w", true));
add(S(SITEX1, 0, VERGE_S - 0.5, SX1 - SITEX1, 5, 0.5, "none", "wall_edge_s_e", true));
// The building site: construction mesh 2.0 m with a 3.2 m gate and two 1.5 m gaps where panels
// are missing; an invisible band above each panel to 5 m so the mesh top is never a step.
const MESH_GAP_W: Gap = [-11.5, -10.0];     // in line with the plot's hedge gap: the WEST lane is one straight pass
const MESH_GATE: Gap = [-4.85, -1.65];
const MESH_GAP_E: Gap = [4.25, 5.75];
wallX("fence_site", SITEX0, SITEX1, VERGE_S - 0.3, VERGE_S, 2.0, "fence", [MESH_GAP_W, MESH_GATE, MESH_GAP_E], 2.0);
{
  let x = SITEX0; let i = 0;
  for (const [a, b] of [MESH_GAP_W, MESH_GATE, MESH_GAP_E, [SITEX1, SITEX1] as Gap]) { if (a > x) add(S(x, 2.0, VERGE_S - 0.3, a - x, 3.0, 0.3, "none", `wall_edge_site_top_${i++}`, true)); x = b; }
}
add(S(SITEX0 - 0.5, 0, SITEZ0, 0.5, 5, VERGE_S - 0.5 - SITEZ0, "none", "wall_edge_site_w", true));
add(S(SITEX1, 0, SITEZ0, 0.5, 5, VERGE_S - 0.5 - SITEZ0, "none", "wall_edge_site_e", true));
add(S(SITEX0 - 0.5, 0, SITEZ0 - 0.5, SITEX1 - SITEX0 + 1, 5, 0.5, "none", "wall_edge_site_s", true));

// ======================= THE HOUSE (closed, except the garage bay) =======================
add(S(GX1, 0, HZ0, HX1 - GX1, HH, HZ1 - HZ0, "paint_white", "house_main_e"));
add(S(HX0, 0, GZ1, GX1 - HX0, HH, HZ1 - GZ1, "paint_white", "house_main_n"));
const GARAGE_FRONT: Gap = [-3.95, -1.55];   // the left (recessed) gate, open, 2.4 m; the right one is closed
const GARAGE_BACK: Gap = [10.25, 11.75];    // 1.5 m door in the west wall to the west lane
wallZ("garage_wall_w", HZ0, GZ1, HX0, HX0 + 0.3, HH, "paint_white", [GARAGE_BACK]);
wallX("garage_wall_s", HX0 + 0.3, GX1, HZ0, HZ0 + 0.3, HH, "paint_white", [GARAGE_FRONT]);
// The hipped roof as two stepped plates (a pyramid silhouette; AABB has no slopes).
add(S(HX0 + 0.4, HH, HZ0 + 0.4, HX1 - HX0 - 0.8, 1.0, HZ1 - HZ0 - 0.8, "paint_red", "roof_house_1"));
add(S(HX0 + 2.0, HH + 1.0, HZ0 + 2.0, HX1 - HX0 - 4.0, 1.0, HZ1 - HZ0 - 4.0, "paint_red", "roof_house_2"));
// The car in the bay: crouch cover, leaves a 4 m aisle from the front gate to the back door.
add(O(-0.7, 0, 6.3, 1.8, 1.45, 4.4, "glass_car", "car", "garage_car"));

// ======================= THE SHED — BARBER (T0 start pocket, 2 doors: drive side, garden side) =======================
const SHED_W_DOOR: Gap = [16.25, 17.75];
const SHED_E_DOOR: Gap = [16.25, 17.75];
wallZ("shed_wall_w", SHZ0, SHZ1, SHX0, SHX0 + 0.3, 2.8, "wall_panel", [SHED_W_DOOR]);
wallZ("shed_wall_e", SHZ0, SHZ1, SHX1 - 0.3, SHX1, 2.8, "wall_panel", [SHED_E_DOOR]);
wallX("shed_wall_n", SHX0 + 0.3, SHX1 - 0.3, SHZ1 - 0.3, SHZ1, 2.8, "wall_panel");
add(S(SHX0 + 0.1, 2.5, SHZ0 + 0.1, SHX1 - SHX0 - 0.2, 0.25, SHZ1 - SHZ0 - 0.2, "wall_panel", "roof_shed"));
// Two chairs (crouch cover, collision the size of the drawn chair) and the counter (low), on the house wall.
for (const [x, tag] of [[-2.6, "1"], [-0.6, "2"]] as const) {
  add(S(x, 0.05, 15.5, 0.8, 0.45, 0.9, "none", `shed_chair_${tag}_seat`, true));
  add(S(x, 0.62, 15.5, 0.8, 0.83, 0.9, "none", `shed_chair_${tag}_back`, true));
  props.push({ kind: "barber_chair", x: x + 0.4, y: 0.55, z: 15.95, yaw: 0 });
}
add(S(1.5, 0, 15.5, 1.9, 0.8, 0.9, "counter", "shed_counter"));

// ======================= THE HALL — DETAILING (T0's back) =======================
const ROLLER: Gap = [-8, -4];                       // 4 m roller door, open, towards the house/garden
const HALL_SIDE_DOOR: Gap = [37.75, 39.25];         // 1.5 m side door in the west wall, towards the thujas
wallX("hall_wall_s", HALLX0, HALLX1, HALLZ0, HALLZ0 + 0.6, 4.0, "corrugated_blue", [ROLLER], 3.0);
wallZ("hall_wall_w", HALLZ0 + 0.6, HALLZ1 - 0.6, HALLX0, HALLX0 + 0.3, 4.0, "corrugated_blue", [HALL_SIDE_DOOR]);
wallZ("hall_wall_e", HALLZ0 + 0.6, HALLZ1 - 0.6, HALLX1 - 0.3, HALLX1, 4.0, "corrugated_blue");
wallX("hall_wall_n", HALLX0, HALLX1, HALLZ1 - 0.6, HALLZ1, 4.0, "corrugated_blue");
add(S(HALLX0 + 0.1, 3.7, HALLZ0 + 0.1, HALLX1 - HALLX0 - 0.2, 0.25, HALLZ1 - HALLZ0 - 0.2, "corrugated_blue", "roof_hall"));
// The car on the two-post lift: walk under it (2.0 m), nobody gets on it (0.25 m to the roof).
add(S(-7.6, 0, 38.2, 0.4, 2.0, 0.4, "metal", "hall_lift_post_w"));
add(S(-4.3, 0, 38.2, 0.4, 2.0, 0.4, "metal", "hall_lift_post_e"));
add(O(-8.0, 2.0, 37.5, 4.4, 1.45, 1.8, "glass_car", "car", "hall_car_raised"));
add(O(-9.5, 0, 40.8, 3.4, 2.0, 0.6, "metal", "lockers", "hall_cabinets"));
add(O(-0.4, 0, 40.2, 1.0, 0.8, 1.0, "metal", "drums", "hall_drums_1"));
add(O(0.7, 0, 40.2, 1.0, 0.8, 1.0, "metal", "drums", "hall_drums_2"));
add(S(-1.4, 0, 36.2, 1.0, 0.8, 1.0, "rubber", "hall_tyres_1"));
add(S(0.3, 0, 38.0, 1.0, 0.8, 1.0, "rubber", "hall_tyres_2"));

// ======================= THE GARDEN =======================
// [graft: fidelity, Z2] the 3–4 tall thujas left of the house as a N–S row from the front hedge to
// the house corner: the hedge gap opens into a pocket that leads only to the west lane, and the
// west half of the front yard no longer sees the street east. The thujas and shrubs right of the
// house (Z2) are a screen beside the house that leaves a 3.2 m passage along the east hedge.
add(S(-8.6, 0, FRONT + 0.6, 2.2, 6, HZ0 - FRONT - 0.6, "foliage", "thuja_front_w"));
add(S(5.0, 0, HZ0, 3.6, 6, 4.0, "foliage", "thuja_se"));
// The garden's few trees (Z3), crowns low enough to break the lanes and the lawn.
tree("tree_w", -10.1, 16, 3.4);   // crown touches the west hedge: the west lane is never one line from the hall to the site
tree("tree_e", 9.4, 16, 3.4);
tree("tree_mid", 0, 27);
tree("tree_n", 5, 33);
// [graft: fidelity] a shrub clump mid-garden west: cuts the west lane's 30 m line up to the hall.
add(S(-8.5, 0, 23, 3.5, 3.0, 3.0, "foliage", "shrub_w"));
// The thing under the dark tarp behind the house (Z2): a covered trailer, full cover mid-garden east.
add(O(5.2, 0, 26, 2.0, 2.0, 4.0, "glass_dark", "container", "trailer_tarp"));
// The green slide: tower 1.3 (cannot be climbed from the ground), ramp 0.8 (a step onto the tower).
add(S(7.8, 0, 36.0, 1.2, 1.3, 1.2, "paint_green", "slide_tower"));
add(S(5.4, 0, 36.2, 2.4, 0.8, 0.8, "paint_green", "slide_ramp"));

// ======================= THE STREET =======================
add(S(-16.2, 0, -1.65, 0.35, 8, 0.35, "concrete_block", "pole_w"));
add(S(13.85, 0, -1.65, 0.35, 8, 0.35, "concrete_block", "pole_e"));
for (const x of [-28, -25, -22, -19, -16, -8, -6, 2, 13.5, 16, 18.5, 21, 23.5, 26, 28.5]) {
  const tag = `${x < 0 ? "w" : "e"}${String(Math.abs(x)).replace(".", "_")}`;
  add(S(x - 0.3, 0, VERGE_S, 0.6, 6, 0.6, "wood", `pine_${tag}`));
  // The crown, high on the trunk: a pine reads as a pine from 30 m (the eye review saw a palisade
  // of bare posts without it). Above any jump, so it shapes no route and shelters nobody.
  add(S(x - 0.9, 4.6, VERGE_S - 0.6, 1.8, 3.0, 1.8, "foliage", `pine_crown_${tag}`));
}
// Off-axis street cover, every ~10 m: the skips, the van and one dark car in the SOUTH lane by the
// site (Z1), the other dark car in the NORTH lane at the east end (Z3's car by the plot). The van,
// the east skip and the west car sit at z ≤ -7.5, closing the sliver between them and the pine line
// so the walk grid never offers it; the crown of the road, z -5.5..-3.5, stays open for the one
// 60 m line. The first skip stands squarely in front of the west mesh gap with a 1.5 m slot behind
// it and the car closing that slot's west end: T1 leaves the gap sideways, east, and walks around
// the skip to reach the west of the street (the fairness knob for *street_w / *pole_w). The toi-toi
// stands beside the van (both ≥ 2.0 m, neither reachable from the ground; nothing ≤ 1.3 m within
// 4.42 m of either).
add(O(-17.6, 0, -7.5, 4.4, 1.45, 1.8, "glass_car", "car", "car_dark_2"));
add(O(-13.2, 0, -6.8, 2.0, 1.3, 2.0, "metal", "skip", "skip_1"));
add(O(-2.5, 0, -7.5, 5.0, 2.2, 2.0, "paint_white", "van", "van_white"));
add(S(3.0, 0, VERGE_S, 1.1, 2.3, 1.1, "paint_blue", "toitoi"));
add(O(9, 0, -7.5, 3.0, 1.3, 2.0, "metal", "skip", "skip_2"));
add(O(17, 0, -3.5, 4.4, 1.45, 1.8, "glass_car", "car", "car_dark"));

// ======================= THE SHELL — BUILDING SITE (T1 start pocket) =======================
const SHELL_DOOR_N: Gap = [-7.7, -6.2];      // west end of the north wall: off the axis of the site gate, so the street never sees the start
const SHELL_DOOR_E: Gap = [-22.25, -20.75];
const SHELL_DOOR_W: Gap = [-19.75, -18.25];  // north half of the west wall: its cone from the start lands on the mesh panel, not the west gap
wallX("shell_wall_n", SHELLX0, SHELLX1, SHELLZ1 - 0.3, SHELLZ1, 2.8, "paint_white", [SHELL_DOOR_N]);
wallZ("shell_wall_e", SHELLZ0 + 0.3, SHELLZ1 - 0.3, SHELLX1 - 0.3, SHELLX1, 2.8, "paint_white", [SHELL_DOOR_E]);
wallZ("shell_wall_w", SHELLZ0 + 0.3, SHELLZ1 - 0.3, SHELLX0, SHELLX0 + 0.3, 2.8, "paint_white", [SHELL_DOOR_W]);
wallX("shell_wall_s", SHELLX0 + 0.3, SHELLX1 - 0.3, SHELLZ0, SHELLZ0 + 0.3, 2.8, "paint_white");
add(S(-2.3, 0, SHELLZ0 + 0.3, 0.3, 2.8, 4.7, "paint_white", "shell_partition"));
add(O(1.0, 0, -23.5, 1.2, 0.8, 1.2, "wood", "pallets", "shell_pallets"));
add(O(2.2, 0, -19.0, 1.2, 1.3, 1.2, "metal", "machine", "shell_mixer"));
// The yard: a heap of sand (low) and a pallet of bricks (crouch).
add(S(-13, 0, -14, 2.0, 0.8, 2.0, "soil", "site_sand"));
add(O(5.5, 0, -13.5, 1.2, 1.3, 1.2, "wood", "pallets", "site_bricks"));

// ======================= PROPS (no collision) AND LIGHTS =======================
// The barber's shed: mirrors and a shelf on the house wall (its south side), the neon over them,
// a second neon on the drive-side face so the shop reads from the street's east lane.
props.push({ kind: "mirror", x: -2.2, y: 1.5, z: HZ1 + 0.02, yaw: 0, w: 1.0, h: 1.1 });
props.push({ kind: "mirror", x: -0.2, y: 1.5, z: HZ1 + 0.02, yaw: 0, w: 1.0, h: 1.1 });
props.push({ kind: "neon", x: -1.2, y: 2.35, z: HZ1 + 0.04, yaw: 0, text: "BARBER", w: 2.2, h: 0.42, color: "#fa709a" });
props.push({ kind: "shelf", x: 2.45, y: 0.95, z: HZ1 + 0.06, yaw: 0, w: 1.6 });
props.push({ kind: "bottle_row", x: 2.45, y: 0.98, z: HZ1 + 0.06, w: 1.2 });
props.push({ kind: "clippers", x: 2.9, y: 0.98, z: HZ1 + 0.1, yaw: 0.4 });
props.push({ kind: "towel_stack", x: 3.4, y: 0.8, z: 18.8 });
props.push({ kind: "neon", x: SHX1 + 0.02, y: 2.3, z: 18.6, yaw: Math.PI / 2, text: "BARBER SHOP", w: 2.0, h: 0.4, color: "#fa709a" });
props.push({ kind: "barber_pole", x: SHX1 + 0.05, y: 1.2, z: 15.8, yaw: Math.PI / 2 });
// A lamp over each shed door (the eye review found the west lawn behind the west door black) and a
// garden lamp post: the plot's back half was a black patch from above with eight lights on the map.
props.push({ kind: "lamp", x: SHX0 - 0.02, y: 2.3, z: 18.4, yaw: -Math.PI / 2, variant: "wall" });
props.push({ kind: "lamp", x: SHX1 + 0.02, y: 2.3, z: 18.4, yaw: Math.PI / 2, variant: "wall" });
props.push({ kind: "lamp", x: 3.5, y: 0, z: 24, variant: "post", h: 3.8 });
// Two dark panes on the van's long sides so it reads as a van, not a white block, at 28 m.
props.push({ kind: "board", x: 0, y: 1.3, z: -7.52, yaw: Math.PI, text: "", w: 2.4, h: 0.6 });
props.push({ kind: "board", x: 0, y: 1.3, z: -5.48, yaw: 0, text: "", w: 2.4, h: 0.6 });
// The house: the number plate by the right corner, the wall lamp between the upstairs windows,
// the windows and blinds as dark panes, the mailbox on the gate pillar.
props.push({ kind: "sign", x: 4.4, y: 2.5, z: HZ0 - 0.02, yaw: Math.PI, text: "17", w: 0.4, h: 0.3 });
props.push({ kind: "lamp", x: -0.2, y: 4.0, z: HZ0 - 0.02, yaw: Math.PI, variant: "wall" });
props.push({ kind: "board", x: -2.6, y: 4.2, z: HZ0 - 0.02, yaw: Math.PI, text: "", w: 1.2, h: 1.4 });
props.push({ kind: "board", x: 2.4, y: 4.2, z: HZ0 - 0.02, yaw: Math.PI, text: "", w: 1.2, h: 1.4 });
props.push({ kind: "sign", x: 6.4, y: 1.2, z: FRONT - 0.02, yaw: Math.PI, text: "17", w: 0.3, h: 0.35 });
props.push({ kind: "vent", x: -1.5, y: 8.52, z: 8.5, yaw: 0, w: 0.6, h: 0.9 });   // chimney stubs on the upper plate
props.push({ kind: "vent", x: 2.5, y: 8.52, z: 11.5, yaw: 0, w: 0.6, h: 0.9 });
// The hall: tube lights under the roof, a wall lamp over the roller door, a spare wheel, a hose.
props.push({ kind: "tube_light", x: -7, y: 3.6, z: 38.5, yaw: Math.PI / 2, w: 1.6 });
props.push({ kind: "tube_light", x: -1, y: 3.6, z: 38.5, yaw: Math.PI / 2, w: 1.6 });
props.push({ kind: "lamp", x: -6, y: 3.3, z: HALLZ0 - 0.02, yaw: Math.PI, variant: "wall" });
props.push({ kind: "wheel", x: 1.3, y: 0, z: 36.6, yaw: 0.3 });
props.push({ kind: "pipe", x: HALLX1 - 0.35, y: 0, z: 36.0, h: 3.6 });
props.push({ kind: "graffiti", x: -1.5, y: 1.6, z: HALLZ0 - 0.02, yaw: Math.PI, text: "DETAILING", w: 2.4, h: 0.8 });
// The street: the overhead line between the poles, a street lamp at the west end (the one in the
// photo, at the far crossing, brought to the map's edge), the work light on the building site.
props.push({ kind: "cable", x: -1.2, y: 7.8, z: -1.5, yaw: Math.PI / 2, w: 29.8 });
props.push({ kind: "lamp", x: -28.4, y: 0, z: -1.2, variant: "post", h: 6 });
props.push({ kind: "lamp", x: -3, y: 0, z: -12, variant: "post", h: 4.5 });
props.push({ kind: "graffiti", x: -2, y: 1.4, z: SHELLZ1 + 0.02, yaw: 0, text: "DOLNA", w: 2.2, h: 0.9 });
props.push({ kind: "poster", x: 2.98, y: 1.2, z: -7.75, yaw: -Math.PI / 2, variant: "1", w: 0.6, h: 0.85 });   // on the toi-toi
props.push({ kind: "trash", x: 4.6, y: 0, z: -7.4 });
// Lights: amber for the public front (house, shed, street lamp), mercury for work (hall, site),
// the accent only on the shop's neon. Three hues plus the moon, as the art direction asks.
// The three hues of `DISTRICT_LIGHTS` (`map.ts`), written out because `map.ts` imports this file
// to build `MAPS` — a value import back would be a cycle.
const AMBER = "#ffbf70", MERCURY = "#9adce5", ACCENT = "#fa709a";
lights.push({ kind: "point", x: -0.2, y: 4.0, z: HZ0 - 0.6, color: AMBER, intensity: 14, range: 12, priority: 7 });   // the house front
lights.push({ kind: "point", x: 0, y: 2.3, z: 17.5, color: AMBER, intensity: 12, range: 8, priority: 8 });             // inside the shed
lights.push({ kind: "point", x: SHX0 - 0.6, y: 2.3, z: 18.4, color: AMBER, intensity: 6, range: 7, priority: 6 });    // the shed's west door
lights.push({ kind: "point", x: SHX1 + 0.6, y: 2.3, z: 18.4, color: AMBER, intensity: 6, range: 7, priority: 6 });    // the shed's east door
lights.push({ kind: "point", x: 3.5, y: 3.6, z: 24, color: MERCURY, intensity: 10, range: 12, priority: 6 });         // the garden lamp
lights.push({ kind: "point", x: SHX1 + 0.6, y: 2.3, z: 18.6, color: ACCENT, intensity: 8, range: 6, priority: 6 });    // the neon
lights.push({ kind: "point", x: -4, y: 3.5, z: 38.5, color: MERCURY, intensity: 16, range: 12, priority: 8 });         // the hall
lights.push({ kind: "point", x: -6, y: 3.2, z: HALLZ0 - 0.8, color: MERCURY, intensity: 8, range: 8, priority: 5 });   // over the roller door
lights.push({ kind: "point", x: -28.4, y: 5.8, z: -1.2, color: AMBER, intensity: 16, range: 18, priority: 7 });        // the street lamp, west end
lights.push({ kind: "spot", x: -3, y: 4.4, z: -12, dx: 0.2, dy: -1, dz: 0.5, angle: 1.6, color: MERCURY, intensity: 18, range: 18, priority: 7 }); // the site's work light
lights.push({ kind: "point", x: 20, y: 4.5, z: -3, color: AMBER, intensity: 6, range: 10, priority: 4 });              // east end: a neighbour's porch glow

// ======================= SPAWNS =======================
const spawns: SpawnPoint[] = [
  // team 0 — THE PLOT. First = the duel start, inside the shed by the west (garden-side) door.
  { x: -3.4, y: 0, z: 17.0, yaw: -Math.PI / 2, team: 0 },
  { x: -7, y: 0, z: 28.5, yaw: Math.PI, team: 0 },
  { x: -2, y: 0, z: 23, yaw: Math.PI, team: 0 },
  { x: 3.5, y: 0, z: 22, yaw: Math.PI, team: 0 },
  { x: 9.5, y: 0, z: 31, yaw: Math.PI, team: 0 },
  { x: -1, y: 0, z: 39.8, yaw: Math.PI, team: 0 },
  // team 1 — THE BUILDING SITE. First = the duel start, the back corner of the shell's west room.
  { x: -7.0, y: 0, z: -23.6, yaw: 0, team: 1 },
  { x: -4, y: 0, z: -20, yaw: 0, team: 1 },
  { x: 0.5, y: 0, z: -21, yaw: 0, team: 1 },
  { x: 3.0, y: 0, z: -21.5, yaw: 0, team: 1 },
  { x: -11, y: 0, z: -19, yaw: 0, team: 1 },
  { x: 6.5, y: 0, z: -11.5, yaw: 0, team: 1 },
];

export const DOLNA: MapDef = {
  id: "dolna", name: "DOLNA",
  solids, props, lights, spawns,
  arenaSpawns: [
    { x: -27, y: 0, z: -4, yaw: Math.PI / 2, team: 0 }, { x: 27, y: 0, z: -6, yaw: -Math.PI / 2, team: 1 },
    { x: 10.5, y: 0, z: 12, yaw: Math.PI, team: 0 }, { x: -10.5, y: 0, z: 3.5, yaw: Math.PI, team: 1 },
    { x: -1.5, y: 0, z: 40.5, yaw: 0, team: 0 }, { x: 3, y: 0, z: -12.5, yaw: 0, team: 1 },
    { x: 3, y: 0, z: 30, yaw: Math.PI, team: 0 }, { x: -11, y: 0, z: -22, yaw: 0, team: 1 },
  ],
  stations: [{ x: -3, y: 0, z: 38, name: "HALA" }, { x: -25, y: 0, z: -6.5, name: "SOSNY" }, { x: 27, y: 0, z: -5, name: "ULICA" }],
  flags: [{ id: "A", name: "HALA", x: -6, y: 0, z: 36.5 }, { id: "B", name: "PODJAZD", x: 8.5, y: 0, z: 3 }, { id: "C", name: "BUDOWA", x: -9, y: 0, z: -12.5 }],
  sites: [{ id: "A", name: "HALA", x: -6, y: 0, z: 36.5 }, { id: "B", name: "BUDOWA", x: -9, y: 0, z: -12.5 }],
  huntSpawnMinM: 10,
  killY: -8,
  bounds: boxFrom(-32, -2, -26, 64, 20, 70),
};

/** Key places, timed from BOTH starts; a leading "*" marks a CONTESTED place (must be within 250 ms). */
export const DOLNA_PLACES: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  "*street_w": { x: -20, y: 0, z: -4.5 },
  "*street_mid": { x: 0, y: 0, z: -4 },
  "*street_e": { x: 16, y: 0, z: -4.5 },
  "*pole_w": { x: -16, y: 0, z: -2.6 },
  "gate": { x: 8.25, y: 0, z: -0.35 },
  "wicket": { x: -2.25, y: 0, z: -0.35 },
  "hedge_gap": { x: -10.75, y: 0, z: -0.2 },
  "garage_door": { x: -2.75, y: 0, z: 5.9 },
  "shed_w_door": { x: -4.5, y: 0, z: 17.0 },
  "hall_mouth": { x: -6, y: 0, z: 34.4 },
  "site_gate": { x: -3.25, y: 0, z: -8.9 },
  "site_gap_w": { x: -10.75, y: 0, z: -8.9 },
  "site_gap_e": { x: 5, y: 0, z: -8.9 },
  "toj": { x: 5.5, y: 0, z: -6.5 },
  "skips": { x: 10.5, y: 0, z: -4.3 },
  "car": { x: 19, y: 0, z: -4.5 },
  "street_w_end": { x: -27, y: 0, z: -4 },
  "street_e_end": { x: 27, y: 0, z: -6 },
  "other_start_T1": { x: -7.0, y: 0, z: -23.6 },
  "other_start_T0": { x: -3.4, y: 0, z: 17.0 },
};
/** Exits counted within 15 / 30 m of each start. */
export const DOLNA_EXITS: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  shed_w_door: { x: -4.5, y: 0, z: 17.0 },
  shed_e_door: { x: 4.5, y: 0, z: 17.0 },
  garage_back_door: { x: -5.4, y: 0, z: 11.0 },
  east_lane: { x: 9.5, y: 0, z: 12 },
  garden_n: { x: 0, y: 0, z: 22 },
  shell_door_n: { x: -6.95, y: 0, z: -16.9 },
  shell_door_e: { x: 4.4, y: 0, z: -21.5 },
  shell_door_w: { x: -8.4, y: 0, z: -19.0 },
  yard_e: { x: 6, y: 0, z: -15 },
  site_gate: { x: -3.25, y: 0, z: -8.9 },
};
/** Names of the ground panels (the climb chain's base) and of what must never be standable. */
export const DOLNA_GROUND = /^ground_/;
export const DOLNA_BOUNDARY = /^(hedge_|fence_|wall_edge|roof_)/;
/** Raw extents for the tools and tests that draw or measure the map rather than build it. */
export const DOLNA_EXTENTS: Readonly<Record<string, Box>> = {
  street: boxFrom(SX0, 0, ROAD0, SX1 - SX0, 0, ROAD1 - ROAD0),
  site: boxFrom(SITEX0, 0, SITEZ0, SITEX1 - SITEX0, 0, SITEZ1 - SITEZ0),
  shell: boxFrom(SHELLX0, 0, SHELLZ0, SHELLX1 - SHELLX0, 2.8, SHELLZ1 - SHELLZ0),
  front: boxFrom(PX0, 0, FRONT, PX1 - PX0, 0, HZ0 - FRONT),
  house: boxFrom(HX0, 0, HZ0, HX1 - HX0, HH, HZ1 - HZ0),
  shed: boxFrom(SHX0, 0, SHZ0, SHX1 - SHX0, 2.8, SHZ1 - SHZ0),
  garden: boxFrom(PX0, 0, SHZ1, PX1 - PX0, 0, PZ1 - SHZ1),
  hall: boxFrom(HALLX0, 0, HALLZ0, HALLX1 - HALLX0, 4, HALLZ1 - HALLZ0),
};
