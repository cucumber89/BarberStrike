import { type Box, boxFrom } from "./collision";
import type { Flag, LightHint, MapDef, MaterialTag, PropHint, Solid, SolidLook, SpawnPoint, Station } from "./map";

/**
 * GÓRA — the flat above the shop (2.1, Drop G).
 *
 * The layout was drafted and signed off in `docs/MAP_2.md` before any of this was written; that
 * document is the reason for every number here, and its §3 table is these extents. In one line:
 * a 34 x 18 m flat, two rings around a solid stair core with an open light well beside it, a back
 * balcony and a roof over the east wing.
 *
 *        z=11 ┌────────────────────────────────────────────────────────────┐
 *             │              B A L K O N  (flag C / bomb A)      /SCHODY/  │  fire escape → DACH
 *        z= 9 ├──────────────┬─────────────┬──────────────┬───────────────┤
 *             │  KUCHNIA     │  HOL PN-W   │ SZYB (void)  │  HOL PN-E     │  SKŁAD
 *        z= 5 │  (bomb-free) ├─────────────┼──────────────┼───────────────┤  (loft stair → DACH)
 *             │              │ KLATKA ▸ ▪ RDZEŃ ▪ ◂ PRZEDPOKÓJ            │
 *        z= 1 ├──────────────┴─────────────┴──────────────┴───────────────┤
 *             │              H O L   P O Ł U D N I O W Y  (bomb B)        │
 *        z=-1 ├──────────────┬─────────────┬──────────────┬───────────────┤
 *             │  SALON       │  zabudowa   │  ŁAZIENKA    │  zabudowa     │  SYPIALNIA
 *        z=-7 └──────────────┴─────────────┴──────────────┴───────────────┘
 *            x=-17         x=-8          x=-2.5         x=2.5           x=8   x=17
 *
 * Why it plays differently from NIGHT_DISTRICT (measured, `docs/MAP_2.md` §1): that map's median
 * clear sight line is 24 m and its longest is 111 m; this one's longest is 20 m (the balcony) and
 * its longest interior line is 16 m (the south hall, through two doorframes). Rooms and doorways
 * instead of lanes.
 *
 * Two things the geometry has to respect and a reader should not "tidy":
 *  - the floor is laid as NON-OVERLAPPING panels butted against each other (floorAudit: two
 *    coplanar top faces sharing ≥ 0.25 m² is a z-fighting defect, and an interior with a slab per
 *    room is exactly where that happens);
 *  - the light well is 5.0 m across because a sprint jump covers a measured 4.43 m. Narrowing it
 *    turns the map's centre into a shortcut.
 */

const W = 0.3;      // wall thickness
const H = 2.8;      // ceiling height inside the flat (domestic, half the shop's industrial 6.0)
const SLAB = 3.0;   // ceiling slab over the west + centre: top 5.8 (see the comment at "Ceilings")
const DECK = 3.0;   // roof deck over the east wing
const PAR = 1.2;    // roof parapet
const DOORH = 2.1;  // door head height (lintels run DOORH..H)
const X0 = -17, X1 = 17, Z0 = -7, Z1 = 11;

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name?: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

