# WEAPON_FIT — measured geometry of the 11 weapons (Drop A)

Locked decision L3: every visual claim about a weapon is proven numerically. This file is where the
numbers live. Regenerate the parts table with `pnpm check:weapons` (full per-part output in
`apps/client/e2e/out/weapons/parts.md`, not committed); the camera-space numbers come from
`vm-fit.mjs` and the third-person bore angles from `hand-pose.mjs` (both need the dev server and a
browser — see the open items).

Frame: +Z forward, +Y up, +X right, metres, origin at the top of the grip (the web of the hand),
which is where the viewmodel hangs every gun. Tolerance for "attached" / "on its part": 5 mm.

## Parts check (`pnpm check:weapons`) — 2026-09-07, all 11 pass

What it proves per weapon: every part is connected to the receiver through parts that touch within
5 mm (a barrel on a handguard on the receiver counts; a sight hovering 6 mm above the rail does
not); the grip origin is on the grip (or the trigger when the model names no grip); the muzzle is on
the barrel / flash hider / tube; the aim point is on the sight span; the magazine box is seated
against the receiver; the support-hand box touches the fore-end. "on X" below names the part that
carries the anchor; "on gun" means the model names no such part and the anchor is at least on the
gun somewhere.

| weapon | source | receiver | parts | gun box min | gun box max | grip origin | muzzle | aim point | eject | support hand |
|---|---|---|---|---|---|---|---|---|---|---|
| pistol | gltf | `frame` | 16 | (-0.014, -0.074, -0.086) | (0.014, 0.058, 0.114) | (0.000, 0.000, 0.000) on Trigger | (-0.000, 0.044, 0.114) on Barrel | (-0.000, 0.056, -0.059) on Front_Sight+Rear_Sight | (0.011, 0.018, 0.039) 0 mm | (-0.030, -0.065, -0.005) on frame |
| revolver | gltf | `Frame` | 17 | (-0.018, -0.091, -0.039) | (0.018, 0.037, 0.161) | (0.000, 0.000, 0.000) on Grip | (0.000, 0.024, 0.161) on Snub_38_Barrel | (0.000, 0.037, 0.079) on Rear_Sights | (0.018, -0.002, 0.086) 0 mm | (-0.030, -0.065, -0.005) on Frame |
| smg | gltf | `body` | 37 | (-0.022, -0.102, -0.213) | (0.020, 0.115, 0.237) | (0.000, 0.000, 0.000) on Pistol_Grip | (-0.000, 0.053, 0.237) on Barrel | (-0.001, 0.115, 0.066) on gun | (0.009, 0.057, 0.053) 0 mm | (-0.030, -0.118, 0.130) on Magazine |
| smg2 | gltf | `Reciver_Lower` | 48 | (-0.017, -0.085, -0.106) | (0.017, 0.050, 0.194) | (0.000, 0.000, 0.000) on Pistol_Grip | (-0.000, 0.015, 0.194) on Flashhider | (0.000, 0.049, 0.009) on Rear_Sight | (0.013, 0.010, 0.081) 0 mm | (-0.030, -0.101, 0.107) on Magazine_Standard |
| rifle | gltf | `Body_Lower` | 56 | (-0.042, -0.177, -0.426) | (0.042, 0.155, 0.374) | (0.000, 0.000, 0.000) on Pistol_Grip | (-0.000, 0.055, 0.374) on Flashhider | (-0.000, 0.154, -0.128) on Rear_Sight | (-0.027, 0.055, -0.243) 0 mm | (-0.030, -0.009, 0.206) on Handguard_Short |
| lmg | procedural | `part0:metal` | 52 | (-0.066, -0.155, -0.400) | (0.053, 0.142, 0.790) | (0.000, 0.000, 0.000) on gun | (0.000, 0.055, 0.790) on gun | (0.000, 0.142, 0.460) on gun | (0.035, 0.060, 0.200) 4 mm | (-0.030, -0.014, 0.360) on part0:metal |
| shotgun | procedural | `part0:steel` | 25 | (-0.027, -0.100, -0.390) | (0.028, 0.092, 0.700) | (0.000, 0.000, 0.000) on gun | (0.000, 0.060, 0.700) on gun | (0.000, 0.094, 0.680) on gun | (0.030, 0.055, 0.080) 2 mm | (-0.030, -0.036, 0.360) on action0:wood |
| dmr | gltf | `Body_MK14` | 37 | (-0.032, -0.100, -0.267) | (0.052, 0.096, 0.703) | (0.000, 0.000, 0.000) on grip | (0.000, 0.062, 0.703) on Flashhider_Short | (-0.000, 0.096, 0.089) on Rear_Sight | (0.029, 0.037, 0.340) 0 mm | (-0.030, -0.018, 0.360) on Body_MK14 |
| sniper | gltf | `Body_Lower` | 64 | (-0.037, -0.140, -0.453) | (0.062, 0.154, 0.707) | (0.000, 0.000, 0.000) on Pistol_Grip | (0.000, 0.034, 0.707) on Compensator | (0.012, 0.154, 0.266) on gun | (0.013, 0.066, 0.272) 0 mm | (-0.030, -0.007, 0.360) on Handguard |
| launcher | gltf | `Tube` | 20 | (-0.035, -0.065, -0.150) | (0.035, 0.053, 0.350) | (0.000, 0.000, 0.000) on gun | (0.000, -0.006, 0.350) on Tube | (0.001, 0.026, 0.142) on Front_Sight+Rear_Sight | (0.007, 0.007, 0.162) 0 mm | (-0.030, -0.081, 0.192) on Tube |
| clippers | procedural | `part0:polymer` | 16 | (-0.021, -0.045, -0.130) | (0.024, 0.034, 0.142) | (0.000, 0.000, 0.000) on gun | (0.000, 0.026, 0.140) on gun | (0.000, 0.030, 0.130) on gun | — | (-0.030, -0.065, -0.005) on part0:polymer |

