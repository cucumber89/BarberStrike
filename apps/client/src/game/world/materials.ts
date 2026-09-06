import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialTag } from "@frankibarber/shared";

export interface MaterialLibrary {
  get(tag: MaterialTag): Material;
  dispose(): void;
}

/** Procedural surface generator name (one height field + albedo per kind, see `generateSurface`). */
export type SurfaceKind = "tiles" | "concrete" | "brick" | "wood" | "planks" | "asphalt" | "metal" | "plaster" | "panel" | "checker" | "corrugated" | "fence" | "blocks" | "leather" | "rubber";

interface Spec {
  albedo: string;
  roughness: number;
  metallic: number;
  /** Procedural texture generator name. */
  tex?: SurfaceKind;
  /** Texture tiling in metres per repeat. */
  scale?: number;
  alpha?: number;
  emissive?: string;
  /** Alpha-tested texture (chain-link fence): the generator writes the alpha channel. */
  cutout?: boolean;
}

// 1.0 beta palette: mid-tones lifted ~1.6× over 0.1 (which was black-to-dark-grey after
// toLinearSpace) and colour on the object materials, so cover reads as objects, not as blocks.
// The generated textures keep the same per-kind mean brightness as the 1.0 greyscale ones (the
// test pins them), so this palette still means what it was measured to mean.
const SPECS: Record<MaterialTag, Spec> = {
  wall_sand: { albedo: "#c6a27d", roughness: .85, metallic: 0, tex: "plaster", scale: 3 },
  wall_teal: { albedo: "#668d89", roughness: .8, metallic: 0, tex: "plaster", scale: 3 },
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
  leather: { albedo: "#35261f", roughness: 0.5, metallic: 0.0, tex: "leather", scale: 0.5 },
  brass: { albedo: "#b08a3e", roughness: 0.3, metallic: 0.9 },
  rubber: { albedo: "#1c1c1e", roughness: 0.95, metallic: 0.0, tex: "rubber", scale: 0.5 },
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
 * PBR materials with procedurally generated textures: a 512px RGB albedo plus a tangent-space
 * normal map derived from the same height field (and, for the rusting metals, a
 * roughness/metallic map). Zero external assets; the art pass can swap textures without touching
 * callers. Pixel data is generated once per surface kind and GPU textures once per (kind, tiling),
 * so the ten plaster-based tags share one texture set; materials are still cached per tag.
 */
export function createMaterialLibrary(scene: Scene): MaterialLibrary {
  const cache = new Map<MaterialTag, PBRMaterial>();
  const surfaces = new Map<SurfaceKind, Surface>();
  const textures = new Map<string, RawTexture>();
  let genMs = 0, logPending = false;

  const surface = (kind: SurfaceKind): Surface => {
    let s = surfaces.get(kind);
    if (!s) {
      const t0 = performance.now();
      s = generateSurface(kind);
      genMs += performance.now() - t0;
      surfaces.set(kind, s);
      if (import.meta.env.DEV && !logPending) {
        logPending = true;
        setTimeout(() => { logPending = false; console.debug(`[materials] ${surfaces.size} surface kinds generated in ${genMs.toFixed(1)} ms`); }, 0);
      }
    }
    return s;
  };

  const texture = (key: string, data: Uint8Array, scale: number): RawTexture => {
    let t = textures.get(key);
    if (!t) {
      // invertY=false: data row 0 is v=0, which is what the normal map's green channel assumes.
      t = RawTexture.CreateRGBATexture(data, SURFACE_SIZE, SURFACE_SIZE, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
      t.name = `tex_${key}`;
      t.wrapU = Texture.WRAP_ADDRESSMODE;
      t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = 8;
      t.uScale = 1 / scale;
      t.vScale = 1 / scale;
      textures.set(key, t);
    }
    return t;
  };

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
      const kind = spec.tex, scale = spec.scale ?? 1;
      const s = surface(kind);
      m.albedoTexture = texture(`${kind}_${scale}_albedo`, s.albedo, scale);
      m.bumpTexture = texture(`${kind}_${scale}_normal`, s.normal, scale);
      // The map has no tangent attributes, so the shader builds its frame from screen derivatives
      // (Babylon's cotangent_frame); with these flags a raised brick shades as raised — verified
      // against the moon direction in a screenshot, see the 2.1 materials pass.
      m.invertNormalMapX = true;
      m.invertNormalMapY = true;
      if (s.wear) {
        // Rust: rougher and dielectric where the wear mask is set. The scalars become 1 so the
        // texture carries the spec's clean values (Babylon multiplies scalar × texture).
        const mr = texture(`${kind}_${scale}_mr_${spec.roughness}_${spec.metallic}`, metalRoughData(s.wear, spec.roughness, spec.metallic), scale);
        m.metallicTexture = mr;
        m.useRoughnessFromMetallicTextureAlpha = false;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.roughness = 1;
        m.metallic = 1;
      }
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
      // Textures are shared between materials, so they are released here, once, not per material.
      for (const m of cache.values()) m.dispose(true, false);
      for (const t of textures.values()) t.dispose();
      cache.clear();
      textures.clear();
      surfaces.clear();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Surface generation. Everything below is pure (no Babylon), so it is unit-testable and cheap:
// shared periodic noise tables are built once per module, each kind evaluates one height field
// into a scratch buffer, and the albedo and the normal map are both read off that field so
// relief and colour always agree (mortar is dark AND recessed, a rib is lit AND raised).

/** Texture edge in pixels (power of two: the tables and the wrap masks depend on it). */
export const SURFACE_SIZE = 512;
const S = SURFACE_SIZE, M = S - 1;

export interface Surface {
  /** RGBA, sRGB-ish greys around the kind's mean brightness; tinted by the material's albedo. */
  albedo: Uint8Array;
  /** RGBA tangent-space normal map (OpenGL convention: +G is +v, i.e. data row order). */
  normal: Uint8Array;
  /** Rust/wear mask 0–255 (kinds that corrode), or null. */
  wear: Uint8Array | null;
}

interface Tables { wn: Float32Array; v8: Float32Array; v32: Float32Array; v128: Float32Array }
let tables: Tables | null = null;

/** Integer hash → [0, 1). Cheap (no sin) and stable across platforms. */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Bilinear (smoothstep-faded) value noise with `cells` lattice points per edge; tiles seamlessly. */
function valueTable(cells: number, seed: number): Float32Array {
  const t = new Float32Array(S * S);
  const cs = S / cells, L = cells + 1;
  const lat = new Float32Array(L * L);
  for (let iy = 0; iy < L; iy++) for (let ix = 0; ix < L; ix++) lat[iy * L + ix] = hash(ix % cells, iy % cells, seed);
  for (let y = 0; y < S; y++) {
    const gy = y / cs, iy = Math.floor(gy); let fy = gy - iy; fy = fy * fy * (3 - 2 * fy);
    const r0 = iy * L, r1 = (iy + 1) * L;
    for (let x = 0; x < S; x++) {
      const gx = x / cs, ix = Math.floor(gx); let fx = gx - ix; fx = fx * fx * (3 - 2 * fx);
      const a = lat[r0 + ix] + (lat[r0 + ix + 1] - lat[r0 + ix]) * fx;
      const b = lat[r1 + ix] + (lat[r1 + ix + 1] - lat[r1 + ix]) * fx;
      t[y * S + x] = a + (b - a) * fy;
    }
  }
  return t;
}

function getTables(): Tables {
  if (!tables) {
    const wn = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) wn[i] = hash(i & M, i >> 9, 1);
    tables = { wn, v8: valueTable(8, 2), v32: valueTable(32, 3), v128: valueTable(128, 4) };
  }
  return tables;
}

const sstep = (e0: number, e1: number, x: number): number => {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
};

/**
 * One pass per pixel: returns the height 0–1 and writes the colour into `o` (rgb 0–1, o[3] = wear
 * 0–1, o[4] = alpha 0–1). Height and colour come from the same cell/noise lookups, so they agree
 * by construction and nothing is evaluated twice.
 */
type PixelFn = (x: number, y: number, o: Float32Array) => number;

interface KindGen {
  px: PixelFn;
  /** Gradient → normal amplification (height units are 0–1 over the whole field, so this is large). */
  relief: number;
  /** The kind corrodes: emit the wear mask. */
  wear?: boolean;
  /** Cutout: the alpha channel is meaningful. */
  cutout?: boolean;
}

const KIND_SEED: Record<SurfaceKind, number> = { tiles: 11, concrete: 23, brick: 37, wood: 41, planks: 53, asphalt: 67, metal: 71, plaster: 83, panel: 97, checker: 101, corrugated: 113, fence: 127, blocks: 131, leather: 139, rubber: 149 };

// Cell scratch for the masonry-like kinds (module-level so the per-pixel path allocates nothing).
let cCol = 0, cRow = 0, cFx = 0, cFy = 0, cD = 0, cCw = 0, cCh = 0;
/** Lays `cols × rows` cells over the texture with `joint` px joints; `cD` < 0 inside a joint. */
function cellAt(x: number, y: number, cols: number, rows: number, stagger: boolean, joint: number): void {
  cCw = S / cols; cCh = S / rows;
  const row = Math.floor(y / cCh);
  const xx = x + (stagger && (row & 1) ? cCw * 0.5 : 0);
  const col = Math.floor(xx / cCw);
  cFx = xx - col * cCw; cFy = y - row * cCh;
  cD = Math.min(cFx - joint, cCw - cFx, cFy - joint, cCh - cFy);
  cCol = col % cols; cRow = row % rows;
}

function kindGen(kind: SurfaceKind, T: Tables): KindGen {
  const seed = KIND_SEED[kind];
  const o1x = (seed * 97) & M, o1y = (seed * 193) & M, o2x = (seed * 389) & M, o2y = (seed * 61) & M;
  const wn = (x: number, y: number) => T.wn[((y + o1y) & M) * S + ((x + o1x) & M)];
  const v8 = (x: number, y: number) => T.v8[((y + o1y) & M) * S + ((x + o1x) & M)];
  const v8b = (x: number, y: number) => T.v8[((y + o2y) & M) * S + ((x + o2x) & M)];
  const v32 = (x: number, y: number) => T.v32[((y + o1y) & M) * S + ((x + o1x) & M)];
  const v32b = (x: number, y: number) => T.v32[((y + o2y) & M) * S + ((x + o2x) & M)];
  const v128 = (x: number, y: number) => T.v128[((y + o1y) & M) * S + ((x + o1x) & M)];
  /** Meandering crack network: a contour of low-frequency noise, gated by a coverage mask. */
  const crack = (x: number, y: number, width: number, coverage: number): number => {
    const dist = Math.abs(v8b(x, y) + 0.35 * (v32b(x, y) - 0.5) - 0.5);
    if (dist > width) return 0;
    return (1 - dist / width) * sstep(coverage - 0.08, coverage + 0.08, v8(x + 200, y + 130));
  };
  /** Warm (t > 0) / cool (t < 0) tint of a grey `v`, `amount` = full-strength hue swing. */
  const tint = (o: Float32Array, v: number, t: number, amount: number) => {
    o[0] = v * (1 + amount * t); o[1] = v; o[2] = v * (1 - amount * 1.15 * t);
  };
  /** Blends the colour toward a joint/seam grey by (1 - e). */
  const joint = (o: Float32Array, jv: number, e: number) => {
    o[0] = jv + (o[0] - jv) * e; o[1] = jv + (o[1] - jv) * e; o[2] = jv + (o[2] - jv) * e;
  };
  const scale = (o: Float32Array, g: number) => { o[0] *= g; o[1] *= g; o[2] *= g; };

  switch (kind) {
    case "brick": {
      // 4 × 12 per 2 m: 50 × 17 cm bricks, 5 px (≈ 2 cm) joints.
      const C = 4, R = 12, J = 5;
      return {
        relief: 3.2,
        px(x, y, o) {
          cellAt(x, y, C, R, true, J);
          const e = sstep(-1, 3, cD);
          const n = wn(x, y), n2 = wn(x + 11, y + 5), lf = v32(x, y) - 0.5, hf = v128(x, y) - 0.5;
          const spot = n2 < 0.025;
          const face = 0.78 + 0.22 * hash(cCol, cRow, seed) + 0.08 * lf + 0.05 * (n - 0.5) - (spot ? 0.12 : 0);
          const mortar = 0.12 + 0.08 * n + 0.05 * hf;
          const h = mortar + (face - mortar) * e;
          const t = hash(cCol, cRow, seed + 1) * 2 - 1;
          let v = 0.77 + 0.22 * (hash(cCol, cRow, seed + 2) - 0.5) + 0.08 * (n - 0.5) + 0.06 * hf;
          if (spot) v *= 0.75;
          tint(o, v, t, 0.08);
          const mv = 0.45 + 0.1 * (n - 0.5) + 0.06 * lf;
          o[0] = mv * 0.94 + (o[0] - mv * 0.94) * e; o[1] = mv + (o[1] - mv) * e; o[2] = mv * 1.06 + (o[2] - mv * 1.06) * e;
          scale(o, (0.9 + 0.2 * v8(x, y)) * (0.86 + 0.14 * h));
          return h;
        },
      };
    }
    case "blocks": {
      // 3 × 6 per 1.2 m: 40 × 20 cm concrete blocks, pitted faces, 5 px joints.
      const C = 3, R = 6, J = 5;
      return {
        relief: 3,
        px(x, y, o) {
          cellAt(x, y, C, R, true, J);
          const e = sstep(-1, 3, cD);
          const n = wn(x, y), hf = v128(x, y) - 0.5;
          const pit = n < 0.05;
          const face = 0.8 + 0.1 * (hash(cCol, cRow, seed) - 0.5) + 0.1 * hf + 0.04 * (wn(x + 5, y) - 0.5) - (pit ? 0.15 : 0);
          const mortar = 0.15 + 0.08 * n;
          const h = mortar + (face - mortar) * e;
          let v = 0.74 + 0.14 * (hash(cCol, cRow, seed + 2) - 0.5) + 0.06 * (n - 0.5) + 0.05 * hf;
          if (pit) v *= 0.78;
          tint(o, v, hash(cCol, cRow, seed + 1) * 2 - 1, 0.04);
          joint(o, 0.44 + 0.08 * (n - 0.5), e);
          scale(o, (0.9 + 0.2 * v8(x, y)) * (0.9 + 0.1 * h));
          return h;
        },
      };
    }
    case "tiles": {
      // 4 × 4 per metre: 25 cm glazed tiles, light grout, each tile very slightly tilted.
      const C = 4, J = 5;
      return {
        relief: 2.2,
        px(x, y, o) {
          cellAt(x, y, C, C, false, J);
          const e = sstep(-1, 3, cD);
          const n = wn(x, y), hf = v128(x, y) - 0.5;
          const tilt = (hash(cCol, cRow, seed) - 0.5) * 0.14 * (cFx / cCw) + (hash(cCol, cRow, seed + 1) - 0.5) * 0.14 * (cFy / cCh);
          const face = 0.86 + tilt + 0.02 * hf;
          const grout = 0.25 + 0.1 * n;
          const h = grout + (face - grout) * e;
          const v = 0.62 + 0.14 * (hash(cCol, cRow, seed + 3) - 0.5) + 0.05 * hf + 0.02 * (n - 0.5);
          tint(o, v, hash(cCol, cRow, seed + 2) * 2 - 1, 0.03);
          joint(o, 0.7 + 0.12 * (n - 0.5) - 0.08 * v8(x, y), e);
          scale(o, 0.9 + 0.1 * h);
          return h;
        },
      };
    }
    case "checker": {
      // 2 × 2 per 1.2 m: 60 cm checkerboard floor tiles, scuffed, grime along the grout.
      const C = 2, J = 4;
      return {
        relief: 2,
        px(x, y, o) {
          cellAt(x, y, C, C, false, J);
          const e = sstep(-1, 3, cD);
          const n = wn(x, y), hf = v128(x, y) - 0.5;
          const light = (cCol + cRow) % 2 === 0;
          const chip = n < 0.004;
          const tilt = (hash(cCol, cRow, seed) - 0.5) * 0.08 * (cFx / cCw) + (hash(cCol, cRow, seed + 1) - 0.5) * 0.08 * (cFy / cCh);
          const face = 0.86 + tilt + 0.03 * hf + 0.02 * (wn(x + 9, y) - 0.5) - (chip ? 0.2 : 0);
          const grout = 0.3 + 0.1 * n;
          const h = grout + (face - grout) * e;
          let v = (light ? 0.8 : 0.33) + 0.08 * (v32(x, y) - 0.5) + 0.04 * (n - 0.5) + 0.03 * hf;
          if (chip) v = light ? 0.55 : 0.4;
          tint(o, v, light ? 0.3 : -0.3, 0.04);
          joint(o, 0.58 + 0.1 * (n - 0.5), e);
          scale(o, (0.92 + 0.16 * v8(x, y)) * (0.88 + 0.12 * h));
          return h;
        },
      };
    }
    case "planks":
    case "wood": {
      // 6 planks across the repeat, running along v, ends staggered per plank; `wood` is the same
      // grain without seams (solid boards).
      const C = 6, PW = S / C, J = 3, seams = kind === "planks";
      return {
        relief: 2.6,
        px(x, y, o) {
          const col = Math.floor(x / PW), fx = x - col * PW, pc = col % C;
          const yy = y + hash(pc, 0, seed) * 256, row = Math.floor(yy / 256) & 1, fy = yy - Math.floor(yy / 256) * 256;
          const d = seams ? Math.min(fx - J, PW - fx, fy - J, 256 - fy) : 100;
          const e = sstep(-1, 3, d);
          const n = wn(x, y), hf = v128(x, y) - 0.5;
          // Grain runs along the plank (v) and wanders slowly; sampled at y >> 2 so the wobble is
          // elongated, which still tiles because the lattice period divides 512 >> 2.
          const gr = Math.sin(fx * 0.7 + 9 * v8(x, y) + 1.5 * v32(x, y >> 2));
          const cx = (fx / PW) * 2 - 1;
          const face = 0.66 + 0.14 * (1 - cx * cx) + 0.08 * (hash(pc, row, seed + 1) - 0.5) + 0.04 * gr + 0.03 * (n - 0.5);
          const h = 0.2 + (face - 0.2) * e;
          let v = 0.67 + 0.16 * (hash(pc, row, seed + 3) - 0.5) - 0.07 * sstep(0.45, 1, gr) + 0.02 * gr + 0.05 * (n - 0.5) + 0.04 * hf;
          if (seams && fy > 236) v *= 0.9;
          tint(o, v, hash(pc, row, seed + 2) * 2 - 1, 0.06);
          joint(o, 0.3, e);
          scale(o, (0.9 + 0.2 * v8(x, y)) * (0.92 + 0.08 * h));
          return h;
        },
      };
    }
    case "concrete": {
      return {
        relief: 3,
        px(x, y, o) {
          const cr = crack(x, y, 0.014, 0.5);
          const n = wn(x, y), hf = v128(x, y);
          const pit = wn(x + 7, y + 3) < 0.02;
          const h = 0.45 + 0.3 * v32(x, y) + 0.15 * hf + 0.05 * n - 0.3 * cr - (pit ? 0.1 : 0);
          let v = 0.8 + 0.12 * (v8(x, y) - 0.5) + 0.05 * (hf - 0.5) + 0.05 * (n - 0.5);
          if (pit) v *= 0.7;
          v *= 1 - 0.45 * cr;
          const stain = sstep(0.62, 0.82, v8b(x + 50, y + 90));
          const sv = 1 - 0.22 * stain;
          o[0] = v * sv * (1 + 0.03 * stain); o[1] = v * sv; o[2] = v * sv * (1 - 0.05 * stain);
          return h;
        },
      };
    }
    case "asphalt": {
      // Coarse aggregate, sharp-edged repair patches (fresher, darker, smoother), oil stains, cracks.
      return {
        relief: 2.4,
        px(x, y, o) {
          const p = sstep(0.63, 0.66, v8(x + 300, y + 200));
          const cr = crack(x, y, 0.016, 0.45) * (1 - p);
          const agg = hash(x >> 1, y >> 1, seed + 5);
          const h = 0.4 + (0.25 - 0.12 * p) * agg + 0.15 * v128(x, y) + 0.15 * v32(x, y) + 0.08 * p - 0.3 * cr;
          let v = 0.54 + (0.3 - 0.14 * p) * agg + 0.04 * (v32(x, y) - 0.5) - 0.07 * p;
          v *= 1 - 0.5 * cr;
          const oil = sstep(0.66, 0.86, v8b(x, y));
          const ov = 1 - 0.32 * oil;
          o[0] = v * ov * (1 + 0.04 * oil); o[1] = v * ov; o[2] = v * ov * (1 - 0.04 * oil);
          return h;
        },
      };
    }
    case "plaster": {
      return {
        relief: 2.2,
        px(x, y, o) {
          const cr = crack(x, y, 0.004, 0.62);
          const n = wn(x, y), hf = v128(x, y) - 0.5, lf = v8(x, y) - 0.5;
          const h = 0.5 + 0.3 * (v32(x, y) - 0.5) + 0.25 * hf + 0.12 * (n - 0.5) - 0.15 * cr;
          const blotch = sstep(0.6, 0.8, v8(x + 77, y + 33));
          const v = (0.825 + 0.06 * lf + 0.035 * (n - 0.5) + 0.03 * hf - 0.05 * blotch) * (1 - 0.2 * cr);
          tint(o, v, (v8b(x, y) - 0.5) * 2, 0.03);
          return h;
        },
      };
    }
    case "metal": {
      // 2 × 2 riveted panels per repeat, brushed finish, shallow dents, rust streaks running down.
      const J = 3, B = 5;
      const bolt = (fx: number, fy: number): number => {
        // Rivets inset 12 px from the seams, every 64 px along them.
        let best = 99;
        if (Math.abs(fy - 12) < 7 || Math.abs(fy - 244) < 7) { const dx = ((fx + 32) % 64) - 32, dy = Math.min(Math.abs(fy - 12), Math.abs(fy - 244)); best = Math.sqrt(dx * dx + dy * dy); }
        if (Math.abs(fx - 12) < 7 || Math.abs(fx - 244) < 7) { const dy = ((fy + 32) % 64) - 32, dx = Math.min(Math.abs(fx - 12), Math.abs(fx - 244)); best = Math.min(best, Math.sqrt(dx * dx + dy * dy)); }
        return best < B ? Math.sqrt(1 - (best / B) * (best / B)) : 0;
      };
      return {
        relief: 3,
        wear: true,
        px(x, y, o) {
          const fx = x & 255, fy = y & 255;
          const d = Math.min(fx - J, 256 - fx, fy - J, 256 - fy);
          const e = sstep(-1, 3, d);
          const n = wn(x, y), brush = hash(y, x >> 5, seed + 3) - 0.5, b = bolt(fx, fy);
          const r = sstep(0.58, 0.85, 0.5 * v8(x, y) + 0.5 * v32(x, y >> 3));
          const face = 0.8 + 0.03 * brush + 0.15 * b + 0.02 * (n - 0.5) - 0.08 * sstep(0.7, 0.85, v32(x, y)) + 0.06 * r * n;
          const h = 0.3 + (face - 0.3) * e;
          let v = 0.68 + 0.04 * (hash(x >> 8, y >> 8, seed + 4) - 0.5) + 0.12 * brush + 0.05 * (n - 0.5) - 0.06 * b;
          v = 0.3 + (v - 0.3) * e;
          const rv = 0.55 + 0.2 * (n - 0.5);
          o[0] = v + (rv - v) * r; o[1] = v + (rv * 0.58 - v) * r; o[2] = v + (rv * 0.32 - v) * r;
          o[3] = r;
          return h;
        },
      };
    }
    case "corrugated": {
      // 8 ribs per metre (12.5 cm pitch), sheets overlapping every metre, rust in the valleys.
      const K = (8 * Math.PI * 2) / S;
      return {
        relief: 7,
        wear: true,
        px(x, y, o) {
          const sn = Math.sin(x * K), n = wn(x, y);
          const h = 0.5 + 0.42 * sn + (y < 12 ? 0.1 : 0) - 0.08 * sstep(0.78, 0.9, v32(x, y)) + 0.015 * (n - 0.5);
          let v = 0.55 + 0.1 * sn + 0.05 * (v8b(x, y) - 0.5) + 0.03 * (n - 0.5);
          if (wn(x + 13, y + 29) < 0.006) v += 0.2;                // scratches to bare metal
          v *= 0.85 + 0.15 * sstep(0, 60, y);                        // grime at the foot of the sheet
          if (y < 12) v *= 0.9;                                      // shadow line under the overlap
          const r = sstep(0.55, 0.85, 0.45 * v8(x, y) + 0.35 * v32(x, y >> 2) + 0.2 * (0.5 - 0.5 * sn));
          const rv = 0.5 + 0.2 * (n - 0.5);
          o[0] = v + (rv - v) * r; o[1] = v + (rv * 0.55 - v) * r; o[2] = v + (rv * 0.3 - v) * r;
          o[3] = r;
          return h;
        },
      };
    }
    case "panel": {
      // 2 × 2 panels: a raised frame around a recessed field, faint vertical veneer grain.
      const J = 3, FRAME = 14;
      return {
        relief: 2.4,
        px(x, y, o) {
          const fx = x & 255, fy = y & 255;
          const d = Math.min(fx - J, 256 - fx, fy - J, 256 - fy);
          const e = sstep(-1, 3, d);
          const field = sstep(FRAME, FRAME + 8, d);
          const n = wn(x, y), gr = Math.sin(fx * 0.3 + 5 * v32(x, y));
          const face = 0.85 - 0.12 * field + 0.02 * gr + 0.015 * (n - 0.5);
          const h = 0.3 + (face - 0.3) * e;
          let v = 0.58 + 0.06 * (hash(x >> 8, y >> 8, seed + 1) - 0.5) + 0.04 * (1 - field) + 0.05 * gr + 0.03 * (n - 0.5) + 0.03 * (v128(x, y) - 0.5);
          v *= 0.92 + 0.16 * v8(x, y);
          v = 0.3 + (v - 0.3) * e;
          tint(o, v, hash(x >> 8, y >> 8, seed + 2) * 2 - 1, 0.06);
          return h;
        },
      };
    }
    case "fence": {
      // Chain-link: two families of diagonal wires; alpha = wire mask, height = round wire.
      const R = 0.06;
      return {
        relief: 1.2,
        cutout: true,
        px(x, y, o) {
          const u = x / S, w = y / S;
          const d1 = Math.abs(((u + w) * 6) % 1 - 0.5), d2 = Math.abs(((u - w + 2) * 6) % 1 - 0.5);
          const d = Math.min(d1, d2);
          const h = d < R ? 0.5 + 0.5 * Math.sqrt(1 - (d / R) * (d / R)) : 0;
          const v = 0.8 + 0.1 * (wn(x, y) - 0.5) + 0.06 * (v32(x, y) - 0.5);
          const r = wn(x + 17, y + 3) < 0.06 ? 0.7 : 0;
          o[0] = v + (0.5 - v) * r; o[1] = v + (0.32 - v) * r; o[2] = v + (0.18 - v) * r;
          o[4] = 1 - sstep(R - 0.006, R + 0.006, d);
          return h;
        },
      };
    }
    case "leather": {
      // Pebbled grain: ridged noise makes creases between soft bumps. Mean ≈ 1 so the tag's colour
      // is unchanged (leather had no texture in 1.0).
      return {
        relief: 2.4,
        px(x, y, o) {
          const n = wn(x, y), lf = v32(x, y) - 0.5;
          const h = 0.55 + 0.25 * (1 - Math.abs(2 * v128(x, y) - 1)) + 0.1 * lf + 0.04 * (n - 0.5);
          const v = (1.02 + 0.08 * lf + 0.05 * (n - 0.5)) * (0.86 + 0.14 * h);
          o[0] = v; o[1] = v; o[2] = v;
          return h;
        },
      };
    }
    case "rubber": {
      return {
        relief: 1.6,
        px(x, y, o) {
          const n = wn(x, y);
          const v = 1.0 + 0.04 * (n - 0.5) + 0.06 * (v32(x, y) - 0.5);
          o[0] = v; o[1] = v; o[2] = v;
          return 0.5 + 0.2 * (n - 0.5) + 0.2 * (v128(x, y) - 0.5);
        },
      };
    }
  }
}

let scratchH: Float32Array | null = null;

/**
 * Generates one surface kind: height + albedo in one pass, then the normal map from the height
 * field by central differences. Pure and allocation-free per pixel (typed arrays, one scratch
 * height buffer per module).
 */
export function generateSurface(kind: SurfaceKind): Surface {
  const T = getTables();
  const K = kindGen(kind, T);
  const H = scratchH ?? (scratchH = new Float32Array(S * S));
  const albedo = new Uint8Array(S * S * 4);
  const wear = K.wear ? new Uint8Array(S * S) : null;
  const o = new Float32Array(5);
  o[4] = 1;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = y * S + x, i = p * 4;
      H[p] = K.px(x, y, o);
      albedo[i] = o[0] <= 0 ? 0 : o[0] >= 1 ? 255 : o[0] * 255;
      albedo[i + 1] = o[1] <= 0 ? 0 : o[1] >= 1 ? 255 : o[1] * 255;
      albedo[i + 2] = o[2] <= 0 ? 0 : o[2] >= 1 ? 255 : o[2] * 255;
      albedo[i + 3] = K.cutout ? o[4] * 255 : 255;
      if (wear) wear[p] = o[3] * 255;
    }
  }

  const normal = new Uint8Array(S * S * 4);
  const relief = K.relief;
  for (let y = 0; y < S; y++) {
    const r = y * S, rp = ((y + 1) & M) * S, rm = ((y - 1) & M) * S;
    for (let x = 0; x < S; x++) {
      const dx = (H[r + ((x + 1) & M)] - H[r + ((x - 1) & M)]) * 0.5 * relief;
      const dy = (H[rp + x] - H[rm + x]) * 0.5 * relief;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (r + x) * 4;
      normal[i] = (-dx * inv * 0.5 + 0.5) * 255;
      normal[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      normal[i + 2] = (inv * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  return { albedo, normal, wear };
}

/** Babylon metallic texture layout: G = roughness, B = metallic. Rust is rough and dielectric. */
function metalRoughData(wear: Uint8Array, roughness: number, metallic: number): Uint8Array {
  const d = new Uint8Array(S * S * 4);
  for (let p = 0; p < S * S; p++) {
    const w = wear[p] / 255, i = p * 4;
    d[i] = 255;
    d[i + 1] = (roughness + (0.95 - roughness) * w) * 255;
    d[i + 2] = (metallic + (0.05 - metallic) * w) * 255;
    d[i + 3] = 255;
  }
  return d;
}
