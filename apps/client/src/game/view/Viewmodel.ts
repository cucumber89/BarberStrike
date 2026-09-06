import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { GRENADE_ORDER, WEAPONS, WEAPON_ORDER, makeRayHit, type CollisionWorld, type GrenadeId, type WeaponId } from "@frankibarber/shared";
import type { LocalPlayer } from "../player/LocalPlayer";
import { buildWeaponModel, createWeaponMaterials, forEachMesh, type WeaponMaterials, type WeaponModel } from "./weaponMeshes";
import type { WeaponModelLibrary } from "./weaponModels";
import { beveledBox } from "./geometry";

/** Gap between background weapon upgrades: enough frames for the game to stay responsive. */
const UPGRADE_GAP_MS = 400;

/** Throw swing length (ms): matches Throwing.THROW_WINDUP_MS so the grenade appears as the hand opens. */
const THROW_SWING_MS = 180;
/** Gun comes back up over this long after a throw. */
const THROW_RECOVER_MS = 320;
/** Inspect (F): the gun is turned to show both sides, then settles. */
const INSPECT_MS = 2400;
const wallHit = makeRayHit();
const camFwd = new Vector3();

/** Rendering group for the first-person layer: depth is cleared before it, so the gun never clips walls. */
export const VIEWMODEL_GROUP = 1;

type Pose = "idle" | "sprint" | "ads";

interface Sway { x: number; y: number; vx: number; vy: number }

