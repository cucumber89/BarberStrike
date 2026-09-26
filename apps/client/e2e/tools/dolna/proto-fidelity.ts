/**
 * proto-fidelity — DOLNA prototype, school "Wierny miejscu" (faithful to the place).
 *
 * The plot (24 × 40 m, x −12..12, z 0..40) sits NORTH of the street; the street runs along X
 * (z −7..0 road + plot-side verge, z −9.5..−7 the far verge with the pines); the building site
 * with its ground-floor shell is opposite the plot (x −6..14, z −23..−9.5). Coordinates in
 * metres, +X east, +Z north, floor top at y = 0. Every person-door is 1.2 m wide and centred on
 * a 0.5 m walk-grid cell (k + 0.25) so the sprinting mover fits through it.
 *
 * Fight carved out of the reality: the house garage is a through-route (front door open, side
 * door to the east passage), the black barber shed under the balcony has a west and an east
 * door (a corridor, not a room), the corrugated hall has its roller door open to the garden and
 * a side door east, the front fence has the wicket, the gate and a 1.2 m gap by the thujas.
 * The street is broken for standing eyes by four full-height things that belong there — the
 * neighbour's trailer under a tarp (north lane), the site's steel container and site office
 * (south side), the white van (south lane) — so only the strip along the plot fence sees the
 * whole 60 m.
 */
import { boxFrom } from "../../../../../packages/shared/src/collision";
import type { MapDef, MaterialTag, Solid, SolidLook, SpawnPoint } from "../../../../../packages/shared/src/map";

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

const solids: Solid[] = [];
const add = (...s: Solid[]) => solids.push(...s);
const HEDGE = 4;   // thujas 3–4 m in the photos; 4 so nothing 2.0 m parked beside them makes them a step

// ---------- Ground: non-overlapping panels laid up to walls ----------
add(S(-30, -1, -7, 60, 1, 7, "soil", "ground_street"));          // road 5.5 m (z −7..−1.5) + plot-side verge (−1.5..0)
add(S(-30, -1, -9.5, 60, 1, 2.5, "soil", "ground_verge_s"));     // far verge with the pines
add(S(-6, -1, -23, 20, 1, 13.5, "soil", "ground_site"));         // building-site yard z −23..−9.5
add(S(-12, -1, 0, 12, 1, 6, "soil", "ground_front_w"));          // front garden west of the drive
add(S(0, -1, 0, 4.5, 1, 6, "floor_concrete", "ground_drive"));   // concrete drive gate → garage
add(S(4.5, -1, 0, 7.5, 1, 6, "soil", "ground_front_e"));
add(S(-12, -1, 6, 24, 1, 34, "soil", "ground_plot"));            // lawn, passages, under the house / shed / hall

// ---------- Boundary ----------
add(S(-12.3, 0, 0, 0.3, HEDGE, 40, "foliage", "hedge_west"));        // neighbour 19's thujas
add(S(12, 0, 0, 0.3, HEDGE, 40, "foliage", "hedge_east"));
add(S(-12.3, 0, 40, 24.6, HEDGE, 0.3, "foliage", "hedge_north"));
add(S(-30, 0, 0, 17.7, HEDGE, 0.3, "foliage", "hedge_street_w"));    // neighbours' hedges along the street
add(S(12.3, 0, 0, 17.7, HEDGE, 0.3, "foliage", "hedge_street_e"));
add(S(-30.3, 0, -9.8, 0.3, 5, 10.1, "none", "wall_edge_w", true));   // the street goes on: invisible ends
add(S(30, 0, -9.8, 0.3, 5, 10.1, "none", "wall_edge_e", true));
add(S(-30, 0, -9.8, 23.4, 5, 0.3, "none", "wall_edge_s_w", true));   // behind the pines, x −30..−6.6
add(S(14.6, 0, -9.8, 15.4, 5, 0.3, "none", "wall_edge_s_e", true));  // x 14.6..30
add(S(-6.3, 0, -23, 0.3, 2, 13.5, "wood", "fence_site_w"));          // wooden site hoarding (opaque, honest)
add(S(14, 0, -23, 0.3, 2, 13.5, "wood", "fence_site_e"));
add(S(-6.3, 0, -23.3, 20.6, 2, 0.3, "fence", "fence_site_s"));       // construction mesh at the back (map edge only)
add(S(-6.3, 2, -23, 0.3, 3, 13.5, "none", "wall_edge_site_w", true)); // sit ON the fences: their tops have no room
add(S(14, 2, -23, 0.3, 3, 13.5, "none", "wall_edge_site_e", true));
add(S(-6.3, 2, -23.3, 20.6, 3, 0.3, "none", "wall_edge_site_s", true));
add(S(-6.6, 0, -9.8, 0.3, 5, 0.3, "none", "wall_edge_s_wc", true));   // the two corner stubs x −6.6..−6.3 / 14.3..14.6
add(S(14.3, 0, -9.8, 0.3, 5, 0.3, "none", "wall_edge_s_ec", true));

