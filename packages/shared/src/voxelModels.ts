/**
 * The furniture of DOLNA 17, drawn from pixels (see `voxel.ts` for the format). Every model is a
 * short text: a palette, the bulk as #box, the faces that matter as pictures. Open
 * `/voxel-lab.html` in the dev client to see them all, `?model=<id>` for one, `?edit=1` to
 * type and watch. Sizes are real: a fridge is 0.6 × 1.8 × 0.6 m, a couch seat is 0.45 m high.
 *
 * A model's local +Z is its FRONT (the side a person uses); the map places it with `yaw`.
 */
import { parseVoxelText, type VoxelModel } from "./voxel";

const T: Record<string, string> = {};

// ======================= KUCHNIA =======================
T.fridge = `#model fridge
#cell 0.1
#ink W #e9eaec gloss
#ink S #b9bec6 metal
#ink K #2a2c30 matte
#ink D #d4d6da gloss
#box 0,0,0 6,18,5 W
#part z n=1 at=0,0,5
WWWWWW
WWWWWW
WWWWKW
WWWWKW
WWWWKW
DDDDDD
WWWWWW
WWWWWW
WWWWWW
WWWWKW
WWWWKW
WWWWKW
WWWWKW
WWWWKW
WWWWWW
WWWWWW
WWWWWW
KKKKKK
`;

T.stove = `#model stove
#cell 0.1
#ink W #dfe0e3 gloss
#ink S #a8adb5 metal
#ink K #1e1f22 matte
#ink G #2b3440 glass
#ink R #c8402c glow
#box 0,0,0 6,8,6 W
#part y n=1 at=0,8,0
KKKKKK
K.KK.K
KKKKKK
K.KK.K
KKKKKK
SSSSSS
#part z n=1 at=0,0,6
SSSSSS
S.S.S.
WWWWWW
SSSSSS
WGGGGW
WGGGGW
WGGGGW
WWWWWW
KKKKKK
#part z n=1 at=5,6,6
R
`;

T.kitchen_counter = `#model kitchen_counter
#cell 0.1
#ink W #d9d5cc gloss
#ink T #6b4a33 matte
#ink K #26241f matte
#ink S #b0b4ba metal
#box 0,0,0 18,9,6 W
#part y n=1 at=0,8,0
TTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTT
#part z n=1 at=0,0,6
TTTTTTTTTTTTTTTTTT
WWWWWWWWWWWWWWWWWW
WWSSWWWWSSWWWWSSWW
WWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWW
WWWWWKWWWWWKWWWWWW
WWWWWKWWWWWKWWWWWW
WWWWWKWWWWWKWWWWWW
KKKKKKKKKKKKKKKKKK
`;

T.kitchen_sink = `#model kitchen_sink
#cell 0.1
#ink W #d9d5cc gloss
#ink T #6b4a33 matte
#ink K #26241f matte
#ink S #b0b4ba metal
#ink B #8d949c metal
#box 0,0,0 6,9,6 W
#part y n=1 at=0,8,0
TTTTTT
TBBBBT
TBBBBT
TBBBBT
TBBBBT
TTTTTT
#part z n=1 at=0,0,6
TTTTTT
WWWWWW
WWSSWW
WWWWWW
WWWWWW
WWWWWW
WWWWWW
WWWWWW
KKKKKK
#part z n=1 at=2,9,0
.SS.
.SS.
S..S
S..S
`;

T.kitchen_upper = `#model kitchen_upper
#cell 0.1
#ink W #d9d5cc gloss
#ink K #26241f matte
#ink S #b0b4ba metal
#box 0,0,0 18,7,3 W
#part z n=1 at=0,0,3
WWWWWWWWWWWWWWWWWW
WWWWWKWWWWWKWWWWWW
WWWWWKWWWWWKWWWWWW
WWWSWKWWSWWKWWSWWW
WWWSWKWWSWWKWWSWWW
WWWWWKWWWWWKWWWWWW
WWWWWWWWWWWWWWWWWW
`;

T.microwave = `#model microwave
#cell 0.05
#ink S #c9ccd1 metal
#ink K #202226 matte
#ink G #1b2a38 glass
#box 0,0,0 10,6,8 S
#part z n=1 at=0,0,8
SSSSSSSSSS
SGGGGGGSKS
SGGGGGGSKS
SGGGGGGSKS
SGGGGGGSSS
SSSSSSSSSS
`;

T.kitchen_table = `#model kitchen_table
#cell 0.1
#ink T #8a6748 matte
#ink L #5c4230 matte
#box 0,7,0 12,1,8 T
#box 0,0,0 1,7,1 L
#box 11,0,0 1,7,1 L
#box 0,0,7 1,7,1 L
#box 11,0,7 1,7,1 L
`;

T.chair = `#model chair
#cell 0.05
#ink T #8a6748 matte
#ink L #5c4230 matte
#ink C #a33f3a matte
#box 0,8,0 9,1,9 T
#box 0,9,0 9,1,9 C
#box 0,0,0 1,8,1 L
#box 8,0,0 1,8,1 L
#box 0,0,8 1,8,1 L
#box 8,0,8 1,8,1 L
#part z n=1 at=0,10,0
LLLLLLLLL
L.......L
LLLLLLLLL
L.......L
LLLLLLLLL
L.......L
L.......L
L.......L
`;

// ======================= SALON =======================
T.sofa = `#model sofa
#cell 0.1
#ink F #3f4a5c matte
#ink C #4b586c matte
#ink L #2a2d33 matte
#ink P #cfc4ae matte
#box 0,1,0 21,4,9 F
#box 0,5,0 21,4,2 F
#box 0,5,0 2,2,9 F
#box 19,5,0 2,2,9 F
#part y n=1 at=2,5,2
CCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCC
#part y n=1 at=3,6,3
PPPP.........PPPP
PPPP.........PPPP
PPPP.........PPPP
#box 1,0,1 1,1,1 L
#box 19,0,1 1,1,1 L
#box 1,0,7 1,1,1 L
#box 19,0,7 1,1,1 L
`;

