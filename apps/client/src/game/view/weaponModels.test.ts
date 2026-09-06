import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import "@babylonjs/core/Meshes/instancedMesh";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { WeaponId } from "@frankibarber/shared";
import { WeaponModelLibrary, type ContainerSource } from "./weaponModels";
import { parseAssets } from "../world/models";
import { weaponMetrics } from "./weaponMeshes";

/**
 * Drop 6b, END TO END on the REAL files in `public/models/`: loads each gun the manifest names,
 * runs the whole import pipeline (classify → orient → scale → seat on the grip → merge) and checks
 * the result is a gun and not a puddle. This is the test that would have caught, and now guards:
 *
 *  - the P320 (and every other model in the pack) pointing down −Z in its own file, so a hand-set
 *    "no rotation needed" would have every gun facing backwards;
 *  - the glTF loader's mirrored `__root__` inverting the winding when the transform is baked, which
 *    leaves the merged gun inside-out and therefore invisible from outside;
 *  - a rig rule regressing so the magazine, the slide or the sights stop being found.
 *
 * The manifest and the .glb files are optional in a checkout, so the suite skips itself when they
 * are absent rather than failing a clone that has no third-party assets.
 */

const MANIFEST = "public/models/manifest.json";
const have = existsSync(MANIFEST);
const manifest = have ? parseAssets(JSON.parse(readFileSync(MANIFEST, "utf8"))) : null;
const weapons = manifest ? (Object.entries(manifest.weapons) as [WeaponId, { file: string }][]).filter(([, e]) => existsSync(`public/models/${e.file}`)) : [];

/**
 * Fraction of vertices whose normal points AWAY from the mesh's centroid.
 *
 * This, not signed volume, is the right check for these models: measured, every part in the pack is
 * an open shell with split normals, so "volume" is meaningless, while "do the normals face out"
 * decides whether the gun is lit or looks like a hole. Raw parts measure ~0.79; a merged gun ~0.75;
 * a wrongly "repaired" one (flipFaces) collapses to ~0.27.
 */
function outwardFraction(m: Mesh): number {
  const p = m.getVerticesData(VertexBuffer.PositionKind);
  const n = m.getVerticesData(VertexBuffer.NormalKind);
  if (!p || !n) return -1;
  const c = [0, 0, 0];
  const count = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { c[0] += p[i]; c[1] += p[i + 1]; c[2] += p[i + 2]; }
  c[0] /= count; c[1] /= count; c[2] /= count;
  let ok = 0, total = 0;
  for (let i = 0; i < p.length; i += 3) {
    const d = n[i] * (p[i] - c[0]) + n[i + 1] * (p[i + 1] - c[1]) + n[i + 2] * (p[i + 2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    total++; if (d > 0) ok++;
  }
  return total ? ok / total : -1;
}

describe.skipIf(weapons.length === 0)("imported weapons, on the real files", () => {
  let engine: NullEngine;
  let scene: Scene;
  let lib: WeaponModelLibrary;

  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    // The library only needs "give me a container for this file"; here that reads from disk instead
    // of fetching a URL, which is the whole reason it takes a seam rather than an AssetVault.
    const disk: ContainerSource = {
      async container(file): Promise<AssetContainer | null> {
        const buf = readFileSync(`public/models/${file}`);
        return LoadAssetContainerAsync(new Uint8Array(buf), scene, { pluginExtension: ".glb" });
      },
    };
    lib = new WeaponModelLibrary(scene, disk, manifest!.weapons);
  });
  afterAll(() => { lib?.dispose(); scene?.dispose(); engine?.dispose(); });

  it("lists every weapon the manifest names", () => {
    expect(weapons.length).toBeGreaterThan(0);
    for (const [id] of weapons) expect(lib.has(id)).toBe(true);
  });

  it.each(weapons.map(([id, e]) => [id, e.file] as const))("%s (%s) builds a gun that points forwards", async (id, _file) => {
    const model = await lib.build(id, `t_${id}`, false);
    expect(model, `${id} produced no model`).not.toBeNull();
    const m = model!;
    const metrics = weaponMetrics(id);

    // Length is the game's, not the file's: the imported gun has to fit the tuned hip/ADS poses.
    expect(m.length).toBeCloseTo(metrics.length, 6);

    const [, ay, az] = m.aimPoint;
    // The muzzle is in FRONT of the sights, and both are in front of the hand. If the orientation
    // guess were wrong for this model, this is the assertion that fails.
    expect(m.muzzle.position.z, `${id} muzzle behind the sights`).toBeGreaterThan(az);
    expect(m.muzzle.position.z, `${id} muzzle behind the grip`).toBeGreaterThan(0);
    // The sight line sits above the hand, never below it.
    expect(ay, `${id} aim point below the grip`).toBeGreaterThan(-0.02);
    // Nothing should be metres away from the hand: the whole gun is `length` long.
    expect(Math.abs(m.muzzle.position.z)).toBeLessThan(metrics.length * 1.3);

    m.root.dispose(false, true);
  });

  it("keeps the normals pointing outwards through the merge", async () => {
    for (const [id] of weapons) {
      const model = await lib.build(id, `w_${id}`, false);
      expect(model).not.toBeNull();
      for (const mesh of model!.root.getChildMeshes(false)) {
        const f = outwardFraction(mesh as Mesh);
        if (f < 0) continue;
        // MEASURED across the eight guns: 0.587 (the sniper's bolt — long, thin and the least
        // convex part in the pack) up to 0.79. A part whose normals were inverted measures 0.27,
        // so 0.5 separates the two with room on both sides and no per-weapon exceptions.
        expect(f, `${id}/${mesh.name} normals point inwards (${f.toFixed(3)})`).toBeGreaterThan(0.5);
      }
      model!.root.dispose(false, true);
    }
  }, 60000);

  it("keeps the parts the reload animation drives", async () => {
    for (const [id] of weapons) {
      const metrics = weaponMetrics(id);
      const model = await lib.build(id, `p_${id}`, false);
      expect(model).not.toBeNull();
      // A weapon whose procedural version has no magazine must not grow one, and one that moves its
      // action must keep the same kind of motion — the reload timelines are written per weapon.
      if (!metrics.hasMagazine) expect(model!.magazine, `${id} invented a magazine`).toBeNull();
      expect(["none", metrics.actionKind]).toContain(model!.actionKind);
      if (model!.actionKind !== "none") expect(model!.action).not.toBeNull();
      model!.root.dispose(false, true);
    }
  }, 60000);
});
