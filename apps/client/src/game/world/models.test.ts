import { describe, expect, it } from "vitest";
import { buildPropSource, fitTransform, loadModelManifest, parseManifest } from "./models";
import { existsSync, readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";


/** Drop 6: the optional-model manifest and the fit maths (no Babylon needed). */

describe("parseManifest", () => {
  it("keeps well-formed entries, defaults the rest and drops junk", () => {
    const m = parseManifest({ models: {
      van: { file: "van.glb", fit: "footprint", yaw: 1.5, lift: 0.1, license: "CC0 — Kenney Car Kit" },
      car: { file: "car.gltf" },
      truck: { file: "../../etc/passwd" },
      dumpster: "nope",
      crate: { file: 42 },
    } });
    expect(m.van).toEqual({ file: "van.glb", fit: "footprint", yaw: 1.5, lift: 0.1, license: "CC0 — Kenney Car Kit" });
    expect(m.car).toEqual({ file: "car.gltf", fit: "box", yaw: 0, lift: 0, license: undefined });
    expect(m.truck).toBeUndefined();
    expect(m.dumpster).toBeUndefined();
    expect(m.crate).toBeUndefined();
    expect(parseManifest(null)).toEqual({});
    expect(parseManifest({ models: 3 })).toEqual({});
  });

  it("a missing or broken manifest means no models", async () => {
    const notFound = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await loadModelManifest(notFound)).toEqual({});
    const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await loadModelManifest(broken)).toEqual({});
    const ok = (async () => ({ ok: true, json: async () => ({ models: { car: { file: "car.glb" } } }) })) as unknown as typeof fetch;
    expect((await loadModelManifest(ok)).car?.file).toBe("car.glb");
  });
});

describe("fitTransform", () => {
  const model = { sx: 2, sy: 1, sz: 4, minY: -0.25 }; // a model twice as long as wide, floor at −0.25
  it("box fit never exceeds the collision box in any axis and stands the model on the floor", () => {
    const box = { L: 5, Wd: 2, Ht: 1.5 };
    const { scale, y } = fitTransform(model, box, "box");
    expect(scale).toBeCloseTo(1); // width is the binding constraint (2 / 2)
    expect(y).toBeCloseTo(0.25);  // −minY × scale
    expect(model.sy * scale).toBeLessThanOrEqual(box.Ht);
  });
  it("footprint fit ignores the height", () => {
    const box = { L: 8, Wd: 4, Ht: 0.5 };
    expect(fitTransform(model, box, "box").scale).toBeCloseTo(0.5);
    expect(fitTransform(model, box, "footprint").scale).toBeCloseTo(2);
  });
});

describe("buildPropSource, on the real bottle", () => {
  const file = "public/models/raw/bottles/Bottle.glb";
  it.skipIf(!existsSync(file))("scales to the asked height and centres like the procedural prop", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const container = await LoadAssetContainerAsync(new Uint8Array(readFileSync(file)), scene, { pluginExtension: ".glb" });
    const mesh = buildPropSource(scene, container, "bottle", 0.2);
    expect(mesh).not.toBeNull();
    mesh!.computeWorldMatrix(true);
    const bb = mesh!.getBoundingInfo().boundingBox;
    // Exactly as tall as asked: `buildProps` places bottles at half their height, so a mismatch
    // floats them off the shelf or sinks them into it.
    expect(bb.maximumWorld.y - bb.minimumWorld.y).toBeCloseTo(0.2, 3);
    // Centred on its own middle in all three axes, like a Babylon cylinder.
    expect((bb.minimumWorld.y + bb.maximumWorld.y) / 2).toBeCloseTo(0, 4);
    expect((bb.minimumWorld.x + bb.maximumWorld.x) / 2).toBeCloseTo(0, 4);
    expect((bb.minimumWorld.z + bb.maximumWorld.z) / 2).toBeCloseTo(0, 4);
    // Hidden: it exists only as an instancing source.
    expect(mesh!.isVisible).toBe(false);
    scene.dispose(); engine.dispose();
  }, 30000);
});