T.armchair = `#model armchair
#cell 0.1
#ink F #6b4a3a matte
#ink C #7d5a47 matte
#ink L #2a2d33 matte
#box 0,1,0 9,4,9 F
#box 0,5,0 9,4,2 F
#box 0,5,0 2,2,9 F
#box 7,5,0 2,2,9 F
#box 2,5,2 5,1,7 C
#box 1,0,1 1,1,1 L
#box 7,0,1 1,1,1 L
#box 1,0,7 1,1,1 L
#box 7,0,7 1,1,1 L
`;

T.coffee_table = `#model coffee_table
#cell 0.1
#ink T #4a3a2e matte
#ink G #9fc4d8 glass
#ink K #1d1e21 metal
#box 0,4,0 10,1,6 G
#box 0,1,0 10,1,6 T
#box 0,0,0 1,4,1 K
#box 9,0,0 1,4,1 K
#box 0,0,5 1,4,1 K
#box 9,0,5 1,4,1 K
`;

T.tv = `#model tv
#cell 0.05
#ink K #16171a gloss
#ink S #2c2e33 matte
#ink G #0b1016 gloss
#box 0,2,0 28,16,1 K
#part z n=1 at=0,2,1
KKKKKKKKKKKKKKKKKKKKKKKKKKKK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KGGGGGGGGGGGGGGGGGGGGGGGGGGK
KKKKKKKKKKKKKKKKKKKKKKKKKKKK
#box 10,0,0 8,2,3 S
`;

T.tv_stand = `#model tv_stand
#cell 0.1
#ink T #3a2f28 matte
#ink K #1d1e21 matte
#ink D #4d3f35 matte
#box 0,1,0 16,4,4 T
#part z n=1 at=0,1,4
TTTTTTTTTTTTTTTT
TDDDDDDTTDDDDDDT
TDDDKDDTTDDKDDDT
TDDDDDDTTDDDDDDT
#box 1,0,1 1,1,1 K
#box 14,0,1 1,1,1 K
#box 1,0,3 1,1,1 K
#box 14,0,3 1,1,1 K
`;

T.bookshelf = `#model bookshelf
#cell 0.1
#ink T #6b4a33 matte
#ink R #a63d36 matte
#ink B #2f5d8a matte
#ink G #4c7a3e matte
#ink Y #c9a13e matte
#ink K #262220 matte
#box 0,0,0 9,20,1 T
#part z n=3 at=0,0,1
TTTTTTTTT
T.......T
TRBBGYRBT
TRBBGYRBT
TRBBGYRBT
TTTTTTTTT
T.......T
TYGGRBBKT
TYGGRBBKT
TYGGRBBKT
TTTTTTTTT
T.......T
TBRYYGKRT
TBRYYGKRT
TBRYYGKRT
TTTTTTTTT
T.......T
TGKRBYRRT
TGKRBYRRT
TTTTTTTTT
`;

T.rug = `#model rug
#cell 0.1
#ink A #8a3b3b matte
#ink B #c9a56a matte
#ink C #3b3f5c matte
#part y n=1 at=0,0,0
AAAAAAAAAAAAAAAAAAAA
ABBBBBBBBBBBBBBBBBBA
ABAAAAAAAAAAAAAAAABA
ABACCCBBBBBBBBCCCABA
ABACBCBBBBBBBBCBCABA
ABACCCBBBCCBBBCCCABA
ABABBBBBBCCBBBBBBABA
ABABBBBBBCCBBBBBBABA
ABACCCBBBCCBBBCCCABA
ABACBCBBBBBBBBCBCABA
ABACCCBBBBBBBBCCCABA
ABAAAAAAAAAAAAAAAABA
ABBBBBBBBBBBBBBBBBBA
AAAAAAAAAAAAAAAAAAAA
`;

T.floor_lamp = `#model floor_lamp
#cell 0.05
#ink K #26272b metal
#ink S #e8dcc0 glow
#box 2,0,2 4,1,4 K
#box 3,1,3 2,26,2 K
#box 0,27,0 8,5,8 S
`;

T.plant = `#model plant
#cell 0.05
#ink P #8d5a3b matte
#ink E #2f2419 matte
#ink G #3f7a3a matte
#ink H #5a9a4a matte
#box 1,0,1 6,6,6 P
#box 2,6,2 4,1,4 E
#box 3,7,3 2,10,2 G
#part y n=3 at=0,14,0
..GG..GG
.GHHGGHG
GHHHHHHG
.GHHHHG.
.GHHHHG.
GHHHHHHG
.GHGGHHG
..GG..GG
#part y n=3 at=1,17,1
.GHHG.
GHHHHG
HHHHHH
GHHHHG
.GHHG.
`;

// ======================= SYPIALNIA =======================
T.bed_double = `#model bed_double
#cell 0.1
#ink F #6b4a33 matte
#ink K #3a2a1e matte
#ink M #ecebe6 matte
#ink D #26355e matte
#ink E #3a4a78 matte
#ink P #efe6cf matte
#box 0,0,0 1,1,1 K
#box 15,0,0 1,1,1 K
#box 0,0,19 1,1,1 K
#box 15,0,19 1,1,1 K
#box 0,1,0 16,2,20 F
#box 0,1,0 16,4,1 F
#box 1,3,1 14,1,18 M
#box 1,4,1 14,1,13 D
#box 1,4,13 14,1,1 E
#box 2,4,15 5,1,3 P
#box 9,4,15 5,1,3 P
`;

T.bed_single = `#model bed_single
#cell 0.1
#ink F #6b4a33 matte
#ink K #3a2a1e matte
#ink M #ecebe6 matte
#ink D #3f6b3a matte
#ink E #4f8248 matte
#ink P #efe6cf matte
#box 0,0,0 1,1,1 K
#box 8,0,0 1,1,1 K
#box 0,0,19 1,1,1 K
#box 8,0,19 1,1,1 K
#box 0,1,0 9,2,20 F
#box 0,1,0 9,4,1 F
#box 1,3,1 7,1,18 M
#box 1,4,1 7,1,13 D
#box 1,4,13 7,1,1 E
#box 2,4,15 5,1,3 P
`;

