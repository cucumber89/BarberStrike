import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PLAYER, type WeaponId } from "@frankibarber/shared";
import { CharacterModel } from "./CharacterModel";
import { PACK_CLIPS, USED_CLIPS } from "./characterAnim";
import { parseAssets } from "../world/models";
import type { CharacterInput } from "./Character";

/**
 * Drop 6b, on the REAL character rigs in `public/models/`. Everything here is a claim the rest of
 * the code depends on and cannot check for itself:
 *  - the pack really does ship the 24 clips `characterAnim.ts` names, under `Armature|Clip` names;
 *  - the bones the aim override drives (Chest, Head) and the hand hangs off (Wrist.R) exist;
 *  - two players get INDEPENDENT skeletons and animation groups, so one dying does not pose the
 *    other — that is the whole reason `instantiateModelsToScene` is called per player;
 *  - the rig is scaled to the collision capsule, so a head shot lands on the head.
 * Skips itself when the optional assets are not in the checkout.
 */

const MANIFEST = "public/models/manifest.json";
const manifest = existsSync(MANIFEST) ? parseAssets(JSON.parse(readFileSync(MANIFEST, "utf8"))) : null;
const chars = (manifest?.characters ?? []).filter((c): c is NonNullable<typeof c> => !!c && existsSync(`public/models/${c.file}`));

const input = (over: Partial<CharacterInput> = {}): CharacterInput => ({
  speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false,
  weapon: "rifle" as WeaponId, moveDir: 0, ...over,
});

