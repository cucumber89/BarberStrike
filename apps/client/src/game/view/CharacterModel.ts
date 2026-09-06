import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer, InstantiatedEntries } from "@babylonjs/core/assetContainer";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { PLAYER, TEAM_COLORS, type Team, type WeaponId } from "@frankibarber/shared";
import type { Material } from "@babylonjs/core/Materials/material";
import { tameLighting } from "./gltfMaterials";
import type { CharacterInput } from "./Character";
import { pickClip, locomotion, USED_CLIPS, type ClipName } from "./characterAnim";

/**
 * Skinned character (drop 6b). Replaces the procedural `Character` when a rigged glTF is listed in
 * the model manifest; when it is not, `RemotePlayer` keeps the procedural one, so the game still
 * runs with no third-party files present.
 *
 * The Quaternius "Ultimate Modular Men" rigs all share one skeleton (Root, Hips, Abdomen, Torso,
 * Chest, Neck, Head, Shoulder/UpperArm/LowerArm/Wrist + fingers .L/.R, UpperLeg/LowerLeg/Foot) and
 * the same 24 clips, so one animation mapping serves every character in the pack.
 *
 * Three things this has to do that a plain "play a clip" wrapper does not:
 *  - BLEND locomotion. Walk / Run / Run_Back / Run_Left / Run_Right are separate clips and a player
 *    strafing diagonally is between two of them. Babylon blends by weighting groups that are ALL
 *    playing, so every locomotion clip stays running, most of them at weight 0.
 *  - Layer ONE-SHOTS over that. Firing, flinching and dying must not stop the legs, so they get
 *    their own weight and are cross-faded in and out on a timer. Which clip that is comes from
 *    `pickClip`, the same pure function the tests cover.
 *  - Aim with the SPINE, not the whole body. The clips look straight ahead; the player's pitch is
 *    applied to Chest and Head AFTER the animation is evaluated (onAfterAnimationsObservable),
 *    because anything written before that is overwritten by the animation system this same frame.
 */

/** Clip weights change this fast (per second); ~9 is a quarter-second crossfade. */
const BLEND = 9;
/** Above this speed the walk clip gives way to the run clips. */
const RUN_SPEED = 3.4;
/**
 * Where the gun sits in the right hand, as an offset in the hand's own frame AFTER the orientation
 * has been solved (see `alignWeapon`).
 *
 * Only the offset is a chosen number, and it is small: the gun's origin is the top of its grip, so
 * it wants to sit almost exactly at the hand. The ROTATION is not guessed — an earlier version
 * hard-coded a quarter turn and MEASURED 135–152° away from the direction the body faced, i.e.
 * every enemy carrying their rifle backwards, with the muzzle behind their own hip.
 */
const HAND_OFFSET = { x: 0.0, y: 0.0, z: 0.03 };

/** Frames of animation before the hand correction is solved; see `syncHand` for why it is not 0. */
const SOLVE_PIN_FRAME = 8;

const TMP_A = new Matrix();
const TMP_B = new Matrix();
const TMP_Q = new Quaternion();

/** How long each one-shot holds full weight before locomotion takes over again (seconds). */
const ONESHOT_MS = { fire: 260, flinch: 420, throw: 520, death: 1400 } as const;

export interface CharacterModelOptions {
  /** Material name to tint with the team colour (e.g. "Hoodie" or "Suit"); absent = no tint. */
  tintMaterial?: string;
  /** Metres from the model's feet to the top of its head, used to match PLAYER.height. */
  modelHeight?: number;
}

interface Clip { group: AnimationGroup; target: number }

/** Supplies a third-person weapon: its root (parented to the hand) and its muzzle anchor. */
export type WeaponProvider = (id: WeaponId) => Promise<{ root: TransformNode; muzzle: TransformNode } | null>;