T.wardrobe = `#model wardrobe
#cell 0.1
#ink W #c9b79a matte
#ink T #8a7355 matte
#ink K #2a2622 matte
#ink S #b9bec6 metal
#box 1,0,1 10,1,5 K
#box 0,1,0 12,20,6 W
#part z n=1 at=0,1,5
TTTTTTTTTTTT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWSSWWWWT
TWWWWSSWWWWT
TWWWWSSWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
TWWWWWWWWWWT
`;

T.nightstand = `#model nightstand
#cell 0.05
#ink F #a88b68 matte
#ink D #b89a76 matte
#ink T #8a7355 matte
#ink K #2a2622 matte
#ink S #b9bec6 metal
#ink L #f2e3b8 glow
#box 1,0,1 7,1,6 K
#box 0,1,0 9,6,8 F
#part z n=1 at=0,1,7
TTTTTTTTT
FDDDDDDDF
FDDDSDDDF
FDDDDDDDF
FDDDDDDDF
FFFFFFFFF
#box 4,7,3 1,1,1 K
#box 3,8,2 3,2,3 L
`;

T.desk = `#model desk
#cell 0.05
#ink T #b08a5e matte
#ink F #d8d5cf matte
#ink K #202226 matte
#ink S #b9bec6 metal
#ink G #1a2c5a glow
#box 0,0,0 6,14,14 F
#box 22,0,0 6,14,14 F
#box 0,14,0 28,1,14 T
#part z n=1 at=0,0,13
FFFFFF
FFFFFF
FSSSSF
FFFFFF
KKKKKK
FFFFFF
FSSSSF
FFFFFF
KKKKKK
FFFFFF
FSSSSF
FFFFFF
FFFFFF
KKKKKK
#part z n=1 at=22,0,13
FFFFFF
FFFFFF
FSSSSF
FFFFFF
KKKKKK
FFFFFF
FSSSSF
FFFFFF
KKKKKK
FFFFFF
FSSSSF
FFFFFF
FFFFFF
KKKKKK
#box 11,15,4 6,1,3 K
#box 13,16,5 2,1,1 K
#box 8,17,4 11,5,2 K
#part z n=1 at=8,17,5
KKKKKKKKKKK
KGGGGGGGGGK
KGGGGGGGGGK
KGGGGGGGGGK
KKKKKKKKKKK
#box 9,15,9 10,1,3 K
#box 21,15,10 1,1,2 S
`;

T.office_chair = `#model office_chair
#cell 0.05
#ink K #1c1d20 matte
#ink G #4a4d54 matte
#ink M #2e3138 matte
#part y n=1 at=0,0,0
.....GG.....
.....KK.....
.....KK.....
G....KK....G
KK...KK...KK
.KKKKKKKKKK.
..KKKKKKKK..
...KKKKKK...
..KKK..KKK..
.KK......KK.
KK........KK
G..........G
#box 5,1,5 2,7,2 K
#box 1,8,1 10,2,10 M
#box 1,10,0 10,12,1 M
#part z n=1 at=1,10,0
KKKKKKKKKK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KMMMMMMMMK
KKKKKKKKKK
#box 0,10,4 1,3,1 K
#box 11,10,4 1,3,1 K
#box 0,13,2 1,1,7 K
#box 11,13,2 1,1,7 K
`;

// ======================= ŁAZIENKA =======================
T.toilet = `#model toilet
#cell 0.05
#ink W #f2f3f5 gloss
#ink K #1e1f22 gloss
#ink S #b9bec6 metal
#box 0,8,0 8,8,4 W
#box 2,0,5 4,5,6 W
#part y n=3 at=0,5,4
..WWWW..
.WWWWWW.
.WWWWWW.
WWWWWWWW
WWWWWWWW
WWWWWWWW
WWWWWWWW
WWWWWWWW
WWWWWWWW
WWWWWWWW
#part y n=1 at=0,8,4
..KKKK..
.KKKKKK.
.KKKKKK.
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
#box 3,14,4 2,1,1 S
`;

T.washbasin = `#model washbasin
#cell 0.05
#ink W #f2f3f5 gloss
#ink C #e6e2da matte
#ink K #2a2622 matte
#ink S #b9bec6 metal
#box 1,0,1 10,1,8 K
#box 0,1,0 12,12,10 C
#part z n=1 at=0,1,9
CCCCCCCCCCCC
CCCCCCCCCCCC
CCCCCCCCCCCC
CCCCCSSCCCCC
CCCCCSSCCCCC
CCCCCSSCCCCC
CCCCCCCCCCCC
CCCCCCCCCCCC
CCCCCCCCCCCC
CCCCCCCCCCCC
CCCCCCCCCCCC
CCCCCCCCCCCC
#box 2,13,2 8,1,6 W
#part y n=2 at=0,13,0
WWWWWWWWWWWW
WWWWWWWWWWWW
WW........WW
WW........WW
WW........WW
WW........WW
WW........WW
WW........WW
WWWWWWWWWWWW
WWWWWWWWWWWW
#box 5,15,1 2,2,1 S
#box 5,16,2 2,1,2 S
`;

T.bathtub = `#model bathtub
#cell 0.05
#ink W #f2f3f5 gloss
#ink K #2a2c30 matte
#ink B #2c5f86 glass
#ink S #b9bec6 metal
#box 1,0,1 32,1,13 K
#box 0,1,0 34,2,15 W
#box 0,3,0 2,8,15 W
#box 32,3,0 2,8,15 W
#box 0,3,0 34,8,2 W
#box 0,3,13 34,8,2 W
#box 2,9,2 30,1,11 B
#box 0,11,6 2,1,3 S
#box 2,10,7 2,1,1 S
`;

T.shower = `#model shower
#cell 0.1
#ink W #eef0f2 gloss
#ink G #a9cfe0 glass
#ink S #b9bec6 metal
#box 0,0,0 9,1,9 W
#box 0,1,8 9,19,1 G
#box 8,1,0 1,19,9 G
#box 0,1,8 1,19,1 S
#box 8,1,8 1,19,1 S
#box 8,1,0 1,19,1 S
#box 0,19,8 9,1,1 S
#box 8,19,0 1,1,9 S
#box 0,1,0 1,19,1 S
#box 1,18,1 3,1,3 S
`;

