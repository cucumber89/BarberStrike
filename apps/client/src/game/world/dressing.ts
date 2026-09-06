import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { MaterialTag, Solid } from "@frankibarber/shared";

/**
 * Dressed solids (1.0 beta). In 0.1 every piece of cover was its collision box painted with one
 * material, so a van, a container and a dumpster all read as "dark block" — the playtest called
 * them "random texture blocks". Here a solid with a `look` is drawn as the object it stands for
 * (wheels, windows, lids, ribs, doors) while its collision box stays exactly what the server uses.
 *
 * Every piece is a primitive with a MaterialTag; the caller merges them per material × zone like
 * the rest of the map, so a dressed van costs the same draw calls as a plain box. Local frame:
 * origin at the box's floor centre, +Z = the object's front (solid.yaw), lengths in metres.
 */

export type AddPiece = (mesh: Mesh, tag: MaterialTag) => void;

interface Frame { pivot: TransformNode; L: number; Wd: number; Ht: number }

export function dressSolid(scene: Scene, s: Solid, parent: TransformNode, add: AddPiece): void {
  const b = s.box;
  const sx = b.maxX - b.minX, sy = b.maxY - b.minY, sz = b.maxZ - b.minZ;
  const yaw = s.yaw ?? 0;
  const sideways = Math.abs(Math.sin(yaw)) > 0.5;
  const pivot = new TransformNode(`dress_${s.name}`, scene);
  pivot.position.set(b.minX + sx / 2, b.minY, b.minZ + sz / 2);
  pivot.rotation.y = yaw;
  pivot.parent = parent;
  const f: Frame = { pivot, L: sideways ? sx : sz, Wd: sideways ? sz : sx, Ht: sy };

  const box = (tag: MaterialTag, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): Mesh => {
    const m = MeshBuilder.CreateBox(`${s.name}_${tag}`, { width: w, height: h, depth: d }, scene);
    m.parent = pivot; m.position.set(x, y, z); m.rotation.y = ry;
    add(m, tag);
    return m;
  };
  // Drop 6 low-poly pass: cylinders are flat-shaded with fewer sides, so wheels, drums and pipes
  // read as faceted objects (the stylised look the owner chose) instead of smooth tubes.
  const cyl = (tag: MaterialTag, dia: number, h: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y", tess = 10): Mesh => {
    const m = MeshBuilder.CreateCylinder(`${s.name}_${tag}`, { diameter: dia, height: h, tessellation: tess }, scene);
    m.parent = pivot; m.position.set(x, y, z);
    if (axis === "x") m.rotation.z = Math.PI / 2; else if (axis === "z") m.rotation.x = Math.PI / 2;
    m.convertToFlatShadedMesh();
    add(m, tag);
    return m;
  };
  const wheels = (dia: number, wide: number, xs: number, zs: number[], y: number) => {
    for (const z of zs) for (const x of [-xs, xs]) {
      cyl("rubber", dia, wide, x, y, z, "x", 10);
      cyl("metal", dia * 0.55, wide + 0.02, x, y, z, "x", 8);
    }
  };
  /** Vehicle trim shared by the car / van / truck: side mirrors and door seams. */
  const trim = (gap: number, mirrorZ: number, seamZ: number[]) => {
    for (const sx of [-1, 1]) {
      box("metal", 0.06, 0.09, 0.16, sx * (Wd / 2 + 0.06), gap + 0.78, mirrorZ);       // mirror
      box("metal", 0.02, 0.03, 0.05, sx * (Wd / 2 + 0.01), gap + 0.72, mirrorZ);       // mirror arm
      for (const z of seamZ) box("rubber", 0.015, 0.5, 0.02, sx * (Wd / 2 + 0.004), gap + 0.34, z); // door seam
    }
  };
  const { L, Wd, Ht } = f;
  const body = s.mat;

  switch (s.look) {
    case "car": {
      const gap = 0.32;
      // Chassis skirt (handoff): the collider is the full block from the ground, so the gap under
      // the body must LOOK solid or players "hit air". Dark and low-poly, inset from the panels.
      box("rubber", Wd - 0.16, gap - 0.04, L - 0.5, 0, gap / 2, 0);
      box(body, Wd, 0.5, L, 0, gap + 0.25, 0);                                 // lower body
      box(body, Wd - 0.12, 0.18, L - 0.3, 0, gap + 0.59, 0);                     // belt line
      box("glass_car", Wd - 0.22, Ht - gap - 0.62, L * 0.5, 0, (gap + 0.68 + Ht) / 2 - 0.02, -L * 0.05); // cabin glass
      box(body, Wd - 0.18, 0.06, L * 0.5, 0, Ht - 0.03, -L * 0.05);            // roof
      box("metal", Wd + 0.04, 0.12, 0.12, 0, gap + 0.12, L / 2 - 0.02);         // bumpers
      box("metal", Wd + 0.04, 0.12, 0.12, 0, gap + 0.12, -L / 2 + 0.02);
      box("brass", 0.28, 0.1, 0.05, Wd / 2 - 0.3, gap + 0.5, L / 2 + 0.01);     // headlights
      box("brass", 0.28, 0.1, 0.05, -Wd / 2 + 0.3, gap + 0.5, L / 2 + 0.01);
      box("paint_red", 0.22, 0.08, 0.05, Wd / 2 - 0.25, gap + 0.5, -L / 2 - 0.01); // tail lights
      box("paint_red", 0.22, 0.08, 0.05, -Wd / 2 + 0.25, gap + 0.5, -L / 2 - 0.01);
      wheels(0.62, 0.22, Wd / 2 - 0.13, [L * 0.32, -L * 0.32], 0.31);
      trim(gap, L * 0.12, [0, -L * 0.28]);
      box("metal", 0.18, 0.05, 0.05, 0, gap + 0.48, L / 2 + 0.02);                // grille badge bar
      break;
    }
    case "van": {
      const gap = 0.38, cab = L * 0.3;
      box("rubber", Wd - 0.16, gap - 0.04, L - 0.5, 0, gap / 2, 0);                    // chassis skirt (handoff)
      box(body, Wd, Ht - gap - 0.05, L - cab, 0, (Ht + gap) / 2 - 0.02, -cab / 2);   // cargo box
      box(body, Wd - 0.1, 0.7, cab, 0, gap + 0.35, L / 2 - cab / 2);                  // hood
      box("glass_car", Wd - 0.2, Ht - gap - 0.8, cab * 0.7, 0, (gap + 0.75 + Ht) / 2 - 0.05, L / 2 - cab * 0.65); // cabin
      box(body, Wd - 0.15, 0.06, cab * 0.7, 0, Ht - 0.06, L / 2 - cab * 0.65);       // cab roof
      box("metal", Wd + 0.04, 0.14, 0.14, 0, gap + 0.1, L / 2 - 0.02);
      box("metal", Wd + 0.04, 0.14, 0.14, 0, gap + 0.1, -L / 2 + 0.02);
      box("brass", 0.3, 0.12, 0.05, Wd / 2 - 0.3, gap + 0.5, L / 2 + 0.01);
      box("brass", 0.3, 0.12, 0.05, -Wd / 2 + 0.3, gap + 0.5, L / 2 + 0.01);
      box("metal", 0.04, Ht - gap - 0.4, 0.04, 0, (Ht + gap) / 2, -L / 2 - 0.01);   // rear door seam
      wheels(0.72, 0.24, Wd / 2 - 0.16, [L * 0.33, -L * 0.3], 0.36);
      trim(gap, L / 2 - cab * 0.9, [L / 2 - cab, -L * 0.1]);
      for (const sx of [-1, 1]) box("metal", 0.04, 0.05, L * 0.5, sx * (Wd / 2 - 0.15), Ht + 0.03, -L * 0.15); // roof rack rails
      box("metal", Wd - 0.3, 0.04, 0.04, 0, Ht + 0.03, -L * 0.15);                                             // roof rack cross bar
      break;
    }
    case "truck": {
      const gap = 0.55, cab = L * 0.28;
      box("rubber", Wd - 0.2, gap - 0.04, L - 0.7, 0, gap / 2, 0);                         // chassis skirt (handoff)
      box(body, Wd, Ht - gap - 0.05, L - cab - 0.15, 0, (Ht + gap) / 2, -cab / 2 - 0.05); // cargo box
      box("metal", Wd, 0.05, L - cab - 0.15, 0, gap, -cab / 2 - 0.05);                   // floor lip
      box(body, Wd - 0.2, Ht - gap - 0.5, cab, 0, (Ht - 0.5 + gap) / 2, L / 2 - cab / 2); // cab
      box("glass_car", Wd - 0.35, 0.7, 0.06, 0, Ht - 0.85, L / 2 + 0.01);              // windscreen
      box("metal", Wd + 0.04, 0.16, 0.16, 0, gap - 0.1, L / 2 - 0.02);
      box("brass", 0.32, 0.14, 0.05, Wd / 2 - 0.35, gap + 0.1, L / 2 + 0.01);
      box("brass", 0.32, 0.14, 0.05, -Wd / 2 + 0.35, gap + 0.1, L / 2 + 0.01);
      wheels(0.9, 0.3, Wd / 2 - 0.2, [L * 0.35, -L * 0.2, -L * 0.36], 0.45);
      trim(gap, L / 2 - cab * 0.85, [L / 2 - cab]);
      cyl("metal", 0.1, Ht - gap - 0.4, Wd / 2 + 0.02, gap + (Ht - gap) * 0.5, L / 2 - cab - 0.12, "y", 8); // exhaust stack
      break;
    }
    case "container": {
      box(body, Wd, Ht, L, 0, Ht / 2, 0);
      for (const [x, z] of [[Wd / 2, L / 2], [-Wd / 2, L / 2], [Wd / 2, -L / 2], [-Wd / 2, -L / 2]]) box("metal", 0.14, Ht + 0.02, 0.14, x, Ht / 2, z);
      box("metal", Wd + 0.02, 0.12, L + 0.02, 0, Ht - 0.05, 0);            // top rail
      box("metal", Wd + 0.02, 0.12, L + 0.02, 0, 0.06, 0);                 // bottom rail
      for (const x of [-Wd * 0.3, -Wd * 0.1, Wd * 0.1, Wd * 0.3]) box("metal", 0.05, Ht - 0.4, 0.05, x, Ht / 2, L / 2 + 0.04); // door lock rods
      box("metal", 0.4, 0.06, 0.06, -Wd * 0.2, Ht * 0.45, L / 2 + 0.06);  // handles
      box("metal", 0.4, 0.06, 0.06, Wd * 0.2, Ht * 0.45, L / 2 + 0.06);
      break;
    }
    case "dumpster": {
      box(body, Wd, Ht - 0.35, L, 0, 0.2 + (Ht - 0.35) / 2, 0);
      box("paint", Wd + 0.06, 0.12, L + 0.06, 0, Ht - 0.06, 0);          // lid
      box("metal", 0.06, Ht - 0.4, 0.06, Wd / 2 + 0.03, Ht / 2, L * 0.25); // side ribs
      box("metal", 0.06, Ht - 0.4, 0.06, Wd / 2 + 0.03, Ht / 2, -L * 0.25);
      box("metal", 0.06, Ht - 0.4, 0.06, -Wd / 2 - 0.03, Ht / 2, L * 0.25);
      box("metal", 0.06, Ht - 0.4, 0.06, -Wd / 2 - 0.03, Ht / 2, -L * 0.25);
      box("metal", Wd - 0.3, 0.06, 0.06, 0, Ht * 0.6, L / 2 + 0.04);       // front bar
      for (const x of [-Wd / 2 + 0.15, Wd / 2 - 0.15]) for (const z of [-L / 2 + 0.15, L / 2 - 0.15]) cyl("rubber", 0.18, 0.08, x, 0.1, z, "x", 8);
      break;
    }
    case "crate": {
      box(body, Wd, Ht, L, 0, Ht / 2, 0);
      box("metal", Wd + 0.02, 0.05, L + 0.02, 0, Ht * 0.22, 0);
      box("metal", Wd + 0.02, 0.05, L + 0.02, 0, Ht * 0.78, 0);
      for (const [x, z] of [[Wd / 2, L / 2], [-Wd / 2, L / 2], [Wd / 2, -L / 2], [-Wd / 2, -L / 2]]) box("wood", 0.08, Ht + 0.01, 0.08, x, Ht / 2, z);
      break;
    }
    case "pallets": {
      const layers = Math.max(1, Math.round(Ht / 0.15));
      for (let i = 0; i < layers; i++) {
        const y = i * (Ht / layers);
        box("wood", Wd, 0.04, L, 0, y + 0.13 * (Ht / layers) / 0.15, 0);                // deck boards (top)
        for (const z of [-L / 2 + 0.06, 0, L / 2 - 0.06]) box("wood", Wd, 0.08, 0.1, 0, y + 0.04 * (Ht / layers) / 0.15, z); // bearers
      }
      break;
    }
    case "lockers": {
      box(body, Wd, Ht - 0.1, L, 0, 0.1 + (Ht - 0.1) / 2, 0);
      box("metal", Wd, 0.1, L, 0, 0.05, 0);                                  // plinth
      const doors = Math.max(1, Math.round(Wd / 0.4));
      for (let i = 0; i <= doors; i++) box("metal", 0.02, Ht - 0.2, 0.03, -Wd / 2 + (Wd * i) / doors, Ht / 2, L / 2 + 0.01); // seams
      for (let i = 0; i < doors; i++) {
        const x = -Wd / 2 + (Wd * (i + 0.5)) / doors;
        for (const y of [Ht * 0.85, Ht * 0.25]) box("glass_dark", 0.18, 0.05, 0.02, x, y, L / 2 + 0.02); // vents
        box("metal", 0.03, 0.12, 0.02, x + 0.12, Ht * 0.55, L / 2 + 0.03);                              // handle
      }
      break;
    }
    case "drums": {
      const n = Math.max(1, Math.round(Wd / 0.6)), m = Math.max(1, Math.round(L / 0.6));
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
        const x = -Wd / 2 + (Wd * (i + 0.5)) / n, z = -L / 2 + (L * (j + 0.5)) / m;
        cyl(body, Math.min(Wd / n, L / m) - 0.04, Ht, x, Ht / 2, z, "y", 14);
        cyl("metal", Math.min(Wd / n, L / m) - 0.01, 0.04, x, Ht * 0.3, z, "y", 14);
        cyl("metal", Math.min(Wd / n, L / m) - 0.01, 0.04, x, Ht * 0.7, z, "y", 14);
      }
      break;
    }
    case "planter": {
      box(body, Wd, Ht - 0.05, L, 0, (Ht - 0.05) / 2, 0);
      box("soil", Wd - 0.16, 0.06, L - 0.16, 0, Ht - 0.03, 0);
      const bushes = Math.max(1, Math.round(L / 1.2));
      for (let i = 0; i < bushes; i++) {
        const z = -L / 2 + (L * (i + 0.5)) / bushes;
        box("foliage", Wd * 0.7, 0.5, 0.9, 0, Ht + 0.2, z, 0.4);
        box("foliage", Wd * 0.55, 0.42, 0.7, 0.1, Ht + 0.42, z + 0.1, -0.5);
      }
      break;
    }
    case "cabinet": {
      box(body, Wd, Ht - 0.06, L, 0, 0.06 + (Ht - 0.06) / 2, 0);
      box("metal", Wd, 0.06, L, 0, 0.03, 0);
      box("metal", 0.02, Ht - 0.3, 0.03, 0, Ht / 2, L / 2 + 0.01);                 // door seam
      box("metal", 0.04, 0.16, 0.03, 0.12, Ht * 0.55, L / 2 + 0.02);              // handle
      box("paint_yellow", 0.22, 0.16, 0.02, -Wd * 0.25, Ht * 0.75, L / 2 + 0.01); // warning plate
      for (const y of [Ht * 0.9, Ht * 0.2]) box("glass_dark", Wd * 0.5, 0.05, 0.02, 0, y, L / 2 + 0.01); // vents
      break;
    }
    case "bin": {
      cyl(body, Math.min(Wd, L), Ht - 0.08, 0, (Ht - 0.08) / 2, 0, "y", 12);
      cyl("metal", Math.min(Wd, L) + 0.04, 0.08, 0, Ht - 0.04, 0, "y", 12);
      cyl("metal", Math.min(Wd, L) * 0.5, 0.04, 0, Ht, 0, "y", 10);
      break;
    }
    case "machine": {
      box(body, Wd, Ht - 0.12, L, 0, 0.12 + (Ht - 0.12) / 2, 0);
      box("metal", Wd - 0.2, 0.12, L - 0.2, 0, 0.06, 0);
      box("glass_dark", Wd * 0.5, Ht * 0.25, 0.03, 0, Ht * 0.65, L / 2 + 0.01); // control panel
      box("paint_yellow", Wd * 0.5, 0.04, 0.03, 0, Ht * 0.5, L / 2 + 0.01);
      cyl("metal", 0.1, Wd * 0.8, 0, Ht + 0.05, -L * 0.2, "x", 8);            // pipes on top
      cyl("metal", 0.08, 0.5, Wd * 0.3, Ht + 0.25, -L * 0.2, "y", 8);
      break;
    }
    case "skip": {
      box(body, Wd, Ht - 0.08, L, 0, (Ht - 0.08) / 2 + 0.08, 0);
      box("metal", Wd + 0.08, 0.08, L + 0.08, 0, Ht - 0.04, 0);            // rim
      box("glass_dark", Wd - 0.2, 0.04, L - 0.2, 0, Ht - 0.12, 0);         // dark fill
      box("metal", 0.08, 0.5, 0.08, Wd / 2 - 0.15, Ht * 0.5, L / 2 + 0.06); // lifting lugs
      box("metal", 0.08, 0.5, 0.08, -Wd / 2 + 0.15, Ht * 0.5, L / 2 + 0.06);
      box("metal", 0.08, 0.5, 0.08, Wd / 2 - 0.15, Ht * 0.5, -L / 2 - 0.06);
      box("metal", 0.08, 0.5, 0.08, -Wd / 2 + 0.15, Ht * 0.5, -L / 2 - 0.06);
      break;
    }
    case "shelter_roof": {
      box(body, Wd, Ht, L, 0, Ht / 2, 0);
      box("paint", Wd + 0.1, 0.08, L + 0.1, 0, 0.04 - 0.1, 0);              // underside trim
      break;
    }
    case "portacabin": {
      box(body, Wd, Ht - 0.2, L, 0, 0.2 + (Ht - 0.2) / 2, 0);
      box("metal", Wd, 0.2, L, 0, 0.1, 0);                                  // chassis
      box("metal", Wd + 0.1, 0.1, L + 0.1, 0, Ht - 0.05, 0);                // roof trim
      const wins = Math.max(1, Math.round(Wd / 2));
      for (let i = 0; i < wins; i++) {
        const x = -Wd / 2 + (Wd * (i + 0.5)) / wins;
        box("glass_dark", 0.9, 0.7, 0.03, x, Ht * 0.62, L / 2 + 0.01);
        box("glass_dark", 0.9, 0.7, 0.03, x, Ht * 0.62, -L / 2 - 0.01);
      }
      box("paint", 0.8, Ht - 0.5, 0.03, Wd / 2 - 0.6, 0.2 + (Ht - 0.5) / 2, L / 2 + 0.01); // door
      box("metal", 0.9, 0.05, 0.4, Wd / 2 - 0.6, 0.2, L / 2 + 0.2);                          // step
      break;
    }
    case "kiosk_counter": {
      box(body, Wd, Ht - 0.04, L, 0, (Ht - 0.04) / 2, 0);
      box("wood", Wd + 0.06, 0.04, L + 0.06, 0, Ht - 0.02, 0);
      box("wood", Wd, 0.3, 0.03, 0, Ht * 0.5, L / 2 + 0.01);
      break;
    }
    default:
      box(body, Wd, Ht, L, 0, Ht / 2, 0);
  }
}
