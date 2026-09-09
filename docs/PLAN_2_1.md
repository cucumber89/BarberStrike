# BARBERSTRIKE 2.1 — Plan of record

This file is the contract. Every session that touches the game reads it first, works on exactly
one drop, and writes back to the ledger at the end. If work does not fit a drop, it goes to
**Deferred**, not into the code. Decisions below are locked the same way `ARCHITECTURE.md` locks
architecture: reopen only with a measurement, a failing test, or the owner's explicit word.

## Vision (one paragraph, do not expand)

BarberStrike is a small-group arena FPS where the barber shop is a mechanic, not a backdrop. The
memorable moments are the ones players tell each other about the next day: getting shaved, the
Fryzjer who saved the round, the skin somebody rolled. Nothing is gated — a friend who joins on
Friday is never weaker than the friend who played on Thursday. Weapons must feel like different
tools in the hand, look like real objects (nothing floats, nothing clips), and be worth showing off.

## Locked decisions (append-only; date and sign every addition)

- **L1.** No weapon, mode, map or role is ever gated by level, money outside a match, or ownership.
  Skins and haircuts are the only progression rewards and are purely cosmetic. (owner, 2026-09-07)
- **L2.** Roles ship first as **loadout presets** built from existing perks/armour/weapon slots.
  Active abilities are not built until a playtest with ≥4 humans says a preset is the favourite.
  (owner, 2026-09-07)
- **L3.** Every visual claim about a weapon ("the scope sits on the rail", "the hand is on the grip")
  is proven **numerically** with `vm-fit.mjs` / `hand-pose.mjs` / `gltf-info.mjs` and a screenshot
  saved under `apps/client/e2e/out/`. "Looks fine to me" is not evidence. (2026-09-07)
- **L4.** Skins are **seeded procedural textures**: a skin is `(generatorId, seed, params)`, never a
  stored bitmap. Same inputs → byte-identical texture, tested by hash. This keeps the bundle small
  and makes every skin reproducible on any client. (2026-09-07)
- **L5.** Crates are earned (XP, badges, match awards). No purchase path exists in code. (owner)
- **L6.** Server authority, tick rate, snapshot rate, prediction and interpolation stay exactly as
  `ARCHITECTURE.md` says. Feel work happens on the client and in `WeaponDef` numbers only.
- **L7.** Each drop lives on its own branch `drop/<letter>-<slug>`, merges to `main` only with
  `pnpm test`, `pnpm typecheck`, `pnpm build` green and the e2e suite passing. Deploy is the
  owner's action, never an agent's.

## Working rules (token discipline)

- A session works on **one drop**. It does not "quickly also" fix something in another drop; it
  writes that to Deferred.
- Read files with `grep -n` and ranged reads. Reading a 70 KB file whole to change one function is
  a defect. `TdmRoom.ts`, `Hud.tsx`, `styles.css`, `map.ts`, `Game.ts` are the files this rule
  exists for.
- Subagents get **a file list and a question**, return **≤ 300 words plus file:line refs**. They do
  not paste code back; the lead reads the lines it needs.
- Screenshots and tool output go to files under `apps/client/e2e/out/`, never into chat.
- The ledger entry is written **before** the final report, not after. A session that ends without
  a ledger entry did not happen.

---

## Drops

Order is the recommended order. A, B and D can run in parallel on separate branches because they
touch disjoint files; C depends on A (skins need stable UVs and part names); E depends on D's
mode plumbing; F, G, H come after a playtest of A–E.

### Drop A — Weapons: structure and fit ("nothing floats")

**Goal.** Every one of the 11 weapons is a physically coherent object in first and third person:
every part is attached to the receiver, the hands are on the grip and foregrip, the muzzle is at
the end of the barrel, sights/scope sit on the rail, magazines seat in the well, nothing clips the
hands or the camera, and all of this holds through idle, sprint, ADS, reload and inspect.

**Where the truth lives.** `apps/client/src/game/view/weaponRig.ts` (part-name → role),
`weaponFit.ts` (measured anchors, orientation, grip origin), `weaponModels.ts` (import pipeline),
`weaponMeshes.ts` (procedural detail builders and the procedural fallback), `Viewmodel` layers
(wall push, inertia, crouch dip, ADS kick), `public/models/manifest.json`. Tools already there:
`e2e/tools/gltf-info.mjs`, `vm-fit.mjs`, `hand-pose.mjs`, `pnpm shots:loadout`, `pnpm anim`.

**Build this tool first:** `e2e/tools/weapon-parts.mjs` — for each weapon, loads the model the
way the game does, and for every named part reports its bounding box, its nearest distance to
the receiver box, and whether the grip/foregrip/muzzle/sight anchors lie inside the expected part.
Emits a table and a non-zero exit code when any part is > 5 mm from the receiver or any anchor is
outside its part. This becomes a unit-style check (`pnpm check:weapons`) and runs in CI.

**Acceptance.**
- `weapon-parts.mjs` passes for all 11 weapons.
- `vm-fit.mjs` numbers per weapon recorded in `docs/WEAPON_FIT.md` (camera-space box of the gun,
  grip origin, muzzle) and every weapon's aim point measured to ±1 px of screen centre in ADS.
- `hand-pose.mjs`: every third-person gun's bore is within 5° of the character's facing.
- Screenshots: idle / ADS / reload mid-frame / inspect for each weapon, both persons, in
  `e2e/out/weapons/<id>/`. A reviewer agent (not the implementer) checks them for clipping.
- No change to any `WeaponDef` number. This drop is geometry only.

### Drop B — Weapons: handling and function (they must feel different)

**Goal.** Blind test: a player who fires each weapon at a wall can name it from the feel alone.
Each weapon has a distinct signature across six axes — recoil shape, fire cadence, ADS time and
zoom, handling weight (sway, sprint-out, equip time), audio report, and visual violence (flash,
shake, tracer, casing). And every scoped/special function works: the sniper's scope actually
zooms, has an overlay, hides the viewmodel, scales sensitivity, and hold-breath steadies it; the
launcher arcs; the shotgun's spread reads on the crosshair; the LMG's bipod/heavy handling is felt.

**Where the truth lives.** `packages/shared/src/weapons.ts` (`WeaponDef`: `recoilPattern`,
`recoilJitter`, `recoilRecoverDelayMs`, `adsZoom`, `adsMs`, `slot`, `kind`, `scoped`,
`effectiveSpread()`), `apps/client/src/game/combat/WeaponController.ts`,
`player/LocalPlayer.ts` (`addRecoil`, `addShake`, `aimBlend`), `audio/` (procedural per-weapon
voices), `view/` (muzzle flash, tracers, casings), HUD scope overlay in `ui/Hud.tsx`.

**Method.** First write `docs/WEAPON_MATRIX.md`: a table, one row per weapon, the six axes as
columns, with the *intended* character in words and numbers. Get owner sign-off on the matrix
before touching code (this is the artefact that stops feel work drifting). Then implement to the
matrix. TTK numbers from `BUILD_STATE.md` ("The weapons") are already tuned — do not move damage.

**Build this tool:** `e2e/tools/weapon-signature.mjs` — fires N shots per weapon in a headless
client with the pointer locked and records the recoil trajectory (crosshair offset per shot), ADS
blend time, equip time, and sound-envelope peaks from the audio graph. Outputs a JSON per weapon
under `e2e/out/signature/`. A test asserts no two weapons have a signature closer than a
threshold (distance on normalised axes), which is the "they feel different" claim made checkable.

**Acceptance.**
- Matrix signed off; every row implemented; signature test green.
- Sniper: scope overlay, zoom, viewmodel hidden at `aimBlend > 0.9`, sensitivity scaled by zoom,
  breath hold reduces sway measurably, un-scope on sprint. Verified on a real GPU by the owner
  (SwiftShader cannot judge this — say so in the report rather than claim it).
- `pnpm test` (weapons.test, movement.feel.test) green; e2e green; prediction corrections per
  minute not higher than before (F3 telemetry) — recoil is client-side, server spread unchanged.

### Drop C — Skin Studio: procedural weapon skins and crates

**Goal.** A generator that produces attractive, varied, reproducible weapon skins; a studio app
to design and curate them; a runtime that applies them to the real weapon models; crates that
roll a skin by rarity and hand it to the player's profile.

**Design (L4).** A skin = `{ generator: string, seed: number, params: Record<string, number|string> }`.
Generators are pure functions `(ctx: CanvasRenderingContext2D, seed, params) → void` in
`packages/skins/` (new workspace package, browser-only canvas code, no Babylon import), composed
of layers: base finish (matte/gloss/metal/anodised), pattern (barber-pole stripes, damask, hex,
splinter camo, marble, tape/wrap, chrome flake), palette (by rarity tier), wear (edge mask from
the model's AO/curvature baked once per weapon), decals (FRANKIBARBER wordmark, razor motif,
pole), emissive accents. Seeded with `mulberry32` from `shared/util.ts`. Output: albedo +
roughness/metallic + emissive at 1024² per weapon, rendered on demand and cached per
`(weapon, skinId)`.

**Runtime.** `apps/client/src/game/view/skins.ts`: given a weapon mesh from `weaponModels.ts`,
builds `RawTexture`s from the canvases and swaps them into the material via `gltfMaterials.ts`.
Skins replicate as a `skinId` string on `PlayerState` (schema, one field, changes only on equip)
so everyone sees them. Profile stores owned skins; equipped skin per weapon.

**Crates.** `packages/shared/src/crates.ts`: pure rules — crate types, rarity weights, pity
counter, roll with a seed from the server so it cannot be forged client-side (server sends the
seed in the match summary; client renders the reveal). Crates are granted by `progression.ts`
events (level-up, badge, match award). No purchase path (L5).

**Build this tool:** `apps/skinstudio/` — a Vite page (workspace app, not shipped in the game
bundle) that loads the real weapon glTFs, shows a weapon, lets you pick generator/seed/params
with sliders, live-applies, and has three buttons: "randomise", "save to catalog", "batch render
thumbnails for catalog". The catalog (`packages/skins/catalog.json`) is what the game ships:
named, curated skins with their generator inputs and rarity. Also `e2e/tools/skin-batch.mjs`
to render every catalog entry to `e2e/out/skins/` for review, and a unit test that hashes the
albedo of three fixed seeds and asserts the hashes never change (determinism guard).

**Acceptance.**
- ≥ 6 generators, ≥ 40 curated catalog skins across 4 rarities, thumbnails reviewed by a separate
  reviewer agent for "would a player want this" (reject muddy, low-contrast, or unreadable ones).
- Determinism test green; skin apply adds ≤ 2 draw calls per weapon and no per-frame cost.
- Crate roll is server-seeded; e2e: finish a match → summary shows crate → reveal → skin in
  profile → equip → visible to the other client.
- Skin Studio runs with `pnpm --filter @frankibarber/skinstudio dev`.

### Drop D — Join by link, Gun Game, Ostrzyżeni

**Join by link.** `barberstrike.click/r/<room>[?mode=…]` lands in that room with the nick
prompt only. Client routing + the existing `filterBy(["room","mode"])` matchmaking. `hostcheck.mjs`
extended to prove the link path.

**Gun Game.** `shared/modes.ts` + room: everyone starts with weapon 1 of a fixed ladder of all
11; a kill advances (a clippers kill sets the victim back one); first to finish the ladder wins;
no economy, no shop, respawn 3 s, FFA spawn pool. Ladder order is in `modes.ts` as data.

**Ostrzyżeni (infection).** One random player starts as Ostrzyżony with clippers only, speed
perk, and a visible shaved head; anyone killed by clippers joins them; survivors have full shop
at round start; round ends when nobody unshaved remains or the timer runs out (survivors win).
Reuses team gating (`teams` getter), `rounds.ts`, perks, and the clippers path.

**Acceptance.** Both modes in the lobby picker, bots can play both (BotBrain needs a
per-mode goal; Gun Game = default, Ostrzyżeni = chase / flee), unit tests for the ladder and the
conversion rule, e2e: two clients, one full Gun Game to the end.

### Drop E — The shave (ogolenie) and haircuts

Clippers backstab kill = **shave**. The victim respawns with a visible bad haircut for the rest
of the match (character head material/mesh variant), the kill feed shows a razor icon, the
scoreboard gets a `shaved` column, the match summary awards "Najgorsza fryzura". Haircuts as
cosmetics: a set of head variants earned via progression (L1: cosmetic only), equipped in the
profile, replicated like `skinId`. Depends on D only for the summary/award plumbing.

### Drop F — Roles as loadout presets (L2)

Three presets in `shared/roles.ts` built purely from existing data: Ochroniarz (armour, shotgun
or LMG, −speed), Kurier (+speed perk, SMG, extra grenades), Fryzjer (pistol + clippers, a
"odświeżenie" that grants the regen perk to a nearby teammate on use — the one new verb, gated
behind a playtest verdict). Lobby picker, bots pick a role, HUD shows role icon. A playtest
form (`docs/PLAYTEST_TEMPLATE.md`) is filled in by the owner before anything further is built.

### Drop G — Second map

Small, 2–6 players, one strong theme (the back alley / delivery yard at night, or the
upstairs flat). Reuses the map pipeline and the validity test (walk grid, spawn LOS, prop
placement, "nothing floats"). Layout drafted as a top-down diagram in `docs/MAP_2.md` and
approved before geometry.

### Drop H — Accounts and leaderboard (after A–E have been played)

Nick + password or Discord OAuth, server-side profile (skins, haircuts, XP), weekly leaderboard
(kills, shaves, wins) on a `/stats` page served by Caddy. Only if people are coming back.

---

## Ledger (append a row per session; never edit old rows)

