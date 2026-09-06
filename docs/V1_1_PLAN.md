# BARBERSTRIKE (ex FRANKIBARBER: AFTER HOURS) — 1.1 build prompt (self-directed, from the owner's answers)

Owner interview, 2026-09-03 (after the 1.0 beta playtest on a real GPU: 53 fps at HIGH with the dynamic
scale at 60 %). Every answer below is a decision; "drop" = a small release the owner plays and reviews.
Work order and proof rules from `V1_BETA_PLAN.md` still apply: measure → change → re-measure, map
validity and animation stay unit-tested, screenshots come from the tools in the repo.

## Decisions
| # | Topic | Decision |
|---|---|---|
| 1 | Aiming | ADS blocked firing (chorded LMB while RMB is held arrives as `pointermove`, not `pointerdown` — fixed). Hip pose low-right, sights never on the HUD crosshair; ADS aligns the weapon's aim point with the camera axis (solved, not eyeballed; measured 480/270 on 960×540 for all five weapons); HUD crosshair hides in ADS. |
| 2 | Map bugs | Floating signs/posters/lamps: fixed and now a unit test ("nothing floats"). Owner keeps reporting spots; each becomes a test where possible. |
| 3 | Art style | **Stylised low-poly** from CC0 packs (Kenney, Quaternius, Poly Haven) — fast, consistent, browser-friendly. |
| 4 | Licences | CC0 and CC-BY only, every file recorded in `ASSET_LICENSES.md`. Nothing ripped from commercial games. |
| 5 | Modes | Add **FFA** and **Domination** (3 flags). S&D later. |
| 6 | Economy | **Hybrid buy menu (B)**: open for 15 s after each spawn and at buy stations on the map. Money from kills, assists, objectives; carried through the match. |
| 7 | Shop | Weapons, armour, grenades, equipment, and **barber perks with a wink**: consumables (a flask of vodka, a joint, energy drink, a fresh fade) each giving a timed buff. Prices set from weapon stats. |
| 8 | Grenades & gear | Frag, flash, smoke, molotov, throwing knife; deployable shield, C4. Throw on G, cook by holding. Full throw/arc/explosion animation and VFX. |
| 9 | Weapons | Add: sniper with scope, LMG, second SMG, revolver, knife in hand (V) as melee, launcher. Attachments later. |
| 10 | Movement | Tactical sprint, lean around corners. (No slide/mantle this round.) |
| 11 | Killstreaks | None. Only the barber perks. |
| 12 | Progression | XP, levels, unlocks — **localStorage only** (no accounts). |
| 13 | Bots | Yes: fill teams; simple AI (nav grid from `mapWalk`, shoot on sight). |
| 14 | HUD/UI | Minimap with compass, scoreboard with K/D and ping, text chat, ping system (middle mouse). |
| 15 | Hosting | 5v5 max (10 players). Owner wants **player-hosted** games (one player runs the server, others join). Deferred: later drop = one-click host + join code; internet play needs port forwarding or a relay, documented then. |
| 16 | Cadence | Several small drops, each played by the owner before the next. |

## Drops (each ends green: `pnpm test`, e2e, `pnpm build`; each is pushed and reported)

### Drop 1 — fixes from the playtest ✔
- ADS firing, hip/ADS weapon placement, crosshair hidden in ADS, map float fixes + test, F3 draw calls
  per frame, spurious prediction "corrections" at spawn no longer counted.

### Drop 2 — buy menu, money, grenades ✔
What shipped (measured where it says so):
- **Economy** (`packages/shared/economy.ts`): start $2 000, cap $16 000; kill $300, head shot +$50, assist
  $150 (≥ 30 damage within 8 s — one rifle round is 27, so a graze is not an assist); prices pistol free /
  SMG 1 200 / shotgun 1 400 / rifle 2 600 / DMR 2 900; one primary + the pistol, replacing refunds 70 %;
  lethal and tactical slots hold one kind each, up to 2. Buy window: 15 s after every spawn, always in
  warm-up, and within 3 m of a **$ BUY** station (barber reception, kiosk, car-park booth — green neon).
  Everyone now spawns with the pistol; slots are 1 = primary, 2 = pistol, wheel cycles carried weapons.
