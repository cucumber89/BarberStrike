import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
// `createInstance` below lives behind a side-effect import; without it Babylon throws at runtime.
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { loadKeepingLightBudget, tameImported, tameLighting } from "../view/gltfMaterials";
import type { Solid, SolidLook } from "@frankibarber/shared";

/**
 * Optional low-poly models (drop 6). The game ships with no third-party files; a CC0 / CC-BY glTF
 * dropped into `public/models/` and listed in `public/models/manifest.json` replaces the procedural
 * dressing of every solid with that `look`. Nothing else changes: the collision box is still the
 * server's, the model is scaled to fit it, and a look without a model keeps its procedural version.
 *
 * Manifest entry: { "van": { "file": "van.glb", "fit": "box" | "footprint", "yaw": 0, "lift": 0,
 * "license": "CC0 — Kenney Car Kit" } }. `fit: "box"` scales uniformly so the model's bounding box
 * fills the collision box's largest dimension; `fit: "footprint"` fits width × depth and lets the
 * height fall where it may (roofs, antennas). `yaw` (radians) turns the model so its front faces +Z
 * in the solid's frame; `lift` (m) raises it off the floor.
 */

export interface ModelEntry {
  file: string;
  fit?: "box" | "footprint";
  yaw?: number;
  lift?: number;
  license?: string;
}

export type ModelManifest = Partial<Record<SolidLook, ModelEntry>>;

/** A rigged character glTF (drop 6b). One per team; absent = the procedural character. */
export interface CharacterEntry {
  file: string;
  /** Material name to tint with the team colour, e.g. "Hoodie" or "Suit". */
  tint?: string;
  /** Metres from the model's feet to the top of its head (Quaternius men are 1.9). */
  height?: number;
  license?: string;
}

/** A weapon glTF (drop 6b). Keyed by our WeaponId; absent = the procedural gun. */
export interface WeaponEntry {
  file: string;
  /** Extra yaw in radians if the model does not face +Z after its own root transform. */
  yaw?: number;
  /** Roll in radians, for models authored on their side. */
  roll?: number;
  license?: string;
}

/** A prop glTF (drop 6b), keyed by our PropHint kind. */
export interface PropEntry {
  file: string;
  /** Target height in metres; the model is scaled uniformly to it. */
  height?: number;
  yaw?: number;
  license?: string;
}

export interface AssetManifest {
  models: ModelManifest;
  /** Index 0 = team FADE, index 1 = team TAPER. */
  characters: (CharacterEntry | undefined)[];
  weapons: Record<string, WeaponEntry>;
  props: Record<string, PropEntry>;
}

/** One optional folder level (the packs land in `raw/<pack>/`), no traversal, no absolute paths. */
const FILE_OK = /^[\w .-]+(\/[\w .-]+)*\.(glb|gltf)$/i;
const safeFile = (v: unknown): string | null =>
  (typeof v === "string" && FILE_OK.test(v) && !v.includes("..") && !v.startsWith("/") ? v : null);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export const MODELS_URL = "/models/";

/**
 * Parses the whole manifest: solid looks, characters, weapons and props (drop 6b).
 * Every section is optional and every malformed entry is dropped, never thrown on — a typo in the
 * manifest must degrade to "that thing stays procedural", never to a black screen.
 */
export function parseAssets(doc: unknown): AssetManifest {
  const out: AssetManifest = { models: parseManifest(doc), characters: [], weapons: {}, props: {} };
  if (typeof doc !== "object" || doc === null) return out;
  const d = doc as Record<string, unknown>;

  const chars = d.characters;
  if (Array.isArray(chars)) {
    for (let i = 0; i < Math.min(2, chars.length); i++) {
      const e = chars[i] as Record<string, unknown> | null;
      const file = e && typeof e === "object" ? safeFile(e.file) : null;
      if (!file) { out.characters[i] = undefined; continue; }
      out.characters[i] = { file, tint: str(e!.tint), height: num(e!.height, 1.9), license: str(e!.license) };
    }
  }

  const weapons = d.weapons;
  if (typeof weapons === "object" && weapons !== null) {
    for (const [id, raw] of Object.entries(weapons as Record<string, unknown>)) {
      const e = raw as Record<string, unknown> | null;
      const file = e && typeof e === "object" ? safeFile(e.file) : null;
      if (!file) continue;
      out.weapons[id] = { file, yaw: num(e!.yaw, 0), roll: num(e!.roll, 0), license: str(e!.license) };
    }
  }

  const props = d.props;
  if (typeof props === "object" && props !== null) {
    for (const [kind, raw] of Object.entries(props as Record<string, unknown>)) {
      const e = raw as Record<string, unknown> | null;
      const file = e && typeof e === "object" ? safeFile(e.file) : null;
      if (!file) continue;
      out.props[kind] = { file, height: num(e!.height, 0.25), yaw: num(e!.yaw, 0), license: str(e!.license) };
    }
  }
  return out;
}

