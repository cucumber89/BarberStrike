import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialTag } from "@frankibarber/shared";

export interface MaterialLibrary {
  get(tag: MaterialTag): Material;
  dispose(): void;
}

interface Spec {
  albedo: string;
  roughness: number;
  metallic: number;
  /** Procedural texture generator name. */
  tex?: "tiles" | "concrete" | "brick" | "wood" | "planks" | "asphalt" | "metal" | "plaster" | "panel" | "checker" | "corrugated" | "fence" | "blocks";
  /** Texture tiling in metres per repeat. */
  scale?: number;
  alpha?: number;
  emissive?: string;
  /** Alpha-tested texture (chain-link fence): the generator writes the alpha channel. */
  cutout?: boolean;
}

// 1.0 beta palette: mid-tones lifted ~1.6× over 0.1 (which was black-to-dark-grey after
// toLinearSpace) and colour on the object materials, so cover reads as objects, not as blocks.
const SPECS: Record<MaterialTag, Spec> = {
  floor_tile: { albedo: "#3c3c40", roughness: 0.35, metallic: 0.0, tex: "checker", scale: 1.2 },
  floor_concrete: { albedo: "#6c6a66", roughness: 0.9, metallic: 0.0, tex: "concrete", scale: 3 },
  floor_wood: { albedo: "#7c5a42", roughness: 0.55, metallic: 0.0, tex: "planks", scale: 2 },
  floor_asphalt: { albedo: "#3a3a40", roughness: 0.95, metallic: 0.0, tex: "asphalt", scale: 4 },
  floor_metal: { albedo: "#585c64", roughness: 0.5, metallic: 0.6, tex: "metal", scale: 2 },
  wall_plaster: { albedo: "#6e665e", roughness: 0.85, metallic: 0.0, tex: "plaster", scale: 3 },
  wall_brick: { albedo: "#7e5748", roughness: 0.9, metallic: 0.0, tex: "brick", scale: 2 },
  wall_tile: { albedo: "#30323a", roughness: 0.25, metallic: 0.0, tex: "tiles", scale: 1 },
  wall_concrete: { albedo: "#7c7872", roughness: 0.9, metallic: 0.0, tex: "concrete", scale: 3 },
  wall_panel: { albedo: "#403630", roughness: 0.5, metallic: 0.05, tex: "panel", scale: 1.5 },
  counter: { albedo: "#302a26", roughness: 0.4, metallic: 0.05, tex: "panel", scale: 1 },
  wood: { albedo: "#8c6646", roughness: 0.6, metallic: 0.0, tex: "planks", scale: 1 },
  metal: { albedo: "#6c7078", roughness: 0.45, metallic: 0.75, tex: "metal", scale: 1.5 },
  glass: { albedo: "#9fb5c8", roughness: 0.05, metallic: 0.1, alpha: 0.28 },
  glass_dark: { albedo: "#10151c", roughness: 0.12, metallic: 0.3 },
  /** Vehicle glazing (handoff): translucent, so cabins read as glass instead of black slabs. */
  glass_car: { albedo: "#7f95a8", roughness: 0.08, metallic: 0.2, alpha: 0.45 },
  mirror: { albedo: "#c9d0d8", roughness: 0.03, metallic: 0.95 },
  leather: { albedo: "#35261f", roughness: 0.5, metallic: 0.0 },
  brass: { albedo: "#b08a3e", roughness: 0.3, metallic: 0.9 },
  rubber: { albedo: "#1c1c1e", roughness: 0.95, metallic: 0.0 },
  ceiling: { albedo: "#3c3c42", roughness: 0.92, metallic: 0.0, tex: "plaster", scale: 3 },
  paint: { albedo: "#5a5960", roughness: 0.6, metallic: 0.05, tex: "plaster", scale: 2 },
  paint_red: { albedo: "#b8362b", roughness: 0.45, metallic: 0.1, tex: "plaster", scale: 2 },
  paint_blue: { albedo: "#2f5d9e", roughness: 0.45, metallic: 0.1, tex: "plaster", scale: 2 },
  paint_green: { albedo: "#3e7a4f", roughness: 0.5, metallic: 0.1, tex: "plaster", scale: 2 },
  paint_white: { albedo: "#d9d6cf", roughness: 0.5, metallic: 0.05, tex: "plaster", scale: 2 },
  paint_yellow: { albedo: "#d9a441", roughness: 0.5, metallic: 0.05, tex: "plaster", scale: 2 },
  paint_orange: { albedo: "#d4682a", roughness: 0.5, metallic: 0.05, tex: "plaster", scale: 2 },
  corrugated_red: { albedo: "#a8382c", roughness: 0.55, metallic: 0.2, tex: "corrugated", scale: 1 },
  corrugated_blue: { albedo: "#2c5a8e", roughness: 0.55, metallic: 0.2, tex: "corrugated", scale: 1 },
  corrugated_green: { albedo: "#3c6e4a", roughness: 0.55, metallic: 0.2, tex: "corrugated", scale: 1 },
  fence: { albedo: "#9aa0a8", roughness: 0.4, metallic: 0.8, tex: "fence", scale: 0.5, cutout: true },
  concrete_block: { albedo: "#8a8680", roughness: 0.9, metallic: 0.0, tex: "blocks", scale: 1.2 },
  soil: { albedo: "#3a2c20", roughness: 1.0, metallic: 0.0, tex: "concrete", scale: 1 },
  foliage: { albedo: "#3f6b2a", roughness: 0.95, metallic: 0.0, tex: "concrete", scale: 0.7 },
  none: { albedo: "#555555", roughness: 0.8, metallic: 0.0 },
};

