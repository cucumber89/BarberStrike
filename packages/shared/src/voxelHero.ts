/**
 * Hero voxel models — the ones drawn from the owner's photographs rather than from a catalogue.
 *
 * THE BMW (M240i coupé, F22, "super sportowe dopracowane, ciemny granat trochę szare"): 4.43 m
 * long, 1.77 wide, 1.42 high, wheelbase 2.69, 18" wheels; mineral-grey body with a blue cast,
 * black kidney grilles, LED headlights with the light rings, red LED tail lights, the M badge, a
 * black rear diffuser with four exhaust tips, dark glass. Drawn at 5 cm cells: the side profile
 * is generated column by column from the measured heights (hood, cowl, roof, deck, bumpers,
 * arches) so the silhouette is the car's and not a box, and the plan corners are stepped in.
 * The plate (EL 3E504) is a text prop the map adds beside it — letters need more than 5 cm.
 *
 * Local +Z is the NOSE. x 0 is the driver's-side... no: x is the car's width, z its length.
 */
import { parseVoxelText, type VoxelModel } from "./voxel";

// Cells (5 cm). z: tail = 0, nose = 88. y: ground = 0, roof top = 27.
const L = 89, W = 35, H = 28;
const REAR_AXLE = 19, FRONT_AXLE = 73, WHEEL_R = 6.5, ARCH_R = 8.5;

/** Body top (side silhouette, without the greenhouse) at column z. */
function topAt(z: number): number {
  if (z <= 2) return 14 + z;                         // rear bumper corner rising to the deck
  if (z <= 5) return 18;                             // the spoiler lip on the boot
  if (z < 22) return 17;                             // boot lid, 0.85 m
  if (z < 62) return 18;                             // the belt line under the greenhouse (cowl 0.9)
  if (z < 86) return Math.round(18 - (z - 62) * (4 / 24));   // hood falling to the nose
  return 14;
}
/** Body bottom at column z (the sill, or the bumper lips at the ends). */
function bottomAt(z: number): number {
  if (z <= 1 || z >= 87) return 6;
  if (z <= 4 || z >= 84) return 4;
  return 3;
}
const inArch = (z: number, y: number, axle: number) => (z - axle) ** 2 + (y - WHEEL_R) ** 2 <= ARCH_R * ARCH_R && y <= 14;
const inWheel = (z: number, y: number, axle: number) => (z - axle) ** 2 + (y - WHEEL_R) ** 2 <= WHEEL_R * WHEEL_R;
const inRim = (z: number, y: number, axle: number) => (z - axle) ** 2 + (y - WHEEL_R) ** 2 <= 4.2 * 4.2;
const inHub = (z: number, y: number, axle: number) => (z - axle) ** 2 + (y - WHEEL_R) ** 2 <= 1.5 * 1.5;

