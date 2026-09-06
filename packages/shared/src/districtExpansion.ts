import { boxFrom } from "./collision";
import type { Solid, MaterialTag, PropHint, LightHint, SpawnPoint } from "./map";

/** Two playable blocks, connected to the original district through three portals per side. */
export function expandDistrict(solids: Solid[], props: PropHint[], lights: LightHint[]): SpawnPoint[] {
  const s = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: MaterialTag) =>
    solids.push({ name, box: boxFrom(x, y, z, w, h, d), mat });
  for (const side of [-1, 1]) {
    const x = side < 0 ? -45 : 35;
    s(`extension_ground_${side}`, x, -1, -22, 18, 1, 67, "floor_concrete");
    s(`extension_south_${side}`, x, 0, -22.3, 18, 7, .3, "wall_sand");
    s(`extension_north_${side}`, x, 0, 45, 18, 7, .3, "wall_teal");
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
      s(`${name}_front_w_${dz}`, x, 0, z + dz, w * .35, H, .3, mat);
      s(`${name}_front_e_${dz}`, x + w * .35 + 3, 0, z + dz, w * .65 - 3, H, .3, mat);
      s(`${name}_header_${dz}`, x + w * .35, 2.8, z + dz, 3, H - 2.8, .3, mat);
    }
    s(`${name}_roof`, x - .15, H, z - .15, w + .3, .22, d + .3, "ceiling");
    s(`${name}_counter`, x + .6, 0, z + 3, 1, 1.05, 3.5, "wood");
    s(`${name}_island`, x + w - 3.5, 0, z + d - 4, 2, 1.1, 1.2, "counter");
    props.push({ kind: "sign", x: x + w / 2, y: 3.5, z: z - .03, yaw: Math.PI, text: name === "cafe" ? "NIGHT OWL / CAFE" : "DEPOT / WORKSHOP", w: w - 1, h: .6 });
    props.push({ kind: "tube_light", x: x + w / 2, y: H - .12, z: z + d / 2, w: 2 });
    props.push({ kind: "bottle_row", x: x + 1.1, y: 1.05, z: z + 4.5, yaw: Math.PI / 2, w: 2.5 });
    lights.push({ kind: "point", x: x + w / 2, y: 3.3, z: z + d / 2, color: name === "cafe" ? "#ffd7aa" : "#c8e1ef", intensity: 24, range: 11, priority: 7 });
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
  // Site cover (2.2). The plant zones are 10 × 8 m (see BOMB_SITES): a few pieces INSIDE each zone
  // give the planter a corner to hide the charge in and the retake something to clear, the centre
  // and every entrance stay open. Everything outside a zone is lane cover as before.
  for (const [x, z, w, h, d, look, mat] of [
    // A / DEPOT (x -40..-30, z 20.5..28.5): a container on the west edge, drums in the north-west
    // corner, a pallet stack on the south edge, a crate on the east side, a low block wall making
    // a plant nook against the north edge.
    [-42, 20, 3.5, 2.4, 2, "container", "corrugated_red"], [-39.3, 25.6, 1.3, 1.1, 1.3, "drums", "paint_yellow"],
    [-35.2, 20.7, 1.8, 0.9, 1.2, "pallets", "wood"], [-32, 26, 2, 1.3, 2, "crate", "wood"],
    [-38, 27.6, 2.6, 0.9, 0.4, "planter", "concrete_block"],
    [-39, 30, 3, 1.1, 1, "planter", "wall_concrete"], [-35, -12, 2, 1.8, 3, "dumpster", "paint_green"],
    // B / COURTYARD (x 38..48, z 20.5..28.5): a crate on the west edge, a low planter in the
    // north-west quarter, a bench on the south edge, drums in the north-east corner, a crate
    // outside to the east. The centre (also Domination's C) stays open.
    [38, 23, 2.2, 2.2, 2, "crate", "paint_blue"], [40.5, 25.8, 2.4, 0.7, 2.2, "planter", "wall_concrete"],
    [44.6, 20.7, 1.9, 0.5, 0.5, "crate", "wood"], [45.9, 26.9, 1.3, 1.1, 1.3, "drums", "paint_blue"],
    [47.6, 27, 2.4, 1.2, 2, "crate", "wood"],
    [43, 32, 3.5, 1.1, 1, "planter", "wall_concrete"], [43, -10, 2, 1.8, 3, "dumpster", "paint_blue"],
    [-42, 36, 4, 2.7, 3, "portacabin", "paint_white"], [47, 37, 4, 2.7, 3, "portacabin", "paint_blue"],
  ] as const) solids.push({ name: `district_cover_${x}_${z}`, box: boxFrom(x, 0, z, w, h, d), look, mat });
  // Gatehouse baffles break the new long lanes without making dead ends.
  for (const [x, z] of [[-39, -3], [-36, 16], [42, -3], [44, 17]]) s(`lane_baffle_${x}`, x, 0, z, 2.8, 1.5, .4, "wall_sand");
  for (const [x, z, id, title] of [[-35, 24.5, "A", "A / DEPOT"], [43, 24.5, "B", "B / COURTYARD"]] as const) {
    props.push({ kind: "lamp", x, y: 0, z: z - 6, variant: "post" });
    lights.push({ kind: "point", x, y: 4.3, z: z - 6, color: "#ffd29d", intensity: 27, range: 14, priority: 6 });
    // The letter, big, on both walls that face the zone: readable from every approach.
    props.push({ kind: "sign", x: x < 0 ? -44.97 : 52.97, y: 2.6, z, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, text: title, w: 5, h: 1.4 });
    // Stencilled site letters: on the lane wall facing the site and high on the far wall.
    props.push({ kind: "stencil", x: x < 0 ? -27.33 : 35.33, y: 2.6, z, yaw: x < 0 ? -Math.PI / 2 : Math.PI / 2, variant: "yellow", text: id, w: 2.8, h: 2.8 });
    props.push({ kind: "stencil", x: x < 0 ? -44.96 : 52.96, y: 4.8, z: z - 3, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, variant: "yellow", text: `SITE ${id}`, w: 4.5, h: 1.4 });
  }
  return [
    { x: -40, y: .05, z: -12, yaw: 0, team: 0 }, { x: 49, y: .05, z: -13, yaw: 0, team: 0 },
    { x: -30, y: .05, z: 16, yaw: 0, team: 0 }, { x: 37, y: .05, z: 17, yaw: 0, team: 0 },
    { x: -42, y: .05, z: 32, yaw: Math.PI, team: 1 }, { x: 50, y: .05, z: 32, yaw: Math.PI, team: 1 },
    { x: -33, y: .05, z: 40, yaw: Math.PI, team: 1 }, { x: 39, y: .05, z: 41, yaw: Math.PI, team: 1 },
  ];
}
