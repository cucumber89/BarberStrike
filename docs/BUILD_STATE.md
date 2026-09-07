# BUILD_STATE — BARBERSTRIKE (ex FRANKIBARBER: AFTER HOURS)

Compact shared state. Read `ARCHITECTURE.md` first. Keep this file short.

## Performance pass (2026-09-07) — one core for the simulation, fewer bytes for the first load
Handoff brief: `OPTIMIZATION_PROMPT` (owner's audit). Budget guard: `apps/server/src/rooms/tickCost.test.ts`
(8 normal bots + 1 human, 600 ticks). Baseline on this machine: **mean 0.62 ms/tick, peak 10–13 ms**;
after the pass **0.53–0.62 ms** (run-to-run noise on this box is ±0.05; the peak is harness jitter,
see the test's own notes). The per-tick mean was never the problem — the measurable wins are room
creation (235 → 2 ms), FFA bot cost (−27 %), first-load bytes (−71 %) and snapshot bandwidth (−41 %).
Nothing observable in play changed: no weapon, movement, bot-aim or hit-registration value moved.
- [x] **Task 1 — shared world and walk grid** (`rooms/sharedWorld.ts`): `walkable()` + `prepareNav()`
      and `buildCollisionWorld()` once per process. MEASURED: a room used to pay 235 ms for its own
      grid + index; now first room 170 ms, second 2 ms (`sharedWorld.test.ts`). Nothing writes to
      either structure after construction; `findPath`'s scratch is module-level on one thread.
- [x] **Task 2 — bot CPU**: bots think only while `isLive(phase)` AND a human is in the room; a
      line-of-sight verdict per (bot, enemy) is kept for 3 ticks (`Session.losCache`, refreshed on
      the bot's own tick of the rotation); no hazard filter when no fire burns. MEASURED (600 ticks,
      8 bots): FFA with everyone in view 0.63 → 0.46 ms; TDM 0.52 → 0.48. Where the tick goes: 0.05
      ms with no bots, 0.26 ms with 8 bots whose `think` is stubbed, 0.48 with them thinking. The
      optional 30 Hz thinking was NOT done: the mean is far under 1 ms.
- [x] **Task 3 — delivery** (`apps/client/scripts/precompress.mjs`, `hosting.ts: serveClient /
      cacheControlFor`): `.br` + `.gz` siblings written at build, served as-is with
      `Content-Encoding`; one `Cache-Control` per response (assets a year immutable, models a month,
      index never, rest an hour); Caddy keeps `encode` for JSON only, no header directives. MEASURED:
      main bundle 2645 kB → 565 kB br (713 gz); whole client 12.2 MB → 3.55 MB br. No barrel imports
      of `@babylonjs/core` exist — the 2.6 MB is the deep-imported engine itself.
- [x] **Task 4 — same-origin socket**: already landed in `net/serverUrl.ts` (2.2.1); deploy notes
      corrected (`VITE_SERVER_URL` is an override, not what makes the game connect).
- [x] **Task 5 — snapshot trim** (two-sided): `ack` is no longer replicated to everyone — each human
      gets `S2C.Ack` in `onBeforePatch`, on the same socket ahead of the patch it belongs to, only
      when it moved; `yaw`/`pitch` int16 in 0.1 mrad, `vx/vy/vz` int16 cm/s (`quantAngle/quantVel`
      and their inverses in shared `types.ts`, used by `TdmRoom`, `RemotePlayer.fill` and
      `LocalPlayer.reconcile`). MEASURED (`netBytes.test.ts`, 10 moving bodies, one client): 5.8 →
      3.4 kB/s (−41 %). Verified through the real handlers (ack message asserted) and the two-browser
      suite (the slide test counts reconciliation corrections).
- [x] **Task 6 — cleanups**: `connectedCount` maintained at join / bot add / drop / reconnect / removal
      (asserted through a drop → reconnect → expire sequence) instead of an array + filter per tick;
      `maxClients = MAX_PLAYERS − botCount` (was 12 humans + bots); `/health.tick` = worst and mean
      simulation tick over the last minute across rooms (`stats.ts`). Input batching NOT done: 720
      decodes/s is not where the tick goes (0.05 ms/tick with no bots) and it would add 16 ms latency.
- [x] **Task 7 — broadphase**: `buildCollisionWorld(NIGHT_DISTRICT).boxes.length` = **371**. NOT done:
      the tick mean is 0.5 ms with eight bots, a quarter of the ~2 ms the brief set as the threshold;
      a uniform grid would be the largest change in the set for nothing measurable at this load.

## 2.2 (2026-09-06) — Bomb Plant the classic way, rebuilt sites, relief materials, a lived-in district
- [x] **Bomb rules** (`shared/bomb.ts`, pure, tested): `resetBomb` hands the charge to a RANDOM living
      attacker (`rand` injected, the room passes its seeded RNG); `dropBomb` (C2S `dropbomb`, key
      `dropBomb` = H) lands it 0.6 m ahead of the carrier; pickup is walking within `pickupRadius`
      (1.4 m); whoever dropped it on purpose is barred until they step outside `redropLeaveRadius`
      (2.2 m) — a distance rule, not a timer (a timer let the dropper camp on it and the e2e page at
      3 fps could not even see the "dropped" state). Planting: hold `objective` standing still
      ANYWHERE inside a site rectangle (`BombSite {x,z,hw,hd}`, `insideSite` / `siteAt`); the charge
      lands where the planter stood. Defusing: within `defuseRadius` (1.8 m) with LOS, 10 s or 5 s
      with a kit. Plant / defuse pay $300 (`plantMoney` / `defuseMoney`).
- [x] **Defuse kit**: shop item `kit` (`economy.ts`, $400, `BuyContext.bombDefender` gates it to the
      defending side in Bomb only), `PlayerState.kit`, lost on death and at halftime, HUD shows
      "DEFUSE KIT" in the round line. Shop card only appears to defenders (`Shop.tsx`, `KitArt`).
- [x] **Carrier visuals**: `Character.bombPack` (pack, cell, straps — excluded from the merge like
      `perkBand`), `RemotePlayer.carrying`, a "◆ C4" tag for the local carrier, HUD names the carrier
      for the escort line and prints the bound keys instead of a hard-coded T.
- [x] **Sites** (`view/BombSites.ts`, `shared/districtExpansion.ts`): a 1024-px DynamicTexture plate per
      site (hazard border, hatch, letter, "PLANT ANYWHERE INSIDE"), four lit corner posts, a detailed
      charge (straps, bezel, LED that beats faster as the fuse runs, wires, antenna), a dropped-charge
      beacon column; cover inside each zone (container, crates, drums, planter, bench) with the DOM
      flag C kept clear at B; stencil letters + "SITE A/B" plates on the walls. Gotcha (measured): a
      negative `uScale`/`vScale` on a clamped DynamicTexture smears row 0 across the plate — flip on
      the canvas (`translate(0,H); scale(1,-1)`) instead; screenshot from the south confirms the text.
- [x] **Materials** (`world/materials.ts`): `generateSurface(kind)` builds a 512-px albedo AND a normal
      map per surface kind (brick, plaster, concrete, metal, wood, tile…) as RawTextures; `bumpTexture`
      on every StandardMaterial. Generation time is logged in DEV.
- [x] **Dressing** (`shared/districtDressing.ts` called from `map.ts` after `expandDistrict`, ~40 new
      `PropKind`s in `world/props.ts`): café, depot, shop, back hall, kiosk, streets and yard. Every
      placement is validated by `map.test.ts` (WALL / FLOOR kind sets, no overlap with solids).
      Gotcha: `Palette.text` needs a string — named poster variants map to texts, never `undefined`.
- [x] Tests: shared 135, server Bomb 10 (drop / kit / plant-anywhere through the real handlers), e2e
      "bomb plant and defuse" covers drop → camp (still dropped) → step away → pick up → plant → defuse.
- [x] **Menu cover** (`view/MenuCover.ts`, `ui/MenuCover.tsx`): the game's own characters live behind
      the main menu, CS 1.6 style — three FADE on the left under a brass practical, three TAPER on the
      right under a violet one, crouched / standing / tac, one carrying the charge, on a wet floor in
      fog, breathing and checking their weapons. Its own WebGL2 engine on its own canvas, half
      resolution, 30 fps cap, paused when hidden, one frame under `prefers-reduced-motion`, lazily
      imported, disposed on unmount (the match gets a fresh canvas anyway — see `App.freshCanvas`).
      Camera uses a FIXED HORIZONTAL fov so the cast stays at the edges on 4:3 too (measured at
      1024×768: with a vertical fov they crowded under the menu). `.menu-cover-shade` darkens the
      middle so the text stays readable; sub-panels dim it further. Not shown on touch-only devices.
- [x] **Slide** (`shared/movement.ts` `SLIDE`, `BodyState.slide/slideCd`): crouch PRESSED out of a sprint
      (≥ 6.2 m/s, on the ground, off cooldown) → speed × 1.12, crouch height, its own friction (× 0.37
      after the 800 ms), a sideways nudge from the strafe keys, no speed clamp; ends on the timer,
      on crouch release, below 3.2 m/s, or into a jump (which keeps the speed — the clamp is skipped
      on that frame); 700 ms cooldown. Replicated as `slide` / `slideCd` (uint16 ms) so the client
      reconciles the same body and remotes get the pose (`CharacterInput.slide`: torso back, right leg
      out). Local feel: FOV +6 %, a 6 cm dip, a touch of roll, a "cloth over concrete" sound
      (`sfx.slide`). Tests: `slide.movement.test.ts` (5) and the e2e "2.3: a slide" — predicted and
      replicated in a real room with ≤ 2 corrections.
- [x] **The charge beeps and goes off like the classics** (2.3): `view/BombSites.ts` fires hooks — a beep
      per LED on-phase (`max(110, left/45)·2` ms, so ~1.8 s apart at 40 s down to 0.22 s), one long tone
      in the last 1.15 s, `bombPlanted` / `bombDefused` on the stage edges — and `audio/index.ts` plays
      them (`sfx.bombBeep` positional from the charge, max 110 m; the announcements non-positional).
      The detonation is a `BoomEvent` of kind `"c4"` (type widened: `GrenadeId | "c4"`): `Grenades.blast`
      stacks three fireballs + a white core, a 30 m shockwave torus, a 45 m light, every spark and dust
      particle, a 7 m scorch; `sfx.c4Blast` is the frag's shape with a 1.6 s sub and a 4 s tail, ducked
      to 45 m; shake 0.2·(1 − d/60). SERVER: `blastDamage(d)` (shared, tested) — 500 up to 9 m, square
      fall-off to 0 at 22 m — through plates, either side, kill feed weapon `"c4"` (`killerName` →
      "C4 CHARGE", kill feed no longer says "fell" for it). Bomb.test: near defender and planter die,
      an attacker 45 m away lives, the boom and the c4 kill are broadcast.
- [x] **Render region**: `render.yaml` now says `frankfurt`. MEASURED: the default Oregon service gave
      ~200 ms ping from Poland. Render cannot move an existing service, so HOSTING.md tells the owner
      to delete it and re-apply the blueprint.
- [x] **Hosting fixes after the first Render deploy**: `ENV CI=true` in the Dockerfile (pnpm refused to
      purge node_modules without a TTY) and `net/serverUrl.ts` — a hosted page talks to its own origin
      instead of `:2567` (the old fallback timed out on Render). Both measured on the live service.
- Open: bots do not drop or pass the charge (they carry and plant only); no "bomb is here" minimap
  icon; the kit is not drawn on the character.

## 2.1 (2026-09-06) — own repository, menu, progression loops, one-image hosting
Moved out of the SideQuest monorepo into `cucumber89/BarberStrike` (import commit keeps the tree
verbatim). Landed on top of 2.0 beta:
- [x] **Menu** (`ui/Menu.tsx` + `Armoury` / `Profile` / `HowToPlay` / `Online`): first screen shows
      the level card, today's challenges and the server line; every panel is one BACK deep. Lobby
      keeps the room name, suggests one (⚄), and makes an **invite link** (`ui/invite.ts`:
      `?room=…&mode=…`, `?join=<roomId>` auto-joins once a nickname is in). `/health` now carries
      `players` / `rooms`; `Connection.health()` probes it with a 4 s abort.
- [x] **Art**: `ui/art/GearArt.tsx` — 23 inline SVG line drawings (11 weapons, 6 grenades incl. the
      launcher shell, 4 perks, 2 plates), `currentColor` so the shop tints them (brass / dim when
      locked / white when carried). Shown in the shop, the armoury and nowhere else yet (the HUD
      weapon panel stays text). Test asserts every id renders with ≥ 4 shapes.
- [x] **Settings** (`settings.ts`, `ui/SettingsPanel.tsx`, tabbed): ADS sensitivity (blended by
      `adsBlend` in `LocalPlayer.applyLook`), crosshair editor (CSS vars on `.crosshair`, live
      preview at rest and at full bloom), HUD scale (`zoom` on `.hud`), minimap / kill feed / toasts /
      FPS toggles, key rebinding (`InputState.setBindings`, `resolveBindings`, conflicts flagged,
      reserved keys refused: Esc, Tab, Enter, Y, 1–3). `repairSettings` clamps every field.
      Gotcha: the settings blob key stays `fb_settings_v1`; missing sections default, so old blobs load.
- [x] **Progression loops** (`shared/mastery.ts`, `shared/challenges.ts`, client `profile.ts`):
      kills per weapon → tiers BRĄZ 10 / SREBRO 30 / ZŁOTO 75 / PLATYNA 150 / DIAMENT 300, paid once
      per tier as a summary line; three daily challenges picked by FNV-1a(day) → mulberry32, never two
      of one family, progress per day, forgotten at local midnight; recent matches (12); profile
      export / import / reset (`repairProfile` coerces any blob). `MatchTracker.weaponKills` feeds both.
      Still cosmetic: nothing here changes a fight.
- [x] **Hosting**: root `Dockerfile` (server bundle + built client in one image, `PORT` at runtime),
      `README.md` front matter for a Hugging Face Docker Space (port 7860),
      `.github/workflows/sync-to-hf.yml` (needs `HF_TOKEN` secret + `HF_SPACE` variable), `fly.toml`,
      `render.yaml`, `ci.yml`. `docs/HOSTING.md` rewritten in Polish with the three paths. Not
      verifiable here: the Docker build itself (no daemon in the sandbox) — the same steps were run
      by hand (`pnpm build` + `PORT=7860 node apps/server/dist/index.js`).
- [x] **Merged the owner's ChatGPT branch** (sidequest `chatgpt-frankibarber`, grafted onto the import
      commit so git could three-way merge it): individual 3.2 s respawns replace the waves in TDM /
      FFA / DOM (owner decision — do not bring waves back); **Bomb Plant** (`shared/bomb.ts`, rounds,
      buy phase, sides swap at 6, first to 7, its own economy); smoke blocks bots' sight
      (`shared/smoke.ts`); district 62 → 98 m wide (`shared/districtExpansion.ts`, two new interiors);
      procedural characters and bevelled weapons at every preset (the imported character / weapon
      packs are no longer used — the scenery toggle keeps the prop packs only). Resolutions: the
      plant / defuse key is the rebindable `objective` action (T); HOW TO PLAY explains Bomb instead
      of waves; `wavesSurvived` now counts Bomb rounds survived (labels updated, stat kept).
      `FABLE_HANDOFF.md` at the root is ChatGPT's own working note, kept verbatim.
- [x] Typecheck fixes from the import: `SessionLike.respawnAt` in the test harness, `waveMs` /
      `prepMs` widened to `number`, `Game.tracker` initialised at declaration.
- Open: the HUD weapon panel could show the drawing; a language toggle (the UI is English, the
  progression strings Polish — a deliberate 2.0 choice, left as is); a server-side profile if
  accounts ever arrive (the rules already live in `shared/` for that reason).

## 1.0 beta (2026-09-03) — after the first real playtest
See `V1_BETA_PLAN.md` for the measured reasoning. Landed, in order:
- [x] Version string (`GAME_VERSION`) in menu / pause / F3 / `/health`.
- [x] Perf: range-culled lights (GLTF falloff, 5-light cap), static shadow map (rendered once), merged
      props, MEDIUM default, no HDR below HIGH, dynamic render scale (tested). Draw calls per view ÷2–6.
- [x] Night District 2.0: 62 × 68 m, three lanes + gantry + container stack, dressed cover (17 looks),
      colour materials, lifted palette. Map validity is a unit test (walk grid, spawn LOS, prop placement).
- [x] Animation: character walk/turn/land/flinch/directional death; per-weapon reload choreography with
      moving slide/pump/bolt; 14 NullEngine tests.
- [x] Tools: `pnpm profile`, `pnpm shots`, `pnpm anim`, `pnpm shots:grenades`, `pnpm shots:loadout`. 89 unit tests + e2e green; `pnpm build` OK.
- Not verifiable here: real-GPU FPS (needs the owner's machine; F3 shows render scale), WebGPU rendering.
- Owner playtest result: 53 fps at HIGH with the dynamic scale at 60 % → GPU-bound; MEDIUM advised.

## 1.1 (in progress) — see `V1_1_PLAN.md` (decisions + drops)
- [x] Drop 1: ADS could not fire (chorded mouse buttons arrive as `pointermove` — fixed in InputState);
      hip pose low-right, ADS solved from each weapon's aim point (measured centre ±1 px), crosshair hidden
      in ADS; 20 floating props snapped to walls + "nothing floats" map test; F3 draw calls per frame;
      spawn-time snapshots no longer counted as prediction corrections.
- [x] Drop 2: economy (`shared/economy.ts`, wallet on `PlayerState`, buy window 15 s / stations / warm-up,
      kill/assist/head-shot pay) + grenades (`shared/grenades.ts`: frag/flash/smoke/molotov/knife, one
      deterministic integrator for server authority and client visuals, `Throw`/`Boom`/`Flashed` messages).
      Client: shop (B), G cook/throw, 4 tactical, owned-list weapon slots (everyone spawns with the pistol),
      grenade viewmodel + character throw, VFX/audio, HUD wallet/slots/cook ring/flash-out. 120 unit tests
      (+31), e2e extended (shop → frag → boom on both clients → flash). Details in `V1_1_PLAN.md`.
      Gotchas: a `faceOff` in room tests places both players on the SAME spawn pair, so a third player
      standing there soaks the ray as a teammate — park bystanders first; assists need ≥ 30 dmg (rifle 27).
- [x] Drop 3: perks (`shared/perks.ts`: flask / weed / energy / fade, `PlayerState.perks` map of end times,
      speed boost predicted on the client), armour (`PlayerState.armor`, `splitDamage`), six weapons
      (revolver, smg2, lmg, sniper w/ scope + breath, launcher via the projectile sim, clippers melee with
      backstab), `WeaponDef.slot/kind/scoped`, `carriedWeapons()` (sidearm, primary, clippers), shop sections.
      135 unit tests (+15), e2e +1, `pnpm shots:loadout`. Dev hook `dev:money` (FB_DEV_TOOLS=1) for tooling.
      Gotchas: keep `GUNS` in sfx total over WeaponId (melee has a dummy voice, never played); the scoped
      hide and the HUD scope both key off `aimBlend > 0.9`, which takes ~5 frames — headless captures need
      more than a second; `perkSpeedScale` must be applied in BOTH `update` and `reconcile` or the replay
      diverges from the server.
- [x] Look pass (weapons): 8 PBR materials + detail builders in `view/weaponMeshes.ts` (rails, sights,
      guards, muzzle devices, scopes), all 11 models re-cut with unchanged aim points; `Viewmodel` layers:
      wall push (raycast), vertical inertia, crouch dip, ADS kick, empty slide lock, sprint retune, equip
      settle, F inspect (`weaponInspect` event, `inspectRequested` in InputState). Per-slot third-person
      holds. Proof: `LOOK=1 pnpm shots:loadout`. Presentation only — no packets or numbers changed.
- [x] Drop 4: modes (`shared/modes.ts`, `MatchState.mode/winnerId/winnerName/flags`, matchmaker
      `filterBy(["room","mode"])`, lobby segmented picker), FFA (team 0 for all, `teams` getter gates
      friendly fire / assists / spawn pool, winner by kills), Domination (`shared/dom.ts` pure capture
      rules, `MapDef.flags`, `FlagState` schema, `stepFlags` per tick, `S2C.Flag`), tactical sprint
      (`Btn.Tac`, `body.tac` budget in the shared sim, double-tap latch in InputState), lean
      (`Btn.LeanL/R`, `leanClearance`/`leanEye` shared, `PlayerState.lean/tac` replicated, origin checks
      use the leaned eye + `insideSolid`). `BTN_MASK` = 0xfff. Client: `view/Flags.ts`, HUD flag row /
      capture line / tac meter / FFA bar + scoreboard, Q/E lean camera, X = last weapon.
      Gotchas: an empty tac budget must not refill while Tac+sprint are held (flicker); the FFA spawn
      test cannot assert "north" — `pickSpawn` caps distance at 40 m so far points tie and the pick is
      random among ties (assert distance from everyone alive instead); fixed-step capture sums never hit
      exactly 1.0 (1e-6 tolerance in `stepFlag`); the mode picker made the lobby taller than the 640×360
      e2e viewport and `.menu`'s flex centring clipped the QUICK PLAY button out of reach — every e2e hung
      on the click for 2 min (fixed: auto margins + `overflow-y: auto`; `pnpm ... test:e2e -- -g x` does
      NOT pass the filter through pnpm, use `pnpm exec playwright test -g x` in `apps/client`).
- [x] Rename (owner, 2026-09-03): the game is **BARBERSTRIKE** (wordmark, title, /health, docs). Package
      scope `@frankibarber/*`, `fb_*` storage keys and the in-world FRANKIBARBER shop signage stay — the
      shop is the setting, the scope is plumbing. The regen perk is **Sterydy** (`roids`, 💉) instead of the
      joint; same numbers (`PERK_EFFECT.roidsRegenPerSec/DelayMs`).
- [x] Drop 5: bots (`server/bots/BotBrain.ts` decides, the room executes through `fireCore` /
      `reloadFor` / `buyItem` — the same paths as humans; `shared/nav.ts` BFS on the walk grid;
      `shared/bots.ts` presets; room options `bots` / `botLevel` / test-only `seed`; `PlayerState.bot`),
      chat (`C2S.Chat` → team or all, `InputState.typing` gate), marks (`C2S.Mark` go / spot, team only,
      `view/Marks.ts` billboards), minimap + compass (`ui/Minimap.tsx` on its own rAF via `Game.radar()`),
      scoreboard v2 (`PlayerState.assists`, money, BOT tag).
      Gotchas: rooms seed their PRNG from the clock — pass `seed` in tests; bots count as connected so a
      lone human + bots starts a match; a bot's `Shot` broadcast has no `except` client.
- [x] Merged the owner's `codex-fixes` branch (a Codex session on the owner's machine, see
      `CLAUDE_CODE_HANDOFF.md`): shared `effectiveSpread()` used by both the client crosshair and the
      server traces (ADS / pellets keep movement and air penalties), sprint state from `sprintActive()`
      in `LocalPlayer` (ADS / fire no longer stuck after a sprint), the Controls footer in flow, an
      accepted attack spends the spawn shield, no shots / throws after the match ends and the result
      screen clears projectiles and fire pools. The "match ended" check lives in `fireCore` so it gates
      bots too. Its handoff's open items (Fire.seq unused, direction trusted, no Fire packet rate limit,
      dark P9 / hands, vehicle colliders vs visuals) are still open.
