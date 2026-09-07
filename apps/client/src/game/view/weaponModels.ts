import type { Scene } from "@babylonjs/core/scene";
import type { Node } from "@babylonjs/core/node";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { WeaponId } from "@frankibarber/shared";
import type { WeaponEntry } from "../world/models";

/** Just enough of `AssetVault` for this library, so a test can hand it files from disk. */
export interface ContainerSource { container(file: string): Promise<AssetContainer | null> }
import { buildRig, type Rig } from "./weaponRig";
import { fitAnchors, fitScale, gripOrigin, guessForward, supportHandHome, unionBox, type PartBox } from "./weaponFit";
import { weaponMetrics, type WeaponModel } from "./weaponMeshes";
import { tameImported } from "./gltfMaterials";

/**
 * glTF weapons (drop 6b). Turns a CC-BY firearm model into the exact `WeaponModel` shape the
 * viewmodel and the third-person character already drive, so NOTHING downstream changes: same
 * `muzzle` / `eject` / `aimPoint` nodes, same `magazine` / `action` nodes, same `actionKind`.
 *
 * The work happens ONCE per weapon id (`prepare`), and every viewmodel / player then gets a cheap
 * instance (`build`):
 *
 *  1. clone the container once, keeping the ORIGINAL node names — the rig classifier reads them;
 *  2. measure every part's bounding box in the clone's own space;
 *  3. turn the model so its bore runs down +Z (`guessForward`), then re-measure — a rotation
 *     changes which box face is "forward", so measuring once would be wrong for the X-axis models;
 *  4. scale it so its length matches the game's declared length for that weapon, and shift it so
 *     the top of the grip sits at the origin — that is where the procedural specs put (0,0,0), and
 *     it is why the imported gun needs no pose retuning;
 *  5. MERGE the static geometry into one mesh (a firearm model is 20–60 named nodes; unmerged,
 *     twelve players holding one would cost hundreds of draw calls), keeping the moving parts —
 *     magazine, slide/bolt/charging handle — separate because the reload animation drives them;
 *  6. keep those merged meshes disabled as instancing SOURCES. Measured on Babylon 9.23: an
 *     `InstancedMesh` whose source mesh is `setEnabled(false)` still renders, and it is the
 *     instance that lands in the scene's active-mesh list.
 *
 * Anything that fails — file missing, no geometry, merge rejected — returns null and the caller
 * keeps the procedural gun. A weapon model is never allowed to take the game down with it.
 */

/** Moving parts get their own pivot so a rotation happens about the PART, not the gun's grip. */
interface PartSource { mesh: Mesh; pivot: [number, number, number] }

interface WeaponSource {
  id: WeaponId;
  statics: Mesh[];
  magazine: PartSource | null;
  action: PartSource | null;
  anchors: { muzzle: [number, number, number]; eject: [number, number, number]; aimPoint: [number, number, number]; length: number; support: [number, number, number] };
  actionKind: WeaponModel["actionKind"];
  rig: Rig;
  /** What `weaponParts` judges: every mesh's own box, and each rig role's box, in the FINAL frame. */
  inspect: WeaponInspection;
}

/**
 * The measured geometry of a prepared gun, in the frame the viewmodel sees (+Z forward, metres,
 * origin at the top of the grip). Kept so the "nothing floats" check (`weaponParts.ts`,
 * `pnpm check:weapons`) judges exactly what the game renders, not a re-parse of the file.
 */
export interface WeaponInspection {
  parts: { name: string; box: PartBox }[];
  roles: Partial<Record<keyof Rig, PartBox>>;
}

const V = (v: [number, number, number]) => new Vector3(v[0], v[1], v[2]);

/** Bounding box of a node and everything under it, in world space. Undefined = no geometry. */
function boxOf(node: Node): PartBox | undefined {
  const meshes: AbstractMesh[] = [];
  const self = node as AbstractMesh;
  if (typeof self.getTotalVertices === "function" && self.getTotalVertices() > 0) meshes.push(self);
  const tn = node as TransformNode;
  if (typeof tn.getChildMeshes === "function") {
    for (const m of tn.getChildMeshes(false)) if (m.getTotalVertices() > 0 && !meshes.includes(m)) meshes.push(m);
  }
  if (meshes.length === 0) return undefined;
  const boxes: PartBox[] = [];
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    boxes.push({ min: [bb.minimumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z], max: [bb.maximumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z] });
  }
  return unionBox(boxes);
}