T.washing_machine = `#model washing_machine
#cell 0.05
#ink W #eef0f2 gloss
#ink K #1e1f22 matte
#ink S #b9bec6 metal
#ink G #9db8cc glass
#ink D #2a2c30 matte
#box 0,0,0 12,1,12 K
#box 0,1,0 12,16,12 W
#part z n=1 at=0,4,10
....DDDD....
...DDDDDD...
..DDDDDDDD..
.DDDDDDDDDD.
.DDDDDDDDDD.
.DDDDDDDDDD.
.DDDDDDDDDD.
..DDDDDDDD..
...DDDDDD...
....DDDD....
#part z n=1 at=0,1,11
KKKKKKKKKKKK
KKKKKKKKSSKK
WWWWWWWWWWWW
WWWWSSSSWWWW
WWWSGGGGSWWW
WWSGGGGGGSWW
WSGGGGGGGGSW
WSGGGGGGGGSW
WSGGGGGGGGSW
WSGGGGGGGGSW
WWSGGGGGGSWW
WWWSGGGGSWWW
WWWWSSSSWWWW
WWWWWWWWWWWW
WWWWWWWWWWWW
WWWWWWWWWWWW
`;

// ======================= KOTŁOWNIA =======================
T.boiler_tank = `#model boiler_tank
#cell 0.1
#ink W #e8eaec gloss
#ink K #3a3d42 matte
#ink P #8a8f96 metal
#part y n=1 at=0,0,0
.KKKK.
KKKKKK
KKKKKK
KKKKKK
KKKKKK
.KKKK.
#part y n=14 at=0,1,0
.WWWW.
WWWWWW
WWWWWW
WWWWWW
WWWWWW
.WWWW.
#part z n=1 at=2,8,5
KK
KK
#box 1,15,1 1,1,1 P
#box 4,15,4 1,1,1 P
#box 2,15,2 2,1,2 P
`;

T.gas_boiler = `#model gas_boiler
#cell 0.05
#ink W #eef0f2 gloss
#ink K #2a2c30 matte
#ink G #1e3550 glow
#box 0,0,0 9,15,7 W
#part z n=1 at=0,0,6
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWWWWWWW
WWWGGGWWW
WWWGGGKWW
WWWWWWWWW
KKKKKKKKK
KKKKKKKKK
`;

T.rack = `#model rack
#cell 0.1
#ink M #7d838a metal
#ink C #b98c5a matte
#ink B #2f5d8a matte
#ink G #4c7a3e matte
#ink R #c62f2a matte
#ink Y #d0a53c matte
#ink K #1e1f22 matte
#box 0,0,0 1,18,1 M
#box 8,0,0 1,18,1 M
#box 0,0,3 1,18,1 M
#box 8,0,3 1,18,1 M
#box 0,0,0 9,1,4 M
#box 0,5,0 9,1,4 M
#box 0,10,0 9,1,4 M
#box 0,15,0 9,1,4 M
#box 1,1,1 3,3,2 C
#box 5,1,1 3,2,2 B
#box 1,6,1 2,3,2 R
#box 1,9,1 1,1,1 K
#box 4,6,1 4,2,3 G
#box 1,11,1 5,2,3 C
#box 7,11,1 1,2,2 Y
#box 2,16,1 4,1,3 C
`;

// ======================= GARAŻ DETAILINGOWY =======================
T.workbench = `#model workbench
#cell 0.1
#ink T #a07a4e matte
#ink S #8d949c metal
#ink G #55595f matte
#ink K #2a2c30 matte
#ink R #b8302a matte
#box 0,7,0 18,1,7 T
#box 0,0,0 1,7,1 S
#box 17,0,0 1,7,1 S
#box 0,0,6 1,7,1 S
#box 17,0,6 1,7,1 S
#box 10,0,1 7,7,5 G
#part z n=1 at=10,0,5
GGGGGGG
GGSSSGG
KKKKKKK
GGSSSGG
KKKKKKK
GGSSSGG
KKKKKKK
#box 0,8,2 3,1,2 R
#box 1,8,1 1,1,5 S
`;

T.tool_chest = `#model tool_chest
#cell 0.05
#ink R #c1272d gloss
#ink K #1e1f22 matte
#ink S #b9bec6 metal
#box 1,0,1 2,2,2 K
#box 11,0,1 2,2,2 K
#box 1,0,7 2,2,2 K
#box 11,0,7 2,2,2 K
#box 0,2,0 14,18,10 R
#part z n=1 at=0,2,9
RRRRRRRRRRRRRR
RRRRSSSSSSRRRR
RRRRRRRRRRRRRR
KKKKKKKKKKKKKK
RRRRSSSSSSRRRR
RRRRRRRRRRRRRR
KKKKKKKKKKKKKK
RRRRSSSSSSRRRR
RRRRRRRRRRRRRR
KKKKKKKKKKKKKK
RRRRSSSSSSRRRR
RRRRRRRRRRRRRR
KKKKKKKKKKKKKK
RRRRSSSSSSRRRR
RRRRRRRRRRRRRR
RRRRRRRRRRRRRR
RRRRRRRRRRRRRR
RRRRRRRRRRRRRR
`;

