/**
 * DOLNA 17 — the third map, v2: the owner's plot as he drew it (plan of 2026-09-27), built for
 * EVERY mode ("ogólnodostępna"), not only the 1 v 1.
 *
 * WHAT THE DRAWING FIXES (mandatory, in his words): a hedged plot with the dirt road along its
 * SOUTH edge; the HOUSE — three storeys, a small annex ("dobudówka") off its NE corner, a balcony
 * on the garden face upstairs and a balcony on the east face on the top floor; the black BARBER
 * SHED just east of the house (mirror wall with the barber table and three seats, a TV in the
 * NW corner, a couch along the north wall, a bathroom in the SW corner, the wash basin on the
 * south wall, two windows east, the door in the SE corner); the grey DETAILING GARAGE in the SE
 * corner on the road, two roller gates to the road, a door to the garden and the pool, two cars
 * inside and the spawn in its NE corner; the POOL in the NE of the garden; the dark grey-blue
 * BMW on the road in front of the house; the second spawn in the SE room of the 2nd floor. The
 * room plans of all three storeys (salon, kuchnia, sypialnia, łazienka, schody, kotłownia,
 * garaż, dobudówka; upstairs salon with the balcony, kuchnia, sypialnia, łazienka; top floor
 * rooms around the stairs, the east balcony, the spawn room) are his; the doors, which he did not
 * draw, are ours.
 *
 * WHAT WE ADDED, AND WHY. (1) A second door in the shed (north, to the pool) — one door makes a
 * dead-end pocket, and a pocket with one mouth is a grenade trap in every mode. (2) The wooden
 * front fence with a wicket in front of the front door and a gate in front of the house's own
 * garage (the owner's photos have that fence; the drawing stops at the road) — three ways in from
 * the road beside the two garage gates. (3) A garden door from the salon and from the kitchen, an
 * outer door from the annex and from the house garage — so no room is a dead end and the house
 * is a loop, not a tree. (4) A 2.8 m partition in the garage around the spawn pocket, so the
 * pocket is hidden from both gates and the north door (measured in `dolna.test.ts`). (5) Trees
 * and shrubs in the garden that break the long lines between the house and the pool.
 *
 * CONSTRUCTION. Storey pitch 3.5 m: 3.25 m of wall, then a 0.25 m slab that lies ON the walls and
 * carries the next storey's walls (a sandwich of butting faces, never an interpenetration — the
 * floor audit wants zero coplanar faces). The slab is split into non-overlapping panels only
 * around the stair well. Stairs are a switchback: four treads of 0.5 × 0.35 m, a landing, four
 * more, a 0.25 m threshold wall whose top IS the upper floor — 0.35 m risers, so a bot's 0.4 m
 * step climbs them, and 0.5 m treads so every walk-grid cell sits on its own riser (0.4 m treads
 * put a 0.7 m step in the grid). The flight above hangs (0.35 m thick treads, each 5 cm over the
 * previous one, so the audit sees it resting) and leaves 0.8 m of headroom over the flight
 * below. Every door is 1.5 m wide and 2.2 m high with a band above; the walk grid is 0.5 m and
 * the body 0.7, and a narrower door has no legal cell (how GÓRA lost a wing once). Balconies
 * carry a 1.35 m parapet: crouching hides you, standing shows your head, and nobody mantles
 * 1.35 (the mantle is 1.25) — the roofs beside them stay roofs, which `dolna.test.ts` proves with
 * a wall-aware climb chain, since a naive chain "hops" through walls on a house.
 *
 * COVER speaks one language: 0.6–0.8 low (jump on it), 1.3 / 1.45 crouch (cannot be climbed from
 * the ground), ≥ 2.0 full, ≥ 2.8 structure. Nothing low stands beside a 2.0 m piece, or the low
 * piece is a step onto it. Thin walls take the plan tool's rows: a wall along X occupies
 * z ∈ [n+0.5, n+0.75], a wall along Z occupies x ∈ [n, n+0.25] or [n+0.5, n+0.75].
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

/**
 * A wall along X (z0..z1 thick) from x0 to x1, `h` tall from `y0`, with door openings [a, b] cut
 * from the floor to `lintel`; the band above the lintel spans the whole wall, so it sits on the
 * jambs and nothing floats. A wall whose lintel is its full height gets no band (a fence).
 */
function wallX(name: string, x0: number, x1: number, z0: number, z1: number, h: number, mat: MaterialTag, gaps: Gap[] = [], lintel = 2.2, y0 = 0): void {
  if (!gaps.length) { add(S(x0, y0, z0, x1 - x0, h, z1 - z0, mat, name)); return; }
  const top = Math.min(lintel, h);
  let x = x0; let i = 0;
  for (const [a, b] of gaps) { if (a > x) add(S(x, y0, z0, a - x, top, z1 - z0, mat, `${name}_j${i++}`)); x = b; }
  if (x < x1) add(S(x, y0, z0, x1 - x, top, z1 - z0, mat, `${name}_j${i++}`));
  if (h > top) add(S(x0, y0 + top, z0, x1 - x0, h - top, z1 - z0, mat, `${name}_band`));
}
/** The same wall along Z (x0..x1 thick), gaps in z. */
function wallZ(name: string, z0: number, z1: number, x0: number, x1: number, h: number, mat: MaterialTag, gaps: Gap[] = [], lintel = 2.2, y0 = 0): void {
  if (!gaps.length) { add(S(x0, y0, z0, x1 - x0, h, z1 - z0, mat, name)); return; }
  const top = Math.min(lintel, h);
  let z = z0; let i = 0;
  for (const [a, b] of gaps) { if (a > z) add(S(x0, y0, z, x1 - x0, top, a - z, mat, `${name}_j${i++}`)); z = b; }
  if (z < z1) add(S(x0, y0, z, x1 - x0, top, z1 - z, mat, `${name}_j${i++}`));
  if (h > top) add(S(x0, y0 + top, z0, x1 - x0, h - top, z1 - z0, mat, `${name}_band`));
}
/**
 * A garden pine: a 6 m trunk (partial cover, never a step) with its crown from 6 to 9.5 m — above
 * the top floor's furniture plus a mantle, so no chain of hops, naive or real, ends on a crown and
 * steps from it onto a hedge. Lines at eye level are broken by shrubs and thuja blocks instead.
 */
function tree(name: string, cx: number, cz: number, crown = 3.0): void {
  add(S(cx - 0.25, 0, cz - 0.25, 0.5, 6.0, 0.5, "wood", `${name}_trunk`));
  add(S(cx - crown / 2, 6.0, cz - crown / 2, crown, 3.5, crown, "foliage", `${name}_crown`));
}
/** A dark window pane, 5 cm thick, 1 cm into the wall (so the audit sees it held) and 4 cm proud of it. */
function pane(name: string, x0: number, x1: number, z0: number, z1: number, y: number, h = 1.4): void {
  add(S(x0, y, z0, x1 - x0, h, z1 - z0, "glass_dark", name));
}

