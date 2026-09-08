import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Light } from "@babylonjs/core/Lights/light";
import type { MapDef, MaterialTag } from "@frankibarber/shared";
import { createMaterialLibrary, type MaterialLibrary } from "./materials";
import { buildProps } from "./props";
import { dressSolid } from "./dressing";
import { buildArchitecture } from "./architecture";
import type { ModelLibrary } from "./models";

export interface MapInstance {
  root: Mesh[];
  shadowGenerators: ShadowGenerator[];
  materials: MaterialLibrary;
  lights: Light[];
  /** Registers a dynamic mesh (character, weapon) as a shadow caster. */
  addCaster(mesh: AbstractMesh): void;
  /**
   * Solids named in `opts.toggleable`, kept OUT of the per-material merge so a tactical plan can
   * switch them off for a round. Merged geometry cannot be hidden a piece at a time, which is the
   * whole reason they are built separately.
   */
  toggles: Map<string, Mesh[]>;
  /** Show/hide one named solid. Unknown names are ignored — the plan table is the authority. */
  setSolidVisible(name: string, visible: boolean): void;
  setShadowQuality(quality: "off" | "medium" | "high"): void;
  dispose(): void;
}

/** Global gain on the map's practical lights (tuned by measurement against the un-tonemapped output). */
const LIGHT_GAIN = 1.4;

export interface MapBuildOptions {
  /** Drop 6: optional glTF models per look; a look the library has is not dressed procedurally. */
  models?: ModelLibrary;
  /** Drop 6b: imported meshes for small props, keyed by the prop's source key (e.g. "bottle"). */
  propSources?: Map<string, Mesh>;
  shadows: boolean;
  shadowMapSize: number;
  /** Solid names a tactical plan may remove; built standalone so they can be toggled. */
  toggleable?: ReadonlySet<string>;
}

/**
 * Turns the shared MapDef into renderable geometry. Solids sharing a material are merged into
 * one mesh (one draw call per material). Everything is static: world matrices frozen.
 * Lighting: a dim moon (directional, the single shadow caster), a faint sky ambient, the map's
 * practical point/spot lights, a night-sky dome and a touch of exponential fog for depth.
 */