- **Grenades** (`grenades.ts`): frag (3.2 s, cookable, 120→15 dmg over 6 m, LOS-checked), flash (1.7 s,
  strength by distance × view angle × LOS, up to 2.6 s blind), smoke (12 s cloud), molotov (breaks on
  impact, 6 s fire at 22 dps), throwing knife (70 direct, sticks in walls). One shared deterministic
  integrator (swept ray + sphere push-out + roll/rest) runs on the server (authority) and on every client
  (visual flight from the `ThrowEvent`, no per-tick sync); `BoomEvent` is authoritative and the visual waits
  for it. Server: rate limit 600 ms, slot check, 2.5 m origin check, in-hand detonation when over-cooked.
- **Client**: B toggles the shop (pointer released, movement off; refused with a hint when the window is
  closed); G takes the lethal in hand — the frag cooks with a ring around the crosshair, auto-releases with
  ~270 ms left; 4 throws the tactical. Viewmodel: gun drops to the hip, grenade rises, wind-back and
  overhand swing (180 ms — hides most of the RTT before the server's throw event). Third-person throw pose.
  VFX: fireball + sparks + dust + scorch + shared blast light, flash burst, smoke cloud (particle system,
  12 s), fire pool with flickering light (max 3), stuck knives (10 s). Audio: pin pull, swing, bounces by
  impact speed, explosion shaped by distance, flash crack + ring that scales with blindness, smoke hiss,
  glass + crackle, cash register / coin / buzz for the shop.
- **HUD**: wallet with `B · BUY (12s)` prompt, floating +$ toasts, grenade slots with counts, cook ring, white
  flash-out that fades with the blindness, kill feed and death screen name grenades, shop panel (cards with
  stats and blurbs, buy / sell / swap prices, live verdicts from the shared rules).
- **Tests**: shared 53 (economy, grenade flight incl. determinism, explosion/flash maths), server 43 (10 new:
  wallet reset, window/station rules, refusals, equip-only-owned, kill/assist pay, throw gating, frag
  damage + kill + pay, flash LOS/facing, molotov burn), client 24 (throwing controller: cook time incl.
  wind-up, auto-release stays under the in-hand rule, tactical on press, death drops it), e2e: buy via the
  menu, wallet, frag cook + throw + boom seen by both clients, flash-out.
- Deferred from the plan: the arc preview while cooking (needs a trajectory line; next drop), bot vision vs
  smoke (no bots yet).

### Drop 3 — barber perks, armour, new weapons ✔
What shipped (numbers are the ones in the code; the measured ones say so):
- **Perks** (`packages/shared/perks.ts`, consumed on purchase, one of each running at a time):
  **Flaszka** $500 — 20 % less damage for 25 s (a warm haze on the edges of the screen);
  **Zioło** $400 — 6 hp/s regeneration after 2 s without damage, for 30 s;
  **Energetyk** $400 — sprint ×1.15, walk ×1.08 for 25 s (predicted on the client from the replicated
  perk times, so no rubber-banding; measured in the room test: 1.10–1.20× sprint distance);
  **Świeży fade** $300 — armed until the next death: respawn 1 s sooner with a 3 s shield.
  HUD chips with countdown bars; a glowing hat band on the third-person character while any perk runs;
  gulp / lighter / can / clipper-buzz sounds when consumed.
- **Armour**: light plate $650 (50) and heavy $1 000 (100). A plate takes half of every hit until it is
  gone (27 rifle damage → 14 into the plate, 13 through), rings on hits and shatters with a sound and a
  HUD flash; lost on death. The hit marker turns blue on a plated hit; assists credit the full damage.
- **Weapons** (each with a procedural model, viewmodel pose, reload timeline, third-person model, voice):
  **R-44 Razorback** revolver $600 (slot 2, replaces the pistol; 55 dmg, swing-out reload);
  **VZ-9 Trim** SMG $1 300 (1 000 rpm); **MG-4 Bulk** LMG $2 800 (100-round box, 5.2 s reload, slow ADS);
  **SR-50 Longcut** sniper $3 400 (95 body / one-shot head; **scope overlay** replaces the gun in ADS,
  the reticle sways, **Shift holds the breath** for 4 s, then a winded 2 s with double sway — the sway is
  part of the aim so shots go where the reticle is); **GL-1 Blowout** launcher $3 200 (one shell through
  the shared projectile sim, 95 → 20 dmg over 4.5 m, goes off on bodies, break-open reload);
  **Clippers** (always carried, slot 3 / V; 45 dmg, **one-hit from behind**, no ammo, a lag-compensated
  2.1 m trace, broadcast as a swing without tracers).
- Shop reorganised: PRIMARY / SIDEARM / GRENADES / BARBER PERKS / ARMOUR; sidearm swaps refund like
  primaries; free gear (pistol, clippers) can never be sold.
- Tests: shared 61 (+8: damage split, perk timing/speed, perk re-buy, armour up/down, sidearm swap, clippers,
  shell not sold, backstab geometry), server 50 (+7: plate break + events, flask + weed regen, energy
  sprint distance, fade respawn/shield, revolver swap + slot 3, clippers backstab/front/no-ammo, launcher
  shell → boom → launcher credit), client 24; e2e: revolver swap, V, ∞ ammo, perk chip, plate on the HUD,
  shop verdicts, sniper scope overlay via the dev wallet hook. Screenshot tool `e2e/tools/loadout.mjs`.
- Deferred: attachments (owner: later), a real lunge on the clippers swing (the trace is instant).
- Gotcha found by the screenshots: the HUD's `.perks` class clashed with the shop's `.shop-grid.perks`
  and pinned the perk cards to the corner — renamed to `.perk-list`.

### Look pass — weapon models and animation ✔ (owner: "ulepszenie wyglądu i animacji broni")
Presentation only: no rule, number or packet changed (aim points, muzzles and lengths of every model
are identical, so ADS and the muzzle flash land where they did).
- **Models** (`view/weaponMeshes.ts`): eight PBR materials (blued metal, steel, polymer, tan, wood,
  rubber, brass, scope lens) instead of two, and shared detail builders — rails, front/rear sights,
  trigger guards, vented muzzle devices, grips, scope tubes with lens glass at both ends and turrets.
  Every one of the 11 weapons got a re-cut: the rifle and DMR carry a top rail and irons, the LMG a box
  magazine and folded bipod legs, the sniper a scope with a glinting lens, the revolver a cylinder and a
  brass sight blade, the shotgun a grooved pump and a bead, the launcher a break-open latch that travels
  on reload, the clippers a blade head with a brass switch. Still merged per material: 8 draw calls at
  most per weapon.
- **Animation** (`view/Viewmodel.ts`), each a layer on the existing pose solver:
  wall push (a raycast along the barrel pulls the gun in and up when a wall is closer than its length),
  vertical inertia (the gun lags on jumps and drops), a crouch dip, an ADS "kick" (settle overshoot when
  the aim lands), an empty-magazine slide lock (the action stays open until the reload), a sprint pose
  retune (lower, rolled to the right), an equip settle, and **F = inspect** (a 2-part turn-over timeline,
  cancelled by fire / aim / reload). Third-person: per-slot holds (one-handed for sidearms, blade grip for
  clippers) so remote players read what they carry.
- Proof: `pnpm shots:loadout` with `LOOK=1` captures hip / ADS for every weapon plus inspect, sprint and
  wall-push stills (reviewed: rails, irons and lens glint are visible; inspect and wall push read
  correctly); typecheck + 135 tests green. No e2e changes (nothing observable by the server).

### Drop 4 — modes and movement ✔
What shipped (numbers are the ones in the code):
- **Modes** (`shared/modes.ts`, picked in the lobby with a TDM / FFA / DOM segmented control that
  remembers the choice; the room list shows each match's mode; the matchmaker filters on
  `room` AND `mode`, so a quick-play into FFA never lands in someone's TDM).
  **FFA**: everyone is team 0 for the server, no friendly-fire rule, spawns from the whole pool by
  distance from everyone alive, first to 30 kills; the winner is a player (`winnerId/Name` in the
  state and the match event), the HUD shows YOU vs the leader, the scoreboard is one table and every
  remote is drawn in the other team's colour with no nameplate.
  **Domination** (`shared/dom.ts`): three flags on Night District — A BACKLOT (−21, 21), B THE SHOP
  (3.4, 7.2), C CAR WASH (27, 21.5) — with a 3.5 m zone, 6 s lone capture (+50 % per extra capturer,
  max 3), frozen while contested, progress bleeds off when empty (×2 while the owner stands on it),
  +1 point per held flag every 3 s, first to 100. A capture pays $150 and 50 score to each capturer
  and broadcasts a `flag` event (HUD notice "FADE TOOK B · THE SHOP", sound). In the world: a pole
  with a lettered banner in the owner's colour, a ground ring the size of the zone that takes the
  capturing team's colour and tightens with progress (pulses orange when contested), a tall dim beacon.
  HUD: A/B/C chips under the timer with owner colour + capture bar, a centre "CAPTURING B · 63 %" /
  "CONTESTED" / "HOLDING" line while standing in a zone.
- **Tactical sprint** (`TAC` in `shared/movement.ts`): double-tap Shift latches it; ×1.2 sprint speed
  on a 4 s budget that refills at 0.4×/s while not in use — but NOT while Tac + sprint are still held
  on an empty budget (a one-frame refill would flicker it back on; the player has to let go). The
  client never latches below 0.9 s of budget. FOV +7 %, gun up across the chest (first and third
  person), a thin meter under the crosshair while it runs or refills. Predicted: `body.tac` is part of
  the shared body state, so reconciliation replays it.
- **Lean** (`LEAN`): Q / E move the eye 0.45 m sideways (0.1 m down, 0.14 rad roll) as far as an
  8-step head-box sweep allows — a wall stops it, sprinting cancels it. The shot / throw origin
  includes the lean; the server validates the origin against the same `leanEye` AND rejects any
  origin inside world geometry (`origin-in-wall`), so a leaned head can never fire from inside a wall.
  Remote characters tip the torso and head; nameplates follow the leaned eye. "Last weapon" moved to X.
- Tests: shared 78 (+17: capture rules incl. contested / bleed / owner defence / capturer bonus, score
  ticks, mode limits, tac speed / budget / refill rule, lean keys / clearance / eye offset / yaw, FFA
  spawn pool, flags on free reachable floor and far apart), server 57 (+7: FFA teams + winner + limit,
  FFA spawn distance, Domination capture + pay + tick + no kill score, contested / takeover / score
  limit, origin-in-wall rejected + leaned origin accepted, tac speed through the room + replicated
  pose, button mask), client 24; e2e +2 (Domination room via the lobby: capture from the HUD's point
  of view on both clients, flag notice, score tick, lean, tactical sprint latch; FFA lobby + HUD).
- Deferred: minimap icons (Drop 5 brings the minimap), Domination-aware spawns (team spawns for now).

### Drop 5 — bots, HUD, chat ✔
What shipped (numbers are the ones in the code):
- **Bots** (`server/bots/BotBrain.ts`, presets in `shared/bots.ts`): the lobby asks for 0–8 bots and a
  level (EASY / NORMAL / HARD; remembered), the room adds them at creation (humans always keep two
  seats), the list shows "· 2 bots". A bot is a session without a client: its brain answers every tick
  with one movement input plus fire / reload requests that go through the SAME paths as a human's
  (`fireCore`, `reloadFor`, `buyItem` — rate limits, ammo, origin checks), so a bot cannot do anything a
  player could not. Perception: nearest enemy within sight range with line of sight to the chest.
  Combat: turn onto the target at the preset's rate, wait the reaction time (750 / 420 / 220 ms),
  shoot with the preset's aim error (0.06 / 0.032 / 0.014 rad), close in beyond 16 m, back off under
  5 m, strafe in bursts between; chase the last known spot for 2.5 s after losing sight. Otherwise:
  BFS path over the walk grid (`shared/nav.ts`, the same jump rule the map test uses) to a goal — an
  enemy-held / neutral flag in Domination, a random spawn / flag / station elsewhere — sprinting on
  long legs, hopping at a rise, re-planning every 2.5 s or when stuck. Bots shop at spawn (best
  primary they can afford), count towards the match start, sit on the scoreboard with a BOT tag, and
  wear the team's colours. Names: RYSIEK, ZDZICHU, MIREK, HENIEK, BOGDAN, WALDEK, JANUSZ, SEBA…
- **Minimap + compass** (`ui/Minimap.tsx`, maths in `ui/minimap.ts`): a pre-rendered top-down image
  of the collision boxes (walls light, cover dimmer, floors dark, roofs ignored) drawn rotated so the
  facing is up, 24 m radius; teammates, spotted enemies, flags (letter + owner colour), marks, buy
  stations, a white arrow for you. Compass strip with N/E/S/W plus flags and marks by bearing. Runs
  on its own rAF from a `radar()` getter — React never re-renders per frame.
- **Scoreboard v2**: K / D / A / $ / score / ping, BOT tag, a dash for a bot's ping. Assists are counted
  on the server (`PlayerState.assists`, +50 score).
- **Chat**: Enter (all) / Y (team) opens a box that owns the keyboard (`InputState.typing` — B and Tab
  included); Enter sends, Escape drops. Server: printable characters only, 120 chars, one line per
  700 ms, team lines reach the team only (FFA has no team). Last 8 lines, shown 9 s.
- **Marks** (middle mouse): an enemy within a 4° cone and in sight becomes a "spot" that follows them
  for 4.5 s (red "!"); otherwise the point the view ray hits becomes a "go" chevron for 8 s. One live
  mark per player, team only (solo in FFA), 1.2 s apart, within 65 m. Drawn as world billboards over
  everything (a mark behind a wall still shows), on the minimap and on the compass; a blip sound.
- Tests: shared 82 (+4: BFS paths between spawns / to every flag / to the mezzanine, presets), server
  62 (+5: bots fill / count / shop / move, a hard bot kills a standing human, chat delivery + trim +
  rate limit + team-only, marks team-only + range + spot target, assists), client 28 (+4: minimap
  maths), e2e +1 (bots from the lobby, BOT rows, minimap, chat A → B, a mark).
- Gotchas: `mulberry32(Date.now())` made the bot kill test flaky — rooms accept a `seed` option in
  test / dev builds; a faceOff uses spawns[0]/[1], so a bystander parked on spawns[1] soaks the ray.
- Deferred: bots vs smoke (they see through it), bots throwing grenades, difficulty-based footwork.

### Drop 6 — low-poly art pass (CC0) ✔ (pipeline + procedural pass; packs are the owner's step)
The build sandbox cannot reach kenney.nl / polyhaven.com / quaternius.com (proxy 403), so no CC0 files
could be fetched or reviewed here. What shipped instead keeps the decision (CC0 low-poly, procedural
fallbacks) and makes dropping the packs in a five-minute job on the owner's machine:
- **Model pipeline** (`world/models.ts`): `public/models/manifest.json` maps a `SolidLook` to a glTF
  (`file`, `fit: box | footprint`, `yaw`, `lift`, `license`). `Game.start` fetches it once; a look the
  manifest has skips the procedural dressing and gets the model loaded once and **instanced** per
  solid, scaled to its collision box (uniform, tightest dimension, standing on the floor); a missing
  or broken file logs once and that look stays procedural. The collision box never changes — the
  server does not know models exist. `public/models/README.md` names the packs (Kenney Car Kit,
  City Kit Industrial, Furniture Kit; Quaternius; Poly Haven) and the exact manifest to paste;
  `ASSET_LICENSES.md` got the per-file table to fill in. Tests: manifest parsing (junk, path
  traversal, defaults), a missing manifest = no models, fit maths (box vs footprint, floor offset).
- **Procedural low-poly pass** (visible now): every dressed cylinder is flat-shaded with fewer sides
  (wheels 10, hubs 8, drums / pipes 10), so tyres, drums and pipes read as faceted stylised objects;
  vehicles got side mirrors, door seams, a grille bar (car), roof-rack rails (van) and an exhaust
  stack (truck) on top of the chassis skirts and translucent glass from the handoff round.
- **Barber pole** (`props.ts` `barber_pole`): the classic — a lit red / white / blue helix (diagonal
  stripes on a wrapped canvas texture) between brass caps on a wall bracket, by the shop door on
  the street side. Prop placement is covered by the existing "nothing floats" map test.
- **Measured** (`pnpm profile`, MEDIUM, SwiftShader — draw calls are the reliable number, ms is not):
  street 352 → 354 draw calls, shop 226 → 226, hall 167 → 167, yard 100 → 100, storage 151 → 151;
  vertices +34 % (flat shading un-shares them: 38.7 k → 52.0 k in the street), triangles unchanged.
  Draw-call budget (≤ +10 %) held.
- Owner's step: download the packs, copy the `.glb` files into `apps/client/public/models/`, paste the
  manifest from the README, add the licence rows, run `pnpm profile` again (one glTF material = one
  draw call per instance batch).

### Drop 7 — progression, hosting
- XP/levels/unlocks in localStorage, match summary screen.
- Player-hosted games: one-click "HOST" starts the server in a local process (packaged Node) or a
  Docker one-liner; join by code; LAN discovery; internet guide (port forward / relay option).

## Proof rules per drop
- New mechanic ⇒ shared unit tests for its rules + server room test for its validation.
- New visual ⇒ `pnpm anim` / `pnpm shots` still and a NullEngine pose test where there are joints.
- Map change ⇒ `map.test.ts` green (connectivity, LOS, floating props).
- Perf ⇒ `pnpm profile` numbers in the plan; draw calls per view must not regress > 10 %.