/** Pure reload choreography (0..1 progress → offsets), unit-tested in Viewmodel.test.ts. */
export interface ReloadFrame {
  /** Gun body offset/rotation (camera-local metres / radians). */
  y: number; rx: number; rz: number; x: number;
  /** Magazine drop (0 = seated, 1 = fully out) for detachable mags. */
  mag: number;
  /** Action part travel (0 = forward/closed, 1 = fully back/open). */
  action: number;
  /** Left hand: 0 = on the handguard, 1 = down at the mag / shell pouch. */
  handL: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
const ramp = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

/**
 * Per-weapon reload timelines. Each is a function of normalised progress, so a weapon's
 * `reloadMs` stretches the same choreography; the shapes were tuned so the loud beats (mag out,
 * mag seat, bolt/slide/pump) line up with the audio module's reload cues.
 */
export function reloadFrame(weapon: WeaponId, t: number, shells = 6): ReloadFrame {
  const f: ReloadFrame = { y: 0, rx: 0, rz: 0, x: 0, mag: 0, action: 0, handL: 0 };
  switch (weapon) {
    case "pistol": {
      // Tilt in, mag drops, new mag slams, slide is released at the end.
      const tilt = bump(t, 0.05, 0.9);
      f.y = -0.04 * tilt; f.rx = 0.25 * tilt; f.rz = -0.55 * tilt; f.x = -0.02 * tilt;
      f.mag = t < 0.15 ? 0 : t < 0.35 ? smooth(ramp(t, 0.15, 0.35)) : t < 0.55 ? 1 : 1 - smooth(ramp(t, 0.55, 0.75));
      f.action = t < 0.8 ? 1 : 1 - smooth(ramp(t, 0.8, 0.9)); // slide locked back until the release
      f.handL = bump(t, 0.1, 0.85);
      break;
    }
    case "smg":
    case "rifle": {
      // Cant the gun over, rock the mag out, seat the new one, tug the charging handle.
      const tilt = bump(t, 0.05, 0.92);
      f.y = -0.06 * tilt; f.rx = 0.3 * tilt; f.rz = -0.45 * tilt; f.x = -0.03 * tilt;
      f.mag = t < 0.12 ? 0 : t < 0.38 ? smooth(ramp(t, 0.12, 0.38)) : t < 0.52 ? 1 : 1 - smooth(ramp(t, 0.52, 0.78));
      const seat = bump(t, 0.72, 0.82);
      f.y -= 0.02 * seat; // the slam
      f.action = bump(t, 0.84, 0.98);
      f.handL = t < 0.84 ? bump(t, 0.08, 0.84) : bump(t, 0.84, 0.98) * 0.6;
      break;
    }
    case "shotgun": {
      // Shell by shell: the gun rolls to show the loading port; the hand pumps once at the end.
      const roll = bump(t, 0.04, 0.9);
      f.y = -0.05 * roll; f.rx = 0.2 * roll; f.rz = 0.7 * roll; f.x = 0.02 * roll;
      const per = 0.82 / shells;
      const i = Math.min(shells - 1, Math.floor(ramp(t, 0.06, 0.88) * shells));
      const local = (t - 0.06 - i * per) / per;
      f.handL = t < 0.06 || t > 0.88 ? 0 : 0.5 + 0.5 * Math.sin(Math.max(0, Math.min(1, local)) * Math.PI);
      f.y -= 0.012 * bump(local, 0.4, 0.7);
      f.action = bump(t, 0.9, 1.0);
      break;
    }
    case "dmr":
    case "sniper": {
      // Mag swap, then the bolt: back (chamber) and forward.
      const tilt = bump(t, 0.05, 0.9);
      f.y = -0.05 * tilt; f.rx = 0.28 * tilt; f.rz = -0.4 * tilt; f.x = -0.03 * tilt;
      f.mag = t < 0.1 ? 0 : t < 0.35 ? smooth(ramp(t, 0.1, 0.35)) : t < 0.48 ? 1 : 1 - smooth(ramp(t, 0.48, 0.7));
      f.action = t < 0.74 ? 0 : t < 0.84 ? smooth(ramp(t, 0.74, 0.84)) : 1 - smooth(ramp(t, 0.84, 0.96));
      f.handL = t < 0.72 ? bump(t, 0.06, 0.72) : bump(t, 0.72, 0.98) * 0.7;
      break;
    }
    case "revolver": {
      // Swing out, dump the brass, feed one by one, snap shut (roll the gun to show the cylinder).
      const roll = bump(t, 0.04, 0.92);
      f.y = -0.04 * roll; f.rx = 0.3 * roll; f.rz = -0.9 * roll; f.x = -0.03 * roll;
      const per = 0.5 / shells;
      const i = Math.min(shells - 1, Math.floor(ramp(t, 0.3, 0.8) * shells));
      const local = (t - 0.3 - i * per) / per;
      f.handL = t < 0.12 ? 0 : t < 0.3 ? smooth(ramp(t, 0.12, 0.3)) : t < 0.8 ? 0.6 + 0.4 * Math.sin(Math.max(0, Math.min(1, local)) * Math.PI) : 1 - smooth(ramp(t, 0.8, 0.95));
      f.y -= 0.01 * bump(t, 0.9, 0.98); // the snap shut
      break;
    }
    case "smg2": {
      // Like the SMG but faster hands: mag out early, in by the middle, a quick charge.
      const tilt = bump(t, 0.04, 0.9);
      f.y = -0.05 * tilt; f.rx = 0.28 * tilt; f.rz = -0.5 * tilt; f.x = -0.03 * tilt;
      f.mag = t < 0.08 ? 0 : t < 0.3 ? smooth(ramp(t, 0.08, 0.3)) : t < 0.42 ? 1 : 1 - smooth(ramp(t, 0.42, 0.66));
      f.y -= 0.02 * bump(t, 0.62, 0.72);
      f.action = bump(t, 0.78, 0.94);
      f.handL = t < 0.78 ? bump(t, 0.06, 0.78) : bump(t, 0.78, 0.94) * 0.6;
      break;
    }
    case "lmg": {
      // Feed cover up, belt box off, new box on, belt laid in, cover slammed, charge.
      const tilt = bump(t, 0.03, 0.95);
      f.y = -0.07 * tilt; f.rx = 0.35 * tilt; f.rz = -0.3 * tilt; f.x = -0.04 * tilt;
      f.action = t < 0.08 ? 0 : t < 0.18 ? smooth(ramp(t, 0.08, 0.18)) : t < 0.74 ? 1 : 1 - smooth(ramp(t, 0.74, 0.82));
      f.mag = t < 0.18 ? 0 : t < 0.36 ? smooth(ramp(t, 0.18, 0.36)) : t < 0.5 ? 1 : 1 - smooth(ramp(t, 0.5, 0.68));
      f.y -= 0.02 * bump(t, 0.78, 0.84);
      f.handL = t < 0.86 ? bump(t, 0.05, 0.86) : bump(t, 0.86, 0.98) * 0.6;
      break;
    }
    case "launcher": {
      // Break open (the pump node tips the barrel), shell out, shell in, snap shut.
      const tilt = bump(t, 0.05, 0.9);
      f.y = -0.05 * tilt; f.rx = 0.2 * tilt; f.rz = -0.5 * tilt; f.x = -0.02 * tilt;
      f.action = t < 0.1 ? 0 : t < 0.25 ? smooth(ramp(t, 0.1, 0.25)) : t < 0.7 ? 1 : 1 - smooth(ramp(t, 0.7, 0.85));
      f.handL = bump(t, 0.2, 0.8);
      f.y -= 0.015 * bump(t, 0.84, 0.92);
      break;
    }
    case "clippers": break; // nothing to reload
  }
  return f;
}

/**
 * First-person weapon presentation: procedural weapon + gloved hands parented to the camera.
 * A small time-based state machine blends hip / ADS / sprint poses and layers on breathing,
 * mouse sway, walk bob, fire kick, per-weapon reload choreography, action motion (slide, pump,
 * bolt) and an equip twist. All motion is exponential smoothing on a few scalars.
 */
export class Viewmodel {
  private root: TransformNode;
  private gunPivot: TransformNode;
  private handL: TransformNode | null = null;
  private handLHome = new Vector3();
  private magazineHomes = new Map<WeaponId, number>();
  private models = new Map<WeaponId, WeaponModel>();
  private disposed = false;
  /** Drop 6b: imported guns, and which ids have already had their turn. */
  private modelLib: WeaponModelLibrary | null = null;
  private upgraded = new Set<WeaponId>();
  private mats: WeaponMaterials;
  private handMat: PBRMaterial;
  private current: WeaponId;
  private pos = new Vector3(0, 0, 0);
  private rot = new Vector3(0, 0, 0);
  private sway: Sway = { x: 0, y: 0, vx: 0, vy: 0 };
  private lastYaw = 0;
  private lastPitch = 0;
  private bobPhase = 0;
  private kickBack = 0;
  private kickUp = 0;
  private kickRoll = 0;
  private equipT = 1;
  private equipMs = 300;
  private reloadT = -1;
  private reloadMs = 1000;
  private landDip = 0;
  private jumpLift = 0;
  private time = 0;
  private breathe = 0;
  private actionCycle = 0; // 1 → 0 after a shot (slide/pump/bolt travel)
  private actionPos = 0;
  // ---- grenades (drop 2): the gun drops to the hip while the right hand shows the grenade.
  private grenadeNode!: TransformNode;
  private grenadeModels = new Map<GrenadeId, TransformNode>();
  private grenadeKind: GrenadeId | null = null;
  private grenadeBlend = 0;    // 0 = gun up, 1 = grenade in hand
  private throwT = -1;         // -1 idle; 0..1 swing progress
  private recoverT = 1;        // 0..1 gun coming back after a throw
  private grenadeMat!: StandardMaterial;
  private grenadeMetalMat!: StandardMaterial;
  // ---- drop 3: clippers swing and the scoped hide
  private swingT = 0;          // 1 → 0 over the melee swing
  private visible = true;
  private scopeHidden = false;
  // ---- look pass (1.1): extra motion layers
  private world: CollisionWorld | null = null;
  private wallPush = 0;        // 0..1: the muzzle is up against a wall, the gun is pulled in and tilted up
  private tacBlend = 0;        // 0..1: tactical sprint (drop 4), gun up across the chest
  private vyLag = 0;           // vertical inertia (falling lifts the gun, rising drops it)
  private crouchBlend = 0;
  private adsPrev = 0;
  private adsKick = 0;         // roll/dip bump when the aim transitions
  private empty = false;       // pistol-type slides lock back on an empty mag
  private inspectT = -1;       // -1 idle, 0..1 inspect progress
  private kickZ = 0;           // muzzle "snap" (yaw) per shot

