# Gameplay polish pass (2026-09-14) — weapons, character animation, rendering, measurement

Owner's brief: make the game feel like a good shooter — controls, weapon behaviour, character
animation, sound, effects, rendering and performance — without changing weapon stats, economy,
TTK, network contracts, the VZ-9 (smg2), the measured aim points / muzzles / lengths, cosmetic
ids or saved profiles. This file is the record: what was found, what changed, how it was measured.

Everything below was measured with the dev servers in this container on **SwiftShader (software
GL)**. Frame times are CPU + software-rasteriser numbers; they compare before with after on the
same machine and say nothing about a real GPU. Draw calls, mesh counts, joint angles, hand
distances and cue times are exact.

## What is actually used in a match

`Game.ts` empties the manifest's `characters` and `weapons` before `prepareAssets`, so every match
draws the **procedural** `Character` and the **procedural** weapon models. `CharacterModel.ts` and
`characterAnim.ts` (the Quaternius pack: the missing jump clip, the direction blend) are only reachable
through the `/viewer` and the unit tests. The animation work in this pass therefore went into
`Character.ts`, not into the imported rig. The earlier audit's finding that the pack lacks a jump clip
stands but does not affect a match.

## Stage 1 — the starting point (`apps/client/e2e/tools/feel-cycle.mjs`)

Two real clients in one TDM room. Player A is driven through idle → walk → sprint → stop → ADS →
fire → reload → weapon switch → grenade → death → respawn; player B stands 2.2 m in front and looks at
A. Every step is captured first- and third-person, with per-step frame stats on A's page. Output
under `apps/client/e2e/out/feel/`.

Found (facts, not hypotheses):

- **Sprinting put the gun out of the frame** (960×540, 90° FOV): one grey corner of the receiver
  showed; the "cannot shoot now" tell was invisible.
- **Reload audio and reload animation had drifted apart.** `sfx.reload` used fixed fractions (seat
  0.60, bolt 0.84) while the choreography seated the rifle's mag at 0.72–0.82 and ran the DMR's bolt at
  0.74–0.96; the shotgun animated six shells against four sounds — 200–400 ms of disagreement.
- **The reload ignored the magazine.** The pistol's slide was always locked back, the rifle always
  tugged the charging handle, the shotgun always loaded six.
- **ADS during a reload** laid the magazine choreography over the ADS pose (mag dropping in front of the
  eye).
- **Frame-rate dependence**: pose blends were a fraction per frame (`min(1, dt·k)`) and the mouse sway
  was an impulse per frame (∝ dt²): a 30 fps client had a 4.8× larger sway than a 144 fps one for the
  same flick.
- **Third-person hands were not on the gun**: measured with the arm IK written later, the support
  hand was 0.17–0.24 m from the fore-end on every long gun. Legs pumped forward during a strafe; the
  feet turned with the mouse; the air pose ignored rise/fall.
- **Metals were flat**: no environment texture anywhere, so a rifle in ADS was one grey block.

Baseline frame stats (SwiftShader, 960×540, low): median 190–230 ms/frame, p95 260–450, draw calls
235–520 (idle 1017 with the shop hint UI), active meshes 260–620.

## Stage 2 — weapons and responsiveness

`combat/reloadTimeline.ts` now holds the reload choreography and **`reloadCues()` reads the beats off
the same frames the hands are posed from** (mag out / in / seat, action back / forward, shell, open /
close). `sfx.reload` plays on those cues, scaled by the weapon's `reloadMs`. Tested: every cue lies where
the part moves; the seat lands where `mag` returns to 0; N shells → N shell cues.

The reload is honest about the magazine: `WeaponController` passes `shells` (rounds actually going
in) and `empty` (chamber empty) through the `reloadStart` event. A tactical reload keeps the pistol's
slide forward and skips the rifle's charging handle; a two-shell top-up loads two shells. The VZ-9
timeline is untouched and a test says so.

Priority and interruption (client, no contract change): a reload keeps the gun up and the sights down
(sprint pose and ADS suppressed while it runs; the server keeps reloading through a sprint as before);
R pressed during a draw is held and sent the moment the equip gate opens; a switch cancels both the
running reload and a held request (`WeaponController.reload.test.ts`).

