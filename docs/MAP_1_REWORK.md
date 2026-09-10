# MAP 1 — NIGHT DISTRICT rework: the brief

**Audience: the next agent (Codex).** This file is the whole task. Everything the job needs —
what the owner asked for, where the code is, how the pipeline works, what is measurably wrong
today, and what will fail if it is done carelessly — is below. It was assembled by reading the
code and by running the shared map data through `tsx`; every number in §6, §7 and §8 was measured
on 2026-09-10 against commit `0b18328`, not guessed.

> **How to start the session.** Read `docs/PLAN_2_1.md` first (it is the contract), then this file
> in full, then §5 of this file with the code open. Do not start editing `packages/shared/src/map.ts`
> before you have rendered the map once (§10, step 1) — you cannot improve a look you have not seen.

**Paste this into Codex to start the session:**

```
You are working in the BarberStrike repo. Your task is the NIGHT_DISTRICT map rework.

Read docs/PLAN_2_1.md in full first (it is the contract), then read docs/MAP_1_REWORK.md in
full. That second file IS your brief: the owner's request, the art direction, the file map,
how the render pipeline works, the measured state of the map, the defects already found, the
tests that gate it, the tools, and the definition of done. Follow it.

Work on a branch, not on main. One concern per commit, imperative subject, and a body that
says WHY (the mechanism, the measurement). Before the final report, write the ledger row,
Decisions and Deferred entries into docs/PLAN_2_1.md and commit them separately as
`plan: ledger <date> drop <letter>`. Do not open a pull request unless the owner asks.

Start with §10 step 1: render the map and look at it before changing anything.
```

---

## 1. The job, in the owner's words

