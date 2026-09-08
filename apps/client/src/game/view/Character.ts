import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PLAYER, TEAM_COLORS, WEAPONS, type Team, type WeaponId } from "@frankibarber/shared";
import { buildWeaponModel, createWeaponMaterials, forEachMesh, type WeaponMaterials, type WeaponModel } from "./weaponMeshes";
import { beveledBox } from "./geometry";

/**
 * Procedural articulated third-person character. No external assets: a jointed figure with a
 * readable silhouette (broad shoulders, cap, vest with a team-coloured panel and armband) and
 * programmatic locomotion.
 *
 * 1.0 beta animation set (0.1 had legs-only walk, fixed sideways death):
 * - walk/run: legs + counter-swinging arms on the weapon, hip sway, torso twist, run bounce;
 * - lean into turns (from yaw rate) and into strafes (from move direction);
 * - landing squash from an air → ground transition, scaled by fall time;
 * - idle weight shift and breathing; head follows aim pitch; sprint lowers the gun;
 * - hit flinch: direction-aware (torso/head snap away from the shot, arms tighten), head shots bigger;
 * - death: knees buckle → fall AWAY from the killer with a tumble → settle; then fade on respawn.
 * Materials are shared per team. Everything is exponential smoothing on a few scalars.
 */

/**
 * What `RemotePlayer` needs from a third-person body, so the procedural `Character` and the
 * imported `CharacterModel` (drop 6b) are interchangeable. Every member here is called from
 * `RemotePlayer` or from the view modules; nothing else is shared between the two.
 */
export interface CharacterLike {
  readonly root: TransformNode;
  readonly allMeshes: AbstractMesh[];
  onFire(): void;
  throw(): void;
  flinch(fromX: number, fromZ: number, head?: boolean): void;
  die(fromX?: number, fromZ?: number): void;
  revive(): void;
  setEnabled(v: boolean): void;
  muzzle(out: Vector3): Vector3;
  update(inp: CharacterInput, dtMs: number): void;
  dispose(): void;
}

export interface CharacterInput {
  speed: number;       // horizontal m/s (interpolated)
  grounded: boolean;
  crouch: boolean;
  pitch: number;       // aim pitch (rad, + = down)
  alive: boolean;
  reloading: boolean;
  weapon: WeaponId;
  /** Direction of travel relative to facing (rad). 0 = forward. */
  moveDir: number;
  /** A barber perk is running (drop 3): the hat band glows so others can read the buff. */
  perked?: boolean;
  /** Drop 4: lean (-1..1) tilts the torso and head sideways; tac raises the gun across the chest. */
  lean?: number;
  tac?: boolean;
  /** Bomb Plant (2.2): this player carries the charge — a pack on the back everyone can read. */
  bomb?: boolean;
  /** Slide (2.3): leaning back on one leg, the other out front. */
  slide?: boolean;
  /**
   * Drop D: a visibly shaved head — the cap comes off and a stubbled skull shows. Ostrzyżeni's
   * shaved side wears it for the round; Drop E's shave reuses the same flag. Read in every mode,
   * and unlike the perk band it stays on a corpse: the shave is the point.
   */
  shaved?: boolean;
}

/** Joint angles exposed for tests/tools (radians). */
export interface Pose {
  hipsY: number; torsoX: number; torsoY: number; headX: number; headY: number;
  legR: number; legL: number; shinR: number; shinL: number;
  armR: number; armL: number; rootZ: number; rootX: number;
}

interface SharedMats { skin: PBRMaterial; cloth: PBRMaterial; vest: PBRMaterial; accent: PBRMaterial; boots: PBRMaterial; stubble: PBRMaterial; weapons: WeaponMaterials }

const SHARED = new Map<Scene, Map<Team, SharedMats>>();