/** Parses a manifest document; unknown / malformed entries are dropped, never thrown on. */
export function parseManifest(doc: unknown): ModelManifest {
  const out: ModelManifest = {};
  if (typeof doc !== "object" || doc === null) return out;
  const models = (doc as { models?: unknown }).models;
  if (typeof models !== "object" || models === null) return out;
  for (const [look, raw] of Object.entries(models as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.file !== "string" || !/^[\w.-]+\.(glb|gltf)$/i.test(e.file)) continue;
    out[look as SolidLook] = {
      file: e.file,
      fit: e.fit === "footprint" ? "footprint" : "box",
      yaw: typeof e.yaw === "number" && Number.isFinite(e.yaw) ? e.yaw : 0,
      lift: typeof e.lift === "number" && Number.isFinite(e.lift) ? e.lift : 0,
      license: typeof e.license === "string" ? e.license : undefined,
    };
  }
  return out;
}

/** Bounding size of a loaded model (its own units) → uniform scale and floor offset for a collision box. */
export function fitTransform(model: { sx: number; sy: number; sz: number; minY: number }, box: { L: number; Wd: number; Ht: number }, fit: "box" | "footprint"): { scale: number; y: number } {
  const eps = 1e-6;
  const s = fit === "footprint"
    ? Math.min(box.Wd / Math.max(eps, model.sx), box.L / Math.max(eps, model.sz))
    : Math.min(box.Wd / Math.max(eps, model.sx), box.L / Math.max(eps, model.sz), box.Ht / Math.max(eps, model.sy));
  return { scale: s, y: -model.minY * s };
}

/** Fetches the manifest once per page; a missing / invalid file means "no models" (procedural everywhere). */
export async function loadModelManifest(fetchImpl: typeof fetch = fetch): Promise<ModelManifest> {
  return (await loadAssetManifest(fetchImpl)).models;
}

export const EMPTY_ASSETS: AssetManifest = { models: {}, characters: [], weapons: {}, props: {} };

/** Fetches and parses the whole manifest (drop 6b). Never throws; failure = everything procedural. */
export async function loadAssetManifest(fetchImpl: typeof fetch = fetch): Promise<AssetManifest> {
  try {
    const res = await fetchImpl(`${MODELS_URL}manifest.json`, { cache: "no-cache" });
    if (!res.ok) return EMPTY_ASSETS;
    return parseAssets(await res.json());
  } catch {
    return EMPTY_ASSETS;
  }
}

interface Loaded { source: TransformNode; meshes: Mesh[]; sx: number; sy: number; sz: number; minY: number }

/**
 * Loads each referenced glTF once and stamps instances for every solid that wears it. Failures
 * (bad file, unsupported glTF) log once and leave the look procedural for the rest of the session.
 */
export class ModelLibrary {
  private cache = new Map<string, Promise<Loaded | null>>();
  private root: TransformNode;
  private spawned: AbstractMesh[] = [];
  readonly failed = new Set<string>();

  constructor(private scene: Scene, readonly manifest: ModelManifest) {
    this.root = new TransformNode("models", scene);
  }

  has(look: SolidLook | undefined): boolean { return !!look && !!this.manifest[look] && !this.failed.has(look); }

  /** Places the model for `s` (async); resolves to the instance root or null when it fell back. */
  async place(s: Solid, onMesh?: (m: AbstractMesh) => void): Promise<TransformNode | null> {
    const look = s.look;
    const entry = look ? this.manifest[look] : undefined;
    if (!look || !entry) return null;
    const loaded = await this.load(entry.file);
    if (!loaded) { this.failed.add(look); return null; }
    const b = s.box;
    const sx = b.maxX - b.minX, sy = b.maxY - b.minY, sz = b.maxZ - b.minZ;
    const yaw = s.yaw ?? 0;
    const sideways = Math.abs(Math.sin(yaw)) > 0.5;
    const box = { L: sideways ? sx : sz, Wd: sideways ? sz : sx, Ht: sy };
    const { scale, y } = fitTransform(loaded, box, entry.fit ?? "box");
    const pivot = new TransformNode(`model_${s.name ?? look}`, this.scene);
    pivot.parent = this.root;
    pivot.position.set(b.minX + sx / 2, b.minY + (entry.lift ?? 0), b.minZ + sz / 2);
    pivot.rotation.y = yaw + (entry.yaw ?? 0);
    pivot.scaling.setAll(scale);
    for (const m of loaded.meshes) {
      const inst = m.createInstance(`${m.name}_${s.name ?? look}`);
      inst.parent = pivot;
      inst.position.y += y / scale;
      inst.isPickable = false;
      inst.receiveShadows = true;
      inst.freezeWorldMatrix();
      this.spawned.push(inst);
      onMesh?.(inst);
    }
    return pivot;
  }

  private load(file: string): Promise<Loaded | null> {
    let p = this.cache.get(file);
    if (!p) { p = this.import(file); this.cache.set(file, p); }
    return p;
  }