export class CharacterModel {
  readonly root: TransformNode;
  readonly allMeshes: AbstractMesh[] = [];
  private entries: InstantiatedEntries;
  private clips = new Map<ClipName, Clip>();
  /** Transient states, as ms remaining. `pickClip` turns them into one clip. */
  private timers = { fire: 0, flinch: 0, throwing: 0 };
  private flinchHead = false;
  private chest: Bone | null = null;
  private head: Bone | null = null;
  private wrist: Bone | null = null;
  private hand: TransformNode | null = null;
  /** The mesh the skeleton drives: bone matrices are in ITS space, not the character root's. */
  private skinned: AbstractMesh | null = null;
  /** This player's own cloned materials — nothing else disposes them. See `collectMeshes`. */
  private ownMaterials = new Set<Material>();
  /** Hand-frame → weapon-frame rotation, solved from the rig once the idle pose is pinned. */
  private handCorrection: Quaternion | null = null;
  private solveTick = 0;
  private skeleton: Skeleton | null = null;
  private pitch = 0;
  private crouch = 0;
  private dead = false;
  private disposed = false;
  private afterAnim: (() => void) | null = null;
  /** Weapon currently parented to the hand, so it can be swapped without rebuilding the character. */
  private weaponNode: TransformNode | null = null;
  /** One node per weapon this character has ever held; only the current one is enabled. */
  private weapons = new Map<WeaponId, TransformNode>();
  private weaponWanted: WeaponId | null = null;
  private weaponMuzzles = new Map<WeaponId, TransformNode>();
  private weaponProvider: WeaponProvider | null = null;
  /** Weapon ids being built right now, so a fast switch cannot start the same one twice. */
  private building = new Set<WeaponId>();

  constructor(private scene: Scene, container: AssetContainer, team: Team, id: string, opts: CharacterModelOptions = {}) {
    // One instantiation per player: its own skeleton and its own animation groups, so two players
    // never share a pose. `cloneMaterials` gives this player materials of its own to tint. The
    // clones still share the geometry (and therefore the GPU buffers) with the container.
    this.entries = container.instantiateModelsToScene((n) => `${n}_${id}`, true);
    this.root = new TransformNode(`char_${id}`, scene);
    for (const n of this.entries.rootNodes) (n as TransformNode).parent = this.root;
    this.skeleton = this.entries.skeletons[0] ?? null;
    // Scale the rig to the player's collision height so head shots line up with the hit box.
    this.root.scaling.setAll(PLAYER.height / (opts.modelHeight ?? 1.9));

    for (const g of this.entries.animationGroups) {
      g.stop();
      // Babylon only blends skeleton matrices with this on; it is per-group and set once.
      g.enableBlending = true;
      g.blendingSpeed = 0.12;
    }
    this.indexClips(id);
    this.findBones();
    this.collectMeshes(team, opts.tintMaterial);

    // The pitch override has to run after the animation system has written this frame's bone
    // matrices, or it is silently overwritten before anything is drawn.
    const hook = () => this.afterAnimations();
    this.scene.onAfterAnimationsObservable.add(hook);
    this.afterAnim = () => this.scene.onAfterAnimationsObservable.removeCallback(hook);

    // Only the gun idle actually runs at the start. A group is played when its weight first goes
    // above zero and stopped again when it reaches zero, so a standing player evaluates ONE clip
    // rather than twelve — the difference between a playable client and a slideshow.
    for (const [, c] of this.clips) { c.group.weight = 0; c.target = 0; }
    this.setWeight("Idle_Gun", 1, true);
    const idle = this.clips.get("Idle_Gun");
    if (idle) idle.group.play(true);
    // A dead character must hold its last frame instead of looping back to standing; `play(false)`
    // above keeps it from restarting, and it is never stopped while its target is 1.
    const death = this.clips.get("Death");
    if (death) death.group.loopAnimation = false;
  }

  private indexClips(id: string): void {
    const suffix = `_${id}`;
    const wanted = new Set<string>(USED_CLIPS);
    for (const g of this.entries.animationGroups) {
      // glTF clips arrive named "CharacterArmature|Walk"; the part after the bar is the clip. The
      // per-player name function has ALSO appended `_<id>` to the group, and stripping that back off
      // is not cosmetic: without it no clip name matches, every weight stays 0 and the character
      // stands in its bind pose. `CharacterModel.test.ts` pins this.
      const tail = g.name.split("|").pop() ?? g.name;
      const clip = (tail.endsWith(suffix) ? tail.slice(0, -suffix.length) : tail) as ClipName;
      // Clips nothing drives are disposed, not kept idle: see USED_CLIPS for the measurement.
      if (!wanted.has(clip) || this.clips.has(clip)) { g.dispose(); continue; }
      this.clips.set(clip, { group: g, target: 0 });
    }
  }