// ======================= EXTENTS =======================
const WT = 0.25;                       // wall thickness
const ST = 3.5, WH = 3.25, SLAB = 0.25; // storey pitch = wall + slab
const Y = (s: number) => s * ST;       // floor top of storey s
const RISE = 0.35, TREAD = 0.5;
const PX0 = -20.5, PX1 = 20.5;         // the plot between the hedges (41 m)
const PZ0 = 0.5, PZ1 = 26.5;           // fence line … north hedge (26 m)
const ROAD0 = -4.5, VERGE0 = -6;       // the road 5 m, the far verge 1.5 m
const HEDGE = 3.0, HW = 0.6;           // hedge height / thickness
const HX0 = -15, HX1 = -2.75, HZ0 = 4.5, HZ1 = 16.75;   // the house 12.25 × 12.25
const AX0 = -7, AZ1 = 19.75;           // the annex: x AX0..HX1, z HZ1..AZ1
const SHX0 = 1, SHX1 = 6.25, SHZ0 = 6.5, SHZ1 = 14.75;  // the shed 5.25 × 8.25 × 2.8
const GX0 = 11, GX1 = 20.25, GZ0 = PZ0, GZ1 = 13.75;    // the detailing garage 9.25 × 13.25 × 4
const GH = 4.0;
const POOL = { x0: 6.5, x1: 11.5, z0: 21, z1: 25 };      // the basin (interior)
const DECK = { x0: 5, x1: 13, z0: 19.5, z1: PZ1 };
const EXT: MaterialTag = "paint_white";                  // the house render: white plaster
const INT: MaterialTag = "wall_plaster";

// ======================= GROUND (non-overlapping panels; the outermost run under the hedges) =======================
add(S(-21.7, -1, ROAD0, 43.4, 1, PZ0 - ROAD0, "soil", "ground_road"));
add(S(-21.7, -1, VERGE0, 43.4, 1, ROAD0 - VERGE0, "soil", "ground_verge"));
add(S(-21.1, -1, PZ0, 13.1, 1, HZ0 - PZ0, "soil", "ground_front_w"));
add(S(-8, -1, PZ0, 4, 1, HZ0 - PZ0, "floor_concrete", "ground_drive"));
add(S(-4, -1, PZ0, GX0 + 4, 1, HZ0 - PZ0, "soil", "ground_front_e"));
add(S(GX0, -1, GZ0, GX1 - GX0, 1, GZ1 - GZ0, "floor_concrete", "ground_garage"));
add(S(GX1, -1, GZ0, 21.1 - GX1, 1, GZ1 - GZ0, "soil", "ground_east_strip"));
add(S(-21.1, -1, HZ0, HX0 + 21.1, 1, 27.1 - HZ0, "soil", "ground_lawn_w"));
add(S(HX0, -1, HZ0, 6, 1, HZ1 - HZ0, "floor_wood", "ground_house_w"));
add(S(-9, -1, HZ0, 9 + HX1, 1, 8.75 - HZ0, "floor_concrete", "ground_house_garage"));
add(S(-9, -1, 8.75, 9 + HX1, 1, HZ1 - 8.75, "floor_wood", "ground_house_e"));
add(S(AX0, -1, HZ1, HX1 - AX0, 1, AZ1 - HZ1, "floor_wood", "ground_annex"));
add(S(HX0, -1, HZ1, AX0 - HX0, 1, 27.1 - HZ1, "soil", "ground_lawn_n1"));
add(S(AX0, -1, AZ1, HX1 - AX0, 1, 27.1 - AZ1, "soil", "ground_lawn_n2"));
add(S(HX1, -1, HZ0, GX0 - HX1, 1, HZ1 - HZ0, "soil", "ground_lawn_mid"));
add(S(HX1, -1, HZ1, DECK.x0 - HX1, 1, 27.1 - HZ1, "soil", "ground_lawn_ne1"));
add(S(DECK.x0, -1, HZ1, DECK.x1 - DECK.x0, 1, DECK.z0 - HZ1, "soil", "ground_lawn_ne2"));
add(S(GX0, -1, GZ1, 21.1 - GX0, 1, HZ1 - GZ1, "soil", "ground_lawn_e1"));
add(S(DECK.x1, -1, HZ1, 21.1 - DECK.x1, 1, 27.1 - HZ1, "soil", "ground_lawn_e2"));
// The pool deck, tiled, four panels around the basin; the basin's walls rise between them.
add(S(DECK.x0, -1, DECK.z0, DECK.x1 - DECK.x0, 1, POOL.z0 - WT - DECK.z0, "floor_tile", "ground_deck_s"));
add(S(DECK.x0, -1, POOL.z1 + WT, DECK.x1 - DECK.x0, 1, 27.1 - POOL.z1 - WT, "floor_tile", "ground_deck_n"));
add(S(DECK.x0, -1, POOL.z0 - WT, POOL.x0 - WT - DECK.x0, 1, POOL.z1 - POOL.z0 + 2 * WT, "floor_tile", "ground_deck_w"));
add(S(POOL.x1 + WT, -1, POOL.z0 - WT, DECK.x1 - POOL.x1 - WT, 1, POOL.z1 - POOL.z0 + 2 * WT, "floor_tile", "ground_deck_e"));

// ======================= THE POOL: sunk 1.2 m, tiled, 20 cm of water, a two-step ladder out =======================
// A body in the basin standing has its eye 0.4 m over the deck (head out); crouching is hidden —
// the same lip GÓRA's perch has, dug down instead of built up. The steps (0.4 m risers) mean it
// never traps a body; the walk grid climbs them as steps, not jumps.
add(S(POOL.x0 - WT, -3.0, POOL.z0 - WT, POOL.x1 - POOL.x0 + 2 * WT, 1.0, POOL.z1 - POOL.z0 + 2 * WT, "soil", "ground_pool_bed"));   // the excavation the basin sits in
add(S(POOL.x0, -2.0, POOL.z0, POOL.x1 - POOL.x0, 0.55, POOL.z1 - POOL.z0, "floor_tile", "pool_floor"));
add(S(POOL.x0, -1.4, POOL.z0, POOL.x1 - POOL.x0, 0.2, POOL.z1 - POOL.z0, "glass", "ground_pool_water"));
add(S(POOL.x0 - WT, -2.0, POOL.z0 - WT, WT, 2.0, POOL.z1 - POOL.z0 + 2 * WT, "wall_tile", "pool_wall_w"));
add(S(POOL.x1, -2.0, POOL.z0 - WT, WT, 2.0, POOL.z1 - POOL.z0 + 2 * WT, "wall_tile", "pool_wall_e"));
add(S(POOL.x0, -2.0, POOL.z0 - WT, POOL.x1 - POOL.x0, 2.0, WT, "wall_tile", "pool_wall_s"));
add(S(POOL.x0, -2.0, POOL.z1, POOL.x1 - POOL.x0, 2.0, WT, "wall_tile", "pool_wall_n"));
add(S(POOL.x0, -1.2, 22, 1.0, 0.4, 2.0, "wall_tile", "pool_step_1"));
add(S(POOL.x0, -0.8, 22, 0.5, 0.4, 2.0, "wall_tile", "pool_step_2"));