export const GORA: MapDef = (() => {
  const solids: Solid[] = [];
  const props: PropHint[] = [];
  const lights: LightHint[] = [];
  const spawns: SpawnPoint[] = [];

  // ---------- Floor: one panel per area, butted, never overlapping. No panel over the SZYB. ----------
  solids.push(S(X0, -1, Z0, 9, 1, 8, "floor_wood", "podloga_salon"));            // salon
  solids.push(S(X0, -1, 1, 9, 1, 2, "floor_tile", "podloga_prog_w"));            // salon → kitchen threshold
  solids.push(S(X0, -1, 3, 9, 1, 6, "floor_tile", "podloga_kuchnia"));
  solids.push(S(8, -1, Z0, 9, 1, 8, "floor_wood", "podloga_sypialnia"));
  solids.push(S(8, -1, 1, 9, 1, 2, "floor_concrete", "podloga_prog_e"));
  solids.push(S(8, -1, 3, 9, 1, 6, "floor_concrete", "podloga_sklad"));
  solids.push(S(-2.5, -1, Z0, 5, 1, 6, "floor_tile", "podloga_lazienka"));
  solids.push(S(-8, -1, -1, 16, 1, 6, "floor_wood", "podloga_hol"));
  solids.push(S(-8, -1, 5, 5.5, 1, 4, "floor_wood", "podloga_hol_pn_w"));
  solids.push(S(2.5, -1, 5, 5.5, 1, 4, "floor_wood", "podloga_hol_pn_e"));
  solids.push(S(-10, -1, 9, 20, 1, 2, "floor_concrete", "podloga_balkon"));
  solids.push(S(10, -1, 9, 4, 1, 2, "floor_metal", "podest_schodow"));

  // ---------- Exterior walls (inside the envelope, so they stand on the floor) ----------
  // South wall, with a window bay in the salon and one in the bedroom (sill / glass / header).
  const southWall = (x: number, sx: number, name: string) => solids.push(S(x, 0, Z0, sx, H, W, "wall_brick", name));
  southWall(X0, 2, "sc_pd_w1");
  southWall(-10, 20, "sc_pd_mid");
  southWall(15, 2, "sc_pd_e1");
  for (const [x, sx, tag] of [[-15, 5, "salon"], [10, 5, "sypialnia"]] as [number, number, string][]) {
    solids.push(S(x, 0, Z0, sx, 0.9, W, "wall_panel", `parapet_okna_${tag}`));
    solids.push(S(x, 0.9, Z0 + 0.1, sx, 1.3, 0.1, "glass", `okno_${tag}`));
    solids.push(S(x, 2.2, Z0, sx, H - 2.2, W, "wall_brick", `nadproze_okna_${tag}`));
  }
  // West and east walls, each with a window in the kitchen / stock room.
  for (const [x, side] of [[X0, "w"], [X1 - W, "e"]] as [number, string][]) {
    solids.push(S(x, 0, Z0, W, H, 11, `wall_plaster`, `sc_${side}_a`));
    solids.push(S(x, 0, 4, W, 0.9, 3, "wall_panel", `parapet_okna_${side}`));
    solids.push(S(x, 0.9, 4, W, 1.3, 3, "glass", `okno_${side}`));
    solids.push(S(x, 2.2, 4, W, H - 2.2, 3, "wall_plaster", `nadproze_okna_${side}`));
    solids.push(S(x, 0, 7, W, H, 2, `wall_plaster`, `sc_${side}_b`));
  }
  // North wall of the flat (the balcony is beyond it): two 2 m doors at x -6..-4 and 4..6.
  solids.push(S(X0, 0, 8.7, 11, H, W, "wall_plaster", "sc_pn_w"));
  solids.push(S(-4, 0, 8.7, 8, H, W, "wall_plaster", "sc_pn_mid"));
  solids.push(S(6, 0, 8.7, 11, H, W, "wall_plaster", "sc_pn_e"));
  solids.push(S(-6, DOORH, 8.7, 2, H - DOORH, W, "wall_plaster", "nadproze_balkon_w"));
  solids.push(S(4, DOORH, 8.7, 2, H - DOORH, W, "wall_plaster", "nadproze_balkon_e"));

  // ---------- The solid south band: built-in wardrobes, risers and the bathroom's shell ----------
  solids.push(S(-8, 0, Z0 + W, 5.5, H, 6 - W, "wall_plaster", "zabudowa_w"));
  solids.push(S(2.5, 0, Z0 + W, 5.5, H, 6 - W, "wall_plaster", "zabudowa_e"));
  solids.push(S(-2.5, 0, Z0 + W, 5, H, 1 - W, "wall_tile", "lazienka_pd"));
  // Bathroom's north wall, door at x -1..1.
  solids.push(S(-2.5, 0, -1.3, 1.5, H, W, "wall_tile", "lazienka_pn_w"));
  solids.push(S(1, 0, -1.3, 1.5, H, W, "wall_tile", "lazienka_pn_e"));
  solids.push(S(-1, DOORH, -1.3, 2, H - DOORH, W, "wall_tile", "nadproze_lazienki"));

  // ---------- The middle band: the core, the two passages, the two side rooms ----------
  solids.push(S(-2.5, 0, 1, 5, H, 4, "wall_plaster", "rdzen"));               // boarded stair to the shop
  solids.push(S(-8, 0, 5, 3.5, H, W, "wall_plaster", "klatka_pn"));           // no door: the passage is the way through
  solids.push(S(4.5, 0, 5, 3.5, H, W, "wall_plaster", "przedpokoj_pn"));
  solids.push(S(-4.8, 0, 1, W, H, 1, "wall_plaster", "klatka_wsch_a"));
  solids.push(S(-4.8, 0, 4, W, H, 1, "wall_plaster", "klatka_wsch_b"));
  solids.push(S(-4.8, DOORH, 2, W, H - DOORH, 2, "wall_plaster", "nadproze_klatki"));
  solids.push(S(4.5, 0, 1, W, H, 1, "wall_plaster", "przedpokoj_zach_a"));
  solids.push(S(4.5, 0, 4, W, H, 1, "wall_plaster", "przedpokoj_zach_b"));
  solids.push(S(4.5, DOORH, 2, W, H - DOORH, 2, "wall_plaster", "nadproze_przedpokoju"));

  // ---------- The light well: a 5 m hole with a 1 m parapet on the two hall sides ----------
  solids.push(S(-2.8, 0, 5, W, 1.0, 3, "wall_tile", "szyb_parapet_w"));
  solids.push(S(2.5, 0, 5, W, 1.0, 3, "wall_tile", "szyb_parapet_e"));
  solids.push(S(-2.5, 0, 8, 5, H, 0.7, "wall_plaster", "szyb_pn"));           // duct: the halls do NOT meet here

  // ---------- Party walls between the wings and the centre ----------
  // x = -8: solid beside the klatka, a door into HOL PN-W at z 6..8, solid again to the back wall.
  for (const [x, side] of [[-8.15, "w"], [7.85, "e"]] as [number, string][]) {
    solids.push(S(x, 0, 1, W, H, 5, "wall_plaster", `sc_dzialowa_${side}_a`));
    solids.push(S(x, 0, 8, W, H, 0.7, "wall_plaster", `sc_dzialowa_${side}_b`));
    solids.push(S(x, DOORH, 6, W, H - DOORH, 2, "wall_plaster", `nadproze_${side}`));
  }
  // The wardrobe run between each end room's two halves, with a 1.5 m doorway.
  solids.push(S(X0 + W, 0, 1, 4 - W, H, 2, "wall_plaster", "zabudowa_salon_a"));
  solids.push(S(-11.5, 0, 1, 3.35, H, 2, "wall_plaster", "zabudowa_salon_b"));
  solids.push(S(-13, DOORH, 1, 1.5, H - DOORH, 2, "wall_plaster", "nadproze_salon"));
  solids.push(S(8.15, 0, 1, 3.35, H, 2, "wall_plaster", "zabudowa_syp_a"));
  solids.push(S(13, 0, 1, 4 - W, H, 2, "wall_plaster", "zabudowa_syp_b"));
  solids.push(S(11.5, DOORH, 1, 1.5, H - DOORH, 2, "wall_plaster", "nadproze_syp"));

  // ---------- Ceilings. The west + centre roof is deliberately NOT walkable, and "deliberately"
  // has to be measured from every surface a player can actually stand on, not from the deck. It was
  // 1.6 m thick (top 4.4) and a code review found the chain: the air-conditioner tops at 3.9, which
  // is a 0.9 m hop from the deck — under the real 0.93 m jump apex, and over the walk grid's 0.88 m
  // JUMP_UP, so it was invisible to every reachability test — and from 3.9 the slab was half a
  // metre up. The east parapet gave a second route at 1.2 m, inside the 1.25 m crouch-jump mantle.
  // The slab is now 3.0 m thick (top 5.8), which is 1.6 m above the highest thing anyone can stand
  // on up there. `gora.test.ts` re-derives that margin from the geometry rather than trusting it.
  solids.push(S(X0, H, Z0, 14.5, SLAB, 16, "ceiling", "strop_w"));
  solids.push(S(2.5, H, Z0, 3.5, SLAB, 16, "ceiling", "strop_e"));
  solids.push(S(-2.5, H, Z0, 5, SLAB, 12, "ceiling", "strop_c_pd"));
  solids.push(S(-2.5, H, 8, 5, SLAB, 1, "ceiling", "strop_c_pn"));
  solids.push(S(6, H, Z0, 11, SLAB, 5, "ceiling", "strop_sypialnia_pd"));

  // ---------- DACH: the deck over the east wing, with the loft-stair opening cut out ----------
  solids.push(S(6, H, -2, 7.5, DECK - H, 11, "floor_concrete", "dach_w"));
  solids.push(S(15.7, H, -2, 1.3, DECK - H, 11, "floor_concrete", "dach_e"));
  solids.push(S(13.5, H, -2, 2.2, DECK - H, 5.4, "floor_concrete", "dach_pd"));
  solids.push(S(13.5, H, 7.9, 2.2, DECK - H, 1.1, "floor_concrete", "dach_pn"));
  solids.push(S(6, DECK, 8.7, 8, PAR, W, "concrete_block", "attyka_pn_w"));
  solids.push(S(15.2, DECK, 8.7, 1.8, PAR, W, "concrete_block", "attyka_pn_e"));
  solids.push(S(X1 - W, DECK, -2, W, PAR, 11, "concrete_block", "attyka_wsch"));

  // ---------- Stairs. Both are 0.333 m risers: inside the walk grid's 0.88 m jump-up, so bots
  // climb them like anyone else, and measured to cost no time at all (docs/MAP_2.md §6).
  for (let i = 0; i < 9; i++) {
    solids.push(S(10 + i * 0.444, 0, 9, 0.444, (i + 1) * 0.3334, 2, "floor_metal", `schody_poz_${i}`));
    solids.push(S(13.5, 0, 3.4 + i * 0.5, 2.2, (i + 1) * 0.3334, 0.5, "floor_metal", `schody_strych_${i}`));
  }
  solids.push(S(14, 0, 9, 1.2, DECK, 2, "floor_metal", "podest_gorny"));
  solids.push(S(15.2, 0, 10.7, 0.1, 1.1, 0.3, "metal", "porecz_schodow"));

  // ---------- Balcony railing ----------
  solids.push(S(-10, 0, 10.7, 20, 1.1, W, "metal", "balustrada"));
  solids.push(S(-10, 0, 9, W, 1.1, 1.7, "metal", "balustrada_w"));

  // ---------- Furniture: every piece is cover, and none of it stands on a spawn ----------
  // SALON
  solids.push(S(-12, 0, -5.5, 0.9, 0.75, 2.5, "leather", "kanapa"));
  solids.push(S(-11, 0, -5.2, 1.2, 0.45, 0.9, "wood", "lawa"));
  solids.push(O(-16.4, 0, 0.4, 2, 1.0, 0.6, "wood", "cabinet", "kredens"));
  solids.push(S(-8.6, 0, -6.5, 0.5, 2.0, 1.5, "wood", "regal_salon"));
  solids.push(O(-9.2, 0, -1.9, 1.1, 0.55, 0.5, "paint_white", "cabinet", "szafka_rtv", Math.PI));
  // KUCHNIA
  solids.push(S(-13.5, 0, 5.2, 2.6, 0.95, 1.0, "counter", "wyspa"));
  solids.push(S(-16.7, 0, 3.2, 0.7, 0.9, 3.2, "counter", "blat_kuchenny"));
  solids.push(O(-16.7, 0, 7.2, 0.7, 1.9, 0.8, "paint_white", "cabinet", "lodowka"));
  solids.push(S(-10.6, 0, 6.4, 1.4, 0.75, 1.4, "wood", "stol_kuchenny"));
  // SYPIALNIA
  solids.push(S(13.6, 0, -6.5, 2, 0.55, 2.2, "leather", "lozko"));
  solids.push(O(16.1, 0, -2.2, 0.6, 2.1, 2.2, "wood", "cabinet", "szafa", -Math.PI / 2));
  solids.push(S(8.6, 0, -6.5, 0.5, 2.0, 1.5, "wood", "regal_syp"));
  solids.push(O(9.2, 0, -1.9, 1.1, 0.55, 0.5, "paint_white", "cabinet", "komoda", Math.PI));
  // ŁAZIENKA
  solids.push(S(-2.2, 0, -5.7, 1.7, 0.6, 0.8, "paint_white", "wanna"));
  solids.push(O(1.3, 0, -5.6, 0.65, 0.85, 0.65, "paint_white", "cabinet", "pralka"));
  // SKŁAD — the shop's overflow, and the reason the loft stair is here
  solids.push(S(16.0, 0, 3.2, 0.7, 2.2, 4.6, "metal", "regaly_skladu"));
  solids.push(O(8.4, 0, 6.4, 1.2, 1.2, 1.2, "wood", "crate", "skrzynia_a"));
  solids.push(O(9.6, 0, 6.4, 1.2, 0.8, 1.2, "wood", "crate", "skrzynia_b"));
  solids.push(O(11.0, 0, 5.6, 1.1, 0.9, 1.1, "paint_yellow", "crate", "pudlo"));
  solids.push(O(8.4, 0, 3.4, 1.2, 1.0, 0.9, "paint_blue", "lockers", "szafka_sklad", Math.PI));
  // KLATKA / PRZEDPOKÓJ / halls
  solids.push(O(-7.6, 0, 3.6, 1.0, 0.9, 0.5, "wood", "cabinet", "komoda_klatka"));
  solids.push(O(6.6, 0, 3.6, 1.0, 0.9, 0.5, "wood", "cabinet", "komoda_przedpokoj"));
  solids.push(O(-7.6, 0, 6.2, 0.9, 1.1, 0.9, "paint_green", "bin", "kosz_hol"));
  // BALKON + DACH
  solids.push(O(-9.2, 0, 9.05, 1.2, 0.7, 0.6, "paint_orange", "planter", "donica"));
  solids.push(O(6.6, 0, 9.05, 0.7, 0.9, 0.6, "metal", "bin", "kosz_balkon"));
  solids.push(O(14.6, DECK, 0.4, 1.6, 1.4, 1.6, "metal", "drums", "zbiornik_wody"));
  solids.push(O(7.4, DECK, 4.6, 1.4, 0.9, 1.1, "metal", "machine", "klimatyzacja"));
  solids.push(S(8.8, DECK, -0.8, 0.8, 1.3, 0.8, "wall_brick", "komin"));

  // ---------- Props (visual only; the map test judges every one of them for floating) ----------
  props.push({ kind: "pendant", x: -13.5, y: 2.55, z: 5.7, w: 0.4, h: 0.5 });
  props.push({ kind: "pendant", x: -10.6, y: 2.55, z: 6.4, w: 0.35, h: 0.5 });
  props.push({ kind: "tube_light", x: 0, y: 2.72, z: 0, yaw: Math.PI / 2, w: 7.0 });
  props.push({ kind: "tube_light", x: -5.2, y: 2.72, z: 6.6, w: 2.4 });
  props.push({ kind: "tube_light", x: 5.2, y: 2.72, z: 6.6, w: 2.4 });
  props.push({ kind: "tube_light", x: 0, y: 2.72, z: -4, w: 2.0 });
  props.push({ kind: "tube_light", x: 13, y: 2.72, z: 5.5, w: 3.0 });
  props.push({ kind: "mirror", x: 2.44, y: 1.6, z: -3.5, yaw: -Math.PI / 2, w: 1.2, h: 0.9 });
  props.push({ kind: "mirror", x: -14.5, y: 1.6, z: 0.94, yaw: Math.PI, w: 1.0, h: 1.6 });
  props.push({ kind: "sink", x: -0.9, y: 0, z: -1.9 });
  props.push({ kind: "bottle_row", x: -13.5, y: 0.95, z: 5.2, w: 1.2 });
  props.push({ kind: "towel_stack", x: -2.0, y: 0.6, z: -5.7 });
  props.push({ kind: "barber_chair", x: 12.9, y: 0, z: 8.2, yaw: -0.4 });
  props.push({ kind: "barber_pole", x: 9.4, y: 0, z: 9.5, scale: 0.9 });
  props.push({ kind: "clippers", x: -13.5, y: 1.0, z: 0.4, yaw: 0.3 });
  props.push({ kind: "receipt", x: 13.2, y: 0.9, z: 4.2 });
  props.push({ kind: "counter_top", x: -16.35, y: 0.9, z: 4.8, yaw: Math.PI / 2, w: 3.2 });
  props.push({ kind: "poster", x: -8.06, y: 1.7, z: -4.2, yaw: -Math.PI / 2, variant: "0", w: 0.8, h: 1.1 });
  props.push({ kind: "poster", x: 8.06, y: 1.7, z: -4.2, yaw: Math.PI / 2, variant: "1", w: 0.8, h: 1.1 });
  props.push({ kind: "graffiti", x: 0, y: 1.5, z: 9.06, yaw: Math.PI, text: "GÓRA", w: 2.4, h: 1.0 });
  props.push({ kind: "sticker", x: -16.62, y: 1.5, z: 5.4, yaw: Math.PI / 2, scale: 0.5 });
  props.push({ kind: "board", x: -7.8, y: 1.7, z: 2.4, yaw: -Math.PI / 2, w: 1.0, h: 0.7 });
  props.push({ kind: "vent", x: -16.62, y: 2.3, z: 6.6, yaw: Math.PI / 2, w: 0.6, h: 0.4 });
  props.push({ kind: "ac_unit", x: 16.5, y: 2.3, z: 9.1, yaw: 0 });
  props.push({ kind: "pipe", x: -16.5, y: 1.4, z: 8.5, h: 2.8 });
  props.push({ kind: "pipe", x: 16.5, y: 1.4, z: 3.2, h: 2.8 });
  props.push({ kind: "cable", x: -2.7, y: 2.6, z: 6.5, w: 3.0 });
  props.push({ kind: "lamp", x: 0, y: 2.35, z: 9.15, variant: "wall" });
  props.push({ kind: "lamp", x: -14.6, y: 0, z: -6.2, variant: "post", scale: 0.7 });
  props.push({ kind: "trash", x: -9.5, y: 0, z: 8.2 });
  props.push({ kind: "trash", x: 9.5, y: 0, z: 8.2 });
  props.push({ kind: "crate", x: 14.0, y: DECK, z: 3.2, yaw: 0.4 });

  // ---------- Lights: practicals only. Two shadow casters (ARCHITECTURE.md: at most two). ----------
  lights.push({ kind: "point", x: -13.5, y: 2.4, z: 5.8, color: "#ffd9a8", intensity: 14, range: 8, priority: 6 });
  lights.push({ kind: "point", x: -12.5, y: 2.2, z: -3.2, color: "#ffc98a", intensity: 13, range: 8, shadows: true, priority: 7 });
  lights.push({ kind: "point", x: -9.4, y: 1.1, z: -2.2, color: "#7fb0ff", intensity: 5, range: 4, priority: 3 });
  lights.push({ kind: "point", x: 13.6, y: 1.1, z: -5.0, color: "#ffbe7a", intensity: 8, range: 5, priority: 4 });
  lights.push({ kind: "point", x: 13.0, y: 2.5, z: 5.5, color: "#cfe0ff", intensity: 13, range: 8, priority: 5 });
  lights.push({ kind: "point", x: -4.0, y: 2.6, z: 0, color: "#dfe8ff", intensity: 10, range: 7, priority: 5 });
  lights.push({ kind: "point", x: 4.0, y: 2.6, z: 0, color: "#dfe8ff", intensity: 10, range: 7, priority: 5 });
  lights.push({ kind: "point", x: -5.2, y: 2.6, z: 6.6, color: "#dfe8ff", intensity: 10, range: 7, priority: 5 });
  lights.push({ kind: "point", x: 5.2, y: 2.6, z: 6.6, color: "#dfe8ff", intensity: 10, range: 7, priority: 5 });
  lights.push({ kind: "point", x: 0, y: 2.3, z: 9.4, color: "#ffb86a", intensity: 16, range: 9, shadows: true, priority: 7 });
  lights.push({ kind: "point", x: 0, y: 4.6, z: 6.5, color: "#9fb6e8", intensity: 12, range: 9, priority: 6 });
  lights.push({ kind: "point", x: 0, y: 1.6, z: -6.6, color: "#ff9d5c", intensity: 8, range: 7, priority: 4 });
  lights.push({ kind: "point", x: 11.5, y: 3.7, z: 3.0, color: "#c9d4ea", intensity: 14, range: 9, priority: 5 });
  lights.push({ kind: "point", x: 0, y: 2.3, z: -3.6, color: "#eaf2ff", intensity: 8, range: 5, priority: 4 });

  // ---------- Spawns. Every point sits at z ≤ -1.5, south of the two hall doors, so no line
  // between the two end rooms is ever open: it always crosses the solid band or the bathroom.
  const t0: [number, number][] = [[-16, -6], [-16, -3.5], [-15.5, -1.5], [-13, -6.2], [-11, -1.8], [-9, -4.5]];
  for (const [x, z] of t0) {
    spawns.push({ x, y: 0, z, yaw: 1.2, team: 0 });
    spawns.push({ x: -x, y: 0, z, yaw: -1.2, team: 1 });
  }

  // FFA, Gun Game and the Ostrzyżeni chaser draw from these as well, so they cover the ring.
  const arenaSpawns: SpawnPoint[] = [
    { x: -6.5, y: 0, z: 3.0, yaw: 0, team: 0 },
    { x: 6.5, y: 0, z: 3.0, yaw: 0, team: 1 },
    { x: -6.5, y: 0, z: 10, yaw: Math.PI, team: 0 },
    { x: 6, y: 0, z: 10, yaw: Math.PI, team: 1 },
    { x: -5, y: 0, z: 6.6, yaw: 0, team: 0 },
    { x: 5, y: 0, z: 6.6, yaw: 0, team: 1 },
    { x: 8.6, y: DECK, z: 0.6, yaw: 1.4, team: 0 },
    { x: 11.5, y: DECK, z: 6.5, yaw: -2.2, team: 1 },
  ];

  // ---------- Buy stations: the furniture the barber keeps his float in ----------
  const stations: Station[] = [
    { x: -15.6, y: 0, z: -2.0, name: "KREDENS" },
    { x: -7.2, y: 0, z: 2.6, name: "KOMODA" },
    { x: 15.6, y: 0, z: -2.0, name: "SZAFA" },
  ];
  for (const st of stations) props.push({ kind: "neon", x: st.x, y: 2.2, z: st.z, yaw: 0, text: "$ BUY", w: 1.2, h: 0.4, variant: "station" });

  // ---------- Domination: the two outer-ring rooms and the inner crossroads ----------
  // NOT the two home rooms, which is where they were drafted: `DOM.radius` is 3.5 m and four spawn
  // points a side sat 2.33 m from their own flag, so both teams captured a flag by existing and
  // only the third was ever fought over — and in Boys, standing in a zone is what opens the class
  // change, so a player could re-class from their spawn. NIGHT_DISTRICT's nearest spawn to a flag
  // is 20.35 m; these are 6.7 m, outside every zone, and `map.test.ts` now checks it on every map.
  const flags: Flag[] = [
    { id: "A", name: "KUCHNIA", x: -14.5, y: 0, z: 6.5 },
    { id: "B", name: "SKŁAD", x: 12.5, y: 0, z: 7.5 },
    { id: "C", name: "HOL", x: 0, y: 0, z: 0 },
  ];

  return {
    id: "gora",
    name: "GÓRA (THE FLAT)",
    solids, props, lights, spawns, arenaSpawns, stations, flags,
    // Bomb sites on the centre line: both sides are 1.8 s from HOL and 2.7 s from BALKON, before
    // and after the half-time swap (docs/MAP_2.md, D-G4).
    sites: [
      { id: "A", name: "BALKON", x: 0, y: 0, z: 10 },
      { id: "B", name: "HOL", x: 0, y: 0, z: 0 },
    ],
    // The chase mode's respawn distance is a per-map number (docs/MAP_2.md, D-G3). Drafted at 8 m
    // by proportion — 14 m on NIGHT_DISTRICT's 121 m diagonal against this map's 39 m — and then
    // MEASURED: with five survivors spread one to an area, no point in the pool is 7 m from all of
    // them, so the rule would fall through to the ordinary spawn pick, which maximises distance
    // from enemies and is the opposite of hunting. At 6 m every arrangement sampled keeps at least
    // four legal points, and 6 m is still eight body-widths and a whole spawn-protection window.
    huntSpawnMinM: 6,
    // Falling down the light well, off the balcony or off the roof is a death (D-G5).
    killY: -8,
    bounds: boxFrom(-20, -12, -10, 40, 20, 23),
  } satisfies MapDef;
})();

/** Kept for the tools and tests that want the raw extents rather than the built map. */
export const GORA_EXTENTS: Readonly<Record<string, Box>> = {
  envelope: boxFrom(X0, 0, Z0, X1 - X0, H, Z1 - Z0),
  szyb: boxFrom(-2.5, -8, 5, 5, 11, 3),
  dach: boxFrom(6, DECK, -2, 11, 0, 11),
};