  private findBones(): void {
    const s = this.skeleton;
    if (!s) return;
    const by = (re: RegExp): Bone | null => s.bones.find((b) => re.test(b.name)) ?? null;
    this.chest = by(/^Chest$/i) ?? by(/^Torso$/i);
    this.head = by(/^Head$/i);
    this.wrist = by(/^Wrist\.R$/i) ?? by(/^Hand\.R$/i) ?? by(/^LowerArm\.R$/i);
    if (this.wrist) {
      // A transform node following the wrist: the weapon parents to THIS, so swapping guns never
      // touches the skeleton and the gun inherits the hand's animated world matrix.
      //
      // Driven by hand each frame rather than with `attachToBone`. Bone matrices live in the SKINNED
      // MESH's space, and for this pack that space carries the glTF loader's mirrored `__root__` and
      // the model's own 100× unit scale, so neither obvious reference node works: MEASURED, wrist
      // position relative to the character root came out at (−0.01, 0.00, 0.00) — the player's feet
      // — with the character root, and 18 m below the floor with the skinned mesh.
      // `bone.getFinalMatrix() × skinnedMesh.world` gives the right answer, (0.155, 1.028, 0.181).
      this.skinned = this.root.getChildMeshes(false).find((m) => !!m.skeleton) ?? null;
      const hand = new TransformNode(`hand_${this.root.name}`, this.scene);
      hand.parent = this.root;
      this.hand = hand;
    }
  }

  private collectMeshes(team: Team, tintMaterial?: string): void {
    const tint = Color3.FromHexString(TEAM_COLORS[team]).toLinearSpace();
    for (const n of this.root.getChildMeshes()) {
      this.allMeshes.push(n);
      n.isPickable = false;      // hit tests are server-side; these meshes are presentation only
      n.receiveShadows = true;
      const mat = n.material as (Material & { albedoColor?: Color3; emissiveColor?: Color3 }) | null;
      if (!mat) continue;
      // `cloneMaterials` gave this player its own copies, and NOTHING else frees them:
      // `InstantiatedEntries.dispose()` handles root nodes, skeletons and animation groups only,
      // and by the time it has run there are no meshes left for `root.dispose()` to reach.
      // MEASURED without this: five join/leave cycles left 35 materials in the scene, and
      // `loadKeepingLightBudget` walks that list twice on every later glTF load.
      this.ownMaterials.add(mat);
      tameLighting(mat);
      if (!tintMaterial) continue;
      // The material is per-instance (cloneMaterials above), so this colours ONE player.
      if (mat.name && mat.name.toLowerCase().includes(tintMaterial.toLowerCase()) && mat.albedoColor) {
        mat.albedoColor = tint;
        if (mat.emissiveColor) mat.emissiveColor = tint.scale(0.08);
      }
    }
  }

  /** Sets a clip's target weight; `snap` applies it immediately instead of blending. */
  private setWeight(name: ClipName, w: number, snap = false): void {
    const c = this.clips.get(name);
    if (!c) return;
    c.target = w;
    if (snap) c.group.weight = w;
  }

  // ---------------------------------------------------------------- public API (mirrors Character)

  onFire(): void { this.timers.fire = ONESHOT_MS.fire; }
  throw(): void { this.timers.throwing = ONESHOT_MS.throw; }

  flinch(fromX: number, fromZ: number, head = false): void {
    // The pack's hit clips are not directional, so the shot vector only picks body vs head. Kept in
    // the signature because the procedural character does use it and the two must be swappable.
    void fromX; void fromZ;
    if (this.dead) return;
    this.flinchHead = head;
    this.timers.flinch = ONESHOT_MS.flinch;
  }

  die(fromX = 0, fromZ = 0): void {
    void fromX; void fromZ;
    this.dead = true;
    this.timers.fire = this.timers.flinch = this.timers.throwing = 0;
  }

  revive(): void {
    this.dead = false;
    const d = this.clips.get("Death");
    if (d) { d.group.weight = 0; d.target = 0; d.group.goToFrame(d.group.from); }
  }

  get dying(): boolean { return this.dead; }

  setEnabled(v: boolean): void { this.root.setEnabled(v); }

  /** World-space muzzle: the weapon's own muzzle node when one is attached, else the right hand. */
  muzzle(out: Vector3): Vector3 {
    const src = this.weaponNode ?? this.hand;
    if (src) { src.computeWorldMatrix(true); return out.copyFrom(src.getAbsolutePosition()); }
    return out.copyFrom(this.root.getAbsolutePosition()).addInPlaceFromFloats(0, PLAYER.eyeHeight * 0.9, 0);
  }

  /** The node weapons hang off (follows the right wrist bone); null when the rig has no such bone. */
  get handNode(): TransformNode | null { return this.hand; }

  /**
   * Supplies weapon models on demand. Called with the weapon the character has just switched to;
   * resolving to null means "no imported model for that gun", and the hand simply stays empty —
   * this rig has no procedural fallback gun of its own, by design: mixing a hand-built weapon into
   * an imported character looked worse than an empty hand in the screenshots.
   */
  setWeaponProvider(fn: WeaponProvider): void {
    this.weaponProvider = fn;
    if (this.weaponWanted) void this.equip(this.weaponWanted);
  }

