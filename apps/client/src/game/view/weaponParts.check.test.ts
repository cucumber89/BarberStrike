import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import "@babylonjs/core/Meshes/instancedMesh";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { WeaponModelLibrary, type ContainerSource } from "./weaponModels";
import { parseAssets } from "../world/models";
import { proceduralParts } from "./weaponMeshes";
import { HAND_SIZE } from "./weaponFit";
import { formatReport, judgeWeapon, pickReceiver, summaryLine, type AnchorInput, type NamedBox, type WeaponReport } from "./weaponParts";

/**
 * Drop A's gate, `pnpm check:weapons`: every one of the 11 weapons, loaded THE WAY THE GAME LOADS
 * IT (the glTF through `WeaponModelLibrary.prepare`, the rest through the procedural specs), is a
 * physically coherent object — every part attached to the receiver within 5 mm, every anchor on
 * the part it belongs to. `weaponParts.ts` is the judge; this file is the measuring harness.
 *
 * The table goes to `e2e/out/weapons/parts.md` (+ `.json`), never to the console, so the failing
 * rows can be read back without the whole thing. `e2e/tools/weapon-parts.mjs` runs this and prints
 * the summary line.
 */

const MANIFEST = "public/models/manifest.json";
const manifest = existsSync(MANIFEST) ? parseAssets(JSON.parse(readFileSync(MANIFEST, "utf8"))) : null;
const imported = new Set<WeaponId>(manifest ? (Object.entries(manifest.weapons) as [WeaponId, { file: string }][]).filter(([, e]) => existsSync(`public/models/${e.file}`)).map(([id]) => id) : []);
const OUT_DIR = process.env.WEAPON_PARTS_OUT ?? "e2e/out/weapons";

describe("weapon parts: nothing floats", () => {
  let engine: NullEngine;
  let scene: Scene;
  let lib: WeaponModelLibrary | null = null;
  const reports: WeaponReport[] = [];

  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    if (manifest && imported.size > 0) {
      const disk: ContainerSource = {
        async container(file): Promise<AssetContainer | null> {
          return LoadAssetContainerAsync(new Uint8Array(readFileSync(`public/models/${file}`)), scene, { pluginExtension: ".glb" });
        },
      };
      lib = new WeaponModelLibrary(scene, disk, manifest.weapons);
    }
  });

  afterAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
    const order = new Map(WEAPON_ORDER.map((id, i) => [id, i]));
    reports.sort((a, b) => (order.get(a.id.split(":")[0] as WeaponId) ?? 99) - (order.get(b.id.split(":")[0] as WeaponId) ?? 99) || a.id.localeCompare(b.id));
    const md = [`# weapon-parts — ${new Date().toISOString()}`, "", summaryLine(reports), "", "Tolerance 5 mm. Frame: +Z forward, +Y up, +X right, metres, origin at the top of the grip (what the viewmodel sees).", "", ...reports.map(formatReport)].join("\n");
    writeFileSync(`${OUT_DIR}/parts.md`, md);
    writeFileSync(`${OUT_DIR}/parts.json`, JSON.stringify({ summary: summaryLine(reports), reports }, null, 1));
    lib?.dispose(); scene?.dispose(); engine?.dispose();
  });

  async function measure(id: WeaponId, source: "gltf" | "procedural"): Promise<WeaponReport> {
    if (source === "gltf" && lib && imported.has(id)) {
      const insp = await lib.inspect(id);
      expect(insp, `${id}: the import pipeline fell back to procedural`).not.toBeNull();
      const { rig, roles, parts, anchors } = insp!;
      const role = (r: keyof typeof roles): NamedBox[] | undefined => {
        const name = rig[r]; const box = roles[r];
        return typeof name === "string" && box ? [{ name, box }] : undefined;
      };
      const receiver = pickReceiver(parts, [rig.magazine, rig.action, rig.projectile, rig.cylinder].filter((n): n is string => !!n));
      expect(receiver, `${id}: no receiver`).toBeDefined();
      const input: AnchorInput = {
        gripOrigin: [0, 0, 0],
        muzzle: anchors.muzzle,
        aimPoint: anchors.aimPoint,
        eject: anchors.eject,
        supportHand: { centre: anchors.support, size: HAND_SIZE },
        grip: role("grip") ?? role("trigger"),
        barrel: role("muzzle"),
        sights: [...(role("frontSight") ?? []), ...(role("rearSight") ?? [])],
        ejectPort: role("eject"),
        magazine: role("magazine"),
      };
      return judgeWeapon(`${id}:gltf`, "gltf", parts, receiver!, input);
    }
    const pp = proceduralParts(id);
    const parts = [...pp.parts, ...pp.magazine];
    // Convention in SPECS: the first part is the receiver / frame / body. Picking by volume chose
    // the pistol's slide and the sniper's stock, and then judged everything against them.
    const receiver = parts[0];
    const zero = (v: [number, number, number]) => v[0] === 0 && v[1] === 0 && v[2] === 0;
    const input: AnchorInput = {
      gripOrigin: [0, 0, 0],
      muzzle: pp.muzzle,
      aimPoint: pp.aimPoint,
      eject: zero(pp.eject) ? undefined : pp.eject,
      supportHand: { centre: pp.support, size: HAND_SIZE },
      magazine: pp.magazine.length ? pp.magazine : undefined,
    };
    return judgeWeapon(id, "procedural", parts, receiver, input);
  }

  // The procedural specs are the product (owner, 2026-09-07): every weapon is judged on them.
  it.each(WEAPON_ORDER)("%s is one attached object with its anchors on their parts", async (id) => {
    const r = await measure(id, "procedural");
    reports.push(r);
    expect(r.floating, `${id}: parts not attached to ${r.receiver}`).toEqual([]);
    expect(r.misplaced, `${id}: anchors off their part — ${r.anchors.filter((a) => !a.ok).map((a) => `${a.anchor} ${(a.gap * 1000).toFixed(1)} mm from ${a.expected || "the gun"}`).join("; ")}`).toEqual([]);
  });

  // The glTF import path is still in the tree (retirement is Deferred); keep it honest while it is.
  it.each([...imported])("%s (glTF) is one attached object with its anchors on their parts", async (id) => {
    const r = await measure(id, "gltf");
    reports.push(r);
    expect(r.floating, `${id} glTF: parts not attached to ${r.receiver}`).toEqual([]);
    expect(r.misplaced, `${id} glTF: anchors off their part`).toEqual([]);
  });
});