/**
 * PBR materials with small procedurally generated albedo textures (256px, generated once,
 * shared by tag). Zero external assets; the art pass can swap textures without touching callers.
 */
export function createMaterialLibrary(scene: Scene): MaterialLibrary {
  const cache = new Map<MaterialTag, PBRMaterial>();
  const textures: Texture[] = [];

  const make = (tag: MaterialTag): PBRMaterial => {
    const spec = SPECS[tag];
    const m = new PBRMaterial(`mat_${tag}`, scene);
    m.albedoColor = Color3.FromHexString(spec.albedo).toLinearSpace();
    m.roughness = spec.roughness;
    m.metallic = spec.metallic;
    m.environmentIntensity = 0.6;
    m.specularIntensity = 0.7;
    // 5, not 8: with range-culled practicals (MapBuilder) a 12 m tile sees ~6–9 lights; the cap
    // bounds the shader variant, and 8-light PBR was the largest measured GPU cost in 0.1 beta.
    m.maxSimultaneousLights = 5;
    // PBR's default PHYSICAL falloff ignores `range` (pure 1/d²), so every practical lit the whole
    // map faintly and range culling would have been visible as popping. GLTF falloff is 1/d² with
    // a smooth cutoff at `range`: what the culling assumes is what the shader draws.
    m.useGLTFLightFalloff = true;
    if (spec.tex) {
      const t = proceduralTexture(scene, spec.tex, tag);
      t.uScale = 1 / (spec.scale ?? 1);
      t.vScale = 1 / (spec.scale ?? 1);
      m.albedoTexture = t;
      textures.push(t);
    }
    if (spec.alpha !== undefined) {
      m.alpha = spec.alpha;
      m.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
    }
    if (spec.cutout && m.albedoTexture) {
      m.albedoTexture.hasAlpha = true;
      m.useAlphaFromAlbedoTexture = true;
      m.transparencyMode = PBRMaterial.MATERIAL_ALPHATEST;
      m.backFaceCulling = false;
    }
    if (spec.emissive) m.emissiveColor = Color3.FromHexString(spec.emissive);
    m.freeze();
    return m;
  };

  return {
    get(tag) {
      let m = cache.get(tag);
      if (!m) { m = make(tag); cache.set(tag, m); }
      return m;
    },
    dispose() {
      for (const m of cache.values()) m.dispose(true, true);
      cache.clear();
    },
  };
}