describe.skipIf(chars.length === 0)("imported characters, on the real rigs", () => {
  let engine: NullEngine;
  let scene: Scene;
  let container: AssetContainer;

  beforeAll(async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const buf = readFileSync(`public/models/${chars[0].file}`);
    container = await LoadAssetContainerAsync(new Uint8Array(buf), scene, { pluginExtension: ".glb" });
  }, 60000);
  afterAll(() => { scene?.dispose(); engine?.dispose(); });

  it("ships every clip the animation layer names", () => {
    const names = container.animationGroups.map((g) => g.name.split("|").pop());
    for (const clip of PACK_CLIPS) expect(names, `missing clip ${clip}`).toContain(clip);
  });

  it("has the bones the aim override and the hand need", () => {
    const bones = container.skeletons[0]?.bones.map((b) => b.name) ?? [];
    for (const need of ["Chest", "Head", "Wrist.R", "Hips"]) expect(bones, `missing bone ${need}`).toContain(need);
  });

  it("scales the rig to the player's collision height", () => {
    const c = new CharacterModel(scene, container, 0, "scale", { modelHeight: chars[0].height });
    expect(c.root.scaling.x).toBeCloseTo(PLAYER.height / (chars[0].height ?? 1.9), 6);
    c.dispose();
  });

  it("gives each player its own animation groups, and keeps only the clips it drives", () => {
    const a = new CharacterModel(scene, container, 0, "a", { modelHeight: chars[0].height });
    const b = new CharacterModel(scene, container, 1, "b", { modelHeight: chars[0].height });
    const groupsA = scene.animationGroups.filter((g) => g.name.endsWith("_a"));
    const groupsB = scene.animationGroups.filter((g) => g.name.endsWith("_b"));
    // The other twelve clips of the pack are disposed, not kept idle: Babylon evaluates every
    // animation of every playing group, per character, every frame.
    expect(groupsA.length).toBe(USED_CLIPS.length);
    expect(groupsB.length).toBe(USED_CLIPS.length);
    for (const g of groupsA) expect(groupsB).not.toContain(g);
    a.dispose(); b.dispose();
  });

  it("evaluates ONE clip while standing still, not twelve", () => {
    const c = new CharacterModel(scene, container, 0, "cheap", { modelHeight: chars[0].height });
    const playing = () => scene.animationGroups.filter((g) => g.name.endsWith("_cheap") && g.isPlaying).length;
    for (let i = 0; i < 40; i++) c.update(input(), 16);
    expect(playing(), "standing still should run only the gun idle").toBe(1);
    // Sprinting diagonally blends two directional clips over the walk, and nothing else.
    for (let i = 0; i < 40; i++) c.update(input({ speed: 6, moveDir: Math.PI / 4 }), 16);
    expect(playing()).toBeLessThanOrEqual(3);
    // Back to standing: the running clips are stopped again once their weight reaches zero.
    for (let i = 0; i < 90; i++) c.update(input(), 16);
    expect(playing()).toBe(1);
    c.dispose();
  });

  it("blends towards running and holds the death pose", () => {
    const c = new CharacterModel(scene, container, 0, "blend", { modelHeight: chars[0].height });
    const weight = (clip: string): number =>
      scene.animationGroups.find((g) => g.name === `CharacterArmature|${clip}_blend`)?.weight ?? -1;

    // Standing still: the gun idle carries all the weight.
    expect(weight("Idle_Gun")).toBeCloseTo(1, 3);

    // Sprinting forwards for a second: Run takes over and the idle lets go.
    for (let i = 0; i < 60; i++) c.update(input({ speed: 6, moveDir: 0 }), 16);
    expect(weight("Run")).toBeGreaterThan(0.9);
    expect(weight("Idle_Gun")).toBeLessThan(0.05);

    // Strafing right splits the weight between the two nearest directional clips.
    for (let i = 0; i < 60; i++) c.update(input({ speed: 6, moveDir: Math.PI / 4 }), 16);
    expect(weight("Run")).toBeGreaterThan(0.2);
    expect(weight("Run_Right")).toBeGreaterThan(0.2);

    // Death overrides locomotion completely and does not loop back to standing.
    c.die();
    for (let i = 0; i < 60; i++) c.update(input({ speed: 6, alive: false }), 16);
    expect(weight("Death")).toBeGreaterThan(0.9);
    expect(weight("Run")).toBeLessThan(0.05);
    const death = scene.animationGroups.find((g) => g.name === "CharacterArmature|Death_blend");
    expect(death?.loopAnimation).toBe(false);

    // Revive puts it back on its feet.
    c.revive();
    for (let i = 0; i < 60; i++) c.update(input({ speed: 0 }), 16);
    expect(weight("Idle_Gun")).toBeGreaterThan(0.9);
    expect(weight("Death")).toBeLessThan(0.05);
    c.dispose();
  });

  it("plays a hit and a shot over the legs without stopping them", () => {
    const c = new CharacterModel(scene, container, 0, "shot", { modelHeight: chars[0].height });
    const weight = (clip: string): number =>
      scene.animationGroups.find((g) => g.name === `CharacterArmature|${clip}_shot`)?.weight ?? -1;
    for (let i = 0; i < 60; i++) c.update(input({ speed: 6 }), 16);
    c.onFire();
    for (let i = 0; i < 8; i++) c.update(input({ speed: 6 }), 16);
    expect(weight("Gun_Shoot")).toBeGreaterThan(0.3);
    // The legs keep running underneath — that is the point of layering rather than replacing.
    expect(weight("Run")).toBeGreaterThan(0.3);

    // A head shot picks the harder of the two hit clips.
    c.flinch(1, 0, true);
    for (let i = 0; i < 8; i++) c.update(input({ speed: 6 }), 16);
    expect(weight("HitRecieve_2")).toBeGreaterThan(0.3);

    // And it all fades out again.
    for (let i = 0; i < 60; i++) c.update(input({ speed: 6 }), 16);
    expect(weight("HitRecieve_2")).toBeLessThan(0.05);
    expect(weight("Gun_Shoot")).toBeLessThan(0.05);
    c.dispose();
  });

  it("puts the hand on the wrist bone and points a weapon where the body faces", async () => {
    // Needs a camera: the aim/hand hook runs on `onAfterAnimationsObservable`, which only fires
    // inside `scene.render()`, and Babylon refuses to render without one.
    const cam = new FreeCamera("t", new Vector3(0, 1, -4), scene);
    cam.setTarget(new Vector3(0, 1, 0));
    const c = new CharacterModel(scene, container, 0, "hand", { modelHeight: chars[0].height });
    const gun = new TransformNode("gun", scene);
    const muzzle = new TransformNode("gun_muzzle", scene);
    muzzle.parent = gun;
    muzzle.position.set(0, 0, 0.4);                       // 40 cm down the bore
    c.setWeaponProvider(async () => ({ root: gun, muzzle }));
    // The provider is asynchronous, so the gun is attached on a later microtask: one update to ask
    // for it, then a real tick before anything is asserted. Without this the whole test passed
    // against an UNPARENTED node sitting at the origin — it "pointed forward" because it had never
    // been put in the hand at all.
    c.update(input(), 16);
    await new Promise((r) => setTimeout(r, 0));
    expect(gun.parent, "the weapon was never attached to the hand").toBe(c.handNode);
    for (let i = 0; i < 20; i++) { c.update(input(), 16); scene.render(); }

    const hand = c.handNode!;
    expect(hand, "no hand node").not.toBeNull();
    hand.computeWorldMatrix(true);
    const p = hand.getAbsolutePosition().subtract(c.root.getAbsolutePosition());
    // The wrist of a standing man: roughly chest height, and within arm's reach of the body.
    expect(p.y, `hand at y=${p.y.toFixed(3)} — bone space is wrong`).toBeGreaterThan(0.6);
    expect(p.y).toBeLessThan(1.6);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(0.8);

    // And the bore points where the body faces, not over the shoulder.
    gun.computeWorldMatrix(true);
    const m = gun.getWorldMatrix().m;
    const len = Math.hypot(m[8], m[9], m[10]);
    const bore = [m[8] / len, m[9] / len, m[10] / len];
    // The root is unrotated in this test, so "facing" is +Z.
    const deg = Math.acos(Math.max(-1, Math.min(1, bore[2]))) * 180 / Math.PI;
    expect(deg, `bore ${deg.toFixed(1)}° off the way the body faces`).toBeLessThan(45);

    // Turn the body and the gun must turn with it. This is what pins the correction to the
    // CHARACTER's frame rather than the world's: a world-frame solve looks right facing north and
    // leaves the gun pointing north when the player turns east.
    c.root.rotation.y = Math.PI / 2;
    for (let i = 0; i < 10; i++) { c.update(input(), 16); scene.render(); }
    gun.computeWorldMatrix(true);
    const m2 = gun.getWorldMatrix().m;
    const l2 = Math.hypot(m2[8], m2[9], m2[10]);
    // Facing after a quarter turn about Y is +X in Babylon's left-handed frame.
    const deg2 = Math.acos(Math.max(-1, Math.min(1, m2[8] / l2))) * 180 / Math.PI;
    expect(deg2, `after turning the body the bore is ${deg2.toFixed(1)}° off`).toBeLessThan(45);
    c.dispose(); cam.dispose();
  }, 30000);

  it("frees its own cloned materials when it goes, and leaks nothing across join/leave", () => {
    const before = scene.materials.length;
    for (let i = 0; i < 5; i++) {
      const c = new CharacterModel(scene, container, 0, `cycle${i}`, { modelHeight: chars[0].height, tintMaterial: chars[0].tint });
      c.dispose();
    }
    // `cloneMaterials: true` gives each player its own materials and NOTHING else frees them:
    // `InstantiatedEntries.dispose()` covers root nodes, skeletons and animation groups only.
    // MEASURED before this was fixed: five cycles left 35 materials behind, and every later glTF
    // load walks the whole of `scene.materials` twice to restore the light budget.
    expect(scene.materials.length, "materials left behind by disposed characters").toBe(before);
  }, 60000);

  it("never disposes the SHARED material of a weapon it lets go of", async () => {
    const c = new CharacterModel(scene, container, 0, "share", { modelHeight: chars[0].height });
    // Two characters holding the same gun share one merged source, and therefore one material.
    const shared = new StandardMaterial("shared_gun_mat", scene);
    const make = (tag: string) => {
      const root = new TransformNode(`gun_${tag}`, scene);
      const mesh = MeshBuilder.CreateBox(`gun_${tag}_body`, { size: 0.1 }, scene);
      mesh.material = shared;
      mesh.parent = root;
      const muzzle = new TransformNode(`gun_${tag}_muzzle`, scene);
      muzzle.parent = root;
      return { root, muzzle };
    };
    c.setWeaponProvider(async (id) => make(id));
    c.update(input({ weapon: "rifle" }), 16);
    await new Promise((r) => setTimeout(r, 0));
    c.dispose();
    // Disposing the character must not take the material with it: the OTHER eleven players are
    // still drawing with it. MEASURED before this was fixed: twelve seconds into a match all eight
    // shared weapon materials were gone and the shotgun was rendering with `material: null`.
    expect(scene.materials.includes(shared), "a character disposed a material it does not own").toBe(true);
    shared.dispose();
  }, 30000);

  it("puts the muzzle somewhere sane when the hand holds nothing", () => {
    const c = new CharacterModel(scene, container, 0, "muzzle", { modelHeight: chars[0].height });
    c.update(input(), 16);
    const out = c.muzzle(new Vector3());
    // Around chest height and near the body — never at the origin or metres away.
    expect(out.length()).toBeLessThan(PLAYER.height * 2);
    c.dispose();
  });

  it("tints only the material the manifest names", () => {
    const tint = chars[0].tint;
    if (!tint) return;
    const c = new CharacterModel(scene, container, 1, "tint", { tintMaterial: tint, modelHeight: chars[0].height });
    const mats = c.allMeshes.map((m) => m.material?.name ?? "").filter(Boolean);
    expect(mats.some((n) => n.toLowerCase().includes(tint.toLowerCase())), `no ${tint} material on the rig`).toBe(true);
    // The source container's own material must be untouched, or every player would change colour.
    const source = container.materials.find((m) => m.name.toLowerCase().includes(tint.toLowerCase()));
    expect(source).toBeDefined();
    expect(c.allMeshes.some((m) => m.material === source)).toBe(false);
    c.dispose();
  });
});