// ---------- Front fence: 1.5 m wood slats; hedge gap 1.2 | wicket 1.2 | gate 3.2 ----------
add(S(-10.3, 0, 0, 6.45, 1.5, 0.15, "wood", "fence_front_w"));    // x −10.3..−3.85 (gap by the thujas x −12..−10.3, 1.7 m)
add(S(-2.65, 0, 0, 3.65, 1.5, 0.15, "wood", "fence_front_m"));    // wicket x −3.85..−2.65
add(S(4.2, 0, 0, 7.8, 1.5, 0.15, "wood", "fence_front_e"));       // gate x 1.0..4.2
add(S(-8.5, 0, 1.4, 2.2, 3, 4.4, "foliage", "hedge_thuja_front")); // the 3–4 tall thujas left of the house, a N–S row
add(S(8, 0, 7, 4, 3, 4, "foliage", "hedge_thuja_east"));           // thujas and shrubs right of the house

// ---------- The house 10 × 10.5 (x −6..4, z 6..16.5), closed but for the garage bay ----------
add(S(-6, 0, 6, 4, 6.5, 10.5, "wall_plaster", "house_main"));
add(S(-2, 0, 12.3, 6, 6.5, 4.2, "wall_plaster", "house_back"));
add(S(-2, 0, 6, 2.2, 6.5, 0.3, "wall_plaster", "garage_front_w")); // the recessed (closed) left door reads as wall
add(S(2.6, 0, 6, 1.4, 6.5, 0.3, "wall_plaster", "garage_front_e"));
add(S(0.15, 2.2, 6, 2.5, 4.3, 0.3, "wall_plaster", "garage_lintel_front")); // open door x 0.2..2.6
add(S(3.7, 0, 6.3, 0.3, 6.5, 4.35, "wall_plaster", "garage_east_s"));       // z 6.3..10.65
add(S(3.7, 0, 11.85, 0.3, 6.5, 0.45, "wall_plaster", "garage_east_n"));     // side door z 10.65..11.85
add(S(3.7, 2.2, 10.6, 0.3, 4.3, 1.3, "wall_plaster", "garage_lintel_side"));
add(S(-6, 6.5, 6, 10, 2, 10.5, "wall_brick", "roof_house"));
add(O(-2, 0, 9, 0.6, 2.0, 1.8, "metal", "lockers", "garage_lockers"));       // full cover, the garage corner
add(O(2.7, 0, 6.3, 1.0, 0.8, 1.0, "wood", "crate", "garage_crate"));

// ---------- The black barber shed 8 × 4 × 2.8 under the balcony (garden face) ----------
add(S(-6, 0, 16.5, 0.15, 2.8, 0.65, "wall_panel", "shed_w_s"));   // west door z 17.15..18.35
add(S(-6, 0, 18.35, 0.15, 2.8, 2.0, "wall_panel", "shed_w_n"));
add(S(-6, 2.2, 17.1, 0.15, 0.6, 1.3, "wall_panel", "shed_lintel_w"));
add(S(1.85, 0, 16.5, 0.15, 2.8, 1.65, "wall_panel", "shed_e_s")); // east door z 18.15..19.35
add(S(1.85, 0, 19.35, 0.15, 2.8, 1.0, "wall_panel", "shed_e_n"));
add(S(1.85, 2.2, 18.1, 0.15, 0.6, 1.3, "wall_panel", "shed_lintel_e"));
add(S(-6, 0, 20.35, 8, 2.8, 0.15, "wall_panel", "shed_n"));
add(S(-6, 2.8, 16.5, 8, 0.2, 4, "wall_panel", "roof_shed"));
add(O(-1.6, 0, 16.65, 2.4, 0.9, 0.6, "counter", "kiosk_counter", "shed_counter"));
add(S(-4.4, 0, 18.5, 0.8, 1.45, 0.9, "leather", "shed_chair_a"));
add(S(-1.0, 0, 18.5, 0.8, 1.45, 0.9, "leather", "shed_chair_b"));