> *"chciałbym abyś przygotował prompt oraz już gotowe informacje itp gdzie co jest i jak działa aby
> codex poprawił pierwszą mapę, poprawił błędy jakieś randomowe rzeczy i żeby mapa miała więcej
> sensu, mówię o całej mapie a nie tylko paru miejscach, fajnie lowpoly z klasą (low poly takie że
> wygląda jakby było zrobione specjalnie, że pomimo low poly wygląda dojebanie mapa (żeby miała swój
> vibe) a nie że wygląda jakby ktoś chciał zrobić realistyczną grafikę ale się nie udało"*

Four requirements, and the fourth is the one that decides the other three:

1. **Fix the first map** — `NIGHT_DISTRICT`, the default map (`map.ts:605`), the one every player
   sees first.
2. **Fix bugs and random things** — the small wrongnesses. §7 lists the ones already found in the
   data; there will be more once it is on screen.
3. **Make the map make more sense** — as a place. Right now it is eleven named areas plus two
   bolted-on extension blocks, and the areas do not tell you where you are, where you are going, or
   why the building next to you exists. **The whole map, not two or three spots.** §6's density
   table is the map of where the work is: an area with 2.7 solids per 100 m² and zero lights is not
   "finished and quiet", it is empty.
4. **Deliberate low-poly with class — not failed realism.** This is an art direction, and §2 turns
   it into rules you can check. Read §2 before you touch anything.

---

## 2. The art direction, made operational

The trap is that this codebase already has a **realism pipeline**: PBR materials, procedurally
generated 512 px albedo + tangent-space normal maps + roughness/metallic maps, world-anchored UVs
at one texture unit per metre (`materials.ts`, `MapBuilder.applyWorldUVs`). Point that pipeline at
a box and you get exactly what the owner does not want — an attempt at a real concrete wall,
rendered at 512 px, at night, and losing.

"Low-poly done on purpose" is not fewer triangles. It is **decisions that are visibly decisions.**
Eight of them, all checkable:

**A. Silhouette first.** Every area must be identifiable from its outline at 30 m in the dark.
Give each of the thirteen areas in §6 exactly **one landmark silhouette** — a shape you would
recognise as a black cut-out. Today the loading yard is 63 boxes and the depot canopy
(`districtExpansion.ts`, `depot_site_roof`) is the only structure in the map that was written to
give an area "a recognizable silhouette". That comment is the standard; apply it thirteen times.

**B. Chamfer the structural edges.** A hard 90° box edge at night reads as an untextured
primitive. A 3–6 cm chamfer catches a highlight and is *the* thing that separates deliberate
low-poly from a grey block. Chamfers are visual-only: add them as dressing pieces or as look
geometry, **never by shrinking a collision box** (§3).

**C. Flat shading, low and constant tessellation.** `dressing.ts` already does this
(`convertToFlatShadedMesh()`, `tessellation: 8..10`) and its docblock names it as the owner's
chosen look. Extend it everywhere and pick a fixed ladder — 6 / 8 / 10 / 12 sides, never 16, never
24, never a smooth-shaded cylinder. Consistency is what reads as intent.

**D. Snap detail to a grid.** Low-poly reads "made on purpose" when its dimensions look chosen.
`architecture.ts` currently mixes `.012`, `.023`, `.024`, `.045`, `.055`, `.065`, `.075`, `.10`,
`.13` in the same block of code. Pick a ladder — **0.05 m for trim, 0.1 m for detail, 0.25 m for
structure** — and put every new dimension on it. This costs nothing and changes everything.

**E. Blocking over texturing.** Push the difference *between* material tags up and the noise
*within* a tag down: lower normal-map strength, raise albedo separation. Thirty tags of muted
mid-tone (§6) is mud at night. Fewer, bolder, flatter surfaces; let geometry and light do the work
that a texture is currently failing to do.

**F. Light is the composition, and today it is a colour soup.** 41 practical lights in **24
distinct hex colours** (warm 26 / cool 13 / neutral 2). A map with a vibe has **two or three
signature hues plus the moon** — e.g. sodium amber, cold mercury, one accent used only on
landmarks. Put them in a named constant table in `map.ts` and make every `LightHint` reference a
name, not a one-off hex. Then use them structurally: the same hue means the same *kind of place*
everywhere on the map, so colour tells a player where they are.

**G. Emissive is the star at night, and it is free.** Neon, tube lights and signs draw with
emissive materials that need no light (`props.ts`), and the HIGH/ULTRA graphics presets add bloom
(`docs/GRAPHICS.md`). Signage, window glow, machine LEDs and floor spill are the cheapest vibe in
the engine. Rule: an emissive fixture either has a matching practical light, or is deliberately
dead — never accidentally dead (§7.3).

**H. Fog and sky are two dials that restyle the whole map for nothing.** `scene.fogMode = EXP2`,
`fogDensity = 0.012`, `fogColor = (0.035, 0.035, 0.05)`; the sky is a four-stop gradient dome
`#05060c → #0a0c18 → #1c1723 → #2a2022` (`MapBuilder.ts`, `buildSky`). Stronger, more coloured fog
turns distance into readable depth bands — the single most "stylised" lever available. Tune it
deliberately and say in the commit why.

**What NOT to do:** more window rows, more brick variation, grime decals, higher texture
resolution, smooth-shaded round things, per-object materials. Every one of those is a step toward
the failed realism the owner named.

---

## 3. Hard rules (violate any of these and the work gets reverted)

- **Do not touch `PLAYER`** (`packages/shared/src/constants.ts`). It drives server-authoritative
  collision and hitscan. Nothing about a map's look may change it.
- **Collision is the box.** `Solid.box` is what the server ticks and what the client predicts
  against. Visual dressing lives *inside or around* the box (`dressing.ts` docblock). A chamfer, a
  cornice or a sign never changes a `box`. If a box must move for gameplay reasons, that is a
  layout change — see the walk-grid tests in §8.
- **No new `PlayerState` / Colyseus schema fields.** Ask the owner first.
- **No balance changes**: no weapon damage, no `WeaponDef` numbers, no tick rate, no snapshot
  rate. `ARCHITECTURE.md` locks these (L6).
- **Do not create a pull request** unless the owner asks for one.
- **Identifiers and comments in ENGLISH. Player-visible text in POLISH.**
- **Babylon via deep imports only** — `@babylonjs/core/Materials/standardMaterial`, never
  `import { X } from "@babylonjs/core"`.
- **Module docblocks explain WHY** — the decision and the evidence, not a restatement of the code.
  Every file you touch already does this; match it.
- Pure, testable logic goes in `packages/shared` or in a Babylon-free module. Client tests run in
  **node vitest** — no jsdom, no `@testing-library`.
- **Run ONE Playwright suite at a time.** Two runs against one Colyseus server produce failures
  belonging to no run.
- **`docs/PLAN_2_1.md` ritual is mandatory** — §11.

---

## 4. Where everything is

### The map data (server + client, shared)

| File | Lines | What it is |
|---|---|---|
| `packages/shared/src/map.ts` | 626 | Types + `NIGHT_DISTRICT` itself. **This is the main file.** |
| `packages/shared/src/districtExpansion.ts` | 86 | The two side blocks (depot / cafe) bolted on at `map.ts:594`. |
| `packages/shared/src/gora.ts` | 328 | The *second* map. Not in scope, but every generic test loops both. |
| `packages/shared/src/mapWalk.ts` | 87 | Walk grid: 0.5 m cells, real step height, jump-up ≈ 0.88 m. |
| `packages/shared/src/floorAudit.ts` | 105 | Coplanar-face + site-load audit (see §8). |
| `packages/shared/src/plans.ts` | ~120 | Tactical plans — **removes solids BY NAME** (see §8.3). |
| `packages/shared/src/bomb.ts:8` | — | `BOMB_SITES` = A `DEPOT` (−35, 24), B `COURTYARD` (43, 24). |

`map.ts` navigation — the `NIGHT_DISTRICT` IIFE starts at line 140 and its sections are:

```
 17  MaterialTag union (30 tags)          153  Ground slabs
 30  SolidLook union (17 looks)           165  Perimeter facades
 34  interface Solid                      171  Core ceilings + parapets
 46  PropKind union (29 kinds)            180  Barber shop        (x −4..8,  z 0..10)
 51  interface PropHint                   207  Neighbour unit     (x 8..20,  z 0..10)
 63  interface LightHint                  236  Back hall          (x −4..8,  z 10..18)
 85  interface MapDef                     246  Storage + stairs   (x 8..20,  z 10..18)
111  S()  — plain solid helper            271  Alley              (x −14..−4, z 0..18)
114  O()  — dressed solid helper          283  Backlot            (x −27..−14, z 0..28)
117  NIGHT_DISTRICT docblock + ASCII      310  East block         (x 20..35, z 0..18)
140  the IIFE starts                      340  Main street        (z −22..0)
146  W/H/HX/HP/MEZ/X0/X1/Z0/Z1 constants  377  Loading yard       (z 18..36)
                                          419  North compound     (z 36..45)
                                          430  Props (125)
                                          528  Lights (41)
                                          569  Spawns (16)
                                          577  Buy stations (3)
                                          585  Domination flags (3)
                                          594  expandDistrict(...) — the two side blocks
                                          604  MAPS registry, DEFAULT_MAP_ID
```

Constants inside the IIFE: `W = 0.3` (wall thickness), `H = 3.6` (shop / back-hall ceiling),
`HX = 6.0` (industrial ceiling), `HP = 7.0` (perimeter facade height), `MEZ = 3.0` (mezzanine
deck), `X0 = −27, X1 = 35, Z0 = −22, Z1 = 45` (the original playable extents; the expansion
widens the world to x −46..54).

Coordinates: **+X east, +Y up, +Z north. Yaw 0 looks along +Z.** Player origin is at the feet.

### The client renderer

| File | Lines | What it does |
|---|---|---|
| `apps/client/src/game/world/MapBuilder.ts` | 327 | `buildMap()` — solids → merged meshes, lights, shadows, sky, fog. |
| `apps/client/src/game/world/materials.ts` | 669 | One PBR material per `MaterialTag`, textures generated procedurally. |
| `apps/client/src/game/world/dressing.ts` | 275 | A `Solid` with a `look` becomes an object (17 cases). |
| `apps/client/src/game/world/props.ts` | 405 | `PropHint` → visual-only geometry (29 kinds), instanced where repeated. |
| `apps/client/src/game/world/architecture.ts` | 98 | **NIGHT_DISTRICT-only** surface detail, literal coordinates. |
| `apps/client/src/game/world/streetscape.ts` | 77 | **NIGHT_DISTRICT-only** perimeter buildings, driven by solid NAMES. |
| `apps/client/src/game/world/models.ts` | 358 | Optional glTF override per look (empty at runtime today). |
| `apps/client/src/game/world/postfx.ts` | 74 | FXAA / bloom / sharpening presets — see `docs/GRAPHICS.md`. |

---

## 5. How the pipeline works (data → pixels)

Read this before editing; three of the rules here are invisible from the map file and all three
have bitten someone already.

**5.1 A solid becomes geometry in one of three ways** (`MapBuilder.ts:106-145`):

1. **Named in `opts.toggleable`** (a tactical plan's target) → built standalone, unmerged, and
   deliberately *not* a shadow caster, because the moon shadow map is baked once and a wall that
   can vanish mid-round would leave its shadow behind.
2. **Has a `look`** → `dressSolid()` draws it as an object (wheels, ribs, lids, doors). Its
   collision box is untouched.
3. **Plain** → a box, cut into ≤ 12 m tiles, with world-anchored UVs at 1 texture unit per metre
   (`applyWorldUVs`) so a new box tiles correctly with no UV work.

**5.2 Merging decides your draw calls.** Meshes are grouped by `(MaterialTag, zone)` and merged,
one draw call per group. Structural tags use **12 m** zones; "detail" tags matching
`/^(metal|rubber|brass|glass_dark|wood|soil|foliage|paint|corrugated)/` use **24 m**. The comments
in `MapBuilder.ts:76-90` carry the measurements: 6 m zones cost **663 draw calls** in the street
view, 8/16 m cost **443**, 12/24 m roughly halves that. **Consequence for you:** a new
`MaterialTag` is a new mesh in every 12 m zone it appears in. Adding tags is not free — reuse
before you invent, and if you add one, expect to justify it with a draw-call measurement.

**5.3 Lighting has a hard cap and it is already exceeded.** Map materials set
`maxSimultaneousLights = 5` (`materials.ts:131`), props set 4. Babylon does not cull lights by
range, so `buildMap` excludes, per light, every static mesh its range sphere misses
(`MapBuilder.ts:241-258`) — that took the average from 19 lights per mesh down to ~3. But
`PLAN_2_1.md`'s Deferred list records `maxLightsPerMesh` measured at **45** on the worst mesh, so
on that mesh only 4–5 of 45 in-range lights actually light it, chosen by list order — **lighting
can visibly pop as a player crosses the map.** The named fix is per-light `includedOnlyMeshes` in
the map data. If you rework the lights (§2.F), this is the moment to fix it, and it is a look
problem, not a speed one.

Also: `LIGHT_GAIN = 1.4` multiplies every practical; a hemispheric ambient at 0.48; one directional
"moon" that is **the only shadow caster**, rendered **once** (`REFRESHRATE_RENDER_ONCE`) because
the world is static — characters cast no moon shadow by design. Meshes tagged `glass`, `mirror`,
`fence` or `floor*` are excluded from casting.

**5.4 Two client modules are hard-wired to this map's names and coordinates.** This is the biggest
trap in the job.

- `hasDistrictDressing(map)` (`MapBuilder.ts:55`) gates `architecture.ts` + `streetscape.ts` to
  `night_district` — on GÓRA they were measured as **206 boxes of street furniture floating in
  mid-air**.
- `streetscape.ts` finds walls by **name regex** `^(south_facade|north_facade|extension_(south|north|edge)_|lane_wall_)` **and** `box.maxY >= 7`, then builds a whole facade off the box it found.
- `architecture.ts` finds trim targets by `^(shop_|bh_)` + `mat.startsWith("wall")` + `box.minY <= 0` + `min(w, d) <= 0.35`, and furniture targets by
  `^(station_\d|reception_counter|display_island|product_shelf|workbench|shelving_unit|rack)$`.
  Everything else in it is **literal coordinates** — a shop cornice at x 1.85, garage shutters at
  x −24.4 + 4.2·i, warehouse bands at x 10/12/14/16.

**So: move or rename a solid and its dressing silently detaches and floats.** Nothing tests this
except a count (`districtDressing.test.ts` asserts `> 200` pieces). If you move walls, you must
re-render and look (§9).

**5.5 The type system helps you in exactly one place.** `SPECS` in `materials.ts:35` is a
`Record<MaterialTag, Spec>`, so a new tag **fails `pnpm typecheck`** until you give it a surface
spec. `SolidLook` and `PropKind` have no such guard: `dressing.ts:272` ends its switch with a
`default:` that draws the plain box, so a new look you forget to implement degrades to a painted
box instead of failing — quiet, not loud. Check the render, not the compiler.

---

## 6. The map as it is today (measured 2026-09-10)

```
night_district "Night District"
  bounds 100 × 69 m (y −2..10), killY −10, solid extent x −45.3..53.3, z −22.3..45.3, tops 0..7 m
  370 solids (all named, 0 invisible, 78 dressed) · 125 props · 41 lights (7 spot, 2 shadow-flagged,
  24 distinct colours, intensity 1.1..32, range 5..14) · 16 spawns + 8 arena · 3 stations · 3 flags
  floor audit: 0 exact coplanar pairs, 0 near pairs (clean — keep it that way)
  site load: A 9 solids + 1 prop, B 4 + 1  (budget is 30; both sites are nearly bare)
```

Material use, most to least: `metal 82 · wall_concrete 42 · floor_concrete 31 · wall_plaster 27 ·
wood 24 · wall_sand 17 · wall_brick 16 · paint_blue 13 · wall_teal 13 · paint_green 12 ·
floor_metal 9 · paint_white 9 · wall_tile 8 · paint_yellow 8 · ceiling 7 · counter 6 · leather 5 ·
paint 5 · concrete_block 5 · fence 5 · corrugated_blue 4 · paint_red 4 · corrugated_red 4 ·
glass 3 · corrugated_green 3 · floor_asphalt 2 · floor_tile 2 · wall_panel 2 · floor_wood 1 ·
paint_orange 1`

Dressed looks: `crate 14 · dumpster 8 · planter 8 · cabinet 7 · car 7 · bin 6 · pallets 5 ·
portacabin 5 · container 4 · kiosk_counter 3 · machine 2 · drums 2 · van 2 · truck 2 · lockers 1 ·
shelter_roof 1 · skip 1`

Props: `lamp 18 · sign 14 · tube_light 14 · bottle_row 8 · poster 8 · trash 7 · graffiti 7 ·
neon 6 · vent 5 · pipe 4 · crate 3 · barber_chair 3 · mirror 3 · clippers 3 · board 3 · sticker 3 ·
pendant 3 · towel_stack 2 · terminal 2 · shelf/receipt/counter_top/barber_pole/sink/cable/ac_unit/pole/wheel 1 each`

### 6.1 Density by area — this is where "the whole map" is decided

| area | extent | m² | solids | props | lights | solids/100 m² | dressed objects |
|---|---|---|---|---|---|---|---|
| WEST EXT (depot / site A) | x −46..−27, z −22..45 | 1273 | 35 | 5 | 2 | **2.7** | container, crate, planter, dumpster, portacabin |
| EAST EXT (cafe / site B) | x 35..54, z −22..45 | 1273 | 32 | 8 | 2 | **2.5** | crate ×2, planter, dumpster, portacabin |
| MAIN STREET | x −27..35, z −22..0 | 1364 | 42 | 21 | 11 | 3.1 | planter ×5, car ×3, cabinet ×3, van ×2, bin ×2, kiosk_counter ×2, crate ×2, truck, shelter_roof |
| BACKLOT (garages, kiosk) | x −27..−14, z 0..28 | 364 | 31 | 11 | 4 | 8.5 | kiosk_counter, dumpster, crate, pallets, bin, cabinet |
| ALLEY | x −14..−4, z 0..18 | 180 | 14 | 8 | 2 | 7.8 | bin ×2, dumpster, pallets |
| BARBER SHOP | x −4..8, z 0..10 | 120 | 19 | 29 | 4 | 15.8 | — |
| NEIGHBOUR UNIT | x 8..20, z 0..10 | 120 | 29 | 5 | 1 | 24.2 | pallets, machine, lockers, drums |
| BACK HALL | x −4..8, z 10..18 | 96 | 10 | 6 | 1 | 10.4 | cabinet, bin |
| STORAGE + MEZZ | x 8..20, z 10..18 | 96 | 28 | 4 | 2 | 29.2 | crate ×2 |
| EAST BLOCK (car park, wash, gantry) | x 20..35, z 0..18 | 270 | 39 | 7 | 3 | 14.4 | car ×3, portacabin, machine, dumpster |
| LOADING YARD | x −14..35, z 18..36 | 882 | 63 | 15 | 7 | 7.1 | crate ×4, container ×3, pallets ×2, dumpster ×2, car, drums, planter, cabinet, truck |
| **YARD WEST** | x −27..−14, z 28..45 | 221 | **6** | **0** | **0** | **2.7** | crate |
| NORTH COMPOUND | x −14..35, z 36..45 | 441 | 16 | 6 | 2 | 3.6 | portacabin ×2, skip, dumpster, crate, cabinet |

Read that table as the work list. **YARD WEST is 221 m² of walkable ground with six solids, no
props and no lights** — a corridor of nothing between the backlot and the north compound. The two
extension blocks are 2 546 m² between them at a third of the interior density; they are where the
bomb sites live and they read as car parks with a shed in them. Meanwhile the neighbour unit and
the storage/mezzanine are at 24–29 solids per 100 m². That spread — 2.5 to 29 — *is* the "map
doesn't make sense" complaint in numbers.

### 6.2 How it plays (measured in `docs/MAP_2.md` §1–2, by `apps/client/e2e/tools/map-rotation.ts`)

24 751 walkable cells (5 110 m² reachable) · **median clear sight line 24.0 m** · 36.6 % of clear
lines over 30 m · longest 111 m · spawn → first contact 8.0 s · bomb A ↔ B rotation 10.9 s. It is
a map of long lanes, and the long guns own every one of them. **Do not change that identity** —
GÓRA exists to be the close-quarters map. Improving readability must not quietly turn the district
into a second GÓRA; if a change would close a lane, say so and ask.

---

## 7. Defects already found in the data — start here

All of these were found by running the map data, not by looking at a screen. Coordinates are exact.

**7.1 Six street lights are inside their own lamp posts.** Each `lamp_post_*` solid is a metal
post spanning y 0..3.6, and the spot light sits at **y 3.5 — 10 cm inside it**, so the fixture is
lit from within a metal cylinder instead of from the head at y 3.6+:

```
spot @ (−9, 3.5, −4.5)    inside lamp_post_-9_-4.5
spot @ (4, 3.5, −6)       inside lamp_post_4_-6
spot @ (18, 3.5, −4.5)    inside lamp_post_18_-4.5
spot @ (−14, 3.5, −19.5)  inside lamp_post_-14_-19.5
spot @ (12, 3.5, −19.5)   inside lamp_post_12_-19.5
spot @ (30, 3.5, −4.5)    inside lamp_post_30_-4.5
```

**7.2 Two more lights are inside geometry.** `point @ (26, 2.8, 11.6)` sits inside the `gantry`
deck slab (`floor_metal`, y 2.75..3) — the walkway is lit from inside itself. `point @ (3, 5,
23.5)` sits exactly on the top face of `container_top` (y 2.5..5), so it grazes the surface it
stands on.

**7.3 A wall lamp with no light.** `lamp(variant: "wall") @ (−4.35, 2.9, 15)` — its nearest
practical is **3.68 m away** and a different colour. Its twin at (−4.35, 2.9, 7) has one at
0.35 m. One of the two fixtures in the back hall is simply dark.

**7.4 22 % of the walkable floor has no practical light in range.** Sampling the ground on a 4 m
grid: 301 lit samples, **83 dark**. The dark band is not scattered — it is whole regions:

- the west extension's south approach and north strip (x −44..−28, z −20..−4 and z 32..40),
- the east extension's south approach (x 24..36, z −20..−16) and its north-east corner (x 32, z 28..40),
- the north compound edges (x −24..−16 and x 4..8, at z 36..40).

Those players are lit by the moon and the hemispheric ambient alone. That is the single biggest,
cheapest "vibe" win available (§2.F, §2.G).

**7.5 The light palette is 24 hex values for 41 lights.** `#83d9ed #8f6cff #8fa3c4 #a9b8d6 #b9c8e6
#c8e1ef #c9d4ea #cce7d8 #cfe0ff #d6e8e4 #d8ecff #e8f0ff #eaf4ff #ff6aa0 #ffb070 #ffb86a #ffc18a
#ffc98a #ffc9a0 #ffd0a0 #ffd29d #ffd2a0 #ffd7aa #fff0d8` — warm 26, cool 13, neutral 2. Eleven of
those are near-duplicate warms that no player will ever tell apart, and no rule connects a colour
to a kind of place.

**7.6 Both bomb sites are nearly bare.** Site A holds 9 solids + 1 prop, site B holds 4 + 1,
against a budget of 30 (`floorAudit.test.ts`). The sites are where a round is won and they have the
least to look at and the least to hide behind on the map.

**Clean, and to be kept clean:** 0 coplanar floor pairs, 0 near-coplanar pairs, 0 duplicate boxes,
0 degenerate solids, 0 solids fully buried inside another, 0 stacked props. Whatever you add, the
audit must still report zero (§8.2).

---

## 8. What will fail if you get it wrong

These run under `pnpm test`. They are your specification, not an obstacle.

**8.1 `packages/shared/src/map.test.ts` (loops every map).** Both teams have ≥ 6 spawns; every
spawn stands on a floor with a free player-sized volume; every arena spawn too; all spawns mutually
reachable on the 0.5 m walk grid (real step height, ≈ 0.88 m jump-up, any drop); **no team-0 spawn
may see a team-1 spawn eye-to-eye**; props inside bounds and not buried in an opaque solid;
**wall-mounted props must touch a wall and floor-standing props must have ground under them**
("nothing floats" — from a real playtest report); ≥ 3 buy stations, reachable, out in the open,
spread > 30 m in x; no two same-material solids overlapping by more than 0.35 m on all three axes.
Plus: the Ostrzyżeni chaser must always have a legal respawn, and no spawn may stand inside a
Domination capture zone.

**8.2 `floorAudit.test.ts`.** Zero coplanar top faces (exact **and** within 5 mm) sharing more than
0.25 m². This is the "the floor at A and B lags" bug: two walkable surfaces at the same height over
the same ground z-fight and the whole shared footprint shimmers. **The most likely way to break the
map is to lay a new paving slab over an existing one.** `districtExpansion.ts:8-13` carries the
story. Also caps each bomb site at 30 solids + props within 7.5 m — you have room to dress the
sites (§7.6), but not unlimited room.

**8.3 `plans.test.ts`.** The three tactical plans remove solids **by name**: `roller_door`,
`alley_wall_m`, `lookout_step_0..9`. A test asserts every name still exists, and further tests
assert that with each plan applied all spawns stay reachable and no spawn sees an enemy spawn.
**Rename one of those solids and the suite goes red** — which is the good case; the names to be
careful with are the ones *nothing* checks (§5.4).

**8.4 `mapFlags.test.ts`** — three flags A/B/C on reachable open floor, > 4 × `DOM.radius` apart.
**`districtExpansion.test.ts`** — every arena spawn and both bomb sites reachable with real body
clearance, each site pathable from both teams (≥ 6 paths each) and a site-to-site rotation exists.
**`navPerf.test.ts`** — 40 A* searches over the district's real walk grid must average < 8 ms
(bots re-plan on a 16.7 ms tick). **`movement.feel.test.ts:194`** pins the stair solids by the
name pattern `^stair_(\d+|landing)$`. **`collision.grid.test.ts` / `collision.bench.test.ts`** use
the district's boxes as their fixture, so a large change in box count moves those benchmarks.
**`districtDressing.test.ts`** asserts the district still gets > 200 dressing pieces and GÓRA gets 0.

**8.5 Not covered by any test, and therefore yours to check by eye:** whether the dressing in
`architecture.ts` / `streetscape.ts` still lands on the walls it was written for (§5.4).

---

## 9. Tools — how to see it and how to prove it

**Run the game** (two servers; client :5174, server :2567):

```
FB_DEV_TOOLS=1 pnpm dev
```

**Render the map with no networking, HUD or characters** — this is the review surface:

```
# with the dev server up:
open http://localhost:5174/map-review.html        # drag to look; camera has no collision
```

`apps/client/map-review.html` builds the real map through `buildMap()` and exposes
`window.review = { scene, engine, camera, view(pos, target) }`.

**Capture the six standard views + metrics** (draw calls, active meshes, vertices, lights,
textures — written to `metrics.json`):

```
SHOT_DIR=apps/client/e2e/out/map1/before node apps/client/e2e/tools/map-review.mjs
```

The six views are `street`, `perimeter`, `shop`, `yard`, `depot`, `overview`. Rendering is
SwiftShader, so the numbers compare **geometry and draw calls, not hardware FPS** — never quote a
frame time from it.

> **Snag to expect:** `map-review.mjs` launches with `channel: 'chrome'`, which needs real Chrome
> installed. Every other tool in this repo instead honours `PW_CHROMIUM` (see
> `apps/client/playwright.config.ts` and `e2e/tools/body-shots.mjs`). If Chrome is not present,
> make `map-review.mjs` follow the same convention — `executablePath: process.env.PW_CHROMIUM ||
> undefined`, `channel: process.env.PW_CHANNEL` — rather than working around it.

**Measure the map as data** (sight lines, rotations, walk grid) with the real shared simulation:

```
./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-rotation.ts > apps/client/e2e/out/map1/rotation.md
./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/map-plan.ts     > apps/client/e2e/out/map1/plan.txt
```

**Graphics presets** — `docs/GRAPHICS.md`: LOW none / MEDIUM FXAA / HIGH bloom + FXAA / ULTRA
+ sharpening, brightness 75–150 %, shadows off / 1024 / 2048. **Judge the map on MEDIUM as well as
ULTRA.** A look that only works with bloom is not a look.

All tool output goes under `apps/client/e2e/out/` (gitignored), never into chat. `PLAN_2_1.md`'s
locked decision **L3** applies to maps too: *a visual claim is proven numerically plus a screenshot;
"looks fine to me" is not evidence.*

---

## 10. Suggested sequence

1. **See it first.** Render the six views into `e2e/out/map1/before/` and keep `metrics.json`.
   That is your baseline for draw calls and your before/after evidence. Walk the map in
   `map-review.html` and write down, per area from §6.1, what it is supposed to be and what it
   actually reads as. This step is not optional and it is not slow.
2. **Fix the found defects** (§7.1–7.3). Small, safe, provable; gets you inside the data.
3. **Light rework** (§2.F, §7.4, §7.5): a named palette in `map.ts`, two or three signature hues,
   coverage for the 83 dark samples, and — if you take it on — per-light `includedOnlyMeshes` to
   kill the 45-lights-per-mesh popping (§5.3).
4. **Materials and fog/sky** (§2.E, §2.H): fewer, flatter, better separated; the two global dials
   tuned deliberately.
5. **Silhouettes and blocking, area by area** (§2.A–D), working down §6.1 from the emptiest:
   YARD WEST, the two extensions, the north compound, main street. One commit per area, each with
   a why in the body.
6. **Dress the two bomb sites** (§7.6) within the 30-item budget.
7. **Re-render into `after/`**, diff the metrics, and put the before/after pair in the ledger row.

Keep commits small and single-concern; the message subject is imperative and the body says *why* —
the mechanism and the measurement, not a list of what changed.

---

## 11. Definition of done

```
pnpm typecheck      ✓
pnpm test           ✓        (shared + client + server)
pnpm build          ✓
pnpm check:weapons  ✓ 19/19  (nothing here should touch weapons — prove it)
```

Plus, specific to this job:

- `apps/client/e2e/out/map1/before/` and `.../after/` — the six views and both `metrics.json`.
  **Draw calls must not regress**; if they rise, the reason is stated and measured.
- `floorAudit` still reports **0 coplanar pairs** and both sites inside budget.
- The map still plays as the long-lane map: sight-line distribution from `map-rotation.ts` in the
  same ballpark as §6.2 unless a change was argued for and approved.
- One e2e suite run (`pnpm test:e2e`), **alone** — nothing else on the machine.

**The `PLAN_2_1.md` ritual, before the final report:**

1. Append **one ledger row**: date, drop letter, branch, what the session did, evidence paths,
   `typecheck/test/build/e2e` each ✓ or ✗, status word (`planned` / `in progress` / `blocked: why`
   / `review` / `done`).
2. Append anything decided to the **Decisions log**, dated and signed.
3. Append anything noticed and *not* done to **Deferred** — one line, immediately, then continue.
4. Commit the plan change on its own with subject `plan: ledger <date> drop <letter>`.
5. Then report to the owner in ≤ 20 lines. No code in the report.

---

## 12. Stop and ask the owner

- Any change that **closes or opens a lane**, moves a spawn, or shifts the median sight line — that
  is the map's identity (§6.2).
- Any change to `PLAYER`, a schema field, tick/snapshot rate, weapon numbers, or gating (L1–L7).
- Removing an area, or merging two areas, rather than improving them.
- Adding more than a couple of new `MaterialTag`s (§5.2 — each one is draw calls in every zone).
- Replacing procedural surfaces with external texture assets. `L4`'s spirit and this repo's whole
  pipeline are "no downloaded assets"; that is the owner's call, not yours.

---

*Prepared 2026-09-10 against `0b18328`. Measurements in §6 and §7 are reproducible with the
commands in §9 and with `tsx` over `packages/shared/src/map.ts`.*