// ======================= BOUNDARY: thuja hedges 3 m, the far side of the road invisible =======================
add(S(PX0 - HW, 0, PZ0, HW, HEDGE, PZ1 - PZ0, "foliage", "hedge_w"));
add(S(PX1, 0, PZ0, HW, HEDGE, PZ1 - PZ0, "foliage", "hedge_e"));
add(S(PX0 - HW, 0, PZ1, PX1 - PX0 + 2 * HW, HEDGE, HW, "foliage", "hedge_n"));
add(S(-21.7, 0, VERGE0, HW, HEDGE, PZ0 - VERGE0, "foliage", "hedge_road_w"));
add(S(21.1, 0, VERGE0, HW, HEDGE, PZ0 - VERGE0, "foliage", "hedge_road_e"));
add(S(-21.7, 0, VERGE0 - 0.5, 43.4, 5, 0.5, "none", "wall_edge_s", true));
// The front line: the wooden fence, 1.5 m, from the west hedge to the garage; the wicket in front
// of the front door and the gate in front of the house's own garage. The detailing garage's south
// wall completes the line to the east hedge.
const WICKET: Gap = [-10.5, -9];
const GATE: Gap = [-7.75, -4.55];
wallX("fence_front", PX0, GX0, PZ0, PZ0 + WT, 1.5, "wood", [WICKET, GATE], 1.5);

// ======================= THE HOUSE: three storeys, one plan per storey =======================
const FRONT_DOOR: Gap = [-10.5, -9];
const GARAGE0_GATE: Gap = [-7.5, -4.3];
const SALON_GDOOR: Gap = [-13.75, -11.75];   // patio doors, 2 m: two walk cells wide, so the mover takes the corner clean
const KITCHEN_GDOOR: Gap = [-8.5, -6.5];
const ANNEX_DOOR: Gap = [-5.25, -3.75];
const BALCONY1_DOOR: Gap = [-9.75, -8.25];
const GARAGE0_EDOOR: Gap = [6, 7.5];
const BALCONY2_DOOR: Gap = [8, 9.5];
for (const s of [0, 1, 2]) {
  const y0 = Y(s), t = `house${s}`;
  wallZ(`${t}_wall_w`, HZ0 + WT, HZ1 - WT, HX0, HX0 + WT, WH, EXT, [], 2.2, y0);
  wallZ(`${t}_wall_e`, HZ0 + WT, HZ1 - WT, HX1 - WT, HX1, WH, EXT, s === 0 ? [GARAGE0_EDOOR] : s === 2 ? [BALCONY2_DOOR] : [], 2.2, y0);
  wallX(`${t}_wall_s`, HX0, HX1, HZ0, HZ0 + WT, WH, EXT, s === 0 ? [FRONT_DOOR, GARAGE0_GATE] : [], s === 0 ? 2.4 : 2.2, y0);
  wallX(`${t}_wall_n`, HX0, HX1, HZ1 - WT, HZ1, WH, EXT, s === 0 ? [SALON_GDOOR, KITCHEN_GDOOR, ANNEX_DOOR] : s === 1 ? [BALCONY1_DOOR] : [], 2.2, y0);
}
// --- Parter: hall from the front door to the stairs; salon NW, kitchen and bedroom N/E, the
// small bathroom north of the hall, boiler room SW, the house garage SE, the annex off the bedroom.
{
  const y0 = Y(0);
  wallZ("house0_w1", HZ0 + WT, HZ1 - WT, -9, -8.75, WH, INT, [[5.5, 7], [8.75, 10.25], [14.5, 16]], 2.2, y0);   // hall | garage, hall | kitchen, salon | kitchen
  wallZ("house0_w2", 8.75, HZ1 - WT, -6, -5.75, WH, INT, [[12, 13.5]], 2.2, y0);                                 // kitchen | bedroom
  wallX("house0_w3", HX0 + WT, -9, 12.5, 12.75, WH, INT, [], 2.2, y0);                                           // salon | stairs, bathroom
  wallX("house0_w4w", HX0 + WT, -10.75, 8.5, 8.75, WH, INT, [], 2.2, y0);                                        // boiler room | stairs
  wallX("house0_w4e", -8.75, HX1 - WT, 8.5, 8.75, WH, INT, [], 2.2, y0);                                         // garage | kitchen, bedroom
  wallZ("house0_w5", HZ0 + WT, 8.5, -11, -10.75, WH, INT, [[6, 7.5]], 2.2, y0);                                  // boiler room | hall
  wallX("house0_bath_s", -10.75, -9, 10.5, 10.75, WH, INT, [[-10.5, -9]], 2.2, y0);                             // the bathroom door
  // The annex: one room off the bedroom with its own door to the garden (a loop, not a pocket).
  wallZ("annex_wall_w", HZ1, 19.5, AX0, AX0 + WT, WH, EXT, [[17.5, 19]], 2.2, y0);
  wallX("annex_wall_n", AX0, HX1, 19.5, AZ1, WH, EXT, [], 2.2, y0);
  wallZ("annex_wall_e", HZ1, 19.5, HX1 - WT, HX1, WH, EXT, [], 2.2, y0);
  add(S(AX0, WH, HZ1, HX1 - AX0, SLAB, AZ1 - HZ1, "paint_red", "roof_annex_slab"));
  add(S(AX0 + 0.5, WH + SLAB, HZ1 + 0.5, HX1 - AX0 - 1, 0.35, AZ1 - HZ1 - 1, "paint_red", "roof_annex_cap"));
}
// --- 1 piętro: the salon across the whole north with the garden balcony; kitchen east, bedroom
// SW, the bathroom at the south end of the corridor, the stairs west of the corridor.
{
  const y0 = Y(1);
  wallZ("house1_w1", HZ0 + WT, 12.5, -9, -8.75, WH, INT, [[9, 10.5]], 2.2, y0);                                 // corridor | kitchen
  wallX("house1_w3", HX0 + WT, HX1 - WT, 12.5, 12.75, WH, INT, [[-10.5, -9], [-6.5, -5]], 2.2, y0);            // salon | corridor, kitchen
  wallX("house1_w4", HX0 + WT, -10.75, 8.5, 8.75, WH, INT, [], 2.2, y0);                                       // bedroom | stairs
  wallZ("house1_w5", HZ0 + WT, 8.5, -11, -10.75, WH, INT, [[6.75, 8.25]], 2.2, y0);                             // bedroom | corridor
  wallX("house1_bath_n", -10.75, -9, 6.5, 6.75, WH, INT, [[-10.5, -9]], 2.2, y0);                              // the bathroom door
}
// --- 2 piętro: rooms around the stairs; the SE room is the second spawn, with the east balcony.
{
  const y0 = Y(2);
  wallZ("house2_w1", HZ0 + WT, HZ1 - WT, -9, -8.75, WH, INT, [[6.5, 8], [11, 12.5], [14, 15.5]], 2.2, y0);     // corridor | SE, corridor | NE, NW | NE
  wallX("house2_w3", HX0 + WT, -9, 12.5, 12.75, WH, INT, [[-10.5, -9]], 2.2, y0);                              // NW room | corridor, stairs
  wallX("house2_w4", HX0 + WT, -10.75, 8.5, 8.75, WH, INT, [], 2.2, y0);                                       // SW room | stairs
  wallZ("house2_w5", HZ0 + WT, 8.5, -11, -10.75, WH, INT, [[6, 7.5]], 2.2, y0);                                 // SW room | corridor
  wallX("house2_ne_se", -8.75, HX1 - WT, 10.5, 10.75, WH, INT, [[-6.5, -5]], 2.2, y0);                          // NE room | SE room
  // The well's open edge beside the corridor: a 1.3 m rail (crouch cover), nobody mantles it.
  add(S(-11.5, y0, 8.75, WT, 1.3, 1.75, "metal", "house2_stair_rail"));
}
// --- Slabs: the storey's floor lies on the walls below in five panels around the stair well;
// the patch over the first tread carries the next flight's foot (over the second tread it would
// meet the head of a body stepping down from the landing above — measured on the walk grid). The roof is one slab plus
// two stepped plates (a hipped silhouette; AABB has no slopes) and a chimney.
for (const s of [1, 2]) {
  const y = Y(s) - SLAB;
  add(S(HX0, y, HZ0, HX1 - HX0, SLAB, 8.75 - HZ0, "floor_wood", `floor_${s}_s`));
  add(S(HX0, y, 8.75, WT, SLAB, 12.5 - 8.75, "floor_wood", `floor_${s}_w`));
  add(S(-11.5, y, 8.74, 0.75, SLAB, 10.5 - 8.74, "floor_wood", `floor_${s}_patch`));
  add(S(-10.75, y, 8.75, 10.75 + HX1, SLAB, 12.5 - 8.75, "floor_wood", `floor_${s}_e`));
  add(S(HX0, y, 12.5, HX1 - HX0, SLAB, HZ1 - 12.5, "floor_wood", `floor_${s}_n`));
}
add(S(HX0, Y(3) - SLAB, HZ0, HX1 - HX0, SLAB, HZ1 - HZ0, "paint_red", "roof_house_slab"));
add(S(HX0 + 0.5, Y(3), HZ0 + 0.5, HX1 - HX0 - 1, 0.75, HZ1 - HZ0 - 1, "paint_red", "roof_house_1"));
add(S(HX0 + 2, Y(3) + 0.75, HZ0 + 2, HX1 - HX0 - 4, 0.75, HZ1 - HZ0 - 4, "paint_red", "roof_house_2"));
add(S(-7, Y(3) + 1.5, 7, 0.6, 1.0, 0.6, "wall_brick", "roof_chimney"));