// ---------- The corrugated detailing hall 12 × 7 × 4 in the back west corner ----------
add(S(-12, 0, 33, 0.15, 4, 7, "corrugated_blue", "hall_w"));
add(S(-11.85, 0, 39.85, 11.85, 4, 0.15, "corrugated_blue", "hall_n"));
add(S(-0.15, 0, 33, 0.15, 4, 1.15, "corrugated_blue", "hall_e_s"));     // side door z 34.15..35.35
add(S(-0.15, 0, 35.35, 0.15, 4, 4.5, "corrugated_blue", "hall_e_n"));
add(S(-0.15, 2.2, 34.1, 0.15, 1.8, 1.3, "corrugated_blue", "hall_lintel_e"));
add(S(-11.85, 0, 33, 3.85, 4, 0.15, "corrugated_blue", "hall_s_w"));    // roller door x −8..−4, open
add(S(-4, 0, 33, 3.85, 4, 0.15, "corrugated_blue", "hall_s_e"));
add(S(-8.05, 3.0, 33, 4.1, 1.0, 0.15, "corrugated_blue", "hall_lintel_roller"));
add(S(-12, 4, 33, 12, 0.3, 7, "corrugated_blue", "roof_hall"));
add(S(-7.2, 0, 35.2, 0.4, 3.5, 0.4, "metal", "hall_lift_post_a"));
add(S(-7.2, 0, 37.0, 0.4, 3.5, 0.4, "metal", "hall_lift_post_b"));
add(O(-9.2, 1.25, 35.5, 4.4, 1.45, 1.8, "paint_red", "car", "hall_car_raised")); // top 2.7: roof (4.0) out of mantle reach
add(O(-11.85, 0, 34, 0.6, 2.0, 3.6, "metal", "cabinet", "hall_cabinets"));
add(O(-3.2, 0, 38.2, 1.6, 0.9, 0.8, "metal", "drums", "hall_drums"));
add(O(-3.4, 0, 33.4, 1.2, 0.8, 1.2, "rubber", "pallets", "hall_tyres"));

// ---------- The garden ----------
add(O(9, 0, 27, 1.2, 0.8, 1.0, "paint_green", "crate", "slide_base"));
add(S(10.2, 0, 27, 1.0, 1.3, 1.0, "paint_green", "slide_top"));
add(S(-8.25, 0, 27.75, 0.5, 5, 0.5, "wood", "tree_garden_a"));
add(S(5.5, 0, 33.5, 0.5, 5, 0.5, "wood", "tree_garden_b"));
add(S(-3.75, 0, 28.25, 0.5, 5, 0.5, "wood", "tree_garden_c"));
add(S(-9.4, 0, 22, 3.4, 3, 3, "foliage", "hedge_garden_mid"));          // a lilac clump mid-garden west
add(S(-12, 0, 12, 2.6, 2.0, 3, "wood", "woodshed"));                      // log store against the west hedge
add(S(4, 0, 19, 2.2, 2.0, 4.5, "wall_panel", "trailer_tarp_garden"));   // the trailer under a dark tarp, east passage
add(S(4, 0, 6.5, 2.5, 3, 3, "foliage", "hedge_shrub_se"));                // shrubs at the house's SE corner: the east passage starts as a 1.5 m slot
add(S(7, 0, 30, 5, 3, 3, "foliage", "hedge_garden_e"));
add(S(0, 0, 27, 3, 3, 2.5, "foliage", "hedge_garden_c"));
add(O(-8, 0, 28.5, 4.4, 1.45, 1.8, "glass_dark", "car", "car_detail"));  // a customer's car waiting in front of the hall