| Date | Drop | Branch | Session did | Evidence (paths) | Tests | Status |
|---|---|---|---|---|---|---|
| 2026-09-07 | — | main | Plan written | docs/PLAN_2_1.md | — | planned |
| 2026-09-07 | A | claude/new-session-o0hcng (harness-assigned; stands in for `drop/a-weapons-fit`) | Built `weapon-parts.mjs` / `pnpm check:weapons` (pure `weaponParts.ts` + `weaponParts.check.test.ts` on the real import pipeline, CI step). First run 2/11. Fixed what it found: support hand hovering 13–25 mm under every long gun and sitting at the muzzle on the MDR/MPA (measured `WeaponModel.support`); derived ejection port in mid-air on MK14/SRSA1/RPG; RPG built backwards (sights now orient the model); LMG grip/stock/sight/belt box, shotgun stock, clippers anchors floating (spec numbers). Now 11/11. `docs/WEAPON_FIT.md` started. | apps/client/e2e/out/weapons/parts.md (regenerate with `pnpm check:weapons`), docs/WEAPON_FIT.md | typecheck ✓ test ✓ (433) build ✓ check:weapons ✓ e2e — (not run: needs servers) | in progress |
| 2026-09-07 | A | claude/new-session-o0hcng | Slice 2, in a browser: `vm-fit.mjs` now buys all 11 weapons, projects each gun's new `aim` node in ADS (mean over one breath) and counts near-plane-cut vertices; `hand-pose.mjs` measures every weapon on the procedural `gunHand`; `weapon-shots.mjs` shoots idle/ADS/reload/inspect + third-person front and profile. Found and fixed: the shotgun's ADS put its receiver around the eye and its pump through the near plane (ADS distance rule, aim point ≥ 15 cm ahead). Art review round 1 (54 images): 2 harness faults (empty third-person frames, reloads not started — both fixed), plus hands-as-blocks, DMR lens disc, identical smg/smg2 and dmr/sniper silhouettes → Deferred. Round 2 review pending at the time of this row. Found: the running game never uses the imported glTF guns/characters (`Game.ts:164`) → proposal in Decisions. | docs/WEAPON_FIT.md (vm-fit, hand-pose tables); apps/client/e2e/out/weapons/{vm-fit.md,hand-pose.json,<id>/*.png} (regenerate) | typecheck ✓ test ✓ (435) build ✓ check:weapons ✓ e2e — | in progress |
| 2026-09-07 | A | claude/new-session-o0hcng | Slice 3 (owner: "improve the procedural guns"): first-person hands rebuilt as a pure spec (palm, fingers, thumb, forearm jointed at the wrist) judged by the same attachment rule as the guns (`handSpec.test.ts`); smg2 and dmr given their own silhouettes with aim/muzzle/length untouched; `check:weapons` now judges every PROCEDURAL spec (parts[0] = receiver, magazine seats in its well) — which exposed five specs that had hidden behind glTFs (pistol, smg, rifle, sniper, launcher: detached stocks, loose parts, muzzles past the barrel), all re-seated. Re-measured: 19/19 parts, ADS aim worst 0.09 px mean, 0 near-plane cuts, bores ≤ 4.6°. Code review: nothing breaks (one judgment note on the seating rule, accepted). Art review round 3: hands and silhouettes pass; rejects left are Drop B / animation / character-pose items, all Deferred. | docs/WEAPON_FIT.md; apps/client/e2e/out/weapons/ (regenerate) | typecheck ✓ test ✓ (454) build ✓ check:weapons ✓ (19/19) e2e — | in progress |
| 2026-09-07 | A | claude/new-session-o0hcng | Slice 4: third-person hold, reload staging, launcher sight. `characterHold.ts` computes the held gun's box in torso space and its test asserts no weapon intersects the vest — two hand-tuned passes had each freed one end of the gun and buried the other, so the pose was solved by search instead (x 0.335, outboard of the shoulder; the bore stays 3.5–3.9° of facing, so angling the gun across the body was ruled out). `reloadFrame` lifts and cants every timeline so the magazine stays in frame (t-ranges untouched — the audio cues on them). Launcher ladder sight rebuilt as a peep frame. Harness: real `reloadMs` per weapon, an open-ground heading from the game's own CollisionWorld, two-breath aim averaging, output paths anchored to the tool. Art review round 5: reloads and sights pass; the first-person support arm still crosses the fore-end (Deferred, the last geometry item). | docs/WEAPON_FIT.md; apps/client/e2e/out/weapons/ | typecheck ✓ test ✓ (474) build ✓ check:weapons ✓ (19/19) e2e — | review |
| 2026-09-07 | B | drop/b-weapon-feel | Slice 1, docs only: `docs/WEAPON_MATRIX.md` written from three recon passes (client handling `LocalPlayer` / `WeaponController` / `Viewmodel`, audio voice table `sfx.ts:31-44`, VFX `Effects.ts` / `Tracers.ts` / `view/index.ts` / `Hud.tsx`). Found: of the six axes only recoil, ADS and the audio voice are per-weapon today; sprint-out (150 ms), sway, flash, tracer and casing are one global value for all eleven, shake is a three-way ternary, and the ADS sensitivity ignores `adsZoom`. The sniper already hides the viewmodel and has breath hold; it does not scale sensitivity or un-scope on sprint. Matrix proposes bold per-row targets, six named rules (R1 zoom-sens, B1 bipod, C1 pellet ring, S1 bolt kicks out of scope, S2 sprint un-scopes, M1 clippers hum) and four decisions D-B1–D-B4 for the owner. No code touched. STOPPED for sign-off as the plan requires. | docs/WEAPON_MATRIX.md | typecheck — test — build — (no code changed) | blocked: owner sign-off on WEAPON_MATRIX.md |
| 2026-09-08 | B | drop/b-weapon-feel (recut from main; PR #13 merged the matrix) | Slice 2, the drop implemented. Owner signed the matrix ("dobra dalej kończmy to"), all four decisions as proposed. `weaponFeel.ts` = the matrix in numbers, client-only (D-B1); `weaponFeel.test.ts` judges it, including the closest-pair claim. Signature metric compares axes in OCTAVES normalised by the roster's spread — in raw units 420 vs 1000 rpm is a tenfold lie about the same difference as 45 vs 107; closest pair shotgun/launcher 0.98, median 4.0, threshold frozen at 0.9. Wired: per-weapon sprint-out, sway, raise, flash, shake, tracer width and count, casings (hand-worked guns hold the case until the action), belt link, mechanical action audio (hammer/pump/bolt), R1 zoom-scaled sensitivity, S1 bolt out of the scope, B1 bipod, D-B2 the M-1 scoped with a ring and the minimap it keeps, C1 the S12's true cone as a ring. `weapon-signature.mjs` measures all 11 in a real client. FOUND, predating this drop: `InputState` cancelled the aim on any Shift under a held aim, so the SR-50's breath hold was unreachable while the HUD advertised it — fixed at the source, 3 tests. Review (separate agent) found 6 real bugs: bolt kept the NEXT weapon out of ADS, bipod deployed mid-air and carried across weapons, a case owed by a put-away gun dropped out of the next one, brass left 560 ms after a 125 ms bolt, S2 duplicated in two places disagreeing about which keys count. All fixed. | docs/WEAPON_MATRIX.md ("As built"); apps/client/e2e/out/signature/{summary.md,*.json}; apps/client/e2e/out/weapons/dropb/*.png | typecheck ✓ test ✓ (451) build ✓ audio-selftest ✓ signature tool ✓ (11/11) e2e — (not run) | review |
| 2026-09-08 | B | drop/b-weapon-feel | Four commits on top of the row above, from a second session that had built Drop B independently; the owner chose this branch as the base and named what to take across. **Linear ADS blend** — it moved by a fraction of the REMAINING distance each frame, so the sights took ~2.3 × `adsMs` and longer on a slow machine (measured 255 ms for the AR-31's declared 130, 549 ms for the SR-50's 260); `adsMs` is now the real time on any framerate. **M1, the clippers' hum, built** — the "needs a looping voice in the engine" note was too pessimistic: a 2 s voice re-triggered before it ends, fading in and out so the seam is inaudible, stopped on death/switch/teardown and re-armed on spawn, −16.7 dBFS in the self-test. **`weapon-shots.mjs` repaired** — it has taken no screenshot since drop I made the spawn deferred (it never clicks ENTER MATCH), and that click also fullscreens the canvas host, which HIDES the HUD from any frame taken inside it. Plus a guard so one unreadable JSON cannot delete the whole signature table. | apps/client/e2e/out/weapons/{dmr,sniper}/fp_ads.png (`PRESET=low RENDER=0.5 node e2e/tools/weapon-shots.mjs`); apps/client/e2e/out/signature/summary.md | typecheck ✓ test ✓ (609: shared 180, client 276, server 153) build ✓ check:weapons ✓ (19/19) audio-selftest ✓ signature tool ✓ (11/11) e2e — | review |

| 2026-09-08 | D | drop/d-modes | Whole drop in one session. **Join by link**: the invite link is now `<origin>/r/<room>?mode=…`; the client reads the room off the path (`roomFromPath`), the lobby a link opens asks for a nickname and nothing else (CHANGE opens the full one), the SPA fallback moved into `hosting.ts` as `spaFallback` so it is testable, and `hostcheck.mjs` proves the path from outside (11/11 checks). **Gun Game**: the 11-rung ladder is data in `shared/modes.ts`; the rung replicates as `PlayerState.score` (no new field), a rung-weapon kill re-arms the killer on the spot, a clippers kill sets the victim back one, only the last rung ends the match, no economy, 3 s respawn, FFA spawn pool. **Ostrzyżeni**: rounds on the Prep/Playing machine, sides are the teams (survivors 0 / shaved 1), one random chaser per round with clippers + the energy perk + a bare head (`PlayerState.shaved`, the one field the plan names), a clippers kill converts, survivors who are not converted stay down until the round ends, five rounds, the result names the top score. **Bots** play both (`BotSenses.mode`/`shaved`): Gun Game needs no branch, a chaser closes and swings, a survivor gives ground. Reviewer (separate agent) found six things, all fixed — chiefly the profile recording the OPPOSITE of the result screen in Ostrzyżeni. | apps/client/e2e/out/d/{hostcheck.md,gungame/*.png,ostrzyzeni/*.png}; docs/PLAYTEST_TEMPLATE.md; regenerate with `hostcheck.mjs`, `shaved-shots.mjs`, `infection-shots.mjs` | typecheck ✓ test ✓ (510: shared 153, client 217, server 140) build ✓ check:weapons ✓ (19/19) e2e ✓ (18/18 against a freshly started server; the pre-existing smoke test failed twice against a server process that had been up ~20 min / 64 k ticks, and passes alone — see Deferred) | review |

| 2026-09-08 | D | drop/d-modes (PR #16) | Merged `main` (The Boys, PR #14) into the drop and ported Drop D onto it. Fifteen files conflicted: main had added a mode and deleted the invite module, HowToPlay, Armoury, Profile, Online, the ui sfx, the defuse kit, the bomb blast, slide and the carry pack. Kept both mode tables in one (`MODES` describes 7, the picker offers 6 — FFA stays playable but unoffered); took main's side wherever it had deleted something Drop D merely touched; **restored join-by-link on the owner's word** (the plan names it as Drop D's first deliverable and the deletion was refactor collateral), wired into main's rewritten lobby, which now also MAKES the link (an INVITE box — joining by a link nobody can generate is not a feature). Its e2e moved from the deleted `menu.spec.ts` to `startup.spec.ts`, plus a six-mode picker test. | apps/client/e2e/out/d/** (regenerate per `e2e/tools/README-drop-d.md`) | typecheck ✓ test ✓ (485: shared 137, client 206, server 142) build ✓ e2e 14/15 — the one failure (`drop 2: buy menu…`, asserting a WEAPONS-tab card after switching to the GRENADES tab) reproduces byte-identically on unmodified `main` in a clean worktree, so it is main's, not the merge's | review |

Status vocabulary: `planned`, `in progress`, `blocked: <why>`, `review`, `done`.
| 2026-09-08 | I (new) | claude/game-feedback-improvements-6mqx41 | **Owner's player-feedback brief, all nine points.** Controls: `browserKeys.ts` decides per keydown+modifiers whether the game owns a key (Ctrl+D bookmarking mid-round was preventDefault on the *Ctrl* press, not the chord); text fields keep their keystrokes (typing a nickname with "b" opened the shop); `buttons()` gated on pointer lock (the pause menu did not pause); `immersion.ts` = fullscreen + Keyboard Lock + pointer from the Play click, with a stated retry. Floor at A/B diagnosed as THREE causes: 5 coplanar top-face pairs (132 m² + 144 m² on the slabs carrying A and B — yard paving now laid AROUND the buildings), the site plate being an 80 m² double-sided lit alpha quad sampling one texture three times and never frozen, and no collision broadphase at all (uniform 4 m XZ grid + DDA: overlaps 43→6.5 ms/60k, hitscan 82→40 ms/40k). Shop rebuilt as three aisles in a fixed head/body/foot frame — measured PASS at 7 viewports incl. browser zoom, 21 items, nothing cut, nothing scrolled. Team switching built end to end (shared rules, server decides, wallet/gear survive, deferred to next round in bomb). WebGL2 is the default; automatic quality = device probe + 1 s median measurement + a director with long hysteresis that stops climbing after two reversals. Marcovia kit (colours only, geometry identical part-for-part by test). Living arena: 3 removal-only tactical plans voted by the attackers in the buy window, applied at the freeze edge, reverted next round. First-run hints. | apps/client/e2e/out/ui/{shop-fit.md,shop-*.png,plan-vote.png}; apps/client/e2e/out/kits/*.png; `pnpm test` prints the broadphase numbers; regenerate fit with `node apps/client/e2e/tools/ui-fit.mjs --url <dev>` | typecheck ✓ test ✓ (565: shared 184, client 256, server 125) build ✓ check:weapons ✓ (19/19) e2e — (not run: needs two live servers + a browser pair) | review |
| 2026-09-08 | I | claude/game-feedback-improvements-6mqx41 (PR #15) | Merged `main` (#14 "The Boys stable UI") into the drop and drove PR #15 to green. #14 is a large strip-down (challenges, mastery, Armoury, HowToPlay, menu cover, invite link, defuse kit, gear art all deleted; shop replaced with a tabbed one carrying five Boys roles; App rebuilt as connect → ready → deploy). Ten conflicts. Resolutions: bomb-site GEOMETRY from #14 (its 4.5 m² label beats the old 80 m² plate at the very problem this drop was fixing) with this drop's freezing/`disableLighting` on top; shop LAYOUT from this drop (the brief is "one screen, no scrolling") with #14's roles, per-role gating, free starter and buy countdown folded in and the role picker as a strip rather than a fourth tab; App flow from #14 outright — its DEPLOY click is a better gesture for fullscreen than before-`connect`. Key rebinding RESTORED against #14's deletion, because this brief names it; crosshair / hudScale / ADS-sensitivity were NOT restored (#14's call, not this brief's). floorAudit updated for #14's circular sites. Then CI: `BotBrain.test.ts` timed out at 5 s — proved not this drop's (no diff under bots/nav; 1786 ms on main vs 1764 ms here) but a 14-second simulation against vitest's default timeout on a runner measured 3.9× slower; raised to 30 s for that block, nothing skipped or weakened, option verified by setting it to 1 ms first. | apps/client/e2e/out/ui/shop-fit.md (re-measured post-merge: 7 viewports × TDM 21 items AND × Boys role strip, all PASS) | typecheck ✓ test ✓ (535: shared 168, client 240, server 127) build ✓ check:weapons ✓ 19/19 CI ✓ (PR #15 green, mergeable clean) e2e — | review |

| 2026-09-08 | D | drop/d-modes (after PR #16 merged) | Owner: *"zrób tak aby zrobić to co miałeś robić i żeby działało w grze wszystko"* — so, the two things that did not work. **(1) Fullscreen was hiding the whole UI.** Drop I's Play-button immersion fullscreens the CANVAS HOST; a fullscreen element is promoted to the browser's top layer and everything outside it stops being painted and stops taking clicks, so from the ENTER MATCH click onwards a player had no HUD, no buy menu, no chat, no pause card and no result screen — in the state the game puts every player into. MEASURED: a screenshot at an open buy menu shows the barbershop and nothing else; `document.fullscreenElement` was `DIV.game-canvas-host`; Playwright reported `<canvas class="game-canvas"> … intercepts pointer events` for a click on a BUY button. Fullscreen now goes on `.app`, which holds the canvas AND the overlays, and `startup.spec.ts` asserts that whatever is fullscreen contains the HUD. **(2) Ostrzyżeni was not a game.** The OWNER DECISION WANTED entry answered as option (b), measured not guessed: a chaser returns ON THE HUNT (nearest spawn ≥ 14 m from a living survivor, where every other rule maximises that distance) and carries `shavedHealth` 220 — no damage change, no armour, no new field, nothing gated. Eight seeded 90 s rounds of five: 9 conversions of 40 with THREE blank rounds → 14–22 of 40 with at most one blank, survivors still usually holding the clock. The HUD health bar now scales to what the player can hold, so a 220 HP chaser does not draw a bar twice its box. Room tests (k) and (l) added. NO playtest evidence is claimed anywhere in this drop: the owner declined to fill `docs/PLAYTEST_TEMPLATE.md`. Also fixed on the way: the stale shop e2e (tab clicks that the one-screen shop replaced with aisles) and a suite that must run at 1280×720 where it opens the shop. | screenshots and numbers quoted in the two Decisions entries of this date; `apps/client/e2e/out/d/**` regenerates per `e2e/tools/README-drop-d.md` | typecheck ✓ test ✓ (584: shared 180, client 249, server 155) build ✓ check:weapons ✓ (19/19) **e2e ✓ 15/15** (7.8 min, freshly started server) | review |

| 2026-09-08 | E | drop/e-shave | **The shave and haircuts, whole drop, mechanic done and art NOT accepted.** `shared/haircuts.ts`: a clippers kill FROM BEHIND is a shave (`isShave`, reusing the `isBackstab` the melee swing already runs — no new geometry, no client claim); the victim's head is written once, on the death, and they wear it for the rest of the match. **One schema field**, `PlayerState.haircut`, a string `"<id>"` / `"<id>#<n>"` carrying the equipped cosmetic AND the shave count together, so the chosen look survives being done and the count stays exact for the award (Decisions). Written on join, equip and a shave death, never per tick — verified by the reviewer against `step`/`spawn`/`beginInfectionRound`/the rung reset. HUD: a razor SVG replaces the weapon's name in the kill feed (there was no icon system at all — three text spans and some perk emoji), a razor column on the scoreboard parsed from the field rather than tallied from events a late joiner never saw, and "Najgorsza fryzura" on the summary from a pure shared `worstHaircut`. Nine haircuts unlocked off lifetime counters, owned DERIVED not stored, equipped in the lobby picker (locked ones shown with what earns them), carried on the join like the nickname. Bots wear the catalog. Reviewer (separate agent) found 3 real things, all fixed: **IROKEZ rendered as its own inverse** (a mohawk written as a `track` is a bald strip with hair at the temples — and the view test had asserted that shape rather than questioned it), a scoreboard CSS rule that could never fire, and an unreachable `C2S.Haircut` handler (deleted — the picker is pre-match, so the join option IS the equip path). **Art: three rounds, two of them valid, and the drop's headline claim FAILED both.** At 8 m the head is ~12 px and no shave stage read as a bad haircut; round 2 also found the escalation inverted (RUINA read as a CLEAN bald head). Two responses shipped — hair coverage now falls monotonically instead of a groove widening, and the shaved scalp got its own raw-red material because at 12 px only tone survives — but neither has been judged: round 3's set was invalidated by a harness regression of mine (moving the camera got true ranges and lost the subject; 17 of 37 frames had nobody in them) and is reverted. | apps/client/e2e/out/haircuts/*.png (regenerate: dev servers up, `node apps/client/e2e/tools/haircut-shots.mjs`); art verdicts quoted in the Decisions entries of this date | typecheck ✓ test ✓ (646: shared 196, client 287, server 163) build ✓ check:weapons ✓ (19/19) e2e — (not run) | blocked: art — a shaved head does not read at gameplay range; needs a human on a real GPU, or a different idea |

Status vocabulary reminder: these rows are `review` because the full e2e path was not run here.

| 2026-09-08 | G | drop/g-map-2 | Slice 1, docs only, the gate the drop names: `docs/MAP_2.md`. Four recon passes first (map data model; the validity suite; what each of the seven modes needs from a map; what the client pipeline gives a new map for free). **Theme decided and argued, not offered as a menu: the upstairs flat, not the delivery yard** — NIGHT_DISTRICT already contains an alley and a loading yard (`map.ts:113-116`), so a second yard is a re-skin of the same fight. MEASURED, 400 k eye-to-eye pairs over its 24 751 walkable cells: NIGHT_DISTRICT's median clear sight line is **24.0 m**, 36.6 % of clear lines exceed 30 m, longest 111 m. GÓRA is drawn at 34 × 18 m, ≈ 544 m², longest line 20 m, first contact 3.6 s (vs 8.0 s) and a bomb rotation 2.3 s (vs a measured 10.9 s). Two rings around a solid stair core and an open light well; spawns, three buy stations, three dom flags and two bomb sites placed for all seven modes. Rotation times come from the real `simulateBody` via a new `map-rotation.ts`; the ASCII plan is RENDERED from the extents table by `map-plan.ts` so the picture cannot drift from the numbers. Found while drawing: (a) `map.test.ts:107` demands buy stations spread > 30 m in x — a NIGHT_DISTRICT-shaped rule in a generic test, and the reason the flat is 34 m wide rather than 26; (b) `BOMB_SITES` is a module global (`bomb.ts:6`), so bomb cannot run on a second map without per-map sites; (c) `huntSpawnMinM` 14 m (`modes.ts:142`) is proportionally 3× as far on a 39 m diagonal as on a 121 m one; (d) corners and stairs cost **zero** time in this movement model, so height must be priced in exposure. Six decisions D-G1…D-G6 for the owner. No code touched; STOPPED for sign-off as the plan requires. | docs/MAP_2.md; `apps/client/e2e/tools/{map-rotation,map-plan}.ts` → `apps/client/e2e/out/g/{rotation.md,plan.txt}` (gitignored, regenerate with the command in each tool header) | typecheck ✓ test ✓ (shared 180/180) check:weapons ✓ (19/19) build — test:client/server — e2e — (no game code changed) | blocked: owner sign-off on docs/MAP_2.md |
| 2026-09-08 | G | drop/g-map-2 | Slice 2, the drop built. Owner signed the layout ("już"), all six decisions as proposed. `packages/shared/src/gora.ts` = the doc in solids: 129 solids, 35 props, 14 lights, 12 team + 8 arena spawns, 34 × 18 m, two rings around a boarded stair core with an open light well, a back balcony and a roof over the east wing. **Registered in `MAPS`, which is what makes it real**: `map.test`, `mapFlags.test` and `floorAudit.test` all loop `Object.values(MAPS)`, so every invariant NIGHT_DISTRICT is held to now judges GÓRA on every run. Two new optional `MapDef` fields carry what a second map needs — `sites` (bomb sites were a module constant in `bomb.ts:6`; `sitesOf()` falls back to it, `stepBomb` takes them as an argument) and `huntSpawnMinM` (8 m here against 14 on a map with three times the diagonal). Server: the room takes its map from options, `filterBy(["room","mode","map"])`, `sharedWorld`'s two global caches keyed by map id (Drop I's per-room world intact), the bomb and the bots read `sitesOf(this.map)`, tactical plans are off on any map but the district (their `removes` names district solids). Client: the district's `buildArchitecture`/`buildStreetscape` added **206 meshes** of shopfront and street inside the flat — now gated and counted by a test; bomb markers follow the map; the lobby picks the map, remembers it and puts it in the invite link. **What the built geometry caught that the drawing could not**: a 1.0 m sideboard standing in the salon→kitchen doorway (over the walk grid's 0.88 m jump-up) cut the whole west wing off the map; a 0.9 m bin closed the 2 m balcony; the loft stair landed in the stock-room doorway and the fire escape ended at a 0.45 m gap in the parapet — all four found by flood-filling the walk grid from spawn 0 and printing what was unreachable. Also found and fixed BY ME, not by the suite: `arenaSpawns` (the FFA / Gun Game / Ostrzyżeni pool) was never judged by any test, and GÓRA's north roof spawn sat over the loft-stair opening — a three-metre drop on arrival. That check is now a generic test for every map. MEASURED on the built geometry (400 k eye-to-eye samples over the reachable standing surfaces): median clear sight line **5.0 m** vs NIGHT_DISTRICT's **24.0 m**, bomb rotation **2.2 s** vs **10.9 s**, first contact 5.0 s vs 8.0 s, and KUCHNIA→SKŁAD 26 m apart but 46.8 m on foot because the well splits the north half. | docs/MAP_2.md ("As built"); `apps/client/e2e/tools/{map-rotation,map-plan}.ts` → `apps/client/e2e/out/g/{rotation.md,plan.txt}` (gitignored; regenerate with the command in each tool header) | typecheck ✓ test ✓ (636: shared 194, client 282, server 160) build ✓ check:weapons ✓ (19/19) e2e — (not run: needs two live servers and a browser pair) | review |

| 2026-09-08 | G | drop/g-map-2 | Slice 3, one correction to slice 2 and the test that catches it. GÓRA declared `huntSpawnMinM` **8 m**, scaled by proportion from NIGHT_DISTRICT's 14 m (121 m diagonal → 39 m). MEASURED against the arrangement that squeezes the rule hardest — five survivors spread one to an area — **8 m and 7 m leave no legal point in the pool at all**, so `huntSpawn` falls through to the ordinary pick, which MAXIMISES distance from enemies: the chaser is sent as far from its prey as the map allows, in the mode whose premise is the hunt. **6 m** keeps ≥ 4 legal points in every arrangement swept and is still eight body widths and a whole spawn-protection window. `map.test.ts` now holds every map to it, survivors placed by farthest-point sampling over the map's own pool — GÓRA fails at 8, passes at 6, NIGHT_DISTRICT unaffected at 14. Also in this slice: `arenaSpawns` had never been judged by any test (it is the FFA / Gun Game / Ostrzyżeni pool) and GÓRA's north roof spawn sat over the loft-stair opening — free, reachable, and a 3 m drop on arrival; both the fix and the generic check are in. | docs/MAP_2.md ("As built", last section) | typecheck ✓ test ✓ (640: shared 198, client 282, server 160) check:weapons ✓ (19/19) build ✓ e2e — | review |


| 2026-09-08 | G | drop/g-map-2 | Slice 4, the code review (a separate agent, the diff + the acceptance criteria + "try to break it"). It found five things; three were real and are fixed. **(1) The roof could be climbed off.** The air-conditioner on the deck topped 0.9 m above it — under the real 0.931 m jump apex and OVER the walk grid's 0.88 m `JUMP_UP`, so every reachability check in the drop was blind to it — and from there the ceiling slab was 0.5 m up: a player could walk the roof over every room, where no bot could follow. A second route was the east parapet at 1.2 m, inside the 1.251 m crouch-jump mantle. The slab is now 3.0 m thick (top 5.8), 1.6 m clear of the highest standable thing up there, and `gora.test.ts` re-derives the margin from the geometry using the PLAYER's jump numbers rather than the grid's. **(2) Both home flags sat inside their own team's spawn**: four spawn points a side 2.33 m from a 3.5 m capture zone, so Domination gave each team a free flag and Boys let a player re-class from spawn (NIGHT_DISTRICT's nearest spawn to a flag is 20.35 m; nothing had ever checked). Flags moved to the two outer-ring rooms and the inner crossroads — KUCHNIA / SKŁAD / HOL — which also spreads DOM across the whole map; `map.test.ts` now checks every map, as a cylinder so the roof spawns stay legal. **(3) The minimap still read the module-global `BOMB_SITES`** and drew A and B off the edge of GÓRA with the compass pointing at them — a constant that still exists and still holds valid numbers breaks nothing except the picture, so the guard is a grep test over the client sources. Refuted/absorbed: the hunt-spawn test's docstring claimed more than the test samples (docstring corrected, and an adversarial placement falls back to the ordinary pick rather than crashing); two stale "8 m" references in the docs corrected; one dead floor panel under the well removed. | docs/MAP_2.md ("As built", items 4–5); `packages/shared/src/gora.test.ts`; `apps/client/src/mapAgnostic.test.ts` | typecheck ✓ test ✓ (647: shared 204, client 283, server 160) build ✓ check:weapons ✓ (19/19) e2e — | review |


| 2026-09-08 | I | claude/menu-fps-style-ui-uxgo6m | **The menu, rebuilt to the owner's brief** ("zmienić menu … ładnie jak w grach tego typu … proste ale ładne … lepiej widoczne serwery"). The diagnosis, not a taste call: everything lived in ONE 560 px column in DOM order — nickname, room, invite, six three-letter mode chips, maps, nine haircuts, bots, the buttons, and only then the open matches, below the fold on a 1080p screen. A column cannot say what matters, because every row in it is the same width and the same weight. Four rules, written into `menu.css`: **SHAPE** — the lobby is three zones (setup left, the SERVER BROWSER a full-height column of its own on the right, one launch bar pinned at the bottom saying what is about to start), each scrolling inside itself so the page never does; **RANK** — what you choose is a card with a picture, what you tune is a row, what you read is a line; **STATE** — selection is a brass border, brass ink and a corner tab, never "the slightly lighter one"; **ANSWER** — "is anyone playing?" is answered on the title screen by a live-match panel and a status pill, polled there as well as in the lobby. `menuArt.tsx` gives the six modes and the two maps inline-SVG glyphs in `currentColor` (there was no icon system at all, so six modes were six identical boxes of three capital letters): no download, no manifest entry, no licence row. Rooms sort joinable-first then fullest-first, full ones say FULL, the list has explicit empty / unreachable states and a manual refresh, and a click with no nickname typed sends the caret to the field instead of greying out the half of the lobby the player came for. **MEASURED** with a new `menu-fit.mjs` (the ui-fit pattern): 5 viewports including browser zoom, PASS on all — the browser holds 24–29 % of the screen with 4–6 of six matches readable without scrolling, nothing off screen, no page scroll, no text under 9 px. It found the first cut folding to one column at 125 % zoom and putting the rows below the fold — the exact fault the brief is about — so the two columns now hold to 900 px and the server column's width gives first. **Found on the way, not this drop's work but this drop's to fix**: the dormant HUD (mounted behind the loading screen from READY on) armed the pause overlay 300 ms in, and `startup.spec.ts`'s "no pause card on the ready screen" was passing only by beating that timer — proven by probing both trees, pause present in BOTH. Gated on `dormant` like the keyboard effect above it. | `apps/client/e2e/out/menu/{menu-fit.md,title-*.png,lobby-*.png,servers-empty.png,servers-offline.png,mode-boys.png,controls.png,settings.png,link-join.png}` — regenerate with `pnpm --filter @frankibarber/client dev` then `node apps/client/e2e/tools/menu-fit.mjs` | typecheck ✓ test ✓ (686: shared 220, client 298, server 168) build ✓ check:weapons ✓ (19/19) menu-fit ✓ (5/5) **e2e ✓ 15/15** | review |

| 2026-09-08 | C | drop/c-skins | Slices 1–4, stopped at the requested six-skin owner gate. Root-space box UVs (including magazine rest transforms); two deterministic generators and six recipes; refcounted scene material cache, first/third-person runtime and isolated 3D preview; profile migration/ownership/equip and one bounded `skins` join field. Four implementation commits. Owner then requested GitHub publication of only these changes: draft PR #24, not a production deployment. Independent art review accepted all six model directions after retracting the flat Warsztat rejection; pistol ADS openings remain visible, but factory contrast comparison is outstanding and the distant observer art frames were rejected as too small/front-facing. Two actual clients nevertheless prove the replicated field reaches the remote weapon materials. No draw-call increase in the six in-game swaps; preview closes/reopens 10 times with zero retained engines on close. Crates, quests, full Armoury and Skin Studio are not in this tranche. | docs/SKINS.md; apps/client/e2e/out/skins/{contact-sheet.png,art-review.md,preview/verification.json,shots/verification.json,slice-1-*.log,slice-2-*.log,slice-3-*.log,slice-4-*.log,build.log}; regenerate with skin-batch.mjs, skin-preview.mjs, skin-shots.mjs | typecheck ✓ test ✓ (702: shared 224, skins 2, client 307, server 169; maxWorkers=4) build ✓ check:weapons ✓ (19/19, unchanged geometry) targeted skin e2e ✓; full Playwright suite — (not run; no merge) | review — six-skin art gate; GitHub draft PR #24 |

| 2026-09-08 | C | drop/c-skins | Deployment follow-up for PR #24. The VPS Docker build could not resolve `@frankibarber/skins`: `deploy/Dockerfile` copied only the shared workspace manifest/source, so pnpm never linked the new skins workspace and Rollup could not see it. Added `packages/skins/package.json` to the dependency layer and the package source to the build layer. This changes only the image build context; runtime image contents still receive the already bundled client/server output. | deploy/Dockerfile; VPS error supplied by owner | typecheck — (no TS change) test — (no logic change) build ✓ (client + server locally) Docker build — (Docker daemon unavailable on this machine) | fixed; pushed to PR #24 |

| 2026-09-09 | C | drop/c-skins-armoury | Production visibility follow-up after the owner reported that the deployed game showed no skins. Added **SZAFA** to the ordinary main menu: all 11 weapons, an interactive 3D preview, factory finish and the six accepted launch recipes. The launch collection is granted once into old or new local profiles until crates provide acquisition; existing instances and wear remain untouched. Clicking a finish equips and saves it immediately, so the existing join-field/runtime renders it in the next match. A focused browser test opens the real menu, finds all six cards, waits for the renderer, equips Osy on the pistol and verifies `bs_profile_v1.equip.pistol`. | `apps/client/e2e/armoury.spec.ts`; Playwright `armoury.png` artifact | typecheck ✓ test ✓ (client 308) build ✓ targeted armoury e2e ✓ (1/1) | review |
| 2026-09-09 | J (new) | claude/eager-volta-0wc4f5 | **Owner's brief: analyse the game and fix everything, smoothness first.** Four recon passes (client frame path, server tick, netcode, leaks) then two bug hunts (shared rules, audio + combat). **Netcode, five faults, all framerate-shaped and none visible at 60 fps on a fast machine.** The room simulated MORE time than had passed for anyone under 60 fps: it takes 60 steps a second whatever the client runs at, and every step with an empty queue stepped a whole tick of gravity for free — MEASURED 383 ms of simulation per 267 ms of input, i.e. 1.5 g, jumps pulled out of the air, and a correction bought on every one of those steps. The step is now paid for out of the same time bank, which makes the invariant structural; 267 for 267. The CLIENT overdrew that bank: `Math.round(dtMs*10)/10` turns a 60 Hz frame's 16.6667 into 16.7, so a 60 Hz player asked for 2 ms a second more than existed and spent the bank's entire 120 ms of slack in a minute, after which the room stalled a tick at a time and dropped queued inputs for the rest of the match — `InputDt` carries the remainder instead (swept 1–240 Hz). The room REFUSED a 144 Hz player: one input per rendered frame against a cap of `MAX_INPUT_RATE * 1.5` = 135/s, so nine a second were dropped and the rest of the batch abandoned with them — a rubber-band on every window boundary; the constant is now a display refresh rate (250) that means what it says, and refusals are counted. Prediction replay RE-JUMPED (`prevButtonsBefore(0)` hard-coded to 0, so a held jump looked like a fresh press and launched a body the server had left falling — a correction loop); each pending input now carries the prev buttons it was first simulated against. Corrections were CAMERA JUMP CUTS; the body still takes the truth at once and the eye walks the error off over 80 ms, capped at 0.75 m so a spawn still cuts, with `eyePosition` deliberately ignoring the offset so hit registration is bit-identical. Remote players FROZE AND JUMPED on any lost packet (interpolation factor clamped at 1); now carried at their last horizontal velocity, fading to a stop, capped at 120 ms / 0.75 m / 250 ms of gap, never for a corpse and never vertically, with the snapshot buffer trimmed by age as well as count. **Client.** `postfx` marked every one of the map's 121 materials dirty on EVERY `settings` event — every brightness-slider step, and every automatic-quality tier change, which by design happens when the machine is already behind: a system built to protect the framerate stalled the game each time it acted. Confined to the pipeline-presence flip its own comment describes. **Leaks and lifetimes.** `ParticleSystem.dispose()` defaults to disposing its texture and two are SHARED, so the first molotov to burn out took the fireball's texture and the first smoke the dust's — every explosion after the first in a match was wrong. First-run hints rebuilt a `setInterval` ~60×/s for a whole match and never once fired (the effect depended on the whole `HudState`). `window.__fb` kept the previous Game, Scene, disposed engine and WebGL context alive. A reconnect left the old room's `onLeave` attached, able to start a second reconnect chain. **Audio.** `send()` tapped each sound's internal node UPSTREAM of the voice gain and panner and wired it straight to the shared reverb, so a shot 40 m away was ~0.08 dry and ~0.17 WET — distant gunfire came back as a directionless wash and there was no judging range by ear; each voice now owns a send pre-scaled by its gain, faded and disconnected with it. The clippers THROBBED at half a hertz (no hold, so `env`'s tau decayed the voice to 0.4 % of peak before its 1.88 s re-trigger); the self-test now measures SUSTAIN as well as peak, which is the gap that let it through — old -16.7 peak / -38.4 sustain, new -16.3 / -16.3. **Combat.** Dying mid-reload cost the start of the next life (MG-4's 5 200 ms against a 3 200 ms respawn: no firing, no reload, `busy()` blocking grenades, no sound, until a dead man's timer expired) and completed on the corpse; breath now resets on spawn, not on weapon switch, so the winded penalty cannot be erased by switching. A cooked frag auto-threw INTO the freeze and decremented the HUD for a throw the server discards. **Bomb mode.** A mutual wipe with no bomb down went to the ATTACKERS (defenders-eliminated was tested first), and `resetBomb` could put the bomb at the WORLD ORIGIN, out of reach, making the round unwinnable. **Two things deliberately NOT done, and one withdrawn.** The server is measured healthy at a FULL house (8 bots + 4 humans: mean 0.318 ms/tick, peak 10.27, budget 16.7), so the per-tick allocation churn a recon pass found is in Deferred with its numbers instead of being refactored on spec — only the ray broadphase was fixed, where the docblock's "allocates nothing" was false (a closure and a `subarray` per ray). A flagged grenade hazard did not reproduce when probed (30 ticks into a corner: `travel` never zero, never more than one bounce per step) so the physics was left alone and the tests say they are characterisation. And I coarsened the smoke opacity on a bench measurement that drove a raw sine rather than the game's already-1/50-quantised value — the real gain was 0.49→0.42 commits/frame (~0.05 ms), it turned a marginal e2e red at `received 0.96`, and it is withdrawn; the rounding is now named in `shared/smoke.ts` with both reasons beside it. | `apps/client/e2e/out/hud/frame-cost.md` (with its own correction section), `apps/client/e2e/out/weapons/parts.md`; regenerate with `node apps/client/e2e/tools/hud-bench.mjs --url <dev> --drive snapshot\|smoke\|radar\|all --label <l>`, `node apps/client/e2e/tools/audio-selftest.mjs`, `node apps/client/e2e/tools/profile.mjs`, `pnpm check:weapons` | typecheck ✓ test ✓ (743: shared 238, skins 2, server 175, client 328) build ✓ check:weapons ✓ (19/19) audio-selftest ✓ (now with a sustain check that FAILS the old hum) **e2e ✓ 15/15** (8.2 min, freshly started servers, nothing else on the machine) | review |

| 2026-09-09 | C | drop/c-crates | Added the earned cosmetic loop requested after the Armoury deploy: one automatic local-calendar crate per day, three daily match tasks worth one crate each, and an animated opening panel in SZAFA. A crate yields a weapon finish or an unowned equippable haircut; no purchase path. Expanded the procedural catalog from 6 to 19 finishes across five rarity tiers, while the six launch finishes remain the starter set and new recipes are crate drops. Profile migration defaults every new field and preserves existing progress. | `apps/client/e2e/armoury.spec.ts`; profile and catalog tests | typecheck ✓ client test ✓ (330) skins test ✓ build ✓ targeted armoury e2e ✓ (1/1) | review |

| 2026-09-09 | C | drop/c-crates | Polished the complete cosmetic presentation requested by the owner. Crates now have their own Armoury tab, a full-screen rarity reel with real finish palettes, a centre marker that lands on the actual awarded item, reveal effects and reduced-motion handling. The wardrobe has separate readable skin/haircut collections, haircut thumbnails, locked requirements and immediate equip for the next room; the lobby now presents numbered mode/class/map/bot steps and links appearance editing back to the wardrobe. Added four crate-exclusive cuts (Zaczes, Undercut, Kolce, Platynowy Fade). Marcovia's yellow-green street tracksuit now has white piping, zip/waist trim and a geometric chest crest based on the owner-supplied artwork; both teams retain identical geometry and hitboxes. | `apps/client/e2e/armoury.spec.ts`; `apps/client/e2e/startup.spec.ts`; `apps/client/e2e/out/kits/{kits-front,marcovia-close}.png`; Playwright `haircuts.png`, `crate-rolling.png`, `crate-prize.png` artifacts | typecheck ✓ build ✓ shared 238 ✓ skins 2 ✓ server 175 ✓ client 330 ✓ targeted browser 2/2 ✓ team geometry 24/24 ✓ | review |

## Decisions log (append-only)

- 2026-09-07 — Plan created from the owner's brief: weapons structure + feel, procedural skins with
  crates, party modes, shave mechanic, roles as presets, second map, accounts last.
- 2026-09-07 — Drop A, "> 5 mm from the receiver" is read as **attachment**: a part passes when it is
  connected to the receiver through a chain of parts that touch within 5 mm (barrel → handguard →
  receiver), and the plain distance to the receiver is reported as evidence, not judged. The literal
  reading would flag every muzzle device on every rifle. (lead agent; owner to confirm or reopen)
- 2026-09-07 — Drop A: the branch is the harness-assigned `claude/new-session-o0hcng`, not
  `drop/a-…` — the session may only push there. Treat it as the Drop A branch until merged. (lead)
- 2026-09-07 — Drop A: the parts check runs inside `pnpm test` (it is a vitest file) AND as its own
  CI step `pnpm check:weapons`, which prints the table. Double run costs ~3 s. (lead)
- 2026-09-07 — **PROPOSAL, owner to decide.** The plan says the weapons' truth lives in the glTF
  import pipeline (`weaponModels.ts`), but the running game never uses it: `Game.ts:164` empties
  the manifest's `characters` and `weapons` since the ChatGPT merge ("procedural art at every
  quality level"), so every player sees the procedural guns and characters, and `assets-check.mjs`
  reports 0 imported weapon sources on a live client. Drop A's tools now measure both (the parts
  check runs the import pipeline headlessly; vm-fit / hand-pose / screenshots measure what is on
  screen, i.e. procedural). Options: (a) the procedural set is the product — retire the import
  path, delete the 7 MB of glTFs from the bundle, and Drops B/C target the procedural meshes;
  (b) re-enable the imports for weapons only (one line in Game.ts) and re-run the tools on them.
  Until answered the session keeps both paths green. (lead)
- 2026-09-07 — **DECIDED (owner): option (a).** The procedural weapons are the product ("the imported
  ones looked weak; I prefer the ones generated in-game, they need improving"). Consequences, as
  Deferred work: retire the glTF weapon import path and drop the 7 MB of firearm .glb files from
  the bundle (keep `weaponRig` / `weaponFit` tests only as long as the code stays); Drops B and C
  target the procedural meshes; "improving" the procedural guns is geometry work for Drop A's next
  slices (hands, silhouettes) and skins for Drop C. (owner, 2026-09-07)
- 2026-09-07 — Drop A: ADS distance is no longer a fixed 0.36 / 0.5 m; the aim point sits at least
  15 cm ahead of the eye (`Viewmodel.ts`). Measured cause: the shotgun's bead-at-the-muzzle aim
  point put its receiver around the camera and its pump through the near plane. Changes only the
  shotgun and the LMG; the sight alignment (±1 px) is unchanged. (lead)
- 2026-09-07 — Drop B: branch `drop/b-weapon-feel` is cut from the Drop A tip
  (`claude/new-session-o0hcng`, commit 2f7c405), not from `main` — the remote has no `main` yet and
  Drop B targets the procedural guns Drop A just rebuilt. Merge order stays A then B. (lead)
- 2026-09-07 — Drop B: `equipMs` is treated as a locked gameplay number alongside damage and rpm,
  because the server gates firing on it (`TdmRoom.ts:538`). Handling weight is expressed in
  client-only numbers (sway multiplier, sprint-out, raise fraction) instead. (lead; matrix D-B1)
- 2026-09-07 — **PROPOSALS, owner to sign with the matrix** (`docs/WEAPON_MATRIX.md`): D-B1 new
  per-weapon presentation numbers live in a client-only `weaponFeel.ts` table, no `WeaponDef` or
  schema field; D-B2 the DMR becomes `scoped` with a lighter ring overlay and no breath hold;
  D-B3 while scoped Shift holds breath when still and un-scopes + sprints when moving; D-B4 the
  signature threshold (0.25 normalised) is frozen after the first real run. (lead)

- 2026-09-08 — **New drop I, "player-facing"**, opened for the owner's feedback brief. It is not
  drops A–H: those are weapons, skins, modes, the shave, roles, a map and accounts, and none of
  them covers controls, the shop, team switching, the renderer or a new mechanic. Recorded as its
  own drop rather than smuggled into B. (lead)
- 2026-09-08 — Drop I: WebGL2 is the DEFAULT renderer and WebGPU became the opt-in, reversing the
  previous "auto". The owner asked for WebGL2 from launch with nothing to switch on, and the
  codebase already carried a retry for WebGPU initialising and then failing inside scene setup —
  so the path that always works is the one players get. (owner's brief; lead)
- 2026-09-08 — Drop I: the collision world is now PER ROOM (the walk grid stays shared). A
  tactical plan takes a wall out of one room's world, and a shared world would take it out of
  every other match on the process. Measured 0.08 ms and ~376 pointers per room against the
  179 ms walk grid. `sharedWorld.test.ts` pins both halves. (lead)
- 2026-09-08 — Drop I: tactical plans are REMOVAL-ONLY. Adding geometry can close a player inside
  it and makes the bots' pre-baked walk grid actively wrong rather than merely incomplete;
  removing leaves the grid a subset of what is walkable. This is the constraint that makes the
  mechanic safe without touching server authority or re-baking nav. (lead)
- 2026-09-08 — Drop I: the Marcovia colours (white / yellow / green) come from three independent
  search results that agree — marki.pl, marki.net.pl and the club's own site — because the network
  proxy in this environment refuses all three hosts, so none could be opened and the crest was
  never seen. The kit is therefore INSPIRED BY the colours and is deliberately not a reproduction
  of the badge. Using the real crest needs the artwork and a licence decision: owner's call. (lead)
- 2026-09-08 — Drop D: the invite link changed shape, from `?room=&mode=` on the front page to
  `/r/<room>?mode=`. A path survives being pasted into a chat app where a query string reads like a
  tracking link and gets trimmed; the old query is still parsed, so links already shared keep
  working. The mode stays in the query because the matchmaker needs it (`filterBy(["room","mode"])`)
  and it is not part of the room's identity. (lead)
- 2026-09-08 — Drop D: **no new schema field beyond the one the plan names.** Gun Game's rung rides
  on `PlayerState.score` (in that mode the score IS the rung, which is also what the scoreboard
  should show), and Ostrzyżeni's round counter reuses `bomb.round`, the only replicated round
  number. `shaved` is the single addition, and it replicates like a skin id would — written on
  conversion and at round start, never per tick. (lead, L6)
- 2026-09-08 — Drop D: the clippers advance a Gun Game killer only from the clippers rung. A free
  rung on top of the victim's setback would make the clippers strictly better than every rung
  weapon and nobody would climb the ladder; the reward for the humiliation is the setback. (lead)
- 2026-09-08 — Drop D: Ostrzyżeni's sides are the existing teams (survivors 0, shaved 1) rather than
  a new concept, so friendly fire, spawn pools, the bot enemy filter and the HUD's team bar work
  untouched. The consequence is that everyone changes side during a match, so the result screen
  names a player (`ModeDef.winner`), not a team. (lead)
- 2026-09-08 — **OWNER DECISION WANTED.** As the plan specifies it (clippers + speed perk, nothing
  else) a lone Ostrzyżony essentially cannot convert anyone against competent armed opponents.
  MEASURED, in the running game with four bots: the chaser navigates to its prey correctly
  (58 m → 0.9 m repeatedly) and converts within ~1.8 s once it is inside reach (room test), but in
  three separate 60 s live rounds it converted NOBODY — it is shot on the approach. Options, none
  of which this session took because they move damage/TTK or add a rule the plan does not name:
  (a) leave it and let the playtest judge it with humans, who miss more than bots do; (b) give the
  shaved side more health or damage resistance; (c) start each round with two chasers in a full
  room; (d) shorten the round so the survivors' win is less of a default. (lead → owner)
- 2026-09-08 — **Owner answered the question above: "zrób tak aby ... żeby działało w grze
  wszystko."** Read as option (b), and measured rather than guessed. Two levers, both inside L1 and
  L6 (no new schema field, nothing gated, no damage change, no rate change): an Ostrzyżony comes
  back ON THE HUNT — the spawn point nearest a living survivor that is still `huntSpawnMinM` (14 m)
  away, instead of the ordinary rule's farthest — and carries `OSTRZYZENI.shavedHealth` = 220.
  MEASURED over eight seeded 90 s rounds of five players: 9 conversions out of 40 with THREE blank
  rounds before, 14–22 out of 40 with at most one blank round after, and the survivors still
  usually hold the clock (the chaser dies three or four times a round), which is the shape the mode
  wants. The spread between repeats is wide and 220 vs 255 sat inside it, so this is "the chase
  lands now", not a tuned number. 220 and not 300 because `PlayerState.health` is a uint8. Bots
  shoot better than people, so a room of humans is the easier room to hunt in — a human playtest is
  what should move this next, and the owner has declined to fill `docs/PLAYTEST_TEMPLATE.md`, so no
  playtest evidence is claimed anywhere in this drop. (lead)
- 2026-09-08 — **Fullscreen goes on the whole app (`.app`), never on the canvas host.** A fullscreen
  element is promoted to the browser's top layer, and everything outside it stops being painted and
  stops receiving clicks — so Drop I's Play-button immersion, which fullscreened the canvas host,
  took the HUD, the buy menu, the chat, the pause card and the result screen off the screen from
  ENTER MATCH onwards. MEASURED: a screenshot taken with the buy menu open shows the barbershop and
  nothing else, and Playwright reported `<canvas class="game-canvas"> intercepts pointer events`
  for a click meant for a BUY button. `startup.spec.ts` now asserts that whatever is fullscreen
  contains the HUD (a browser that refuses fullscreen outright stays fine). (lead)

- 2026-09-08 — **Drop G: the second map is the upstairs flat, not the delivery yard.** The plan
  offers either; the flat is the one that changes the game rather than the wallpaper. NIGHT_DISTRICT
  already has an alley and a loading yard (`map.ts:113-116`), and its measured median clear sight
  line is 24.0 m with 36.6 % of clear lines over 30 m — a lane map where the long guns own
  everything. GÓRA's longest line is 20 m and its median is room-scale, which puts the S12, the K-7
  and the clippers back in the roster Drop B tuned and gives the SR-50 exactly two lanes, both
  flankable. It is also the shop's own upstairs, which is what the vision paragraph asks a map to
  be. (lead → owner, D-G1)
- 2026-09-08 — **PROPOSALS, owner to sign with `docs/MAP_2.md`**: D-G1 the flat over the yard;
  D-G2 build to the 30 m buy-station spread rather than change the test that demands it;
  D-G3 `huntSpawnMinM` becomes per-map (8 m on GÓRA) instead of a global 14 m; D-G4 bomb sites on
  the centre line so both halves of a match are identical, not in the wings where the attacker gets
  a 1.2 s free plant; D-G5 the light well is a real hole with `killY` under it (5 m across against a
  measured 4.43 m sprint jump, so it cannot be crossed); D-G6 GÓRA ships with no tactical plans in
  its first cut. (lead)

- 2026-09-08 — **Owner signed `docs/MAP_2.md` ("już")**, all six decisions as proposed, and the map
  was built the same session. Two of them cost geometry rather than argument: D-G2 (build to the
  30 m buy-station spread instead of changing the test) is why the flat is 34 m wide, and D-G4
  (bomb sites on the centre line) is why they are the balcony and the hall rather than the two end
  rooms — a wing layout would have handed the attacking side a 1.2 s free plant. D-G3 became a
  `MapDef` field rather than a global edit, so NIGHT_DISTRICT's 14 m is untouched. (lead)
- 2026-09-08 — Drop G: **`MapDef` gained exactly two optional fields, `sites` and `huntSpawnMinM`,
  and no schema field.** Both are map DATA that used to be module constants pinned to one map
  (`bomb.ts:6`, `modes.ts:142`); both default to today's value, so NIGHT_DISTRICT and every test
  that names it behave identically. The replicated state gained nothing — `mapId` was already there
  (`TdmRoom.ts:252`) and the client already resolved it (`Game.ts:164`). L6 untouched. (lead)

- 2026-09-08 — Drop G: **a number arrived at by proportion is not a measurement.** `huntSpawnMinM`
  was set to 8 m on GÓRA by scaling NIGHT_DISTRICT's 14 m against the two maps' diagonals, and it
  was wrong: the rule it feeds has a fallback that does the OPPOSITE of what the rule wants, so a
  value that is merely too large does not degrade — it inverts. Anything scaled from another map
  should be swept against the case that squeezes it before it ships. (lead)

- 2026-09-08 — Drop G: **the walk grid is not the player.** `JUMP_UP` is 0.88 m and a real jump
  apexes at 0.931 m, with a crouch-jump mantling 1.251 m, so there is a band of ledges a player can
  climb and the grid cannot see — and every "is it reachable?" test in this repo runs on the grid.
  GÓRA's roof was climbable through exactly that band. Any claim that a surface is out of reach has
  to be made with the PLAYER's numbers; `gora.test.ts` is the pattern. (lead, from the review)

- 2026-09-08 — Drop B was built TWICE, by two sessions in parallel on the same branch name. The
  owner kept this branch (cleaner D-B2: `WeaponDef.scoped` still means the SR-50 and the overlay is
  a client-side style, so the shared balance test's predicate never had to move) and took three
  things from the other: the linear ADS blend, M1, and the `weapon-shots.mjs` repair. The other
  session's remaining differences, not taken: a z-score signature metric instead of octaves, and a
  measured half of the signature test that asserts separation on the JSONs the tool wrote rather
  than only on the design. Worth a look if the octave metric ever needs a second opinion. (lead)
- 2026-09-08 — **Drop E started before a playtest exists**, which `MASTER_PROMPT.md` says it should
  not ("Drop E/F/G/H — do not start these until the owner has played A–D and filled
  `docs/PLAYTEST_TEMPLATE.md`"). `docs/playtests/` is empty and Drop D's row records that the owner
  declined to fill the template. The owner named Drop E for this session, which is the override the
  rule allows for; it is written down rather than passed over, because the consequence is real: no
  claim in this drop about how the shave FEELS is backed by anybody playing it. (owner; lead)
- 2026-09-08 — Drop E: the plan names **one schema field** for haircuts, and one is what it got —
  `PlayerState.haircut`, a string encoded `"<id>"` or `"<id>#<n>"`: the equipped cosmetic id, plus
  the number of times that head has been shaved this match. Both live in one field on purpose, not
  to save a field: the equipped id SURVIVES a shave (so at the whistle a player still owns the look
  they chose, and `newMatch` restores it), and the count is exact rather than clamped to the four
  drawable stages, so "Najgorsza fryzura" can rank three players who have all been ruined. Written
  on join, on equip and on a shave death, never per tick (L6). (lead)
- 2026-09-08 — Drop E does **not** reuse Drop D's `shaved` boolean for the shave, against the
  Deferred note that suggested it. `shaved` is a bare scalp and an Ostrzyżeni side; Drop E's shave
  is a BAD HAIRCUT, which is a different picture and the one the plan asks for ("a visibly bad
  haircut", not "no hair"). They coexist on the same head with a stated precedence: a bare scalp
  wins, because a head that has just been clipped to the skin has no hair on it to ruin. (lead)
- 2026-09-08 — Drop E: the scoreboard's razor column counts times a player has **been** shaved, not
  shaves they dealt. That is what the replicated field carries and what the award ranks, and it is
  the joke the mode is about. Shaves DEALT are counted separately, client-side, from the server's
  `shave` flag on the kill event into `LifetimeStats.shaves` — that is what unlocks IROKEZ and
  BLOND. A player who joins mid-match sees the right column either way, because the count is parsed
  from the state rather than tallied from events they did not receive. (lead)
- 2026-09-08 — Drop E: `isShave` is mode-independent — a clippers backstab is a shave in Ostrzyżeni
  and Gun Game too, on top of whatever those modes already do with a clippers kill. Making it
  TDM-only would have been a second rule to explain; letting it run everywhere costs one string
  write on a death that was already happening. Ostrzyżeni will therefore produce high counts and its
  "Najgorsza fryzura" will usually name whoever chased worst, which reads correctly. (lead)
- 2026-09-08 — Drop E: **"first person" in the evidence set means the view of somebody ELSE'S head.**
  Measured, not assumed: `Character` is constructed only for remote players
  (`RemotePlayer.ts:59`), the viewmodel is hands and a gun (`handSpec.ts`), `Game.ts:172` empties
  the imported character list, and there is no mirror and no third-person camera — so a player
  never sees their own haircut at all. `haircut-shots.mjs` therefore shoots the head through a
  player's own eyes at 4 m and 8 m, which is the view the mechanic actually has to survive. Giving
  the player a look at their own head needs a profile/preview screen; PR #14 deleted the one that
  existed. (lead)

- 2026-09-08 — **Drop E, art: the shave does not read at gameplay range, and that is the drop's own
  headline claim failing.** Two art reviewers who did not build it, looking at two independently
  captured sets, agreed: at 8 m the character's head is about TWELVE PIXELS, and at that size no
  shave stage was distinguishable from an ordinary haircut. Round 2 added that the escalation ran
  backwards — RUINA read as a CLEAN bald head, less ruined than the patchy stage before it, under a
  tall block that read as "a chimney or a render fault". Two things were changed in response and
  NEITHER has been judged: hair coverage now falls monotonically across the stages (the first cut
  escalated a *groove's width*, which left the worst stage with more hair standing than the one
  before it), and the shaved scalp got its own raw-red material distinct from Drop D's pale stubble,
  on the reasoning that at twelve pixels geometry is gone and only TONE survives — a pale bald head
  is a look somebody might choose, a red one is something done to them. The owner's call is whether
  a red scalp on a night map is the right answer or whether the mechanic needs a different carrier
  entirely (a marker over the head, a kill-feed-only tell, a bigger head). Do not read the code as
  settled art. (lead)
- 2026-09-08 — Drop E, harness: `haircut-shots.mjs` pins the SUBJECT in front of the camera, so its
  "4m" / "8m" filenames are NOMINAL — the game's own `RemotePlayer.update` writes the remote's
  position from interpolation on the same frame, and the rendered range drifts toward wherever the
  server has them. The obvious fix, teleporting the camera to a true stand-off instead, was built,
  measured and REVERTED: bots walk, so it got true ranges and lost the subject — 17 of 37 frames came
  back with nobody in them. Holding a bot still needs a dev hook that does not exist. Until then the
  set proves "a head, near and far", not "a head at exactly 8 m". (lead)
- 2026-09-08 — Drop E: two harness faults cost most of this session and are worth writing down so the
  next tool does not repeat them. (1) The client joins with `deferSpawn: true` and does not put you
  in the world until ENTER MATCH is clicked (Drop D/I's connect → ready → deploy); without the click
  `hud.alive` is false forever and every shutter reports a death that never happened. Drop A's
  `weapon-shots.mjs` predates that gate, so copying its recipe is not enough. (2) The photographed
  subject must be a TEAMMATE — an enemy bot shoots the camera between the pose and the shutter, every
  time. (lead)


- **Drop I / menu (2026-09-08): the lobby's CSS left `styles.css` for `menu.css`, imported by
  `Menu.tsx`.** `styles.css` was 770 lines carrying the menu, the HUD, the shop, the scope, the
  minimap and five drops of overrides, and the menu's own rules were spread over four of those
  layers (`.menu` was re-declared 400 lines below itself). What stays behind is only what the
  pause card shares with the menu — `.menu-btn`, `.link`, `.field`, `.switch`, `.segmented`,
  `.wordmark`, `.muted`, `.settings`, `.panel h2/h3` — and the menu-only rules were deleted rather
  than left to rot next to their replacements. A component that owns its own stylesheet is the
  pattern to repeat for the shop and the HUD if either is next. (lead)
- **Drop I / menu: nothing in the lobby was gated, renamed or removed.** Same six modes, same two
  maps, same nine haircuts, same bots range, same room code, same invite link, same
  `onPlay` contract, every `data-testid` the e2e suite names. It is a layout and a skin, so the
  15/15 e2e run is the claim that the flow is unchanged, not an assertion of taste. (lead)
- **Drop I / menu: a dormant HUD decides nothing.** The HUD is mounted invisible from READY on so
  its first commit is not paid at DEPLOY (App.tsx), and while dormant it is connected with no
  pointer lock — the exact shape of "the player pressed Escape" — so it armed the pause card 300 ms
  into every ready screen. `startup.spec.ts` asserts there is no pause card there and was passing
  only because it got to the assertion first; the menu's slightly different first paint lost that
  race, which is how the bug surfaced. MEASURED on both trees before changing anything: the pause
  card is present on the ready screen with the old menu too. Fixed at the source (the effect is
  gated on `dormant`, as the keyboard effect beside it already was), not by moving the assertion.
  (lead)

- **2026-09-08, Drop C slices 1–4 (owner brief; implementation by Codex).** The new brief supersedes
  the stale glTF skin path: textures apply to the procedural `weaponMeshes.ts` models. The existing
  `mulberry32` was found in `shared/hitscan.ts`; `rng.ts` re-exports it rather than altering combat.
  `meshesByMat` stores arrays because magazines/actions repeat material keys; their UVs include the
  rest transform. The 12-set cache target is soft only while all sets are referenced; invisible guns
  restore factory pointers and release their leases. Steel, brass and lens stay factory because the
  first two include sight blades. Operation hashes are pinned; cross-browser raster pixel identity
  is not claimed. Colour arrays are scalar comma-separated recipe parameters. (implementation)
- **2026-09-08, Drop C publication (owner).** After requesting the full brief's slice-4 art gate,
  the owner asked to publish only the prepared changes and clarified the destination as GitHub.
  Publish slices 1–4 as draft PR #24 on `drop/c-skins`; no merge or production deploy was requested.
  Independent review allows six model directions for owner review, not final gameplay acceptance.
  Fifth rarity, daily seeds/grants and crude-art defaults remain later-slice decisions; no crate or
  purchase code exists in this tranche. The weapon preview does not close the Deferred head preview.

- 2026-09-09 — **New drop J, "smoothness and correctness"**, opened for the owner's brief
  (*"przeanalizował grę i poprawił wszystkie błędy … najważniejsza jest płynność rozgrywki
  optymalizacja"*). It is not drops A–H, and not drop I either: I is the player-facing feedback list
  (controls, shop, teams, renderer, the living arena), while this is the frame loop, the tick and the
  wire. The plan already anticipated it as `OPTIMIZATION_PROMPT.md` on its own branch; recorded as a
  drop so it gets a ledger row like everything else. (lead)
- 2026-09-09 — Drop J: the server's idle-gravity step is now **bought from the same time bank as an
  input**. This is not a change to the tick rate, the snapshot rate, the prediction model or server
  authority, so L6 is untouched: it makes the room OBEY the rule `ARCHITECTURE.md` already states
  ("inputs cost their `dt` → clients cannot run faster than real time") in the other direction as
  well. Before it, the room simulated 1.5x real time for anyone under 60 fps — measured, see the
  ledger row. (lead)
- 2026-09-09 — Drop J: `MAX_INPUT_RATE` raised 90 → 250 and the `* 1.5` slack in `rateLimited`
  removed, so the constant means what its name says. It is a FLOOD guard, not an anti-cheat: the time
  bank prices every input by its `dt`, so extra inputs buy no extra movement. At the old effective
  ceiling of 135/s a 144 Hz client had nine inputs a second refused, and the refusal also abandoned
  the rest of the batch — a rubber-band on every one-second window boundary. (lead)
- 2026-09-09 — **PROPOSAL, owner to decide. Fixed-timestep client prediction.** Prediction currently
  runs once per rendered frame (`ARCHITECTURE.md`, "`LocalPlayer` runs `simulateBody` per frame"), so
  the input rate IS the framerate. Everything up to 240 fps now works, but above that a client queues
  faster than the room can drain (4 inputs/tick) and loses inputs, and at any framerate the client's
  frame slices never line up exactly with the server's ticks, which is where the residual mispredicts
  come from. The standard fix — accumulate real time and simulate in FIXED slices, one input per
  slice — would make both ends simulate identical steps and drop corrections towards zero. It is
  squarely inside what **L6** locks, so it was not done. Cost is one focused slice on `LocalPlayer`
  plus its tests; the risk is that every feel number tuned against per-frame stepping wants
  re-checking. (lead)
- 2026-09-09 — Drop J: correction smoothing is a **render offset on the camera only**. The body still
  takes the server's position in one step, and `eyePosition` — what every shot is built from — ignores
  the offset, so hit registration is bit-for-bit unchanged and there is no question of L6 or of
  server authority. Capped at 0.75 m so a spawn or a teleport still cuts rather than sliding the view
  through the map. `prediction.test.ts` pins both halves. (lead)
- 2026-09-09 — Drop J: remote players are now **extrapolated** for up to 120 ms and 0.75 m past their
  newest snapshot instead of freezing. This is presentation only (`RemotePlayer`'s own docblock:
  "never used for hit tests"), the velocity fades to a stop so it reads as slowing rather than
  sliding, and it is refused outright for a corpse and for the vertical axis (no `vy` on the wire).
  The alternative — an interp delay that tracks measured jitter — is better and is L6-locked; it is
  in Deferred. (lead)

- 2026-09-09 — **Drop J, owner's call: crouch goes back on Ctrl.** This REVERSES the 2026-09-08 default
  (`InputState.DEFAULT_BINDINGS.crouch = ["KeyC"]`), which was chosen because Ctrl+W closes the tab and
  `preventDefault` cannot stop it. Nothing about that has changed; what changed is the evidence that
  moving the default did not move the players. Ctrl and C are both bound, Keyboard Lock is asked for
  every risky chord, and `beforeunload` is armed for the life of a match so the unstoppable case
  becomes a dialog instead of a lost round. (owner)
- 2026-09-09 — Drop J: the slide is restored WITHOUT the two replicated fields it originally carried
  (`PlayerState.slide` / `slideCd`). The plan gates schema fields, and they are not needed: the rule is
  deterministic on both ends, and an observer reconstructs the pose with `slideSeenUntil` from `crouch`
  and speed, both already on the wire. MEASURED that the naive version of that reconstruction is
  wrong — the fastest crouch walk in the game is 3.555 m/s against a slide that ends at 3.2 — so it
  arms on the entry burst instead of testing the state. If the owner ever wants it exact rather than
  reconstructed, it is one field and this entry is the place to reopen. (lead)
- 2026-09-09 — Drop J: `KillEvent.assists` is a MESSAGE field on `S2C.Kill`, not replicated state, so
  the kill feed naming assisters costs nothing in the snapshot budget and nothing in `PlayerState`.
  Noted because "adding a field" and "adding a schema field" are the same words for two very different
  things, and only the second is gated. (lead)
- 2026-09-09 — Drop J: **"I see no changes" is a question about which commit is deployed before it is a
  question about the code.** The owner's report came with a guess attached (the skins broke it) and the
  guess was wrong; the cause was that PR #26 merged at slice 1's head and slice 2 arrived after. Ten
  minutes of `git log origin/main..HEAD` answered what a bug hunt would not have, so: when a change is
  reported missing, establish that the build under test CONTAINS it before reading a line of the
  feature. Corollary, and the reason this drop needed a third slice at all: **pushing a branch is not
  shipping.** A merged PR is finished and cannot pick up later commits, so work pushed to a branch whose
  PR has already merged is invisible until a new PR carries it. (lead)
- 2026-09-09 — Drop J: the branch was rebased onto `origin/main` rather than merged into, because its
  merged half was already in `main` and a merge would have re-proposed it. This keeps a PR for the
  branch reviewable as exactly the three unmerged commits. Recorded because it means the branch's
  history was rewritten once, deliberately, on a branch nobody else had checked out. (lead)
- 2026-09-09 — Drop J: **one Playwright suite at a time, and read the run time before the failures.**
  Two suites against one Colyseus server both drive `dev:teleport` and `dev:endmatch` in the same room
  and produce failures that belong to neither run. A suite that normally takes 8–9 minutes taking 15.5
  is the tell, and it is visible before any failure is opened. The rule already existed for the
  collision bench; it applies to e2e for the same reason and is now written down for both. Retire such
  a failure by re-running ALONE and showing the same test passing — never by calling it flaky. (lead)
- 2026-09-09 — Drop J: `pgrep` cannot be trusted to tell whether a run is alive in this harness.
  `pgrep -c playwright` matches process names and answers 0 for a live `npm exec playwright test`;
  `pgrep -f <pattern>` then matches the harness's own wrapper shell, whose command line contains the
  pattern, so it never reaches 0 and cleanup looks stuck. Use
  `ps -eo args --no-headers | grep -v grep`. Paired with never piping a long run through `tail` —
  it buffers, so a running suite and a dead one look identical. Both cost a whole run here. (lead)

## Deferred (things noticed, deliberately not done)

- **Drop J: prediction runs per rendered frame, so above ~240 fps a client outruns the room.** The
  server consumes at most 4 inputs per tick (240/s) and a client emits one per frame, so a 300 Hz
  display queues faster than the room drains and the queue's oldest entries are discarded — a lost
  input is a permanent disagreement until the next correction. The real fix is a FIXED-TIMESTEP
  prediction loop (accumulate real time, simulate in fixed slices, one input per slice), which makes
  client and server simulate byte-identical steps at any framerate and pins the input rate. It is
  also a change to the prediction model, which **L6 locks** ("prediction and interpolation stay
  exactly as `ARCHITECTURE.md` says", and the doc says `LocalPlayer` runs `simulateBody` per frame).
  Not done here for that reason. Owner's call — see the Decisions entry of 2026-09-09.
- **Drop J: below 20 fps a player loses movement authority in proportion, by design.** `dt` is clamped
  to `MAX_INPUT_DT_MS` (50 ms) per input, so a 10 fps client can only ever buy 500 ms of simulation
  per real second; the rest of the second is spent by the room's own gravity-only step, which now
  charges the same time bank. The totals are right — simulated time still equals real time, which is
  the invariant this drop fixed — but half of it is a body falling with no input on it. The clamp is
  what stops a tab that was asleep for two seconds from teleporting, so it should stay; if 10 fps is
  ever a framerate worth supporting, the answer is for the client to emit TWO inputs on a long frame
  rather than one clamped one. Nobody has been asked to play at 10 fps, so nothing was changed.
- **Drop J: `INTERP_DELAY_MS` is a fixed 110 ms** (`constants.ts:14`), about two snapshots plus
  60 ms of jitter budget. Anyone whose jitter exceeds that gets extrapolation (added here) instead of
  interpolation, which is a guess. An interp delay that tracks measured jitter is the standard answer
  and is worth more than any further micro-optimisation on this list — but the constant is named in
  `ARCHITECTURE.md`, so it is L6 as well.
- Drop J: `useHud()` subscribes the whole 600-line `Hud` to every field, so ANY changed field
  reconciles all of it — including `serverNow` and `ping`, which change on every 10 Hz sync. The
  smoke case was the acute one and is fixed by quantising; the general fix is to split `Hud.tsx` into
  components that take `useHudSlice`. MEASURED baseline for whoever does it:
  `apps/client/e2e/out/hud/frame-cost.md`, 0.29 ms/frame of React at rest.
- Drop J: the per-tick allocation churn a recon pass found in the room and left alone **because the
  measurement says it does not matter**: `stepBot` builds a fresh view object per enemy per bot per
  tick (~80/tick) and re-walks the whole `MapSchema` per bot; the `senses` literal and its `los`
  closure are per bot per tick; lag-comp history is `push`/`shift` on an array rather than a ring;
  `perksOf` allocates per living player per tick. MEASURED with a FULL house (8 bots + 4 humans,
  `tickCost.test.ts`): mean **0.318 ms/tick**, peak **10.27 ms**, budget 16.7. Nothing here is worth
  churning a 2 000-line hot file for; revisit only if a real server shows tick overruns.
- Drop J: `maxLightsPerMesh` measured **45** on the district's worst mesh (`profile.mjs`), against
  materials capped at `maxSimultaneousLights` 4–5. That is not a per-frame cost — the shadow map is
  `refreshRate` 0, rendered once — but it means only 4 or 5 of the 45 lights in range actually light
  that mesh, chosen by list order, so lighting can pop as a player crosses the map. A LOOK problem,
  not a speed one; the fix is per-light `includedOnlyMeshes` in the map data.
- Drop J: no render timing measured in this container means anything. Turning effect density from 0
  to 1 moves the median `scene.render()` from **3 ms to 255 ms** on SwiftShader, so alpha-blended
  particles dominate every frame a grenade is on screen and swamp any other attribution. 31 of 60
  consecutive renders exceeded 50 ms during a bot fight. On a real GPU those quads are nearly free —
  but nobody has confirmed that, and until somebody does, no client render claim in this drop rests
  on a clock.
- Drop J: `skinCache.evict()` is a SOFT cap by design (evicting a live texture would corrupt another
  gun's material, and the docblock says so), so with 12 players wearing 12 distinct finishes the
  cache sits at its limit with nothing evictable. Self-limiting in practice — a weapon switch drops
  the lease — but it also rebuilds a pair array and sorts it on every acquire and release. Left as
  is; if the Armoury ever holds many previews open at once, that is where to look.
- Drop J: the client bundle ships **8 firearm and 2 character `.glb` files** (13 MB of `dist/models`
  out of 23 MB) that the running game never loads — `Game.ts` empties the manifest's `weapons` and
  `characters`, which is the owner's decided option (a). They are not downloaded by a player (the
  loader is lazy and never asked), so this is deploy-image weight, not load time. Removing them is
  Drop A's already-written Deferred item and still waits on the owner's word about the characters.
- Drop J: two e2e tests were flaky for reasons that were not the thing they tested, and both are
  fixed as TESTS rather than as game changes, because in both cases the game is behaving correctly.
  `smoke obscures the view from inside` asserted `smokeOpacity === 1` exactly, but the cloud grows, so
  teleporting to the burst point lands the player near its edge or well inside it depending on how
  many frames SwiftShader managed — the honest reading plateaus between 0.96 and 1.0, and it failed
  about half the full runs while passing alone. `drop 5: … a mark on the map` middle-clicks once, and
  marking is only allowed while ALIVE (`Game.frame` clears the request either way), so by that point
  in a full run the room's bots have often killed the marker and the click is dropped in silence. Both
  now assert what they are named for. If more of these appear, the pattern is the same: a full run is
  five minutes of bots shooting at the test's own player.
- Drop C before art acceptance: compare painted metal sight housings/notches against a factory ADS
  reference (the post, steel and brass are preserved, the surrounding metal is painted). The 3 m/12 m
  observer frames are too small/front-facing for pattern review; replace them with valid side views.
- Drop C next slices: bot cosmetic assignment; choose how duplicate-instance wear is equipped and
  replicated before crates ship (the present one-field contract carries recipe IDs only). Preview
  `data-ready` can settle early under rapid consecutive selections; bind that diagnostic to the
  current model when extending the standalone preview into Armoury. None affects skin ownership.

- Drop B: `weapon-signature.mjs` drives the client at ~2 fps, where a 500 ms frame swallows every
  ADS blend in the roster (a clean run measured 2257 ms for the R-44's 120). Dropping the graphics
  preset and the render scale for the run puts it above 20 fps and makes axis 3 measurable; the
  linear-blend commit above was verified at that framerate with a differently configured harness,
  not with this one.
- Drop B / Drop I: the ENTER MATCH click fullscreens the CANVAS HOST, and a fullscreen element
  hides its siblings — the HUD is one, so a frame captured inside fullscreen has no ammo, no
  crosshair and no scope overlay. `weapon-shots.mjs` leaves fullscreen to work around it. Somebody
  should check on a real browser whether a player in fullscreen keeps their HUD; if it reproduces
  there it is a serious bug and it is drop I's.
- **Drop E, the open item: make a shave read at 8 m.** Not done, and not for want of trying — see the
  Decisions entry. The unexplored options, cheapest first: a bolder scalp colour or an outline; the
  shave changing something LARGER than the head (the apron, a towel round the neck); a HUD tell on
  the shaved player rather than on their model; or accepting that the shave is a kill-feed-and-
  scoreboard mechanic that you read on the summary screen rather than across a street. The last is
  not a defeat — the award and the razor column already work — but it is a design decision, not a
  bug fix, so it is the owner's.
- Drop E: art review round 2 found `bowl` ≈ `curtains` and `pompadour` ≈ `taper` at a glance, and
  buzz/taper/pompadour identical in profile. Nine haircuts built from crown/sides/fringe boxes do not
  give nine silhouettes; separating them needs either more shape vocabulary (partings, volume,
  asymmetry) or colour, which is Drop C's problem solved for weapons and not yet for heads.

- **Drop E: a player cannot see their own haircut.** There is no mirror, no third-person camera and
  no profile preview (PR #14 deleted `ui/Profile.tsx` and `ui/Armoury.tsx`), so the reward a player
  earns is a reward only other people see. The lobby picker names the cut and says what unlocks it,
  which is the cheapest thing that could work; a rendered head in the picker is the real fix and is
  a Drop C-shaped piece of work (a small scene, one character, no map).
- Drop E: the HUD evidence is screenshots, not tests. The client has no React test renderer (no
  `@testing-library`, no jsdom environment — the suite runs in node), so the razor in the kill feed,
  the scoreboard column and the "Najgorsza fryzura" row are proven by looking at them. The DATA
  behind all three is unit-tested (`haircuts.test.ts`, `DropE.test.ts`, `profile.test.ts`); the
  markup is not. Adding a renderer is a repo-wide decision, not Drop E's.
- Drop E: bots wear haircuts from the catalog, spread across it by index, and a bot can therefore
  win "Najgorsza fryzura". That is correct — a bot that got backstabbed four times deserves the
  award — but a room of bots will hand it out most nights, which may make it feel cheap. Worth a
  playtest verdict before excluding bots from it.
- Drop E: the shave count is per MATCH, and `newMatch` clears it. A player who leaves and rejoins
  mid-match comes back unshaved, because `onJoin` builds a fresh `PlayerState`. That is the same
  hole as the wallet reset already recorded above, closed by the same thing (a stable player
  identity, nick+token or the accounts of Drop H) and not worth a separate mechanism.

- Drop D: a TDM player can spawn on an ARENA spawn point, because `pickSpawn` is called with the
  whole pool for TDM (`this.mode === "ffa" || this.mode === "tdm"` on main, unchanged in meaning
  here). `TdmRoom.test.ts`'s join test asserts the spawn belongs to the player's team, so it fails
  roughly one run in five. Pre-existing, not this drop's — but it is a real flake in the suite:
  either the pool or the assertion is wrong, and somebody should decide which.
- **`main` is red in e2e, twice over**, both times a test left behind by the shop it tests:
  `drop 2: buy menu…` asserts the DMR card is disabled after switching to the GRENADES tab (the
  tabbed shop from PR #14 renders no weapon cards there), and `clean entry, deferred spawn…` clicks
  a BUTTON named GRENADES that drop I's one-screen shop replaced with an aisle label — a `span`,
  not a button (`Shop.tsx:216`), so it also never finds CLASSES, now a role strip. MEASURED on
  unmodified `main` in a clean worktree both times, not only on this branch. Each is a couple of
  lines in the test; neither is Drop D's to change.
- PR #14 (The Boys) landed without a ledger row and deleted a large part of the 2.1 UI — Armoury,
  Profile, HowToPlay, Online, the invite module, mastery, challenges, the defuse kit, the bomb
  blast, slide. Some of that is plainly deliberate (the class mode replaces FFA); some looks like
  collateral (join-by-link, which the plan assigns to Drop D, was restored here on the owner's
  word). Worth one pass by the owner to say which deletions were meant, before Drop E builds on
  the parts that are left.
- Drop D: the smoke e2e ("smoke obscures the view from inside") failed twice in a row against a
  game server process that had been up about twenty minutes and 64 k ticks, and passed both alone
  and in a full 18/18 run against a freshly started one. Nothing in this drop touches grenades,
  smoke or the VFX module, so it looks like something in a long-lived process degrading — worth
  half an hour with `/health.tick` and a soak before a deploy, because a hosted server IS a
  long-lived process.
- Drop D: survivors can re-buy at a `$` station in the middle of an Ostrzyżeni round, not only in
  the buy window at its start. That is the economy's existing station rule applied to a new mode
  rather than anything new; tighten it if a playtest says the shop is being used as a bolt-hole.
- Drop D: the Ostrzyżony is shaved IN PLACE at the start of a round, so they begin standing among
  the people they are about to chase. It reads as the joke the mode is (one of you is the barber),
  but if it plays badly, spawning them apart is a small change in `beginInfectionRound`.
- Drop D: a room where every player but one disconnects mid-Ostrzyżeni-round burns its remaining
  rounds as prep + break with nobody to play them; the match ends normally. Not worth a rule until
  somebody sees it happen.
- Drop D / E: `Character.ts` now has a `bareHead` mesh and a merged, toggled `cap`. Drop E's shave
  should set the same `shaved` flag rather than adding a second head variant, and a real haircut
  set will want the cap and hair separated again.

- Server perf pass (shared nav grid, bot LOS cache, compression, snapshot trimming) — separate
  brief `OPTIMIZATION_PROMPT.md`; runs on its own branch, does not block any drop above.
- `defaultServerUrl` same-origin fallback (`Connection.ts:253-261`) — in the perf brief.
- Drop A, next session: `vm-fit.mjs` ±1 px ADS numbers, `hand-pose.mjs` 5° bore check, the
  idle/ADS/reload/inspect screenshot set and its art review — all need the dev server + browser.
- Drop A: the LMG's procedural front sight is now 76 mm tall (base dropped onto the barrel, top kept
  at the rail-height sight line). Lowering the sight line means lowering the rear sight too; judge
  on a screenshot first.
- Drop A: the sidearm rule puts the left hand 29–40 mm INTO the pistol/revolver frame (two-handed
  hold, unchanged from before) and the SMGs' support hand now rests under the magazine well. Both
  are what the numbers say a two-handed hold is, but only a screenshot says whether they read.
- Drop A: the RPG model has no pistol grip (`Side_Grip_Left/Right` are 4 mm strips at the rear
  cover); the hand origin is the box-proportion fallback. A hand-set grip would need a manifest
  field the plan does not name — ask before adding one.
- Drop A (owner decision, option a): remove the glTF weapon import path — `weaponModels.ts`, the
  `weapons` block of `public/models/manifest.json`, the eight firearm .glb files, and the "gltf"
  branch of `weaponParts.check.test.ts` — in its own commit, after the owner confirms the
  characters' import path goes the same way (it is disabled in `Game.ts` too).
- **Drop A, the one geometry item left**: in first person the support forearm crosses THROUGH the
  fore-end on every long gun instead of the hand gripping it from below, so no hand reads on the
  handguard (art review rounds 3–5, `e2e/out/weapons/*/fp_idle.png`). `handSpec.ts` models a palm,
  fingers, thumb and forearm and `supportHandHome` places the hand against the fore-end's
  underside; what is wrong is the ARM's approach angle — the hand pivot's rotation sends the
  forearm through the gun body. Needs a pose loop against the screenshots, like the third-person
  hold got: `characterHold.ts` is the pattern (compute it, assert it, then search).
- Drop A: `pistol/tp_idle` came back empty in round 5 while the other 21 third-person frames were
  fine — the alive-check runs before the shutter, and a bot kill in between still slips past.
- Drop A: the viewmodel hands are now a jointed palm/fingers/thumb/forearm (`handSpec.ts`); at
  720p the palm still reads as a mitten. Fingers that wrap per grip shape are a later polish.
- Drop A / E: the third-person idle pose holds every weapon with both arms straight out at the
  camera, so from the front the gun hides behind the hands ("tan brick", art review round 3) and
  from the side smg/smg2 are twins and shotgun/dmr/rifle share a plain-barrel profile. Character
  pose work (`Character.ts`), not weapon geometry; the profile frames are the ones to judge.
- Drop A: the seating rule accepts a magazine touching ANY static part (a mag touching only a
  sling loop would pass — code review). Tighten to "grip, receiver or magwell" if a spec ever
  abuses it.
- Drop A / B: the DMR's ADS looks through an opaque lens disc (it has a scope model but is not
  `scoped`, so no overlay); the sniper alone gets the overlay. Drop B decides whether the DMR is a
  scoped weapon.
- Drop B / C: the smg / smg2 and dmr / sniper procedural silhouettes are near-identical at a
  glance (art review). Feel (B) and skins (C) can separate them; geometry cannot without new specs.
- Drop A: the sniper's breath through the scope is ±3 px at 960×540 (vm-fit); hold-breath (Drop B)
  is the fix, not a geometry change.
- Drop A: `weaponRig` has no `receiver` / `foregrip` roles; `weaponParts.pickReceiver` names the
  receiver by regex-then-volume instead. Fine for this pack; revisit if a model has a named
  handguard the support hand should be told about.
- Drop B (recon): remote players eject no casings and get a fixed 0.30 flash (`view/index.ts:100`);
  the other player's view of a weapon is not on the six axes and stays as it is until a playtest
  asks for it.
- Drop B (recon): the `clippers` row of the audio voice table is dead (melee routes to
  `meleeSwing`, `sfx.ts:42-43`); harmless, remove when the table is next edited.
- Drop B (recon): reload audio has exactly two shapes (shotgun shell-feed vs mag-out / mag-in /
  bolt, `sfx.ts:252-274`); the matrix's per-weapon mechanical sounds (hammer, pump, bolt,
  break-open, belt) will replace this if the matrix is signed.
- Server (found by PR #13 CI, not Drop B's to fix): `TdmRoom.test.ts:53` "assigns balanced teams
  and spawns each player alive at a map spawn point" is a coin toss on `main` since the ChatGPT
  merge (8bc1256): `TdmRoom.ts:825` passes `anyTeam` to `pickSpawn` for TDM as well as FFA, so a
  TDM join can land on the other team's point or an arena point, and `pickSpawn` picks at random
  among the top three. Locally 1 in 10 runs fails; CI passed and failed the same commit. Either
  the test accepts `[...spawns, ...arenaSpawns]` for TDM, or TDM goes back to `!this.teams` —
  the owner decides which is the intended rule. Seeding the harness PRNG would only hide it.
  **Drop D, 2026-09-08:** it went red on PR #16's CI, so the TEST now asserts the pool the room
  actually draws from (a spawn off the grid is still caught). That is a test-only change and does
  NOT answer the question: if the owner's answer is that TDM should use its own team's spawns, the
  room drops `|| this.mode === "tdm"` and the assertion goes back to `s.team === p.team`.
- Drop B: the ADS blend is a framerate-dependent lerp (`LocalPlayer.ts:243`), so `adsMs` is not
  the measured 0.1 → 0.9 time; `weapon-signature.mjs` measures the real time and the matrix quotes
  `adsMs` as intent. Making the blend exact is a one-line change to do with the tool in hand.

- Drop I: **leave-and-rejoin still resets the wallet** (`TdmRoom.ts` onJoin calls `writeWallet(p,
  freshWallet())`). Team SWITCHING can no longer be used for it — that is tested — but the rejoin
  hole is older and closing it needs a stable player identity (nick+token, or the accounts of drop
  H). Not guessed at here.
- Drop I: a report that a 0.5 m crate at site B triggers a pathological step-up path did NOT
  reproduce: measured 3.0 `overlaps()` calls per tick at every obstacle height from 0.35 m to
  1.1 m, the same as walking free. No map geometry was changed on that basis. If site B still
  hitches after this drop, that is the next thing to measure on a real GPU.
- Drop I: only the ATTACKING team votes on a tactical plan. Sides swap at halftime so it evens
  out over a match, but a defender never gets the choice within a half. Worth a playtest verdict
  before adding a second, defence-side plan slot.
- Drop I: plans cannot ADD geometry (see the locked decision), so the brief's "raise cover"
  example is not implemented — the three plans open a route, open a crossing and deny a vantage
  point. Adding cover needs the bots' walk grid rebuilt per plan variant, which is a real piece of
  work and belongs in its own slice.
- Drop I: the e2e suite was NOT run (it needs two live servers and a browser pair). Everything
  claimed here comes from unit tests, the headless fit/kit tools, and screenshots. The full path
  (launch → fullscreen → team → buy → round → switch → next round) has not been walked end to end
  on a real GPU by a human.
- Drop I: `ui-fit.mjs` and `team-kit.mjs` need a dev server running and use the container's
  preinstalled Chromium via `PW_CHROMIUM` because the repo's pinned Playwright wants a browser
  build that is not installed here. On a machine with `npx playwright install` done, they work
  unchanged.
- Drop I: the shop's smallest text is 9 px (the `×2` / `WORN` state tags). Legible at 100 %, tight
  at 125 % browser zoom. Worth raising to 10 px if a playtester mentions it.

- Drop I / #14 collision: main's #14 deleted the key-rebinding system (BINDABLE_ACTIONS,
  resolveBindings, conflicts, keyLabel, RESERVED_CODES, the controls tab). This drop restored it
  because the owner's brief names rebinding, conflict detection and restore-to-defaults. If that
  deletion was deliberate, the owner should say so and it comes out again. NOT restored, and
  staying out: the crosshair settings, hudScale, kill-feed toggle, money toasts and ADS
  sensitivity — #14's call, and outside this brief.
- Drop I: `BotBrain.test.ts`'s "bot movement" block now runs with a 30 s timeout because its
  simulations are 14–22 s of ticks against vitest's 5 s default. The real fix, if these ever get
  slower, is to shorten the simulated span rather than raise the number again.
- Drop D: the e2e suite is sensitive to CPU it does not own, and says nothing useful about why.
  Two forgotten `node apps/server/dist/index.js` processes from earlier runs (50 and 42 minutes
  old, each still ticking a room of bots) were enough to fail `bomb plant and defuse` at
  `enter-game` never appearing within 60 s and `see each other, move, shoot, kill, respawn` at
  "waiting for 6000 ms of live wave" — neither test touching anything either process did, and both
  passing on the same tree once the strays were killed. Check for stray servers before believing a
  red suite. Worth a `pretest` that refuses to run while something else is holding the CPU.

- Drop G: `map.test.ts:107` asserts the buy stations span **more than 30 m in x**. It reads as a
  generic "spread across lanes" rule but the number is NIGHT_DISTRICT's (100 m of bounds); on a
  small map it is a footprint requirement in disguise, and it is why GÓRA is drawn 34 m wide instead
  of the 26 m the rooms want. "Spread > 60 % of the bounds width" is what the rule means. Not
  changed here: it is a test on `main` and the owner's call (D-G2).
- Drop G: `BOMB_SITES` (`bomb.ts:6`), `siteLoad` / `siteOf` (`floorAudit.ts:92,103`), the shared
  world and walk-grid caches (`sharedWorld.ts:22,33,39`) and `PLANS[].removes` (`plans.ts:40`) are
  all written against exactly one map. None of it is hard to generalise, but all of it has to be
  done before a second map is playable in bomb, and none of it was touched by this docs-only slice.
- Drop G: `floorAudit.test.ts`, `districtExpansion.test.ts`, `nav.test.ts`, `navPerf.test.ts` and
  `spawn.test.ts` import `NIGHT_DISTRICT` directly, so they stay that map's tests. GÓRA needs its
  own floor-audit and nav coverage in the same shape — that is geometry-slice work, not a rewrite of
  the existing files.
- Drop G (measured, useful beyond this drop): a 90° corner and a flight of stairs cost **zero** time
  in the movement model — 20 m is 2.62 s straight and 2.60 s with a right angle in it, and 11 m
  including a 3.0 m climb takes exactly as long as 11 m of floor. Any map's verticality is therefore
  priced in exposure and audibility only. If height is ever meant to cost time, that is a movement
  change (L6-adjacent) and not a map one.

- Drop G: GÓRA's longest clear sight line is **31.5 m**, not the 20 m the draft predicted: the
  SALON's far corner sees the SYPIALNIA's far corner straight down the south hall, because the hall
  is 2 m deep and both doors sit on its axis. Kept — it is the map's one long lane, no spawn point
  lies on it, and the obvious fix (1 m doorways) leaves the 0.5 m walk grid no legal standing cell,
  which would cost the bots the map. If a playtest calls it a spawn-peek, the fix is a jog in the
  hall's centre, not narrower doors.
- Drop G: GÓRA ships with **no tactical plans** (D-G6). Three candidates are written up in
  `docs/MAP_2.md` §7.5 (board over the light well; force the roof hatch; take out the balcony's
  middle railing). Judge them after the map has been played once.
- Drop G: bomb site B on GÓRA holds **28 of the 30** solids+props the floor audit allows within
  7.5 m (site A holds 21). Anyone dressing the south hall or the bathroom further will fail
  `floorAudit.test.ts` — which is the test doing its job on an interior map, not a false positive.
- Drop G: `districtExpansion.test.ts`, `nav.test.ts`, `navPerf.test.ts` and `spawn.test.ts` remain
  NIGHT_DISTRICT-only by design (they are that map's tests), so GÓRA has **no pathfinding-perf
  coverage**: nothing asserts that `findPath` across the flat stays inside a server tick. It is a
  ninth of the district's grid so it should be comfortable, but nobody has measured it.
  **Measured, same day:** 40 of 40 paths between GÓRA's spawns, arena spawns and flags are found,
  mean 0.97 ms against NIGHT_DISTRICT's 2.78 ms on the same harness, and the walk grid + nav build
  takes 121 ms against 338 ms — comfortably inside the 16.7 ms tick. What is still missing is the
  TEST: `navPerf.test.ts` names NIGHT_DISTRICT and nothing pins these numbers for GÓRA.
- Drop G: the map has never been RENDERED. Lighting (14 practicals, two shadow casters), whether a
  2.8 m ceiling reads in first person, and whether the roof is worth climbing to all need a real GPU
  and the owner's eyes; and no e2e path (join → pick GÓRA → play a round) has been walked.
- Drop G: `collision.bench.test.ts`'s "cuts the cost of a hitscan ray" asserts the grid broadphase
  is ≥ 1.5× faster than the linear scan and measured **1.36×** once, in a run that shared the
  machine with three agents; alone it measures 2.1–2.2× repeatedly. It is a wall-clock benchmark in
  a unit suite, on NIGHT_DISTRICT's boxes, and nothing in Drop G touches it. Same family as the e2e
  note above: check what else is on the CPU before believing a red benchmark.

- Drop I / menu: the room listing carries no ping and no round time, so the browser cannot sort by
  latency or say how far into a match a room is — both are the two things a player actually picks
  on after mode and player count. `/rooms` returns `{roomId, clients, maxClients, metadata}`
  (`hosting`/`index.ts:31`); adding `startedAt` to the metadata is small, a ping needs a probe per
  room. Worth doing before more than a handful of rooms exist.
- Drop I / menu: `MODES[m].scoreLimit` is what the mode cards print as "TO 40" / "TO 5", which reads
  as kills for TDM, points for Domination and ROUNDS for Bomb and Ostrzyżeni. The unit is in the
  blurb under the picker, not on the card. A `unit` field on `ModeDef` would let the card say
  "TO 5 ROUNDS"; it is a shared-package change for one line of copy, so it is written here instead.
- Drop I / menu: there is still no rendered head in the haircut picker (Drop E's open item), and
  the wardrobe is now a 3 × 3 block of names in the lobby's setup column. The layout has room for
  thumbnails whenever a head can be rendered off-screen.
- Drop I / menu: the title screen's live-match panel is READ-ONLY — a click on a row would need a
  nickname, which is the lobby's job to ask for, so the panel hands the player to the browser
  instead. If quick-joining from the front page is wanted, the nickname has to move to the title
  screen with it.
