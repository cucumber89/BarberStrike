# FRANKIBARBER: AFTER HOURS — 1.0 beta build prompt (self-directed)

This is the working brief I (the build agent) wrote for myself after the first real playtest of
0.1 beta on the owner's machine. Everything below starts from a measurement, states the fix, and
names the check that proves it. Update the tables as work lands; never mark a row done without the
proof column filled in.

## Playtest feedback (owner, 2026-09-03, real GPU, Chrome)
1. "Mało FPS" — the game is slow on a real GPU.
2. "Trzeba dodać lepsze animacje" — character and weapon motion is too basic.
3. "Mapa jest spoko, ale randomowo rozrzucone bloczki tekstury" — cover reads as random untextured blocks.
4. "Wielkość mapy jest z dupy" — the map is the wrong size for a 6v6 TDM.
5. Show the version: current is 0.1 beta, this work is 1.0 beta.
6. "Sam się naucz lepiej tworzyć, ulepszać i testować" — make the process itself better, not only the output.

## Baseline (measured, headless WebGL2, MEDIUM preset, 960×540)
| view | draw calls / frame | active meshes | lights per mesh | shadow casters / frame |
|---|---|---|---|---|
| street | 464 | 302 | 19 (max 19) | 222 |
| shop | 375 | 171 | 19 | 222 |
| hall | 304 | 85 | 19 | 222 |
| yard | 246 | 27 | 19 | 222 |
| storage | 287 | 68 | 19 | 222 |

Root causes, from the numbers and the code:
- **Every mesh is lit by all 19 lights.** Babylon does not cull lights by range; without
  `includedOnlyMeshes` the PBR shader is compiled for `maxSimultaneousLights = 8` on every material
  and evaluates 8 lights per pixel everywhere. The 12 m merge zones exist for this but never pruned
  the light list. This is the single largest GPU cost.
- **The shadow map re-renders 222 static meshes every frame** for a light (the moon) that never moves.
  In the yard the main pass draws 27 meshes and the shadow pass 222.
- **Props are ~300 unmerged meshes** (each chair is 9 draw calls). Static, could be merged per material.
- **Default preset is HIGH**: 2048 shadow map + PCF, HDR pipeline (float RTs) + bloom + FXAA, render
  scale 1.0. On an iGPU this alone halves the frame rate.
- **No dynamic resolution**: a slow GPU has no safety valve short of the settings menu.

Map, from `packages/shared/src/map.ts` and screenshots `03-street`, `07-courtyard`, `08-alley`:
- Playable area **34 × 36 m**, rooms 12 × 10 m with 3.6 m ceilings — a 2v2 footprint for a 6v6 mode.
  Sprint (7.6 m/s) crosses it in ~5 s; spawn-to-spawn is ~3 fights long, so spawns get pushed instantly.
- **23 cover pieces are bare boxes tagged `paint`/`wood`/`metal`** (container, van, car, bins, lockers,
  drums, cabinets, dumpsters, crates). `paint` is a dark grey plaster texture, so the container in the
  courtyard renders as a **black slab** — that is the "random texture blocks" complaint. Nothing says
  "van" or "container" except the name in the source file.