What the first run found (2 of 11 passed) and what changed, all in `apps/client/src/game/view/`:

| finding | measured | fix |
|---|---|---|
| support hand hovering under every long gun's fore-end | smg 15, smg2 12.9, rifle 24.5, lmg 17.5, dmr 13, sniper 23.9 mm gap | `supportHandHome` reads the fore-end's underside off the parts; `WeaponModel.support` replaces the fixed y −0.035 |
| support hand at the muzzle (52 % of the declared length from a mid-gun grip) | MDR hand span 0.32–0.40 m vs muzzle 0.374; MPA 0.20–0.27 vs 0.237 | hand goes 55 % of the way from the grip to the measured front; the check requires 3 cm of clearance behind the muzzle |
| derived ejection port in the air (no `Ejection_Port` node) | dmr 10.8, sniper 30.6, launcher 13.1 mm off the gun | `fitAnchors` puts it on the right face of the part that spans that (y, z) |
| RPG launcher built backwards (muzzle on the rear cover, front sight at the back) | front sight z −0.127, rear sight z +0.06 before the flip | named sights outrank the barrel offset in `guessForward` |
| LMG grip below the receiver, stock 80 mm behind it, front sight 34 mm above the barrel, belt box 7.5 mm low, bipod feet 9 mm off | see `parts.md` before/after | procedural spec numbers moved (`weaponMeshes.ts`) |
| shotgun stock 50 mm behind the receiver | 50 mm | stock lengthened to meet the receiver |
| clippers muzzle past the teeth, aim point 37 mm above the body, hand 20 mm below the body | 10 / 37 / 20 mm | body extended down to the hand; anchors moved onto the comb |

## First person, camera space (`vm-fit.mjs`) — 2026-09-07, 11/11 measured