  /** Builds tiny first-person grenade models (matching the world ones in silhouette). */
  private buildGrenades(): void {
    // Camera-local (not under the gun root): the gun drops to the hip while the grenade must stay in view.
    this.grenadeNode = new TransformNode("vm_grenade", this.scene);
    this.grenadeNode.parent = this.camera;
    this.grenadeNode.setEnabled(false);
    this.grenadeMat = new StandardMaterial("vm_grenadeMat", this.scene);
    this.grenadeMat.diffuseColor = new Color3(0.23, 0.29, 0.18); this.grenadeMat.specularColor = new Color3(0.1, 0.1, 0.1);
    this.grenadeMetalMat = new StandardMaterial("vm_grenadeMetal", this.scene);
    this.grenadeMetalMat.diffuseColor = new Color3(0.55, 0.57, 0.6); this.grenadeMetalMat.specularColor = new Color3(0.6, 0.6, 0.6);
    const add = (kind: GrenadeId, parts: Array<{ mesh: import("@babylonjs/core/Meshes/mesh").Mesh; mat: StandardMaterial; y?: number; x?: number; z?: number }>) => {
      const root = new TransformNode(`vm_gr_${kind}`, this.scene);
      root.parent = this.grenadeNode;
      for (const p of parts) {
        p.mesh.material = p.mat; p.mesh.parent = root; p.mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
        p.mesh.renderingGroupId = VIEWMODEL_GROUP; p.mesh.isPickable = false; p.mesh.receiveShadows = false;
      }
      root.setEnabled(false);
      this.grenadeModels.set(kind, root);
    };
    const s = this.scene;
    add("frag", [
      { mesh: MeshBuilder.CreateSphere("vm_fragBody", { diameter: 0.13, segments: 6 }, s), mat: this.grenadeMat },
      { mesh: MeshBuilder.CreateCylinder("vm_fragHead", { diameter: 0.045, height: 0.04, tessellation: 8 }, s), mat: this.grenadeMetalMat, y: 0.075 },
      { mesh: MeshBuilder.CreateBox("vm_fragSpoon", { width: 0.018, height: 0.09, depth: 0.012 }, s), mat: this.grenadeMetalMat, x: 0.028, y: 0.035 },
    ]);
    for (const kind of ["flash", "smoke"] as const) add(kind, [
      { mesh: MeshBuilder.CreateCylinder(`vm_${kind}Body`, { diameter: 0.075, height: 0.15, tessellation: 10 }, s), mat: kind === "flash" ? this.grenadeMetalMat : this.grenadeMat },
      { mesh: MeshBuilder.CreateCylinder(`vm_${kind}Cap`, { diameter: 0.05, height: 0.03, tessellation: 8 }, s), mat: this.grenadeMetalMat, y: 0.088 },
      { mesh: MeshBuilder.CreateBox(`vm_${kind}Lever`, { width: 0.014, height: 0.1, depth: 0.012 }, s), mat: this.grenadeMetalMat, x: 0.036, y: 0.045 },
    ]);
    const glass = new StandardMaterial("vm_glass", s); glass.diffuseColor = new Color3(0.35, 0.55, 0.35); glass.alpha = 0.85;
    const rag = new StandardMaterial("vm_rag", s); rag.emissiveColor = new Color3(1, 0.45, 0.1); rag.disableLighting = true;
    add("molotov", [
      { mesh: MeshBuilder.CreateCylinder("vm_molBody", { diameter: 0.085, height: 0.2, tessellation: 10 }, s), mat: glass },
      { mesh: MeshBuilder.CreateCylinder("vm_molNeck", { diameter: 0.035, height: 0.08, tessellation: 8 }, s), mat: glass, y: 0.14 },
      { mesh: MeshBuilder.CreateBox("vm_molRag", { width: 0.035, height: 0.06, depth: 0.03 }, s), mat: rag, y: 0.19 },
    ]);
    add("knife", [
      { mesh: MeshBuilder.CreateBox("vm_knifeBlade", { width: 0.028, height: 0.006, depth: 0.16 }, s), mat: this.grenadeMetalMat, z: 0.07 },
      { mesh: MeshBuilder.CreateBox("vm_knifeGrip", { width: 0.022, height: 0.016, depth: 0.1 }, s), mat: this.grenadeMat, z: -0.06 },
    ]);
    for (const kind of GRENADE_ORDER) if (!this.grenadeModels.has(kind)) console.warn("[viewmodel] no model for grenade", kind);
  }