/** A side view (seen from +x, columns tail → nose) of the body between z0..z1, rows y = H-1 … 0. */
function sidePicture(z0: number, z1: number, withWheels: boolean, greenhouse: boolean): string[] {
  const rows: string[] = [];
  for (let y = H - 1; y >= 0; y--) {
    let row = "";
    for (let c = 0; c < L; c++) {
      const z = c;                              // col 0 is the tail: a viewer at +x has +z (the nose) on their right
      let ch = ".";
      if (z >= z0 && z <= z1) {
        const arch = inArch(z, y, REAR_AXLE) || inArch(z, y, FRONT_AXLE);
        if (y >= bottomAt(z) && y <= topAt(z) && !arch) ch = "B";
        if (greenhouse && y > 17) ch = roofChar(z, y) ?? ch;
        if (withWheels && (inWheel(z, y, REAR_AXLE) || inWheel(z, y, FRONT_AXLE))) {
          const ax = z < 45 ? REAR_AXLE : FRONT_AXLE;
          ch = inHub(z, y, ax) ? "S" : inRim(z, y, ax) ? "A" : "K";
        }
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

/** The greenhouse: rear window 22→34 rising to the roof (27), roof 34→52, windshield 52→64 falling to the cowl. */
function roofChar(z: number, y: number): string | undefined {
  let top: number;
  if (z < 22 || z > 64) return undefined;
  if (z < 34) top = Math.round(17 + (z - 22) * (10 / 12));
  else if (z <= 52) top = 27;
  else top = Math.round(27 - (z - 52) * (9 / 12));
  if (y > top) return undefined;
  if (y === top) return "B";                                      // roof skin / window frame
  // glass under the skin: side windows between the pillars, the screens on the slopes
  if (z < 34 || z > 52) return y >= 18 ? "G" : "B";               // rear window / windshield
  if (z >= 41 && z <= 43) return "B";                             // B-pillar
  return y >= 19 && y <= 25 ? "G" : "B";                          // side windows
}

/** The front face (seen from +z): kidneys, LED lights with rings, the lower intake, the lip. */
const FRONT = [
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...BBBBBBBBBBBBBBBBBBBBBBBBBBBBB...",
  "..BWWWWBBBBBBBBBBBBBBBBBBBBWWWWB...",
  "..BWKKWBBBBBBKKKKBKKKKBBBBBWKKWB..",
  "..BWKKWBBBBBBKSKKBKKSKBBBBBWKKWB..",
  "..BWWWWBBBBBBKKKKBKKKKBBBBBWWWWB..",
  "..BBBBBBBBBBBBKKKKBKKKKBBBBBBBBBB..",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..",
  "..BKKKKKBBBBBBBBBBBBBBBBBBBKKKKKB..",
  "..BKKKKKBBBBKKKKKKKKKKKKKBBKKKKKB..",
  "..BKKKKKBBBBKKKKKKKKKKKKKBBKKKKKB..",
  "..BBBBBBBBBBKKKKKKKKKKKKKBBBBBBBB..",
  "...BBBBBBBBBBBBBBBBBBBBBBBBBBBBB...",
  "...KKKKKKKKKKKKKKKKKKKKKKKKKKKKK...",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
];
/** The rear face (seen from −z, so drawn mirrored = as the photo shows it): lights, badge, diffuser, four tips. */
const REAR = [
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...BBBBBBBBBBBBBBBBBBBBBBBBBBBBB...",
  "..BBBBBBBBBBBBBBSSBBBBBBBBBBBBBB...",
  "..BRRRRRRBBBBBBBSSBBBBBBBRRRRRRB..",
  "..BRRRRRRRBBBBBBBBBBBBBBRRRRRRRB..",
  "..BRRRRRRRRBBBBBBBBBBBBRRRRRRRRB..",
  "..BBRRRRRRBBBBBBBBBBBBBBRRRRRRBB..",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..",
  "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..",
  "..BBKKKKKKKKKKKKKKKKKKKKKKKKKKKBB..",
  "..BBKSSKSSKKKKKKKKKKKKKKKSSKSSKBB..",
  "..BBKSSKSSKKKKKKKKKKKKKKKSSKSSKBB..",
  "...KKKKKKKKKKKKKKKKKKKKKKKKKKKKK...",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
  "...................................",
];

function bmwText(): string {
  const lines = [
    "#model bmw_m240i", "#cell 0.05",
    "#ink B #3b3f47 gloss",      // mineral grey, a blue cast
    "#ink K #131417 matte",      // shadowline trim, grilles, tyres, diffuser
    "#ink G #56789a glass",      // tinted glass (lighter than the body, or the windows vanish)
    "#ink S #c9ccd2 metal",      // chrome tips, hub caps, badge
    "#ink A #4b4f57 metal",      // the gunmetal rims
    "#ink W #e8f0ff glow",       // LED headlights
    "#ink R #e22a1e glow",       // LED tail lights
    "#ink M #9aa4b8 metal",      // the M badge plate
  ];
  const part = (axis: string, n: number, x: number, y: number, z: number, rows: string[]) => { lines.push("", `#part ${axis} n=${n} at=${x},${y},${z}`, ...rows); };
  // The body in three x-bands, each shorter than the one inside it: stepped-in plan corners.
  part("x", 27, 4, 0, 0, sidePicture(0, 88, false, true));      // the middle band carries the greenhouse
  part("x", 3, 1, 0, 0, sidePicture(2, 86, false, false));
  part("x", 3, 31, 0, 0, sidePicture(2, 86, false, false));
  part("x", 1, 0, 0, 0, sidePicture(6, 82, false, false));
  part("x", 1, 34, 0, 0, sidePicture(6, 82, false, false));
  // Wheels: 25 cm wide, out to the full width (the tyre proud of the sill by one cell).
  part("x", 5, 0, 0, 0, sidePicture(REAR_AXLE - 7, REAR_AXLE + 7, true, false).map((r) => r.replace(/B/g, ".")));
  part("x", 5, 0, 0, 0, sidePicture(FRONT_AXLE - 7, FRONT_AXLE + 7, true, false).map((r) => r.replace(/B/g, ".")));
  part("x", 5, 30, 0, 0, sidePicture(REAR_AXLE - 7, REAR_AXLE + 7, true, false).map((r) => r.replace(/B/g, ".")));
  part("x", 5, 30, 0, 0, sidePicture(FRONT_AXLE - 7, FRONT_AXLE + 7, true, false).map((r) => r.replace(/B/g, ".")));
  // Faces: the nose picture over the last two columns, the tail over the first two.
  part("z", 2, 0, 0, 87, FRONT);
  part("z", 2, 0, 0, 0, REAR.map((r) => [...r].reverse().join("")));
  // Mirrors on the A-pillars, the shark-fin aerial, the M badge on the boot.
  lines.push("", "#box -3,18,58 4,2,4 B", "#box 34,18,58 4,2,4 B", "#box 16,28,36 3,2,4 K", "#box 3,18,7 3,1,2 M");
  return lines.join("\n") + "\n";
}

export const HERO_TEXT: Readonly<Record<string, string>> = {
  bmw_m240i: bmwText(),
};

export const HERO_MODELS: Readonly<Record<string, VoxelModel>> = Object.fromEntries(
  Object.entries(HERO_TEXT).map(([id, text]) => [id, parseVoxelText(text)]),
);