// ---------- The street ----------
add(S(-9.2, 0, -1.5, 0.35, 8, 0.35, "concrete_block", "pole_a"));   // utility poles at the plot-side road edge
add(S(13.8, 0, -1.5, 0.35, 8, 0.35, "concrete_block", "pole_b"));
add(S(-19, 0, -4.4, 4.5, 2.0, 2.2, "wall_panel", "trailer_tarp_street")); // neighbour's trailer under a tarp, north lane
add(O(4, 0, -7, 4.4, 1.45, 1.8, "glass_dark", "car", "car_street"));               // the dark car, south lane
add(O(-6, 0, -7.4, 8, 3.2, 2.5, "paint_white", "truck", "truck_delivery"));        // delivery truck for the site, south lane
add(O(16.5, 0, -9.5, 6, 2.8, 3, "paint_white", "portacabin", "site_office"));       // site office on the far verge
add(S(15.2, 0, -9.5, 1.1, 2.3, 1.1, "paint_blue", "toitoi"));
add(O(24, 0, -7.2, 5.5, 2.0, 2.2, "paint_white", "van", "van_street"));  // the white van, south lane
add(O(3.5, 0, -11.5, 3, 1.3, 2, "metal", "skip", "skip_a"));               // skips in the site mouth
add(O(7, 0, -11.5, 3, 1.3, 2, "metal", "skip", "skip_b"));
for (const x of [-27, -21, -14, -7, 1.5, 8, 14, 24.5, 28]) add(S(x - 0.3, 0, -9.5, 0.6, 6, 0.6, "wood", `pine_${x < 0 ? "w" : "e"}${Math.abs(x).toString().replace(".", "_")}`));

// ---------- The building site: ground-floor shell 12 × 9 (x −2..10, z −21..−12), walls 2.8 ----------
add(S(-2, 0, -21, 12, 2.8, 0.3, "wall_concrete", "site_wall_s"));
add(S(-2, 0, -20.7, 0.3, 2.8, 3.1, "wall_concrete", "site_wall_w_s"));      // window opening z −17.6..−16.4
add(S(-2, 0, -16.4, 0.3, 2.8, 4.4, "wall_concrete", "site_wall_w_n"));
add(S(-2, 2.2, -17.65, 0.3, 0.6, 1.3, "wall_concrete", "site_lintel_w"));
add(S(9.7, 0, -20.7, 0.3, 2.8, 5.1, "wall_concrete", "site_wall_e_s"));     // window opening z −15.6..−14.4
add(S(9.7, 0, -14.4, 0.3, 2.8, 2.4, "wall_concrete", "site_wall_e_n"));
add(S(9.7, 2.2, -15.65, 0.3, 0.6, 1.3, "wall_concrete", "site_lintel_e"));
add(S(-1.7, 0, -12.3, 0.7, 2.8, 0.3, "wall_concrete", "site_wall_n_w"));    // door x −1..1
add(S(1, 0, -12.3, 8.7, 2.8, 0.3, "wall_concrete", "site_wall_n_e"));
add(S(-1.05, 2.2, -12.3, 2.1, 0.6, 0.3, "wall_concrete", "site_lintel_n"));
add(S(3.85, 0, -20.7, 0.3, 2.8, 5.0, "wall_concrete", "site_partition"));   // two rooms, joined at the north
add(O(6, 0, -13.8, 1.2, 0.8, 1.2, "wood", "pallets", "site_pallets"));
add(O(-5, 0, -15, 1.2, 0.8, 1.2, "wood", "pallets", "yard_pallets"));
add(S(10.5, 0, -20, 3, 1.3, 3, "soil", "sand_heap"));                       // heap of sand, east strip
add(S(11, 0, -14.5, 1.5, 1.3, 1.2, "concrete_block", "block_stack"));

const spawns: SpawnPoint[] = [
  // team 0 — the plot (barber's side); FIRST = duel start, inside the shed
  { x: -1.25, y: 0, z: 17.75, yaw: Math.PI / 2, team: 0 },
  { x: -1.25, y: 0, z: 37.75, yaw: Math.PI, team: 0 },
  { x: -9.75, y: 0, z: 38.25, yaw: Math.PI, team: 0 },
  { x: -3.25, y: 0, z: 22.25, yaw: 0, team: 0 },
  { x: -10.75, y: 0, z: 20.25, yaw: 0, team: 0 },
  { x: 2.25, y: 0, z: 22.25, yaw: 0, team: 0 },
  { x: 8.25, y: 0, z: 36.25, yaw: Math.PI, team: 0 },
  // team 1 — the street / building site; FIRST = duel start, east room of the shell
  { x: 7.25, y: 0, z: -18.75, yaw: 0, team: 1 },
  { x: 1.75, y: 0, z: -18.75, yaw: 0, team: 1 },
  { x: -4.25, y: 0, z: -20.25, yaw: 0, team: 1 },
  { x: 12.75, y: 0, z: -15.75, yaw: 0, team: 1 },
  { x: 5.25, y: 0, z: -22.25, yaw: 0, team: 1 },
  { x: -4.25, y: 0, z: -12.25, yaw: 0, team: 1 },
];