function teamMats(scene: Scene, team: Team): SharedMats {
  let byTeam = SHARED.get(scene);
  if (!byTeam) { byTeam = new Map(); SHARED.set(scene, byTeam); scene.onDisposeObservable.addOnce(() => SHARED.delete(scene)); }
  let m = byTeam.get(team);
  if (m) return m;
  const mk = (name: string, hex: string, rough: number, metal = 0, emissive?: string) => {
    const mat = new PBRMaterial(`${name}_t${team}`, scene);
    mat.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    mat.roughness = rough; mat.metallic = metal;
    if (emissive) mat.emissiveColor = Color3.FromHexString(emissive).scale(0.6);
    mat.maxSimultaneousLights = 4;
    mat.useGLTFLightFalloff = true; // same range-limited falloff as the map
    mat.freeze();
    return mat;
  };
  const accentHex = TEAM_COLORS[team];
  m = {
    skin: mk("ch_skin", "#c39270", 0.7, 0, "#1b100b"),
    cloth: mk("ch_cloth", team === 0 ? "#455e70" : "#705044", 0.85, 0, "#10151c"),
    vest: mk("ch_vest", "#939990", 0.7, 0.05, "#181b19"),
    accent: mk("ch_accent", accentHex, 0.45, 0.1, accentHex),
    boots: mk("ch_boots", "#292e35", 0.6, 0, "#090c10"),
    // Drop D: a freshly clipped scalp — skin with a grey-blue stubble cast, matte, so a shaved head
    // reads as "no hair" at gameplay distance rather than as a bald skin tone.
    stubble: mk("ch_stubble", "#8f7a6c", 0.95, 0, "#120d0b"),
    weapons: createWeaponMaterials(scene),
  };
  byTeam.set(team, m);
  return m;
}

const DEATH_MS = 900;

export class Character {
  readonly root: TransformNode;
  private hips: TransformNode;
  private torso: TransformNode;
  private head: TransformNode;
  private armR: TransformNode; private forearmR: TransformNode;
  private armL: TransformNode; private forearmL: TransformNode;
  private legR: TransformNode; private shinR: TransformNode;
  private legL: TransformNode; private shinL: TransformNode;
  private gunHand: TransformNode;
  private weapons = new Map<WeaponId, WeaponModel>();
  private weaponMaterials: WeaponMaterials;
  private currentWeapon: WeaponId = "rifle";
  private phase = 0;
  private blendCrouch = 0;
  private blendAir = 0;
  private blendLean = 0;
  private blendTac = 0;
  private blendSlide = 0;
  private blendRun = 0;
  private deathT = -1;
  private deathDir = 0;       // world yaw the body falls towards
  private deathSpin = 0;      // sign of the tumble
  private kick = 0;
  private reloadPhase = 0;
  private meshes: Mesh[] = [];
  private fade = 1;
  private time = Math.random() * 10;
  // Feel state (1.0 beta).
  private lastYaw = 0;
  private turnLean = 0;
  private airTime = 0;
  private landSquash = 0;
  private flinchT = 0;        // 1 → 0
  private flinchX = 0;        // local-space direction of the hit (+X right, +Z front)
  private flinchZ = 0;
  private flinchAmt = 0;
  private perkBand: Mesh;
  private bombPack: Mesh[] = [];
  /** Drop D: the cap (and its visor) hide when shaved; the bare, stubbled skull shows instead. */
  private capParts: Mesh[] = [];
  private bareHead: Mesh;