  /** Collision world for the wall-push check (the gun is pulled in when the muzzle would clip a wall). */
  setWorld(world: CollisionWorld): void { this.world = world; }
  /** Empty magazine: slide-type actions lock back until the reload. */
  setEmpty(v: boolean): void { this.empty = v; }
  /** F: turn the gun over to admire it. Cancelled by firing, aiming, reloading or switching. */
  inspect(): void { if (this.reloadT < 0 && this.grenadeKind === null && this.local.aimBlend < 0.3) this.inspectT = 0; }

  /** Grenade taken in hand: the gun drops, the grenade rises into view (the frag stays up while cooking). */
  primeGrenade(kind: GrenadeId): void {
    for (const [k, m] of this.grenadeModels) m.setEnabled(k === kind);
    this.grenadeNode.setEnabled(true);
    this.grenadeKind = kind;
    this.throwT = -1;
    this.recoverT = 1;
  }

  /** The throw swing starts; the grenade leaves the hand at the end of the swing. */
  throwGrenade(): void {
    if (this.grenadeKind === null) return;
    this.throwT = 0;
  }

  /** Put the grenade away (death, cancel). */
  cancelGrenade(): void {
    this.grenadeKind = null;
    this.throwT = -1;
    this.grenadeNode.setEnabled(false);
  }

  get holdingGrenade(): boolean { return this.grenadeKind !== null; }

  constructor(private scene: Scene, private camera: TargetCamera, private local: LocalPlayer) {
    this.root = new TransformNode("viewmodel", scene);
    this.root.parent = camera;
    this.gunPivot = new TransformNode("viewmodel_gun", scene);
    this.gunPivot.parent = this.root;
    this.mats = createWeaponMaterials(scene);
    this.handMat = new PBRMaterial("vm_hand", scene);
    // Dark but READABLE gloves (handoff: hands were near-black under the night lights): a worn
    // brown-grey with a faint cool fill so they never vanish into the barrel.
    this.handMat.albedoColor = new Color3(0.2, 0.16, 0.13);
    this.handMat.emissiveColor = new Color3(0.012, 0.013, 0.016);
    this.handMat.roughness = 0.8; this.handMat.metallic = 0;
    this.handMat.maxSimultaneousLights = 4;
    this.handMat.useGLTFLightFalloff = true;
    this.handMat.freeze();
    this.current = local.weapon;
    for (const id of WEAPON_ORDER) this.buildWeapon(id);
    this.buildHands();
    this.buildGrenades();
    this.setWeapon(local.weapon, false);
    scene.setRenderingAutoClearDepthStencil(VIEWMODEL_GROUP, true, true, false);
  }

  private buildWeapon(id: WeaponId): void {
    const model = buildWeaponModel(id, this.mats, this.scene, `vm_${id}`);
    model.root.parent = this.gunPivot;
    forEachMesh(model, (m) => { m.renderingGroupId = VIEWMODEL_GROUP; m.receiveShadows = false; m.isPickable = false; });
    model.root.setEnabled(false);
    this.models.set(id, model);
    this.magazineHomes.set(id, model.magazine?.position.y ?? 0);
  }

  /**
   * Drop 6b: swaps in the imported glTF guns once they have loaded.
   *
   * The procedural weapons are built first and synchronously, so the game is playable from frame one
   * and a model that never arrives (missing file, bad glTF) simply never replaces anything.
   *
   * The ORDER and the pacing matter, and both come from a measurement. Upgrading all eight guns in a
   * tight loop parses and merges eight glTFs on the main thread the moment a match starts: with two
   * clients in a room, a chat message sent three seconds in took over five seconds to appear on the
   * other screen, because that screen was busy. So: the gun actually in your hands is upgraded
   * first, the rest trickle in one at a time with a gap, and switching to a gun that has not had its
   * turn yet pulls it forward.
   */
  async useModels(lib: WeaponModelLibrary): Promise<void> {
    this.modelLib = lib;
    await this.upgradeWeapon(this.current);
    for (const id of WEAPON_ORDER) {
      if (this.disposed) return;
      if (this.upgraded.has(id)) continue;
      await new Promise((r) => window.setTimeout(r, UPGRADE_GAP_MS));
      await this.upgradeWeapon(id);
    }
  }

