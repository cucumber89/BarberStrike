import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { WEAPON_ORDER } from "@frankibarber/shared";
import { buildWeaponModel, createWeaponMaterials } from "./weaponMeshes";
import { boxProjectUvs } from "./skinUv";

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
        expect(Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!)).toEqual([...boxProjectUvs(p, mesh.getVerticesData(VertexBuffer.NormalKind)!)]);
        expect(mesh.position.length()).toBe(0);
      }
      model.root.dispose(false, false);
      expect(scene.materials).toContain(mats.metal);
    }
  } finally { scene.dispose(); engine.dispose(); }
});