export function buildMap(scene: Scene, map: MapDef, opts: MapBuildOptions): MapInstance {
  const materials = createMaterialLibrary(scene);
  // Merge per material AND per 12 m zone: Babylon lights a mesh with at most
  // `maxSimultaneousLights` lights, so one map-wide mesh per material would only see a handful
  // of the practical lights. Zoned meshes get their local lights; draw calls stay low.
  // MEASURED (1.0 beta): with 12 m zones the merged pieces came out 15–20 m wide (a floor slab
  // is one solid), so a range-culled light still touched most of them — shop meshes kept 18 of
  // 19 lights. Solids longer than TILE are cut into TILE-sized pieces first, and zones are TILE
  // wide, so a piece sees only the lights whose range actually reaches it.
  // MEASURED (map 2.0, 62 × 68 m): at 6 m zones the open street view hit 663 draw calls because
  // every zone × material became a mesh. Structural tags (floors/walls/ceilings) keep 8 m zones;
  // the small detail tags of dressed objects (wheels, trim, glass, paint) merge across 16 m — they
  // are tiny, so which lights they lose to the cap is invisible.
  // Second pass: 8/16 m still left 443 draw calls in the street (WebGL pays ~20–50 µs per draw,
  // i.e. 10–20 ms of CPU). 12/24 m halves that; the map materials take a 5-light cap to cover the
  // extra pool a 12 m tile can touch (measured 6–9 lights per tile at this size).
  const ZONE = 12;
  const TILE = 12;
  const DETAIL_ZONE = 24;
  const DETAIL = /^(metal|rubber|brass|glass_dark|wood|soil|foliage|paint|corrugated)/;
  const byMat = new Map<string, { tag: MaterialTag; meshes: Mesh[] }>();

  const dressRoot = new TransformNode("dressing", scene);
  const addToZone = (m: Mesh, tag: MaterialTag) => {
    m.computeWorldMatrix(true);
    const p = m.getAbsolutePosition();
    const zone = DETAIL.test(tag) ? DETAIL_ZONE : ZONE;
    const key = `${tag}_${Math.floor(p.x / zone)}_${Math.floor(p.z / zone)}`;
    const entry = byMat.get(key) ?? { tag, meshes: [] };
    entry.meshes.push(m);
    byMat.set(key, entry);
  };

  const toggles = new Map<string, Mesh[]>();
  for (const s of map.solids) {
    if (s.invisible) continue;
    if (s.name && opts.toggleable?.has(s.name)) {
      // Standalone, unmerged, and NOT a shadow caster: the moon shadow map is rendered once for a
      // static world (see below), so a mesh that can vanish mid-match must not be baked into it —
      // its shadow would stay on the ground after the wall it belongs to was taken away.
      const b = s.box;
      const m = MeshBuilder.CreateBox(s.name, { width: b.maxX - b.minX, height: b.maxY - b.minY, depth: b.maxZ - b.minZ }, scene);
      m.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      applyWorldUVs(m, b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ, b.minX, b.minY, b.minZ);
      m.material = materials.get(s.mat);
      m.isPickable = false;
      m.receiveShadows = true;
      m.freezeWorldMatrix();
      const list = toggles.get(s.name) ?? [];
      list.push(m);
      toggles.set(s.name, list);
      continue;
    }
    if (s.look) {
      // Drop 6: a glTF from the manifest (instanced, async) beats the procedural dressing.
      if (opts.models?.has(s.look)) { void opts.models.place(s); continue; }
      dressSolid(scene, s, dressRoot, addToZone); continue; // 1.0 beta: objects, not boxes
    }
    const b = s.box;
    const fullX = b.maxX - b.minX, fullZ = b.maxZ - b.minZ, sy = b.maxY - b.minY;
    const nx = Math.max(1, Math.ceil(fullX / TILE)), nz = Math.max(1, Math.ceil(fullZ / TILE));
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const minX = b.minX + (fullX * ix) / nx, minZ = b.minZ + (fullZ * iz) / nz;
        const sx = fullX / nx, sz = fullZ / nz;
        const m = MeshBuilder.CreateBox(s.name ?? "solid", { width: sx, height: sy, depth: sz }, scene);
        m.position.set(minX + sx / 2, b.minY + sy / 2, minZ + sz / 2);
        applyWorldUVs(m, sx, sy, sz, minX, b.minY, minZ);
        addToZone(m, s.mat);
      }
    }
  }

  buildArchitecture(scene, map, addToZone);
  const root: Mesh[] = [];
  const casters: AbstractMesh[] = [];
  for (const [key, { tag, meshes }] of byMat) {
    const merged = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (!merged) continue;
    merged.name = `map_${key}`;
    merged.material = materials.get(tag);
    merged.receiveShadows = true;
    merged.isPickable = false;
    merged.freezeWorldMatrix();
    merged.doNotSyncBoundingInfo = true;
    root.push(merged);
    if (tag !== "glass" && tag !== "mirror" && tag !== "fence" && !tag.startsWith("floor")) casters.push(merged);
  }

  // Props (visual only).
  const props = buildProps(scene, map.props, opts.propSources);
  for (const m of props.meshes) if (!m.isAnInstance) casters.push(m);

  // ---- Sky: an inverted gradient dome, unlit, always behind everything.
  const sky = buildSky(scene);

  // ---- Lighting
  const lights: Light[] = [];
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.48;
  ambient.diffuse = new Color3(0.57, 0.62, 0.72);
  ambient.groundColor = new Color3(0.10, 0.085, 0.09);
  ambient.renderPriority = 100; // must always be among a mesh's lights
  lights.push(ambient);

  // Moon: cool, low, from the north-west — the one shadow caster (cheap, covers the whole block).
  const moon = new DirectionalLight("moon", new Vector3(0.45, -1, 0.35).normalize(), scene);
  moon.diffuse = new Color3(0.64, 0.70, 0.84);
  moon.specular = new Color3(0.2, 0.22, 0.3);
  moon.intensity = 0.55;
  moon.position = new Vector3(-10, 30, -10);
  moon.shadowMinZ = 1; moon.shadowMaxZ = 80;
  moon.renderPriority = 90;
  lights.push(moon);

  const shadowGenerators: ShadowGenerator[] = [];
  let shadowQuality = "";
  const setShadowQuality = (quality: "off" | "medium" | "high") => {
    if (quality === shadowQuality) return;
    shadowQuality = quality;
    for (const g of shadowGenerators) g.dispose();
    shadowGenerators.length = 0;
    if (quality !== "off") {
      const size = quality === "high" ? 2048 : 1024;
      const gen = new ShadowGenerator(size, moon);
      gen.usePercentageCloserFiltering = true;
      gen.filteringQuality = size >= 2048 ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
      gen.bias = 0.0025;
      gen.normalBias = 0.05;
      gen.darkness = 0.25;
      // MEASURED (1.0 beta profiling): the shadow pass re-drew 222 static meshes every frame for a
      // light that never moves — more draw calls than the main pass in most views. The map is static,
      // so the map is rendered into the shadow map once. Characters do not cast moon shadows (they
      // are unreadable at night anyway) — see addCaster below.
      gen.getShadowMap()!.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      // Fit the orthographic frustum to the map bounds.
      const b = map.bounds;
      moon.orthoLeft = -Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 - 4;
      moon.orthoRight = -moon.orthoLeft;
      moon.orthoTop = -moon.orthoLeft;
      moon.orthoBottom = moon.orthoLeft;
      moon.autoUpdateExtends = false;
      moon.position = new Vector3((b.minX + b.maxX) / 2 - 14, 32, (b.minZ + b.maxZ) / 2 - 11);
      for (const c of casters) gen.addShadowCaster(c, false);
      shadowGenerators.push(gen);
    }
    for (const material of scene.materials) material.markDirty(true);
  };
  setShadowQuality(opts.shadows ? opts.shadowMapSize >= 2048 ? "high" : "medium" : "off");

  for (const l of map.lights) {
    let light: PointLight | SpotLight;
    if (l.kind === "spot") {
      const dir = new Vector3(l.dx ?? 0, l.dy ?? -1, l.dz ?? 0).normalize();
      light = new SpotLight(`spot_${l.x}_${l.z}`, new Vector3(l.x, l.y, l.z), dir, l.angle ?? 2.0, 4, scene);
    } else {
      light = new PointLight(`light_${l.x}_${l.z}`, new Vector3(l.x, l.y, l.z), scene);
    }
    light.diffuse = Color3.FromHexString(l.color);
    light.specular = light.diffuse.scale(0.5);
    light.intensity = l.intensity * LIGHT_GAIN;
    light.range = l.range;
    light.radius = 0.25;
    light.renderPriority = l.priority ?? 0;
    lights.push(light);
  }

  // MEASURED (1.0 beta profiling): Babylon does not cull lights by range, so every mesh was lit
  // by all 19 practicals and every PBR shader ran with maxSimultaneousLights (8) lights per pixel.
  // Static meshes exclude every practical whose range sphere misses their bounding box; the
  // avg went from 19 lights per mesh to ~3. Dynamic meshes (characters, weapons) keep the full
  // list — their materials cap at 4 and the priority sort picks the closest.
  const staticMeshes: AbstractMesh[] = [...root, ...props.meshes];
  for (const light of lights) {
    if (!(light instanceof PointLight || light instanceof SpotLight)) continue;
    const p = light.position, r = light.range;
    const excluded: AbstractMesh[] = [];
    for (const m of staticMeshes) {
      const bb = m.getBoundingInfo().boundingBox;
      const mn = bb.minimumWorld, mx = bb.maximumWorld;
      const dx = Math.max(mn.x - p.x, 0, p.x - mx.x), dy = Math.max(mn.y - p.y, 0, p.y - mx.y), dz = Math.max(mn.z - p.z, 0, p.z - mx.z);
      if (dx * dx + dy * dy + dz * dz > r * r) excluded.push(m);
    }
    light.excludedMeshes = excluded;
  }

  // ---- Fog: barely there, sells depth in the long exterior sightlines.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.012;
  scene.fogColor = new Color3(0.035, 0.035, 0.05);

  return {
    root, shadowGenerators, materials, lights, setShadowQuality,
    toggles,
    setSolidVisible(name, visible) { for (const m of toggles.get(name) ?? []) m.setEnabled(visible); },
    // The moon shadow map is rendered once (static map only); dynamic casters are accepted for API
    // stability but intentionally not added — see the refreshRate note above.
    addCaster(_mesh) { /* static shadow map */ },
    dispose() {
      for (const list of toggles.values()) for (const m of list) m.dispose();
      toggles.clear();
      for (const g of shadowGenerators) g.dispose();
      for (const l of lights) l.dispose();
      for (const m of root) m.dispose();
      dressRoot.dispose(false, true);
      opts.models?.dispose();
      props.dispose();
      sky.dispose(false, true);
      materials.dispose();
      scene.fogMode = Scene.FOGMODE_NONE;
    },
  };
}