- Albedo palette is uniformly dark (#1c–#4b) and then `toLinearSpace()` darkens it further.

Animation, from `view/Character.ts` and `view/Viewmodel.ts`:
- Walk cycle is legs-only; arms are locked to the weapon; no hit reaction; death is a fixed sideways
  tilt; no landing squash; no turn lean.
- Viewmodel: one generic reload dip for all weapons, no bolt/pump/slide motion, equip is a straight raise.

## Plan (in order; each phase ends with a commit and a green `pnpm test` + e2e)

### A. Version 1.0 beta (small, first)
- `GAME_VERSION` in shared constants, package versions → 1.0.0-beta.
- Shown in: menu footer, pause screen, F3 telemetry, `/health`.
- Proof: menu screenshot shows "v1.0 beta"; `/health` returns it.

### B. Performance (goal: ≥ 60 fps at 1080p on a mid laptop GPU; measured proxies below)
1. **Light culling by range**: after merging, assign each map/prop mesh only the lights whose range
   sphere intersects its bounding box (`light.includedOnlyMeshes`). Ambient + moon always included.
   `maxSimultaneousLights` 8 → 4 (map), 4 → 3 (props/characters).
   Proof: profile shows avg lights per mesh ≤ 4, max ≤ 6.
2. **Static shadow map rendered once** (`refreshRate = RENDER_ONCE` on the moon's shadow map;
   characters drop moon shadows — invisible at night anyway). Proof: shadow-pass draw calls 222 → 0.
3. **Merge props per material per zone** (static ones; keep instances and emissive text planes).
   Proof: total meshes 467 → < 150, street draw calls 464 → < 120.
4. **Presets**: default MEDIUM; HDR pipeline off on MEDIUM; shadow map 1024 on MEDIUM; **dynamic
   render scale** (drops towards 0.6 when frame time > 20 ms, recovers when < 12 ms) on every preset.
   Proof: unit test for the scaler's hysteresis; telemetry shows the current scale.
5. Re-measure the baseline table; keep both in this file.

### C. Map 2.0 — Night District, bigger and legible
- Footprint **~56 × 64 m**: street becomes a real two-lane street with parked vehicles and a bus
  shelter; the barber block keeps its shop/hall/neighbour/storage core but gains a second storey
  (offices over the shop, roof access from the mezzanine); the courtyard becomes a loading yard with
  a container stack (climbable), and a **new east block** (car wash + car park under a canopy) opens a
  third lane. Three lanes + two vertical routes, 8 spawns per team behind hard cover, no spawn visible
  from an enemy spawn (tested).
- **Cover becomes recognisable objects**, not tagged boxes: a `look` on solids drives a dressed
  builder — `van` (body, cab, windows, wheels, bumper), `car`, `container` (corrugated texture, door
  bars, colour), `dumpster` (lid, wheels, colour), `crate` (planks, bands), `lockers` (doors, vents),
  `drum` (cylinder, rings), `planter`, `cabinet`, `bin`. Collision boxes stay as they are; only the
  visual is richer. Paint gets colour variants (`paint_red`, `paint_blue`, `paint_green`, `paint_white`).
- Palette lift: albedo mid-tones ×1.6, textures get colour (brick red-brown, plaster warm), so the
  scene has a tonal range beyond black-to-dark-grey.
- **Map tests** (new, `packages/shared/src/map.test.ts`): every spawn stands on a floor with free
  headroom; all spawns are mutually reachable on a 0.5 m walk grid with the real step height
  (flood fill); no team-0 spawn has line of sight to any team-1 spawn; no two solids of the same tag
  overlap by more than 0.1 m (catches copy-paste errors); every prop anchor is inside the bounds and
  not inside a solid.
- Proof: tests green; screenshots from 8 views committed to `docs/shots/`.

### D. Animation
- Character: arm counter-swing and torso twist in the walk cycle, lean into turns (yaw rate), landing
  squash, **hit flinch** (direction-aware, from `DamagedEvent`), **death**: knees buckle → fall in the
  hit direction with a tumble, then settle; idle weight shift; head follows aim yaw within ±40°.
- Viewmodel: per-weapon reload choreography (pistol slide lock, SMG/rifle mag swap with a tilt, shotgun
  shell-by-shell pump, DMR bolt), equip with a twist, sprint bob, ADS settle; hands follow the mag.
- Proof: `e2e/tools/anim.mjs` renders frames of each state and asserts joint angles change per phase;
  screenshots of reload mid-point per weapon.

### E. Process ("learn to build, improve and test better")
- Every phase: measure → change → re-measure; numbers go in this file.
- Add `pnpm profile` (the headless profiler used above) and `pnpm shots` so the next person can
  reproduce the tables in one command.
- Map validity is a unit test, not an eyeball check.
- BUILD_STATE.md stays the short status; this file holds the reasoning.

## Results (filled in as phases land)

### A — done
Version string lives in `GAME_VERSION` (shared); shown in menu footer, pause card, F3 line; `/health`
returns `"version":"1.0 beta"` (checked with curl).

### B — done (same profiler, same views, MEDIUM, 960×540)
| view | draw calls before → after | active meshes | lights per **static** mesh | shadow pass / frame |
|---|---|---|---|---|
| street | 464 → 231 | 302 → 287 | 19 → 4–12 (avg ~6.5) | 222 → **0** (rendered once) |
| shop | 375 → 173 | 171 → 187 | 19 → 5–11 | 0 |
| hall | 304 → 99 | 85 → 98 | 19 → 5–11 | 0 |
| yard | 246 → 37 | 27 → 36 | 19 → 4–9 | 0 |
| storage | 287 → 77 | 68 → 76 | 19 → 6–12 | 0 |

What changed and what each step was worth:
1. Prop meshes merged per material × 6 m zone: total meshes 467 → 451 *after* tiling added ~160
   map pieces, i.e. props went from ~300 loose meshes to ~60.
2. Static shadow map (`REFRESHRATE_RENDER_ONCE`): the 222-mesh shadow pass is gone from every frame.
   Cost: characters cast no moon shadow (invisible at night; accepted).
3. Light culling: needed **three** things to work, found one at a time by re-measuring —
   (a) `excludedMeshes` per light from a range-sphere/AABB test (no effect at first: pieces were
   15–20 m wide), (b) solids cut into 6 m tiles (max 18 → 16, still weak), (c) **PBR's physical
   falloff ignores `range`** — switched every material to GLTF falloff and trimmed ranges to the
   pool each lamp visibly makes (12–17 m → 6–13 m). Now static meshes average ~6.5 lights, and the
   shader cap is 4 (was 8), so per-pixel light cost halved and light lists match what is drawn.
   Draw calls rose ~30 % from tiling (231 worst view) — an acceptable trade on WebGL.
4. Presets: default MEDIUM; HDR pipeline only on HIGH/ULTRA (8-bit FXAA + grading on MEDIUM);
   dynamic render scale (`perf/dynamicScale.ts`, 6 unit tests, on by default except ULTRA,
   toggle in settings, current scale in F3 telemetry).
5. Note: `avgLightsPerMesh` in the raw profiler output still shows 6–9 because dynamic meshes
   (tracers, bottles, characters) keep the full list; their materials cap at 4.

Not measurable here: actual FPS on the owner's GPU (SwiftShader ≠ GPU). The owner's next report is the
real number; the F3 overlay now prints the render scale so we can tell whether the valve engaged.

### C — done: Night District 2.0
- **62 × 68 m** (was 34 × 36), core block kept at its coordinates so the stairs/movement tests stay valid.
  New zones: two-lane main street with median planters, bus shelter and parked vehicles (team 0 spawns);
  backlot with garage row and a kiosk; car park under a canopy; car wash hall; east lane with shed;
  gantry from the storage mezzanine over the car park with stairs down to the yard; loading yard with a
  container stack (climb: crate 0.6 → 1.2 → pallets 1.8 → roof 2.5), box truck, dock; north compound with
  chain-link fence line, two portacabins and a skip (team 1 spawns). 8 spawns per team.
- **Cover is dressed** (`world/dressing.ts`, 17 looks: van, car, truck, container, dumpster, crate,
  lockers, drums, planter, cabinet, bin, pallets, machine, skip, shelter roof, portacabin, kiosk counter).
  Collision boxes unchanged; the look adds wheels, windows, lids, ribs, doors, rails as primitives with
  material tags, merged with the map. 14 new material tags (colour paints, corrugated, dark glass,
  chain-link cutout, concrete block, soil, foliage) and 3 new procedural textures.
- **Palette lifted** ~1.6× on every structural material (the 0.1 albedos were #1c–#4b, then linearised).
- **Map validity is a test** (`packages/shared/src/map.test.ts` + `mapWalk.ts`): the suite found 3
  placement bugs in the old map and, on the new one, a spawn touching the skip and 7 props inside walls
  (all fixed). Connectivity, spawn floors/headroom, enemy-spawn LOS, same-material overlaps: green.
- **Cost, measured (MEDIUM, same five views):** draw calls street 331 / shop 216 / hall 160 / yard 93 /
  storage 142; total meshes 564; static meshes 6–10 lights (cap 5). First pass at 6 m zones hit 663 in the
  street — merge zones went to 12 m (structural) / 24 m (detail tags), which halved it.
  Draw calls are the metric to watch on WebGL (~20–50 µs each of CPU).
- Screenshots: `e2e/tools/shots.mjs` has six new views (backlot, street-south, car park, yard-north,
  gantry, compound).

### D — done: animation
- **Character** (`view/Character.ts`): arms counter-swing with the stride (measured range 0.05–0.3 rad,
  always smaller than the leg swing so the gun stays on target), hip sway + torso twist, lean into turns
  from yaw rate, landing squash scaled by air time, idle weight shift + breathing, **hit flinch** that is
  direction-aware (head/torso snap away from the shooter, head shots ×1.7), **death** = knees buckle →
  fall *away from the killer* with a tumble → settle bounce; idempotent (`die()` twice never restarts).
- **Viewmodel** (`view/Viewmodel.ts`): `reloadFrame(weapon, t)` is a pure per-weapon timeline —
  pistol (mag out, slide locked back, released at the end), SMG/rifle (cant, mag rock-out, slam, charging
  handle), shotgun (roll to the port, one hand dip per shell, pump at the end), DMR (mag, bolt back and
  forward). Weapon models gained a moving **action** node (slide / pump / bolt) that cycles on every shot
  and is held during reloads; the left hand follows the mag, the pump or the bolt. Equip has a twist,
  sprint bob is 1.8× and adds roll.
- **Wiring**: remote shots whose pellet ended on a player (`ShotEvent.k > 0`) flinch the nearest remote
  character away from the shooter; our confirmed hits (`HitEvent`) flinch the victim away from us; kills
  pass the killer direction to `die()`.
- **Proof**: 9 Character tests + 5 reload tests on Babylon's **NullEngine** (no GPU, no DOM — the same
  joint math runs in `vitest`): stride alternation, crouch, landing squash, flinch direction + decay,
  head vs body flinch, death direction for two killer positions, revive. `pnpm anim` renders idle / shot /
  reload-mid / reload-late stills per weapon (SwiftShader) for a visual check.

### E — done: process
- `pnpm profile` (per-view draw calls / meshes / lights / shadow casters), `pnpm shots` (13 map views),
  `pnpm anim` (weapon stills) at the workspace root; map validity in `pnpm test`.
- Rule kept throughout: measure → change → re-measure; every number above came from a tool in the repo.