// --- The stairs: a switchback in the bay x -14.75..-10.75, z 8.75..12.5. Lane A (south) climbs
// west from the hall, the landing turns, lane B (north) climbs east onto the threshold wall
// whose top is the next floor. Flight 0→1 is solid from the floor; flight 1→2 hangs above it.
const STX = -11;            // east end of the treads; the threshold wall is x -11..-10.75
const LANE_A: Gap = [8.75, 10.5], LANE_B: Gap = [10.5, 12.5];
for (let i = 1; i <= 4; i++) add(S(STX - TREAD * i, 0, LANE_A[0], TREAD, RISE * i, LANE_A[1] - LANE_A[0], "wood", `stair_a0_step_${i}`));
add(S(HX0 + WT, 0, LANE_A[0], STX - 4 * TREAD - HX0 - WT, 5 * RISE, LANE_B[1] - LANE_A[0], "wood", "stair_landing_0"));
for (let j = 1; j <= 4; j++) add(S(STX - 4 * TREAD + TREAD * (j - 1), 0, LANE_B[0], TREAD, 5 * RISE + RISE * j, LANE_B[1] - LANE_B[0], "wood", `stair_b0_step_${j}`));
add(S(STX, 0, LANE_B[0], WT, Y(1), LANE_B[1] - LANE_B[0], INT, "house0_stair_wall"));
for (let i = 1; i <= 4; i++) add(S(STX - TREAD * i, Y(1) + RISE * (i - 1), LANE_A[0], TREAD + 0.05, RISE, LANE_A[1] - LANE_A[0], "wood", `stair_a1_step_${i}`));
add(S(HX0 + WT, Y(1) + 4 * RISE, LANE_A[0], STX - 4 * TREAD - HX0 - WT + 0.05, RISE, LANE_B[1] - LANE_A[0], "wood", "stair_landing_1"));
for (let j = 1; j <= 4; j++) add(S(STX - 4 * TREAD + TREAD * (j - 1) - 0.05, Y(1) + 5 * RISE + RISE * (j - 1), LANE_B[0], TREAD + 0.05 + (j === 4 ? 0.05 : 0), RISE, LANE_B[1] - LANE_B[0], "wood", `stair_b1_step_${j}`));
// The 2nd floor's threshold cannot be a wall (lane B arrives at the 1st floor right under it), so it
// is a floor strip resting on the last hanging tread, which reaches 5 cm under it for that.
add(S(STX, Y(2) - RISE, LANE_B[0], WT, RISE, LANE_B[1] - LANE_B[0], "floor_wood", "floor_2_threshold"));

// --- Balconies: a slab on two posts, a 1.35 m parapet on the open sides.
add(S(-11, Y(1) - SLAB, HZ1, 3.75, SLAB, 1.75, "floor_concrete", "balcony1_slab"));
add(S(-11, 0, 18.25, WT, Y(1) - SLAB, WT, "wood", "balcony1_post_w"));
add(S(-7.5, 0, 18.25, WT, Y(1) - SLAB, WT, "wood", "balcony1_post_e"));
add(S(-11, Y(1), 18.25, 3.75, 1.35, WT, EXT, "balcony1_parapet_n"));
add(S(-11, Y(1), HZ1, WT, 1.35, 1.5, EXT, "balcony1_parapet_w"));
add(S(-7.5, Y(1), HZ1, WT, 1.35, 1.5, EXT, "balcony1_parapet_e"));
add(S(HX1, Y(2) - SLAB, 7.5, 1.75, SLAB, 3, "floor_concrete", "balcony2_slab"));
add(S(-1.25, 0, 7.5, WT, Y(2) - SLAB, WT, "wood", "balcony2_post_s"));
add(S(-1.25, 0, 10.25, WT, Y(2) - SLAB, WT, "wood", "balcony2_post_n"));
add(S(-1.25, Y(2), 7.5, WT, 1.35, 3, EXT, "balcony2_parapet_e"));
add(S(HX1, Y(2), 7.5, 1.5, 1.35, WT, EXT, "balcony2_parapet_s"));
add(S(HX1, Y(2), 10.25, 1.5, 1.35, WT, EXT, "balcony2_parapet_n"));

// --- Windows: dark panes on every face, one per room.
for (const s of [0, 1, 2]) {
  const y = Y(s) + 0.9;
  pane(`win${s}_s_w`, -14, -12.5, HZ0 - 0.04, HZ0 + 0.01, y);
  if (s > 0) { pane(`win${s}_s_m`, -8, -6.5, HZ0 - 0.04, HZ0 + 0.01, y); pane(`win${s}_s_e`, -5, -3.5, HZ0 - 0.04, HZ0 + 0.01, y); }
  pane(`win${s}_w_s`, HX0 - 0.04, HX0 + 0.01, 6, 7.5, y);
  pane(`win${s}_w_n`, HX0 - 0.04, HX0 + 0.01, 14, 15.5, y);
  pane(`win${s}_e_n`, HX1 - 0.01, HX1 + 0.04, 13.5, 15, y);
  if (s < 2) pane(`win${s}_e_s`, HX1 - 0.01, HX1 + 0.04, 10, 11.5, y);
  pane(`win${s}_n_w`, s === 0 ? -11 : -14, s === 0 ? -9.5 : -12.5, HZ1 - 0.01, HZ1 + 0.04, y);
  if (s > 0) pane(`win${s}_n_e`, -6, -4.5, HZ1 - 0.01, HZ1 + 0.04, y);
}
pane("win_annex_n", -6, -4, AZ1 - 0.01, AZ1 + 0.04, 0.9);

