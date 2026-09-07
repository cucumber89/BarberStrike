import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { MapDef, MaterialTag } from "@frankibarber/shared";
import type { AddPiece } from "./dressing";

/** Closed perimeter buildings. All additions stay on sealed walls or above the 7 m boundary.
 * Pieces enter the existing material/zone batcher: no per-window materials, textures or lights.
 */
export function buildStreetscape(scene: Scene, map: MapDef, add: AddPiece): void {
  let id = 0;
  const facade = (x: number, z: number, length: number, yaw: number, seed: number) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const piece = (tag: MaterialTag, u: number, y: number, offset: number, w: number, h: number, d: number) => {
      const m = MeshBuilder.CreateBox(`streetscape_${id++}`, { width: w, height: h, depth: d }, scene);
      m.position.set(x + u * c + offset * s, y, z - u * s + offset * c);
      m.rotation.y = yaw;
      // Real metre scale, including thin cornices: default box UVs stretch a whole brick wall
      // over each tiny sill. Local axes keep the texture aligned on rotated facades too.
      const p = m.getVerticesData("position")!, n = m.getVerticesData("normal")!, uv = m.getVerticesData("uv")!;
      for (let i = 0; i < p.length / 3; i++) {
        const px = p[i * 3] + u, py = p[i * 3 + 1] + y, pz = p[i * 3 + 2] + offset;
        uv[i * 2] = Math.abs(n[i * 3]) > .5 ? pz : px;
        uv[i * 2 + 1] = Math.abs(n[i * 3 + 1]) > .5 ? pz : py;
      }
      m.setVerticesData("uv", uv, false);
      add(m, tag);
    };
    const bays = Math.max(1, Math.round(length / 8));
    const span = length / bays;
    for (let i = 0; i < bays; i++) {
      const u = (i + .5) * span, variant = (i + seed) % 4;
      const wall: MaterialTag = ["wall_brick", "wall_plaster", "wall_sand", "wall_concrete"][variant] as MaterialTag;
      const top = [8.1, 9.4, 8.65, 7.65][variant];
      // Upper storeys break the arena's level skyline. Mass extends away from the playable side.
      piece(wall, u, (7 + top) / 2, -1.3, span - .07, top - 7, 2.6);
      piece(wall, u, 4.9, .024, span - .08, 3.85, .045);
      piece("wall_concrete", u, 2.99, .07, span - .04, .18, .18);
      piece("wall_concrete", u, top, -.02, span + .08, .18, .36);
      piece("metal", u, top + .12, -.03, span + .12, .065, .43);
      // Dark reveal, slender timber frames and deep stone sills give windows real depth.
      for (const dx of [-span * .26, 0, span * .26]) {
        const wx = u + dx, wy = 4.78;
        piece("wall_concrete", wx, wy, .065, 1.4, 2.03, .12);
        piece("glass_dark", wx, wy, .132, 1.17, 1.82, .022);
        piece("wood", wx, wy, .17, .055, 1.84, .07);
        piece("wood", wx, wy + .34, .17, 1.2, .055, .07);
        piece("wall_concrete", wx, wy - 1.02, .16, 1.56, .12, .38);
        piece("wall_concrete", wx, wy + 1.08, .12, 1.5, .12, .2);
        if ((i + Math.round(dx * 10) + seed) % 3 === 0) {
          // Opaque blinds, not extra translucent panes or point lights.
          piece("wall_sand", wx, wy + .61, .151, 1.12, .49, .012);
        }
      }
      // One drainpipe per building, with gutter and masonry seam. No freestanding obstacles.
      piece("metal", u + span / 2 - .15, 3.5, .11, .085, 6.95, .09);
      piece("metal", u, 6.91, .09, span, .1, .14);
      piece("wall_concrete", u, .26, .048, span - .04, .5, .08);
      if (variant === 1) {
        piece("wall_brick", u + 1.8, top + .42, -1.1, .62, .8, .7);
        piece("wall_concrete", u + 1.8, top + .86, -1.1, .8, .1, .85);
      }
    }
  };
  // Infer dimensions from the actual closed collision segments; never bridge district portals.
  for (const wall of map.solids) {
    if (!wall.name || !/^(south_facade|north_facade|extension_(south|north|edge)_|lane_wall_)/.test(wall.name)) continue;
    const b = wall.box, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    if (b.maxY < 7) continue;
    if (w > d) {
      const south = wall.name.includes("south");
      facade(south ? b.minX : b.maxX, south ? b.maxZ : b.minZ, w, south ? 0 : Math.PI, south ? 0 : 2);
    } else {
      const west = (b.minX + b.maxX) / 2 < 0;
      facade(west ? b.maxX : b.minX, west ? b.maxZ : b.minZ, d, west ? Math.PI / 2 : -Math.PI / 2, west ? 1 : 3);
    }
  }
}
