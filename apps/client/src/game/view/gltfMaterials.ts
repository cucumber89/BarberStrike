import type { Material } from "@babylonjs/core/Materials/material";

/**
 * Makes a material that arrived inside a glTF behave like the ones this game builds itself.
 *
 * MEASURED, and the reason this file exists: at the end of EVERY glTF load, Babylon's loader walks
 * `scene.materials` — the whole scene, not its own assets — and raises each material's
 * `maxSimultaneousLights` to the scene's light count ("Making sure we enable enough lights to have
 * all lights together", glTFLoader.pure.js). Night District has 38 practical lights, so one
 * imported gun re-armed all 107 of the map's materials for 38 lights each, and on a skinned
 * character that blew the driver's limit outright:
 *
 *     Error: VERTEX shader uniform block count exceeds GL_MAX_VERTEX_UNIFORM_BUFFERS (14)
 *     Attributes: position normal matricesIndices matricesWeights
 *
 * Babylon recovers by recompiling with fewer lights, so the game still ran — while emitting over a
 * thousand console errors and compiling each character shader several times. The WebGL2 SPEC
 * minimum for vertex uniform blocks is 12, so this was never only a software-renderer problem.
 *
 * Four lights is what every procedural material in the game already uses, and `useGLTFLightFalloff`
 * matches the range-limited falloff the map's lights are authored against — without it an imported
 * model is lit on a different curve from the wall behind it.
 */
export const GAME_LIGHT_CAP = 4;

export function tameLighting(mat: Material): void {
  const m = mat as Material & { maxSimultaneousLights?: number; useGLTFLightFalloff?: boolean };
  if (typeof m.maxSimultaneousLights === "number") m.maxSimultaneousLights = GAME_LIGHT_CAP;
  if (typeof m.useGLTFLightFalloff === "boolean") m.useGLTFLightFalloff = true;
}

/** `tameLighting` for a mesh: its material and, when that is a multi-material, each sub-material. */
export function tameImported(mesh: { material: Material | null }): void {
  const mat = mesh.material;
  if (!mat) return;
  tameLighting(mat);
  const subs = (mat as unknown as { subMaterials?: (Material | null)[] }).subMaterials;
  if (subs) for (const m of subs) if (m) tameLighting(m);
}

/**
 * Runs a glTF load and puts the scene's light budget back afterwards.
 *
 * The loader's scene-wide `maxSimultaneousLights` sweep (see above) is unconditional and has no
 * opt-out, so the only way to keep the map's tuned 4- and 5-light materials is to snapshot them and
 * write them back. Materials that did not exist before the load are the imported ones, and they get
 * the game's cap. TRACED to `glTFLoader.pure.js` from a live page, not guessed: without this, every
 * lazily-loaded weapon re-raised the entire map and Babylon spent the next second recompiling
 * shaders it had already compiled.
 */
export async function loadKeepingLightBudget<T>(scene: { materials: Material[] }, load: () => Promise<T>): Promise<T> {
  const before = new Map<Material, number>();
  for (const mat of scene.materials) {
    const v = (mat as Material & { maxSimultaneousLights?: number }).maxSimultaneousLights;
    if (typeof v === "number") before.set(mat, v);
  }
  try {
    return await load();
  } finally {
    for (const mat of scene.materials) {
      const m = mat as Material & { maxSimultaneousLights?: number };
      if (typeof m.maxSimultaneousLights !== "number") continue;
      const prev = before.get(mat);
      if (prev === undefined) tameLighting(mat);          // arrived with the glTF
      else m.maxSimultaneousLights = prev;                // the game's own, restored exactly
    }
  }
}