  constructor(private scene: Scene, team: Team, name: string) {
    const M = teamMats(scene, team);
    this.weaponMaterials = M.weapons;
    this.root = new TransformNode(`char_${name}`, scene);
    const node = (n: string, parent: TransformNode, x: number, y: number, z: number) => {
      const t = new TransformNode(n, scene); t.position.set(x, y, z); t.parent = parent; return t;
    };
    const box = (n: string, parent: TransformNode, w: number, h: number, d: number, x: number, y: number, z: number, mat: PBRMaterial) => {
      const m = beveledBox(n, w, h, d, scene);
      m.position.set(x, y, z); m.material = mat; m.parent = parent; m.isPickable = false; m.receiveShadows = true;
      this.meshes.push(m);
      return m;
    };

    this.hips = node("hips", this.root, 0, 0.95, 0);
    box("pelvis", this.hips, 0.34, 0.16, 0.2, 0, -0.02, 0, M.cloth);
    this.torso = node("torso", this.hips, 0, 0.06, 0);
    box("chest", this.torso, 0.42, 0.5, 0.24, 0, 0.3, 0, M.cloth);
    box("vest", this.torso, 0.44, 0.34, 0.27, 0, 0.3, 0, M.vest);
    box("panel", this.torso, 0.18, 0.12, 0.02, 0.09, 0.4, 0.145, M.accent);
    box("shoulderL", this.torso, 0.12, 0.1, 0.22, -0.26, 0.5, 0, M.vest);
    box("shoulderR", this.torso, 0.12, 0.1, 0.22, 0.26, 0.5, 0, M.vest);
    this.head = node("head", this.torso, 0, 0.62, 0);
    box("skull", this.head, 0.22, 0.24, 0.24, 0, 0.12, 0, M.skin);
    this.capParts.push(box("cap", this.head, 0.24, 0.07, 0.26, 0, 0.24, 0.01, M.cloth));
    this.capParts.push(box("visor", this.head, 0.22, 0.02, 0.1, 0, 0.21, 0.17, M.cloth));
    // Shaved (drop D): a stubbled skull a hair larger than the skin one so it wins the depth test
    // where they overlap, reaching up to where the cap's crown used to sit. Hidden until `shaved`.
    this.bareHead = box("bare_head", this.head, 0.226, 0.25, 0.246, 0, 0.13, 0, M.stubble);
    this.bareHead.setEnabled(false);
    box("neck", this.head, 0.1, 0.08, 0.1, 0, -0.02, 0, M.skin);
    box("goggle_frame", this.head, 0.238, 0.075, 0.045, 0, 0.155, 0.117, M.boots);
    box("goggle_lens", this.head, 0.198, 0.039, 0.018, 0, 0.16, 0.145, M.accent);
    box("face_mask", this.head, 0.19, 0.075, 0.055, 0, 0.068, 0.115, M.cloth);
    box("headset", this.head, 0.04, 0.085, 0.09, 0.125, 0.15, 0, M.boots);
    box("apron", this.torso, 0.31, 0.19, 0.025, 0, 0.035, 0.13, M.vest);
    box("back_team_panel", this.torso, 0.32, 0.17, 0.02, 0, 0.37, -0.145, M.accent);
    box("chest_team_stripe", this.torso, 0.37, 0.055, 0.02, 0, 0.48, 0.145, M.accent);
    for (const x of [-0.13, 0, 0.13]) {
      box("ammo_pouch", this.torso, 0.1, 0.13, 0.065, x, 0.24, 0.155, M.boots);
      box("pouch_buckle", this.torso, 0.028, 0.02, 0.014, x, 0.28, 0.193, M.vest);
    }
    this.perkBand = box("perkBand", this.head, 0.25, 0.03, 0.27, 0, 0.215, 0.01, M.accent);
    this.perkBand.setEnabled(false);
    // The charge on the carrier's back: an olive pack with a red blinking cell, straps over the vest.
    this.bombPack.push(box("bomb_pack", this.torso, 0.3, 0.34, 0.16, 0, 0.3, -0.23, M.boots));
    this.bombPack.push(box("bomb_cell", this.torso, 0.1, 0.06, 0.03, 0.06, 0.4, -0.32, M.accent));
    for (const x of [-0.11, 0.11]) this.bombPack.push(box("bomb_strap", this.torso, 0.04, 0.4, 0.3, x, 0.32, -0.02, M.vest));
    for (const m of this.bombPack) m.setEnabled(false);

    this.armR = node("armR", this.torso, 0.3, 0.48, 0);
    box("upperR", this.armR, 0.11, 0.3, 0.11, 0, -0.15, 0, M.cloth);
    box("bandR", this.armR, 0.125, 0.06, 0.125, 0, -0.1, 0, M.accent);
    this.forearmR = node("forearmR", this.armR, 0, -0.3, 0);
    box("lowerR", this.forearmR, 0.09, 0.28, 0.09, 0, -0.14, 0, M.skin);
    box("handR", this.forearmR, 0.08, 0.08, 0.1, 0, -0.3, 0.02, M.boots);
    // The weapon hangs off the torso (not the hand chain) so it always points where the player aims;
    // the arms are posed to reach it approximately — at gameplay distances that reads correctly.
    this.gunHand = node("gunHand", this.torso, 0.16, 0.36, 0.16);

    this.armL = node("armL", this.torso, -0.3, 0.48, 0);
    box("upperL", this.armL, 0.11, 0.3, 0.11, 0, -0.15, 0, M.cloth);
    this.forearmL = node("forearmL", this.armL, 0, -0.3, 0);
    box("lowerL", this.forearmL, 0.09, 0.28, 0.09, 0, -0.14, 0, M.skin);
    box("handL", this.forearmL, 0.08, 0.08, 0.1, 0, -0.3, 0.02, M.boots);

    this.legR = node("legR", this.hips, 0.1, -0.05, 0);
    box("thighR", this.legR, 0.15, 0.42, 0.16, 0, -0.21, 0, M.cloth);
    this.shinR = node("shinR", this.legR, 0, -0.44, 0);
    box("calfR", this.shinR, 0.13, 0.4, 0.14, 0, -0.2, 0, M.cloth);
    box("bootR", this.shinR, 0.14, 0.1, 0.26, 0, -0.42, 0.04, M.boots);
    this.legL = node("legL", this.hips, -0.1, -0.05, 0);
    box("thighL", this.legL, 0.15, 0.42, 0.16, 0, -0.21, 0, M.cloth);
    this.shinL = node("shinL", this.legL, 0, -0.44, 0);
    box("calfL", this.shinL, 0.13, 0.4, 0.14, 0, -0.2, 0, M.cloth);
    box("bootL", this.shinL, 0.14, 0.1, 0.26, 0, -0.42, 0.04, M.boots);
    for (const shin of [this.shinL, this.shinR]) box("knee_pad", shin, 0.145, 0.14, 0.065, 0, -0.045, 0.08, M.vest);

    // Merge only within a joint and material, retaining articulation and the toggled perk band,
    // bomb pack, cap and bare head. Added clothing detail therefore does not add a draw call for
    // every pouch or buckle.
    const groups = new Map<TransformNode, Map<PBRMaterial, Mesh[]>>();
    for (const m of this.meshes) {
      if (m === this.perkBand || m === this.bareHead || this.bombPack.includes(m) || this.capParts.includes(m)) continue;
      const parent = m.parent as TransformNode, mat = m.material as PBRMaterial;
      const materials = groups.get(parent) ?? new Map<PBRMaterial, Mesh[]>();
      const meshes = materials.get(mat) ?? []; meshes.push(m);
      materials.set(mat, meshes); groups.set(parent, materials);
    }
    this.meshes = [this.perkBand, this.bareHead, ...this.bombPack, ...this.capParts];
    for (const [parent, materials] of groups) for (const [mat, meshes] of materials) {
      // Merge in joint-local space; the joint's world transform must not be baked twice.
      for (const m of meshes) { m.parent = null; m.computeWorldMatrix(true); }
      const merged = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true)!;
      merged.parent = parent; merged.material = mat; merged.isPickable = false; merged.receiveShadows = true;
      this.meshes.push(merged);
    }