export const MAP: MapDef = {
  id: "dolna", name: "DOLNA",
  solids, props: [], lights: [], spawns,
  arenaSpawns: [
    { x: -24.25, y: 0, z: -3.75, yaw: Math.PI / 2, team: 0 }, { x: 26.25, y: 0, z: -3.75, yaw: -Math.PI / 2, team: 1 },
    { x: -8.25, y: 0, z: 10.25, yaw: 0, team: 0 }, { x: 8.25, y: 0, z: 26.25, yaw: Math.PI, team: 1 },
    { x: 2.25, y: 0, z: -22.25, yaw: 0, team: 0 }, { x: -9.25, y: 0, z: 37.75, yaw: Math.PI, team: 1 },
  ],
  stations: [{ x: -1.25, y: 0, z: 36.25, name: "HALA" }, { x: -26.25, y: 0, z: -3.75, name: "ULICA" }, { x: 12.25, y: 0, z: -11.25, name: "BUDOWA" }],
  flags: [{ id: "A", name: "HALA", x: -6, y: 0, z: 34.25 }, { id: "B", name: "PODJAZD", x: 2.25, y: 0, z: 3.25 }, { id: "C", name: "BUDOWA", x: 5.25, y: 0, z: -14.25 }],
  sites: [{ id: "A", name: "HALA", x: -6, y: 0, z: 34.25 }, { id: "B", name: "BUDOWA", x: 5.25, y: 0, z: -14.25 }],
  huntSpawnMinM: 10,
  killY: -8,
  bounds: boxFrom(-30.5, -2, -24, 61, 22, 65),
};

/** Key places, timed from BOTH starts; "*" = contested (must be within 250 ms). */
export const PLACES = {
  "*gate": { x: 2.75, y: 0, z: 0.75 },
  "*wicket": { x: -3.25, y: 0, z: 0.75 },
  "*street_at_gap": { x: -11.25, y: 0, z: -2.25 },
  "*street_west_end": { x: -27.25, y: 0, z: -1.75 },
  "street_west": { x: -15.25, y: 0, z: -5.75 },
  "hedge_gap": { x: -11.25, y: 0, z: 0.75 },
  "garage_bay": { x: 0.75, y: 0, z: 9.25 },
  "garage_front_door": { x: 1.25, y: 0, z: 5.25 },
  "west_passage": { x: -8.75, y: 0, z: 10.25 },
  "shed_door_e": { x: 2.75, y: 0, z: 18.75 },
  "hall_mouth": { x: -6.25, y: 0, z: 32.25 },
  "street_at_gate": { x: 2.75, y: 0, z: -3.75 },
  "street_east_end": { x: 27.25, y: 0, z: -3.75 },
  "site_door": { x: 0.25, y: 0, z: -11.25 },
  "van": { x: 22.75, y: 0, z: -5.25 },
  "the_other_start": { x: 7.25, y: 0, z: -18.75 },
};
/** Exits counted within 15 / 30 m of each start. */
export const EXITS = {
  shed_door_w: { x: -6.75, y: 0, z: 17.75 },
  shed_door_e: { x: 2.75, y: 0, z: 18.75 },
  garage_side_door: { x: 4.75, y: 0, z: 11.25 },
  garden_west: { x: -8.25, y: 0, z: 20.75 },
  garden_north: { x: -1.25, y: 0, z: 24.25 },
  site_door_n: { x: 0.25, y: 0, z: -11.25 },
  site_window_w: { x: -2.75, y: 0, z: -16.75 },
  site_window_e: { x: 10.75, y: 0, z: -15.25 },
  yard_south: { x: 5.25, y: 0, z: -22.25 },
};
export const GROUND = /^ground_/;
export const BOUNDARY = /^(hedge_|fence_site|fence_street|wall_edge)/;