- [x] Handoff P1 + owner report (before Drop 6): **camera "at a weird angle while standing"** was the
      look-pass wall push — its raycast runs along the view, so looking at the pavement a metre ahead
      counted as a wall and pulled the gun up and in until you moved; now only hits with a near-horizontal
      normal count (`|ny| < 0.5`). **Shot direction is validated**: inputs carry the effective view
      (recoil + sway), the server keeps a 256-entry ring of (seq → yaw, pitch), a Fire names its seq and
      must lie within 0.06 rad of that aim (0.35 rad of the last simulated angles when the seq is unknown
      — bots send 0); the client flushes queued inputs right before a shot so the seq is there. **Fire
      packet cap** 25/s per session independent of the cooldown (`fireDropped`). **Ghosts** (dropped,
      in the reconnection grace) no longer capture or contest flags. **Readability**: weapon metals
      lifted (albedo up, metallic 0.55–0.7, faint cool emissive — no environment texture, so dark +
      metallic read as black), gloves brown-grey, P9 got a folded razor spine + brass hinge; vehicles
      got a dark chassis skirt filling the gap the collider already occupies and translucent `glass_car`.
      Harness: `place()` now sets the last aim to the spawn yaw, `faceOff()` to the aim — every test
      shot goes through the same direction check a client's does. Still open from the handoff: a
      confirmed (server-acked) tracer, instancing for remote characters, colliders from vehicle shapes.
