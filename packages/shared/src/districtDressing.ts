import type { LightHint, PropHint } from "./map";

/**
 * Visual-only dressing of the district (2.2): the things that make a place look lived in —
 * furniture, tools, litter, wires, banners. Everything here is a PropHint (no collision), so the
 * walk grid, spawns and lines of fire are exactly what `map.ts` and `districtExpansion.ts` define.
 *
 * Conventions (see props.ts): +X east, +Z north, yaw 0 faces +Z. Floor props anchor at the floor
 * (or counter top) they stand on; wall props sit 2–4 cm off the wall face with their yaw facing the
 * room (local -Z into the wall); overhead runs anchor at their midpoint and stretch `w` along yaw.
 * Bomb sites A (-35, 24) and B (43, 24) keep a 3 m clear radius, and every doorway stays free.
 */
export function dressDistrict(props: PropHint[], lights: LightHint[]): void {
  const p = (hint: PropHint) => props.push(hint);
  /** Overhead run between two attachment points at height y: anchor at the midpoint, yaw along the run. */
  const run = (kind: "wire" | "string_lights", ax: number, az: number, bx: number, bz: number, y: number, sag: number) => {
    const dx = bx - ax, dz = bz - az;
    p({ kind, x: (ax + bx) / 2, y, z: (az + bz) / 2, yaw: Math.atan2(dx, dz), w: Math.hypot(dx, dz), h: sag });
  };
  const HALF = Math.PI / 2;

  // ---------- Cafe "NIGHT OWL" (x 38..50, z 1..13; counter x 38.6..39.6 z 4..7.5; centre route x 42..46 stays clear) ----------
  p({ kind: "cafe_table", x: 47.9, y: 0, z: 3.2, yaw: 0.3 });
  p({ kind: "cafe_table", x: 47.6, y: 0, z: 11.8, yaw: -0.2 });
  p({ kind: "cafe_table", x: 40.7, y: 0, z: 2.6, yaw: HALF });
  for (const [x, z] of [[47.9, 3.2], [47.6, 11.8], [40.7, 2.6]]) p({ kind: "pendant", x, y: 3.3, z, h: 0.9 });
  p({ kind: "coffee_machine", x: 39.1, y: 1.05, z: 6.9, yaw: HALF });
  p({ kind: "cups", x: 39.15, y: 1.05, z: 6.2, yaw: HALF, w: 0.25 });
  p({ kind: "napkins", x: 39.4, y: 1.05, z: 5.92 });
  p({ kind: "cups", x: 41.2, y: 0.76, z: 9.45, w: 0.25 });
  p({ kind: "napkins", x: 40.55, y: 0.76, z: 10.25 });
  p({ kind: "menu_board", x: 38.33, y: 2.45, z: 5.75, yaw: HALF, w: 2.2, h: 0.9, text: "ESPRESSO 2.50\nFLAT WHITE 3.20\nNIGHT OWL BLEND 3.80\nTOAST + JAM 2.00" });
  p({ kind: "wall_clock", x: 40.6, y: 3.0, z: 12.67, yaw: Math.PI });
  p({ kind: "pinboard", x: 40.6, y: 1.75, z: 1.33, yaw: 0, w: 0.9, h: 0.6, text: "BACK IN 5\n- OWL" });
  p({ kind: "plant", x: 49.15, y: 0, z: 1.85 });
  p({ kind: "plant", x: 46.8, y: 1.1, z: 9.3, scale: 0.45 });
  p({ kind: "string_lights", x: 40, y: 3.95, z: 7, yaw: 0, w: 11, h: 0.45 });
  p({ kind: "a_frame", x: 41.4, y: 0, z: -0.7, yaw: Math.PI + 0.25, text: "NIGHT OWL\nCOFFEE - LATE" });
  p({ kind: "chalk", x: 40.2, y: 0, z: 0.3, yaw: Math.PI, text: "FRESH BEANS", w: 1.2, h: 0.4 });

  // ---------- Depot / workshop (x -43..-32, z 0..12; counter x -42.4..-41.4 z 3..6.5; island x -35.5..-33.5 z 8..9.2) ----------
  p({ kind: "tool_board", x: -42.67, y: 2.3, z: 4.75, yaw: HALF, w: 2.4, h: 1.1 });
  p({ kind: "tyre_stack", x: -41.6, y: 0, z: 10.6, variant: "tall" });
  p({ kind: "tyre_stack", x: -40.85, y: 0, z: 10.4 });
  p({ kind: "jack", x: -40.3, y: 0, z: 8.4, yaw: -0.6 });
  p({ kind: "cone", x: -39.2, y: 0, z: 9.0 });
  p({ kind: "oil_cans", x: -41.9, y: 1.05, z: 6.2, yaw: HALF, w: 0.3 });
  p({ kind: "oil_cans", x: -42.2, y: 0, z: 9.4, yaw: HALF, w: 0.45 });
  p({ kind: "shelf_rack", x: -34, y: 0, z: 0.58, yaw: 0, w: 2.0 });
  p({ kind: "shelf_rack", x: -32.58, y: 0, z: 9.9, yaw: -HALF, w: 2.0 });
  p({ kind: "work_lamp", x: -40.6, y: 3.1, z: 9.2, h: 1.1 });
  p({ kind: "work_lamp", x: -34.5, y: 3.0, z: 8.6, h: 1.2 });
  p({ kind: "hazard_tape", x: -34.5, y: 0, z: 7.6, yaw: 0, w: 2.6 });
  p({ kind: "hazard_tape", x: -35.85, y: 0, z: 8.6, yaw: HALF, w: 1.6 });
  p({ kind: "calendar", x: -41.5, y: 1.9, z: 0.33, yaw: 0 });
  p({ kind: "poster", x: -32.33, y: 2.0, z: 3.0, yaw: -HALF, variant: "2" });
  p({ kind: "broom", x: -32.6, y: 0, z: 11.35, yaw: -HALF });

  // ---------- Backlot repair bay + kiosk (x -27..-14) ----------
  p({ kind: "tool_board", x: -21.1, y: 1.9, z: 9.67, yaw: Math.PI, w: 1.4, h: 0.8 });
  p({ kind: "work_lamp", x: -19.2, y: 3.0, z: 5.5, h: 0.5 });
  p({ kind: "oil_cans", x: -21.4, y: 1.0, z: 7.6, yaw: HALF, w: 0.35 });
  p({ kind: "cups", x: -21.3, y: 1.0, z: 16.1, w: 0.2 });
  p({ kind: "magazines", x: -22.1, y: 1.0, z: 16.0, yaw: 0.3 });
  p({ kind: "pinboard", x: -25.97, y: 1.7, z: 16, yaw: HALF, w: 0.8, h: 0.55, text: "NO CREDIT\nNO EXCEPTIONS" });
  p({ kind: "a_frame", x: -24.3, y: 0, z: 12.7, yaw: Math.PI + 0.2, text: "KIOSK 24H\nSMOKES - ICE" });
  p({ kind: "chalk", x: -20.6, y: 0, z: 13.2, yaw: Math.PI, text: "24H", w: 0.8, h: 0.4 });

  // ---------- Barber shop (x -4..8, z 0..10) ----------
  p({ kind: "coat_rack", x: -3.55, y: 0, z: 9.45 });
  p({ kind: "magazines", x: 2.3, y: 0.5, z: 8.9, yaw: 0.2 });
  p({ kind: "magazines", x: 1.7, y: 1.0, z: 5.1, yaw: -0.4 });
  p({ kind: "wall_clock", x: 1.0, y: 2.95, z: 9.82, yaw: Math.PI });
  p({ kind: "certificate", x: 7.83, y: 2.15, z: 2.3, yaw: -HALF });
  p({ kind: "plant", x: 7.4, y: 0, z: 9.45 });
  p({ kind: "plant", x: 7.0, y: 1.05, z: 1.5, scale: 0.45 });
  p({ kind: "cash_tray", x: 4.8, y: 1.05, z: 1.75, yaw: 0.1 });
  p({ kind: "jars", x: 6.05, y: 1.1, z: 5.72, w: 0.6 });
  p({ kind: "jars", x: 1.1, y: 1.0, z: 4.7, w: 0.5 });
  p({ kind: "broom", x: 7.55, y: 0, z: 3.1, yaw: -HALF });

  // ---------- Back hall (x -4..8, z 10..18) ----------
  p({ kind: "laundry_basket", x: -3.5, y: 0, z: 17.3 });
  p({ kind: "towel_stack", x: 4.75, y: 0.95, z: 16.85 });
  p({ kind: "towel_stack", x: 6.1, y: 1.0, z: 11.4 });
  p({ kind: "cups", x: 6.2, y: 0.95, z: 16.75, w: 0.2 });
  p({ kind: "mop_bucket", x: 7.42, y: 0, z: 17.4, yaw: -HALF });
  p({ kind: "fuse_box", x: 2.5, y: 1.6, z: 12.47, yaw: Math.PI });
  p({ kind: "calendar", x: 7.83, y: 1.9, z: 12.2, yaw: -HALF });
  p({ kind: "pinboard", x: -3.97, y: 1.7, z: 16.9, yaw: HALF, w: 0.8, h: 0.55, text: "TOWELS\nBY 6 AM" });
  p({ kind: "work_lamp", x: 5.5, y: 2.95, z: 16.8, h: 0.65 });
  p({ kind: "broom", x: -3.7, y: 0, z: 13.2, yaw: HALF });

  // ---------- Main street (z -22..0) and the east / west lanes ----------
  // Overhead runs between the lamp posts (3.6 m) and along the stalls.
  run("string_lights", -9, -4.5, -14, -19.5, 3.45, 0.6);
  run("string_lights", 4, -6, 12, -19.5, 3.45, 0.6);
  run("wire", -9, -4.5, 4, -6, 3.5, 0.5);
  run("wire", 18, -4.5, 30, -4.5, 3.5, 0.35);
  for (const [x, z] of [[-14.4, -8.6], [-9.6, -7.1], [17.3, -9.7], [21.5, -8.7], [15.1, -2.7], [-35.7, -2.5]]) p({ kind: "cone", x, y: 0, z });
  for (const [x, z, w] of [[-4, -13.8, 1.6], [14.5, -12.3, 1.3], [37, -9, 1.8], [-31, -14, 1.5], [-6, 4, 1.2]]) p({ kind: "puddle", x, y: 0, z, w, yaw: x * 0.7 });
  for (const [x, z] of [[18.9, -6.0], [-22.8, -17.8], [-5.0, 3.1], [-6.3, 15.9], [-17, -4.6]]) p({ kind: "litter", x, y: 0, z });
  p({ kind: "banner", x: -16, y: 4.6, z: -21.97, yaw: 0, text: "NIGHT\nDISTRICT" });
  p({ kind: "banner", x: 16, y: 4.6, z: -21.97, yaw: 0, variant: "blue", text: "LATE\nSHIFT" });
  p({ kind: "banner", x: -2.6, y: 4.3, z: -0.33, yaw: Math.PI, variant: "blade", text: "CUTS\nSHAVES\nCOFFEE" });
  p({ kind: "banner", x: 35.33, y: 4.5, z: 5, yaw: HALF, variant: "green", text: "LATE\nNIGHT\nCUTS" });
  p({ kind: "banner", x: -27.33, y: 4.5, z: 6, yaw: -HALF, variant: "blue", text: "DEPOT\nOPEN" });
  p({ kind: "a_frame", x: 3.6, y: 0.15, z: -0.9, yaw: Math.PI - 0.2, text: "WALK-INS\nWELCOME" });
  p({ kind: "bicycle", x: -11.6, y: 0.15, z: -21.75, yaw: 0 });
  p({ kind: "bicycle", x: 37.82, y: 0, z: 3, yaw: -HALF, variant: "blue" });
  p({ kind: "chalk", x: -2.6, y: 0.15, z: -0.9, yaw: Math.PI, text: "<- CUTS", w: 1.0, h: 0.4 });

  // ---------- Loading yard and north compound (z 18..45) ----------
  run("string_lights", -8, 23, 9, 20, 3.35, 0.75);
  run("string_lights", -6, 33, -8, 42, 3.35, 0.4);
  run("string_lights", 18, 42, 20, 34, 3.35, 0.4);
  run("wire", 9, 20, 20, 34, 3.4, 0.7);
  run("string_lights", 43, 19, 43, 13, 3.4, 0.3);      // site B lamp → cafe roof line
  run("string_lights", -35, 19, -37.5, 12, 3.4, 0.35); // site A lamp → depot roof line
  p({ kind: "pallet_sacks", x: -12, y: 0, z: 33.8, yaw: 0.3 });
  p({ kind: "pallet_sacks", x: 27.2, y: 0, z: 27.6, yaw: -0.4 });
  p({ kind: "pallet_sacks", x: -31.5, y: 0, z: 20, yaw: 0.2 });
  p({ kind: "tarp_heap", x: 15.6, y: 1.0, z: 19.6, yaw: 0.15 });
  p({ kind: "tarp_heap", x: -25.3, y: 0, z: 24.6, yaw: -0.5 });
  for (const [x, z] of [[-12.5, 20.3], [-21, 39]]) {
    p({ kind: "fire_barrel", x, y: 0, z });
    lights.push({ kind: "point", x, y: 1.5, z, color: "#ff7a2a", intensity: 9, range: 6, priority: 5 });
  }
  p({ kind: "stencil", x: 1.2, y: 1.7, z: 21.97, yaw: Math.PI, text: "07" });
  p({ kind: "stencil", x: 3.6, y: 1.7, z: 21.97, yaw: Math.PI, text: "12", variant: "yellow" });
  p({ kind: "stencil", x: 2.4, y: 4.2, z: 22.37, yaw: Math.PI, text: "TOP 03", w: 1.2, h: 0.5 });
  p({ kind: "stencil", x: -38.47, y: 1.5, z: 21, yaw: HALF, text: "A-1", variant: "yellow" });
  p({ kind: "stencil", x: 32.27, y: 1.8, z: 28, yaw: -HALF, text: "GATE 3", w: 1.2, h: 0.5 });
  for (const [x, z] of [[13.2, 23.3], [10.4, 23.4]]) p({ kind: "cone", x, y: 0, z });
  for (const [x, z, w] of [[-2, 32, 2.0], [24, 26.5, 1.6], [31.5, 36.8, 1.5]]) p({ kind: "puddle", x, y: 0, z, w, yaw: z * 0.3 });
  for (const [x, z] of [[-7.0, 21.5], [-1.9, 41.2], [23.9, 31.6]]) p({ kind: "litter", x, y: 0, z });
  p({ kind: "hazard_tape", x: 17, y: 1.0, z: 27.9, yaw: 0, w: 6 });
}