/** Tiny deterministic hash noise for texture generation. */
function noise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function proceduralTexture(scene: Scene, kind: NonNullable<Spec["tex"]>, tag: string): Texture {
  const size = 256;
  const dt = new DynamicTexture(`tex_${tag}`, { width: size, height: size }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const seed = tag.length * 3.7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0.5;
      let alpha = 255;
      const u = x / size, w = y / size;
      switch (kind) {
        case "concrete": v = 0.45 + noise(x * 0.5, y * 0.5, seed) * 0.25 + noise(x * 0.08, y * 0.08, seed + 1) * 0.3; break;
        case "asphalt": v = 0.35 + noise(x, y, seed) * 0.35 + noise(x * 0.1, y * 0.1, seed + 2) * 0.2; break;
        case "plaster": v = 0.55 + noise(x * 0.2, y * 0.2, seed) * 0.15 + noise(x * 0.03, y * 0.03, seed + 3) * 0.3; break;
        case "metal": v = 0.5 + noise(x * 0.05, y * 2, seed) * 0.2 + noise(x, y, seed + 4) * 0.1; break;
        case "brick": {
          const row = Math.floor(w * 8), off = (row % 2) * 0.5;
          const bu = (u * 4 + off) % 1, bv = (w * 8) % 1;
          const mortar = bu < 0.06 || bv < 0.12;
          v = mortar ? 0.35 : 0.55 + noise(Math.floor(u * 4 + off), row, seed) * 0.3 + noise(x, y, seed + 5) * 0.12;
          break;
        }
        case "tiles": {
          const tu = (u * 4) % 1, tv = (w * 4) % 1;
          const grout = tu < 0.04 || tv < 0.04;
          v = grout ? 0.75 : 0.5 + noise(Math.floor(u * 4), Math.floor(w * 4), seed) * 0.12 + noise(x * 0.3, y * 0.3, seed + 6) * 0.08;
          break;
        }
        case "checker": {
          const cu = Math.floor(u * 2), cv = Math.floor(w * 2);
          const grout = (u * 2) % 1 < 0.03 || (w * 2) % 1 < 0.03;
          v = grout ? 0.6 : ((cu + cv) % 2 === 0 ? 0.75 : 0.28) + noise(x * 0.2, y * 0.2, seed) * 0.08;
          break;
        }
        case "wood": v = 0.5 + Math.sin((w * 6 + noise(x * 0.02, y * 0.02, seed) * 2) * Math.PI) * 0.12 + noise(x, y * 0.1, seed + 7) * 0.12; break;
        case "planks": {
          const plank = Math.floor(u * 6);
          const seam = (u * 6) % 1 < 0.03 || ((w * 2 + (plank % 2) * 0.5) % 1) < 0.02;
          v = seam ? 0.3 : 0.5 + noise(plank, 0, seed) * 0.2 + Math.sin((w * 30 + plank) * 1.3 + noise(x * 0.01, y * 0.2, seed) * 3) * 0.06 + noise(x, y * 0.05, seed + 8) * 0.1;
          break;
        }
        case "panel": {
          const seam = (u * 2) % 1 < 0.02 || (w * 2) % 1 < 0.02;
          v = seam ? 0.3 : 0.55 + noise(x * 0.1, y * 0.1, seed) * 0.1;
          break;
        }
        case "corrugated": {
          // Vertical ribs, 4 per metre, with a soft shading ramp per rib + a little grime.
          const rib = (u * 4) % 1;
          v = 0.5 + 0.22 * Math.sin(rib * Math.PI * 2) + noise(x * 0.05, y * 0.05, seed) * 0.08 - (w > 0.9 ? 0.15 : 0);
          break;
        }
        case "blocks": {
          const row = Math.floor(w * 2), off = (row % 2) * 0.5;
          const bu = (u * 2 + off) % 1, bv = (w * 2) % 1;
          const mortar = bu < 0.04 || bv < 0.06;
          v = mortar ? 0.4 : 0.62 + noise(Math.floor(u * 2 + off), row, seed) * 0.12 + noise(x * 0.4, y * 0.4, seed + 9) * 0.08;
          break;
        }
        case "fence": {
          // Chain-link: two families of diagonal wires; alpha = wire mask.
          const d1 = Math.abs(((u + w) * 6) % 1 - 0.5), d2 = Math.abs(((u - w + 2) * 6) % 1 - 0.5);
          const wire = d1 < 0.06 || d2 < 0.06;
          v = wire ? 0.8 : 0;
          alpha = wire ? 255 : 0;
          break;
        }
      }
      const c = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * size + x) * 4;
      d[i] = c; d[i + 1] = c; d[i + 2] = c; d[i + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  dt.update(false);
  dt.wrapU = Texture.WRAP_ADDRESSMODE;
  dt.wrapV = Texture.WRAP_ADDRESSMODE;
  dt.anisotropicFilteringLevel = 8;
  return dt;
}