T.tyre_stack = `#model tyre_stack
#cell 0.05
#ink K #141517 matte
#ink L #232529 matte
#ink R #8a8f96 metal
#part y n=4 at=0,0,0
....KKKKK....
..KKKKKKKKK..
.KKKKKKKKKKK.
.KKKKKKKKKKK.
KKKKKKKKKKKKK
KKKKKKKKKKKKK
KKKKKKKKKKKKK
KKKKKKKKKKKKK
KKKKKKKKKKKKK
.KKKKKKKKKKK.
.KKKKKKKKKKK.
..KKKKKKKKK..
....KKKKK....
#part y n=4 at=0,4,0
....LLLLL....
..LLLLLLLLL..
.LLLLLLLLLLL.
.LLLLLLLLLLL.
LLLLLLLLLLLLL
LLLLLLLLLLLLL
LLLLLLLLLLLLL
LLLLLLLLLLLLL
LLLLLLLLLLLLL
.LLLLLLLLLLL.
.LLLLLLLLLLL.
..LLLLLLLLL..
....LLLLL....
#part y n=4 at=0,8,0
....KKKKK....
..KKKKKKKKK..
.KKKKKKKKKKK.
.KKKKKKKKKKK.
KKKKKKKKKKKKK
KKKKKKKKKKKKK
KKKKKKKKKKKKK
KKKKKKKKKKKKK
KKKKKKKKKKKKK
.KKKKKKKKKKK.
.KKKKKKKKKKK.
..KKKKKKKKK..
....KKKKK....
#part y n=4 at=0,12,0
....LLLLL....
..LLLLLLLLL..
.LLLLLLLLLLL.
.LLLLLLLLLLL.
LLLLLLLLLLLLL
LLLLLLLLLLLLL
LLLLLLLLLLLLL
LLLLLLLLLLLLL
LLLLLLLLLLLLL
.LLLLLLLLLLL.
.LLLLLLLLLLL.
..LLLLLLLLL..
....LLLLL....
#part y n=1 at=3,3,3
..RRR..
.RRRRR.
RRRRRRR
RRRRRRR
RRRRRRR
.RRRRR.
..RRR..
#part y n=1 at=3,7,3
..RRR..
.RRRRR.
RRRRRRR
RRRRRRR
RRRRRRR
.RRRRR.
..RRR..
#part y n=1 at=3,11,3
..RRR..
.RRRRR.
RRRRRRR
RRRRRRR
RRRRRRR
.RRRRR.
..RRR..
#part y n=1 at=3,15,3
..RRR..
.RRRRR.
RRRRRRR
RRRRRRR
RRRRRRR
.RRRRR.
..RRR..
`;

T.pressure_washer = `#model pressure_washer
#cell 0.05
#ink Y #f2c300 matte
#ink K #1e1f22 matte
#ink H #5a5d63 matte
#ink G #3a3d42 matte
#box 0,0,0 1,4,4 K
#box 7,0,0 1,4,4 K
#box 1,1,1 6,2,8 K
#box 1,3,2 6,10,6 Y
#part z n=1 at=1,3,7
YYYYYY
YYYYYY
YKKKKY
YKGGKY
YKKKKY
YYYYYY
YYYYYY
YYYYYY
YYYYYY
YYYYYY
#box 1,13,2 1,5,1 K
#box 6,13,2 1,5,1 K
#box 1,17,2 6,1,1 K
#part x n=1 at=7,4,2
.HHHH.
H....H
H....H
H....H
H....H
.HHHH.
`;

T.shop_vac = `#model shop_vac
#cell 0.05
#ink K #1e1f22 matte
#ink R #c1272d matte
#ink S #b9bec6 metal
#ink G #4a4d54 matte
#part y n=1 at=0,0,0
..GGGG..
.GGGGGG.
GGGGGGGG
GGGGGGGG
GGGGGGGG
GGGGGGGG
.GGGGGG.
..GGGG..
#part y n=8 at=0,1,0
..KKKK..
.KKKKKK.
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
.KKKKKK.
..KKKK..
#part y n=2 at=0,9,0
..RRRR..
.RRRRRR.
RRRRRRRR
RRRRRRRR
RRRRRRRR
RRRRRRRR
.RRRRRR.
..RRRR..
#box 2,11,2 4,2,4 K
#box 7,2,0 1,12,1 S
`;

T.detail_shelf = `#model detail_shelf
#cell 0.05
#ink K #202226 matte
#ink R #c62f2a gloss
#ink B #2f6fbf gloss
#ink Y #e0b83a gloss
#ink G #3f9a4a gloss
#ink W #e8e8e8 gloss
#ink O #e8731f gloss
#ink P #7a3fa0 gloss
#box 0,0,0 1,36,1 K
#box 17,0,0 1,36,1 K
#box 0,0,6 1,36,1 K
#box 17,0,6 1,36,1 K
#box 0,0,0 18,1,7 K
#box 0,9,0 18,1,7 K
#box 0,18,0 18,1,7 K
#box 0,27,0 18,1,7 K
#part z n=2 at=0,1,2
.K.K.K.K.K.K.K.K..
.R.B.Y.G.W.O.R.B..
.R.B.Y.G.W.O.R.B..
.R.B.Y.G.W.O.R.B..
.R.B.Y.G.W.O.R.B..
.R.B.Y.G.W.O.R.B..
#part z n=2 at=0,10,2
.BB.RR.YY.GG.WW.PP
.BB.RR.YY.GG.WW.PP
.BB.RR.YY.GG.WW.PP
.BB.RR.YY.GG.WW.PP
#part z n=2 at=0,19,2
.K.K.K.K.K.K.K.K..
.O.W.B.R.G.Y.P.W..
.O.W.B.R.G.Y.P.W..
.O.W.B.R.G.Y.P.W..
.O.W.B.R.G.Y.P.W..
.O.W.B.R.G.Y.P.W..
#part z n=2 at=0,28,2
.K..K..K.K.K.K.K..
.GG.WW.R.B.Y.O.W..
.GG.WW.R.B.Y.O.W..
.GG.WW.R.B.Y.O.W..
.GG.WW.R.B.Y.O.W..
`;

T.bucket = `#model bucket
#cell 0.05
#ink K #1e1f22 matte
#ink G #7d838a matte
#box 1,0,1 4,1,4 K
#part y n=4 at=0,1,0
.KKKK.
KKKKKK
KKKKKK
KKKKKK
KKKKKK
.KKKK.
#part y n=1 at=0,5,0
.GGGG.
GGGGGG
GG..GG
GG..GG
GGGGGG
.GGGG.
`;

