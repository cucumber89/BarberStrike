import { boxFrom } from "./collision";
import type { Solid, MaterialTag, PropHint, LightHint, SpawnPoint } from "./map";

/** Two playable blocks, connected to the original district through three portals per side. */
export function expandDistrict(solids: Solid[], props: PropHint[], lights: LightHint[], palette: { amber: string; mercury: string }): SpawnPoint[] {
  const s = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: MaterialTag) =>
    solids.push({ name, box: boxFrom(x, y, z, w, h, d), mat });
  // The buildings' own floor slabs (see `room`) sit at exactly y = 0, so the yard paving is laid
  // AROUND them, not under them. Laying one 18 × 67 slab across the whole side put two surfaces on
  // the same plane over the depot (132 m²) and the cafe (144 m²) — on the very slabs that carry
  // bomb sites A and B. Coplanar faces cannot be ordered by a depth buffer, so which one wins
  // flips per pixel and per frame as the camera moves; that crawling shimmer is what the report of
  // "the floor at A and B lags" describes. `floorAudit.test.ts` gates it.
  const ground = (side: number, name: string, x: number, z: number, w: number, d: number) =>
    s(`extension_ground_${side}${name}`, x, -1, z, w, 1, d, "floor_concrete");
  for (const side of [-1, 1]) {
    const x = side < 0 ? -45 : 35;
    // Footprint of the building on this side (depot at x -43..-32 z 0..12, cafe at x 38..50 z 1..13).
    const [bx0, bz0, bw, bd] = side < 0 ? [-43, 0, 11, 12] : [38, 1, 12, 12];
    ground(side, "_s", x, -22, 18, bz0 + 22);
    ground(side, "_n", x, bz0 + bd, 18, 45 - (bz0 + bd));
    ground(side, "_w", x, bz0, bx0 - x, bd);
    ground(side, "_e", bx0 + bw, bz0, x + 18 - (bx0 + bw), bd);
    // The core block's own perimeter already spans x -27.3..35.3. Starting the extension wall
    // inside it makes the two butt; overlapping by 0.3 m put both outer faces on one plane.
    const wx = side < 0 ? x : x + .3;
    s(`extension_south_${side}`, wx, 0, -22.3, 17.7, 7, .3, "wall_sand");
    s(`extension_north_${side}`, wx, 0, 45, 17.7, 7, .3, "wall_teal");
    s(`extension_edge_${side}`, side < 0 ? -45.3 : 53, 0, -22, .3, 7, 67, side < 0 ? "wall_sand" : "wall_teal");
  }
  // Reuse the old perimeter as building walls with wide, deliberately staggered entrances.
  for (let i = solids.length - 1; i >= 0; i--) if (solids[i].name === "west_facade" || solids[i].name === "east_facade") solids.splice(i, 1);
  for (const x of [-27.3, 35]) for (const [a, b] of [[-22, -7], [0, 12], [18, 28], [35, 45]]) {
    s(`lane_wall_${x}_${a}`, x, 0, a, .3, 7, b - a, "wall_brick");
  }
  const room = (name: string, x: number, z: number, w: number, d: number, mat: MaterialTag) => {
    const H = 4.2;
    s(`${name}_floor`, x, -.03, z, w, .03, d, name === "cafe" ? "floor_tile" : "floor_metal");
    s(`${name}_west`, x, 0, z, .3, H, d, mat);
    // Side door opens to the narrow connector alongside the building.
    s(`${name}_east_s`, x + w - .3, 0, z, .3, H, d * .4, mat);
    s(`${name}_east_n`, x + w - .3, 0, z + d * .4 + 2.5, .3, H, d * .6 - 2.5, mat);
    s(`${name}_east_header`, x + w - .3, 2.7, z + d * .4, .3, H - 2.7, 2.5, mat);
    for (const dz of [0, d - .3]) {
      // Front walls run BETWEEN the side walls. Starting them at the building's corner made the
      // two boxes overlap there with their outer faces on the same plane — sixteen z-fighting
      // corners across the depot and the cafe, from this one helper.
      s(`${name}_front_w_${dz}`, x + .3, 0, z + dz, w * .35 - .3, H, .3, mat);
      s(`${name}_front_e_${dz}`, x + w * .35 + 3, 0, z + dz, w * .65 - 3.3, H, .3, mat);
      s(`${name}_header_${dz}`, x + w * .35, 2.8, z + dz, 3, H - 2.8, .3, mat);
    }
    s(`${name}_roof`, x - .15, H, z - .15, w + .3, .22, d + .3, "ceiling");
    s(`${name}_counter`, x + .6, 0, z + 3, 1, 1.05, 3.5, "wood");
    s(`${name}_island`, x + w - 3.5, 0, z + d - 4, 2, 1.1, 1.2, "counter");
    props.push({ kind: "sign", x: x + w / 2, y: 3.5, z: z - .03, yaw: Math.PI, text: name === "cafe" ? "NOCNA SOWA / KAWA" : "ZAJEZDNIA / SERWIS", w: w - 1, h: .6 });
    props.push({ kind: "tube_light", x: x + w / 2, y: H - .12, z: z + d / 2, w: 2 });
    props.push({ kind: "bottle_row", x: x + 1.1, y: 1.05, z: z + 4.5, yaw: Math.PI / 2, w: 2.5 });
    lights.push({ kind: "point", x: x + w / 2, y: 3.3, z: z + d / 2, color: name === "cafe" ? palette.amber : palette.mercury, intensity: 24, range: 11, priority: 7 });
  };
  room("depot", -43, 0, 11, 12, "wall_sand");
  room("cafe", 38, 1, 12, 12, "wall_teal");
  // Cafe seating occupies the sides, preserving a three-metre centre route.
  s("cafe_bench", 38.5, 0, 8.7, 1.2, .5, 2.5, "leather");
  s("cafe_table", 40.3, 0, 9.2, 1.25, .76, 1.35, "wood");
  props.push({ kind: "bottle_row", x: 40.93, y: .76, z: 9.8, w: .7 });
  props.push({ kind: "poster", x: 38.31, y: 2, z: 9.7, yaw: Math.PI / 2, variant: "hours" });
  props.push({ kind: "terminal", x: 39.1, y: 1.05, z: 4.3, yaw: Math.PI / 2 });
  // A raised industrial canopy gives A a recognizable silhouette, with supported roof beams.
  s("depot_site_roof", -40, 4.4, 22, 10, .2, 6, "corrugated_red");
  for (const x of [-39.85, -30.3]) for (const z of [22.15, 27.7]) s(`site_pillar_${x}_${z}`, x, 0, z, .2, 4.4, .2, "metal");
  // High cover on the edge of each site; centre and both exits remain clear for plants and retakes.
  for (const [x, z, w, h, d, look, mat] of [
    [-42, 20, 3.5, 2.4, 2, "container", "corrugated_red"], [-32, 26, 2, 1.3, 2, "crate", "wood"],
    [-39, 30, 3, 1.1, 1, "planter", "wall_concrete"], [-35, -12, 2, 1.8, 3, "dumpster", "paint_green"],
    [38, 23, 2.2, 2.2, 2, "crate", "paint_blue"], [47, 27, 3, 1.2, 2, "crate", "wood"],
    [43, 32, 3.5, 1.1, 1, "planter", "wall_concrete"], [43, -10, 2, 1.8, 3, "dumpster", "paint_blue"],
    [-42, 36, 4, 2.7, 3, "portacabin", "paint_white"], [47, 37, 4, 2.7, 3, "portacabin", "paint_blue"],
  ] as const) solids.push({ name: `district_cover_${x}_${z}`, box: boxFrom(x, 0, z, w, h, d), look, mat });
  // Gatehouse baffles break the new long lanes without making dead ends.
  for (const [x, z] of [[-39, -3], [-36, 16], [42, -3], [44, 17]]) s(`lane_baffle_${x}`, x, 0, z, 2.8, 1.5, .4, "wall_sand");
  for (const [x, z, title] of [[-35, 24, "A / ZAJEZDNIA"], [43, 24, "B / DZIEDZINIEC"]] as const) {
    props.push({ kind: "lamp", x, y: 0, z: z - 5, variant: "post" });
    lights.push({ kind: "point", x, y: 4.3, z: z - 5, color: palette.amber, intensity: 27, range: 14, priority: 6 });
    props.push({ kind: "sign", x: x < 0 ? -44.97 : 52.97, y: 2.5, z, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, text: title, w: 4.5, h: 1.3 });
  }
  return [
    { x: -40, y: .05, z: -12, yaw: 0, team: 0 }, { x: 49, y: .05, z: -13, yaw: 0, team: 0 },
    { x: -30, y: .05, z: 16, yaw: 0, team: 0 }, { x: 37, y: .05, z: 17, yaw: 0, team: 0 },
    { x: -42, y: .05, z: 32, yaw: Math.PI, team: 1 }, { x: 50, y: .05, z: 32, yaw: Math.PI, team: 1 },
    { x: -33, y: .05, z: 40, yaw: Math.PI, team: 1 }, { x: 39, y: .05, z: 41, yaw: Math.PI, team: 1 },
  ];
}