  /** Replaces one procedural gun with its imported model. Safe to call twice; the second is a no-op. */
  private async upgradeWeapon(id: WeaponId): Promise<void> {
    const lib = this.modelLib;
    if (!lib || this.upgraded.has(id) || !lib.has(id)) return;
    this.upgraded.add(id);                     // claim it now: two callers must not both build it
    // Clones, not instances: the viewmodel lives in its own rendering group (see build()).
    const model = await lib.build(id, `vm_${id}`, false);
    // `false, false`: the SECOND flag disposes referenced materials, and these are shared — an
    // imported gun's copies all point at one merged source, and every procedural gun points at the
    // one `WeaponMaterials` set. MEASURED with it on: twelve seconds into a match all eight shared
    // materials were gone and the SHOTGUN — which has no imported model and so was never
    // replaced — was rendering with `material: null`.
    if (!model || this.disposed) { model?.root.dispose(false, false); return; }
    const old = this.models.get(id);
    model.root.parent = this.gunPivot;
    forEachMesh(model, (m) => { m.renderingGroupId = VIEWMODEL_GROUP; m.receiveShadows = false; m.isPickable = false; });
    model.root.setEnabled(false);
    this.models.set(id, model);
    this.magazineHomes.set(id, model.magazine?.position.y ?? 0);
    old?.root.dispose(false, false);   // shared materials: see above
    // The live weapon has just been replaced under the pose solver: re-seat it.
    if (id === this.current) this.setWeapon(id, false);
  }

  private buildHands(): void {
    const mk = (name: string, x: number, y: number, z: number, rx: number, ry: number, rz: number): TransformNode => {
      const pivot = new TransformNode(`${name}_pivot`, this.scene);
      pivot.parent = this.gunPivot;
      pivot.position.set(x, y, z);
      const hand = beveledBox(name, 0.058, 0.04, 0.075, this.scene);
      hand.rotation.set(rx, ry, rz);
      hand.material = this.handMat;
      hand.renderingGroupId = VIEWMODEL_GROUP;
      hand.isPickable = false;
      hand.parent = pivot;
      const arm = beveledBox(`${name}_arm`, 0.062, 0.058, 0.24, this.scene);
      arm.position.set(x > 0 ? 0.02 : -0.01, -0.06, -0.15);
      arm.rotation.set(-0.45 + rx * 0.3, ry * 0.5, rz);
      arm.material = this.handMat;
      arm.renderingGroupId = VIEWMODEL_GROUP;
      arm.isPickable = false;
      arm.parent = pivot;
      return pivot;
    };
    mk("vm_hand_r", 0.0, -0.06, -0.02, 0.25, 0, 0.15);
    this.handL = mk("vm_hand_l", -0.035, -0.005, 0.3, 0.15, 0.35, -0.5);
    this.handLHome.copyFrom(this.handL.position);
  }

  get muzzleNode(): TransformNode { return this.models.get(this.current)!.muzzle; }
  get ejectNode(): TransformNode { return this.models.get(this.current)!.eject; }

  setWeapon(id: WeaponId, animate = true): void {
    // A sidearm is supported at the grip; the old universal 30 cm offset put the left
    // hand beyond its muzzle. Long weapons keep their support under the fore-end.
    const length = this.models.get(id)!.length;
    this.handLHome.set(-0.03, length <= 0.2 ? -0.065 : -0.035,
      length <= 0.2 ? -0.005 : Math.min(0.36, length * 0.52));
    // Pull this gun's upgrade forward: you are about to look at it.
    if (this.modelLib && !this.upgraded.has(id)) void this.upgradeWeapon(id);
    for (const [wid, m] of this.models) m.root.setEnabled(wid === id);
    this.current = id;
    this.reloadT = -1;
    this.actionCycle = 0; this.actionPos = 0;
    const model = this.models.get(id)!;
    if (model.magazine) { model.magazine.position.y = this.magazineHomes.get(id) ?? 0; model.magazine.setEnabled(true); }
    if (model.action) model.action.position.set(0, 0, 0);
    if (animate) { this.equipT = 0; this.equipMs = WEAPONS[id].equipMs; }
    this.inspectT = -1;
  }

  onFire(): void {
    const w = WEAPONS[this.current];
    this.inspectT = -1;
    if (w.kind === "melee") { this.swingT = 1; return; }
    const heavy = w.id === "shotgun" || w.id === "dmr" || w.id === "sniper" || w.id === "launcher" || w.id === "revolver";
    this.kickZ += (Math.random() - 0.5) * (heavy ? 0.05 : 0.02);
    this.kickBack = Math.min(0.09, this.kickBack + (heavy ? 0.06 : w.id === "pistol" ? 0.03 : 0.02));
    this.kickUp = Math.min(0.12, this.kickUp + (heavy ? 0.08 : 0.035));
    this.kickRoll = Math.min(0.08, this.kickRoll + (Math.random() - 0.5) * 0.04);
    this.actionCycle = 1;
  }

