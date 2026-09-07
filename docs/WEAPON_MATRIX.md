# WEAPON_MATRIX — Drop B, the intended feel of every weapon

**Status: DRAFT, awaiting owner sign-off. No code has been written against this yet.**

This is the artefact `PLAN_2_1.md` Drop B asks for before any feel code: one row per weapon, the
six axes as columns, the *intended* character in words and in numbers. It is the contract that
stops feel work drifting. `e2e/tools/weapon-signature.mjs` will measure the rows; the signature
test asserts no two rows come out closer than a threshold.

What does **not** move (locked): `damage`, `damageMin`, `range`, `rpm`, `pellets`, `magazine`,
every `spread*` number and `effectiveSpread()` (server authority, L6; TTK is tuned, see
`BUILD_STATE.md` "The weapons"), `equipMs` (the server gates firing on it, `TdmRoom.ts:538`),
tick / snapshot rates. Cadence is therefore a *fixed* axis: the matrix describes it, the
implementation dresses it (mechanical sounds and viewmodel action between shots).

What **may** move: `recoilPattern`, `recoilJitter`, `recoilRecoverDelayMs`, `recoilRecoverPerSec`,
`adsZoom`, `adsMs`, `scoped` in `WeaponDef` (client reads them; the server never does — grep
confirms only `equipMs` is read server-side), plus every client-side presentation number.

## Where the numbers are today (recon, 2026-09-07)

Per weapon already: the recoil pattern (looping `[up, side]` radians, `weapons.ts:283-290`,
consumed by `WeaponController.ts:185` → `LocalPlayer.ts:215-219`), recovery rate and delay,
`adsZoom` / `adsMs`, `equipMs`, `scoped`, and the audio voice (one parametric synth, one table row
per weapon, `audio/sfx.ts:31-44`).

Global today, identical for all eleven (this is why they feel alike from the hip):

| Thing | Value | Where |
|---|---|---|
| Sprint-out (fire delay after sprint) | 150 ms | `WeaponController.ts:6` |
| Viewmodel sway gains / spring / clamps | 1.6 / 1.2, spring 40, ±0.05 | `Viewmodel.ts:544-550` |
| ADS recoil scale | 0.7 | `WeaponController.ts:186` |
| Shake per shot | shotgun 0.012, dmr 0.010, launcher 0.014, all else 0.004 (hard-coded ternary) | `view/index.ts:85,94` |
| Shake decay / clamp | decay dt·12, clamp 0.05 | `LocalPlayer.ts:226,288` |
| Muzzle flash | one pool, size 0.22 hitscan / 0.35 launcher, light 18, life 60 ms | `Effects.ts:73-83,151-164`, `view/index.ts:85-100` |
| Tracer | colour (1, .82, .55), diameter 0.02, ttl 70–100 ms, every hitscan | `vfx/Tracers.ts:25,34,58` |
| Casing | exactly one per shot, 12×12×30 mm, same velocity, every hitscan | `Effects.ts:140,217-224` |
| Scope drift / breath | sway 0.0045 rad, hold 4 s, held ×0.12, winded ×2.2 | `LocalPlayer.ts:30` |
| Sensitivity in ADS | user `adsSensitivity` only, **not** scaled by zoom | `LocalPlayer.ts:111-112` |
| Crosshair gap | `min(34+gap, gap + spread·900)` | `Hud.tsx:127` |

## The six axes, and what "different" means on each

1. **Recoil shape** — the path the crosshair draws over a burst: height of the first kick, how
   it climbs (steady / hop / slam), whether it wanders (side RMS) or drifts (side bias), and how
   long it takes to settle after the last shot. Numbers: pattern steps in mrad, jitter, recovery
   delay ms, recovery rate 1/s.
2. **Fire cadence** — fixed `rpm`, plus what happens *between* shots: pump, bolt, hammer,
   break-open, belt rattle. Numbers: interval ms, mechanical action length ms.
3. **ADS time and zoom** — `adsMs`, `adsZoom`, whether a scope overlay appears, whether
   sensitivity scales with zoom.
4. **Handling weight** — sway amplitude (multiplier on the global gains), sprint-out ms, raise
   time within `equipMs`, `mobility` (fixed, quoted for context).
5. **Audio report** — the voice row: `f0` Hz, body s, tail s, crack Hz (0 = none), width, level;
   plus mechanical sounds that are the weapon's own.
6. **Visual violence** — flash size, shake per shot, tracer (width / on-off), casing (count,
   size, when it ejects), any extra (smoke, scope).

Reading a row: *words* are the target a playtester should be able to say back; *numbers* are what
`weapon-signature.mjs` measures and what the implementer sets. Values in **bold** are changes
from today; plain values are today's numbers kept on purpose.

## The matrix

