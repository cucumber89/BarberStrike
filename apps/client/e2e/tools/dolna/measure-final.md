# measure — dolna "DOLNA"

127 solids · 0 props · 0 lights · 12 team spawns (+8 arena) · 3 stations · 3 flags · 2 sites · bounds 64.0 × 70.0 m · 7504 walk cells, 5279 reachable from spawn 0 (1320 m²).

## 1. The generic map suite, emulated

- spawns per team ≥ 6: T0 6, T1 6 — ok
- every spawn free, floored, in bounds, reachable: ok 
- reachable set > 400 cells: 5279 — ok
- no T0 spawn sees a T1 spawn (standing): ok 
- stations ≥ 3, free, reachable, spread > 30 m in x: 3, spread 52.0 — ok 
- flags A/B/C reachable, pairwise > 14 m: ABC min 23.4 — ok 
- no spawn inside a flag zone (3.5 m): 0 — ok
- bomb sites own (yes), in bounds: ok; load ≤ 30 within 7.5 m: A 15+0, B 12+0 — ok
- no deep same-material overlaps: 0 — ok 
- floor audit: coplanar TOP pairs 0, coplanar side faces on interpenetrating solids 0 — ok  
- props in bounds: 0/0 — ok
- huntSpawnMinM 10 m on a 94.8 m diagonal (GÓRA: 6 on 39; district: 14 on 121).

## 2. The duel starts (first spawn of each side)

- T0 start (-3.4, 17) yaw -1.5707963267948966; T1 start (-7, -23.6) yaw 0; straight line 40.8 m.
- all pairs, standing/crouching both ends: none visible — ok
- surfaces with a line to the T0 start: 338 of 5279 (6.4 %), farthest 14.7 m (GÓRA: 7.9 %, 9 m).
- surfaces with a line to the T1 start: 216 of 5279 (4.1 %), farthest 14.5 m (GÓRA: 7.9 %, 9 m).
- start to start on foot: 44.3 m, 5.85 s sprint (brief R7: 35–45 m).

## 3. Walked routes from both starts (sprint held, real mover) — the SAME place from each side

| Place | T0 path (m) | T0 (s) | T1 path (m) | T1 (s) | Δ (ms) |
|---|---|---|---|---|---|
| *street_w | 30.1 | 3.92 | 29.2 | 3.88 | 33 |
| *street_mid | 24.4 | 3.17 | 23.1 | 3.02 | 150 |
| *street_e | 34.9 | 4.53 | 34.2 | 4.55 | 17 |
| *pole_w | 25.6 | 3.33 | 25.7 | 3.38 | 50 |
| gate | 26.5 | 3.43 | 30.2 | 4.00 | 567 |
| wicket | 20.0 | 2.60 | 24.1 | 3.15 | 550 |
| hedge_gap | 19.7 | 2.57 | 24.3 | 3.18 | 617 |
| garage_door | 14.4 | 1.88 | 30.3 | 3.97 | 2083 |
| shed_w_door | 1.0 | 0.10 | 43.2 | 5.65 | 5550 |
| hall_mouth | 18.7 | 2.43 | 60.6 | 7.90 | 5467 |
| site_gate | 28.6 | 3.72 | 15.7 | 2.05 | 1667 |
| site_gap_w | 28.2 | 3.68 | 15.8 | 2.07 | 1617 |
| site_gap_e | 31.9 | 4.13 | 21.4 | 2.78 | 1350 |
| toj | 30.5 | 3.93 | 23.7 | 3.13 | 800 |
| skips | 30.9 | 4.02 | 28.7 | 3.83 | 183 |
| car | 37.8 | 4.92 | 37.2 | 4.95 | 33 |
| street_w_end | 36.6 | 4.78 | 36.3 | 4.80 | 17 |
| street_e_end | 45.9 | 5.98 | 45.2 | 6.00 | 17 |
| other_start_T1 | 44.3 | 5.85 | 0.0 | 0.00 | 5850 |
| other_start_T0 | 0.0 | 0.00 | 44.1 | 5.75 | 5750 |

Worst side-to-side difference: **5850 ms** (R4: ≤ 250) — this is expected to be large for places on one side; the number that matters is the CONTESTED places (mark them in PLACES with a leading "*").
Worst difference over the 4 contested places: **150 ms** — ok

## 4. Choices after 2–4 s (exits within 15 / 30 m of walked path)

- T0: within 15 m — 5 (shed_w_door, shed_e_door, garage_back_door, east_lane, garden_n); within 30 m — 6 of 10 — ok
- T1: within 15 m — 3 (shell_door_n, shell_door_e, shell_door_w); within 30 m — 5 of 10 — ok

## 5. Sight lines (standing eye to standing eye, reachable surfaces only)

- 5279 surfaces (1320 m²), 200000 pairs, 39496 clear (19.7 %): median **11.2 m**, p90 28.3 m, p99 49.6 m, longest **58.6 m** (-29.25, 0, -4.75) → (29.25, 0, -1.75).
- Clear lines over 10 m: 56.1 %; 15 m: 35.3 %; 20 m: 21.7 %; 30 m: 8.6 %; 40 m: 3.3 %; 50 m: 0.9 %.
- R5: median 8–12 → ok; p90 ≤ 25 → **FAIL**; longest ≥ 50 → ok. (GÓRA: median 7.6, p90 15.0, longest 34.)

## 6. What can be climbed (chained real jumps from the ground)

- mantle 1.25 m beside a top; sprint jump 4.42 m across; 21 standable tops of 127.
- standable tops ≥ 1.9 m: none
- boundary/roof names standable: none — ok

## 7. Cover heights (R3) and floating solids

- low (0.5–1.0) 8 · crouch (1.2–1.6) 17 · full (2.0–2.8) 26 · structure (≥ 2.8) 36 · off the language: none — ok
- solids not standing on the ground or on another solid: none — ok
- man-height cover narrower than a body in both axes (< 0.9 m; deliberate "partial" cover only): garage_wall_w_j1, garage_wall_s_j0, shed_chair_1, shed_chair_2, hall_lift_post_w, hall_lift_post_e, tree_w_trunk, tree_e_trunk, tree_mid_trunk, tree_n_trunk, shell_wall_n_j0, shell_wall_w_j1

## Verdict

**1 failing checks:**
- p90 sight line over 25 m