T.compressor = `#model compressor
#cell 0.05
#ink B #2b5fb3 gloss
#ink K #1e1f22 matte
#ink S #b9bec6 metal
#box 0,0,1 1,4,4 K
#box 9,0,1 1,4,4 K
#box 1,1,2 8,2,2 K
#box 2,0,14 6,1,3 K
#box 3,3,3 4,1,2 K
#box 3,3,13 4,1,2 K
#part z n=14 at=1,4,2
..BBBB..
.BBBBBB.
BBBBBBBB
BBBBBBBB
BBBBBBBB
.BBBBBB.
..BBBB..
#box 2,11,5 6,5,7 K
#box 3,12,12 2,2,1 S
#box 4,12,0 2,1,3 K
`;

T.hose_reel = `#model hose_reel
#cell 0.05
#ink D #8a8f96 matte
#ink K #1e1f22 matte
#box 3,1,0 2,5,1 D
#part z n=3 at=0,0,1
..KKKK..
.KKKKKK.
KKDDDDKK
KKDDDDKK
KKDDDDKK
KKDDDDKK
.KKKKKK.
..KKKK..
#part z n=1 at=0,0,4
..DDDD..
.DDDDDD.
DDDDDDDD
DDDKKDDD
DDDKKDDD
DDDDDDDD
.DDDDDD.
..DDDD..
`;

T.polisher = `#model polisher
#cell 0.05
#ink O #f07f1a matte
#ink K #1e1f22 matte
#box 0,0,0 4,1,4 K
#box 0,1,0 4,2,4 O
#box 4,1,1 4,1,2 O
#box 8,1,1 2,1,2 K
`;

// ======================= BARAK BARBERSKI =======================
T.barber_station = `#model barber_station
#cell 0.05
#ink K #141416 gloss
#ink L #26272b gloss
#ink D #0c0c0e matte
#ink S #b9bec6 metal
#ink A #b5651d glass
#ink C #d8e8f0 glass
#ink W #f0f0ee matte
#box 1,0,1 26,1,7 D
#box 0,1,0 28,12,9 K
#part z n=1 at=0,1,8
KKKKKKKKKKKKKKKKKKKKKKKKKKKK
KLLLLLLLLKLLLLLLLLKLLLLLLLLK
KLLLSSSLLKLLLSSSLLKLLLSSSLLK
KLLLLLLLLKLLLLLLLLKLLLLLLLLK
KKKKKKKKKKKKKKKKKKKKKKKKKKKK
KLLLLLLLLKLLLLLLLLKLLLLLLLLK
KLLLSSSLLKLLLSSSLLKLLLSSSLLK
KLLLLLLLLKLLLLLLLLKLLLLLLLLK
KKKKKKKKKKKKKKKKKKKKKKKKKKKK
KLLLLLLLLKLLLLLLLLKLLLLLLLLK
KLLLSSSLLKLLLSSSLLKLLLSSSLLK
KLLLLLLLLKLLLLLLLLKLLLLLLLLK
#box 3,13,3 1,3,1 A
#box 3,16,3 1,1,1 K
#box 5,13,3 1,3,1 K
#box 5,16,3 1,1,1 S
#box 7,13,3 1,3,1 C
#box 7,16,3 1,1,1 K
#box 12,13,4 2,1,3 K
#box 12,13,7 2,1,1 S
#box 20,13,2 6,3,5 W
`;

T.wash_unit = `#model wash_unit
#cell 0.05
#ink K #303238 gloss
#ink C #141517 matte
#ink W #f2f3f5 gloss
#ink S #b9bec6 metal
#box 4,0,1 6,14,6 C
#box 1,14,0 12,2,8 W
#part y n=2 at=1,16,0
.WWWWWWWWWW.
WW........WW
W..........W
W..........W
W..........W
W..........W
WW........WW
.WWWWWWWWWW.
#box 6,18,0 2,2,1 S
#box 6,19,1 2,1,2 S
#box 4,0,13 6,5,10 C
#part x n=12 at=1,4,8
..................KK
.................KK.
................KK..
...............KK...
..............KK....
.............KK.....
KKKKKKKKKKKKKKK.....
KKKKKKKKKKKKKKK.....
KKKKKKKKKKKKKKK.....
KKKKKKKKKKKKKKK.....
#box 0,8,14 1,1,8 K
#box 13,8,14 1,1,8 K
#box 3,3,25 8,1,3 S
`;

T.coat_rack = `#model coat_rack
#cell 0.05
#ink K #2a2b2f gloss
#part y n=1 at=0,0,0
..KKKK..
.KKKKKK.
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
.KKKKKK.
..KKKK..
#box 3,1,3 2,32,2 K
#box 0,31,3 8,1,2 K
#box 3,31,0 2,1,8 K
#box 0,32,3 1,2,2 K
#box 7,32,3 1,2,2 K
#box 3,32,0 2,2,1 K
#box 3,32,7 2,2,1 K
#box 3,33,3 2,1,2 K
`;

T.shelf_bottles = `#model shelf_bottles
#cell 0.05
#ink T #3a3a3d matte
#ink K #1e1f22 matte
#ink A #b5651d gloss
#ink W #e8e8e8 gloss
#ink B #2f6fbf gloss
#ink G #3f9a4a gloss
#box 0,0,0 18,1,4 T
#box 0,4,0 18,1,4 T
#part z n=2 at=0,1,1
.K.K..K.K..K.K..K.
.A.W..B.G..A.W..B.
.A.W..B.G..A.W..B.
#part z n=2 at=0,5,1
.K..K..K..K..K..K.
.AA.WW.BB.GG.AA.WW
.AA.WW.BB.GG.AA.WW
.AA.WW.BB.GG.AA.WW
`;

// ======================= HOL =======================
T.shoe_rack = `#model shoe_rack
#cell 0.05
#ink T #a07a4e matte
#ink K #1e1f22 matte
#ink R #b8302a matte
#ink W #e8e8e8 matte
#ink B #2f5d8a matte
#ink N #6b4a33 matte
#box 0,0,0 1,7,6 T
#box 15,0,0 1,7,6 T
#box 1,1,0 14,1,6 T
#box 1,6,0 14,1,6 T
#part x n=2 at=2,2,0
...RRR
RRRRRR
KKKKKK
#part x n=2 at=9,2,0
...WWW
WWWWWW
KKKKKK
#part x n=2 at=5,7,0
...BBB
BBBBBB
KKKKKK
#part x n=2 at=12,7,0
...NNN
NNNNNN
KKKKKK
`;