  private async equip(id: WeaponId): Promise<void> {
    this.weaponWanted = id;
    const have = this.weapons.get(id);
    if (have) { this.showWeapon(id); return; }
    if (!this.weaponProvider || this.building.has(id)) return;
    // Claim it before awaiting. Without this a player who switches away and back while the model is
    // still loading starts a SECOND build of the same gun: both finish, both parent themselves to
    // the hand, and the first is orphaned there for the rest of the match — drawn, and never freed.
    this.building.add(id);
    let built: { root: TransformNode; muzzle: TransformNode } | null = null;
    try {
      built = await this.weaponProvider(id);
    } finally {
      this.building.delete(id);
    }
    // The player may have switched again (or died and been disposed) while this loaded.
    if (!built) return;
    const node = built.root;
    // Never with `disposeMaterialAndTextures`: every copy of a gun shares the merged source's
    // material, so disposing it here would blank that weapon for every other player holding one.
    if (this.disposed || !this.hand) { node.dispose(false, false); return; }
    this.weaponMuzzles.set(id, built.muzzle);
    node.parent = this.hand;
    this.alignWeapon(node);
    this.weapons.set(id, node);
    this.showWeapon(this.weaponWanted ?? id);
  }

  /**
   * Seats a weapon in the hand, using the rotation `syncHand` solved from the rig.
   *
   * Applied once and then left alone, so the gun follows the hand through the animation rather than
   * floating level — it just starts out aimed forwards rather than across the body. A weapon that
   * arrives before the correction has been solved is re-seated when it is.
   */
  private alignWeapon(node: TransformNode): void {
    if (!this.handCorrection) return;
    node.rotationQuaternion = this.handCorrection.clone();
    node.position.set(HAND_OFFSET.x, HAND_OFFSET.y, HAND_OFFSET.z);
  }

  private showWeapon(id: WeaponId): void {
    for (const [wid, n] of this.weapons) n.setEnabled(wid === id);
    // Tracers and muzzle flashes start at the gun's OWN muzzle anchor, not at its root.
    this.weaponNode = this.weaponMuzzles.get(id) ?? this.weapons.get(id) ?? null;
  }

  update(inp: CharacterInput, dtMs: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, dtMs / 1000);
    this.pitch = inp.pitch;
    if (inp.weapon !== this.weaponWanted) void this.equip(inp.weapon);
    this.crouch += ((inp.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);

    for (const k of ["fire", "flinch", "throwing"] as const) {
      if (this.timers[k] > 0) this.timers[k] = Math.max(0, this.timers[k] - dtMs);
    }

    // ---- which clip, if any, overrides locomotion this frame
    const shot = pickClip({
      dead: this.dead,
      firing: this.timers.fire > 0,
      flinch: this.timers.flinch > 0 ? (this.flinchHead ? "head" : "body") : null,
      throwing: this.timers.throwing > 0,
      reloading: inp.reloading,
    });

    // ---- locomotion targets (every clip starts at 0; the blend below eases towards these)
    for (const [, c] of this.clips) c.target = 0;
    if (this.dead) {
      this.setWeight("Death", 1);
    } else {
      for (const [clip, w] of locomotion(inp.speed, inp.moveDir, inp.grounded, RUN_SPEED)) this.setWeight(clip, w);
      // The one-shot does not fully replace the legs: at 0.85 the stride still reads underneath.
      if (shot) this.setWeight(shot, 0.85);
    }

    // ---- blend every clip towards its target (rising faster than falling, so hits read instantly),
    // and start/stop the group with its weight so nothing is evaluated for free.
    const k = Math.min(1, dt * BLEND);
    for (const [name, c] of this.clips) {
      if (c.target > 0 && !c.group.isPlaying) c.group.play(name !== "Death");
      const w = c.group.weight + (c.target - c.group.weight) * (c.target > c.group.weight ? Math.min(1, k * 1.6) : k);
      c.group.weight = Math.abs(w) < 0.002 ? 0 : Math.max(0, Math.min(1, w));
      if (c.target === 0 && c.group.weight === 0 && c.group.isPlaying) c.group.stop();
    }
    // Locomotion clips play faster as the player moves faster, so the feet do not skate.
    const runClip = this.clips.get("Run");
    if (runClip) runClip.group.speedRatio = Math.max(0.6, Math.min(1.8, inp.speed / 5.5));
    const walkClip = this.clips.get("Walk");
    if (walkClip) walkClip.group.speedRatio = Math.max(0.6, Math.min(1.8, inp.speed / 2.2));

    // ---- crouch: the pack has no crouch clip, so the rig sinks instead. Documented compromise; a
    // crouched player still reads as lower, which is what matters for aiming at one.
    this.root.position.y = inp.alive ? -0.42 * this.crouch : 0;
  }

