import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { WeaponId } from "@frankibarber/shared";
import { DomSkinCanvas, fitsWeapon, paletteFor, renderSkin, roleFor, skinById, type SkinDef } from "@frankibarber/skins";
import { createWeaponMaterials, PAINTED_STEEL, weaponFrame, type MatKey, type WeaponMaterials, type WeaponModel } from "./weaponMeshes";
import { SkinCache, type Lease } from "./skinCache";

/** How a recipe's base material reads under light; the albedo texture carries the colour. */
// There is no environment texture in any scene, so metallic stays moderate: fully metallic dark
// albedo reads as black under the night lights. The chrome and gold looks live in the paint itself.
const SURFACES: Record<string, { metallic: number; roughness: number }> = {
  chrome: { metallic: .5, roughness: .2 }, gold: { metallic: .45, roughness: .3 }, steel: { metallic: .45, roughness: .38 },
  lacquer: { metallic: .1, roughness: .32 }, carbon: { metallic: .25, roughness: .4 }, neon: { metallic: .15, roughness: .4 },
  polymer: { metallic: 0, roughness: .7 }, cloth: { metallic: 0, roughness: .85 }, paper: { metallic: 0, roughness: .78 },
  concrete: { metallic: 0, roughness: .9 }, wood: { metallic: 0, roughness: .55 }, rubber: { metallic: 0, roughness: .92 },
};
export const surfaceFor = (def: SkinDef): { metallic: number; roughness: number } => SURFACES[String(def.params.base)] ?? SURFACES.lacquer;

const registries = new WeakMap<Scene, SkinRegistry>();
export class SkinRegistry {
  static forScene(scene: Scene): SkinRegistry {
    let registry = registries.get(scene);
    if (!registry) { registry = new SkinRegistry(scene); registries.set(scene, registry); }
    return registry;
  }
  private readonly base: WeaponMaterials;
  /** Ten sets: a set is up to 8 MB of albedo plus a quarter of that for glow, so the soft cap is ~100 MB. */
  private readonly cache = new SkinCache<WeaponMaterials>(10, mats => mats.dispose());
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
  /**
   * One albedo texture per set, painted once as the weapon's side elevation, shared by every
   * painted material of the gun; a half-size emissive texture only when the recipe declares glow.
   * Nothing here runs per frame: the set lives in the cache until every lease is released.
   */
  private create(weapon: WeaponId, def: SkinDef, wear: number): WeaponMaterials {
    const frame = weaponFrame(weapon);
    const texture = new DynamicTexture(`skin_${weapon}_${def.id}`, { width: frame.width, height: frame.height }, this.scene, true);
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 8;
    let glow: DynamicTexture | null = null;
    const owned: WeaponMaterials[MatKey][] = [];
    const disposeAll = () => { for (const m of owned) m.dispose(false, false); texture.dispose(); glow?.dispose(); };
    try {
      renderSkin(def, weapon, "pattern", new DomSkinCanvas(texture.getContext() as CanvasRenderingContext2D, frame.width, frame.height), wear, { frame });
      // Flip on upload: canvas row 0 becomes v = 1, which is where the frame puts the right flank.
      texture.update(true);
      if (def.params.glow) {
        glow = new DynamicTexture(`skin_${weapon}_${def.id}_glow`, { width: frame.width / 2, height: frame.height / 2 }, this.scene, true);
        glow.wrapU = glow.wrapV = Texture.CLAMP_ADDRESSMODE;
        renderSkin(def, weapon, "pattern", new DomSkinCanvas(glow.getContext() as CanvasRenderingContext2D, frame.width / 2, frame.height / 2), wear, { frame, pass: "emissive" });
        glow.update(true);
      }
      const mats = { ...this.base };
      const palette = paletteFor(def.params);
      const surface = surfaceFor(def);
      for (const mat of Object.keys(roleKeys) as MatKey[]) {
        const role = mat === "steel" && PAINTED_STEEL.has(weapon) && !def.mats?.steel ? "pattern" : roleFor(def, mat);
        if (role === "keep") continue;
        const m = this.base[mat].clone(`skin_${weapon}_${def.id}_${mat}`)!;
        owned.push(m); m.unfreeze();
        m.albedoTexture = role === "pattern" ? texture : null;
        m.albedoColor = role === "pattern" ? Color3.White() : Color3.FromHexString(role === "trim" ? palette.accent : palette.base).toLinearSpace();
        // The factory's faint emissive lift stays unless the recipe glows, in which case the glow map rules.
        if (glow && role === "pattern") { m.emissiveTexture = glow; m.emissiveColor = Color3.White(); m.emissiveIntensity = 1.4; }
        else m.emissiveTexture = null;
        // Polymer grips and wooden furniture stay matte even under a chrome recipe; metal takes the finish.
        const soft = mat === "polymer" || mat === "tan" || mat === "wood";
        m.metallic = soft ? Math.min(surface.metallic, .25) : surface.metallic;
        m.roughness = soft ? Math.max(surface.roughness, .5) : surface.roughness;
        m.freeze(); mats[mat] = m;
      }
      return { ...mats, dispose: disposeAll };
    } catch (error) { disposeAll(); throw error; }
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
  async apply(model: WeaponModel, weapon: WeaponId, skin: string, wear = 0): Promise<void> {
    this.clear(); const generation = this.generation; this.model = model;
    if (!skin) return;
    let lease: Lease<WeaponMaterials> | null;
    try { lease = await this.registry.acquire(weapon, skin, wear); } catch { return; } // A cosmetic failure cannot cost a match.
    if (generation !== this.generation) { lease?.release(); return; }
    this.lease = lease; if (lease) applySkinMaterials(model, lease.value);
  }
  clear(): void {
    this.generation++;
    if (this.model && !this.model.root.isDisposed()) applySkinMaterials(this.model, this.base);
    this.lease?.release(); this.lease = null; this.model = null;
  }
}
