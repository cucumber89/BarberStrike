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
| 2026-09-07 | B | drop/b-weapon-feel | Slice 1, docs only: `docs/WEAPON_MATRIX.md` written from three recon passes (client handling `LocalPlayer` / `WeaponController` / `Viewmodel`, audio voice table `sfx.ts:31-44`, VFX `Effects.ts` / `Tracers.ts` / `view/index.ts` / `Hud.tsx`). Found: of the six axes only recoil, ADS and the audio voice are per-weapon today; sprint-out (150 ms), sway, flash, tracer and casing are one global value for all eleven, shake is a three-way ternary, and the ADS sensitivity ignores `adsZoom`. The sniper already hides the viewmodel and has breath hold; it does not scale sensitivity or un-scope on sprint. Matrix proposes bold per-row targets, six named rules (R1 zoom-sens, B1 bipod, C1 pellet ring, S1 bolt kicks out of scope, S2 sprint un-scopes, M1 clippers hum) and four decisions D-B1–D-B4 for the owner. No code touched. STOPPED for sign-off as the plan requires. | docs/WEAPON_MATRIX.md | typecheck — test — build — (no code changed) | blocked: owner sign-off on WEAPON_MATRIX.md |

| 2026-09-08 | D | drop/d-modes | Whole drop in one session. **Join by link**: the invite link is now `<origin>/r/<room>?mode=…`; the client reads the room off the path (`roomFromPath`), the lobby a link opens asks for a nickname and nothing else (CHANGE opens the full one), the SPA fallback moved into `hosting.ts` as `spaFallback` so it is testable, and `hostcheck.mjs` proves the path from outside (11/11 checks). **Gun Game**: the 11-rung ladder is data in `shared/modes.ts`; the rung replicates as `PlayerState.score` (no new field), a rung-weapon kill re-arms the killer on the spot, a clippers kill sets the victim back one, only the last rung ends the match, no economy, 3 s respawn, FFA spawn pool. **Ostrzyżeni**: rounds on the Prep/Playing machine, sides are the teams (survivors 0 / shaved 1), one random chaser per round with clippers + the energy perk + a bare head (`PlayerState.shaved`, the one field the plan names), a clippers kill converts, survivors who are not converted stay down until the round ends, five rounds, the result names the top score. **Bots** play both (`BotSenses.mode`/`shaved`): Gun Game needs no branch, a chaser closes and swings, a survivor gives ground. Reviewer (separate agent) found six things, all fixed — chiefly the profile recording the OPPOSITE of the result screen in Ostrzyżeni. | apps/client/e2e/out/d/{hostcheck.md,gungame/*.png,ostrzyzeni/*.png}; docs/PLAYTEST_TEMPLATE.md; regenerate with `hostcheck.mjs`, `shaved-shots.mjs`, `infection-shots.mjs` | typecheck ✓ test ✓ (510: shared 153, client 217, server 140) build ✓ check:weapons ✓ (19/19) e2e ✓ (18/18 against a freshly started server; the pre-existing smoke test failed twice against a server process that had been up ~20 min / 64 k ticks, and passes alone — see Deferred) | review |

| 2026-09-08 | D | drop/d-modes (PR #16) | Merged `main` (The Boys, PR #14) into the drop and ported Drop D onto it. Fifteen files conflicted: main had added a mode and deleted the invite module, HowToPlay, Armoury, Profile, Online, the ui sfx, the defuse kit, the bomb blast, slide and the carry pack. Kept both mode tables in one (`MODES` describes 7, the picker offers 6 — FFA stays playable but unoffered); took main's side wherever it had deleted something Drop D merely touched; **restored join-by-link on the owner's word** (the plan names it as Drop D's first deliverable and the deletion was refactor collateral), wired into main's rewritten lobby, which now also MAKES the link (an INVITE box — joining by a link nobody can generate is not a feature). Its e2e moved from the deleted `menu.spec.ts` to `startup.spec.ts`, plus a six-mode picker test. | apps/client/e2e/out/d/** (regenerate per `e2e/tools/README-drop-d.md`) | typecheck ✓ test ✓ (485: shared 137, client 206, server 142) build ✓ e2e 14/15 — the one failure (`drop 2: buy menu…`, asserting a WEAPONS-tab card after switching to the GRENADES tab) reproduces byte-identically on unmodified `main` in a clean worktree, so it is main's, not the merge's | review |

Status vocabulary: `planned`, `in progress`, `blocked: <why>`, `review`, `done`.

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

## Deferred (things noticed, deliberately not done)

- Drop D: a TDM player can spawn on an ARENA spawn point, because `pickSpawn` is called with the
  whole pool for TDM (`this.mode === "ffa" || this.mode === "tdm"` on main, unchanged in meaning
  here). `TdmRoom.test.ts`'s join test asserts the spawn belongs to the player's team, so it fails
  roughly one run in five. Pre-existing, not this drop's — but it is a real flake in the suite:
  either the pool or the assertion is wrong, and somebody should decide which.
- **`main` is red in e2e**: `drop 2: buy menu, wallet, frag cook + throw, flashbang` asserts that the
  DMR card is disabled after switching the shop to the GRENADES tab, and the tabbed shop from PR #14
  does not render the weapons cards on that tab. MEASURED on unmodified `main` in a clean worktree,
  not only on this branch. One line of the test (switch back to WEAPONS first) or one of the shop.
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
- Drop A: art review round 2 asks for a real inspect/reload READ on the procedural guns: the
  magazine drop happens below the frame at the default hip pose, the revolver's cylinder does not
  swing out, the sniper's bolt does not move in the mid-reload frame. Animation choreography, not
  fit; judge on a real GPU with the camera pitched down before changing timelines.
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