Viewmodel: sprint pose held higher (gun in frame); every blend `1 − exp(−k·dt)`; the sway spring
substepped at 4 ms; in ADS the gun keeps only the push-back and the VIEW carries the recoil, so the sight
post stays on the crosshair; the kick is sized from the weapon's recoil step (`kickFor`) instead of a
heavy/light bucket (smg2 keeps its constants); walk bob, landing dip and jump lift follow the head-bob
slider. `Viewmodel.framerate.test.ts` drives one second of play at 30 / 60 / 144 Hz and asserts the
same pose.

## Stage 3 — the procedural character

- **Two-bone arm IK** (`ArmIk` in `Character.ts`): right hand on the grip, left on the fore-end (or the
  magazine through a reload), for every weapon, pitch and build; the authored pose still drives the
  throw, the clippers swing and a sidearm's free hand. No per-frame allocations.
- **Bladed long-gun stance** (`characterHold.BLADE`): torso turns 0.5 rad toward the gun, the gun turns
  back in torso space, so the bore stays on the aim while the fore-end crosses the chest into reach.
  `hand-pose.mjs`: bore 3.5–3.9° off facing on every gun, as before (clippers 15°, by design, as before).
  The vest-clearance oracle checks the gun in 16 slices along its length.
- **Lower body**: the feet stay planted while the torso turns up to 0.7 rad, then step round; moving,
  the legs turn part-way into a strafe and scissor sideways; walking backwards reverses the stride.
- **Air**: rising tucks the legs, falling reaches for the ground and leans into the landing (replicated
  `vy`, presentation only — extrapolation still never guesses height).
- `Character.ik.test.ts`: hands within 2 cm of the grip and within half a hand of the fore-end line for
  every slot-1 weapon at three pitches and every build; turn-in-place; strafe; backpedal; rise/fall.

## Stage 4 — rendering

`view/nightEnv.ts`: a 16 px procedural night cube (sky, sodium horizon, asphalt, moon, four lamp
glints) with its diffuse spherical polynomial built from the same pixels — no GPU read-back, WebGL2 and
WebGPU alike. Assigned per material: weapons 0.7, hands 0.6, character kit 0.5. The map and
`scene.environmentTexture` are untouched. The viewmodel gets a two-light rig (warm key over the left
shoulder, cool rim from ahead) included only on first-person meshes. Before/after (medium,
1280×720): `apps/client/e2e/out/stage4_before_after.png`, `stage4_zoom.png`.

Effects were already pooled with hard budgets (8 flashes, 6 bursts, 64 decals, 24 casings) and the smoke
keeps a 0.4 emit floor plus its core mesh at any effects density; nothing changed there.

## Stages 5–6 — network and performance (measured, nothing rewritten)

- Prediction / interpolation / reconnect / respawn firing: the existing tests (`prediction.test.ts`,
  `RemotePlayer.test.ts`, `WeaponController.death.test.ts`) and tools (`reconnect.mjs`, the two-browser
  `multiplayer.spec.ts`) were run — results in the ledger row. Nothing in the network model, tickrate
  or interpolation buffer was changed (ARCHITECTURE.md L6).
- `cycle-leaks.mjs`, 10 × menu → match → armoury → menu at low: heap 114 MB in every match, 46–47 MB in
  every menu after GC, 44 engine textures / 977 meshes / 121 materials in every match. Stable after the
  first cycle.
- `profile.mjs` at medium (after): draw calls 165–350 per view, 975 total meshes, 122 materials, 46
  textures, 451 shadow casters rendered once (`refreshRate` 0). Bottleneck on a real GPU is unknown from
  this container; on SwiftShader it is fill rate.

## Limitations of this verification

- No real GPU, no GPU timing: every ms figure is software rendering.
- The third-person body was reviewed in screenshots at 2.2 m and by numbers (IK distances, bore
  angle); an animator's eye on a real screen may still want amplitude changes.
- The imported (glTF) character path was not touched because a match never draws it.