// --- Furniture, in the cover language (0.6/0.8 low, 1.45 crouch, 2.0 full only beside 0.6 beds).
// A low piece's free edge sits 0.15 m off a walk-cell centre (x.10 / x.40 / x.60 / x.90): a cell
// whose centre is 0.21–0.35 m outside an edge is dead (the body touches, the foot does not), and
// a piece ringed by dead cells is "standable, unreachable" to the audit and to a bot.
add(O(-14.5, 0, 5, 1.0, 1.45, 1.0, "metal", "machine", "boiler"));                       // kotłownia: the boiler
add(O(-12.5, 0, 5, 1.0, 0.8, 1.0, "metal", "drums", "boiler_drums"));
add(S(-8.5, 0, 7.9, 2.0, 0.8, 0.6, "counter", "garage0_bench"));                         // the house garage
add(S(-4, 0, 5, 0.8, 0.8, 0.8, "rubber", "garage0_tyres"));
add(O(-3.85, 0, 7.6, 0.8, 0.8, 0.8, "wood", "crate", "garage0_crate"));
add(S(-6.6, 0, 9, 0.6, 0.8, 3, "counter", "kitchen0_counter"));                          // kuchnia
add(S(-5.6, 0, 9, 1.5, 0.6, 2.0, "paint_white", "bedroom0_bed"));                       // sypialnia (south end: the annex door needs the north clear)
add(O(-3.6, 0, 9, 0.6, 2.0, 1.5, "wood", "cabinet", "bedroom0_wardrobe", -Math.PI / 2));
add(S(-13.6, 0, 13, 2.5, 0.8, 0.9, "leather", "salon0_couch"));                          // salon
add(S(-14.75, 0, 14.25, 0.5, 0.6, 1.5, "wood", "salon0_tv_board"));
add(S(-10.5, 0, 11.9, 0.6, 0.8, 0.6, "counter", "bath0_stand"));                         // łazienka
add(S(-4, 0, 18.5, 0.9, 0.8, 0.9, "wood", "annex_table"));                               // dobudówka (clear of both doors)
add(S(-6.1, Y(1), 15.6, 2.5, 0.8, 0.9, "leather", "salon1_couch"));                        // 1 piętro
add(S(-13.6, Y(1), 14.5, 1.0, 0.8, 1.0, "wood", "salon1_table"));
add(S(-8.5, Y(1), 4.75, 5.25, 0.8, 0.6, "counter", "kitchen1_counter"));
add(S(-6.1, Y(1), 8, 1.0, 0.8, 1.0, "wood", "kitchen1_table"));
add(S(-14.4, Y(1), 5, 1.5, 0.6, 2.0, "paint_white", "bedroom1_bed"));
add(O(-11.6, Y(1), 4.75, 0.6, 2.0, 1.5, "wood", "cabinet", "bedroom1_wardrobe", -Math.PI / 2));
add(S(-10.5, Y(1), 4.75, 0.6, 0.8, 0.6, "counter", "bath1_stand"));
add(S(-6.25, Y(2), HZ0 + WT, 1.5, 0.6, 2.0, "paint_white", "room_se_bed"));               // 2 piętro
add(S(-8.75, Y(2), 9.5, 1.0, 0.8, 1.0, "wood", "room_se_desk"));
add(S(-5.6, Y(2), 14.5, 1.5, 0.6, 2.0, "paint_white", "room_ne_bed"));
add(O(-3.6, Y(2), 11, 0.6, 2.0, 1.5, "wood", "cabinet", "room_ne_wardrobe", -Math.PI / 2));
add(S(-13.6, Y(2), 13, 2.5, 0.8, 0.9, "leather", "room_nw_couch"));
add(S(-14.4, Y(2), 5, 1.5, 0.6, 2.0, "paint_white", "room_sw_bed"));

// ======================= THE SHED — BARBER (the owner's interior; a north door added) =======================
const SHED_MAT: MaterialTag = "wall_panel";
wallX("shed_wall_s", SHX0, SHX1, SHZ0, SHZ0 + WT, 2.8, SHED_MAT);
wallX("shed_wall_n", SHX0, SHX1, SHZ1 - WT, SHZ1, 2.8, SHED_MAT, [[1.5, 3]]);
wallZ("shed_wall_w", SHZ0 + WT, SHZ1 - WT, SHX0, SHX0 + WT, 2.8, SHED_MAT);
wallZ("shed_wall_e", SHZ0 + WT, SHZ1 - WT, SHX1 - WT, SHX1, 2.8, SHED_MAT, [[6.75, 8.25]]);
add(S(SHX0, 2.8, SHZ0, SHX1 - SHX0, SLAB, SHZ1 - SHZ0, SHED_MAT, "roof_shed"));
// The bathroom cubicle in the SW corner, its door east.
wallX("shed_bath_n", SHX0 + WT, 3.25, 8.5, 8.75, 2.8, SHED_MAT);
wallZ("shed_bath_e", SHZ0 + WT, 8.5, 3, 3.25, 2.8, SHED_MAT, [[7, 8.5]]);
// The mirror wall: the barber table along the west wall, three seats in a row facing it
// (invisible seat + back proxies the size of the drawn chair — a prop is never cover).
add(S(SHX0 + WT, 0, 8.75, 0.5, 0.8, 4.75, "counter", "shed_table"));
for (const [z, tag] of [[8.9, "1"], [10.4, "2"], [11.9, "3"]] as const) {
  add(S(2.0, 0.05, z, 0.9, 0.45, 0.8, "none", `shed_chair_${tag}_seat`, true));
  add(S(2.0, 0.6, z, 0.9, 0.85, 0.8, "none", `shed_chair_${tag}_back`, true));
  props.push({ kind: "barber_chair", x: 2.45, y: 0.55, z: z + 0.4, yaw: -Math.PI / 2 });
  props.push({ kind: "mirror", x: SHX0 + WT + 0.02, y: 1.5, z: z + 0.4, yaw: Math.PI / 2, w: 1.0, h: 1.1 });
}
add(S(3.5, 0, 13.6, 2.5, 0.8, 0.9, "leather", "shed_couch"));                            // the couch along the north wall
add(S(4, 0, SHZ0 + WT, 0.6, 0.8, 0.6, "counter", "shed_basin_stand"));                    // the wash basin on the south wall
pane("shed_win_1", SHX1 - 0.01, SHX1 + 0.04, 9.5, 11, 0.9, 1.2);
pane("shed_win_2", SHX1 - 0.01, SHX1 + 0.04, 12, 13.5, 0.9, 1.2);