export class WeaponModelLibrary {
  private sources = new Map<string, Promise<WeaponSource | null>>();
  private root: TransformNode;
  readonly failed = new Set<string>();

  constructor(private scene: Scene, private vault: ContainerSource, private entries: Record<string, WeaponEntry>) {
    this.root = new TransformNode("wpn_sources", scene);
    this.root.setEnabled(false);
  }

  has(id: WeaponId): boolean { return !!this.entries[id] && !this.failed.has(id); }

  /**
   * One copy of the imported gun, or null when it is not available (keep the procedural one).
   *
   * `instanced` is NOT a performance dial to flip freely. MEASURED on Babylon 9.23: an
   * `InstancedMesh` reads `renderingGroupId` and `receiveShadows` from its source and warns when
   * you set them ("has no effect"). The viewmodel needs its own rendering group so the gun draws
   * over the world, so it takes CLONES — there are at most eight of those, one per weapon, and one
   * visible at a time. Players in the world share the source's group, so they take instances.
   */
  async build(id: WeaponId, name: string, instanced: boolean): Promise<WeaponModel | null> {
    const src = await this.source(id);
    if (!src) return null;
    const root = new TransformNode(name, this.scene);
    const copy = (m: Mesh, tag: string): AbstractMesh => {
      const c = instanced ? m.createInstance(tag) : m.clone(tag, null, true);
      c.setEnabled(true);
      c.isPickable = false;
      return c;
    };

    for (const m of src.statics) copy(m, `${name}_${m.name}`).parent = root;

    const limb = (p: PartSource | null, tag: string): TransformNode | null => {
      if (!p) return null;
      // pivot → driven node → mesh offset back. The viewmodel writes position/rotation on the
      // DRIVEN node and expects its home to be (0,0,0); putting the pivot outside it keeps that
      // contract while making a rotation turn the part about itself.
      const pivot = new TransformNode(`${name}_${tag}_pivot`, this.scene);
      pivot.parent = root;
      pivot.position.copyFrom(V(p.pivot));
      const driven = new TransformNode(`${name}_${tag}`, this.scene);
      driven.parent = pivot;
      const inst = copy(p.mesh, `${name}_${tag}_mesh`);
      inst.parent = driven;
      inst.position.copyFrom(V(p.pivot).scale(-1));
      return driven;
    };

    const magazine = limb(src.magazine, "mag");
    const action = limb(src.action, "action");

    const anchor = (tag: string, p: [number, number, number]): TransformNode => {
      const n = new TransformNode(`${name}_${tag}`, this.scene);
      n.parent = root;
      n.position.copyFrom(V(p));
      return n;
    };

    return {
      root,
      muzzle: anchor("muzzle", src.anchors.muzzle),
      eject: anchor("eject", src.anchors.eject),
      aim: anchor("aim", src.anchors.aimPoint),
      magazine,
      action,
      actionKind: src.actionKind,
      aimPoint: src.anchors.aimPoint,
      length: src.anchors.length,
      support: src.anchors.support,
    };
  }

  /** The prepared gun's measured parts, anchors and rig — null when it fell back to procedural. */
  async inspect(id: WeaponId): Promise<{ rig: Rig; anchors: WeaponSource["anchors"]; actionKind: WeaponSource["actionKind"] } & WeaponInspection | null> {
    const src = await this.source(id);
    return src ? { rig: src.rig, anchors: src.anchors, actionKind: src.actionKind, ...src.inspect } : null;
  }

  private source(id: WeaponId): Promise<WeaponSource | null> {
    let p = this.sources.get(id);
    if (!p) { p = this.prepare(id); this.sources.set(id, p); }
    return p;
  }