Viewport 960×540, camera space +x right, +y up, +z forward, metres. "ADS aim" is the weapon's aim
node projected to the screen, offset from the centre in pixels, MEAN over one breath (4.5 s): the
viewmodel breathes ±2.5 mm (halved in ADS), which alone is ±1.3 px at this viewport and 3 px
through the sniper's zoom. Acceptance ±1 px on the mean: **worst 0.16 px**. The sniper's 3 px peak
is the breath through the scope (Drop B: hold-breath). "Near-plane cut" counts gun vertices inside
the frustum but closer than the camera's 0.05 m near plane — the shotgun's pump had them before
the ADS distance rule (`Viewmodel.ts`, aim point ≥ 15 cm ahead of the eye); now **0 everywhere**.

| weapon | hip box min (x, y, z) | hip box max | hip muzzle | ADS box min | ADS box max | near-plane cut verts hip / ADS | ADS aim mean px (dx, dy) | ADS aim peak px | ADS fov |
|---|---|---|---|---|---|---|---|---|---|
| pistol | 0.209, -0.355, 0.316 | 0.263, -0.171, 0.541 | 0.226, -0.211, 0.55 | -0.017, -0.182, 0.178 | 0.019, -0.001, 0.4 | 0 / 0 | -0.01, -0.07 | 1.3 | 1.2566 |
| revolver | 0.208, -0.348, 0.306 | 0.262, -0.172, 0.532 | 0.227, -0.211, 0.53 | -0.018, -0.177, 0.148 | 0.018, -0.002, 0.37 | 0 / 0 | 0.02, 0.02 | 1.34 | 1.2252 |
| smg | 0.16, -0.426, 0.078 | 0.283, -0.153, 0.817 | 0.21, -0.212, 0.81 | -0.047, -0.268, -0.12 | 0.028, -0.001, 0.615 | 0 / 0 | 0.02, 0 | 1.34 | 1.2252 |
| smg2 | 0.173, -0.401, 0.092 | 0.281, -0.162, 0.633 | 0.22, -0.214, 0.64 | -0.045, -0.233, -0.066 | 0.026, -0.001, 0.47 | 0 / 0 | -0.03, 0 | 1.3 | 1.2566 |
| rifle | 0.13, -0.441, -0.032 | 0.274, -0.116, 1.147 | 0.169, -0.201, 1.139 | -0.035, -0.313, -0.22 | 0.036, 0, 0.955 | 0 / 0 | 0.02, -0.01 | 0.73 | 1.1781 |
| lmg | 0.128, -0.408, -0.064 | 0.283, -0.095, 1.134 | 0.169, -0.2, 1.129 | -0.066, -0.297, -0.25 | 0.053, 0, 0.94 | 0 / 0 | 0, 0 | 0.83 | 1.1781 |
| shotgun | 0.146, -0.341, -0.052 | 0.27, -0.147, 1.042 | 0.174, -0.194, 1.04 | -0.027, -0.194, -0.24 | 0.028, -0.001, 0.85 | 0 / 0 | 0.01, 0 | 0.53 | 1.3352 |
| dmr | 0.126, -0.391, -0.092 | 0.287, -0.088, 1.312 | 0.159, -0.205, 1.309 | -0.027, -0.255, -0.05 | 0.074, 0.033, 1.35 | 0 / 0 | 0.02, -0.02 | 1.34 | 0.9425 |
| sniper | 0.114, -0.372, -0.122 | 0.293, -0.082, 1.502 | 0.147, -0.21, 1.499 | — (viewmodel hidden in the scope) | — | 0 / 0 | 0.01, -0.02 | 3.04 | 0.4398 |
| launcher | 0.162, -0.375, 0.038 | 0.287, -0.123, 0.854 | 0.207, -0.222, 0.86 | -0.04, -0.244, -0.01 | 0.046, 0.003, 0.8 | 0 / 0 | -0.04, 0.04 | 1.25 | 1.2881 |
| clippers | 0.21, -0.31, 0.228 | 0.271, -0.227, 0.503 | 0.23, -0.239, 0.5 | -0.021, -0.074, 0.1 | 0.024, 0.005, 0.372 | 0 / 0 | 0.01, 0.16 | 0.95 | 1.5708 |