// ======================= THE DETAILING GARAGE (T0's home) =======================
const GMAT: MaterialTag = "concrete_block";
const BRAMA1: Gap = [12, 15.2], BRAMA2: Gap = [16, 19.2];
const GARAGE_NDOOR: Gap = [13, 14.5];
const GARAGE_WDOOR: Gap = [3, 4.5];      // a side door to the front yard: T0's third way out, and the one that reaches the front gate as fast as T1 does
wallX("garage_wall_s", GX0, GX1, GZ0, GZ0 + WT, GH, GMAT, [BRAMA1, BRAMA2], 3.2);
wallX("garage_wall_n", GX0, GX1, GZ1 - WT, GZ1, GH, GMAT, [GARAGE_NDOOR]);
wallZ("garage_wall_w", GZ0 + WT, GZ1 - WT, GX0, GX0 + WT, GH, GMAT, [GARAGE_WDOOR]);
wallZ("garage_wall_e", GZ0 + WT, GZ1 - WT, GX1 - WT, GX1, GH, GMAT);
add(S(GX0, GH, GZ0, GX1 - GX0, SLAB, GZ1 - GZ0, "corrugated_blue", "roof_garage"));
// The spawn pocket, NE corner: a 2.8 m partition (paint booth) closes it from both gates and the
// north door; its mouth faces west, 1.5 m wide, into a sluice behind a screen — a mover leaving
// the mouth turns north or south along the screen, never into the partition's end (the corner a
// waypoint-following body catches on), and no line from the west door or the aisle reaches the
// mouth.
add(S(15.5, 0, 10.5, WT, 2.8, 3, "wall_panel", "garage_booth_w"));
add(S(15.5, 0, 8.75, 4.5, 2.8, WT, "wall_panel", "garage_booth_s"));
add(S(13.75, 0, 6.5, WT, 2.8, 4.25, "wall_panel", "garage_booth_screen"));
// The two cars in front of the gates (crouch cover), tyres stacked 1.3 (crouch, not a step), the
// tool chest 1.45, the compressor 1.3, the lockers on the west wall. NOTHING low (≤ 1.25) in
// here: a drum beside a car is a step onto the car, and the car a step onto the lockers.
add(O(12.25, 0, 2.5, 1.8, 1.45, 4.4, "paint_white", "car", "garage_car_1"));
add(O(16.25, 0, 2.5, 1.8, 1.45, 4.4, "paint_red", "car", "garage_car_2"));
add(S(11.4, 0, 11.6, 0.9, 1.3, 0.9, "rubber", "garage_tyres"));
add(O(11.25, 0, 8.5, 0.6, 1.45, 2.0, "metal", "cabinet", "garage_tool_chest", Math.PI / 2));
add(O(19.4, 0, 9.5, 0.6, 2.0, 3.4, "metal", "lockers", "garage_lockers", -Math.PI / 2));

// ======================= THE ROAD AND THE GARDEN =======================
// The owner's car: a super-sports BMW, dark grey-blue, parked in front of the house.
add(O(-10.5, 0, -2.7, 4.4, 1.45, 1.8, "paint_blue", "car", "bmw", Math.PI / 2));
tree("tree_w1", -17.5, 8.5);
tree("tree_w2", -17.5, 20);
tree("tree_n", 1.5, 22, 3.4);
tree("tree_e", 15.5, 16.75, 3.4);
// Shrubs (crouch cover) and two thuja blocks (2.8, structures) that cut the garden's long lines;
// the thujas stand where no balcony and no hedge is within a sprint jump of their tops.
add(S(-18.5, 0, 13, 2.5, 1.3, 1.5, "foliage", "shrub_w"));
add(S(-12, 0, 22, 3.0, 1.3, 1.5, "foliage", "shrub_n1"));
add(S(-4, 0, 23.5, 2.0, 1.3, 1.5, "foliage", "shrub_n2"));
add(S(8, 0, 16, 1.5, 1.3, 2.0, "foliage", "shrub_e"));
add(S(-19, 0, 24, 1.5, 1.3, 1.5, "foliage", "shrub_nw"));
add(S(2.5, 0, 18, 1.2, 2.8, 1.2, "foliage", "thuja_n"));
add(S(14.5, 0, 20.5, 1.2, 2.8, 1.2, "foliage", "thuja_e"));
add(O(-16, 0, 25, 1.2, 0.8, 1.2, "wood", "crate", "garden_crate"));

// ======================= PROPS (no collision) AND LIGHTS =======================
const AMBER = "#ffbf70", MERCURY = "#9adce5", ACCENT = "#fa709a";
const point = (x: number, y: number, z: number, color: string, intensity: number, range: number, priority = 5) =>
  lights.push({ kind: "point", x, y, z, color, intensity, range, priority });
