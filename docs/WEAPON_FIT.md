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

## Open items (need the dev server + a browser; next Drop A session)

- `vm-fit.mjs`: camera-space box, grip origin and muzzle per weapon; ADS aim point within ±1 px of
  screen centre for every weapon.
- `hand-pose.mjs`: every third-person bore within 5° of the character's facing.
- Screenshots idle / ADS / reload mid-frame / inspect, both persons, `e2e/out/weapons/<id>/`,
  reviewed by a separate agent for clipping. In particular: does the hand's 4 mm sink into the
  fore-end read as a grasp; does the RPG now point the right way in the hand; does the LMG's front
  sight (now 76 mm tall, base on the barrel, top kept at the rail-height sight line) read as a gun
  part or as a mast.