T.coat_hooks = `#model coat_hooks
#cell 0.05
#ink T #a07a4e matte
#ink S #b9bec6 metal
#ink J #2f5a3a matte
#box 0,2,0 16,2,1 T
#part z n=1 at=7,0,1
...JJ...
.JJJJJJ.
JJJJJJJJ
JJJJJJJJ
#box 2,2,1 1,1,2 S
#box 2,3,2 1,1,1 S
#box 6,2,1 1,1,2 S
#box 6,3,2 1,1,1 S
#box 10,2,1 1,1,2 S
#box 10,3,2 1,1,1 S
#box 13,2,1 1,1,2 S
#box 13,3,2 1,1,1 S
`;

// ======================= OGRÓD =======================
T.garden_table = `#model garden_table
#cell 0.1
#ink T #8b7d6b matte
#ink D #5e5449 matte
#box 0,6,0 12,1,8 T
#part y n=1 at=0,6,0
TTTTTTTTTTTT
TTTTTTTTTTTT
DDDDDDDDDDDD
TTTTTTTTTTTT
TTTTTTTTTTTT
DDDDDDDDDDDD
TTTTTTTTTTTT
TTTTTTTTTTTT
#box 1,5,1 10,1,6 D
#box 1,0,1 1,5,1 D
#box 10,0,1 1,5,1 D
#box 1,0,6 1,5,1 D
#box 10,0,6 1,5,1 D
`;

T.garden_bench = `#model garden_bench
#cell 0.05
#ink T #a07a4e matte
#ink K #2a2622 matte
#box 0,8,0 30,1,2 T
#box 0,8,3 30,1,2 T
#box 0,8,6 30,1,2 T
#box 2,0,1 2,8,6 K
#box 26,0,1 2,8,6 K
#box 4,1,3 22,1,2 K
`;

T.grill = `#model grill
#cell 0.05
#ink K #1e1f22 matte
#ink S #b9bec6 metal
#box 2,0,2 1,8,1 K
#box 9,0,2 1,8,1 K
#box 5,0,8 1,8,1 K
#part y n=1 at=3,8,2
.KKKK.
KKKKKK
KKKKKK
KKKKKK
KKKKKK
.KKKK.
#part y n=1 at=2,9,1
..KKKK..
.KKKKKK.
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
.KKKKKK.
..KKKK..
#part y n=3 at=1,10,0
...KKKK...
.KKKKKKKK.
.KKKKKKKK.
KKKKKKKKKK
KKKKKKKKKK
KKKKKKKKKK
KKKKKKKKKK
.KKKKKKKK.
.KKKKKKKK.
...KKKK...
#part y n=1 at=1,13,0
...SSSS...
.SSSSSSSS.
.SSSSSSSS.
SSSSSSSSSS
SSSSSSSSSS
SSSSSSSSSS
SSSSSSSSSS
.SSSSSSSS.
.SSSSSSSS.
...SSSS...
#part y n=1 at=1,14,0
...KKKK...
.KKKKKKKK.
.KKKKKKKK.
KKKKKKKKKK
KKKKKKKKKK
KKKKKKKKKK
KKKKKKKKKK
.KKKKKKKK.
.KKKKKKKK.
...KKKK...
#part y n=1 at=2,15,1
..KKKK..
.KKKKKK.
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
.KKKKKK.
..KKKK..
#part y n=1 at=3,16,2
.KKKK.
KKKKKK
KKKKKK
KKKKKK
KKKKKK
.KKKK.
#box 5,17,4 2,1,2 S
#box 0,11,4 1,1,2 S
#box 11,11,4 1,1,2 S
`;

T.pool_ladder = `#model pool_ladder
#cell 0.05
#ink S #b9bec6 metal
#part x n=1 at=0,0,0
.SSSSSS.....
.S....S.....
.S....S.....
.S....S.....
.S....S.....
.S....S.....
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
#part x n=1 at=9,0,0
.SSSSSS.....
.S....S.....
.S....S.....
.S....S.....
.S....S.....
.S....S.....
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
.S..........
#box 1,5,10 8,1,1 S
#box 1,10,10 8,1,1 S
#box 1,15,10 8,1,1 S
#box 0,0,9 2,1,3 S
#box 8,0,9 2,1,3 S
`;

T.mailbox = `#model mailbox
#cell 0.05
#ink P #2a2622 matte
#ink G #2f5a3a matte
#ink K #101113 matte
#ink W #f0f0ee matte
#box 2,0,2 2,16,2 P
#box 0,16,0 6,8,5 G
#part z n=1 at=0,16,4
......
.KKKK.
......
.W.WWW
.W...W
.W..W.
......
......
`;

T.wheelie_bin = `#model wheelie_bin
#cell 0.05
#ink G #2f5a3a matte
#ink L #3b6b45 matte
#ink K #1e1f22 matte
#part x n=1 at=0,0,0
.KK.
KKKK
KKKK
.KK.
#part x n=1 at=11,0,0
.KK.
KKKK
KKKK
.KK.
#box 1,1,1 10,2,2 K
#box 3,0,11 6,2,2 K
#box 2,2,3 8,6,9 G
#box 1,8,2 10,11,11 G
#box 0,19,1 12,1,13 L
#box 0,20,1 12,1,6 L
#box 1,20,0 10,1,1 K
`;

T.wheelie_bin_black = `#model wheelie_bin_black
#cell 0.05
#ink G #2b2d30 matte
#ink L #e5c11a matte
#ink K #141517 matte
#part x n=1 at=0,0,0
.KK.
KKKK
KKKK
.KK.
#part x n=1 at=11,0,0
.KK.
KKKK
KKKK
.KK.
#box 1,1,1 10,2,2 K
#box 3,0,11 6,2,2 K
#box 2,2,3 8,6,9 G
#box 1,8,2 10,11,11 G
#box 0,19,1 12,1,13 L
#box 0,20,1 12,1,6 L
#box 1,20,0 10,1,1 K
`;