  private async prepare(id: WeaponId): Promise<WeaponSource | null> {
    const entry = this.entries[id];
    if (!entry) return null;
    try {
      const container = await this.vault.container(entry.file);
      if (!container) throw new Error("container unavailable");

      // Keep the ORIGINAL names: the rig classifier is the whole reason this pipeline works.
      const inst = container.instantiateModelsToScene((n) => n, false);
      const prep = new TransformNode(`wpn_prep_${id}`, this.scene);
      prep.parent = this.root;
      for (const n of inst.rootNodes) (n as TransformNode).parent = prep;

      const nodes: Node[] = [];
      for (const n of inst.rootNodes) {
        const tn = n as TransformNode;
        nodes.push(tn);
        nodes.push(...tn.getDescendants(false));
      }
      const byName = new Map<string, Node>();
      for (const n of nodes) if (!byName.has(n.name)) byName.set(n.name, n);
      const rig = buildRig(nodes.map((n) => n.name));

      const meshes = nodes.filter((n): n is Mesh => n instanceof Mesh && n.getTotalVertices() > 0);
      if (meshes.length === 0) throw new Error("no geometry");

      /**
       * Snapshots every box we care about AT THE CURRENT TRANSFORM. Eagerly, on purpose: an earlier
       * version returned a `part(role)` closure that re-measured on call, so boxes read after the
       * scale was applied silently mixed frames with a `whole` captured before it. The real-asset
       * test caught it — the MK14's muzzle landed 3.5 m from the hand on a 0.8 m rifle.
       */
      const measure = () => {
        // Top-down, because a child's world box is only right once its parents' matrices are.
        prep.computeWorldMatrix(true);
        for (const n of nodes) (n as TransformNode).computeWorldMatrix?.(true);
        const all: PartBox[] = [];
        // Each mesh's OWN box (not its subtree's): that is what a "part" means to the parts check.
        const own: { name: string; box: PartBox }[] = [];
        for (const m of meshes) {
          const bb = m.getBoundingInfo().boundingBox;
          const b: PartBox = { min: [bb.minimumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z], max: [bb.maximumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z] };
          all.push(b);
          own.push({ name: m.name, box: b });
        }
        const part: Partial<Record<keyof Rig, PartBox>> = {};
        for (const role of ["magazine", "action", "frontSight", "rearSight", "muzzle", "eject", "grip", "trigger"] as const) {
          const nm = rig[role];
          const node = typeof nm === "string" ? byName.get(nm) : undefined;
          const b = node ? boxOf(node) : undefined;
          if (b) part[role] = b;
        }
        return { whole: unionBox(all), part, own };
      };

      // ---- 1st pass: which way does it point?
      const m0 = measure();
      const yaw = guessForward(m0.whole, m0.part.muzzle, m0.part.magazine, { front: m0.part.frontSight, rear: m0.part.rearSight });
      // Babylon's rotation vector is (pitch, yaw, roll): a model authored on its side needs Z.
      prep.rotation.set(0, yaw + (entry.yaw ?? 0), entry.roll ?? 0);

      // ---- 2nd pass: everything below is measured in the +Z-forward frame.
      const m1 = measure();
      const metrics = weaponMetrics(id);
      const s = fitScale(m1.whole, metrics.length);
      const origin = gripOrigin(m1.whole, m1.part.grip, m1.part.trigger);
      prep.scaling.setAll(s);
      prep.position.set(-origin[0] * s, -origin[1] * s, -origin[2] * s);

      // ---- 3rd pass: final metric-scale boxes, used for pivots. Anchors come from `fitAnchors`,
      // which does its own scaling from the UNSCALED boxes, so they are computed off `m1`.
      const fit = fitAnchors({
        whole: m1.whole,
        barrel: m1.part.muzzle,
        frontSight: m1.part.frontSight,
        rearSight: m1.part.rearSight,
        eject: m1.part.eject,
        targetLength: metrics.length,
        parts: m1.own.map((p) => p.box),
      });
      const anchors: WeaponSource["anchors"] = { ...fit, support: [0, 0, 0] };
      // fitAnchors measures from the model's own origin; shift onto the grip origin we just applied.
      const shift = (v: [number, number, number]): [number, number, number] =>
        [v[0] - origin[0] * s, v[1] - origin[1] * s, v[2] - origin[2] * s];
      anchors.muzzle = shift(anchors.muzzle);
      anchors.eject = shift(anchors.eject);
      anchors.aimPoint = shift(anchors.aimPoint);

      const m2 = measure();
      // The support hand is measured in the FINAL frame: it rests on the fore-end's underside.
      anchors.support = supportHandHome(metrics.length, m2.own.map((p) => p.box));
      const centreOf = (b: PartBox | undefined): [number, number, number] | null =>
        b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : null;

      // ---- split into moving parts and everything else
      const subtree = (role: keyof Rig): Mesh[] => {
        const nm = rig[role];
        const node = typeof nm === "string" ? byName.get(nm) : undefined;
        if (!node) return [];
        const out: Mesh[] = [];
        if (node instanceof Mesh && node.getTotalVertices() > 0) out.push(node);
        for (const c of (node as TransformNode).getChildMeshes(false)) if (c instanceof Mesh && c.getTotalVertices() > 0 && !out.includes(c)) out.push(c);
        return out;
      };
      const magMeshes = metrics.hasMagazine ? subtree("magazine") : [];
      const actMeshes = metrics.actionKind === "none" ? [] : subtree("action");
      // Pivots MUST be read before the merge: merging disposes the source meshes it consumes.
      const magPivot = centreOf(m2.part.magazine) ?? [0, 0, 0];
      const actPivot = centreOf(m2.part.action) ?? [0, 0, 0];
      const moving = new Set<Mesh>([...magMeshes, ...actMeshes]);
      const staticMeshes = meshes.filter((m) => !moving.has(m));

      // WINDING — measured, and the answer is "leave it alone".
      // The glTF loader's `__root__` carries scaling (1,1,−1) plus a half turn about Y (the
      // right-to-left-handed conversion), so every mesh's world matrix has a NEGATIVE determinant
      // and `MergeMeshes` bakes it. MEASURED on Babylon 9.23, fraction of triangles whose winding
      // agrees with the stored normals, and fraction of normals pointing away from the part centre:
      //   Babylon's own CreateBox        wind 0.000  outward 1.000  sideOrientation 1
      //   raw glTF part, unbaked         wind 1.000  outward 0.790  sideOrientation 0, culling OFF
      //   merged (16 meshes)             wind 1.000  outward 0.756  sideOrientation 0
      //   merged (1 mesh)                wind 0.000  outward 0.730  sideOrientation 0
      //   merged then flipFaces(true)    wind 1.000  outward 0.265  ← normals now point INWARD
      // Two things follow. (1) The pack's materials are DOUBLE-SIDED, so winding never decides
      // visibility here; the merged mesh also inherits `sideOrientation` 0 from its source, which
      // is what a glTF's winding means. (2) Babylon flips indices for a mirrored transform only for
      // meshes after the first, so single- and multi-mesh merges disagree on winding — a real
      // inconsistency, and still not ours to "repair": the only thing a flip would change here is
      // to turn the normals inward and invert the lighting. The test asserts the outward fraction.

      const merge = (list: Mesh[], tag: string): Mesh | null => {
        if (list.length === 0) return null;
        // Always through MergeMeshes, even for ONE mesh: it bakes the world matrix, which is what
        // detaches the part from the glTF hierarchy we are about to dispose. Reparenting a single
        // mesh instead would silently drop the rotation, scale and grip shift applied above.
        // `multiMultiMaterials` keeps several source materials alive on the one merged mesh.
        const merged = Mesh.MergeMeshes(list, true, true, undefined, false, true);
        if (!merged) return null;
        merged.name = `wpn_${id}_${tag}`;
        merged.parent = this.root;
        // Same trap as the characters: a glTF material asks for as many lights as the scene has.
        tameImported(merged);
        merged.isPickable = false;
        merged.setEnabled(false);
        return merged;
      };

      const magMerged = merge(magMeshes, "mag");
      const actMerged = merge(actMeshes, "action");
      const staticMerged = merge(staticMeshes, "body");
      if (!staticMerged) throw new Error("nothing to merge");

      const src: WeaponSource = {
        id,
        statics: [staticMerged],
        magazine: magMerged ? { mesh: magMerged, pivot: magPivot } : null,
        action: actMerged ? { mesh: actMerged, pivot: actPivot } : null,
        anchors,
        actionKind: actMerged ? metrics.actionKind : "none",
        rig,
        inspect: { parts: m2.own, roles: m2.part },
      };
      // Every surviving mesh is now merged and re-parented, so what is left under `prep` is the
      // glTF's empty hierarchy. Dispose it recursively rather than orphaning it.
      prep.dispose(false, false);
      return src;
    } catch (err) {
      this.failed.add(id);
      console.warn(`[weapons] ${id} (${entry.file}) failed to load; keeping the procedural gun`, err);
      return null;
    }
  }

  dispose(): void {
    this.sources.clear();
    this.root.dispose(false, true);
  }
}