  onReload(): void { this.reloadT = 0; this.reloadMs = WEAPONS[this.current].reloadMs; this.inspectT = -1; }
  onReloadEnd(): void {
    this.reloadT = -1;
    const model = this.models.get(this.current)!;
    if (model.magazine) model.magazine.position.y = this.magazineHomes.get(this.current) ?? 0;
    if (model.action) model.action.position.set(0, 0, 0);
  }
  onLanded(impactSpeed: number): void { this.landDip = Math.min(0.06, 0.02 + impactSpeed * 0.004); }
  onJump(): void { this.jumpLift = 0.03; }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.time += dt;
    const local = this.local;
    const b = local.body;
    const w = WEAPONS[this.current];
    const model = this.models.get(this.current)!;
    const speed = Math.hypot(b.vx, b.vz);
    const sprinting = local.isSprinting();
    const ads = local.aimBlend;
    const pose: Pose = ads > 0.5 ? "ads" : sprinting ? "sprint" : "idle";

    // ---- target pose (camera-local: +X right, +Y up, +Z forward)
    // Hip: low and to the right (CoD-style) so the sights never sit on the HUD crosshair —
    // the 1.0 beta playtest reported the front sight covering it. Slight inward yaw and roll.
    let tx = 0.24, ty = -0.26, tz = 0.36, trx = 0.02, try_ = -0.06, trz = 0.06;
    const longGun = model.length > 0.6;
    if (longGun) { tx = 0.22; ty = -0.24; tz = 0.34; }
    // Sprint: the gun swings across the chest, muzzle up and inward (CoD-style), lower than the hip.
    if (pose === "sprint") { tx += 0.02; ty -= 0.09; tz -= 0.07; trx = 0.5; try_ = -0.8; trz = 0.45; }
    // Tactical sprint (drop 4): on top of the sprint pose the gun comes up and in, muzzle high —
    // the "can't shoot right now" tell, the same silhouette remote characters show.
    this.tacBlend += ((local.isTacSprinting() ? 1 : 0) - this.tacBlend) * Math.min(1, dt * 8);
    const tb = this.tacBlend * (1 - ads);
    tx -= 0.05 * tb; ty += 0.02 * tb; tz -= 0.09 * tb; trx += 0.45 * tb; try_ -= 0.3 * tb; trz += 0.35 * tb;
    // Lean (drop 4): the camera rolls with the lean; the gun counter-rolls a little and slides so it
    // stays under the eye instead of swinging out with the head.
    const ln = local.lean * (1 - ads * 0.7);
    tx -= 0.025 * ln; trz -= 0.16 * ln;
    // Crouch: the elbows come in, the gun sits a touch higher and closer.
    this.crouchBlend += ((b.crouching ? 1 : 0) - this.crouchBlend) * Math.min(1, dt * 10);
    const cb = this.crouchBlend * (1 - ads);
    tx -= 0.02 * cb; ty += 0.025 * cb; tz -= 0.03 * cb; trz += 0.05 * cb;
    // Wall push: a muzzle inside a wall reads as a bug; pull the gun in and tilt it up as the wall gets close.
    let wallTarget = 0;
    if (this.world) {
      const cam = this.camera;
      cam.getDirectionToRef(Vector3.Forward(), camFwd);
      const reach = model.length + 0.45;
      const cp = cam.globalPosition;
      this.world.raycast(cp.x, cp.y, cp.z, camFwd.x, camFwd.y, camFwd.z, reach, wallHit);
      // Only WALLS push the gun in: a hit on a floor or a ceiling (looking down at your feet, up at
      // a low roof) must not — the owner reported the view "sitting at a weird angle" while standing
      // and looking around, which was exactly this raycast finding the pavement.
      const wallish = wallHit.hit && Math.abs(wallHit.ny) < 0.5;
      if (wallish) wallTarget = Math.min(1, Math.max(0, 1 - (wallHit.t - 0.25) / (reach - 0.25)));
    }
    this.wallPush += (wallTarget - this.wallPush) * Math.min(1, dt * 9);
    const wp = this.wallPush * (this.grenadeKind ? 0 : 1);
    ty -= 0.16 * wp; tz -= 0.14 * wp; tx -= 0.03 * wp; trx += 0.75 * wp; trz += 0.2 * wp;
    // Vertical inertia: the gun lags the body in the air (falling lifts it, a jump pushes it down).
    const vyTarget = Math.max(-0.035, Math.min(0.035, -b.vy * 0.005)) * (b.grounded ? 0 : 1);
    this.vyLag += (vyTarget - this.vyLag) * Math.min(1, dt * 7);
    // ADS transition bump: a small roll and dip as the sights come up / go down.
    if ((ads > 0.5) !== (this.adsPrev > 0.5)) this.adsKick = ads > 0.5 ? 1 : -0.7;
    this.adsPrev = ads;
    this.adsKick *= Math.exp(-dt * 9);
    // ADS: put the weapon's aim point (front sight / scope axis) exactly on the camera axis at
    // `adsZ` in front of the lens — solved, not eyeballed, so every weapon lines up.
    const [ax, ay, az] = model.aimPoint;
    const adsZ = longGun ? 0.5 : 0.36;
    const adsX = -ax, adsY = -ay, adsRootZ = adsZ - az;
    tx = tx + (adsX - tx) * ads; ty = ty + (adsY - ty) * ads; tz = tz + (adsRootZ - tz) * ads;
    trx *= 1 - ads; try_ *= 1 - ads; trz *= 1 - ads;
    // Even in ADS a wall still pulls the gun in (the sights drop out of line, which is the tell).
    ty -= 0.1 * wp * ads; trx += 0.5 * wp * ads;