/** Night-sky dome: vertical gradient (deep blue-black → faint warm city glow at the horizon). */
function buildSky(scene: Scene): Mesh {
  const size = 256;
  const dt = new DynamicTexture("skyTex", { width: 16, height: size }, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#05060c"); g.addColorStop(0.55, "#0a0c18"); g.addColorStop(0.85, "#1c1723"); g.addColorStop(1, "#2a2022");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, size);
  dt.update(false);
  const mat = new StandardMaterial("skyMat", scene);
  mat.emissiveTexture = dt;
  mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  const dome = MeshBuilder.CreateSphere("sky", { diameter: 300, segments: 12, slice: 0.55 }, scene);
  dome.material = mat;
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.position.y = -20;
  dome.freezeWorldMatrix();
  return dome;
}

/** Rewrites box UVs so each face maps 1 texture unit per metre, anchored to world position. */
function applyWorldUVs(m: Mesh, sx: number, sy: number, sz: number, ox: number, oy: number, oz: number): void {
  const uvs = m.getVerticesData("uv");
  const pos = m.getVerticesData("position");
  const nor = m.getVerticesData("normal");
  if (!uvs || !pos || !nor) return;
  for (let i = 0; i < pos.length / 3; i++) {
    const px = pos[i * 3] + sx / 2 + ox, py = pos[i * 3 + 1] + sy / 2 + oy, pz = pos[i * 3 + 2] + sz / 2 + oz;
    const nx = Math.abs(nor[i * 3]), ny = Math.abs(nor[i * 3 + 1]), nz = Math.abs(nor[i * 3 + 2]);
    let u: number, v: number;
    if (ny > nx && ny > nz) { u = px; v = pz; } else if (nx > nz) { u = pz; v = py; } else { u = px; v = py; }
    uvs[i * 2] = u; uvs[i * 2 + 1] = v;
  }
  m.setVerticesData("uv", uvs, false);
}