    this.ensureWeapon(this.currentWeapon);
  }

  /** Build only weapons this player actually equips, instead of all eleven for every bot. */
  private ensureWeapon(id: WeaponId): void {
    if (this.weapons.has(id)) return;
    const model = buildWeaponModel(id, this.weaponMaterials, this.scene, `tp_${this.root.name}_${id}`);
    model.root.parent = this.gunHand;
    model.root.position.set(0, -0.02, 0.05);
    model.root.scaling.setAll(0.95);
    forEachMesh(model, (m) => { m.isPickable = false; m.receiveShadows = true; m.visibility = this.fade; this.meshes.push(m); });
    model.root.setEnabled(id === this.currentWeapon);
    this.weapons.set(id, model);
  }

  get allMeshes(): Mesh[] { return this.meshes; }

  /** World-space muzzle position of the held weapon. */
  muzzle(out: Vector3): Vector3 {
    const m = this.weapons.get(this.currentWeapon)!.muzzle;
    m.computeWorldMatrix(true);
    out.copyFrom(m.getAbsolutePosition());
    return out;
  }

  onFire(): void { this.kick = 1; }

  /** Overhand throw: the right arm winds back, swings over and the gun dips (drop 2). */
  throw(): void { this.throwT = 1; }
  private throwT = 0;         // 1 → 0 over ~0.6 s

  /**
   * Hit reaction. `fromX/fromZ`: world-space direction from this character towards the shooter
   * (need not be normalised). The body snaps away from the shot; head shots snap the head harder.
   */
  flinch(fromX: number, fromZ: number, head = false): void {
    const len = Math.hypot(fromX, fromZ) || 1;
    // World → local (root yaw): local +Z is the facing direction.
    const yaw = this.root.rotation.y;
    const wx = fromX / len, wz = fromZ / len;
    this.flinchX = wx * Math.cos(yaw) - wz * Math.sin(yaw);
    this.flinchZ = wx * Math.sin(yaw) + wz * Math.cos(yaw);
    this.flinchAmt = head ? 1 : 0.6;
    this.flinchT = 1;
  }

  /** Starts the death collapse. `fromX/fromZ`: direction towards the killer (falls the other way). */
  die(fromX = 0, fromZ = 0): void {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    const len = Math.hypot(fromX, fromZ);
    // Fall away from the shot; with no direction, fall forward-ish with a random side component.
    this.deathDir = len > 0.01 ? Math.atan2(-fromX / len, -fromZ / len) : this.root.rotation.y + (Math.random() - 0.5) * 1.2;
    this.deathSpin = Math.random() < 0.5 ? -1 : 1;
  }

  revive(): void {
    this.deathT = -1; this.fade = 0;
    this.root.rotation.x = 0; this.root.rotation.z = 0;
    this.hips.position.y = 0.95; this.hips.rotation.set(0, 0, 0);
    this.flinchT = 0; this.landSquash = 0; this.airTime = 0;
  }

  /** Current joint angles (for tests and the animation tool). */
  pose(): Pose {
    return {
      hipsY: this.hips.rotation.y, torsoX: this.torso.rotation.x, torsoY: this.torso.rotation.y,
      headX: this.head.rotation.x, headY: this.head.rotation.y,
      legR: this.legR.rotation.x, legL: this.legL.rotation.x, shinR: this.shinR.rotation.x, shinL: this.shinL.rotation.x,
      armR: this.armR.rotation.x, armL: this.armL.rotation.x, rootZ: this.root.rotation.z, rootX: this.root.rotation.x,
    };
  }

  get dying(): boolean { return this.deathT >= 0; }

  update(inp: CharacterInput, dtMs: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.time += dt;
    if (inp.weapon !== this.currentWeapon) {
      this.ensureWeapon(inp.weapon);
      this.weapons.get(this.currentWeapon)?.root.setEnabled(false);
      this.currentWeapon = inp.weapon;
      this.weapons.get(inp.weapon)!.root.setEnabled(true);
    }
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt * 3); for (const m of this.meshes) m.visibility = this.fade; }
    const perked = !!inp.perked && inp.alive;
    if (this.perkBand.isEnabled() !== perked) this.perkBand.setEnabled(perked);
    const bomb = !!inp.bomb && inp.alive;
    if (this.bombPack[0] && this.bombPack[0].isEnabled() !== bomb) for (const m of this.bombPack) m.setEnabled(bomb);
    // Shaved (drop D) is not gated on `alive`: the shaved head stays on the body that fell.
    const shaved = !!inp.shaved;
    if (this.bareHead.isEnabled() !== shaved) { this.bareHead.setEnabled(shaved); for (const m of this.capParts) m.setEnabled(!shaved); }

    // ---- Death: buckle (0–0.25) → fall away from the killer with a tumble (0.25–0.8) → settle.
    if (this.deathT >= 0) {
      this.deathT = Math.min(1, this.deathT + dtMs / DEATH_MS);
      const t = this.deathT;
      const buckle = Math.min(1, t / 0.25);
      const fall = t < 0.25 ? 0 : Math.min(1, (t - 0.25) / 0.55);
      const ef = 1 - (1 - fall) * (1 - fall);                       // ease-out fall
      const settle = t > 0.8 ? Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.06 : 0; // small bounce
      // Fall axis: rotate the whole body about the horizontal axis perpendicular to the fall direction.
      const rel = this.deathDir - this.root.rotation.y;             // fall direction in local yaw
      this.root.rotation.x = Math.cos(rel) * (1.5 * ef - settle);   // forward (+Z) fall tips over +X axis
      this.root.rotation.z = -Math.sin(rel) * (1.5 * ef - settle);
      this.hips.position.y = 0.95 - 0.45 * buckle - 0.35 * ef;
      this.hips.rotation.y = this.deathSpin * 0.6 * ef;
      this.torso.rotation.x = 0.35 * buckle + 0.25 * ef;
      this.torso.rotation.y = this.deathSpin * 0.25 * ef;
      this.head.rotation.x = 0.5 * buckle - 0.2 * ef;
      this.armR.rotation.x = -0.9 + 0.8 * ef; this.armL.rotation.x = -1.0 + 1.5 * ef;
      this.armR.rotation.y = -0.2 - 0.5 * ef; this.armL.rotation.y = 0.5 + 0.4 * ef;
      this.legR.rotation.x = 1.1 * buckle - 0.5 * ef; this.legL.rotation.x = 0.9 * buckle - 0.1 * ef;
      this.shinR.rotation.x = 1.6 * buckle - 0.9 * ef; this.shinL.rotation.x = 1.4 * buckle - 0.6 * ef;
      this.gunHand.rotation.x = 0.8 * ef;
      return;
    }

    const k = Math.min(1, dt * 10);
    this.blendCrouch += ((inp.crouch ? 1 : 0) - this.blendCrouch) * k;
    this.blendSlide += ((inp.slide ? 1 : 0) - this.blendSlide) * Math.min(1, dt * 14);
    this.blendLean += ((inp.lean ?? 0) - this.blendLean) * k;
    this.blendTac += ((inp.tac ? 1 : 0) - this.blendTac) * k;
    const leanB = this.blendLean, tacB = this.blendTac;
    const wasAir = this.blendAir > 0.5;
    this.blendAir += ((inp.grounded ? 0 : 1) - this.blendAir) * k;
    if (!inp.grounded) this.airTime += dt;
    else if (wasAir || this.airTime > 0) { this.landSquash = Math.min(1, 0.35 + this.airTime * 1.2); this.airTime = 0; }
    this.landSquash *= Math.exp(-dt * 9);
    const runTarget = Math.min(1, Math.max(0, (inp.speed - 0.3) / 3.5));
    this.blendRun += (runTarget - this.blendRun) * k;
    const sprint = Math.max(0, Math.min(1, (inp.speed - 5.6) / 2));
    this.kick *= Math.exp(-dt * 16);
    this.reloadPhase = inp.reloading ? Math.min(1, this.reloadPhase + dt * 1.4) : Math.max(0, this.reloadPhase - dt * 4);
    this.flinchT *= Math.exp(-dt * 7);
    const fl = this.flinchT * this.flinchAmt;
    // Throw: wind-up (1 → 0.65), swing (0.65 → 0.35), recover. `thr` = arm-back, `swing` = arm-forward.
    this.throwT = Math.max(0, this.throwT - dt * 1.7);
    const tt = this.throwT;
    const thr = tt > 0.65 ? (1 - tt) / 0.35 : tt > 0.35 ? (tt - 0.35) / 0.3 : 0;
    const thrSwing = tt > 0.65 ? 0 : tt > 0.35 ? 1 - (tt - 0.35) / 0.3 : tt / 0.35;

    // Turn lean: yaw rate (rad/s) → roll into the turn, smoothed.
    let dyaw = this.root.rotation.y - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2; if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.lastYaw = this.root.rotation.y;
    const yawRate = dt > 0 ? dyaw / dt : 0;
    this.turnLean += (Math.max(-0.14, Math.min(0.14, -yawRate * 0.05)) - this.turnLean) * Math.min(1, dt * 8);

    // Locomotion cycle: stride frequency from speed.
    const freq = inp.crouch ? 5.5 : 4.4 + inp.speed * 0.7;
    if (inp.grounded && inp.speed > 0.3) this.phase += dt * freq; else this.phase += dt * 1.5 * this.blendAir;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const run = this.blendRun * (1 - this.blendAir);
    const cr = this.blendCrouch, sl = this.blendSlide;
    const idle = (1 - run) * (1 - this.blendAir);
    const shift = Math.sin(this.time * 0.9) * idle;       // slow weight shift
    const breathe = Math.sin(this.time * 1.6) * idle;

    // Hips: crouch lowers, running bounces, landing squashes; lean into strafes and turns.
    const bounce = Math.abs(c) * 0.03 * run;
    this.hips.position.y = 0.95 - 0.38 * cr + bounce - 0.05 * this.blendAir - 0.16 * this.landSquash + 0.006 * shift - 0.1 * sl;
    const strafe = Math.sin(inp.moveDir);
    this.root.rotation.z = -strafe * 0.08 * run + this.turnLean * (0.4 + 0.6 * run) + 0.02 * shift * (1 - run);
    this.root.rotation.x = 0;
    this.hips.rotation.y = s * 0.12 * run;
    this.hips.rotation.z = -0.03 * shift * (1 - run);
    // Torso: lean with speed/crouch/pitch, twist against the hips, flinch snaps it away from the hit.
    this.torso.rotation.x = 0.12 * run + 0.35 * cr + inp.pitch * 0.5 + 0.18 * sprint + 0.1 * this.landSquash + 0.012 * breathe
      + fl * (0.35 * this.flinchZ);
    this.torso.rotation.y = -this.hips.rotation.y * 0.6 + fl * 0.3 * this.flinchX;
    // Lean (drop 4): the torso tips sideways (negative Z = towards +X = the character's right) and the
    // hips shift a little the other way, so the feet stay planted and the head moves ~0.45 m.
    this.torso.rotation.z = -fl * 0.25 * this.flinchX - 0.42 * leanB;
    this.torso.rotation.x += 0.12 * tacB - 0.5 * sl;
    this.hips.position.x = -0.05 * leanB;
    this.head.rotation.x = inp.pitch * 0.45 - 0.2 * cr + fl * 0.5 * this.flinchZ + 0.3 * sl;
    this.head.rotation.y = fl * 0.55 * this.flinchX;
    this.head.rotation.z = -0.12 * leanB;
    // Legs: alternating swing; airborne = tucked; landing = knees bend.
    const swing = 0.75 * run * (1 + 0.5 * sprint);
    // Slide: the right leg shoots out straight ahead, the left folds under, the torso lies back.
    this.legR.rotation.x = s * swing - 0.9 * cr + 0.5 * this.blendAir - 0.4 * this.landSquash - 0.55 * sl;
    this.legL.rotation.x = -s * swing - 0.9 * cr - 0.2 * this.blendAir - 0.4 * this.landSquash + 0.25 * sl;
    this.shinR.rotation.x = Math.max(0, -c) * 1.1 * run + 1.0 * cr + 0.6 * this.blendAir + 0.8 * this.landSquash - 0.95 * sl;
    this.shinL.rotation.x = Math.max(0, c) * 1.1 * run + 1.0 * cr + 0.9 * this.blendAir + 0.8 * this.landSquash + 0.5 * sl;
    // Arms: weapon held two-handed; counter-swing with the stride; kick on fire; reload = left hand down; flinch tightens.
    const aim = inp.pitch;
    const idleSway = Math.sin(this.time * 1.3) * 0.02;
    const armSwing = s * 0.08 * run;
    const throwing = Math.max(thr, thrSwing);
    // Per-slot holds (look pass): a sidearm is held one-handed at arm's length, the clippers low and
    // forward with a big right-arm swing on use, long guns two-handed as before.
    const slot = WEAPONS[this.currentWeapon].slot;
    const oneHand = slot === 2 ? 1 : 0, melee = slot === 3 ? 1 : 0;
    const swingR = melee * this.kick;
    // Tactical sprint: the gun comes up across the chest, muzzle high — readable from across the map.
    this.gunHand.rotation.x = aim * 0.5 - this.kick * 0.12 + 0.45 * sprint + 0.55 * tacB + armSwing * 0.5 + fl * 0.2 + 0.6 * throwing + 0.25 * melee - 0.9 * swingR;
    this.gunHand.rotation.y = -0.08 + armSwing * 0.3 - 0.3 * throwing + 0.12 * oneHand - 0.4 * swingR;
    this.gunHand.rotation.z = -0.35 * swingR;
    this.gunHand.position.z = 0.16 - this.kick * 0.05 - 0.08 * throwing + 0.05 * oneHand + 0.08 * swingR;
    this.gunHand.position.x = 0.16 + 0.04 * oneHand + 0.02 * melee;
    this.gunHand.position.y = 0.36 + 0.02 * oneHand - 0.08 * melee;
    // Throw: the right arm goes back over the shoulder, then whips forward past horizontal.
    this.armR.rotation.x = -1.15 - aim * 0.25 - this.kick * 0.2 + idleSway + 0.35 * sprint - 0.35 * tacB + armSwing + fl * 0.25 - 1.6 * thr + 0.9 * thrSwing
      - 0.25 * oneHand + 0.35 * melee - 0.9 * swingR;
    this.armR.rotation.y = -0.35 - 0.3 * thr + 0.15 * oneHand - 0.5 * swingR;
    this.forearmR.rotation.x = -0.5 + this.kick * 0.15 + 0.2 * sprint - 1.2 * thr + 0.3 * thrSwing + 0.3 * oneHand - 0.2 * melee - 0.5 * swingR;
    this.torso.rotation.y += -0.25 * thr + 0.2 * thrSwing - 0.3 * swingR;
    this.torso.rotation.x += 0.15 * thrSwing + 0.1 * swingR;
    const rl = Math.sin(this.reloadPhase * Math.PI);
    // Left arm: on the handguard for long guns; hanging half-bent for a sidearm; guarding for the clippers.
    const off = Math.max(oneHand, melee);
    this.armL.rotation.x = (-1.3 - aim * 0.25 + idleSway + 1.0 * rl + 0.2 * sprint + armSwing * 0.8 + fl * 0.25) * (1 - off) + (-0.45 + idleSway + 1.0 * rl - 0.3 * melee) * off;
    this.armL.rotation.y = (0.75 - 0.5 * rl) * (1 - off) + 0.15 * off;
    this.forearmL.rotation.x = (-0.75 + 0.6 * rl + 0.2 * sprint) * (1 - off) + (-0.9 + 0.6 * rl) * off;
  }

  setEnabled(v: boolean): void { this.root.setEnabled(v); }

  dispose(): void {
    // Team clothing and weapon materials are shared by every body in this scene.
    this.root.dispose(false, false);
  }
}

export const CHARACTER_EYE = PLAYER.eyeHeight;