// The house: one pendant per room, hung 0.8 m under the ceiling.
const rooms: [string, number, number, number][] = [
  ["salon0", -12, 0, 14.75], ["kitchen0", -7.4, 0, 12.5], ["bedroom0", -4.4, 0, 12.5], ["hall0", -9.9, 0, 7.5], ["bath0", -9.9, 0, 11.6],
  ["boiler0", -12.9, 0, 6.6], ["garage0", -5.75, 0, 6.6], ["annex", -4.9, 0, 18.25],
  ["salon1", -8.9, 1, 14.75], ["kitchen1", -5.9, 1, 8.5], ["bedroom1", -12.9, 1, 6.6], ["bath1", -9.9, 1, 5.6], ["corridor1", -9.9, 1, 9.6],
  ["room_nw", -12, 2, 14.75], ["room_ne", -5.9, 2, 13.6], ["room_se", -5.9, 2, 7.6], ["room_sw", -12.9, 2, 6.6], ["corridor2", -9.9, 2, 9.6],
];
for (const [, x, s, z] of rooms) {
  props.push({ kind: "pendant", x, y: Y(s) + WH - 0.85, z, h: 0.8 });
  point(x, Y(s) + WH - 1.0, z, AMBER, 9, 7, 6);
}
// The stair bay: a wall lamp on the west wall at each storey (a pendant would hang in the flights).
for (const s of [0, 1, 2]) { props.push({ kind: "lamp", x: HX0 + WT + 0.02, y: Y(s) + 2.6, z: 10.6, yaw: Math.PI / 2, variant: "wall" }); point(HX0 + 1, Y(s) + 2.6, 10.6, AMBER, 9, 7, 6); }
// Outside the house: the number, a lamp over the front door and over each garden door, the
// balconies' wall lamps, the gate post's lamp and box.
props.push({ kind: "sign", x: -8, y: 2.6, z: HZ0 - 0.02, yaw: Math.PI, text: "17", w: 0.4, h: 0.3 });
props.push({ kind: "lamp", x: -9.75, y: 2.6, z: HZ0 - 0.02, yaw: Math.PI, variant: "wall" });
point(-9.75, 2.6, HZ0 - 0.7, AMBER, 10, 9, 7);
props.push({ kind: "lamp", x: -6, y: 3.0, z: HZ0 - 0.02, yaw: Math.PI, variant: "wall" });
point(-6, 3.0, HZ0 - 0.7, AMBER, 8, 8, 6);
props.push({ kind: "lamp", x: -12.75, y: 2.6, z: HZ1 + 0.02, yaw: 0, variant: "wall" });
point(-12.75, 2.6, HZ1 + 0.7, AMBER, 8, 8, 6);
props.push({ kind: "lamp", x: -9, y: Y(1) + 2.4, z: HZ1 + 0.02, yaw: 0, variant: "wall" });
point(-9, Y(1) + 2.4, HZ1 + 0.8, AMBER, 8, 7, 6);
props.push({ kind: "lamp", x: HX1 + 0.02, y: Y(2) + 2.4, z: 9, yaw: Math.PI / 2, variant: "wall" });
point(HX1 + 0.8, Y(2) + 2.4, 9, AMBER, 8, 7, 6);
props.push({ kind: "lamp", x: HX1 + 0.02, y: 2.6, z: 6.75, yaw: Math.PI / 2, variant: "wall" });
point(HX1 + 0.7, 2.6, 6.75, AMBER, 8, 8, 6);
props.push({ kind: "lamp", x: AX0 - 0.02, y: 2.5, z: 18.25, yaw: -Math.PI / 2, variant: "wall" });
point(AX0 - 0.7, 2.5, 18.25, AMBER, 7, 7, 5);
props.push({ kind: "sign", x: -4.6, y: 1.2, z: PZ0 - 0.02, yaw: Math.PI, text: "17", w: 0.3, h: 0.35 });
// The shed: the neon over the mirrors, the TV in the NW corner, bottles and clippers on the
// table, the basin, a tube light inside, a lamp over each door, the barber pole by the SE door.
props.push({ kind: "neon", x: SHX0 + WT + 0.04, y: 2.35, z: 10.8, yaw: Math.PI / 2, text: "BARBER", w: 2.2, h: 0.42, color: ACCENT });
point(SHX0 + 0.9, 2.3, 10.8, ACCENT, 8, 6, 6);
props.push({ kind: "board", x: SHX0 + WT + 0.02, y: 1.5, z: 14.0, yaw: Math.PI / 2, text: "", w: 1.0, h: 0.6 });
props.push({ kind: "bottle_row", x: 1.5, y: 0.82, z: 9.5, w: 1.2 });
props.push({ kind: "clippers", x: 1.5, y: 0.82, z: 11, yaw: 1.2 });
props.push({ kind: "towel_stack", x: 1.5, y: 0.8, z: 13 });
props.push({ kind: "sink", x: 4.3, y: 0.8, z: SHZ0 + WT + 0.3 });
props.push({ kind: "tube_light", x: 3.75, y: 2.7, z: 10.5, yaw: 0, w: 1.6 });
point(3.75, 2.5, 10.5, AMBER, 12, 8, 8);
props.push({ kind: "lamp", x: SHX1 + 0.02, y: 2.5, z: 7.5, yaw: Math.PI / 2, variant: "wall" });
point(SHX1 + 0.7, 2.5, 7.5, AMBER, 7, 7, 6);
props.push({ kind: "lamp", x: 2.25, y: 2.5, z: SHZ1 + 0.02, yaw: 0, variant: "wall" });
point(2.25, 2.5, SHZ1 + 0.7, AMBER, 7, 7, 6);
props.push({ kind: "barber_pole", x: SHX1 + 0.05, y: 1.2, z: 8.7, yaw: Math.PI / 2 });
props.push({ kind: "poster", x: 5.2, y: 1.3, z: SHZ0 + WT + 0.02, yaw: 0, variant: "1", w: 0.6, h: 0.85 });
// The garage: tube lights under the roof, the sign over the gates, a wheel by the tyres, a lamp
// over the north door, graffiti on the booth.
props.push({ kind: "tube_light", x: 13.6, y: GH - 0.1, z: 4, yaw: Math.PI / 2, w: 1.6 });
props.push({ kind: "tube_light", x: 17.6, y: GH - 0.1, z: 4, yaw: Math.PI / 2, w: 1.6 });
props.push({ kind: "tube_light", x: 13.6, y: GH - 0.1, z: 11, yaw: Math.PI / 2, w: 1.6 });
props.push({ kind: "tube_light", x: 18, y: GH - 0.1, z: 11.5, yaw: Math.PI / 2, w: 1.6 });
point(13.6, GH - 0.4, 4, MERCURY, 14, 10, 8);
point(17.6, GH - 0.4, 4, MERCURY, 14, 10, 8);
point(13.6, GH - 0.4, 11, MERCURY, 12, 9, 7);
point(18, GH - 0.4, 11.5, MERCURY, 12, 8, 8);
props.push({ kind: "sign", x: 15.6, y: 3.6, z: GZ0 - 0.02, yaw: Math.PI, text: "DETAILING", w: 2.4, h: 0.5 });
point(15.6, 3.6, GZ0 - 0.8, MERCURY, 8, 9, 6);
props.push({ kind: "wheel", x: 12.4, y: 0, z: 10.6, yaw: 0.4 });
props.push({ kind: "lamp", x: 13.75, y: 3.0, z: GZ1 + 0.02, yaw: 0, variant: "wall" });
point(13.75, 3.0, GZ1 + 0.7, MERCURY, 8, 8, 6);
props.push({ kind: "graffiti", x: 18, y: 1.6, z: 8.73, yaw: Math.PI, text: "DOLNA 17", w: 2.2, h: 0.8 });
props.push({ kind: "poster", x: 13.73, y: 1.4, z: 8.5, yaw: -Math.PI / 2, variant: "2", w: 0.6, h: 0.85 });
// The road and the garden: two street lamps, three garden posts, the pool's lamp.
for (const [x, z] of [[-16, -5.3], [14, -5.3]] as const) { props.push({ kind: "lamp", x, y: 0, z, variant: "post", h: 4.5 }); point(x, 4.3, z, AMBER, 16, 16, 7); }
for (const [x, z] of [[-17, 16], [-1, 24.5], [4, 19]] as const) { props.push({ kind: "lamp", x, y: 0, z, variant: "post", h: 3.8 }); point(x, 3.6, z, MERCURY, 10, 12, 6); }
props.push({ kind: "lamp", x: 12.5, y: 0, z: 25.5, variant: "post", h: 3.8 });
point(12.5, 3.6, 25.5, MERCURY, 10, 11, 6);
point(9, 0.5, 23, MERCURY, 6, 6, 5);            // under the water

// ======================= SPAWNS =======================
const spawns: SpawnPoint[] = [
  // team 0 — THE GARAGE. First = the duel start, inside the booth pocket at its mouth: MEASURED so
  // that five contested places are within 250 ms of T1's start (a deeper corner adds 3–4 m to
  // every T0 route and leaves only the front gate contested).
  { x: 16.25, y: 0, z: 9.75, yaw: -Math.PI / 2, team: 0 },
  { x: 18.75, y: 0, z: 12.25, yaw: -Math.PI / 2, team: 0 },
  { x: 18.5, y: 0, z: 10.5, yaw: -Math.PI / 2, team: 0 },
  { x: 17.5, y: 0, z: 10.25, yaw: -Math.PI / 2, team: 0 },
  { x: 13.75, y: 0, z: 12.25, yaw: Math.PI, team: 0 },
  { x: 14.5, y: 0, z: 8.5, yaw: Math.PI, team: 0 },
  // team 1 — THE HOUSE, 2nd floor. First = the duel start, the SE room beside the bed.
  { x: -7.75, y: Y(2), z: 7.25, yaw: -Math.PI / 2, team: 1 },
  { x: -6.75, y: Y(2), z: 9.25, yaw: -Math.PI / 2, team: 1 },
  { x: -4, y: Y(2), z: 9.5, yaw: -Math.PI / 2, team: 1 },
  { x: -6, y: Y(2), z: 12.5, yaw: -Math.PI / 2, team: 1 },
  { x: -9.75, y: Y(2), z: 14, yaw: Math.PI / 2, team: 1 },
  { x: -9.5, y: Y(1), z: 15.5, yaw: 0, team: 1 },
];