| Weapon | 1 · Recoil shape | 2 · Cadence | 3 · ADS | 4 · Handling weight | 5 · Audio report | 6 · Visual violence |
|---|---|---|---|---|---|---|
| **P9 Straight Razor** (pistol) | *Snappy, polite.* A short hop, back on target before the next shot. Steps 20–24 mrad up, ±5 side, jitter 0.15, delay 50 ms, recover 12/s. | 420 rpm (143 ms). Slide cycles on every shot (viewmodel, 60 ms). Hammer-click on the last round. | 0.80 zoom, 110 ms. No overlay. Sens ×0.80 (rule R1). | Sway **×0.6**. Sprint-out **90 ms**. Raise **fast, 60 % of equip**. Mobility 1.00. | f0 190, body 0.06, tail 0.28, no crack, mono, level 0.80. Dry, short "pop". | Flash **0.18**, shake **0.003**, tracer thin (0.02), **one small** casing (9 mm) right. |
| **R-44 Razorback** (revolver) | *A hammer blow, then a slow arc back.* One tall slam, rolls the wrist. Steps **70 / 74 / 68** mrad up, **±12** side, jitter 0.15, delay 100 ms, recover **6/s** (settled just before the 400 ms second shot). | 150 rpm (400 ms). **Hammer cocks** after each shot (viewmodel + click at +120 ms). Cylinder swings out on reload. | 0.78 zoom, 120 ms. No overlay. Sens ×0.78. | Sway ×1.0. Sprint-out **140 ms**. Raise **deliberate, 90 % of equip**. Mobility 0.98. | f0 **110**, body 0.09, tail **0.70**, crack 2200, wide, level 0.92. The loudest sidearm; a boom with a ring. | Flash **0.30 round**, shake **0.008**, tracer bright, **no casing per shot** — six drop together at the reload. |
| **K-7 Buzzcut** (smg) | *Sewing machine, wanders.* Tiny steps that walk left and right; side RMS is the tell. Steps 6–10 mrad up, ±2–6 side alternating, jitter 0.30, delay 70 ms, recover 10/s. | 840 rpm (71 ms). No action between shots; the bolt is a blur. | 0.78 zoom, 100 ms. No overlay. Sens ×0.78. | Sway **×0.8**. Sprint-out **110 ms**. Raise 70 %. Mobility 1.00. | f0 240, body 0.04, tail 0.16, no crack, mono, level 0.68. Tight clack; the tail never overlaps the next shot. | Flash **0.16**, shake **0.003**, tracer thin, **one small** casing per shot right (the brass fountain is the picture). |
| **VZ-9 Trim** (smg2) | *Screams, climbs in a straight line.* Fastest gun, but predictable: a steady up-right diagonal, almost no wander. Steps **7 / 7 / 8 / 7 / 8 / 7** mrad up, side **+3 / +4 / +3 / +5 / +4 / +3** (all right), jitter **0.20**, delay 60 ms, recover **13/s** (springs back the instant you stop). | 1000 rpm (60 ms). No action; a continuous ripple in the viewmodel. | 0.80 zoom, 90 ms (fastest in the game). No overlay. Sens ×0.80. | Sway **×0.5** (lightest). Sprint-out **80 ms**. Raise **snap, 50 %**. Mobility 1.03. | f0 **320**, body 0.03, tail **0.10**, no crack, mono, level 0.62, click HP **5000**. A metallic zip, higher and thinner than the K-7. | Flash **0.14**, shake **0.002**, tracer thin, **one tiny** casing per shot **downward** (bottom ejection). |
| **AR-31 Pompadour** (rifle) | *Learnable climb.* Five rounds up, then drifts right, then back left (today's 13-step pattern, kept). 16–19 mrad up early, 6–8 late, side to ±12, jitter 0.18, delay 90 ms, recover 8/s. | 650 rpm (92 ms). No action between shots; charging handle on reload. | 0.75 zoom, **130 ms**. No overlay. Sens ×0.75. | Sway ×1.0 (the reference). Sprint-out 150 ms (the reference). Raise 80 %. Mobility 0.94. | f0 150, body 0.07, tail 0.42, crack 2600, mono, level 0.86. The reference rifle report. | Flash 0.22, shake 0.004, tracer standard, one medium casing (5.56) right. The reference row for axis 6. |
| **MG-4 Bulk** (lmg) | *Heavy, wide, then it settles.* Starts wide and flattens (today's 10-step pattern, kept). 20 → 8 mrad up, ±4 → ±10 → ±8 side, jitter 0.22, delay 110 ms, recover **5/s**. **Bipod rule B1**: crouched and still for ≥ 400 ms → sway ×0.3 and camera recoil ×0.6 (client only; server spread already has its crouch ×0.8). | 600 rpm (100 ms). **Belt rattle** on every shot; a long, staged reload (5.2 s) with box, belt and cover. | 0.75 zoom, 240 ms (slowest). No overlay. Sens ×0.75. | Sway **×1.6 with a slow period** (heaviest). Sprint-out **260 ms**. Raise **slow, 100 %**. Mobility 0.82. | f0 125, body 0.08, tail 0.50, crack 2400, wide, level 0.90, plus a **link-rattle** click layer per shot. | Flash **0.30 with a light that stays lit between shots** (100 ms interval vs 60 ms life → continuous glow), shake **0.005**, tracer **thick 0.03 and brighter** (every round a tracer), **casing + belt link** (two objects) per shot. |
| **S12 Wet Shave** (shotgun) | *One heavy shove.* Steps **85 / 88** mrad up, ±12 side, jitter 0.25, delay 120 ms, recover **6.5/s**. The gun comes off the target and is brought back by the pump. | 78 rpm (769 ms). **Pump cycle 250 ms** after each shot (viewmodel + clack-clack at +200 / +350 ms). | 0.85 zoom, 130 ms. No overlay. Sens ×0.85. **Crosshair rule C1**: pellet weapons draw a ring of radius `spread·900` px, not the capped gap. | Sway **×1.2**. Sprint-out **180 ms**. Raise 90 %. Mobility 0.92. | f0 72, body 0.13, tail 0.75, no crack, wide, level 0.95, plus **pump clacks** (`click`+`thud`). The deepest short boom. | Flash **0.40 wide and short**, shake 0.012, **nine short tracers** (the spray), **one big red shell** ejected at the pump (+200 ms), not at the shot. |
| **M-1 Clean Line** (dmr) | *Heavy, precise, slow to settle.* Steps 55 / 58 / 60 mrad up, ±8–12 side, jitter 0.12, delay 160 ms, recover 4.5/s. The follow-up must be timed. | 150 rpm (400 ms). Semi-auto; no action. | 0.60 zoom, **160 ms**. **Decision D-B2**: `scoped: true` with a light "ring" overlay (circle-dot, ~60 % of the view clear), viewmodel hidden > 0.9, **no** breath hold, drift **×0.5** of the sniper's. Sens ×0.60. | Sway **×1.1**. Sprint-out **200 ms**. Raise 90 %. Mobility 0.88. | f0 105, body 0.09, tail 0.95, crack 3100, mono, level 0.92. The sharpest crack short of the sniper, long tail. | Flash **0.26**, shake 0.010, tracer **long and bright** (a line you can see), one large casing right. |
| **SR-50 Longcut** (sniper) | *Cannon.* Steps 90 / 95 mrad up, ±12–14 side, jitter 0.10, delay 220 ms, recover 3.5/s. The scope lifts clean off the target and returns in ~0.8 s. | 45 rpm (1333 ms). **Bolt cycle 700 ms** after each shot: **rule S1**, ADS drops to hip for the bolt, re-scopes if aim is still held. | 0.28 zoom, 260 ms, scoped, full tube overlay. Sens ×0.28 (rule R1). Drift 0.0045 rad, breath hold 4 s → ×0.12, winded ×2.2 (today). **Rule S2**: sprinting un-scopes (see Open items). | Sway ×1.0 hip. Sprint-out **300 ms** (the heaviest). Raise **slow, 100 %**. Mobility 0.84. | f0 80, body 0.12, tail 1.40, crack 3400, wide, level 1.00, plus **bolt open / close** clicks at +150 / +550 ms. The loudest, longest report in the game. | Flash **0.45 with the biggest light**, shake **0.014**, tracer **thick and long**, one **huge** casing at the bolt cycle, the scope overlay. |
| **GL-1 Blowout** (launcher) | *Thump.* One step 70 mrad up, +10 side, jitter 0.10, delay 150 ms, recover 5/s. | 60 rpm (1000 ms). Single shot; **break-open reload** (2.6 s) with the case coming out then. | 0.82 zoom, 160 ms. No overlay. Sens ×0.82. The arc: shell 26 m/s, gravity 9 m/s², impact-detonate, blast 4.5 m (`grenades.ts:50`) — a flat shot from eye height lands at ~15 m, a 45° shot at ~75 m. | Sway **×1.3**. Sprint-out **220 ms**. Raise **slow, 100 %**. Mobility 0.86. | f0 60, body 0.14, tail 0.50, no crack, wide, level 0.85. The lowest thump; almost no click. | Flash 0.35 **with a smoke puff**, shake 0.014, **no tracer** (the shell is the tracer), **no casing per shot** — the case comes out at the break-open. |
| **Clippers** | *A nudge.* Steps 12 mrad, ±10 side, delay 40 ms, recover 10/s. Hits: shake **0.002**. | 100 swings/min (600 ms). The blade buzzes. | No ADS (zoom 1). | Sway **×0.4**. Sprint-out **60 ms**. Raise **instant, 40 %**. Mobility 1.06. | `meleeSwing` (no voice row), plus **rule M1**: a low continuous motor hum while equipped (level ~0.15), pitch rises on the swing. | No flash, no tracer, no casing. Sparks on a wall hit, a hair puff on a body hit (Drop E owns the shave visuals). |

## Rules named in the rows (each one is a small, testable client change)

- **R1 — sensitivity scales with zoom.** ADS look sensitivity = base × user `adsSensitivity` ×
  `adsZoom`. Applies to every weapon (0.80 on a pistol is barely felt; 0.28 on the sniper is the
  whole point). Today the zoom is ignored (`LocalPlayer.ts:111-112`). *Alternative if the owner
  prefers: scoped weapons only.*
- **B1 — LMG bipod.** Crouched and stationary ≥ 400 ms: sway ×0.3, camera recoil ×0.6. Client
  only; the server cone is untouched (its crouch ×0.8 already exists in `effectiveSpread`).
- **C1 — pellet crosshair.** Pellet weapons draw a spread ring of radius `spread·900` px instead
  of the four-line gap (which is capped at `34+gap` and cannot show a 0.055 rad cone).
- **S1 — sniper bolt.** After each shot the ADS blend drops to 0 for the 700 ms bolt cycle and
  returns if the aim button is still held. This is the mechanical "kick out of the scope".
- **S2 — un-scope on sprint.** Shift is both sprint and breath today, and sprint is impossible
  while aiming (`movement.ts:100`). Proposal: while scoped and *still*, Shift holds breath; Shift
  with forward movement un-scopes and sprints. See Open items.
- **M1 — clippers hum.** A looping low hum while the clippers are the equipped weapon.

## Decisions the owner is asked to sign along with the matrix

- **D-B1 — where the new per-weapon presentation numbers live.** Sway multiplier, sprint-out,
  raise fraction, flash size, shake, tracer style, casing rule, mechanical action timings go in a
  **client-only** table `apps/client/src/game/combat/weaponFeel.ts` keyed by `WeaponId`, next to
  the voice table. `WeaponDef` gains no field, the schema gains no field, the server sees nothing.
  Recoil / ADS numbers that already exist in `WeaponDef` are edited in place.
- **D-B2 — the DMR becomes a scoped weapon**, with its own lighter overlay (ring, not tube),
  no breath hold, half the sniper's drift. This settles the Drop A deferred item (opaque lens disc
  in ADS) and the dmr/sniper twin-silhouette note: they separate by feel. *Alternative:* keep
  `scoped: false` and replace the lens disc with a see-through ring (geometry).
- **D-B3 — S2 key mapping** as above (breath when still, sprint when moving), so no new keybind.
  *Alternative:* a dedicated hold-breath key and Shift always sprints (un-scopes).
- **D-B4 — the signature threshold** is set from the first real run of `weapon-signature.mjs`:
  the closest pair (expected: K-7 / VZ-9, then P9 / K-7) must be at least 0.25 apart on the
  normalised axes, and the threshold is frozen in the test after that run.

## What `weapon-signature.mjs` will measure (one JSON per weapon under `e2e/out/signature/`)

- Recoil: crosshair offset per shot over a 6-shot burst (pitch, yaw, mrad) → first kick, total
  climb, side RMS, side bias, and settle time to 10 % after the last shot.
- Cadence: measured shot interval ms.
- ADS: blend time 0.1 → 0.9 in ms, zoom (FOV ratio), overlay present.
- Handling: sprint-out ms (first shot after sprint release), raise-to-fire ms after equip, sway
  amplitude at rest (px RMS over 2 s).
- Audio: peak dBFS and time to −20 dB of the gunshot rendered through `selftest.ts`'s
  `OfflineAudioContext` path (already exposed as `window.__fbAudio`, `audio/index.ts:194`).
- Visual: flash size, shake amplitude, tracer width, casing count from the feel table (read, not
  rendered — SwiftShader cannot judge the picture; a screenshot set is saved for the owner).

## Open items (need the owner or a real GPU)

- The sniper scope (overlay, zoom, hidden viewmodel, sensitivity, breath, S1 bolt, S2 un-scope)
  must be judged on a real GPU by the owner. SwiftShader can prove the numbers, not the look.
- S2 key mapping (D-B3).
- Whether R1 applies to all weapons or only scoped ones.
- Prediction corrections per minute (F3 telemetry) must not rise: recoil is client-side and the
  server cone is unchanged, so they should not — measured before and after.

## Sign-off

Owner: ____________________  Date: __________  "signed" / changes requested: __________