    // ---- sway from view rotation
    let dyaw = local.yaw - this.lastYaw; if (dyaw > Math.PI) dyaw -= Math.PI * 2; if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = local.pitch - this.lastPitch;
    this.lastYaw = local.yaw; this.lastPitch = local.pitch;
    const swayScale = (1 - ads * 0.8) * 0.6;
    this.sway.vx += (-dyaw * 1.6 - this.sway.x * 40) * dt * 12 * swayScale;
    this.sway.vy += (dpitch * 1.2 - this.sway.y * 40) * dt * 12 * swayScale;
    this.sway.vx *= Math.exp(-dt * 8); this.sway.vy *= Math.exp(-dt * 8);
    this.sway.x += this.sway.vx * dt; this.sway.y += this.sway.vy * dt;
    this.sway.x = Math.max(-0.05, Math.min(0.05, this.sway.x));
    this.sway.y = Math.max(-0.04, Math.min(0.04, this.sway.y));

    // ---- bob (sprint = bigger figure-of-eight)
    const bobAmt = b.grounded && speed > 0.4 ? Math.min(1, speed / 5) * (1 - ads * 0.85) : 0;
    this.bobPhase += dt * (sprinting ? 12.5 : b.crouching ? 6.5 : 9) * (bobAmt > 0 ? 1 : 0);
    const bobScale = sprinting ? 1.8 : 1;
    const bobX = Math.sin(this.bobPhase) * 0.011 * bobAmt * bobScale;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * -0.012 * bobAmt * bobScale;
    const bobRoll = Math.sin(this.bobPhase) * 0.01 * bobAmt * bobScale;
    this.breathe = Math.sin(this.time * 1.4) * 0.0025 * (1 - ads * 0.5);

    // ---- kicks / dips decay
    const dec = Math.exp(-dt * 14);
    this.kickBack *= dec; this.kickUp *= Math.exp(-dt * 11); this.kickRoll *= dec; this.kickZ *= Math.exp(-dt * 12);
    this.landDip *= Math.exp(-dt * 7);
    this.jumpLift *= Math.exp(-dt * 6);

    // ---- equip: raise from below with a twist that settles
    let equipY = 0, equipRx = 0, equipRz = 0, equipX = 0;
    if (this.equipT < 1) {
      this.equipT = Math.min(1, this.equipT + dtMs / Math.max(80, this.equipMs));
      const e = 1 - this.equipT;
      const settle = Math.sin(this.equipT * Math.PI) * (1 - this.equipT); // a little overshoot as it lands
      equipY = -0.35 * e * e + 0.02 * settle; equipRx = 0.9 * e - 0.12 * settle; equipRz = -0.6 * e * e + 0.08 * settle; equipX = 0.08 * e;
    }
    // ---- inspect (F): roll the gun to show the left side, then the right, then settle.
    let inX = 0, inY = 0, inRx = 0, inRy = 0, inRz = 0;
    if (this.inspectT >= 0) {
      this.inspectT = Math.min(1, this.inspectT + dtMs / INSPECT_MS);
      const t = this.inspectT;
      const left = bump(t, 0.0, 0.5), right = bump(t, 0.45, 1.0);
      inX = -0.06 * left + 0.02 * right; inY = 0.03 * left + 0.05 * right;
      inRy = 1.25 * left - 1.0 * right; inRx = -0.25 * left + 0.35 * right; inRz = 0.5 * left - 0.6 * right;
      if (this.inspectT >= 1 || ads > 0.3 || sprinting) this.inspectT = -1;
    }

    // ---- reload choreography
    let rf: ReloadFrame | null = null;
    if (this.reloadT >= 0) {
      this.reloadT = Math.min(1, this.reloadT + dtMs / this.reloadMs);
      rf = reloadFrame(this.current, this.reloadT, w.magazine);
      if (model.magazine) model.magazine.position.y = (this.magazineHomes.get(this.current) ?? 0) - 0.16 * rf.mag;
      if (this.reloadT >= 1) this.reloadT = -1;
    }

    // ---- action part: shot cycle (slide/pump/bolt) or reload-held position
    let actionTarget = 0;
    if (rf) actionTarget = rf.action;
    else if (this.empty && model.actionKind === "slide") actionTarget = 1; // slide locked back on empty
    else if (this.actionCycle > 0) {
      const kind = model.actionKind;
      const speedK = kind === "slide" ? 30 : kind === "pump" ? 10 : 8;
      this.actionCycle = Math.max(0, this.actionCycle - dt * speedK);
      actionTarget = Math.sin(this.actionCycle * Math.PI);
    }
    this.actionPos += (actionTarget - this.actionPos) * Math.min(1, dt * 40);
    if (model.action) {
      const kind = model.actionKind;
      if (kind === "slide") model.action.position.z = -0.035 * this.actionPos;
      else if (kind === "pump") model.action.position.z = -0.09 * this.actionPos;
      else if (kind === "bolt") { model.action.position.z = -0.06 * this.actionPos; model.action.rotation.z = -1.2 * this.actionPos; }
    }
    // Left hand follows the action during a pump/bolt cycle or goes to the mag during reloads.
    if (this.handL) {
      const home = this.handLHome;
      let hx = home.x, hy = home.y, hz = home.z;
      if (rf) { hx = home.x + 0.02 * rf.handL; hy = home.y - 0.12 * rf.handL; hz = home.z - (longGun ? 0.12 : 0.28) * rf.handL; }
      else if (model.actionKind === "pump") hz = home.z - 0.09 * this.actionPos;
      else if (model.actionKind === "bolt") { hx = home.x + 0.1 * this.actionPos; hy = home.y + 0.05 * this.actionPos; hz = home.z - 0.2 * this.actionPos; }
      this.handL.position.set(hx, hy, hz);
    }