  private async import(file: string): Promise<Loaded | null> {
    try {
      const [{ LoadAssetContainerAsync }] = await Promise.all([
        import("@babylonjs/core/Loading/sceneLoader"),
        import("@babylonjs/loaders/glTF/2.0"),
      ]);
      // Module-level loader, not `SceneLoader.*`: the whole class is deprecated in Babylon 9 and
      // its same-named static takes (rootUrl, file, scene) — the opposite order — so mixing them up
      // typechecks in JS and fails at runtime. The container is added to the scene straight away
      // because these meshes ARE the instancing sources.
      const container = await loadKeepingLightBudget(this.scene, () => LoadAssetContainerAsync(`${MODELS_URL}${file}`, this.scene));
      container.addAllToScene();
      const meshes = container.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
      if (meshes.length === 0) throw new Error("no geometry");
      for (const m of meshes) tameImported(m);
      const source = new TransformNode(`model_src_${file}`, this.scene);
      source.parent = this.root;
      // Sources stay hidden; instances carry their world matrices. Bounds are measured on the sources.
      let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of meshes) {
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, bb.minimumWorld); max = Vector3.Maximize(max, bb.maximumWorld);
        m.setEnabled(false);
        m.isPickable = false;
      }
      for (const m of container.meshes) if (!(m instanceof Mesh) || m.getTotalVertices() === 0) m.setEnabled(false);
      return { source, meshes, sx: max.x - min.x, sy: max.y - min.y, sz: max.z - min.z, minY: min.y };
    } catch (err) {
      console.warn(`[models] ${file} failed to load; keeping the procedural look`, err);
      return null;
    }
  }

  dispose(): void {
    for (const m of this.spawned) m.dispose();
    this.spawned.length = 0;
    this.root.dispose(false, true);
    this.cache.clear();
  }
}


/**
 * Turns a loaded container into ONE mesh usable as an instancing source for a small prop (drop 6b).
 *
 * Scaled to `height` metres and re-centred the way the procedural props are built: horizontally on
 * the origin and vertically on their own middle, because `buildProps` positions a bottle at half
 * its height. Get that wrong and every bottle floats or sinks into the shelf.
 * Returns null when the file has no geometry, and the caller keeps the procedural prop.
 */
export function buildPropSource(scene: Scene, container: AssetContainer, name: string, height: number, yaw = 0): Mesh | null {
  const inst = container.instantiateModelsToScene((n) => `${name}_${n}`, false);
  const holder = new TransformNode(`${name}_prep`, scene);
  for (const n of inst.rootNodes) (n as TransformNode).parent = holder;
  const meshes: Mesh[] = [];
  for (const n of holder.getChildMeshes(false)) if (n instanceof Mesh && n.getTotalVertices() > 0) meshes.push(n);
  if (meshes.length === 0) { holder.dispose(false, true); return null; }

  holder.rotation.y = yaw;
  holder.computeWorldMatrix(true);
  let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bb.minimumWorld); max = Vector3.Maximize(max, bb.maximumWorld);
  }
  const tall = max.y - min.y;
  const scale = tall > 1e-6 ? height / tall : 1;
  holder.scaling.setAll(scale);
  holder.position.set(
    -((min.x + max.x) / 2) * scale,
    -((min.y + max.y) / 2) * scale,
    -((min.z + max.z) / 2) * scale,
  );
  holder.computeWorldMatrix(true);
  for (const m of meshes) m.computeWorldMatrix(true);

  // MergeMeshes bakes the world matrix, which is what detaches the prop from the holder we are
  // about to throw away. See weaponModels.ts for why the mirrored glTF winding is left alone.
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
  holder.dispose(false, true);
  if (!merged) return null;
  merged.name = name;
  merged.isVisible = false;
  merged.isPickable = false;
  tameImported(merged);
  return merged;
}

/**
 * Shared glTF container store (drop 6b). Characters and weapons need an AssetContainer (so each
 * player / viewmodel gets its OWN skeleton and animation groups), and several call sites want the
 * same file, so every URL is loaded exactly once and handed out. A file that fails to load is
 * remembered as failed, and the caller falls back to its procedural version for the session.
 */
export class AssetVault {
  private cache = new Map<string, Promise<AssetContainer | null>>();
  readonly failed = new Set<string>();

  constructor(private scene: Scene) {}

  /** Loads (or returns the cached) container for `file`, or null when it cannot be used. */
  container(file: string): Promise<AssetContainer | null> {
    let p = this.cache.get(file);
    if (!p) { p = this.load(file); this.cache.set(file, p); }
    return p;
  }

  private async load(file: string): Promise<AssetContainer | null> {
    try {
      const [{ LoadAssetContainerAsync }] = await Promise.all([
        import("@babylonjs/core/Loading/sceneLoader"),
        import("@babylonjs/loaders/glTF/2.0"),
      ]);
      const c = await loadKeepingLightBudget(this.scene, () => LoadAssetContainerAsync(`${MODELS_URL}${file}`, this.scene));
      // The container's own materials are not in the scene once it resolves, so cap them here too:
      // instantiation clones them, and a clone would carry the loader's light count with it.
      for (const m of c.materials) tameLighting(m);
      return c;
    } catch (err) {
      this.failed.add(file);
      console.warn(`[models] ${file} failed to load; keeping the procedural version`, err);
      return null;
    }
  }

  dispose(): void {
    for (const p of this.cache.values()) void p.then((c) => c?.dispose()).catch(() => {});
    this.cache.clear();
  }
}

