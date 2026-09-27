import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import { compileVoxel, type VoxelCompiled, type VoxelFinish, type VoxelModel } from "@frankibarber/shared";

/**
 * Voxel models on the GPU. One mesh per finish group of a model (matte / gloss / metal share a
 * material across EVERY model; glow and glass take one per colour), vertex colours carry the
 * ink, so the props merger can fold a whole room's furniture into a few draw calls.
 *
 * Vertex colours reach the PBR shader as-is (no gamma step), like `albedoColor` after
 * `toLinearSpace()`, so they are linearised here; the albedo stays white to pass them through.
 */
export class VoxelMaterials {
  private mats = new Map<string, Material>();
  constructor(private scene: Scene) {}

  get(finish: VoxelFinish, color?: string): Material {
    const key = color ? `${finish}_${color}` : finish;
    let m = this.mats.get(key) as PBRMaterial | undefined;
    if (m) return m;
    m = new PBRMaterial(`voxel_${key}`, this.scene);
    m.albedoColor = Color3.White();
    m.maxSimultaneousLights = 4;
    m.useGLTFLightFalloff = true;
    switch (finish) {
      case "matte": m.roughness = 0.82; m.metallic = 0; break;
      case "gloss": m.roughness = 0.32; m.metallic = 0.05; break;
      case "metal": m.roughness = 0.35; m.metallic = 0.85; break;
      case "glow": {
        m.roughness = 0.5; m.metallic = 0;
        m.emissiveColor = Color3.FromHexString(color ?? "#ffffff").scale(1.6);
        m.disableLighting = true;
        break;
      }
      case "glass": {
        m.roughness = 0.08; m.metallic = 0.1;
        m.alpha = 0.5;
        m.albedoColor = Color3.FromHexString(color ?? "#9fb5c8").toLinearSpace();
        m.backFaceCulling = false;
        break;
      }
    }
    m.freeze();
    this.mats.set(key, m);
    return m;
  }

  dispose(): void { for (const m of this.mats.values()) m.dispose(true, true); this.mats.clear(); }
}

const compiled = new WeakMap<VoxelModel, VoxelCompiled>();
/**
 * Compiles once per model OBJECT (the library's objects never change, so a fridge is compiled
 * once for every fridge on the map). Keyed by the object, not the id: the creator parses a new
 * object after every stroke, and a cache by id showed the owner a stale model while the cost
 * line moved.
 */
export function compiledVoxel(model: VoxelModel): VoxelCompiled {
  let c = compiled.get(model);
  if (!c) { c = compileVoxel(model); compiled.set(model, c); }
  return c;
}

export interface VoxelBuilt { meshes: Mesh[]; glow: Mesh[] }

/**
 * Builds a model under `parent` (the prop anchor: position, yaw, scale). The footprint is centred
 * on the anchor and the bottom sits on its y, as the compiler lays it out.
 */
export function buildVoxelModel(scene: Scene, model: VoxelModel, mats: VoxelMaterials, parent: TransformNode, name: string): VoxelBuilt {
  const c = compiledVoxel(model);
  const meshes: Mesh[] = [], glow: Mesh[] = [];
  for (const g of c.groups) {
    const m = new Mesh(`${name}_${g.finish}${g.color ? "_" + g.color.slice(1) : ""}`, scene);
    const vd = new VertexData();
    vd.positions = g.positions;
    vd.normals = g.normals;
    vd.uvs = g.uvs;
    vd.indices = g.indices;
    const colors = new Array<number>(g.colors.length);
    for (let i = 0; i < g.colors.length; i += 4) {
      // sRGB → linear, the same curve Color3.toLinearSpace applies.
      colors[i] = Math.pow(g.colors[i], 2.2); colors[i + 1] = Math.pow(g.colors[i + 1], 2.2); colors[i + 2] = Math.pow(g.colors[i + 2], 2.2); colors[i + 3] = 1;
    }
    vd.colors = colors;
    vd.applyToMesh(m, false);
    m.material = mats.get(g.finish, g.color);
    m.parent = parent;
    m.isPickable = false;
    m.receiveShadows = g.finish !== "glow";
    meshes.push(m);
    if (g.finish === "glow") glow.push(m);
  }
  return { meshes, glow };
}