export const DOLNA: MapDef = {
  id: "dolna", name: "DOLNA",
  solids, props, lights, spawns,
  arenaSpawns: [
    { x: -17, y: 0, z: -2.5, yaw: Math.PI / 2, team: 0 }, { x: 17, y: 0, z: -2.5, yaw: -Math.PI / 2, team: 1 },
    { x: -17, y: 0, z: 23, yaw: Math.PI, team: 0 }, { x: 15, y: 0, z: 23.5, yaw: Math.PI, team: 1 },
    { x: 3.5, y: 0, z: 10.5, yaw: 0, team: 0 }, { x: -7.5, y: 0, z: 11.5, yaw: Math.PI, team: 1 },
    { x: -6, y: Y(1), z: 10.5, yaw: 0, team: 0 }, { x: -12, y: Y(2), z: 6.5, yaw: 0, team: 1 },
  ],
  stations: [{ x: 15.15, y: 0, z: 8, name: "GARAŻ" }, { x: -18, y: 0, z: -2.5, name: "ULICA" }, { x: -7.5, y: 0, z: 14.75, name: "KUCHNIA" }],
  flags: [{ id: "A", name: "PODJAZD", x: -6, y: 0, z: 2.5 }, { id: "B", name: "SALON", x: -13.5, y: 0, z: 15.75 }, { id: "C", name: "BASEN", x: 9, y: 0, z: 20 }],
  sites: [{ id: "A", name: "BASEN", x: 12.4, y: 0, z: 23 }, { id: "B", name: "ULICA", x: -15, y: 0, z: -2.5 }],
  huntSpawnMinM: 10,
  killY: -8,
  bounds: boxFrom(-23, -3, -8, 46, 23, 36),
};
for (const st of DOLNA.stations) props.push({ kind: "neon", x: st.x, y: st.y + 2.2, z: st.z, yaw: 0, text: "$ BUY", w: 1.2, h: 0.4, variant: "station" });

/** Key places, timed from BOTH starts; a leading "*" marks a CONTESTED place (must be within 250 ms). */
export const DOLNA_PLACES: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  "*front_gate": { x: -6.25, y: 0, z: 1.25 },
  "*garden_door": { x: -12.25, y: 0, z: 17.75 },
  "*porch": { x: -9.25, y: 0, z: 17.75 },
  "*east_passage": { x: -4.25, y: 0, z: 7.25 },
  "*road_sw": { x: -10.25, y: 0, z: -4.25 },
  "*lawn_nw": { x: -16.25, y: 0, z: 19.75 },
  "annex_w_door": { x: -7.75, y: 0, z: 17.75 },
  "road_gate": { x: -4, y: 0, z: -2.25 },
  "wicket": { x: -9.75, y: 0, z: 1.25 },
  "road_w": { x: -18, y: 0, z: -2.25 },
  "road_ww": { x: -13, y: 0, z: -2.25 },
  "front_door": { x: -9.75, y: 0, z: 3.75 },
  "pool_deck": { x: 9, y: 0, z: 20 },
  "shed_door": { x: 7, y: 0, z: 7.5 },
  "stair_foot": { x: -10, y: 0, z: 9.5 },
  "garage_w_door": { x: 10.5, y: 0, z: 3.75 },
  "garage_gate_1": { x: 14.75, y: 0, z: 1.25 },
  "garage_gate_2": { x: 18.75, y: 0, z: 1.25 },
  "garage_north_door": { x: 13.75, y: 0, z: 14.5 },
  "shed_north_door": { x: 2.25, y: 0, z: 15.5 },
  "salon_1": { x: -9, y: Y(1), z: 14.75 },
  "balcony_1": { x: -9, y: Y(1), z: 17.5 },
  "balcony_2": { x: -2, y: Y(2), z: 9 },
  "kitchen_0": { x: -7.5, y: 0, z: 12.5 },
  "annex": { x: -5, y: 0, z: 18.25 },
  "road_e": { x: 18, y: 0, z: -2 },
  "garden_nw": { x: -17, y: 0, z: 23 },
  "other_start_T1": { x: -7.75, y: Y(2), z: 7.25 },
  "other_start_T0": { x: 16.25, y: 0, z: 9.75 },
};
/** Exits counted within 15 / 30 m of each start. */
export const DOLNA_EXITS: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  booth_mouth: { x: 14.75, y: 0, z: 10 },
  garage_w_door: { x: 10.5, y: 0, z: 3.75 },
  garage_gate_1: { x: 14.75, y: 0, z: 1.25 },
  garage_gate_2: { x: 18.75, y: 0, z: 1.25 },
  garage_north_door: { x: 13.75, y: 0, z: 14.5 },
  corridor_2: { x: -9.9, y: Y(2), z: 7.25 },
  room_ne: { x: -5.75, y: Y(2), z: 12 },
  balcony_2: { x: -2, y: Y(2), z: 9 },
  stairs_2_head: { x: -11.5, y: Y(2) - RISE, z: 11.5 },
  corridor_1: { x: -9.9, y: Y(1), z: 9.6 },
  hall_0: { x: -9.9, y: 0, z: 7.5 },
};
/** Names of the ground panels (the climb chain's base) and of what must never be standable. */
export const DOLNA_GROUND = /^ground_/;
export const DOLNA_BOUNDARY = /^(hedge_|fence_|wall_edge)/;
/** Raw extents for the tools and tests that draw or measure the map rather than build it. */
export const DOLNA_EXTENTS: Readonly<Record<string, Box>> = {
  road: boxFrom(-21.7, 0, ROAD0, 43.4, 0, PZ0 - ROAD0),
  plot: boxFrom(PX0, 0, PZ0, PX1 - PX0, 0, PZ1 - PZ0),
  house: boxFrom(HX0, 0, HZ0, HX1 - HX0, Y(3), HZ1 - HZ0),
  annex: boxFrom(AX0, 0, HZ1, HX1 - AX0, WH, AZ1 - HZ1),
  shed: boxFrom(SHX0, 0, SHZ0, SHX1 - SHX0, 2.8, SHZ1 - SHZ0),
  garage: boxFrom(GX0, 0, GZ0, GX1 - GX0, GH, GZ1 - GZ0),
  pool: boxFrom(POOL.x0, -1.2, POOL.z0, POOL.x1 - POOL.x0, 1.2, POOL.z1 - POOL.z0),
  stairs: boxFrom(HX0 + WT, 0, LANE_A[0], STX - HX0 - WT, Y(2), LANE_B[1] - LANE_A[0]),
};
export const DOLNA_STOREY = ST;