  /**
   * Runs after the animation system, so the aim rotations survive the frame and the hand follows the
   * pose the character is actually in — including the spine rotation applied a line earlier.
   */
  private afterAnimations(): void {
    if (this.disposed) return;
    if (!this.dead) {
      const p = Math.max(-0.9, Math.min(0.9, this.pitch));
      if (this.chest) this.chest.rotate(Vector3.Right(), p * 0.45, Space.LOCAL);
      if (this.head) this.head.rotate(Vector3.Right(), p * 0.5, Space.LOCAL);
    }
    this.syncHand();
  }

  /** Puts the hand node on the wrist bone, in the character root's frame. */
  private syncHand(): void {
    const hand = this.hand, bone = this.wrist, skinned = this.skinned;
    if (!hand || !bone || !skinned) return;
    // Force both matrices: this runs on `onAfterAnimationsObservable`, which fires BEFORE Babylon
    // walks the active meshes for the frame, so the cached ones are a frame old. Mixing a fresh
    // root with a stale skinned mesh does not blur the result, it cancels the wrong rotation — a
    // player who turns 90° leaves the gun pointing exactly 90° away, which is what the test caught.
    // Root FIRST: a child's compute pulls its parent's CACHED matrix, so refreshing the mesh before
    // the root leaves it built on the root's previous transform.
    this.root.computeWorldMatrix(true);
    skinned.computeWorldMatrix(true);
    // bone final × skinned mesh world = the bone in world space; then into the root's frame, because
    // that is what the hand node is parented to.
    bone.getFinalMatrix().multiplyToRef(skinned.getWorldMatrix(), TMP_A);
    this.root.getWorldMatrix().invertToRef(TMP_B);
    TMP_A.multiplyToRef(TMP_B, TMP_A);
    TMP_A.decompose(undefined, TMP_Q, hand.position);
    hand.rotationQuaternion = (hand.rotationQuaternion ?? new Quaternion()).copyFrom(TMP_Q);

    // The weapon frame is +Z down the bore; the hand's orientation is the artist's, differs between
    // packs and is written down nowhere — so it is read off the rig. WHEN it is read matters twice
    // over, and both were measured:
    //  - too early and the skeleton is still in its BIND pose (arms out in a T), which reads as
    //    109–127° off the direction the body faces;
    //  - at an arbitrary later moment and the gun idle's breathing has moved the wrist, which left
    //    two players holding the same rifle 17° apart.
    // So: let the animation run a few frames, then pin the gun idle to its first frame, let that be
    // evaluated, and solve from exactly that pose — the same one for every character.
    if (!this.handCorrection) {
      this.solveTick++;
      if (this.solveTick === SOLVE_PIN_FRAME) {
        const idle = this.clips.get("Idle_Gun");
        if (idle) idle.group.goToFrame(idle.group.from);
        return;
      }
      if (this.solveTick <= SOLVE_PIN_FRAME) return;
      // A child's world rotation is `local × parentWorld`, so the local rotation that makes the
      // gun's world rotation the BODY's is the inverse of the hand's own rotation.
      //
      // Invert the DECOMPOSED quaternion, not the matrix. The bone's chain carries the loader's
      // mirrored root, so the matrix has a negative determinant: `getRotationMatrix()` on it is a
      // reflection, not a rotation, and transposing that is not an inverse. MEASURED: 109° and 124°
      // off the direction the body faced — consistently wrong, which is its own kind of clue.
      this.handCorrection = Quaternion.Inverse(TMP_Q);
      for (const [, n] of this.weapons) this.alignWeapon(n);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.afterAnim?.();
    this.afterAnim = null;
    for (const [, n] of this.weapons) n.dispose(false, false);   // shared materials, see `equip`
    this.weapons.clear();
    this.weaponMuzzles.clear();
    this.weaponNode = null;
    this.clips.clear();
    // Disposes this instantiation's root nodes, skeleton and animation groups — but NOT the
    // container's shared geometry, which other players are still using, and NOT the materials it
    // cloned for this player, which is why they are tracked and freed here.
    this.entries.dispose();
    for (const m of this.ownMaterials) m.dispose(true, true);
    this.ownMaterials.clear();
    this.hand?.dispose();
    this.root.dispose(false, true);
  }
}
