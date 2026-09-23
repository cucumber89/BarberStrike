import { type Box, boxFrom } from "./collision";
import type { Flag, LightHint, MapDef, MaterialTag, PropHint, Solid, SolidLook, SpawnPoint, Station } from "./map";

/**
 * GÓRA — DACH (the roof of the block), the 1v1 tournament arena.
 *
 * Rebuilt from the flat above the shop into the roof of the same block: a 34 × 22 m deck ten
 * storeys up, fenced all round, with the lift machine room in the middle turned into a perch, the
 * two stair heads hiding the two starts, and the barber's overflow — chairs, mirrors, a neon —
 * bolted to the roof felt for after-hours fights.
 *
 * FAIRNESS IS A CONSTRUCTION, NOT A TUNING. Every solid, prop and light that is not on the centre
 * line is placed through `pair()`, which also places its 180° twin about the origin:
 * (x, z) → (−x, −z). The two starts are therefore identical in every distance, every angle and every
 * route, but a player's LEFT is the other player's LEFT too (a mirror would swap them), so both sides
 * play the same map from the same hand. `gora.test.ts` re-derives that symmetry from the finished
 * solids instead of trusting this file, and `apps/client/e2e/tools/map-duel.ts` measures the walks.
 *
 *        z=11 ┌──────────────────────────────────────────────────────────────────┐
 *             │ PRANIE (pasmo N zach.)   │ PRALNIA ▓▓▓ │  PASMO N wsch. │ KIESZEŃ E │
 *        z= 8 │ ───────────────────────  └─ lustra ─┘  szafki ───────── │ ┌───────┤
 *             │ ZBIORNIK   PODWÓRKO W    DZIEDZINIEC N (fotele)         │ │KLATKA │
 *        z= 3 │ ▓▓▓        palety        ┌──────────────┐             ──┤ │  E    │
 *             │ ─brama─  PODEST W   ╱╱╱  │ MASZYNOWNIA  │ ╲╲╲  PODEST E │ └───────┤
 *        z=-3 ├───────┐  (skrzyżowanie)  │  perch y=2.0 │   (skrzyżow.) │ ZBIORNIK │
 *             │KLATKA │                  └──────────────┘               │ ▓▓▓      │
 *             │  W    │  DZIEDZINIEC S (fotele, szafa)     PODWÓRKO E   │          │
 *        z=-8 ├───────┘ ── kanał ── ┌─ lustra ─┐ ── szafki ──────────────────────  │
 *             │ KIESZEŃ W (spawn)   │ WENTYL. ▓▓▓ │  PASMO S wsch.        FLAGI    │
 *        z=-11└──────────────────────────────────────────────────────────────────┘
 *            x=-17     x=-12      x=-7    x=-4    x=0    x=4     x=7    x=12    x=17
 *
 * The three fights it is built to produce:
 *  1. THE COURTS (dziedzińce, green neon): open, chairs for crouch cover, a 2.0 m cabinet for a
 *     corner — the risk space, and the way to the stairs.
 *  2. THE LANES (pasma, warm white): each long side is cut in two by a fan house, so no line runs
 *     the length of the roof; behind lockers and a duct they are the covered way round.
 *  3. THE PERCH (maszynownia, yellow): 2.0 m up, a 1.35 m lip on the court sides (crouch = hidden,
 *     stand = head out), OPEN on the stair ends, so whoever holds it is exposed to both crossroads
 *     while they look down into the courts. Two stairs, one each side, both in the open.
 *
 * Cover speaks one language everywhere: 0.8 m = low, jump on it; 1.3 m = crouch behind it, cannot
 * be climbed (mantle is 1.25 m); ≥ 2.0 m = full cover; 2.8–3.9 m = structures nobody gets onto.
 * `gora.test.ts` proves the last two from the geometry by chaining every mantle a body can make.
 */

const X0 = -17, X1 = 17, Z0 = -11, Z1 = 11;   // the deck
const PW = 0.4;      // parapet thickness
const PH = 1.0;      // parapet concrete
const FH = 3.4;      // the cage on top of it: 4.4 m all round — higher than any roof-top plus a mantle
const PERCH = 2.0;   // machine-room roof
const LIP = 1.35;    // its lip: crouch-hidden (1.25), head out when standing (eye 1.62), no mantle (1.25)
const RISE = 0.3334; // stair riser (6 × 0.3334 = 2.0)

