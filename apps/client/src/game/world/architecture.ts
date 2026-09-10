import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { MapDef, MaterialTag } from "@frankibarber/shared";
import type { AddPiece } from "./dressing";
import { buildStreetscape } from "./streetscape";
import { buildDistrictLandmarks } from "./districtLandmarks";

/** Wall-mounted / surface detail only. Walkable architecture and cover live in the shared map. */
export function buildArchitecture(scene: Scene, map: MapDef, add: AddPiece): void {
  let id = 0;
  const box = (tag: MaterialTag, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) => {
    const m = MeshBuilder.CreateBox(`arch_${id++}`, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y, z); m.rotation.y = ry; add(m, tag); return m;
  };
  buildStreetscape(scene, map, add);
  buildDistrictLandmarks(scene, map, add);
  // Finish the central shop as a small commercial building, with a capped parapet and
  // masonry piers. These follow solid facade sections, clear of its doors and display glass.
  box("wall_concrete", 1.85, 4.83, -.15, 12.7, .13, .5);
  box("metal", 1.85, 4.92, -.15, 12.76, .045, .54);
  for (const x of [-4.18, 7.62]) {
    box("wall_brick", x, 1.65, -.09, .3, 3.3, .18);
    box("wall_concrete", x, .19, -.12, .38, .38, .24);
    box("wall_concrete", x, 3.25, -.12, .42, .16, .27);
  }
  // Thin brass rules frame the existing sign without covering its text plane.
  for (const y of [3.62, 4.30]) box("brass", 2, y, -.25, 11.5, .025, .025);
  for (const z of [1.8, 5.8, 9.5]) {
    box("metal", -4.48, 2.24, z, .075, 2.45, .075);
  }
  // New district storefronts: roof cornices, wall bands, closed display niches and canopy brackets.
  for (const [x, z, w, d, color] of [[-43, 0, 11, 12, "paint_red"], [38, 1, 12, 12, "paint_green"]] as const) {
    for (const dz of [-.2, d + .05]) box(color, x + w / 2, 4.12, z + dz, w + .4, .22, .28);
    for (const px of [x + .15, x + w - .15]) {
      box("paint_white", px, 2.1, z - .08, .2, 4.2, .16);
      box("metal", px, 4.5, z + d / 2, .14, .6, .14);
    }
    for (const px of [x + 1.8, x + w - 1.8]) {
      box("wood", px, 1.8, z - .03, 2.2, 1.8, .10);
      box("glass_dark", px, 1.8, z - .095, 2, 1.6, .03);
      box("brass", px, 1.8, z - .12, .05, 1.6, .03);
      box("wood", px, .87, z - .15, 2.4, .12, .35);
    }
    for (let k = 0; k < 12; k++) box(k % 6 === 0 ? "wall_sand" : color, x + .45 + k * (w / 12), 2.92, z - .7, w / 12, .12, 1.4);
    for (const dz of [2.5, 6.5, 10.5]) box("wood", x + w / 2, 4.06, z + dz, w - .5, .13, .2);
    for (const dz of [3.3, 4.4, 5.5]) box("metal", x + 1.13, .55, z + dz, 1.02, .06, .03);
    for (let k = 0; k < 6; k++) {
      box("paint_yellow", x + w + .8, .014, z + k * 2, .10, .018, 1);
      box("paint_white", x + k * 1.6, .014, z - 3, .7, .018, 1.8);
    }
  }
  // Shop facade: framed entrance, divided display window, cornice and striped shallow canopy.
  for (const x of [-0.08, 2.08]) box("paint_green", x, 1.2, -0.045, 0.13, 2.4, 0.16);
  box("paint_green", 1, 2.43, -0.045, 2.3, 0.15, 0.16);
  for (const x of [3.03, 5, 6.97]) box("brass", x, 1.9, 0.075, 0.055, 1.8, 0.15);
  for (const y of [1.03, 2.77]) box("brass", 5, y, 0.075, 4, 0.065, 0.15);
  box("paint_green", 2, 3.35, -0.2, 12.5, 0.22, 0.48);
  for (let i = 0; i < 16; i++) {
    box(i % 8 === 0 ? "wall_sand" : "paint_green", -3.6 + i * 0.74, 3.1, -0.66, 0.74, 0.10, 1.3);
    box(i % 8 === 0 ? "wall_sand" : "paint_green", -3.6 + i * 0.74, 2.98, -1.25, 0.74, 0.25, 0.06);
  }
  // Garage fascia and shutter slats. Every shutter corresponds to a sealed solid garage bay.
  for (let i = 0; i < 3; i++) {
    const x = -24.4 + i * 4.2;
    box("paint_white", x, 2.84, 3.68, 3.5, 0.16, 0.16);
    if (i === 1) continue;
    for (let k = 0; k < 10; k++) box("metal", x, 0.16 + k * 0.25, 3.69, 3.2, 0.027, 0.045);
    box("metal", x, 1.1, 3.62, 0.36, 0.065, 0.10);
  }
  // Warehouse bands and high windows on its sealed facade, away from the gantry openings.
  box("paint_blue", 14, 5.78, -0.06, 12, 0.25, 0.17);
  for (const x of [10, 12, 14, 16]) {
    box("metal", x, 4.35, -0.05, 1.6, 1.12, 0.10);
    box("glass_dark", x, 4.35, -0.12, 1.43, 0.93, 0.03);
    box("metal", x, 4.35, -0.15, 0.05, 0.93, 0.03);
  }
  // Trim follows each actual wall segment, so doorways and shooting openings stay clear.
  for (const s of map.solids) {
    if (!s.name || !/^(shop_|bh_)/.test(s.name) || !s.mat.startsWith("wall") || s.box.minY > 0) continue;
    const b = s.box, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    if (Math.min(w, d) > 0.35) continue;
    box("wood", (b.minX + b.maxX) / 2, 0.16, (b.minZ + b.maxZ) / 2, w + 0.025, 0.3, d + 0.025);
    box("paint_white", (b.minX + b.maxX) / 2, Math.min(3.45, b.maxY - 0.12), (b.minZ + b.maxZ) / 2, w + 0.025, 0.09, d + 0.025);
  }
  // Fine cabinet fronts give the existing solid counters readable furniture proportions.
  for (const s of map.solids) if (s.name && /^(station_\d|reception_counter|display_island|product_shelf|workbench|shelving_unit|rack)$/.test(s.name)) {
    const b = s.box, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    box("wood", (b.minX + b.maxX) / 2, b.maxY + 0.025, (b.minZ + b.maxZ) / 2, w + 0.045, 0.05, d + 0.045);
    for (let y = 0.2; y < b.maxY - 0.1; y += 0.32) {
      box("metal", (b.minX + b.maxX) / 2, y, b.maxZ + 0.012, w - 0.06, 0.02, 0.022);
      box("brass", (b.minX + b.maxX) / 2, y + 0.1, b.maxZ + 0.033, Math.min(0.22, w * 0.3), 0.03, 0.04);
    }
  }
  // Floor graphics: unobstructed crossing between median planters, marked loading bays and lanes.
  for (let z = -18; z < -2; z += 1.25) box("paint_white", -3, 0.012, z, 2.8, 0.015, 0.54);
  for (const x of [-22, -18, 23, 27, 31]) box("paint_yellow", x, 0.012, 26.4, 0.07, 0.015, 3.2);
  for (const z of [20, 23, 26, 29, 32]) box("paint_yellow", -15.7, 0.012, z, 0.10, 0.015, 1.1);
  // Ceiling battens unify the shop interior without adding more dynamic lights.
  for (const z of [1.7, 5.5, 8.8]) box("wood", 2, 3.49, z, 11.8, 0.12, 0.16);
}