    // ---- grenade in hand: gun drops low-right; the grenade rises, winds back and swings forward.
    let gBlendTarget = 0;
    if (this.grenadeKind !== null) {
      gBlendTarget = 1;
      if (this.throwT >= 0) {
        this.throwT = Math.min(1, this.throwT + dtMs / THROW_SWING_MS);
        if (this.throwT >= 1) { this.grenadeNode.setEnabled(false); this.grenadeKind = null; this.throwT = -1; this.recoverT = 0; }
      }
    }
    if (this.recoverT < 1) this.recoverT = Math.min(1, this.recoverT + dtMs / THROW_RECOVER_MS);
    const gunDown = Math.max(gBlendTarget, 1 - smooth(this.recoverT));
    this.grenadeBlend += (gunDown - this.grenadeBlend) * Math.min(1, dt * 16);
    const gb = this.grenadeBlend;
    if (this.grenadeKind !== null || this.grenadeNode.isEnabled()) {
      // Hand path: raised (idle/cook) → back over the shoulder → forward and open.
      const st = this.throwT < 0 ? 0 : this.throwT;
      const back = st < 0.35 ? smooth(st / 0.35) : 1 - smooth((st - 0.35) / 0.65);
      const fwd = st < 0.35 ? 0 : smooth((st - 0.35) / 0.65);
      const gx = 0.19 + 0.04 * back - 0.02 * fwd, gy = -0.10 + 0.12 * back - 0.08 * fwd, gz = 0.36 - 0.16 * back + 0.32 * fwd;
      const rise = smooth(gb);
      this.grenadeNode.position.set(gx + this.sway.x * 0.6 + bobX, gy - 0.25 * (1 - rise) + this.sway.y * 0.6 + bobY + this.breathe, gz);
      this.grenadeNode.rotation.set(-0.4 - 1.2 * back + 0.9 * fwd, 0.3, 0.25);
      this.grenadeNode.scaling.setAll(this.grenadeKind === "knife" ? 0.9 : 0.62);
    }
    const gunX = 0.10 * gb, gunY = -0.20 * gb, gunRx = 0.55 * gb, gunRz = 0.25 * gb;

    // ---- clippers swing (drop 3): a fast diagonal slash — forward and across, then back.
    let swX = 0, swY = 0, swZ = 0, swRx = 0, swRz = 0;
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 3.2);
      const st = 1 - this.swingT;               // 0 → 1
      const arc = Math.sin(st * Math.PI);        // out and back
      swX = -0.16 * arc; swY = 0.04 * arc; swZ = 0.12 * arc; swRx = 0.5 * arc; swRz = -0.9 * arc;
    }
    // ---- scoped ADS: the scope overlay replaces the gun (drop 3).
    const scopedHide = w.scoped && ads > 0.9;
    if (scopedHide !== this.scopeHidden) { this.scopeHidden = scopedHide; if (this.visible) this.root.setEnabled(!scopedHide); }

    // ---- compose
    const k = Math.min(1, dt * 14);
    const px = tx + this.sway.x + bobX + equipX + gunX + swX + inX + (rf?.x ?? 0) + (Math.random() - 0.5) * 0.0004;
    const py = ty + this.sway.y + bobY + this.breathe + equipY + gunY + swY + inY + this.vyLag - 0.012 * this.adsKick + (rf?.y ?? 0) - this.landDip + this.jumpLift;
    const pz = tz - this.kickBack - 0.05 * gb + swZ;
    this.pos.x += (px - this.pos.x) * k; this.pos.y += (py - this.pos.y) * k; this.pos.z += (pz - this.pos.z) * k;
    const rx = trx - this.kickUp + equipRx + gunRx + swRx + inRx + (rf?.rx ?? 0) + this.sway.y * 1.5 - this.vyLag * 2;
    const ry = try_ + this.sway.x * 1.2 + inRy + this.kickZ;
    const rz = trz + this.kickRoll + equipRz + gunRz + swRz + inRz + (rf?.rz ?? 0) - this.sway.x * 0.6 + bobRoll + 0.07 * this.adsKick;
    this.rot.x += (rx - this.rot.x) * k; this.rot.y += (ry - this.rot.y) * k; this.rot.z += (rz - this.rot.z) * k;
    this.root.position.copyFrom(this.pos);
    this.root.rotation.copyFrom(this.rot);
  }

  setVisible(v: boolean): void { this.visible = v; this.root.setEnabled(v && !this.scopeHidden); if (!v) this.grenadeNode.setEnabled(false); }

  dispose(): void {
    this.disposed = true;
    this.root.dispose(false, true);
    this.grenadeNode.dispose(false, true);
    this.mats.dispose();
    this.handMat.dispose();
    this.grenadeMat.dispose(); this.grenadeMetalMat.dispose();
  }
}