const S = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, name: string, invisible?: boolean): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, invisible });
const O = (minX: number, minY: number, minZ: number, sx: number, sy: number, sz: number, mat: MaterialTag, look: SolidLook, name: string, yaw = 0): Solid =>
  ({ box: boxFrom(minX, minY, minZ, sx, sy, sz), mat, name, look, yaw });

/** The 180° twin of a solid about the origin (its own material unless the twin is dressed differently). */
export const rotSolid = (s: Solid, name: string, mat: MaterialTag = s.mat): Solid => ({
  ...s, name, mat,
  box: { minX: -s.box.maxX, maxX: -s.box.minX, minY: s.box.minY, maxY: s.box.maxY, minZ: -s.box.maxZ, maxZ: -s.box.minZ },
  yaw: s.yaw === undefined ? undefined : s.yaw + Math.PI,
});

export const GORA: MapDef = (() => {
  const solids: Solid[] = [];
  const props: PropHint[] = [];
  const lights: LightHint[] = [];

  /** A solid on the south-west half and its twin on the north-east half. */
  const pair = (s: Solid, matB: MaterialTag = s.mat): void => {
    solids.push({ ...s, name: `${s.name}_a` });
    solids.push(rotSolid(s, `${s.name}_b`, matB));
  };
  const pairProp = (p: PropHint, twin: Partial<PropHint> = {}): void => {
    props.push(p);
    props.push({ ...p, x: -p.x, z: -p.z, yaw: (p.yaw ?? 0) + Math.PI, ...twin });
  };
  const pairLight = (l: LightHint, twin: Partial<LightHint> = {}): void => {
    lights.push(l);
    lights.push({ ...l, x: -l.x, z: -l.z, ...twin });
  };

  // ---------- The deck: one panel, so nothing can share its top face. ----------
  solids.push(S(X0, -1, Z0, X1 - X0, 1, Z1 - Z0, "floor_asphalt", "dach"));

  // ---------- Parapet + cage: 4.4 m all round. Nothing leaves the roof. ----------
  // 4.4 because the tallest thing a body can chain onto (the 3.0 m stair heads, if it ever got
  // there) plus the 1.25 m mantle is 4.25. A lower fence was climbable from a crate beside a vent
  // unit, then from the unit onto the wire — `gora.test.ts` chains every real jump to prove it.
  pair(S(X0, 0, Z0, X1 - X0, PH, PW, "concrete_block", "attyka_pd"));
  pair(S(X0, 0, Z0 + PW, PW, PH, Z1 - Z0 - 2 * PW, "concrete_block", "attyka_w"));
  pair(S(X0, PH, Z0, X1 - X0, FH, PW, "fence", "siatka_pd"));
  pair(S(X0, PH, Z0 + PW, PW, FH, Z1 - Z0 - 2 * PW, "fence", "siatka_w"));

  // ---------- Stair heads (klatki): 3.0 m, the walls the two starts hide behind ----------
  pair(S(-12.6, 0, -7.6, 5.0, 3.0, 4.6, "wall_concrete", "klatka"));
  // The gate wall: closes the start's north exit to a 2.4 m door along the parapet, so the only
  // line into the start from the yard is from the door itself.
  pair(S(-14.2, 0, -3.0, 1.6, 2.2, 0.4, "paint_green", "brama"));
  // And a wing off the stair head's far corner: the door opens into a vestibule that faces the
  // machine room, so the first steps out are in the perch's shadow, not on a 30 m line to the
  // other yard.
  pair(S(-12.6, 0, -3.0, 0.4, 3.0, 2.4, "wall_concrete", "skrzydlo"));

  // ---------- The perch: lift machine room, 2.0 m, lips on the court sides only ----------
  solids.push(S(-4, 0, -2.5, 8, PERCH, 5, "concrete_block", "maszynownia"));
  solids.push(S(-4, PERCH, -2.5, 8, LIP, 0.3, "paint_yellow", "attyka_maszynowni_pd"));
  solids.push(S(-4, PERCH, 2.2, 8, LIP, 0.3, "paint_yellow", "attyka_maszynowni_pn"));
  // Two stairs, in the open: 6 risers of 0.3334 (inside the 0.4 step, so bots climb them too).
  for (let i = 0; i < 6; i++) pair(S(-6.4 + i * 0.4, 0, -1, 0.4, (i + 1) * RISE, 2, "floor_metal", `schody_${i}`));

  // ---------- The bands (pasma): a fan house cuts each long side in two ----------
  pair(O(-1.0, 0, -10.6, 3.0, 3.9, 3.2, "metal", "machine", "wentylatornia"), "metal");
  // The barber's station on its court face: a tiled mirror wall, two chairs in front of it.
  pair(S(-1.0, 0, -7.4, 3.0, 3.9, 0.3, "wall_tile", "lustra"));
  // Chairs are cover, so they carry a collision proxy the size of the drawn chair (0.8 × 1.45 × 0.9,
  // lifted 5 cm so the prop test can see the anchor stands on the deck). `barber_chair` is a prop
  // and props never collide; a chair you could shoot through would be a fake cover.
  for (const [x, tag] of [[-0.6, "1"], [0.9, "2"]] as const) {
    pair(S(x, 0.05, -6.8, 0.8, 0.45, 0.9, "none", `fotel_${tag}_siedzisko`, true));
    pair(S(x, 0.62, -6.8, 0.8, 0.83, 0.9, "none", `fotel_${tag}_oparcie`, true));
    pairProp({ kind: "barber_chair", x: x + 0.4, y: 0.55, z: -6.35, yaw: Math.PI });
  }
  // West nook: a 1.3 m duct (crouch cover) with a 1.6 m opening beside the fan house.
  pair(S(-4.6, 0, -8.0, 2.0, 1.3, 0.6, "metal", "kanal"));
  // East half: the lockers, full cover, backs to the lane.
  pair(O(2.0, 0, -8.0, 3.4, 2.2, 0.6, "paint_green", "lockers", "szafki"), "paint_yellow");
  // The mouth of the start is a dog-leg: a wing wall off the stair head and a 3.9 m vent stack
  // beside the duct leave a 1.4 m throat along the parapet into the nook, so the start's strip
  // sees the lane and nothing of the court, and the court sees the throat and nothing of the strip.
  pair(S(-7.6, 0, -9.2, 0.4, 3.0, 1.6, "wall_concrete", "parawan"));
  pair(S(-6.2, 0, -9.2, 1.4, 3.9, 1.8, "metal", "komin_pasma"));
  // A crouch-high vent unit further along the east half, at the yard end.
  pair(O(10.6, 0, -10.6, 1.4, 1.3, 1.4, "paint_white", "machine", "wentylator_pasma"), "paint_white");

  // ---------- The courts (dziedzińce): the risk space ----------
  pair(O(-6.6, 0, -6.6, 1.2, 0.8, 1.2, "paint_green", "crate", "skrzynia"), "paint_yellow");   // low, jump on it
  pair(O(-0.8, 0, -5.5, 1.2, 2.0, 1.6, "paint_yellow", "cabinet", "rozdzielnia", Math.PI), "paint_green"); // full, narrow: a corner, and the end of the long diagonal
  pair(O(4.4, 0, -5.2, 2.0, 0.8, 0.8, "concrete_block", "planter", "donica"));                  // low
  // A 3.6 m billboard where the court meets the yard: breaks the long north–south line past the
  // crossroads, and is the yard's own landmark (MARCOVIA on one, FRANKIBARBER on the other).
  pair(S(-8.2, 0, 3.4, 1.6, 3.6, 0.3, "paint_white", "tablica"));

  // ---------- The yards (podwórka): the flank ----------
  pair(S(-16.0, 0, 2.4, 2.4, 2.8, 2.4, "metal", "zbiornik"));                                    // the vent tank, full
  // Crouch cover; no low crate within a jump of it, or the crate is a step onto it and it a step
  // onto the next thing (`gora.test.ts` chains every real jump).
  pair(O(-16.6, 0, 5.4, 1.4, 1.3, 1.4, "paint_white", "machine", "klimatyzator"), "paint_white");
  pair(O(-10.4, 0, 4.8, 1.4, 2.2, 1.4, "wood", "pallets", "palety"));                            // full, a pallet tower

  // Bins are solids with the `bin` look, never the `trash` prop: a drawn bin that a bullet passes
  // through is a fake cover. Low (0.8), so they read as something to hop onto, not hide behind.
  pair(O(-16.6, 0, -10.6, 0.4, 0.8, 0.4, "metal", "bin", "kosz_kieszeni"));
  pair(O(-7.2, 0, -10.6, 0.4, 0.8, 0.4, "paint_green", "bin", "kosz_pasma"), "paint_yellow");

  // ---------- Laundry (west) / Marcovia bunting (east): posts, a line, cloth above head height ----------
  // Hung at 3.0–3.7 m: a sprint jump tops out at 2.73 m, so nobody bumps it and nothing is cover.
  pair(S(-15.85, 0, 9.55, 0.1, 3.8, 0.1, "metal", "slup_pralni_1"));
  pair(S(-8.45, 0, 9.55, 0.1, 3.8, 0.1, "metal", "slup_pralni_2"));
  for (let i = 0; i < 4; i++) {
    pair(S(-14.8 + i * 1.7, 3.0, 9.58, 0.9, 0.7, 0.04, "paint_white", `pranie_${i}`), i % 2 ? "paint_yellow" : "paint_green");
  }
  pairProp({ kind: "cable", x: -12.15, y: 3.74, z: 9.6, yaw: Math.PI / 2, w: 7.4 });

  // ---------- The block below and the estate around: seen through the fence, never reached ----------
  solids.push(S(-90, -31, -80, 180, 1, 160, "floor_asphalt", "podworko_dol"));
  solids.push(S(-62, -30, -34, 22, 27, 40, "wall_concrete", "blok_w"));
  solids.push(S(38, -30, -8, 22, 39, 38, "wall_brick", "blok_e"));
  solids.push(S(-24, -30, 36, 38, 24, 22, "wall_concrete", "blok_n"));
  solids.push(S(-8, -30, -58, 38, 42, 24, "wall_plaster", "blok_s"));
  solids.push(S(-72, -30, 28, 30, 30, 32, "wall_brick", "blok_nw"));
  solids.push(S(40, -30, -62, 30, 34, 30, "wall_concrete", "blok_se"));

  // ---------- Props: the roof's own furniture. Nothing here is cover; cover is a solid. ----------
  // Stair heads: the door the start comes out of, a lamp over it, antennas on the roof.
  pairProp({ kind: "board", x: -10.1, y: 1.2, z: -7.66, yaw: Math.PI, text: "", w: 1.0, h: 2.1 });
  pairProp({ kind: "sign", x: -10.1, y: 2.5, z: -7.75, yaw: Math.PI, text: "KLATKA W", w: 1.4, h: 0.4 }, { text: "KLATKA E" });
  pairProp({ kind: "graffiti", x: -12.66, y: 1.6, z: -5.3, yaw: -Math.PI / 2, text: "MARCOVIA", w: 2.4, h: 0.9 });
  pairProp({ kind: "graffiti", x: -7.54, y: 1.5, z: -5.3, yaw: Math.PI / 2, text: "GÓRA 1v1", w: 2.6, h: 1.0 });
  pairProp({ kind: "poster", x: -7.54, y: 1.4, z: -3.8, yaw: Math.PI / 2, variant: "0", w: 0.7, h: 1.0 }, { variant: "1" });
  pairProp({ kind: "sticker", x: -12.66, y: 1.1, z: -6.6, yaw: -Math.PI / 2, scale: 0.6 });
  pairProp({ kind: "vent", x: -11.6, y: 2.6, z: -7.66, yaw: Math.PI, w: 0.7, h: 0.4 });
  pairProp({ kind: "pipe", x: -12.68, y: 0, z: -7.0, h: 3.0 });
  pairProp({ kind: "pole", x: -11.4, y: 3.0, z: -4.6, h: 2.6 });
  pairProp({ kind: "pole", x: -8.6, y: 3.0, z: -6.4, h: 2.6 });
  pairProp({ kind: "cable", x: -10.0, y: 5.55, z: -5.5, yaw: 2.14, w: 3.3 });
  pairProp({ kind: "ac_unit", x: -12.85, y: 2.2, z: -3.9, yaw: -Math.PI / 2 });
  pairProp({ kind: "sign", x: -10.1, y: 2.5, z: -2.85, yaw: 0, text: "STRZYŻENIE 24H", w: 2.2, h: 0.5 }, { text: "AFTER HOURS" });
  pairProp({ kind: "lamp", x: -12.9, y: 2.4, z: -5.4, yaw: -Math.PI / 2, variant: "wall" });
  pairProp({ kind: "lamp", x: -9.0, y: 2.6, z: -7.9, yaw: Math.PI, variant: "wall" });
  // The gate: the door frame the north exit runs through.
  pairProp({ kind: "sign", x: -13.4, y: 1.5, z: -3.15, yaw: Math.PI, text: "→ PODWÓRKO", w: 1.2, h: 0.4 });
  // The station: mirrors over the chairs, the neon over the mirrors, bottles on a shelf.
  pairProp({ kind: "mirror", x: -0.2, y: 1.5, z: -7.08, yaw: 0, w: 1.0, h: 1.1 });
  pairProp({ kind: "mirror", x: 1.3, y: 1.5, z: -7.08, yaw: 0, w: 1.0, h: 1.1 });
  pairProp({ kind: "neon", x: 0.5, y: 2.35, z: -7.06, yaw: 0, text: "FRANKIBARBER", w: 2.6, h: 0.42, color: "#b8ff3a" }, { text: "AFTER HOURS", color: "#ffd84a" });
  pairProp({ kind: "shelf", x: 0.5, y: 0.95, z: -7.02, yaw: 0, w: 2.4 });
  pairProp({ kind: "bottle_row", x: 0.5, y: 0.98, z: -7.02, w: 1.8 });
  pairProp({ kind: "clippers", x: 1.6, y: 0.98, z: -7.0, yaw: 0.4 });
  pairProp({ kind: "towel_stack", x: -6.0, y: 0.8, z: -6.0 });
  pairProp({ kind: "vent", x: -1.02, y: 1.4, z: -9.0, yaw: -Math.PI / 2, w: 1.4, h: 0.8 });
  pairProp({ kind: "pipe", x: 2.1, y: 0, z: -9.0, h: 2.6 });
  pairProp({ kind: "tube_light", x: -3.6, y: 2.15, z: -10.55, yaw: Math.PI / 2, w: 1.6 });
  pairProp({ kind: "tube_light", x: 5.2, y: 2.15, z: -10.55, yaw: Math.PI / 2, w: 1.6 });
  pairProp({ kind: "poster", x: 3.7, y: 1.3, z: -8.02, yaw: Math.PI, variant: "2", w: 0.6, h: 0.85 });
  // The perch: a lamp post on the machine-room roof, the map's name on its court faces.
  // The post stands at the perch's corner, not in the middle of the view from it.
  props.push({ kind: "lamp", x: -3.5, y: PERCH, z: 1.8, variant: "post", h: 1.7 });
  props.push({ kind: "graffiti", x: 0, y: 1.2, z: -2.52, yaw: Math.PI, text: "GÓRA", w: 2.2, h: 1.0 });
  props.push({ kind: "graffiti", x: 0, y: 1.2, z: 2.52, yaw: 0, text: "GÓRA", w: 2.2, h: 1.0 });
  pairProp({ kind: "sticker", x: -4.02, y: 1.3, z: -1.6, yaw: -Math.PI / 2, scale: 0.7 });
  pairProp({ kind: "vent", x: -4.02, y: 0.9, z: 1.4, yaw: -Math.PI / 2, w: 0.6, h: 0.5 });
  // The yards: the tank's fittings, the sign board's face, a lamp on the tank.
  pairProp({ kind: "vent", x: -13.58, y: 1.6, z: 3.6, yaw: Math.PI / 2, w: 0.8, h: 0.6 });
  pairProp({ kind: "pipe", x: -13.4, y: 0, z: 2.2, h: 2.9 });
  pairProp({ kind: "lamp", x: -13.55, y: 2.3, z: 4.4, yaw: Math.PI / 2, variant: "wall" });
  pairProp({ kind: "sign", x: -7.4, y: 1.6, z: 3.72, yaw: 0, text: "MARCOVIA", w: 1.5, h: 0.6 }, { text: "FRANKIBARBER" });
  pairProp({ kind: "sticker", x: -6.58, y: 1.0, z: 3.72, yaw: 0, scale: 0.5 });
  pairProp({ kind: "receipt", x: -15.4, y: 2.82, z: 3.2 });
  pairProp({ kind: "tube_light", x: -12.1, y: 2.15, z: 10.55, yaw: Math.PI / 2, w: 2.0 });
  pairProp({ kind: "graffiti", x: -16.58, y: 1.7, z: 1.0, yaw: Math.PI / 2, text: "FADE ✂ TAPER", w: 2.2, h: 0.8 });

  // ---------- Lights: one colour per kind of place, so a player reads where they are. ----------
  const AMBER = "#ffbf70", NEON = "#b8ff3a", GOLD = "#ffd84a", CYAN = "#9adce5", ROSE = "#fa709a", WARM = "#ffe6c8";
  pairLight({ kind: "point", x: -10.1, y: 2.5, z: -8.3, color: AMBER, intensity: 14, range: 9, priority: 7 });   // start pockets
  pairLight({ kind: "point", x: -13.3, y: 2.3, z: -5.4, color: AMBER, intensity: 10, range: 7, priority: 6 });
  pairLight({ kind: "point", x: 0.5, y: 2.7, z: -6.4, color: NEON, intensity: 16, range: 11, priority: 8 }, { color: GOLD }); // courts
  lights.push({ kind: "point", x: -3.2, y: PERCH + 1.55, z: 1.6, color: GOLD, intensity: 18, range: 12, priority: 8 });      // perch
  pairLight({ kind: "point", x: -13.2, y: 2.3, z: 4.8, color: CYAN, intensity: 18, range: 12, priority: 7 });   // yards
  pairLight({ kind: "point", x: -12.1, y: 2.0, z: 10.2, color: ROSE, intensity: 14, range: 9, priority: 6 });   // laundry / bunting corners
  pairLight({ kind: "point", x: -3.6, y: 2.0, z: -10.2, color: WARM, intensity: 14, range: 9, priority: 6 });   // lane nooks
  pairLight({ kind: "point", x: 5.2, y: 2.0, z: -10.2, color: WARM, intensity: 14, range: 9, priority: 6 });
  pairLight({ kind: "point", x: 3.0, y: 2.6, z: -8.8, color: WARM, intensity: 10, range: 7, priority: 5 });    // the fan house's lane face
  pairLight({ kind: "point", x: -6.8, y: 2.2, z: 3.9, color: CYAN, intensity: 8, range: 6, priority: 4 });      // sign boards
  // The estate: window glow on the neighbouring blocks, well out of range of the deck.
  lights.push({ kind: "point", x: -36, y: -6, z: -14, color: AMBER, intensity: 60, range: 30, priority: 1 });
  lights.push({ kind: "point", x: 34, y: 0, z: 12, color: CYAN, intensity: 60, range: 30, priority: 1 });
  lights.push({ kind: "point", x: 6, y: -8, z: 34, color: AMBER, intensity: 60, range: 30, priority: 1 });
  lights.push({ kind: "point", x: 8, y: 2, z: -32, color: ROSE, intensity: 50, range: 28, priority: 1 });

  // ---------- Spawns: the two starts. Index 0 of each side is the duel start. ----------
  // The duel start stands in the strip west of the stair head, behind the gate wall, where nothing
  // but the doorway itself can see it; the other five are for the team modes and sit in the south
  // strip, out of every line the other pocket can draw.
  //
  // MEASURED, 2026-09-23, and left where it is: this start is 29.7 m from its twin with 19.6 m of
  // walking before either duellist can contest the perch, which is long for a 1 v 1 — but every
  // shorter start outside this stair head BREAKS the walked route onto the perch. Four were
  // audited with `map-duel.ts` ((-10.1,-8.1), (-12.1,-8.1), (-8.1,-8.1), (-9.6,-9.1)); all four
  // keep the symmetry at 0 ms and hide the start as well or better (5.0-6.9 % of surfaces against
  // 7.8 % here), and all four end the perch route stuck, because from the south strip the mover
  // arrives at the stair side-on. Shortening the approach means fixing that approach first.
  const t0: [number, number, number][] = [
    [-13.6, -6.0, 0.1],
    [-15.5, -9.6, 1.35], [-13.5, -9.6, 1.35], [-11.5, -9.6, 1.35], [-9.5, -9.6, 1.35],
    [-13.6, -4.6, 0.1],
  ];
  const spawns: SpawnPoint[] = [];
  for (const [x, z, yaw] of t0) spawns.push({ x, y: 0, z, yaw, team: 0 });
  for (const [x, z, yaw] of t0) spawns.push({ x: -x, y: 0, z: -z, yaw: yaw + Math.PI, team: 1 });

  // FFA, Gun Game and the Ostrzyżeni chaser draw from these as well: the ring, not the starts.
  const arenaSpawns: SpawnPoint[] = [
    { x: -14.4, y: 0, z: 9.6, yaw: Math.PI / 2, team: 0 }, { x: 14.4, y: 0, z: -9.6, yaw: -Math.PI / 2, team: 1 },
    { x: -9.6, y: 0, z: -0.4, yaw: Math.PI / 2, team: 0 }, { x: 9.6, y: 0, z: 0.4, yaw: -Math.PI / 2, team: 1 },
    { x: -3.4, y: 0, z: -9.4, yaw: 0, team: 0 }, { x: 3.4, y: 0, z: 9.4, yaw: Math.PI, team: 1 },
    { x: 6.2, y: 0, z: -9.4, yaw: 0, team: 0 }, { x: -6.2, y: 0, z: 9.4, yaw: Math.PI, team: 1 },
  ];

  // ---------- Buy stations: one in each start, one on the perch ----------
  const stations: Station[] = [
    { x: -15.4, y: 0, z: -5.6, name: "KLATKA W" },
    { x: 15.4, y: 0, z: 5.6, name: "KLATKA E" },
    { x: 0, y: PERCH, z: 0.2, name: "PODEST" },
  ];
  for (const st of stations) props.push({ kind: "neon", x: st.x, y: st.y + 2.2, z: st.z, yaw: 0, text: "$ BUY", w: 1.2, h: 0.4, variant: "station" });

  // ---------- Domination: the two yards and the perch ----------
  const flags: Flag[] = [
    { id: "A", name: "BRAMA W", x: -15.4, y: 0, z: 0.6 },
    { id: "B", name: "BRAMA E", x: 15.4, y: 0, z: -0.6 },
    { id: "C", name: "PODEST", x: 0, y: PERCH, z: 0 },
  ];

  return {
    id: "gora",
    name: "GÓRA (DACH)",
    solids, props, lights, spawns, arenaSpawns, stations, flags,
    // Bomb sites in the two yards: each side is the same distance from its near one, and the
    // attack/defence swap gives both teams both.
    sites: [
      { id: "A", name: "PODWÓRKO W", x: -12.2, y: 0, z: 6.4 },
      { id: "B", name: "PODWÓRKO E", x: 12.2, y: 0, z: -6.4 },
    ],
    huntSpawnMinM: 6,
    // The fence keeps everyone on the roof; the plane only exists so an impossible fall still ends.
    killY: -8,
    bounds: boxFrom(-18, -12, -12, 36, 20, 24),
  } satisfies MapDef;
})();

/** Raw extents for the tools and tests that draw or measure the map rather than build it. */
export const GORA_EXTENTS: Readonly<Record<string, Box>> = {
  deck: boxFrom(X0, 0, Z0, X1 - X0, 0, Z1 - Z0),
  perch: boxFrom(-4, PERCH, -2.5, 8, 0, 5),
  klatkaW: boxFrom(-12.6, 0, -7.6, 5, 3, 4.6),
  klatkaE: boxFrom(7.6, 0, 3.0, 5, 3, 4.6),
};
export const GORA_PERCH_Y = PERCH;
export const GORA_LIP = LIP;
