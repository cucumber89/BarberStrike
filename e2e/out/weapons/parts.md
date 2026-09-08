# weapon-parts — 2026-09-08T00:28:22.013Z

weapon-parts: 11/11 pass

Tolerance 5 mm. Frame: +Z forward, +Y up, +X right, metres, origin at the top of the grip (what the viewmodel sees).

## pistol (procedural) — PASS
receiver: `part0:polymer`; gun box (-0.017, -0.095, -0.042) … (0.019, 0.086, 0.180) (36.0 × 181.0 × 222.0 mm); 27 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:polymer | (-0.014, 0.007, -0.025) | (0.014, 0.037, 0.145) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.009, 0.002, 0.090) | (0.009, 0.010, 0.140) | 0.0 | part0:polymer (0.0) | yes |
| part2:metal | (-0.009, 0.010, 0.095) | (0.009, 0.016, 0.102) | 0.0 | part0:polymer (0.0) | yes |
| part3:metal | (-0.009, 0.010, 0.111) | (0.009, 0.016, 0.118) | 0.0 | part0:polymer (0.0) | yes |
| part4:metal | (-0.009, 0.010, 0.128) | (0.009, 0.016, 0.135) | 0.0 | part0:polymer (0.0) | yes |
| part5:polymer | (-0.014, -0.085, -0.040) | (0.014, 0.005, 0.000) | 2.0 | part6:rubber (0.0) | yes |
| part6:rubber | (-0.016, -0.017, -0.042) | (0.016, -0.009, 0.002) | 16.0 | part5:polymer (0.0) | yes |
| part7:rubber | (-0.016, -0.044, -0.042) | (0.016, -0.036, 0.002) | 43.0 | part5:polymer (0.0) | yes |
| part8:rubber | (-0.016, -0.071, -0.042) | (0.016, -0.063, 0.002) | 70.0 | part5:polymer (0.0) | yes |
| part9:polymer | (-0.015, -0.094, -0.041) | (0.015, -0.082, 0.001) | 89.0 | part5:polymer (0.0) | yes |
| part10:steel | (-0.006, 0.044, 0.150) | (0.006, 0.056, 0.180) | 8.6 | action0:metal (0.0) | yes |
| part11:brass | (-0.004, -0.008, 0.010) | (0.004, 0.022, 0.030) | 0.0 | part0:polymer (0.0) | yes |
| part12:metal | (-0.010, -0.017, 0.003) | (0.010, -0.013, 0.048) | 20.0 | part13:metal (0.0) | yes |
| part13:metal | (-0.010, -0.015, 0.045) | (0.010, 0.013, 0.049) | 0.0 | part0:polymer (0.0) | yes |
| part14:steel | (-0.007, 0.030, -0.036) | (0.007, 0.050, -0.024) | 0.0 | part0:polymer (0.0) | yes |
| part15:brass | (-0.016, -0.032, -0.032) | (0.016, -0.018, -0.018) | 25.0 | part5:polymer (0.0) | yes |
| part16:tan | (-0.017, -0.068, -0.036) | (0.017, -0.020, -0.014) | 27.0 | part5:polymer (0.0) | yes |
| action0:metal | (-0.016, 0.028, -0.035) | (0.016, 0.073, 0.155) | 0.0 | part0:polymer (0.0) | yes |
| action1:steel | (0.015, 0.049, 0.010) | (0.019, 0.067, 0.050) | 12.0 | action0:metal (0.0) | yes |
| action2:steel | (-0.017, 0.040, -0.035) | (0.017, 0.060, -0.005) | 3.0 | part14:steel (0.0) | yes |
| action3:steel | (-0.003, 0.072, 0.135) | (0.003, 0.084, 0.145) | 35.0 | action0:metal (0.0) | yes |
| action4:metal | (-0.010, 0.072, -0.026) | (-0.006, 0.084, -0.014) | 35.0 | action0:metal (0.0) | yes |
| action5:metal | (0.006, 0.072, -0.026) | (0.010, 0.084, -0.014) | 35.0 | action0:metal (0.0) | yes |
| action6:brass | (-0.008, 0.080, -0.022) | (-0.004, 0.086, -0.018) | 43.0 | action4:metal (0.0) | yes |
| action7:brass | (0.004, 0.080, -0.022) | (0.008, 0.086, -0.018) | 43.0 | action5:metal (0.0) | yes |
| mag0:polymer | (-0.011, -0.090, -0.035) | (0.011, -0.010, -0.005) | 17.0 | part5:polymer (0.0) | yes |
| mag1:rubber | (-0.012, -0.095, -0.036) | (0.012, -0.089, -0.004) | 96.0 | part9:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part5:polymer |
| muzzle | (0.000, 0.050, 0.180) | — | 0.0 | yes | no barrel part named; nearest part10:steel |
| aimPoint | (0.000, 0.086, 0.140) | — | 2.0 | yes | no sight part named; nearest action3:steel |
| eject | (0.020, 0.060, 0.030) | — | 1.0 | yes | no ejection port named; nearest action1:steel |
| magazine | (0.000, -0.053, -0.020) | part5:polymer | 0.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, -0.065, -0.005) | part5:polymer | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## revolver (procedural) — PASS
receiver: `part0:steel`; gun box (-0.018, -0.090, -0.052) … (0.018, 0.085, 0.170) (36.0 × 175.0 × 222.0 mm); 21 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:steel | (-0.015, 0.003, -0.040) | (0.015, 0.037, 0.080) | 0.0 | part1:steel (0.0) | yes |
| part1:steel | (-0.018, 0.014, -0.005) | (0.018, 0.050, 0.045) | 0.0 | part0:steel (0.0) | yes |
| part2:metal | (0.008, 0.028, -0.006) | (0.016, 0.036, 0.046) | 0.0 | part0:steel (0.0) | yes |
| part3:metal | (0.002, 0.038, -0.006) | (0.010, 0.046, 0.046) | 1.4 | part1:steel (0.0) | yes |
| part4:metal | (-0.010, 0.038, -0.006) | (-0.002, 0.046, 0.046) | 1.4 | part1:steel (0.0) | yes |
| part5:metal | (-0.016, 0.028, -0.006) | (-0.008, 0.036, 0.046) | 0.0 | part0:steel (0.0) | yes |
| part6:metal | (-0.010, 0.018, -0.006) | (-0.002, 0.026, 0.046) | 0.0 | part0:steel (0.0) | yes |
| part7:metal | (0.002, 0.018, -0.006) | (0.010, 0.026, 0.046) | 0.0 | part0:steel (0.0) | yes |
| part8:wood | (-0.012, -0.090, -0.050) | (0.012, 0.000, -0.010) | 3.0 | part9:rubber (0.0) | yes |
| part9:rubber | (-0.014, -0.022, -0.052) | (0.014, -0.014, -0.008) | 17.0 | part8:wood (0.0) | yes |
| part10:rubber | (-0.014, -0.049, -0.052) | (0.014, -0.041, -0.008) | 44.0 | part8:wood (0.0) | yes |
| part11:rubber | (-0.014, -0.076, -0.052) | (0.014, -0.068, -0.008) | 71.0 | part8:wood (0.0) | yes |
| part12:steel | (-0.006, 0.044, 0.050) | (0.006, 0.056, 0.170) | 7.0 | part13:steel (0.0) | yes |
| part13:steel | (-0.015, 0.053, 0.040) | (0.015, 0.071, 0.160) | 16.0 | part12:steel (0.0) | yes |
| part14:steel | (-0.012, 0.027, 0.060) | (0.012, 0.037, 0.160) | 0.0 | part0:steel (0.0) | yes |
| part15:brass | (-0.003, 0.071, 0.156) | (0.003, 0.085, 0.164) | 83.3 | part13:steel (0.0) | yes |
| part16:metal | (-0.010, 0.070, -0.035) | (0.010, 0.078, -0.025) | 33.0 | part20:steel (5.0) | yes |
| part17:brass | (-0.004, -0.008, -0.010) | (0.004, 0.022, 0.010) | 0.0 | part0:steel (0.0) | yes |
| part18:metal | (-0.010, -0.017, -0.017) | (0.010, -0.013, 0.028) | 16.0 | part8:wood (0.0) | yes |
| part19:metal | (-0.010, -0.015, 0.026) | (0.010, 0.013, 0.029) | 0.0 | part0:steel (0.0) | yes |
| part20:steel | (-0.005, 0.035, -0.046) | (0.005, 0.065, -0.034) | 0.0 | part0:steel (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part17:brass |
| muzzle | (0.000, 0.050, 0.170) | — | 0.0 | yes | no barrel part named; nearest part12:steel |
| aimPoint | (0.000, 0.086, 0.160) | — | 1.0 | yes | no sight part named; nearest part15:brass |
| eject | (0.020, 0.050, 0.020) | — | 2.0 | yes | no ejection port named; nearest part1:steel |
| supportHand | (-0.030, -0.065, -0.005) | part8:wood | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## smg (procedural) — PASS
receiver: `part0:metal`; gun box (-0.047, -0.165, -0.280) … (0.028, 0.102, 0.455) (75.0 × 267.0 × 735.0 mm); 48 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.025, 0.005, -0.070) | (0.025, 0.075, 0.270) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.011, 0.074, -0.040) | (0.011, 0.082, 0.260) | 0.0 | part0:metal (0.0) | yes |
| part2:metal | (-0.011, 0.082, -0.036) | (0.011, 0.088, -0.029) | 7.0 | part1:metal (0.0) | yes |
| part3:metal | (-0.011, 0.082, -0.019) | (0.011, 0.088, -0.012) | 7.0 | part1:metal (0.0) | yes |
| part4:metal | (-0.011, 0.082, -0.002) | (0.011, 0.088, 0.005) | 7.0 | part1:metal (0.0) | yes |
| part5:metal | (-0.011, 0.082, 0.014) | (0.011, 0.088, 0.021) | 7.0 | part1:metal (0.0) | yes |
| part6:metal | (-0.011, 0.082, 0.031) | (0.011, 0.088, 0.038) | 7.0 | part1:metal (0.0) | yes |
| part7:metal | (-0.011, 0.082, 0.048) | (0.011, 0.088, 0.055) | 7.0 | part1:metal (0.0) | yes |
| part8:metal | (-0.011, 0.082, 0.064) | (0.011, 0.088, 0.071) | 7.0 | part1:metal (0.0) | yes |
| part9:metal | (-0.011, 0.082, 0.081) | (0.011, 0.088, 0.088) | 7.0 | part1:metal (0.0) | yes |
| part10:metal | (-0.011, 0.082, 0.098) | (0.011, 0.088, 0.105) | 7.0 | part1:metal (0.0) | yes |
| part11:metal | (-0.011, 0.082, 0.114) | (0.011, 0.088, 0.121) | 7.0 | part1:metal (0.0) | yes |
| part12:metal | (-0.011, 0.082, 0.131) | (0.011, 0.088, 0.138) | 7.0 | part1:metal (0.0) | yes |
| part13:metal | (-0.011, 0.082, 0.148) | (0.011, 0.088, 0.155) | 7.0 | part1:metal (0.0) | yes |
| part14:metal | (-0.011, 0.082, 0.164) | (0.011, 0.088, 0.171) | 7.0 | part1:metal (0.0) | yes |
| part15:metal | (-0.011, 0.082, 0.181) | (0.011, 0.088, 0.188) | 7.0 | part1:metal (0.0) | yes |
| part16:metal | (-0.011, 0.082, 0.198) | (0.011, 0.088, 0.205) | 7.0 | part1:metal (0.0) | yes |
| part17:metal | (-0.011, 0.082, 0.214) | (0.011, 0.088, 0.222) | 7.0 | part1:metal (0.0) | yes |
| part18:metal | (-0.011, 0.082, 0.231) | (0.011, 0.088, 0.238) | 7.0 | part1:metal (0.0) | yes |
| part19:metal | (-0.011, 0.082, 0.248) | (0.011, 0.088, 0.255) | 7.0 | part1:metal (0.0) | yes |
| part20:polymer | (-0.020, 0.010, 0.240) | (0.020, 0.050, 0.360) | 0.0 | part0:metal (0.0) | yes |
| part21:rubber | (-0.022, 0.004, 0.250) | (0.022, 0.012, 0.350) | 0.0 | part0:metal (0.0) | yes |
| part22:steel | (-0.009, 0.046, 0.355) | (0.009, 0.064, 0.445) | 85.0 | part20:polymer (0.0) | yes |
| part23:steel | (-0.011, 0.044, 0.425) | (0.011, 0.066, 0.455) | 155.0 | part22:steel (0.0) | yes |
| part24:metal | (-0.012, 0.053, 0.432) | (0.012, 0.057, 0.438) | 162.0 | part22:steel (0.0) | yes |
| part25:metal | (-0.012, 0.053, 0.442) | (0.012, 0.057, 0.448) | 172.0 | part22:steel (0.0) | yes |
| part26:polymer | (-0.015, -0.085, -0.042) | (0.015, 0.005, 0.002) | 0.0 | part0:metal (0.0) | yes |
| part27:rubber | (-0.017, -0.017, -0.044) | (0.017, -0.009, 0.005) | 14.0 | part26:polymer (0.0) | yes |
| part28:rubber | (-0.017, -0.044, -0.044) | (0.017, -0.036, 0.005) | 41.0 | part26:polymer (0.0) | yes |
| part29:rubber | (-0.017, -0.071, -0.044) | (0.017, -0.063, 0.005) | 68.0 | part26:polymer (0.0) | yes |
| part30:polymer | (-0.015, 0.005, -0.260) | (0.015, 0.055, -0.070) | 0.0 | part0:metal (0.0) | yes |
| part31:rubber | (-0.017, 0.020, -0.280) | (0.017, 0.040, -0.260) | 190.0 | part30:polymer (0.0) | yes |
| part32:metal | (-0.010, 0.082, 0.190) | (0.010, 0.090, 0.210) | 7.0 | part1:metal (0.0) | yes |
| part33:steel | (-0.002, 0.084, 0.198) | (0.002, 0.100, 0.202) | 9.0 | part16:metal (0.0) | yes |
| part34:metal | (-0.013, 0.082, 0.195) | (-0.009, 0.102, 0.205) | 7.0 | part1:metal (0.0) | yes |
| part35:metal | (0.009, 0.082, 0.195) | (0.013, 0.102, 0.205) | 7.0 | part1:metal (0.0) | yes |
| part36:metal | (-0.013, 0.082, -0.028) | (0.013, 0.088, -0.012) | 7.0 | part1:metal (0.0) | yes |
| part37:metal | (-0.011, 0.082, -0.023) | (-0.006, 0.098, -0.017) | 7.0 | part1:metal (0.0) | yes |
| part38:metal | (0.006, 0.082, -0.023) | (0.011, 0.098, -0.017) | 7.0 | part1:metal (0.0) | yes |
| part39:metal | (-0.011, 0.085, -0.023) | (0.011, 0.089, -0.017) | 10.0 | part3:metal (0.0) | yes |
| part40:steel | (0.024, 0.041, 0.080) | (0.028, 0.059, 0.120) | 0.0 | part0:metal (0.0) | yes |
| part41:steel | (-0.047, 0.054, -0.006) | (-0.017, 0.066, 0.006) | 0.0 | part0:metal (0.0) | yes |
| part42:brass | (-0.004, -0.008, 0.020) | (0.004, 0.022, 0.040) | 0.0 | part0:metal (0.0) | yes |
| part43:metal | (-0.010, -0.017, 0.010) | (0.010, -0.013, 0.060) | 18.0 | part44:metal (0.0) | yes |
| part44:metal | (-0.010, -0.015, 0.058) | (0.010, 0.013, 0.062) | 0.0 | part0:metal (0.0) | yes |
| part45:steel | (-0.021, 0.013, -0.107) | (-0.015, 0.027, -0.093) | 23.0 | part30:polymer (0.0) | yes |
| mag0:polymer | (-0.013, -0.160, 0.095) | (0.013, 0.000, 0.145) | 5.0 | mag1:rubber (0.0) | yes |
| mag1:rubber | (-0.014, -0.165, 0.094) | (0.014, -0.159, 0.146) | 164.0 | mag0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part26:polymer |
| muzzle | (0.000, 0.055, 0.450) | — | 0.0 | yes | no barrel part named; nearest part23:steel |
| aimPoint | (0.000, 0.102, 0.200) | — | 2.0 | yes | no sight part named; nearest part33:steel |
| eject | (0.030, 0.060, 0.100) | — | 2.2 | yes | no ejection port named; nearest part40:steel |
| magazine | (0.000, -0.083, 0.120) | part0:metal | 5.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, -0.012, 0.250) | part0:metal | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## smg2 (procedural) — PASS
receiver: `part0:metal`; gun box (-0.040, -0.173, -0.270) … (0.026, 0.108, 0.281) (66.0 × 280.7 × 551.0 mm); 58 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.022, 0.000, -0.070) | (0.022, 0.060, 0.110) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.020, 0.030, -0.060) | (0.020, 0.070, 0.100) | 0.0 | part0:metal (0.0) | yes |
| part2:metal | (-0.009, 0.066, -0.060) | (0.009, 0.074, 0.220) | 6.0 | part1:metal (0.0) | yes |
| part3:metal | (-0.009, 0.074, -0.056) | (0.009, 0.080, -0.048) | 14.0 | part2:metal (0.0) | yes |
| part4:metal | (-0.009, 0.074, -0.039) | (0.009, 0.080, -0.032) | 14.0 | part2:metal (0.0) | yes |
| part5:metal | (-0.009, 0.074, -0.023) | (0.009, 0.080, -0.016) | 14.0 | part2:metal (0.0) | yes |
| part6:metal | (-0.009, 0.074, -0.006) | (0.009, 0.080, 0.001) | 14.0 | part2:metal (0.0) | yes |
| part7:metal | (-0.009, 0.074, 0.010) | (0.009, 0.080, 0.017) | 14.0 | part2:metal (0.0) | yes |
| part8:metal | (-0.009, 0.074, 0.027) | (0.009, 0.080, 0.034) | 14.0 | part2:metal (0.0) | yes |
| part9:metal | (-0.009, 0.074, 0.043) | (0.009, 0.080, 0.050) | 14.0 | part2:metal (0.0) | yes |
| part10:metal | (-0.009, 0.074, 0.060) | (0.009, 0.080, 0.067) | 14.0 | part2:metal (0.0) | yes |
| part11:metal | (-0.009, 0.074, 0.076) | (0.009, 0.080, 0.083) | 14.0 | part2:metal (0.0) | yes |
| part12:metal | (-0.009, 0.074, 0.093) | (0.009, 0.080, 0.100) | 14.0 | part2:metal (0.0) | yes |
| part13:metal | (-0.009, 0.074, 0.109) | (0.009, 0.080, 0.116) | 14.0 | part2:metal (0.0) | yes |
| part14:metal | (-0.009, 0.074, 0.126) | (0.009, 0.080, 0.133) | 21.0 | part2:metal (0.0) | yes |
| part15:metal | (-0.009, 0.074, 0.142) | (0.009, 0.080, 0.149) | 35.1 | part2:metal (0.0) | yes |
| part16:metal | (-0.009, 0.074, 0.159) | (0.009, 0.080, 0.166) | 50.6 | part2:metal (0.0) | yes |
| part17:metal | (-0.009, 0.074, 0.175) | (0.009, 0.080, 0.182) | 66.6 | part2:metal (0.0) | yes |
| part18:metal | (-0.009, 0.074, 0.192) | (0.009, 0.080, 0.199) | 82.8 | part2:metal (0.0) | yes |
| part19:metal | (-0.009, 0.074, 0.208) | (0.009, 0.080, 0.215) | 99.0 | part2:metal (0.0) | yes |
| part20:polymer | (-0.018, 0.022, 0.100) | (0.018, 0.066, 0.220) | 0.0 | part0:metal (0.0) | yes |
| part21:metal | (-0.019, 0.036, 0.123) | (0.019, 0.052, 0.127) | 13.0 | part20:polymer (0.0) | yes |
| part22:metal | (-0.019, 0.036, 0.143) | (0.019, 0.052, 0.147) | 33.0 | part20:polymer (0.0) | yes |
| part23:metal | (-0.019, 0.036, 0.163) | (0.019, 0.052, 0.167) | 53.0 | part20:polymer (0.0) | yes |
| part24:metal | (-0.019, 0.036, 0.183) | (0.019, 0.052, 0.187) | 73.0 | part20:polymer (0.0) | yes |
| part25:metal | (-0.019, 0.036, 0.203) | (0.019, 0.052, 0.207) | 93.0 | part20:polymer (0.0) | yes |
| part26:steel | (-0.007, 0.043, 0.200) | (0.007, 0.057, 0.280) | 90.0 | part20:polymer (0.0) | yes |
| part27:polymer | (-0.015, 0.035, 0.220) | (0.015, 0.065, 0.280) | 110.0 | part20:polymer (0.0) | yes |
| part28:steel | (-0.017, 0.033, 0.220) | (0.017, 0.067, 0.228) | 110.0 | part2:metal (0.0) | yes |
| part29:steel | (-0.013, 0.037, 0.275) | (0.013, 0.063, 0.281) | 165.0 | part26:steel (0.0) | yes |
| part30:polymer | (-0.014, -0.083, -0.040) | (0.014, 0.003, 0.000) | 0.0 | part0:metal (0.0) | yes |
| part31:rubber | (-0.016, -0.018, -0.042) | (0.016, -0.010, 0.002) | 10.5 | part30:polymer (0.0) | yes |
| part32:rubber | (-0.016, -0.044, -0.042) | (0.016, -0.036, 0.002) | 36.0 | part30:polymer (0.0) | yes |
| part33:rubber | (-0.016, -0.070, -0.042) | (0.016, -0.061, 0.002) | 61.5 | part30:polymer (0.0) | yes |
| part34:steel | (-0.015, 0.014, -0.094) | (0.015, 0.050, -0.070) | 0.0 | part35:steel (0.0) | yes |
| part35:steel | (-0.015, 0.042, -0.262) | (-0.009, 0.048, -0.092) | 22.0 | part34:steel (0.0) | yes |
| part36:steel | (0.009, 0.042, -0.262) | (0.015, 0.048, -0.092) | 22.0 | part34:steel (0.0) | yes |
| part37:steel | (-0.003, 0.017, -0.262) | (0.003, 0.023, -0.092) | 22.0 | part34:steel (0.0) | yes |
| part38:polymer | (-0.015, 0.005, -0.270) | (0.015, 0.059, -0.260) | 190.0 | part35:steel (0.0) | yes |
| part39:metal | (-0.010, 0.074, 0.150) | (0.010, 0.082, 0.170) | 42.4 | part2:metal (0.0) | yes |
| part40:steel | (-0.002, 0.076, 0.158) | (0.002, 0.090, 0.162) | 50.6 | part16:metal (0.0) | yes |
| part41:metal | (-0.013, 0.074, 0.155) | (-0.009, 0.092, 0.165) | 47.1 | part2:metal (0.0) | yes |
| part42:metal | (0.009, 0.074, 0.155) | (0.013, 0.092, 0.165) | 47.1 | part2:metal (0.0) | yes |
| part43:polymer | (-0.011, 0.074, -0.025) | (0.011, 0.088, 0.005) | 14.0 | part2:metal (0.0) | yes |
| part44:metal | (-0.011, 0.084, -0.008) | (0.011, 0.088, -0.002) | 24.0 | part43:polymer (0.0) | yes |
| part45:metal | (-0.013, 0.084, -0.008) | (-0.009, 0.108, -0.002) | 24.0 | part43:polymer (0.0) | yes |
| part46:metal | (0.009, 0.084, -0.008) | (0.013, 0.108, -0.002) | 24.0 | part43:polymer (0.0) | yes |
| part47:brass | (0.011, 0.076, -0.019) | (0.017, 0.084, -0.011) | 16.0 | part43:polymer (0.0) | yes |
| part48:steel | (0.022, 0.036, 0.060) | (0.026, 0.054, 0.100) | 0.0 | part0:metal (0.0) | yes |
| part49:steel | (-0.040, 0.039, 0.014) | (-0.012, 0.051, 0.026) | 0.0 | part0:metal (0.0) | yes |
| part50:brass | (-0.004, -0.008, 0.010) | (0.004, 0.022, 0.030) | 0.0 | part0:metal (0.0) | yes |
| part51:metal | (-0.010, -0.017, 0.010) | (0.010, -0.013, 0.040) | 13.0 | part52:metal (0.0) | yes |
| part52:metal | (-0.010, -0.015, 0.038) | (0.010, 0.013, 0.042) | 0.0 | part0:metal (0.0) | yes |
| part53:steel | (-0.027, 0.013, -0.057) | (-0.021, 0.027, -0.043) | 0.0 | part0:metal (0.0) | yes |
| mag0:polymer | (-0.012, -0.080, 0.041) | (0.012, -0.000, 0.079) | 0.0 | part52:metal (0.0) | yes |
| mag1:polymer | (-0.012, -0.167, 0.042) | (0.012, -0.069, 0.105) | 69.4 | mag0:polymer (0.0) | yes |
| mag2:rubber | (-0.013, -0.173, 0.068) | (0.013, -0.155, 0.107) | 155.1 | mag1:polymer (0.0) | yes |
| mag3:metal | (-0.013, -0.077, 0.040) | (0.013, -0.073, 0.080) | 73.0 | mag0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part0:metal |
| muzzle | (0.000, 0.050, 0.280) | — | 0.0 | yes | no barrel part named; nearest part27:polymer |
| aimPoint | (0.000, 0.092, 0.160) | — | 2.0 | yes | no sight part named; nearest part40:steel |
| eject | (0.030, 0.050, 0.080) | — | 4.0 | yes | no ejection port named; nearest part48:steel |
| magazine | (0.000, -0.086, 0.074) | part51:metal | 0.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, 0.006, 0.155) | part20:polymer | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## rifle (procedural) — PASS
receiver: `part0:metal`; gun box (-0.035, -0.196, -0.370) … (0.036, 0.117, 0.805) (71.0 × 313.0 × 1175.0 mm); 78 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.025, 0.007, -0.050) | (0.025, 0.082, 0.370) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.011, 0.081, -0.040) | (0.011, 0.089, 0.360) | 0.0 | part0:metal (0.0) | yes |
| part2:metal | (-0.011, 0.089, -0.036) | (0.011, 0.095, -0.029) | 6.5 | part1:metal (0.0) | yes |
| part3:metal | (-0.011, 0.089, -0.019) | (0.011, 0.095, -0.012) | 6.5 | part1:metal (0.0) | yes |
| part4:metal | (-0.011, 0.089, -0.002) | (0.011, 0.095, 0.005) | 6.5 | part1:metal (0.0) | yes |
| part5:metal | (-0.011, 0.089, 0.014) | (0.011, 0.095, 0.021) | 6.5 | part1:metal (0.0) | yes |
| part6:metal | (-0.011, 0.089, 0.031) | (0.011, 0.095, 0.038) | 6.5 | part1:metal (0.0) | yes |
| part7:metal | (-0.011, 0.089, 0.048) | (0.011, 0.095, 0.055) | 6.5 | part1:metal (0.0) | yes |
| part8:metal | (-0.011, 0.089, 0.064) | (0.011, 0.095, 0.071) | 6.5 | part1:metal (0.0) | yes |
| part9:metal | (-0.011, 0.089, 0.081) | (0.011, 0.095, 0.088) | 6.5 | part1:metal (0.0) | yes |
| part10:metal | (-0.011, 0.089, 0.098) | (0.011, 0.095, 0.105) | 6.5 | part1:metal (0.0) | yes |
| part11:metal | (-0.011, 0.089, 0.114) | (0.011, 0.095, 0.121) | 6.5 | part1:metal (0.0) | yes |
| part12:metal | (-0.011, 0.089, 0.131) | (0.011, 0.095, 0.138) | 6.5 | part1:metal (0.0) | yes |
| part13:metal | (-0.011, 0.089, 0.148) | (0.011, 0.095, 0.155) | 6.5 | part1:metal (0.0) | yes |
| part14:metal | (-0.011, 0.089, 0.164) | (0.011, 0.095, 0.171) | 6.5 | part1:metal (0.0) | yes |
| part15:metal | (-0.011, 0.089, 0.181) | (0.011, 0.095, 0.188) | 6.5 | part1:metal (0.0) | yes |
| part16:metal | (-0.011, 0.089, 0.198) | (0.011, 0.095, 0.205) | 6.5 | part1:metal (0.0) | yes |
| part17:metal | (-0.011, 0.089, 0.214) | (0.011, 0.095, 0.221) | 6.5 | part1:metal (0.0) | yes |
| part18:metal | (-0.011, 0.089, 0.231) | (0.011, 0.095, 0.238) | 6.5 | part1:metal (0.0) | yes |
| part19:metal | (-0.011, 0.089, 0.248) | (0.011, 0.095, 0.255) | 6.5 | part1:metal (0.0) | yes |
| part20:metal | (-0.011, 0.089, 0.265) | (0.011, 0.095, 0.272) | 6.5 | part1:metal (0.0) | yes |
| part21:metal | (-0.011, 0.089, 0.281) | (0.011, 0.095, 0.288) | 6.5 | part1:metal (0.0) | yes |
| part22:metal | (-0.011, 0.089, 0.298) | (0.011, 0.095, 0.305) | 6.5 | part1:metal (0.0) | yes |
| part23:metal | (-0.011, 0.089, 0.314) | (0.011, 0.095, 0.321) | 6.5 | part1:metal (0.0) | yes |
| part24:metal | (-0.011, 0.089, 0.331) | (0.011, 0.095, 0.338) | 6.5 | part1:metal (0.0) | yes |
| part25:metal | (-0.011, 0.089, 0.348) | (0.011, 0.095, 0.355) | 6.5 | part1:metal (0.0) | yes |
| part26:polymer | (-0.023, -0.025, -0.040) | (0.023, 0.025, 0.240) | 0.0 | part0:metal (0.0) | yes |
| part27:tan | (-0.022, 0.020, 0.370) | (0.022, 0.070, 0.630) | 0.0 | part0:metal (0.0) | yes |
| part28:metal | (-0.010, 0.068, 0.400) | (0.010, 0.076, 0.620) | 30.0 | part27:tan (0.0) | yes |
| part29:metal | (-0.010, 0.076, 0.405) | (0.010, 0.082, 0.412) | 34.5 | part28:metal (0.0) | yes |
| part30:metal | (-0.010, 0.076, 0.421) | (0.010, 0.082, 0.428) | 51.4 | part28:metal (0.0) | yes |
| part31:metal | (-0.010, 0.076, 0.438) | (0.010, 0.082, 0.445) | 68.3 | part28:metal (0.0) | yes |
| part32:metal | (-0.010, 0.076, 0.455) | (0.010, 0.082, 0.462) | 85.3 | part28:metal (0.0) | yes |
| part33:metal | (-0.010, 0.076, 0.472) | (0.010, 0.082, 0.479) | 102.2 | part28:metal (0.0) | yes |
| part34:metal | (-0.010, 0.076, 0.489) | (0.010, 0.082, 0.496) | 119.1 | part28:metal (0.0) | yes |
| part35:metal | (-0.010, 0.076, 0.506) | (0.010, 0.082, 0.513) | 136.0 | part28:metal (0.0) | yes |
| part36:metal | (-0.010, 0.076, 0.523) | (0.010, 0.082, 0.530) | 153.0 | part28:metal (0.0) | yes |
| part37:metal | (-0.010, 0.076, 0.540) | (0.010, 0.082, 0.547) | 169.9 | part28:metal (0.0) | yes |
| part38:metal | (-0.010, 0.076, 0.557) | (0.010, 0.082, 0.564) | 186.8 | part28:metal (0.0) | yes |
| part39:metal | (-0.010, 0.076, 0.574) | (0.010, 0.082, 0.581) | 203.7 | part28:metal (0.0) | yes |
| part40:metal | (-0.010, 0.076, 0.591) | (0.010, 0.082, 0.598) | 220.7 | part28:metal (0.0) | yes |
| part41:metal | (-0.010, 0.076, 0.608) | (0.010, 0.082, 0.615) | 237.6 | part28:metal (0.0) | yes |
| part42:metal | (-0.024, 0.027, 0.390) | (0.024, 0.033, 0.410) | 20.0 | part27:tan (0.0) | yes |
| part43:metal | (-0.024, 0.027, 0.440) | (0.024, 0.033, 0.460) | 70.0 | part27:tan (0.0) | yes |
| part44:metal | (-0.024, 0.027, 0.490) | (0.024, 0.033, 0.510) | 120.0 | part27:tan (0.0) | yes |
| part45:metal | (-0.024, 0.027, 0.540) | (0.024, 0.033, 0.560) | 170.0 | part27:tan (0.0) | yes |
| part46:metal | (-0.024, 0.027, 0.590) | (0.024, 0.033, 0.610) | 220.0 | part27:tan (0.0) | yes |
| part47:steel | (-0.008, 0.047, 0.620) | (0.008, 0.063, 0.780) | 250.0 | part27:tan (0.0) | yes |
| part48:steel | (-0.012, 0.043, 0.755) | (0.012, 0.067, 0.805) | 385.0 | part47:steel (0.0) | yes |
| part49:metal | (-0.013, 0.053, 0.762) | (0.013, 0.057, 0.768) | 392.0 | part47:steel (0.0) | yes |
| part50:metal | (-0.013, 0.053, 0.777) | (0.013, 0.057, 0.783) | 407.0 | part47:steel (0.0) | yes |
| part51:metal | (-0.013, 0.053, 0.792) | (0.013, 0.057, 0.798) | 422.0 | part48:steel (0.0) | yes |
| part52:polymer | (-0.017, -0.110, -0.025) | (0.017, -0.010, 0.025) | 17.5 | part26:polymer (0.0) | yes |
| part53:rubber | (-0.019, -0.034, -0.027) | (0.019, -0.026, 0.027) | 33.5 | part52:polymer (0.0) | yes |
| part54:rubber | (-0.019, -0.064, -0.027) | (0.019, -0.056, 0.027) | 63.5 | part52:polymer (0.0) | yes |
| part55:rubber | (-0.019, -0.094, -0.027) | (0.019, -0.086, 0.027) | 93.5 | part52:polymer (0.0) | yes |
| part56:tan | (-0.020, 0.000, -0.360) | (0.020, 0.060, -0.120) | 70.0 | part57:rubber (0.0) | yes |
| part57:rubber | (-0.022, -0.005, -0.370) | (0.022, 0.065, -0.350) | 300.0 | part56:tan (0.0) | yes |
| part58:polymer | (-0.010, -0.005, -0.250) | (0.010, 0.015, -0.050) | 0.0 | part0:metal (0.0) | yes |
| part59:metal | (-0.010, 0.076, 0.540) | (0.010, 0.084, 0.560) | 170.0 | part28:metal (0.0) | yes |
| part60:steel | (-0.002, 0.078, 0.548) | (0.002, 0.115, 0.552) | 178.0 | part59:metal (0.0) | yes |
| part61:metal | (-0.013, 0.076, 0.545) | (-0.009, 0.117, 0.555) | 175.0 | part28:metal (0.0) | yes |
| part62:metal | (0.009, 0.076, 0.545) | (0.013, 0.117, 0.555) | 175.0 | part28:metal (0.0) | yes |
| part63:metal | (-0.013, 0.089, 0.042) | (0.013, 0.095, 0.058) | 6.5 | part1:metal (0.0) | yes |
| part64:metal | (-0.011, 0.089, 0.047) | (-0.006, 0.115, 0.053) | 6.5 | part1:metal (0.0) | yes |
| part65:metal | (0.006, 0.089, 0.047) | (0.011, 0.115, 0.053) | 6.5 | part1:metal (0.0) | yes |
| part66:metal | (-0.011, 0.092, 0.047) | (0.011, 0.096, 0.053) | 9.5 | part7:metal (0.0) | yes |
| part67:steel | (0.024, 0.051, 0.180) | (0.028, 0.069, 0.220) | 0.0 | part0:metal (0.0) | yes |
| part68:steel | (-0.035, 0.069, -0.046) | (-0.005, 0.081, -0.034) | 0.0 | part0:metal (0.0) | yes |
| part69:steel | (0.024, 0.015, 0.107) | (0.036, 0.045, 0.133) | 0.0 | part0:metal (0.0) | yes |
| part70:brass | (-0.004, -0.023, 0.050) | (0.004, 0.007, 0.070) | 0.5 | part26:polymer (0.0) | yes |
| part71:metal | (-0.010, -0.032, 0.040) | (0.010, -0.028, 0.090) | 35.5 | part72:metal (0.0) | yes |
| part72:metal | (-0.010, -0.030, 0.088) | (0.010, -0.002, 0.092) | 9.5 | part26:polymer (0.0) | yes |
| part73:steel | (-0.027, 0.013, -0.307) | (-0.021, 0.027, -0.293) | 243.0 | part56:tan (1.0) | yes |
| part74:steel | (0.021, 0.023, 0.593) | (0.027, 0.037, 0.607) | 223.0 | part27:tan (0.0) | yes |
| mag0:polymer | (-0.015, -0.190, 0.165) | (0.015, -0.010, 0.235) | 17.5 | part26:polymer (0.0) | yes |
| mag1:rubber | (-0.016, -0.196, 0.164) | (0.016, -0.188, 0.236) | 195.5 | mag0:polymer (0.0) | yes |
| mag2:metal | (-0.015, -0.132, 0.170) | (0.015, -0.128, 0.230) | 135.5 | mag0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part26:polymer |
| muzzle | (0.000, 0.055, 0.800) | — | 0.0 | yes | no barrel part named; nearest part48:steel |
| aimPoint | (0.000, 0.117, 0.550) | — | 2.0 | yes | no sight part named; nearest part60:steel |
| eject | (0.030, 0.060, 0.200) | — | 2.0 | yes | no ejection port named; nearest part67:steel |
| magazine | (0.000, -0.103, 0.200) | part26:polymer | 0.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, -0.009, 0.360) | part0:metal | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## lmg (procedural) — PASS
receiver: `part0:metal`; gun box (-0.066, -0.155, -0.400) … (0.053, 0.142, 0.790) (119.0 × 297.0 × 1190.0 mm); 52 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.028, 0.002, -0.050) | (0.028, 0.087, 0.410) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.025, 0.085, 0.060) | (0.025, 0.115, 0.260) | 0.0 | part0:metal (0.0) | yes |
| part2:metal | (-0.011, 0.114, 0.060) | (0.011, 0.122, 0.260) | 26.5 | part1:metal (0.0) | yes |
| part3:metal | (-0.011, 0.122, 0.065) | (0.011, 0.128, 0.072) | 34.5 | part2:metal (0.0) | yes |
| part4:metal | (-0.011, 0.122, 0.081) | (0.011, 0.128, 0.088) | 34.5 | part2:metal (0.0) | yes |
| part5:metal | (-0.011, 0.122, 0.098) | (0.011, 0.128, 0.105) | 34.5 | part2:metal (0.0) | yes |
| part6:metal | (-0.011, 0.122, 0.115) | (0.011, 0.128, 0.122) | 34.5 | part2:metal (0.0) | yes |
| part7:metal | (-0.011, 0.122, 0.131) | (0.011, 0.128, 0.138) | 34.5 | part2:metal (0.0) | yes |
| part8:metal | (-0.011, 0.122, 0.148) | (0.011, 0.128, 0.155) | 34.5 | part2:metal (0.0) | yes |
| part9:metal | (-0.011, 0.122, 0.165) | (0.011, 0.128, 0.172) | 34.5 | part2:metal (0.0) | yes |
| part10:metal | (-0.011, 0.122, 0.181) | (0.011, 0.128, 0.188) | 34.5 | part2:metal (0.0) | yes |
| part11:metal | (-0.011, 0.122, 0.198) | (0.011, 0.128, 0.205) | 34.5 | part2:metal (0.0) | yes |
| part12:metal | (-0.011, 0.122, 0.214) | (0.011, 0.128, 0.222) | 34.5 | part2:metal (0.0) | yes |
| part13:metal | (-0.011, 0.122, 0.231) | (0.011, 0.128, 0.238) | 34.5 | part2:metal (0.0) | yes |
| part14:metal | (-0.011, 0.122, 0.248) | (0.011, 0.128, 0.255) | 34.5 | part2:metal (0.0) | yes |
| part15:steel | (-0.011, 0.044, 0.450) | (0.011, 0.066, 0.750) | 40.0 | part16:metal (0.0) | yes |
| part16:metal | (-0.015, 0.040, 0.497) | (0.015, 0.070, 0.503) | 87.0 | part15:steel (0.0) | yes |
| part17:metal | (-0.015, 0.040, 0.537) | (0.015, 0.070, 0.543) | 127.0 | part15:steel (0.0) | yes |
| part18:metal | (-0.015, 0.040, 0.577) | (0.015, 0.070, 0.583) | 167.0 | part15:steel (0.0) | yes |
| part19:metal | (-0.015, 0.040, 0.617) | (0.015, 0.070, 0.623) | 207.0 | part15:steel (0.0) | yes |
| part20:steel | (-0.015, 0.040, 0.730) | (0.015, 0.070, 0.790) | 320.0 | part15:steel (0.0) | yes |
| part21:metal | (-0.017, 0.053, 0.737) | (0.017, 0.057, 0.743) | 327.0 | part15:steel (0.0) | yes |
| part22:metal | (-0.017, 0.053, 0.757) | (0.017, 0.057, 0.763) | 347.0 | part20:steel (0.0) | yes |
| part23:metal | (-0.017, 0.053, 0.777) | (0.017, 0.057, 0.783) | 367.0 | part20:steel (0.0) | yes |
| part24:polymer | (-0.025, 0.015, 0.370) | (0.025, 0.045, 0.630) | 0.0 | part0:metal (0.0) | yes |
| part25:steel | (0.024, -0.130, 0.614) | (0.036, 0.030, 0.626) | 204.0 | part24:polymer (0.0) | yes |
| part26:steel | (-0.036, -0.130, 0.614) | (-0.024, 0.030, 0.626) | 204.0 | part24:polymer (0.0) | yes |
| part27:rubber | (-0.030, -0.155, 0.605) | (0.030, -0.125, 0.635) | 233.0 | part25:steel (0.0) | yes |
| part28:polymer | (-0.018, -0.100, -0.025) | (0.018, 0.000, 0.025) | 2.5 | part29:rubber (0.0) | yes |
| part29:rubber | (-0.020, -0.024, -0.027) | (0.020, -0.016, 0.027) | 18.5 | part28:polymer (0.0) | yes |
| part30:rubber | (-0.020, -0.054, -0.027) | (0.020, -0.046, 0.027) | 48.5 | part28:polymer (0.0) | yes |
| part31:rubber | (-0.020, -0.084, -0.027) | (0.020, -0.076, 0.027) | 78.5 | part28:polymer (0.0) | yes |
| part32:polymer | (-0.022, -0.010, -0.390) | (0.022, 0.070, -0.050) | 0.0 | part0:metal (0.0) | yes |
| part33:rubber | (-0.024, -0.015, -0.400) | (0.024, 0.075, -0.380) | 330.0 | part32:polymer (0.0) | yes |
| part34:steel | (-0.030, 0.080, 0.035) | (0.030, 0.100, 0.085) | 0.0 | part0:metal (0.0) | yes |
| part35:polymer | (-0.006, 0.100, 0.000) | (0.006, 0.130, 0.120) | 12.5 | part1:metal (0.0) | yes |
| part36:metal | (-0.010, 0.066, 0.450) | (0.010, 0.074, 0.470) | 40.0 | part15:steel (0.0) | yes |
| part37:steel | (-0.002, 0.068, 0.458) | (0.002, 0.140, 0.462) | 48.0 | part36:metal (0.0) | yes |
| part38:metal | (-0.013, 0.066, 0.455) | (-0.009, 0.142, 0.465) | 45.0 | part15:steel (0.0) | yes |
| part39:metal | (0.009, 0.066, 0.455) | (0.013, 0.142, 0.465) | 45.0 | part15:steel (0.0) | yes |
| part40:metal | (-0.013, 0.115, 0.052) | (0.013, 0.121, 0.068) | 27.5 | part1:metal (0.0) | yes |
| part41:metal | (-0.011, 0.115, 0.057) | (-0.006, 0.140, 0.063) | 27.5 | part1:metal (0.0) | yes |
| part42:metal | (0.006, 0.115, 0.057) | (0.011, 0.140, 0.063) | 27.5 | part1:metal (0.0) | yes |
| part43:metal | (-0.011, 0.118, 0.057) | (0.011, 0.122, 0.063) | 30.5 | part2:metal (0.0) | yes |
| part44:steel | (0.027, 0.041, 0.180) | (0.031, 0.059, 0.220) | 0.0 | part0:metal (0.0) | yes |
| part45:steel | (0.023, 0.054, -0.006) | (0.053, 0.066, 0.006) | 0.0 | part0:metal (0.0) | yes |
| part46:brass | (-0.004, -0.023, 0.050) | (0.004, 0.007, 0.070) | 0.0 | part0:metal (0.0) | yes |
| part47:metal | (-0.010, -0.032, 0.040) | (0.010, -0.028, 0.090) | 30.5 | part48:metal (0.0) | yes |
| part48:metal | (-0.010, -0.030, 0.088) | (0.010, -0.002, 0.092) | 4.5 | part47:metal (0.0) | yes |
| mag0:polymer | (-0.065, -0.115, 0.115) | (0.025, -0.005, 0.245) | 7.5 | mag1:brass (0.0) | yes |
| mag1:brass | (-0.060, -0.015, 0.130) | (0.020, 0.005, 0.230) | 0.0 | part0:metal (0.0) | yes |
| mag2:rubber | (-0.066, -0.108, 0.114) | (0.026, -0.102, 0.246) | 104.5 | mag0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part28:polymer |
| muzzle | (0.000, 0.055, 0.790) | — | 0.0 | yes | no barrel part named; nearest part20:steel |
| aimPoint | (0.000, 0.142, 0.460) | — | 2.0 | yes | no sight part named; nearest part37:steel |
| eject | (0.035, 0.060, 0.200) | — | 4.1 | yes | no ejection port named; nearest part44:steel |
| magazine | (-0.020, -0.055, 0.180) | part0:metal | 0.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, -0.014, 0.360) | part0:metal | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## shotgun (procedural) — PASS
receiver: `part0:steel`; gun box (-0.027, -0.100, -0.390) … (0.028, 0.092, 0.700) (55.0 × 192.5 × 1090.0 mm); 25 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:steel | (-0.025, 0.005, -0.050) | (0.025, 0.075, 0.250) | 0.0 | part1:steel (0.0) | yes |
| part1:steel | (-0.017, 0.043, 0.200) | (0.017, 0.077, 0.700) | 0.0 | part0:steel (0.0) | yes |
| part2:steel | (-0.018, 0.002, 0.190) | (0.018, 0.038, 0.610) | 0.0 | part0:steel (0.0) | yes |
| part3:metal | (-0.020, 0.000, 0.590) | (0.020, 0.040, 0.610) | 340.0 | part2:steel (0.0) | yes |
| part4:steel | (-0.007, 0.073, 0.200) | (0.007, 0.083, 0.600) | 0.0 | part0:steel (0.0) | yes |
| part5:wood | (-0.018, -0.100, -0.045) | (0.018, 0.000, 0.005) | 5.0 | part6:rubber (0.0) | yes |
| part6:rubber | (-0.020, -0.024, -0.047) | (0.020, -0.016, 0.007) | 21.0 | part5:wood (0.0) | yes |
| part7:rubber | (-0.020, -0.054, -0.047) | (0.020, -0.046, 0.007) | 51.0 | part5:wood (0.0) | yes |
| part8:rubber | (-0.020, -0.084, -0.047) | (0.020, -0.076, 0.007) | 81.0 | part5:wood (0.0) | yes |
| part9:wood | (-0.020, -0.010, -0.380) | (0.020, 0.060, -0.050) | 0.0 | part0:steel (0.0) | yes |
| part10:rubber | (-0.022, -0.015, -0.390) | (0.022, 0.065, -0.370) | 320.0 | part9:wood (0.0) | yes |
| part11:brass | (-0.005, 0.078, 0.675) | (0.005, 0.092, 0.685) | 425.0 | part1:steel (0.5) | yes |
| part12:steel | (0.024, 0.036, 0.060) | (0.028, 0.054, 0.100) | 0.0 | part0:steel (0.0) | yes |
| part13:steel | (-0.006, -0.010, -0.035) | (0.006, 0.020, -0.005) | 0.0 | part0:steel (0.0) | yes |
| part14:brass | (-0.004, -0.013, 0.010) | (0.004, 0.017, 0.030) | 0.0 | part0:steel (0.0) | yes |
| part15:metal | (-0.010, -0.022, 0.000) | (0.010, -0.018, 0.050) | 23.0 | part5:wood (0.0) | yes |
| part16:metal | (-0.010, -0.020, 0.048) | (0.010, 0.008, 0.052) | 0.0 | part0:steel (0.0) | yes |
| part17:steel | (-0.027, -0.007, -0.307) | (-0.021, 0.007, -0.293) | 243.0 | part9:wood (1.0) | yes |
| action0:wood | (-0.025, -0.020, 0.340) | (0.025, 0.030, 0.500) | 90.0 | part2:steel (0.0) | yes |
| action1:rubber | (-0.026, 0.003, 0.357) | (0.026, 0.007, 0.363) | 107.0 | part2:steel (0.0) | yes |
| action2:rubber | (-0.026, 0.003, 0.381) | (0.026, 0.007, 0.387) | 131.0 | part2:steel (0.0) | yes |
| action3:rubber | (-0.026, 0.003, 0.405) | (0.026, 0.007, 0.411) | 155.0 | part2:steel (0.0) | yes |
| action4:rubber | (-0.026, 0.003, 0.429) | (0.026, 0.007, 0.435) | 179.0 | part2:steel (0.0) | yes |
| action5:rubber | (-0.026, 0.003, 0.453) | (0.026, 0.007, 0.459) | 203.0 | part2:steel (0.0) | yes |
| action6:rubber | (-0.026, 0.003, 0.477) | (0.026, 0.007, 0.483) | 227.0 | part2:steel (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part5:wood |
| muzzle | (0.000, 0.060, 0.700) | — | 0.0 | yes | no barrel part named; nearest part1:steel |
| aimPoint | (0.000, 0.094, 0.680) | — | 1.5 | yes | no sight part named; nearest part11:brass |
| eject | (0.030, 0.055, 0.080) | — | 2.2 | yes | no ejection port named; nearest part12:steel |
| supportHand | (-0.030, -0.036, 0.360) | action0:wood | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## dmr (procedural) — PASS
receiver: `part0:metal`; gun box (-0.027, -0.146, -0.430) … (0.048, 0.140, 0.970) (75.0 × 286.0 × 1400.0 mm); 64 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.024, 0.005, -0.050) | (0.024, 0.075, 0.350) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.011, 0.074, -0.020) | (0.011, 0.082, 0.240) | 0.0 | part0:metal (0.0) | yes |
| part2:metal | (-0.011, 0.082, -0.015) | (0.011, 0.088, -0.009) | 7.0 | part1:metal (0.0) | yes |
| part3:metal | (-0.011, 0.082, 0.001) | (0.011, 0.088, 0.008) | 7.0 | part1:metal (0.0) | yes |
| part4:metal | (-0.011, 0.082, 0.017) | (0.011, 0.088, 0.024) | 7.0 | part1:metal (0.0) | yes |
| part5:metal | (-0.011, 0.082, 0.033) | (0.011, 0.088, 0.040) | 7.0 | part1:metal (0.0) | yes |
| part6:metal | (-0.011, 0.082, 0.050) | (0.011, 0.088, 0.057) | 7.0 | part1:metal (0.0) | yes |
| part7:metal | (-0.011, 0.082, 0.066) | (0.011, 0.088, 0.073) | 7.0 | part1:metal (0.0) | yes |
| part8:metal | (-0.011, 0.082, 0.082) | (0.011, 0.088, 0.089) | 7.0 | part1:metal (0.0) | yes |
| part9:metal | (-0.011, 0.082, 0.098) | (0.011, 0.088, 0.105) | 7.0 | part1:metal (0.0) | yes |
| part10:metal | (-0.011, 0.082, 0.115) | (0.011, 0.088, 0.122) | 7.0 | part1:metal (0.0) | yes |
| part11:metal | (-0.011, 0.082, 0.131) | (0.011, 0.088, 0.138) | 7.0 | part1:metal (0.0) | yes |
| part12:metal | (-0.011, 0.082, 0.147) | (0.011, 0.088, 0.154) | 7.0 | part1:metal (0.0) | yes |
| part13:metal | (-0.011, 0.082, 0.163) | (0.011, 0.088, 0.170) | 7.0 | part1:metal (0.0) | yes |
| part14:metal | (-0.011, 0.082, 0.179) | (0.011, 0.088, 0.186) | 7.0 | part1:metal (0.0) | yes |
| part15:metal | (-0.011, 0.082, 0.196) | (0.011, 0.088, 0.203) | 7.0 | part1:metal (0.0) | yes |
| part16:metal | (-0.011, 0.082, 0.212) | (0.011, 0.088, 0.219) | 7.0 | part1:metal (0.0) | yes |
| part17:metal | (-0.011, 0.082, 0.228) | (0.011, 0.088, 0.235) | 7.0 | part1:metal (0.0) | yes |
| part18:metal | (-0.025, -0.010, 0.160) | (0.025, 0.010, 0.240) | 0.0 | part0:metal (0.0) | yes |
| part19:wood | (-0.018, -0.025, -0.150) | (0.018, 0.025, 0.090) | 0.0 | part0:metal (0.0) | yes |
| part20:wood | (-0.023, -0.022, 0.260) | (0.023, 0.033, 0.540) | 0.0 | part0:metal (0.0) | yes |
| part21:polymer | (-0.021, 0.032, 0.320) | (0.021, 0.048, 0.560) | 0.0 | part0:metal (0.0) | yes |
| part22:metal | (-0.022, 0.040, 0.344) | (0.022, 0.044, 0.356) | 0.0 | part0:metal (0.0) | yes |
| part23:metal | (-0.022, 0.040, 0.389) | (0.022, 0.044, 0.401) | 39.0 | part21:polymer (0.0) | yes |
| part24:metal | (-0.022, 0.040, 0.434) | (0.022, 0.044, 0.446) | 84.0 | part21:polymer (0.0) | yes |
| part25:metal | (-0.022, 0.040, 0.479) | (0.022, 0.044, 0.491) | 129.0 | part21:polymer (0.0) | yes |
| part26:metal | (-0.022, 0.040, 0.524) | (0.022, 0.044, 0.536) | 174.0 | part21:polymer (0.0) | yes |
| part27:steel | (-0.009, 0.046, 0.520) | (0.009, 0.064, 0.920) | 170.0 | part21:polymer (0.0) | yes |
| part28:steel | (-0.010, 0.022, 0.530) | (0.010, 0.042, 0.650) | 180.0 | part20:wood (0.0) | yes |
| part29:metal | (-0.008, 0.064, 0.895) | (0.008, 0.072, 0.915) | 545.0 | part30:steel (0.0) | yes |
| part30:steel | (-0.002, 0.072, 0.902) | (0.002, 0.086, 0.908) | 552.0 | part29:metal (0.0) | yes |
| part31:steel | (-0.012, 0.043, 0.910) | (0.012, 0.067, 0.970) | 560.0 | part27:steel (0.0) | yes |
| part32:polymer | (-0.013, 0.053, 0.930) | (0.013, 0.057, 0.970) | 580.0 | part31:steel (0.0) | yes |
| part33:polymer | (-0.002, 0.042, 0.930) | (0.002, 0.068, 0.970) | 580.0 | part31:steel (0.0) | yes |
| part34:wood | (-0.017, -0.100, -0.035) | (0.017, 0.000, 0.015) | 5.0 | part19:wood (0.0) | yes |
| part35:rubber | (-0.019, -0.024, -0.037) | (0.019, -0.016, 0.017) | 21.0 | part19:wood (0.0) | yes |
| part36:rubber | (-0.019, -0.054, -0.037) | (0.019, -0.046, 0.017) | 51.0 | part34:wood (0.0) | yes |
| part37:rubber | (-0.019, -0.084, -0.037) | (0.019, -0.076, 0.017) | 81.0 | part34:wood (0.0) | yes |
| part38:wood | (-0.022, -0.025, -0.420) | (0.022, 0.055, -0.120) | 70.0 | part19:wood (0.0) | yes |
| part39:wood | (-0.019, 0.053, -0.340) | (0.019, 0.079, -0.180) | 130.0 | part38:wood (0.0) | yes |
| part40:rubber | (-0.020, 0.078, -0.320) | (0.020, 0.084, -0.220) | 170.0 | part39:wood (0.0) | yes |
| part41:rubber | (-0.024, -0.030, -0.430) | (0.024, 0.060, -0.410) | 360.0 | part38:wood (0.0) | yes |
| part42:metal | (-0.015, 0.095, 0.030) | (0.015, 0.125, 0.190) | 20.0 | part43:metal (0.0) | yes |
| part43:metal | (-0.019, 0.091, 0.178) | (0.019, 0.129, 0.223) | 16.0 | part42:metal (0.0) | yes |
| part44:lens | (-0.015, 0.095, 0.222) | (0.015, 0.125, 0.226) | 19.8 | part43:metal (0.0) | yes |
| part45:metal | (-0.017, 0.093, 0.002) | (0.017, 0.127, 0.037) | 17.7 | part42:metal (0.0) | yes |
| part46:lens | (-0.013, 0.097, -0.002) | (0.013, 0.123, 0.002) | 21.5 | part45:metal (0.5) | yes |
| part47:steel | (-0.010, 0.122, 0.110) | (0.010, 0.140, 0.130) | 47.0 | part42:metal (0.0) | yes |
| part48:steel | (0.012, 0.100, 0.110) | (0.030, 0.120, 0.130) | 25.0 | part42:metal (0.0) | yes |
| part49:metal | (-0.015, 0.080, 0.059) | (0.015, 0.107, 0.071) | 5.0 | part1:metal (0.0) | yes |
| part50:metal | (-0.015, 0.080, 0.149) | (0.015, 0.107, 0.161) | 5.0 | part1:metal (0.0) | yes |
| part51:metal | (-0.007, 0.078, 0.040) | (0.007, 0.095, 0.090) | 3.0 | part1:metal (0.0) | yes |
| part52:metal | (-0.007, 0.078, 0.130) | (0.007, 0.095, 0.180) | 3.0 | part1:metal (0.0) | yes |
| part53:steel | (0.023, 0.051, 0.180) | (0.027, 0.069, 0.220) | 0.0 | part0:metal (0.0) | yes |
| part54:brass | (-0.004, -0.018, 0.040) | (0.004, 0.012, 0.060) | 0.0 | part0:metal (0.0) | yes |
| part55:metal | (-0.010, -0.027, 0.030) | (0.010, -0.023, 0.080) | 28.0 | part19:wood (0.0) | yes |
| part56:metal | (-0.010, -0.025, 0.078) | (0.010, 0.003, 0.082) | 2.0 | part19:wood (0.0) | yes |
| part57:steel | (-0.027, -0.007, -0.367) | (-0.021, 0.007, -0.353) | 303.0 | part38:wood (0.0) | yes |
| part58:steel | (0.021, -0.027, 0.493) | (0.027, -0.013, 0.507) | 144.1 | part20:wood (0.0) | yes |
| action0:steel | (0.021, 0.053, 0.075) | (0.035, 0.067, 0.125) | 0.0 | part0:metal (0.0) | yes |
| action1:steel | (0.032, 0.041, 0.090) | (0.048, 0.063, 0.110) | 8.0 | action0:steel (0.0) | yes |
| mag0:polymer | (-0.015, -0.140, 0.165) | (0.015, 0.010, 0.235) | 0.0 | part0:metal (0.0) | yes |
| mag1:rubber | (-0.016, -0.146, 0.164) | (0.016, -0.140, 0.236) | 145.0 | mag0:polymer (0.0) | yes |
| mag2:metal | (-0.015, -0.112, 0.170) | (0.015, -0.108, 0.230) | 113.0 | mag0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part19:wood |
| muzzle | (0.000, 0.055, 0.970) | — | 0.0 | yes | no barrel part named; nearest part31:steel |
| aimPoint | (0.000, 0.110, 0.120) | — | 0.0 | yes | no sight part named; nearest part42:metal |
| eject | (0.030, 0.060, 0.200) | — | 3.0 | yes | no ejection port named; nearest part53:steel |
| magazine | (0.000, -0.068, 0.200) | part0:metal | 0.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, -0.038, 0.360) | part20:wood | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## sniper (procedural) — PASS
receiver: `part0:metal`; gun box (-0.028, -0.125, -0.460) … (0.055, 0.150, 1.160) (83.0 × 275.0 × 1620.0 mm); 77 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.023, -0.002, -0.050) | (0.023, 0.073, 0.370) | 0.0 | part1:metal (0.0) | yes |
| part1:metal | (-0.011, 0.071, -0.080) | (0.011, 0.079, 0.340) | 0.0 | part0:metal (0.0) | yes |
| part2:metal | (-0.011, 0.079, -0.076) | (0.011, 0.085, -0.069) | 19.6 | part1:metal (0.0) | yes |
| part3:metal | (-0.011, 0.079, -0.059) | (0.011, 0.085, -0.052) | 6.9 | part1:metal (0.0) | yes |
| part4:metal | (-0.011, 0.079, -0.043) | (0.011, 0.085, -0.036) | 6.5 | part1:metal (0.0) | yes |
| part5:metal | (-0.011, 0.079, -0.027) | (0.011, 0.085, -0.020) | 6.5 | part1:metal (0.0) | yes |
| part6:metal | (-0.011, 0.079, -0.011) | (0.011, 0.085, -0.004) | 6.5 | part1:metal (0.0) | yes |
| part7:metal | (-0.011, 0.079, 0.005) | (0.011, 0.085, 0.012) | 6.5 | part1:metal (0.0) | yes |
| part8:metal | (-0.011, 0.079, 0.021) | (0.011, 0.085, 0.028) | 6.5 | part1:metal (0.0) | yes |
| part9:metal | (-0.011, 0.079, 0.038) | (0.011, 0.085, 0.045) | 6.5 | part1:metal (0.0) | yes |
| part10:metal | (-0.011, 0.079, 0.054) | (0.011, 0.085, 0.061) | 6.5 | part1:metal (0.0) | yes |
| part11:metal | (-0.011, 0.079, 0.070) | (0.011, 0.085, 0.077) | 6.5 | part1:metal (0.0) | yes |
| part12:metal | (-0.011, 0.079, 0.086) | (0.011, 0.085, 0.093) | 6.5 | part1:metal (0.0) | yes |
| part13:metal | (-0.011, 0.079, 0.102) | (0.011, 0.085, 0.109) | 6.5 | part1:metal (0.0) | yes |
| part14:metal | (-0.011, 0.079, 0.118) | (0.011, 0.085, 0.125) | 6.5 | part1:metal (0.0) | yes |
| part15:metal | (-0.011, 0.079, 0.135) | (0.011, 0.085, 0.142) | 6.5 | part1:metal (0.0) | yes |
| part16:metal | (-0.011, 0.079, 0.151) | (0.011, 0.085, 0.158) | 6.5 | part1:metal (0.0) | yes |
| part17:metal | (-0.011, 0.079, 0.167) | (0.011, 0.085, 0.174) | 6.5 | part1:metal (0.0) | yes |
| part18:metal | (-0.011, 0.079, 0.183) | (0.011, 0.085, 0.190) | 6.5 | part1:metal (0.0) | yes |
| part19:metal | (-0.011, 0.079, 0.199) | (0.011, 0.085, 0.206) | 6.5 | part1:metal (0.0) | yes |
| part20:metal | (-0.011, 0.079, 0.215) | (0.011, 0.085, 0.222) | 6.5 | part1:metal (0.0) | yes |
| part21:metal | (-0.011, 0.079, 0.231) | (0.011, 0.085, 0.238) | 6.5 | part1:metal (0.0) | yes |
| part22:metal | (-0.011, 0.079, 0.248) | (0.011, 0.085, 0.255) | 6.5 | part1:metal (0.0) | yes |
| part23:metal | (-0.011, 0.079, 0.264) | (0.011, 0.085, 0.271) | 6.5 | part1:metal (0.0) | yes |
| part24:metal | (-0.011, 0.079, 0.280) | (0.011, 0.085, 0.287) | 6.5 | part1:metal (0.0) | yes |
| part25:metal | (-0.011, 0.079, 0.296) | (0.011, 0.085, 0.303) | 6.5 | part1:metal (0.0) | yes |
| part26:metal | (-0.011, 0.079, 0.312) | (0.011, 0.085, 0.319) | 6.5 | part1:metal (0.0) | yes |
| part27:metal | (-0.011, 0.079, 0.328) | (0.011, 0.085, 0.335) | 6.5 | part1:metal (0.0) | yes |
| part28:tan | (-0.022, -0.035, 0.230) | (0.022, 0.025, 0.650) | 0.0 | part0:metal (0.0) | yes |
| part29:metal | (-0.023, 0.018, 0.308) | (0.023, 0.022, 0.332) | 0.0 | part0:metal (0.0) | yes |
| part30:metal | (-0.023, 0.018, 0.368) | (0.023, 0.022, 0.392) | 0.0 | part0:metal (0.0) | yes |
| part31:metal | (-0.023, 0.018, 0.428) | (0.023, 0.022, 0.452) | 58.0 | part28:tan (0.0) | yes |
| part32:metal | (-0.023, 0.018, 0.488) | (0.023, 0.022, 0.512) | 118.0 | part28:tan (0.0) | yes |
| part33:metal | (-0.023, 0.018, 0.548) | (0.023, 0.022, 0.572) | 178.0 | part28:tan (0.0) | yes |
| part34:steel | (-0.009, 0.046, 0.370) | (0.009, 0.064, 1.100) | 0.0 | part0:metal (0.0) | yes |
| part35:metal | (-0.011, 0.044, 0.654) | (0.011, 0.066, 0.666) | 284.0 | part34:steel (0.0) | yes |
| part36:metal | (-0.011, 0.044, 0.704) | (0.011, 0.066, 0.716) | 334.0 | part34:steel (0.0) | yes |
| part37:metal | (-0.011, 0.044, 0.754) | (0.011, 0.066, 0.766) | 384.0 | part34:steel (0.0) | yes |
| part38:metal | (-0.011, 0.044, 0.804) | (0.011, 0.066, 0.816) | 434.0 | part34:steel (0.0) | yes |
| part39:metal | (-0.011, 0.044, 0.854) | (0.011, 0.066, 0.866) | 484.0 | part34:steel (0.0) | yes |
| part40:metal | (-0.011, 0.044, 0.904) | (0.011, 0.066, 0.916) | 534.0 | part34:steel (0.0) | yes |
| part41:metal | (-0.011, 0.044, 0.954) | (0.011, 0.066, 0.966) | 584.0 | part34:steel (0.0) | yes |
| part42:metal | (-0.011, 0.044, 1.004) | (0.011, 0.066, 1.016) | 634.0 | part34:steel (0.0) | yes |
| part43:steel | (-0.017, 0.038, 1.080) | (0.017, 0.072, 1.160) | 710.0 | part34:steel (0.0) | yes |
| part44:metal | (-0.019, 0.053, 1.087) | (0.019, 0.057, 1.093) | 717.0 | part34:steel (0.0) | yes |
| part45:metal | (-0.019, 0.053, 1.107) | (0.019, 0.057, 1.113) | 737.0 | part43:steel (0.0) | yes |
| part46:metal | (-0.019, 0.053, 1.127) | (0.019, 0.057, 1.133) | 757.0 | part43:steel (0.0) | yes |
| part47:metal | (-0.019, 0.053, 1.147) | (0.019, 0.057, 1.153) | 777.0 | part43:steel (0.0) | yes |
| part48:polymer | (-0.017, -0.100, -0.035) | (0.017, 0.000, 0.015) | 0.0 | part0:metal (0.0) | yes |
| part49:rubber | (-0.019, -0.024, -0.037) | (0.019, -0.016, 0.017) | 13.5 | part48:polymer (0.0) | yes |
| part50:rubber | (-0.019, -0.054, -0.037) | (0.019, -0.046, 0.017) | 43.5 | part48:polymer (0.0) | yes |
| part51:rubber | (-0.019, -0.084, -0.037) | (0.019, -0.076, 0.017) | 73.5 | part48:polymer (0.0) | yes |
| part52:tan | (-0.022, -0.030, -0.440) | (0.022, 0.060, -0.050) | 0.0 | part0:metal (0.0) | yes |
| part53:polymer | (-0.022, 0.050, -0.370) | (0.022, 0.100, -0.270) | 220.0 | part52:tan (0.0) | yes |
| part54:rubber | (-0.024, -0.035, -0.460) | (0.024, 0.065, -0.440) | 390.0 | part52:tan (0.0) | yes |
| part55:polymer | (-0.015, -0.065, -0.425) | (0.015, -0.025, -0.375) | 325.8 | part52:tan (0.0) | yes |
| part56:metal | (-0.020, 0.095, -0.010) | (0.020, 0.135, 0.250) | 22.5 | part57:metal (0.0) | yes |
| part57:metal | (-0.028, 0.087, 0.238) | (0.028, 0.143, 0.283) | 14.5 | part56:metal (0.0) | yes |
| part58:lens | (-0.022, 0.093, 0.282) | (0.022, 0.137, 0.286) | 20.1 | part57:metal (0.0) | yes |
| part59:metal | (-0.023, 0.092, -0.038) | (0.023, 0.138, -0.003) | 19.5 | part56:metal (0.0) | yes |
| part60:lens | (-0.018, 0.097, -0.042) | (0.018, 0.133, -0.038) | 24.5 | part59:metal (0.5) | yes |
| part61:steel | (-0.010, 0.132, 0.120) | (0.010, 0.150, 0.140) | 59.5 | part56:metal (0.0) | yes |
| part62:steel | (0.017, 0.105, 0.120) | (0.035, 0.125, 0.140) | 32.5 | part56:metal (0.0) | yes |
| part63:metal | (-0.015, 0.075, 0.041) | (0.015, 0.111, 0.053) | 2.5 | part1:metal (0.0) | yes |
| part64:metal | (-0.015, 0.075, 0.187) | (0.015, 0.111, 0.199) | 2.5 | part1:metal (0.0) | yes |
| part65:metal | (-0.007, 0.078, 0.022) | (0.007, 0.095, 0.072) | 5.5 | part1:metal (0.0) | yes |
| part66:metal | (-0.007, 0.078, 0.168) | (0.007, 0.095, 0.218) | 5.5 | part1:metal (0.0) | yes |
| part67:steel | (0.022, 0.051, 0.180) | (0.026, 0.069, 0.220) | 0.0 | part0:metal (0.0) | yes |
| part68:brass | (-0.004, -0.023, 0.040) | (0.004, 0.007, 0.060) | 0.0 | part0:metal (0.0) | yes |
| part69:metal | (-0.010, -0.032, 0.030) | (0.010, -0.028, 0.080) | 25.5 | part70:metal (0.0) | yes |
| part70:metal | (-0.010, -0.030, 0.078) | (0.010, -0.002, 0.082) | 0.0 | part0:metal (0.0) | yes |
| part71:steel | (-0.027, -0.007, -0.387) | (-0.021, 0.007, -0.373) | 323.0 | part52:tan (0.0) | yes |
| part72:steel | (0.021, -0.037, 0.543) | (0.027, -0.023, 0.557) | 174.2 | part28:tan (0.0) | yes |
| action0:steel | (0.023, 0.053, 0.075) | (0.037, 0.067, 0.125) | 0.0 | part0:metal (0.0) | yes |
| action1:steel | (0.035, 0.035, 0.090) | (0.055, 0.055, 0.110) | 12.0 | action0:steel (0.0) | yes |
| mag0:polymer | (-0.014, -0.120, 0.160) | (0.014, -0.020, 0.240) | 17.5 | part28:tan (0.0) | yes |
| mag1:rubber | (-0.015, -0.125, 0.159) | (0.015, -0.119, 0.241) | 116.5 | mag0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part0:metal |
| muzzle | (0.000, 0.055, 1.160) | — | 0.0 | yes | no barrel part named; nearest part43:steel |
| aimPoint | (0.000, 0.115, 0.120) | — | 0.0 | yes | no sight part named; nearest part56:metal |
| eject | (0.030, 0.060, 0.200) | — | 4.0 | yes | no ejection port named; nearest part67:steel |
| magazine | (0.000, -0.073, 0.200) | part28:tan | 0.0 | yes | magazine box seated in its well |
| supportHand | (-0.030, -0.051, 0.360) | part28:tan | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## launcher (procedural) — PASS
receiver: `part0:metal`; gun box (-0.040, -0.110, -0.320) … (0.046, 0.150, 0.490) (86.0 × 260.0 × 810.0 mm); 29 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:metal | (-0.035, 0.015, 0.100) | (0.035, 0.085, 0.460) | 0.0 | part1:steel (0.0) | yes |
| part1:steel | (-0.040, 0.010, 0.450) | (0.040, 0.090, 0.490) | 0.0 | part0:metal (0.0) | yes |
| part2:steel | (-0.037, 0.013, 0.156) | (0.037, 0.087, 0.164) | 0.0 | part0:metal (0.0) | yes |
| part3:steel | (-0.037, 0.013, 0.256) | (0.037, 0.087, 0.264) | 0.0 | part0:metal (0.0) | yes |
| part4:steel | (-0.037, 0.013, 0.356) | (0.037, 0.087, 0.364) | 0.0 | part0:metal (0.0) | yes |
| part5:polymer | (-0.025, -0.005, -0.060) | (0.025, 0.065, 0.100) | 0.0 | part10:tan (0.0) | yes |
| part6:polymer | (-0.017, -0.110, -0.035) | (0.017, -0.010, 0.015) | 88.6 | part7:rubber (0.0) | yes |
| part7:rubber | (-0.019, -0.034, -0.037) | (0.019, -0.026, 0.017) | 92.6 | part6:polymer (0.0) | yes |
| part8:rubber | (-0.019, -0.064, -0.037) | (0.019, -0.056, 0.017) | 109.2 | part6:polymer (0.0) | yes |
| part9:rubber | (-0.019, -0.094, -0.037) | (0.019, -0.086, 0.017) | 130.7 | part6:polymer (0.0) | yes |
| part10:tan | (-0.020, -0.005, -0.310) | (0.020, 0.055, -0.060) | 160.0 | part5:polymer (0.0) | yes |
| part11:rubber | (-0.022, -0.010, -0.320) | (0.022, 0.060, -0.300) | 400.0 | part10:tan (0.0) | yes |
| part12:rubber | (-0.015, -0.035, 0.200) | (0.015, 0.015, 0.280) | 0.0 | part0:metal (0.0) | yes |
| part13:steel | (-0.016, 0.065, 0.044) | (0.016, 0.071, 0.056) | 44.0 | part5:polymer (0.0) | yes |
| part14:steel | (-0.016, 0.068, 0.047) | (-0.012, 0.148, 0.053) | 47.0 | part13:steel (0.0) | yes |
| part15:steel | (0.012, 0.068, 0.047) | (0.016, 0.148, 0.053) | 47.0 | part13:steel (0.0) | yes |
| part16:steel | (-0.016, 0.146, 0.047) | (0.016, 0.150, 0.053) | 77.0 | part14:steel (0.0) | yes |
| part17:steel | (-0.014, 0.128, 0.048) | (0.014, 0.130, 0.052) | 64.5 | part14:steel (0.0) | yes |
| part18:steel | (-0.014, 0.140, 0.048) | (0.014, 0.142, 0.052) | 72.9 | part14:steel (0.0) | yes |
| part19:steel | (-0.007, 0.128, 0.048) | (-0.005, 0.142, 0.052) | 64.5 | part17:steel (0.0) | yes |
| part20:steel | (0.005, 0.128, 0.048) | (0.007, 0.142, 0.052) | 64.5 | part17:steel (0.0) | yes |
| part21:brass | (-0.014, 0.077, 0.048) | (0.014, 0.079, 0.052) | 48.0 | part14:steel (0.0) | yes |
| part22:brass | (-0.014, 0.089, 0.048) | (0.014, 0.091, 0.052) | 48.2 | part14:steel (0.0) | yes |
| part23:brass | (-0.014, 0.101, 0.048) | (0.014, 0.103, 0.052) | 50.6 | part14:steel (0.0) | yes |
| part24:brass | (-0.014, 0.113, 0.048) | (0.014, 0.115, 0.052) | 55.6 | part14:steel (0.0) | yes |
| part25:brass | (-0.004, -0.023, 0.030) | (0.004, 0.007, 0.050) | 50.6 | part5:polymer (0.0) | yes |
| part26:metal | (-0.010, -0.032, 0.020) | (0.010, -0.028, 0.070) | 52.4 | part27:metal (0.0) | yes |
| part27:metal | (-0.010, -0.030, 0.068) | (0.010, -0.002, 0.072) | 32.8 | part5:polymer (0.0) | yes |
| action0:brass | (0.026, 0.035, 0.070) | (0.046, 0.065, 0.130) | 0.0 | part0:metal (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part5:polymer |
| muzzle | (0.000, 0.050, 0.490) | — | 0.0 | yes | no barrel part named; nearest part1:steel |
| aimPoint | (0.000, 0.135, 0.050) | — | 4.9 | yes | no sight part named; nearest part18:steel |
| eject | (0.030, 0.050, 0.060) | — | 5.0 | yes | no ejection port named; nearest part5:polymer |
| supportHand | (-0.030, -0.051, 0.270) | part12:rubber | 0.0 | yes | left hand box touches the gun, clear of the muzzle |

## clippers (procedural) — PASS
receiver: `part0:polymer`; gun box (-0.021, -0.045, -0.130) … (0.024, 0.034, 0.142) (45.0 × 79.0 × 272.0 mm); 16 parts, 0 floating, 0 anchors off

| part | box min | box max | to receiver mm | nearest (mm) | attached |
|---|---|---|---|---|---|
| part0:polymer | (-0.020, -0.045, -0.045) | (0.020, 0.025, 0.085) | 0.0 | part1:rubber (0.0) | yes |
| part1:rubber | (-0.021, -0.030, -0.023) | (0.021, -0.026, -0.017) | 0.0 | part0:polymer (0.0) | yes |
| part2:rubber | (-0.021, -0.020, -0.023) | (0.021, -0.016, -0.017) | 0.0 | part0:polymer (0.0) | yes |
| part3:rubber | (-0.021, -0.010, -0.023) | (0.021, -0.006, -0.017) | 0.0 | part0:polymer (0.0) | yes |
| part4:rubber | (-0.021, -0.000, -0.023) | (0.021, 0.004, -0.017) | 0.0 | part0:polymer (0.0) | yes |
| part5:steel | (-0.017, 0.002, 0.085) | (0.017, 0.022, 0.135) | 0.0 | part0:polymer (0.0) | yes |
| part6:steel | (-0.020, 0.023, 0.120) | (0.020, 0.029, 0.140) | 35.0 | part7:steel (0.0) | yes |
| part7:steel | (-0.017, 0.026, 0.128) | (-0.013, 0.034, 0.142) | 43.0 | part6:steel (0.0) | yes |
| part8:steel | (-0.011, 0.026, 0.128) | (-0.007, 0.034, 0.142) | 43.0 | part6:steel (0.0) | yes |
| part9:steel | (-0.005, 0.026, 0.128) | (-0.001, 0.034, 0.142) | 43.0 | part6:steel (0.0) | yes |
| part10:steel | (0.001, 0.026, 0.128) | (0.005, 0.034, 0.142) | 43.0 | part6:steel (0.0) | yes |
| part11:steel | (0.007, 0.026, 0.128) | (0.011, 0.034, 0.142) | 43.0 | part6:steel (0.0) | yes |
| part12:steel | (0.013, 0.026, 0.128) | (0.017, 0.034, 0.142) | 43.0 | part6:steel (0.0) | yes |
| part13:brass | (0.012, 0.018, 0.015) | (0.024, 0.034, 0.045) | 0.0 | part0:polymer (0.0) | yes |
| part14:rubber | (-0.004, -0.014, -0.130) | (0.004, -0.006, -0.050) | 5.0 | part0:polymer (5.0) | yes |
| part15:steel | (-0.010, 0.024, 0.020) | (0.010, 0.028, 0.060) | 0.0 | part0:polymer (0.0) | yes |

| anchor | point | on | gap mm | ok | note |
|---|---|---|---|---|---|
| grip | (0.000, 0.000, 0.000) | — | 0.0 | yes | no grip part named; nearest part0:polymer |
| muzzle | (0.000, 0.026, 0.140) | — | 0.0 | yes | no barrel part named; nearest part6:steel |
| aimPoint | (0.000, 0.030, 0.130) | — | 1.0 | yes | no sight part named; nearest part9:steel |
| supportHand | (-0.030, -0.065, -0.005) | part0:polymer | 0.0 | yes | left hand box touches the gun, clear of the muzzle |
