import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { WEAPON_ORDER } from "@frankibarber/shared";
import { buildWeaponModel, createWeaponMaterials, weaponFrame } from "./weaponMeshes";
import { sideProjectUvs } from "./skinUv";

it("indexes every moving assembly and projects magazine UVs in weapon rest space", () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const mats = createWeaponMaterials(scene);
    for (const id of WEAPON_ORDER) {
      const model = buildWeaponModel(id, mats, scene);
      const meshes = [...model.meshesByMat.values()].flat();
      expect(new Set(meshes).size).toBe(model.root.getChildMeshes().length);
      for (const mesh of meshes) {
        const p = Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!);
        if (mesh.parent === model.magazine) {
          for (let i = 0; i < p.length; i += 3) {
            p[i] += model.magazine!.position.x; p[i + 1] += model.magazine!.position.y; p[i + 2] += model.magazine!.position.z;
          }
        }
        expect(Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!)).toEqual([...sideProjectUvs(p, mesh.getVerticesData(VertexBuffer.NormalKind)!, weaponFrame(id))]);
        expect(mesh.position.length()).toBe(0);
      }
      model.root.dispose(false, false);
      expect(scene.materials).toContain(mats.metal);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

it("frames every weapon with its receiver as parts[0] and keeps all of it inside one texture", () => {
  for (const id of WEAPON_ORDER) {
    const f = weaponFrame(id);
    expect(f.parts.length).toBeGreaterThan(3);
    expect(f.receiver).toEqual(f.parts[0].zone);
    expect(f.body.z0).toBeGreaterThan(f.z0); expect(f.body.z1).toBeLessThan(f.z0 + f.zSpan);
    expect(f.body.y0).toBeGreaterThan(f.y0); expect(f.body.y1).toBeLessThan(f.y0 + f.ySpan);
    expect(f.width * f.height * 4).toBeLessThanOrEqual(8 << 20);
    expect(f.width / f.zSpan).toBeGreaterThan(1200); // pixels per metre: legible legends on every gun
    expect(!!f.magazine).toBe(["shotgun", "autoshotgun", "revolver", "launcher", "clippers"].includes(id) ? false : true);
  }
});
