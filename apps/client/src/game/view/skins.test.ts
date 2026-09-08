import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SkinBinding, type SkinRegistry } from "./skins";
import { buildWeaponModel, createWeaponMaterials, type WeaponMaterials } from "./weaponMeshes";
import type { Lease } from "./skinCache";

it("releases a late generation and restores factory materials before releasing the current one", async () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const base = createWeaponMaterials(scene), painted = createWeaponMaterials(scene);
    const model = buildWeaponModel("pistol", base, scene);
    const pending: ((lease: Lease<WeaponMaterials>) => void)[] = [];
    const registry = { acquire: () => new Promise<Lease<WeaponMaterials>>(resolve => pending.push(resolve)) } as unknown as SkinRegistry;
    const binding = new SkinBinding(registry, base); let releases = 0;
    const late = binding.apply(model, "pistol", "osy");
    const current = binding.apply(model, "pistol", "talk");
    pending[0]({ value: painted, release: () => releases++ }); await late;
    expect(releases).toBe(1); expect(model.meshesByMat.get("metal")![0].material).toBe(base.metal);
    pending[1]({ value: painted, release: () => {
      expect(model.meshesByMat.get("metal")![0].material).toBe(base.metal); releases++;
    } }); await current;
    expect(model.meshesByMat.get("metal")![0].material).toBe(painted.metal);
    binding.clear(); binding.clear(); expect(releases).toBe(2);
    expect(base.metal.isFrozen).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
