import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { WeaponId } from "@frankibarber/shared";
import { DomSkinCanvas, fitsWeapon, paletteFor, renderSkin, roleFor, skinById, type SkinDef } from "@frankibarber/skins";
import { createWeaponMaterials, type MatKey, type WeaponMaterials, type WeaponModel } from "./weaponMeshes";
import { SkinCache, type Lease } from "./skinCache";

const registries = new WeakMap<Scene, SkinRegistry>();
export class SkinRegistry {
  static forScene(scene: Scene): SkinRegistry {
    let registry = registries.get(scene);
    if (!registry) { registry = new SkinRegistry(scene); registries.set(scene, registry); }
    return registry;
  }
  private readonly base: WeaponMaterials;
  private readonly cache = new SkinCache<WeaponMaterials>(12, mats => mats.dispose());
  private tail: Promise<unknown> = Promise.resolve();
  private disposed = false;
  constructor(private scene: Scene) {
    this.base = createWeaponMaterials(scene);
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }
  get stats() { return this.cache.stats; }
  /** Serial jobs, outside the render loop; only the visible gun holds a lease. */
  acquire(weapon: WeaponId, id: string, wear = 0): Promise<Lease<WeaponMaterials> | null> {
    const def = skinById(id); if (!def || !fitsWeapon(def, weapon) || this.disposed) return Promise.resolve(null);
    const safeWear = Number.isFinite(wear) ? Math.max(0, Math.min(1, wear)) : 0;
    const job = this.tail.then(() => new Promise<void>(resolve => setTimeout(resolve, 50))).then(() => {
      if (this.disposed) return null;
      return this.cache.acquire(`${weapon}:${id}:${safeWear}`, () => this.create(weapon, def, safeWear));
    });
    this.tail = job.catch(() => {}); return job;
  }
  private create(weapon: WeaponId, def: SkinDef, wear: number): WeaponMaterials {
    const texture = new DynamicTexture(`skin_${weapon}_${def.id}`, { width: 1024, height: 1024 }, this.scene, true);
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 4;
    const owned: WeaponMaterials[MatKey][] = [];
    try {
      renderSkin(def, weapon, "pattern", new DomSkinCanvas(texture.getContext() as CanvasRenderingContext2D, 1024), wear);
      texture.update(false);
      const mats = { ...this.base };
      const palette = paletteFor(def.params);
      for (const mat of Object.keys(roleKeys) as MatKey[]) {
        const role = roleFor(def, mat); if (role === "keep") continue;
        const m = this.base[mat].clone(`skin_${weapon}_${def.id}_${mat}`)!;
        owned.push(m); m.unfreeze();
        m.albedoTexture = role === "pattern" ? texture : null;
        m.albedoColor = role === "pattern" ? Color3.White() : Color3.FromHexString(role === "trim" ? palette.accent : palette.base).toLinearSpace();
        m.emissiveColor = Color3.Black();
        m.metallic = def.params.finish === "anodowany" ? .4 : mat === "metal" ? .18 : this.base[mat].metallic;
        m.roughness = def.params.finish === "połysk" ? .3 : def.params.finish === "anodowany" ? .4 : .64;
        m.freeze(); mats[mat] = m;
      }
      return { ...mats, dispose() { for (const m of owned) m.dispose(false, false); texture.dispose(); } };
    } catch (error) { for (const m of owned) m.dispose(false, false); texture.dispose(); throw error; }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.cache.dispose(); this.base.dispose(); registries.delete(this.scene); }
}
const roleKeys: Record<MatKey, true> = { metal: true, steel: true, polymer: true, tan: true, wood: true, rubber: true, brass: true, lens: true };

export function applySkinMaterials(model: WeaponModel, mats: WeaponMaterials): void {
  for (const [mat, meshes] of model.meshesByMat) for (const mesh of meshes) mesh.material = mats[mat];
}

/** Restores factory pointers before releasing: a hidden gun must never retain an evicted material. */
export class SkinBinding {
  private generation = 0;
  private lease: Lease<WeaponMaterials> | null = null;
  private model: WeaponModel | null = null;
  constructor(private registry: SkinRegistry, private base: WeaponMaterials) {}
  async apply(model: WeaponModel, weapon: WeaponId, skin: string): Promise<void> {
    this.clear(); const generation = this.generation; this.model = model;
    if (!skin) return;
    let lease: Lease<WeaponMaterials> | null;
    try { lease = await this.registry.acquire(weapon, skin); } catch { return; } // A cosmetic failure cannot cost a match.
    if (generation !== this.generation) { lease?.release(); return; }
    this.lease = lease; if (lease) applySkinMaterials(model, lease.value);
  }
  clear(): void {
    this.generation++;
    if (this.model && !this.model.root.isDisposed()) applySkinMaterials(this.model, this.base);
    this.lease?.release(); this.lease = null; this.model = null;
  }
}