- [x] Drop 6: optional glTF pipeline (`world/models.ts`: manifest → `ModelLibrary`, instanced per solid,
      fitted to the collision box, procedural fallback; `MapBuildOptions.models`), procedural low-poly pass
      (flat-shaded low-tess cylinders, vehicle trim), `barber_pole` prop. NO third-party files shipped —
      the sandbox cannot reach the CC0 sites; `public/models/README.md` + `ASSET_LICENSES.md` are the
      owner's checklist. Profile: draw calls unchanged (street 352 → 354), verts +34 % from flat shading.
      Gotchas: `shots.mjs` / any capture without a faked pointer lock screenshots the PAUSE overlay;
      Playwright scripts must live under `apps/client` (module resolution is by script path, not cwd).

- [x] Drop 6b: the CC0/CC-BY packs actually wired in — skinned characters, imported guns, imported
      shelf bottles — behind the same manifest, with the procedural version still the fallback for
      anything unlisted or unloadable. New: `view/weaponRig.ts` (name → part role), `view/weaponFit.ts`
      (measured anchors, orientation, grip origin), `view/weaponModels.ts` (the import pipeline),
      `view/characterAnim.ts` + `view/CharacterModel.ts` (blended locomotion, layered one-shots,
      spine aim), `view/gltfMaterials.ts`, `world/models.ts: AssetVault + buildPropSource`,
      `e2e/tools/gltf-info.mjs` (read a .glb from disk: nodes, clips, bones, boxes) and
      `e2e/tools/assets-check.mjs` / `vm-fit.mjs` (what the RUNNING game uses, and where the gun sits).
      Bugs this found and fixed, all measured, none guessable:
      - **every gun in the pack points down −Z in its own file** (P320 barrel at z −0.058, magazine at
        +0.011), so hand-setting "no rotation needed" would have had all eight facing backwards.
        `guessForward` reads it off the geometry instead;
      - **the glTF loader raises `maxSimultaneousLights` on EVERY material in the scene** to the scene's
        light count at the end of each load (traced to `glTFLoader.pure.js`, "Making sure we enable
        enough lights"). With 38 practicals that re-armed all 107 map materials, and on a skinned
        character it blew the driver limit outright (`VERTEX shader uniform block count exceeds
        GL_MAX_VERTEX_UNIFORM_BUFFERS (14)`; the WebGL2 spec minimum is 12, so not only a software
        renderer). 1151 console errors → **0** after `loadKeepingLightBudget` snapshots and restores it;
      - **the per-player name function appends `_<id>` to every animation group**, which broke clip
        lookup and left every character standing in its bind pose;
      - **`fitAnchors` read part boxes through a lazy closure**, mixing scaled and unscaled frames: the
        MK14's muzzle came out 3.5 m from the hand on a 0.8 m rifle;
      - **installing the character factory after `wireNetwork()`** left the players already in the room
        procedural while everyone joining later was skinned — Colyseus fires `onAdd` for existing
        entries the moment you attach the listener;
      - **winding is NOT to be "repaired"**: the loader's `__root__` is mirrored and `MergeMeshes` flips
        indices for meshes after the first only, but the pack's materials are double-sided and the
        normals stay outward (0.59–0.79; a `flipFaces` "fix" drops that to 0.27 and inverts lighting).
      Draw calls, MEASURED at 960×540 with everyone in view — the imported art is CHEAPER than the
      procedural art it replaces. Two runs, 960×540, everyone in view — 0/2/4 remotes:
      227/295/349 and 235/295/334 procedural, against **226/253/265** and **218/253/274** imported,
      i.e. roughly 25–30 draw calls per player before and 14–18 after. Per player now: 10 character submeshes + 1–7 for the gun.
      Bundle: `public/models/` holds the complete packs (26 MB) but `pruneUnusedModels` (vite.config)
      ships only what the manifest names — **dist 32 MB → 14 MB**, models 7.3 MB.
      Viewmodel placement checked numerically rather than by eye (`vm-fit.mjs`, camera space): imported
      pistol x 0.216–0.264 / y −0.334…−0.198 / z 0.272–0.476 against procedural 0.207–0.264 /
      −0.355…−0.140 / 0.295–0.542 — the same place, no pose retuning needed.
      Two things measured AFTER the first pass, both real and both fixed:
      - **the animation budget.** Keeping all 24 clips of the pack playing at weight 0 (so they can be
        blended) means Babylon evaluates 24 groups per character per frame. With three skinned players
        on the software renderer the second client managed **8 frames in ten seconds**, its ping went
        to 886 ms and a chat message took **10.8 s** to arrive. Now only the twelve clips the game
        drives are kept at all (`USED_CLIPS`; the rest are disposed as the character is built) and a
        group is played when its weight leaves zero and stopped when it returns — a standing player
        evaluates ONE clip. Same measurement after: chat in **2.2 s**, ping 423 ms.
      - **the upgrade burst.** `Viewmodel.useModels` parsed and merged all eight guns in a tight loop
        the moment a match started. The gun in your hands is upgraded first now, the rest trickle in
        400 ms apart, and switching to one that has not had its turn pulls it forward.
      Even so, three skinned characters are ~37 k vertices a frame, which a SOFTWARE renderer cannot
      afford. So `graphics.importedModels` (SETTINGS, on from MEDIUM up, **off on LOW**) turns the
      whole import path off — the game is identical apart from looks. The e2e suite runs on LOW and
      therefore on the procedural art: it is about netcode and match flow, and the imported path has
      its own coverage (unit tests on the real .glb files, plus `assets-check.mjs` on a live client).
      **The third-person gun was pointing backwards, and only a measurement could see it.** The hand
      pose started as a guessed quarter turn; `e2e/tools/hand-pose.mjs` (angle between the bore and
      the direction the body faces, plus where the muzzle sits relative to the body) put it at
      **135–152° off**, i.e. every enemy carrying their rifle behind them, muzzle below their own hip
      — invisible in a screenshot of a dark alley. Three separate things had to be right:
      - bone matrices live in the SKINNED MESH's space, which for this pack carries the loader's
        mirrored `__root__` and a 100× unit scale. `attachToBone(bone, characterRoot)` put the hand
        at the player's feet (muzzle 0.003 m up) and `attachToBone(bone, skinnedMesh)` put it 18 m
        below the floor; the hand is now driven from `bone.getFinalMatrix() × skinnedMesh.world` and
        converted into the root's frame once a frame, after the animation system has run;
      - the hand→weapon rotation is READ from the rig, not chosen. It is worth ~80°: this pack's
        wrist points out to the player's RIGHT (hand +Z measured at (0.98, 0.13, 0.17) in the body's
        frame), and the original hard-coded quarter turn was simply about the wrong axis. Inverting
        the matrix by transposing its rotation part does not work here — the mirrored chain gives it
        a negative determinant, so that "rotation" is a reflection (measured: a consistent 109–127°
        error). The decomposed quaternion is inverted instead;
      - WHEN it is read matters: too early and the skeleton is still in its bind T-pose; at an
        arbitrary later frame the gun idle's breathing left two players 17° apart holding the same
        rifle. The gun idle is pinned to its first frame on frame 8 and the correction solved from
        exactly that pose, once per character.
      After: bore 0–30° off facing across the idle and locomotion cycle (the arm moving, as it
      should), muzzle at 0.88–1.11 m — chest height — 0.2–0.4 m in front and 0.25–0.35 m to the
      right, and the gun's two meshes confirmed present in the scene's ACTIVE mesh list, 41 × 37 ×
      29 cm in the hand. A node in the right place that never reaches the render is the failure a
      position check alone cannot see.
      All of it is now pinned by a headless test on the real rig, and that test is itself checked
      against three negative controls: identity correction (80.3° off), the wrong bone reference
      (hand at the player's feet) and — the one that matters most — an assertion that the weapon was
      actually PARENTED. The first version of the test passed against an unattached node sitting at
      the origin: it "pointed forward" because it had never been put in a hand at all.
      Known gaps: the **LMG**, the **shotgun** and the **clippers** stay procedural (the pack has
      nothing for them; WEAPON_ORDER has eleven weapons, the manifest maps eight);
      `HAND_OFFSET` (3 cm forward in the palm) is now the only hand-chosen number in the import path;
      `Mpsd`, `P226`, `SR1MP`, `M21 EBR` and `Precision Rifle Chassis` are in the repo but unused. Licences and the required CC-BY line: `ASSET_LICENSES.md`, and in-game under
      SETTINGS → CREDITS (a repo file does not travel with a deployed build).

- [x] Drop 6c review pass: an adversarial review of the whole asset diff (six readers, each finding
      then put to two skeptics told to refute it) found FOUR defects in code I had already called
      done, three of them about who owns a material:
      - **`disposeMaterialAndTextures` on shared materials.** `Viewmodel.upgradeWeapon` disposed the
        procedural gun it was replacing with `dispose(false, true)`, and all eleven procedural guns
        share ONE `createWeaponMaterials` set. MEASURED in the running game: twelve seconds into a
        match all eight shared materials were gone and the **shotgun — which has no imported model,
        so it is never replaced — was rendering with `material: null`**. The same flag in
        `CharacterModel` would have blanked a weapon for every other player when one left, because
        their copies all point at one merged source. Both now dispose with `(false, false)`; the
        materials belong to `this.mats` and to the `WeaponModelLibrary`, which free them.
      - **The per-player cloned character materials leaked.** `instantiateModelsToScene(fn, true)`
        clones them, and nothing frees them: `InstantiatedEntries.dispose()` covers root nodes,
        skeletons and animation groups, and by the time it has run there are no meshes left for
        `root.dispose()` to reach. MEASURED: five join/leave cycles left 35 materials in the scene,
        and every later glTF load walks that list twice to restore the light budget.
      - **`equip` could build the same gun twice.** It de-duplicated on a map that is only filled
        after the async build resolves, so switching away and back inside one load window started a
        second build; both finished, both parented to the hand, and the first stayed there, drawn,
        for the rest of the match. An in-flight claim now guards it.
      Each fix has a headless test with a negative control (revert the fix, watch the test fail).
      What the review did NOT find, and I corrected separately: BUILD_STATE quoted "~31 per player
      before, ~10 after" for draw calls; re-measured after the animation-clip fix it is 25–30 before
      and 14–18 after. The conclusion holds — imported art is about half the cost — the numbers did
      not.

- [x] **BLACK SCREEN ON WINDOWS — `Minimap.tsx` and `minimap.ts` in one folder.** The owner pulled,
      ran `pnpm dev` and got a dark page with no main menu at all. Console:
      `Uncaught SyntaxError: The requested module '/src/ui/minimap.ts' does not provide an export
      named 'Minimap' (at Hud.tsx:8)`.
      Windows and macOS have case-INSENSITIVE filesystems, so `import { Minimap } from "./Minimap"`
      resolved to `minimap.ts` — the geometry helpers — which has no such export. The bundle threw
      before React mounted, which is why nothing rendered: `index.html` is an empty `#root` on a
      dark background, so a boot failure and a "graphics problem" look identical.
      Present since drop 5. **Nothing in this project could see it**: typecheck, 248 unit tests, the
      e2e suite, `pnpm build` and a fresh clone all pass on Linux, where the two files are simply
      two files. Only a person on a case-insensitive filesystem could hit it.
      Fixed by renaming the maths to `minimapGeometry.ts`. Guarded by `src/moduleNames.test.ts`,
      which fails if any folder holds two modules whose STEMS differ only in case — the stem is the
      part an import specifier writes, so `Minimap.tsx` collides with `minimap.ts` AND with
      `minimap.test.ts`, which is exactly the ambiguity the bundler faces. Verified with a negative
      control (recreate `minimap.ts`, watch the test fail) and by scanning all 115 modules: this was
      the only one.
      LESSON, and it generalises past filenames: a gate that runs only on the maintainer's OS cannot
      catch a defect that only exists on the user's. Where a platform difference is knowable from
      the source — case-insensitivity, path separators, line endings — check it in a test rather
      than hope CI stumbles into it.

- [x] Drop 6d: **feel pass** — "it works now; the optimisation is poor, the bots move oddly and it
      all feels incoherent, and I don't know whether the weapons do too much damage". Four separate
      problems, all found by measuring rather than by reading.

      **The pathfinder cost 11.5 ms a search** against a 16.7 ms tick (Night District, 15 604
      cells). It was an exhaustive four-neighbour BFS over a string-keyed Map, and nearly all of
      that was building strings: `cellKey` + `Map.get` is ~120 ns against ~4 ns for an integer index
      into a typed array — 30x over two million lookups. Rewritten as A* over a flat grid index with
      a binary heap and eight neighbours, then a line-of-sight pull over the result: **1.32 ms** per
      route found, and 8.9 waypoints where the BFS produced 13, because four neighbours means a bot
      can only step along x or z and it crossed open ground in right-angled staircases.
      Two bugs while building it, both caught by measurement. **No closed set**: a cheaper route to
      a slot can be found after an entry is queued and a heap cannot take the stale one back, so the
      stale copies got expanded too, each pushing its own stale children — 125 764 expansions over a
      12 295-slot graph, every node ten times over, so an eight-waypoint route reported
      "unreachable". **Half a cell**: `cellKey` stores `round(snapCoord(v) / grid)` and `snapCoord`
      returns a cell CENTRE, which sits half a cell above that multiple; taking the origin as
      `K * grid` put every waypoint on a cell CORNER, so no waypoint was on the grid and the
      smoothing could never confirm a straight leg. A search node is a (cell, height) SLOT, not a
      cell — expanding only the nearest reachable height collapsed a mezzanine's two storeys into
      one node and lost a third of the long routes.

      **The bots.** Three things, none of them in the pathfinder. They **stopped to turn**: Forward
      was pressed only once the body was within 0.6 rad of where it wanted to go, so every corner
      was a pause of a fifth of a second (longer for an easy bot at 3.2 rad/s). They **changed their
      mind every 2.5 s** — the re-plan timer re-picked the GOAL, not just the route, so a bot
      halfway down a street turned round and went somewhere else. They **threw the route away to
      fight**. The body now walks in the direction it wants while the head comes round separately
      (the wanted direction resolved into the eight-way button combination), the goal stands until
      it is reached, and the route survives a fight.
      Three more bugs the search COUNT caught, all introduced by that rewrite: a bot that had
      arrived cleared its goal, `pickGoal` handed back the point it was standing on, that route was
      instantly complete and it started again — **857 searches over 22 s of one idle bot, one per
      tick, for ever**; drift measured to the next waypoint rather than to the leg being walked, so
      a long straight read as off-route on nearly every tick (**326**); and a chase re-arming an
      unreachable goal inside its own back-off (**47**). Now 4.

      **The peak frame was 118 ms, not the 0.5 ms the average showed.** Looking at the mean is why
      this survived: 0.5 ms against 16.7 with eight bots. But every bot planned on the same frame at
      the start of a round, and the first of them paid for building the walk index too (44 ms for
      "one search"). Each bot now has its own tick of a rotation to plan on; `prepareNav` builds the
      index AND runs two throwaway searches at room creation, because the first two searches in a
      fresh process measured 24.1 and 19.0 ms where every later one was under 6 — the interpreter
      running the loop before the JIT reaches it. The expansion cap came down 20 000 → 6 000, the
      knee: identical routes found, give-up 4.11 → 2.63 ms.
      `118.48 → 31.70 → 25.43 → 12.39 ms`, and that last frame contains **zero** searches.

      **The weapons.** The overall level is inside genre norms (body kills 277 ms rifle to 429 ms
      pistol); three numbers were not. The **shotgun could not miss** — 9 pellets x 12 = 108 against
      100 health, a guaranteed point-blank kill asking nothing of the shooter. Now 9 x 10 = 90, with
      the one-shot still there but aimed: a head pellet is worth 16, so two of nine is 102. **Two
      slivers**: the sniper did 95 to the body and the DMR 99.2 to the head, both leaving the victim
      alive on a handful of health after a perfect shot and then demanding a slow follow-up. DMR →
      63 (head 100.8, so two to the body or one to the head); sniper → 85 body and 70 at maximum
      range, so its rule is one line: the head kills at ANY range, the body never does. That also
      settled an overlap nobody had noticed — a 600-credit revolver matched the 2 900-credit DMR's
      400 ms body kill; the fix was to give the expensive rifle the shot that defines it, not to
      make the revolver worse.

      **The client was mostly already right, and two of my suspicions were wrong.** Materials
      climbing 103 → 137 is the model pipeline finishing, not a leak, and it settles; the 289 shadow
      casters are a one-off, since the shadow map is already `REFRESHRATE_RENDER_ONCE`. No material
      exceeds the four-light budget, the sky is unlit, materials and world matrices are frozen.
      Sampling the main thread for 8 s: **83% idle**, the game's own code under 1%. What the profile
      did show: the render-scale valve steps ONE notch per hold-plus-cooldown, 2.1 s, so a machine
      that needs the floor spent **eight and a half seconds** on unplayable frames before the valve
      finished opening — arriving exactly while a player decides whether this game runs badly. Cost
      goes with the pixel count, so the frame time says how far to jump: `sqrt(slowMs / measured)`.
      200 ms frames now reach the floor in one step. Going UP stays one notch at a time, because
      overshooting downwards costs sharpness for a second and overshooting upwards costs frames.

      Guards added, all with negative controls: `navPerf.test.ts` (search budget), `tickCost.test.ts`
      (server mean AND peak — CPU, not wall clock: `advanceTimersByTimeAsync` returns once the fake
      clock has moved, so elapsed wall time just echoes the fake advance back, and 600 ticks "took"
      exactly 10 200 ms, which is 600 x 17), `BotBrain.test.ts` (six closed-loop tests driving the
      brain's buttons through the real mover on the real map), `balance.test.ts` (the whole
      time-to-kill table plus the rules it must obey).

- [x] Drop 7: **respawn waves + a frozen preparation window** — "the game must have rules; there is
      a countdown before both teams respawn, so you can calmly prepare". A match now alternates a
      LIVE wave with a frozen PREP window: `LIVE 12 s -> PREP 5 s -> LIVE 12 s -> …`. Nobody
      respawns alone during a match; everyone who died comes back at the START of prep, and nobody
      can move, shoot or throw until it ends.

      **The shape was a product decision, not a reading of the code, so it was put to the owner.**
      Two options were framed with their measured consequences: elimination rounds (CS-style, dead
      until the round ends) or respawn waves. Waves were chosen — the longest you can be dead is
      17 s rather than a minute, and Domination survives, whose score is a time integral over held
      flags that elimination rounds would have deleted. Full freeze during the countdown was chosen
      over "walk but don't shoot", so both sides are released from the line together.

      **What the recon found that changed the design** (seven parallel readers over the phase
      machine, respawn, economy, bots, client, modes and the test surface):
      `startMatch` was ALREADY a simultaneous team-wide respawn — a wave is that function minus the
      score and wallet reset. `buyWindowOpen` was ALREADY keyed on the phase, so the shop opening in
      prep is one enum in an existing list rather than a new mechanism. And the client COMPUTED its
      own respawn countdown from `RESPAWN_DELAY_MS` (`Game.ts:244`), which under waves is simply a
      confident lie — the HUD now counts the server's phase clock.

      **Two clocks where there was one.** `phaseEndsAt` kept its literal meaning (the end of THIS
      phase, now a wave or a prep window) and the match deadline moved to its own replicated
      `matchEndsAt`. Overloading the one field would have ended the match every time a wave did.

      **Six bugs of my own, every one found by measuring rather than by reading:**
      - THE FADE PERK WAS SWALLOWED WHOLE. Re-basing the spawn shield with
        `Math.max(protectedUntil, prepEnd + SPAWN_PROTECTION_MS)` looked right and was not: the
        perk's shield is 3 s, prep plus the default is 6.5 s, so anyone who had paid for it got
        exactly nothing. The shield is SHIFTED whole instead, and the shift lives in `spawn()` so
        joining and reconnecting into a freeze get it too.
      - THE CLIENT TUGGED EVERY SEVENTEEN SECONDS. Freezing on `S2C.MatchEvent` let a player walk
        for half a round trip after the server stopped them. Both edges are now decided by the
        shared clock (`frozenAt`) — and the release edge mattered more than the freeze: the client
        masks its OWN input, so waiting there discarded movement rather than delaying it, in
        proportion to ping. A 200 ms player lost ten times the start a 20 ms player lost, per wave.
      - THE PHASE AND ITS DEADLINE HAD TO ARRIVE TOGETHER. Taking the new phase from the message
        while still holding the previous window's `phaseEndsAt` — the state poll is 10 Hz — read as
        "released" the instant prep began. `MatchEventMessage` carries `endsAt` now.
      - A RECONNECTING PLAYER SAT OUT TWO WAVES. `refillWave` skips ghosts and `allowReconnection`
        does not call `onJoin`, so nothing brought them back; it now runs on every tick of the
        window instead of only the tick it opens, which is also idempotent.
      - THE CLIENT COOKED GRENADES THROUGH THE FREEZE. The server refused the throw, but the pin
        came out during a countdown nobody could be hurt in and the player was released holding a
        fully cooked frag.
      - TWO OF SEVEN TESTS PROVED NOTHING — they passed with the fix reverted. One asserted at a
        moment when nothing could have happened yet (`until()` returns on the tick the phase flips,
        and that tick's simulation already ran while frozen); the other never armed the old timer it
        claimed the new rule beats.

      **Measured, not asserted:** a frozen human moves EXACTLY 0 m; a bot caught at 3.11 m/s skids
      0.18 m and is still from 300 ms on (the freeze masks buttons and lets the mover's own friction
      stop the body — no velocity surgery, so client and server reach the same place by running
      identical physics on identical input). Ten negative controls, ten failures.

      **Consequence worth knowing:** the buy window used to be effectively always open because you
      died and respawned every few seconds and each respawn opened it for 15 s. With waves you buy
      in the preparation window (every 17 s) or at a station. Caught by an e2e test, not by reading.

      **Left for play-testing, both one constant away in `constants.ts`:** the freeze is 29% of a
      match at these numbers, which is the price of starting a fight from the line; and the fade
      perk's other half — coming back sooner — cannot mean anything when everyone returns together.
      Its shield still works. The perk was not redesigned unasked.

      **ADVERSARIAL REVIEW OF THE DROP** (four dimensions — phase machine, the freeze itself, the
      respawn lifecycle, the client — then per-finding refutation). 17 agents, 13 raw findings,
      **0 survived verification, and that number means the opposite of what it looks like**: the
      finders ran against the original and the verifiers ran later against code I had already fixed,
      so they correctly refuted their own colleagues. Ten real defects came out of it:

      - The fade perk swallowed whole by `Math.max` (above).
      - The client's RELEASE was late, and being late DISCARDED movement rather than delaying it —
        the client masks its own input — in proportion to ping.
      - Phase and deadline had to arrive together or a stale clock read as "released".
      - A reconnecting player sat out two waves: `refillWave` skips ghosts and `allowReconnection`
        does not call `onJoin`, so nothing brought them back. It runs every tick of the window now.
      - A player joining or reconnecting inside the freeze got a shield that expired during it; the
        shift moved into `spawn()` so every entry path gets it.
      - The client primed and COOKED grenades through the freeze, releasing the player holding a
        fully cooked frag.
      - The client FIRED through the freeze: flash, report and a round out of its own magazine.
      - A grenade in the air when the window opened was deleted after being paid for — roughly the
        last fuse-length of every wave. It goes back in the pocket now (`giveGrenade`); fire pools
        do not, because their grenade already did its work.
      - Perks bought in the window burned a fifth of their duration while the buyer was frozen.
      - The wave respawn stacked the whole team on one spawn point: `pickSpawn` rewards an ally
        within 12 m, and each respawned player became an ally standing exactly on the point they
        took. Standing ON one is now penalised; standing near one still is not.

      **THREE TESTS PROVED NOTHING and were caught by the controls, not by reading.** One used
      literal millisecond timestamps against a controller that compares them to `performance.now()`,
      so it passed alone and failed in a full run — the equip timer never elapsed. One asserted a
      25 s perk had "more than a 5 s freeze" left, which was true either way. One rested on two
      guards that MASK EACH OTHER: reverting either alone leaves it green, and only reverting both
      shows the burst (6 spawn broadcasts where 4 is right).

      **THE E2E FAILURES WERE MINE, NOT THE CODE'S.** Three runs failed because I edited server
      files while `tsx watch` was watching them: the server reloaded mid-run and dropped its rooms,
      which surfaces as `phase: "waiting"` and a HUD that never appears. Separately and genuinely:
      with a 5 s freeze every 17 s, EVERY movement, combat and grenade measurement in the e2e file
      can land inside the window — one measured a walk of exactly 0 m. They all wait on `waveRoom()`
      for a live wave with room in it now, and the grenade ones wait for more than a fuse.

- [x] **2.0 beta** — the plan's last drop, finished: progression and player-hosted games.

      **Progression (XP, levels, badges, match summary).** The owner's call on the question that
      decides what a progression system IS: nothing gates a weapon, ever. Every gun is available at
      level 1 and the module says so as a RULE rather than as its current state, because that is the
      design — a newcomer who joins on Friday must not be weaker than the people who played on
      Thursday, which is the one thing that spoils an evening in a small group. Levels buy a number,
      a title (PRAKTYKANT to LEGENDA ZAKLADU) and twelve badges, each for something a player did.
      Rules in `packages/shared/src/progression.ts` even though the profile is localStorage and the
      maths runs on the client: testable without a browser, and reusable if accounts ever arrive.
      Client-side placement makes it forgeable and the threat model is "a player lies to themselves".
      The summary shows the LINES, not the total: "+1 400 XP" teaches nothing, "8 kills, 3 head
      shots, a win" teaches what the game rewards.
      Stats come from two sources deliberately - kills/deaths/assists from the player's own
      scoreboard row (the server's tally, the only number that cannot drift), everything else from
      `MatchTracker` counting events, reset by the match START because a room is reused and a
      tracker that only added up would pay for the previous match twice.

      **Hosting.** The plan said "one-click HOST, join by code, LAN discovery". Two of those three do
      not exist for a browser, and the recon said so before any code was written: a page on HTTPS may
      not open a `ws://` socket to a private address, and a page cannot broadcast on a LAN. So LAN
      discovery is impossible and join-by-code from a public deployment is impossible. What DOES
      work, and is what ships: the game server also serves the built client, so friends open
      `http://<host>:2567` and the page and the socket are the same origin - no mixed content, no
      CORS, nothing to configure. The room name is the code. `pnpm host` builds and starts. The
      banner prints every LAN address, link-local (169.254.x.x) filtered out because it is what a
      machine gives itself when DHCP failed and it leads nowhere. Internet play is a documented
      tunnel (`cloudflared`), which also satisfies mixed content by giving an HTTPS origin that
      serves both; port forwarding is documented as the worse option it is. See `docs/HOSTING.md`.
      `defaultServerUrl` gained a same-origin branch, ordered so a hosted deployment
      (`VITE_SERVER_URL`) still wins and the old static-host-on-80/443 arrangement is unchanged.

      **The SPA fallback is scoped, not a catch-all**: swallowing the API and handing the client HTML
      where it expected JSON is a failure this project already paid for once, on Netlify.

      **FOUND WHILE WIRING THIS: the e2e suite had been running WITHOUT `FB_DEV_TOOLS=1` all along.**
      `dev:teleport` silently did nothing and the tests coped - visible in the logs, where the player
      never reached the coordinates the test aimed at. `playwright.config.ts` sets it now, so those
      tests check what they claim. `dev:endmatch` joined it: a match runs seven minutes, which is a
      long time to wait to see a result screen.

      **VERIFIED, not assumed:** `hostcheck.mjs` builds the client, serves it from the game server on
      port 2599 and plays through it - page origin `http://localhost:2599`, socket
      `ws://localhost:2599` (the same port, not 2567), HUD up, zero console errors. Nothing else can
      prove this: the e2e suite runs against the dev pair on 5174/2567, which is the very
      arrangement self-hosting replaces, so it would pass either way.
      311 unit tests, e2e 7/7 (including a new one that ends a match and checks the summary is paid
      and stored), build green.

## Status (0.1 beta, 2026-09-03)
- [x] Phase 1 recon + architecture lock
- [x] Phase 2 **multiplayer vertical slice — VERIFIED with two real browser clients** (`apps/client/e2e/multiplayer.spec.ts`,
      passes repeatedly): join same room, see each other, move (replicated), shoot → damage → kill → kill feed →
      death screen → respawn, weapon switch, reload; zero console errors.
- [x] Phase 3 core: 5 weapons, teams, TDM scoring, timer, scoreboard, match phases, result screen, rematch loop
- [x] Phase 4 environment: Night District v2 (routes: centre / two flanks / mezzanine+catwalk high route), 59 procedural
      props (chairs, mirrors with LED strips, shelves+bottles, signage, neon, pendants, tube lights, street lamps…),
      moonlight with one shadow map, zoned mesh merging, sky dome, fog, post-fx pipeline
- [x] Phase 5 presentation: first-person viewmodel (5 procedural weapons + hands, pose state machine: idle/sway/bob/sprint/ADS/
      fire/reload/equip/land/jump), procedural articulated remote character (walk/run/crouch/air/aim/fire/reload/death), team accents
- [x] Phase 6 feel: recoil patterns per weapon (deterministic + jitter, delayed exponential recovery), ADS zoom, sprint-out,
      camera shake, muzzle flash + light, tracers, impact sparks/dust, decals (64), shell casings, hit markers, damage direction
- [x] Phase 7 UI: loading (real stages), menu, lobby + room browser, settings (gameplay/graphics/audio), HUD (dynamic crosshair,
      reload bar, spawn shield, kill feed, timer/score), scoreboard, death, result, pause, dev telemetry (F3)
- [x] Audio: fully procedural Web Audio (gunshots per weapon, reload, footsteps, hits, damage duck, UI, ambience zones, music) — see audio/
- [~] Phase 9 QA: e2e + 63 unit tests green; adversarial pass (reconnect, hostile payloads, rate limits) covered by server tests
- [~] Phase 10 perf: budgets in code (pools, zoned merges, 1 shadow map, light priorities); measured only under SwiftShader here
- [x] Phase 11: production build OK (`pnpm build`), server Dockerfile, README, ASSET_LICENSES

## Running
```
cd frankibarber && pnpm install && pnpm dev     # server :2567 + client :5174
pnpm test                                       # shared + server unit tests
FB_DEV_TOOLS=1 pnpm --filter @frankibarber/server dev && PW_CHROMIUM=<chromium> pnpm --filter @frankibarber/client test:e2e
```

## Ownership / layout
See ARCHITECTURE.md "Client structure". Lead owns Game.ts/context/events. Everything else by directory.

## Interface changes (append)
- Lead: GameEvents bus + GameContext + module installers (view/audio/postfx/perf).
- Lead: `LocalPlayer.addShake`, `addRecoil(up, side, recover, delayMs)`, `aimBlend`; `WeaponController.onReloadEnd`, `requestLast`.
- Net: `MAX_INPUT_BATCH/QUEUE`, `MAX_OTHER_MSG_RATE`; `GET /rooms`; `FB_NET_STATS` dev counter; `Session.lastSeq` (replay guard).
- Gameplay: `WeaponDef.recoilPattern/recoilJitter/recoilRecoverDelayMs/adsZoom/adsMs`, `recoilStep()`, `MOVE.adsSpeedScale`, Q = last weapon.
- Level: `MaterialTag` + `ceiling`/`paint`; `PropKind` extended; `LightHint.priority`; `MapInstance.addCaster`.
- View: `RemotePlayer.character` (Character), `onShot()`, `eye()`.

## Known issues / decisions (measured, not guessed)
- **Tone mapping OFF in gameplay**: ACES and KHR-neutral crushed the practical lighting to near-black (screenshots t-*.png).
  Exposure 1.25 / contrast 1.05 only; practical lights ×1.4 (`LIGHT_GAIN`), ambient 0.4.
- **Zoned merging**: one map-wide mesh per material saw only `maxSimultaneousLights` lights → merged per material × 12 m zone;
  ambient/moon get `renderPriority` 100/90 so they are never dropped.
- Client input `dt` clamped to 50 ms: below 20 fps the local sim runs slower than real time (anti-teleport, by design).
- Headless Chromium here renders via SwiftShader at ~10 fps; all visual checks are screenshots, not motion.
- Pointer Events (not mouse events) for input: Babylon cancels `pointerdown` on the canvas.
- Room listing = custom `GET /rooms`; `room` must stay in room metadata for `filterBy(["room"])`.
- Spawn protection 1.5 s; match start respawns everyone (tests must wait for `playing` + protection lapse).
- Nameplates: teammates only, within 28 m and line of sight (raycast) — enemies never get one.
- Reconnection: client resumes the session after a drop (verified with `e2e/tools/reconnect.mjs`: offline 2.5 s → same
  session id, inputs acked again). Server grace 15 s.
- Docker image (apps/server/Dockerfile) NOT built here: no Docker daemon in the sandbox.
- Dev-only hooks: `dev:teleport` (FB_DEV_TOOLS=1), `window.__fb` (Vite dev), F3 telemetry (dev build).
- **WebGPU on a real GPU crashed at the first procedural texture** (`engine.createDynamicTexture is not a
  function`, user report, Chrome + WebGPU1). The WebGL `Engine` self-imports all its extensions; `WebGPUEngine`
  imports only some, so `engine.ts` now side-effect-imports `WebGPU/Extensions/engine.dynamicTexture` and
  `engine.multiRender`. Static check (`e2e/tools/webgpu-min.html`, `missingOnWebGPU`): the remaining
  WebGL-only methods are internal uniform/VAO setters, none called by the client.
  Headless Chromium here reaches a SwiftShader WebGPU adapter (`--headless=new --use-angle=vulkan
  --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu`) but loses the device on the
  first `copyExternalImageToTexture` even for a one-box scene, so WebGPU rendering itself is still
  **unverified on real hardware**; the WebGL2 path is the verified one.
- **WebGPU → WebGL2 retry**: if `Game.start()` throws while on WebGPU, `App.play` disposes, forces
  `graphics.renderer = "webgl2"` (persisted, visible as "Force WebGL2" in settings) and reconnects once.
  Requires a fresh canvas per start (a canvas that ever held a WebGPU context returns `null` for
  `getContext("webgl2")`), hence `freshCanvas()` instead of a React-mounted `<canvas>`. Verified by
  stubbing `GPUQueue.copyExternalImageToTexture` to throw: HUD up on WebGL2 within 5 s, zero errors.

## Next priorities
1. Real-GPU playtest for feel tuning (sensitivity, recoil, bob) — cannot be judged under SwiftShader.
2. Better death camera; hit-reaction on characters.
3. Perf gate on real hardware: target 60 fps 1080p on a mid GPU; verify draw calls (< 250) with F3.
4. Optional: FFA mode, clippers melee, second map.