## Third person (`hand-pose.mjs`) — 2026-09-07, 2 bots × 11 weapons

Bore vs the body's facing, settled idle pose. Acceptance 5°: every firearm is at **4.6°** (the
procedural `gunHand` yaw of −0.08 rad, a deliberate inward cant) or 2.4° (sidearms); the clippers
sit at 15.4° / −15° pitch because the melee hold points them down (Character.ts, `melee` term) — a
tool, not a bore, recorded as is.

| weapon | bore vs facing (deg, worst bot) | bore pitch (deg) | muzzle height (m) | muzzle forward (m) | muzzle side (m) |
|---|---|---|---|---|---|
| pistol | 2.4 | -0.5 | 1.417 | 0.444 | 0.196 |
| revolver | 2.4 | 0.7 | 1.421 | 0.416 | 0.213 |
| smg | 4.6 | -0.7 | 1.391 | 0.64 | 0.136 |
| smg2 | 4.6 | 0.3 | 1.401 | 0.473 | 0.133 |
| rifle | 4.6 | 0.1 | 1.408 | 0.967 | 0.081 |
| lmg | 4.6 | -0.4 | 1.396 | 0.961 | 0.093 |
| shotgun | 4.6 | 0.6 | 1.412 | 0.868 | 0.116 |
| dmr | 4.6 | -0.7 | 1.387 | 1.133 | 0.089 |
| sniper | 4.6 | 0.5 | 1.416 | 1.305 | 0.056 |
| launcher | 4.6 | 0 | 1.4 | 0.684 | 0.108 |
| clippers | 15.7 | -15 | 1.244 | 0.341 | 0.17 |

## Screenshots (`weapon-shots.mjs`) — `apps/client/e2e/out/weapons/<id>/`

`fp_idle`, `fp_ads`, `fp_reload_mid` (40 % into the reload), `fp_inspect`, `tp_idle` (a bot 2.2 m
away facing the camera), `tp_side` (the same bot in profile). Regenerate with
`node e2e/tools/weapon-shots.mjs` from `apps/client` with the dev servers up.

Art review, round 2 (separate reviewer agent, 65 images, 2026-09-07): **no floating or clipping in
any first-person idle or inspect frame; right hand on the grip and left hand on the fore-end for
every long gun, both hands on the sidearms; the bot holds every weapon and the bore points where
the body faces in all 11 profiles.** Rejected: DMR ADS (opaque lens disc, no overlay — Drop B) and
launcher ADS (the procedural sight is a fat block on the tube — spec art, Deferred); every
mid-reload frame is "the idle pose tilted" because the magazine drops below the frame at the hip
pose (Deferred, animation read). Round 1 had rejected 20 frames for harness faults (empty
third-person frames, reloads never started, inspect pressed during a reload) — all three fixed in
`weapon-shots.mjs` and re-shot. The reviewer also reads the DMR receiver as "cut by the near
plane"; vm-fit's per-vertex count says 0 vertices inside the near plane for the DMR in ADS, so the
numbers stand and the look is the flat-shaded slab, not a cut.

## Open items

- **The running game never shows the imported guns or characters.** `Game.ts:164` empties the
  manifest's `characters` and `weapons` ("Characters and weapons share our procedural art at every
  quality level", since the ChatGPT merge). Everything in the parts table that says "gltf" is
  measured through the import pipeline but is NOT what a player sees; the vm-fit / hand-pose /
  screenshot numbers are of the procedural guns, which ARE what a player sees. Owner decision
  needed (Decisions log): keep the procedural guns as the product and retire the import path, or
  re-enable the imports and re-run this file's tools on them.
- Real GPU: SwiftShader runs at 10 fps; the numbers do not depend on it, the look does.