T.dog_house = `#model dog_house
#cell 0.05
#ink T #a07a4e matte
#ink D #7a5a38 matte
#ink R #7a2323 matte
#ink K #0b0b0d matte
#box 0,0,0 18,10,22 T
#part z n=1 at=0,0,21
..................
DDDDDDDDDDDDDDDDDD
..................
DDDDDDDDDDDDDDDDDD
..................
DDDDDDDDDDDDDDDDDD
..................
DDDDDDDDDDDDDDDDDD
..................
..................
#box 0,10,0 18,1,22 R
#box 1,11,0 16,1,22 R
#box 2,12,0 14,1,22 R
#box 3,13,0 12,1,22 R
#box 4,14,0 10,1,22 R
#box 5,15,0 8,1,22 R
#box 6,16,0 6,1,22 R
#part z n=1 at=5,0,21
..KKKK..
.KKKKKK.
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
KKKKKKKK
`;

T.deck_chair = `#model deck_chair
#cell 0.05
#ink W #f0f0ee matte
#ink B #2b5fb3 matte
#ink F #f6f6f2 matte
#box 0,0,28 1,6,2 W
#box 11,0,28 1,6,2 W
#box 0,0,12 1,6,2 W
#box 11,0,12 1,6,2 W
#box 1,5,28 10,1,1 W
#box 1,5,12 10,1,1 W
#part x n=1 at=0,6,0
..............................WW
.............................WWW
............................WWW.
...........................WWW..
..........................WWW...
........................WWWW....
......................WWWWW.....
....................WWWWW.......
WWWWWWWWWWWWWWWWWWWWWWW.........
WWWWWWWWWWWWWWWWWWWWWW..........
#part x n=1 at=11,6,0
..............................WW
.............................WWW
............................WWW.
...........................WWW..
..........................WWW...
........................WWWW....
......................WWWWW.....
....................WWWWW.......
WWWWWWWWWWWWWWWWWWWWWWW.........
WWWWWWWWWWWWWWWWWWWWWW..........
#part x n=3 at=1,6,0
...............................B
..............................BB
.............................BB.
............................BB..
...........................BB...
..........................BB....
........................BBB.....
......................BBB.......
....................BBB.........
BBBBBBBBBBBBBBBBBBBBBB..........
#part x n=4 at=4,6,0
...............................F
..............................FF
.............................FF.
............................FF..
...........................FF...
..........................FF....
........................FFF.....
......................FFF.......
....................FFF.........
FFFFFFFFFFFFFFFFFFFFFF..........
#part x n=3 at=8,6,0
...............................B
..............................BB
.............................BB.
............................BB..
...........................BB...
..........................BB....
........................BBB.....
......................BBB.......
....................BBB.........
BBBBBBBBBBBBBBBBBBBBBB..........
`;

T.bike = `#model bike
#cell 0.05
#ink K #101113 matte
#ink B #2e3238 matte
#ink S #b9bec6 metal
#ink D #6b4a33 matte
#part z n=2 at=0,0,3
....KKKKK....
...K.....K...
..K.......K..
.K.........K.
K...........K
K.....S.....K
K....SSS....K
K.....S.....K
K...........K
.K.........K.
..K.......K..
...K.....K...
....KKKKK....
#part z n=2 at=21,0,3
....KKKKK....
...K.....K...
..K.......K..
.K.........K.
K...........K
K.....S.....K
K....SSS....K
K.....S.....K
K...........K
.K.........K.
..K.......K..
...K.....K...
....KKKKK....
#part z n=1 at=0,0,4
..................................
.........................B........
.............B...........B........
.............BBBBBBBBBBBBB........
............BB..........BB........
...........B.B.........B..B.......
..........B...B.......B...B.......
..........B...B......B....B.......
.........B....B.....B.....B.......
........B.....B....B.......B......
.......B......B...B........B......
......BBB......B.B.........B......
.........BBBB.SBS.................
.............BSBS.................
..............SSS.................
..................................
..................................
..................................
#box 10,16,2 6,1,3 D
#box 24,17,1 3,1,6 B
#box 14,3,1 1,1,2 S
#box 16,3,5 1,1,2 S
`;

T.hex_light = `#model hex_light
#cell 0.1
#ink L #f4f7ff glow
#part y n=1 at=0,0,0
....L.......L.......L....
..LL.LL...LL.LL...LL.LL..
.L.....L.L.....L.L.....L.
L.......L.......L.......L
L.......L.......L.......L
L.......L.......L.......L
.LL...LL.LL...LL.LL...LL.
...L.L.....L.L.....L.L...
....L.......L.......L....
....L.......L.......L....
....L.......L.......L....
..LL.LL...LL.LL...LL.LL..
.L.....L.L.....L.L.....L.
L.......L.......L.......L
L.......L.......L.......L
L.......L.......L.......L
.LL...LL.LL...LL.LL...LL.
...L.L.....L.L.....L.L...
....L.......L.......L....
`;

T.flower_bed = `#model flower_bed
#cell 0.05
#ink T #6b4a33 matte
#ink E #2f2419 matte
#ink G #3f7a3a matte
#ink R #d1352b matte
#ink Y #e8c531 matte
#ink W #f0f0ee matte
#box 0,0,0 20,3,10 T
#box 1,2,1 18,1,8 E
#part y n=3 at=1,3,1
..G....G....G...G.
....G....G....G...
.G....G....G....G.
......G....G....G.
..G....G......G...
....G....G....G.G.
.G....G....G......
...G.....G....G...
#part y n=1 at=1,6,1
..R....Y....W...R.
....W....R....Y...
.Y....R....Y....W.
......W....R....R.
..R....Y......W...
....W....R....Y.R.
.Y....R....W......
...R.....Y....W...
`;


export const VOXEL_TEXT: Readonly<Record<string, string>> = T;

/** Every model, parsed once. A typo in a text throws at load, naming its line. */
export const VOXEL_MODELS: Readonly<Record<string, VoxelModel>> = Object.fromEntries(
  Object.entries(T).map(([id, text]) => {
    const m = parseVoxelText(text);
    if (m.id !== id) throw new Error(`voxelModels: "${id}" declares #model ${m.id}`);
    return [id, m];
  }),
);

