import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  DEFAULT_BUILD, DEFAULT_OUTFIT, PLAYER, WEAPONS, buildRig, hashString, haircutLook, hidesHair, outfitDef, outfitParts,
  type BuildRig, type HaircutStyle, type OutfitDef, type OutfitRole, type Team, type WeaponId,
} from "@frankibarber/shared";
import { HOLD } from "./characterHold";
import { TEAM_KITS } from "./teamKit";
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
 *
 * Body builds: every dimension below comes from a `BuildRig` (`shared/builds.ts`) rather than from a
 * literal, so the six silhouettes are one table of proportions instead of six constructors. The
 * animation is untouched by the choice — the joints are in the same places, at different distances
 * apart — and so is the hitbox, which the rig cannot reach. `Character.build.test.ts` measures the
 * meshes this file actually creates against the envelope the rig promised.
 */

/**
 * What `RemotePlayer` needs from a third-person body, so the procedural `Character` and the
 * imported `CharacterModel` (drop 6b) are interchangeable. Every member here is called from
 * `RemotePlayer` or from the view modules; nothing else is shared between the two.
 */
export interface CharacterLike {
  applySkins?(skins: Partial<Record<WeaponId, string>>): Promise<void>;
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
  /** Sliding: leaning back on one leg, the other out front. */
  slide?: boolean;
  /**
   * Drop D: a visibly shaved head — the cap comes off and a stubbled skull shows. Ostrzyżeni's
   * shaved side wears it for the round; Drop E's shave reuses the same flag. Read in every mode,
   * and unlike the perk band it stays on a corpse: the shave is the point.
   */
  shaved?: boolean;
  /**
   * Drop E: the raw `PlayerState.haircut` field — `"buzz"` or `"buzz#3"`. The head mesh is rebuilt
   * only when this string changes (equip, and a shave death), never per frame; `shaved` still wins,
   * because a bare scalp has no hair on it.
   */
  haircut?: string;
}

/** Joint angles exposed for tests/tools (radians). */
export interface Pose {
  hipsY: number; torsoX: number; torsoY: number; headX: number; headY: number;
  legR: number; legL: number; shinR: number; shinL: number;
  armR: number; armL: number; rootZ: number; rootX: number;
}

interface SharedMats { skin: PBRMaterial; cloth: PBRMaterial; vest: PBRMaterial; accent: PBRMaterial; trim: PBRMaterial; boots: PBRMaterial; stubble: PBRMaterial; razorburn: PBRMaterial; hair: PBRMaterial; bleach: PBRMaterial; weapons: WeaponMaterials }

/**
 * Materials, shared by every body in a scene wearing the same team AND the same outfit.
 *
 * It used to be keyed by team alone. Outfits repaint five of the roles, so the key is now the pair:
 * twelve players in four outfits build four sets rather than twelve, and two players in the same
 * outfit still share one. Freed with the scene, like before.
 */
const SHARED = new Map<Scene, Map<string, SharedMats>>();

function teamMats(scene: Scene, team: Team, outfit: string = DEFAULT_OUTFIT): SharedMats {
  let byKey = SHARED.get(scene);
  if (!byKey) { byKey = new Map(); SHARED.set(scene, byKey); scene.onDisposeObservable.addOnce(() => SHARED.delete(scene)); }
  const def = outfitDef(outfit);
  const key = `${team}|${def.id}`;
  let m = byKey.get(key);
  if (m) return m;
  const mk = (name: string, hex: string, rough: number, metal = 0, emissive?: string) => {
    const mat = new PBRMaterial(`${name}_t${team}_${def.id}`, scene);
    mat.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    mat.roughness = rough; mat.metallic = metal;
    if (emissive) mat.emissiveColor = Color3.FromHexString(emissive).scale(0.6);
    mat.maxSimultaneousLights = 4;
    mat.useGLTFLightFalloff = true; // same range-limited falloff as the map
    mat.freeze();
    return mat;
  };
  // The palette is data (see teamKit.ts), so a side's look is one table edit and cannot become a
  // geometry change by accident. Roughness/metalness stay per ROLE — a shirt is a shirt whatever
  // colour it is — which is what keeps the two sides reading as the same game.
  const kit = TEAM_KITS[team];
  // An outfit owns five of the six roles and CANNOT own `accent` — `OutfitPalette` has no field for
  // it (`shared/outfits.ts`). That is what keeps two NIETOPERZs on opposite sides of a doorway
  // tellable apart: whatever a player is wearing, the chest panel, the back panel, the badge, the
  // armband and the chest band are their side's colour and nobody else's.
  const p = def.palette;
  m = {
    skin: mk("ch_skin", p?.skin ?? kit.skin, 0.7, 0, "#1b100b"),
    cloth: mk("ch_cloth", p?.cloth ?? kit.cloth, 0.85, 0, "#10151c"),
    vest: mk("ch_vest", p?.vest ?? kit.vest, 0.7, 0.05, "#181b19"),
    accent: mk("ch_accent", kit.accent, 0.45, 0.1, kit.accent),
    trim: mk("ch_trim", p?.trim ?? kit.trim, 0.55, 0, "#141414"),
    boots: mk("ch_boots", p?.boots ?? kit.boots, 0.6, 0, "#090c10"),
    // Drop D: a freshly clipped scalp — matte, with a grey cast over the kit's skin tone, so a
    // shaved head reads as "no hair" at gameplay distance rather than as a bald skin tone. Not a
    // kit colour: a shaved scalp is a scalp whichever side shaved you.
    stubble: mk("ch_stubble", "#8f7a6c", 0.95, 0, "#120d0b"),
    // Drop E: a scalp somebody else clipped, raw from the blade. It is a DIFFERENT tone from Drop D's
    // stubble on purpose, and the difference is the whole mechanic at range: two art reviews found
    // that at 8 m the head is about twelve pixels, where no amount of geometry survives and only
    // COLOUR does. A pale stubbled scalp reads as "bald", which is a look a player might choose; a
    // raw red one reads as "somebody did that to them", which is the thing the shave has to say.
    razorburn: mk("ch_razorburn", "#b05a48", 0.9, 0, "#2a0f0a"),
    // Drop E: the two hair tones. Like the stubble above they are NOT kit colours — a haircut is a
    // haircut whichever side you are on, and reading it off a head is how a player knows who has
    // been done. Dark enough to separate from every kit skin tone, matte so it is not mistaken for
    // a helmet; the bleach is the one look that is meant to be spotted across the map.
    hair: mk("ch_hair", p?.hair ?? "#241c16", 0.92, 0, "#0d0906"),
    bleach: mk("ch_bleach", "#e0cf95", 0.8, 0, "#241f12"),
    weapons: createWeaponMaterials(scene),
  };
  byKey.set(key, m);
  return m;
}

/**
 * Where the stripes down a sleeve or a trouser sit, outermost first.
 *
 * The first one is the body's own piping and never moves — it is the widest geometry on the whole
 * character, so shifting it would change the silhouette an outfit presents. Extra stripes are laid
 * INBOARD at a fixed pitch, which is what makes "two paski" and "three paski" a look rather than a
 * measurement.
 */
const STRIPE_PITCH = 0.026;
function stripeOffsets(outer: number, width: number, count: number): number[] {
  const n = Math.max(1, Math.min(3, Math.floor(count) || 1));
  return Array.from({ length: n }, (_, i) => outer - i * (width + STRIPE_PITCH));
}

const DEATH_MS = 900;

// ------------------------------------------------------------------ Drop E: the hair
//
// Every clump starts SUNK into the skull by `SINK`, so no amount of style data can make hair that
// hovers — the "nothing floats" rule, applied to a head instead of to a prop.
const SINK = 0.01;
/** The skull a `HaircutStyle`'s metres were authored against; a bigger or smaller head scales them. */
const AUTHORED_SKULL_W = 0.22;

/**
 * Head-local landmarks the hair is cut against, read off the head this build actually got.
 *
 * They used to be five constants, which was right while every head was the same head. A build with
 * a bigger skull would have worn a fringe cut for a smaller one — hair floating off the brow at one
 * end of the catalog and buried in the goggles at the other — so they are now derived, and the
 * style's own metres are scaled by the same ratio so a mohawk stays a ridge on any head.
 */
interface HeadCuts { top: number; halfX: number; halfZ: number; browTop: number; bottom: number; crownD: number; scale: number }
const headCuts = (r: BuildRig): HeadCuts => ({
  top: r.skullY + r.skullH / 2,
  halfX: r.skullW / 2,
  halfZ: r.skullD / 2,
  // The top edge of the goggle frame, from the same expression the constructor places it with.
  browTop: r.skullY + r.skullH * (.035 / .24) + .075 / 2,
  bottom: r.skullY - r.skullH / 2,
  crownD: r.skullD + .004,
  scale: r.skullW / AUTHORED_SKULL_W,
});

/**
 * The boxes one `HaircutStyle` asks for, in head-local space, unparented and ready to be merged.
 *
 * Cosmetic only (L1): every clump lives inside the volume the cap already occupied, so a haircut
 * never changes the silhouette a shooter reads — and it could not change how a player is hit in any
 * case, since the hitbox is the shared AABB and nothing here touches it.
 */
function hairParts(style: HaircutStyle, scene: Scene, cuts: HeadCuts): Mesh[] {
  const parts: Mesh[] = [];
  const add = (n: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = beveledBox(n, w, h, d, scene); m.position.set(x, y, z); parts.push(m);
  };
  const k = cuts.scale;
  const base = cuts.top - SINK;
  if (style.crown > 0) {
    const h = style.crown * k + SINK, y = base + h / 2;
    const w = style.width * k;
    if (style.track > 0) {
      // The clipper track is mown front-to-back THROUGH the crown: one slab becomes two ridges with
      // a bald strip of exactly `track` metres between them. A wide track leaves two thin ridges and
      // scalp down the middle — that is what a ruined head looks like from above and from the side.
      const track = style.track * k;
      const ridge = Math.max(0.01, (w - track) / 2);
      for (const s of [-1, 1]) add("hair_ridge", ridge, h, cuts.crownD, s * (track + ridge) / 2, y, 0);
    } else add("hair_crown", w, h, cuts.crownD, 0, y, 0);
  }
  if (style.sides > 0) {
    // Left, right and back, from ear height to the crown. It stops a quarter of the way up the skull
    // rather than at its bottom so hair can never hang past the neck into the collar.
    const sides = style.sides * k;
    const bottom = cuts.bottom + (cuts.top - cuts.bottom) * 0.25;
    const h = cuts.top - bottom, y = bottom + h / 2, t = sides + SINK;
    for (const s of [-1, 1]) add("hair_side", t, h, cuts.halfZ * 2, s * (cuts.halfX + sides / 2 - SINK / 2), y, 0);
    add("hair_back", cuts.halfX * 2, h, t, 0, y, -(cuts.halfZ + sides / 2 - SINK / 2));
  }
  if (style.fringe > 0) {
    // Hangs off the front of the crown, forward of the skull's +Z face, and stops just ABOVE the
    // goggle frame: a fringe that reached the brow would bury the goggles, and the goggles are how
    // a head reads at gameplay range.
    const top = cuts.top + 0.005, bottom = cuts.browTop + 0.004, d = style.fringe * k + SINK;
    add("hair_fringe", cuts.halfX * 2 - 0.004, top - bottom, d, 0, (top + bottom) / 2, cuts.halfZ - SINK + d / 2);
  }
  if (style.tuft > 0) {
    // The one clump the clippers missed: off-centre, and taller than the crown, so on a shaved head
    // it is the thing sticking out of the silhouette.
    // A wide clump lies FLAT and lopsided across the scalp (hair the clippers went round); a narrow
    // one stands up (the bun of a topknot). A tall narrow block on a bald head reads as an antenna.
    const w = (style.tuftWide ? 0.115 : 0.05) * k, d = (style.tuftWide ? 0.13 : 0.06) * k;
    const x = (style.tuftWide ? 0.038 : 0.052) * k, h = style.tuft * k + SINK;
    add("hair_tuft", w, h, d, x, base + h / 2, -0.02 * k);
  }
  return parts;
}

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
  private skinBinding: SkinBinding;
  private skinIds: Partial<Record<WeaponId, string>> = {};
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
  /**
   * Phase of the idle sway and breathing, offset per body so a room of twelve does not breathe in
   * unison. Seeded from the player's id rather than `Math.random()`: the offset was already
   * arbitrary, and making it a function of the id costs nothing, gives every client the same body,
   * and — the reason it changed — makes the rest pose reproducible, which is what lets
   * `Character.build.test.ts` measure a silhouette to the millimetre instead of to the sway.
   */
  private time: number;
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
  /** Drop D: the cap (and its visor) hide when shaved; the bare, stubbled skull shows instead. */
  private capParts: Mesh[] = [];
  private cap!: Mesh;
  private bareHead: Mesh;
  /** Drop E: the raw field this head is currently cut for, and the one merged mesh built from it. */
  private haircutValue = "";
  private style: HaircutStyle = haircutLook("").style;
  private hair: Mesh | null = null;
  private mats: SharedMats;
  /** The proportions this body was built from. Read by the hair builder and by the pose loop. */
  private rig: BuildRig;
  /** What it is wearing. Fixed at construction, like the build: an outfit is geometry, not a flag. */
  private outfit: OutfitDef;

  constructor(private scene: Scene, team: Team, name: string, build: string = DEFAULT_BUILD, outfit: string = DEFAULT_OUTFIT) {
    const F = outfitDef(outfit);
    const M = teamMats(scene, team, F.id);
    const R = buildRig(build);
    this.rig = R;
    this.outfit = F;
    this.time = (hashString(name) % 10000) / 1000;
    this.mats = M;
    this.weaponMaterials = M.weapons;
    this.skinBinding = new SkinBinding(SkinRegistry.forScene(scene), this.weaponMaterials);
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

    // Every number below is `R.<field>` or a fraction of one. Kit detail (badge, piping, pouches,
    // goggles) rides on the box it is pinned to, so a wide chest carries a wide stripe and a small
    // head carries small goggles: the outfit is worn by the build rather than laid over it.
    const chestFront = R.chestZ + R.chestD / 2, vestFront = R.vestZ + R.vestD / 2;
    this.hips = node("hips", this.root, 0, R.hipY, 0);
    box("pelvis", this.hips, R.pelvisW, R.pelvisH, R.pelvisD, 0, -0.02, 0, M.cloth);
    this.torso = node("torso", this.hips, 0, R.torsoY, 0);
    box("chest", this.torso, R.chestW, R.chestH, R.chestD, 0, R.chestY, R.chestZ, M.cloth);
    box("vest", this.torso, R.vestW, R.vestH, R.vestD, 0, R.chestY, R.vestZ, M.vest);
    box("panel", this.torso, R.chestW * (.18 / .42), .12, .02, R.chestW * (.09 / .42), R.chestY + R.chestH * .2, chestFront + .025, M.accent);
    // The hunch is a box on the upper back and a forward roll of the shoulders, never a rest
    // rotation of the torso: a pitched torso would drop the head, and the head's height is the
    // headshot zone (`shared/builds.ts`). A build with no hunch builds no hump and pays nothing.
    if (R.humpH > 0) box("upper_back", this.torso, R.humpW, R.humpH, R.humpD, 0, R.humpY, R.humpZ, M.cloth);
    box("shoulderL", this.torso, R.shoulderW, R.shoulderH, R.shoulderD, -R.shoulderX, R.shoulderY, R.shoulderZ, M.vest);
    box("shoulderR", this.torso, R.shoulderW, R.shoulderH, R.shoulderD, R.shoulderX, R.shoulderY, R.shoulderZ, M.vest);
    this.head = node("head", this.torso, 0, R.headY, R.headZ);
    box("skull", this.head, R.skullW, R.skullH, R.skullD, 0, R.skullY, 0, M.skin);
    const capY = R.skullY + R.skullH / 2;
    this.capParts.push(box("cap", this.head, R.skullW + .02, R.capH, R.skullD + .02, 0, capY, .01, M.cloth));
    this.capParts.push(box("visor", this.head, R.skullW, .02, .1, 0, capY - .03, R.skullD / 2 + .05, M.cloth));
    // Shaved (drop D): a stubbled skull a hair larger than the skin one so it wins the depth test
    // where they overlap, reaching up to where the cap's crown used to sit. Hidden until `shaved`.
    this.bareHead = box("bare_head", this.head, R.skullW + .006, R.skullH + .01, R.skullD + .006, 0, R.skullY + .01, 0, M.stubble);
    this.bareHead.setEnabled(false);
    box("neck", this.head, R.neckW, R.neckH, R.neckW, 0, R.neckY, 0, M.skin);
    box("goggle_frame", this.head, R.skullW + .018, .075, .045, 0, R.skullY + R.skullH * (.035 / .24), R.skullD / 2 - .003, M.boots);
    box("goggle_lens", this.head, R.skullW - .022, .039, .018, 0, R.skullY + R.skullH * (.04 / .24), R.skullD / 2 + .025, M.accent);
    box("face_mask", this.head, R.skullW - .03, .075, .055, 0, R.skullY - R.skullH * (.052 / .24), R.skullD / 2 - .005, M.cloth);
    box("headset", this.head, .04, .085, .09, R.skullW / 2 + .015, R.skullY + R.skullH * (.03 / .24), 0, M.boots);
    if (F.apron) box("apron", this.torso, R.vestW * (.31 / .44), .19, .025, 0, R.chestY - R.chestH * .53, vestFront - .005, M.vest);
    box("back_team_panel", this.torso, R.chestW * (.32 / .42), .17, .02, 0, R.chestY + R.chestH * .14, R.chestZ - R.chestD / 2 - .025, M.accent);
    // Team-coloured, not trim: an outfit owns `trim`, so a band named "team stripe" painted with it
    // would have gone black on NIETOPERZ and taken the side's colour off the chest with it.
    box("chest_team_stripe", this.torso, R.chestW * (.37 / .42), .055, .02, 0, R.chestY + R.chestH * .36, chestFront + .025, M.accent);
    {
      // Street tracksuit piping and a compact club badge. Marcovia's materials reproduce the
      // supplied green-yellow crest; the other side gets the same geometry to preserve fairness.
      const bx = -R.chestW * (.12 / .42), by = R.chestY + R.chestH * .14, bz = chestFront + .031;
      box("marcovia_badge", this.torso, .115, .13, .018, bx, by, bz, M.accent);
      box("marcovia_badge_inset", this.torso, .08, .095, .019, bx, by, bz + .011, M.vest);
      box("marcovia_m_l", this.torso, .014, .05, .02, bx - .025, by, bz + .023, M.accent);
      box("marcovia_m_r", this.torso, .014, .05, .02, bx + .025, by, bz + .023, M.accent);
      box("marcovia_m_diag_l", this.torso, .012, .043, .02, bx - .01, by + .008, bz + .023, M.accent).rotation.z = .58;
      box("marcovia_m_diag_r", this.torso, .012, .043, .02, bx + .01, by + .008, bz + .023, M.accent).rotation.z = -.58;
      box("track_zip", this.torso, .018, R.chestH * (.43 / .5), .018, 0, R.chestY, chestFront + .031, M.trim);
      box("track_waist", this.torso, R.vestW * (.4 / .44), .025, .018, 0, R.chestY - R.chestH * .47, vestFront + .016, M.trim);
    }
    for (const x of [-R.chestW * (.13 / .42), 0, R.chestW * (.13 / .42)]) {
      box("ammo_pouch", this.torso, .1, .13, .065, x, R.chestY - R.chestH * .12, vestFront + .02, M.boots);
      box("pouch_buckle", this.torso, .028, .02, .014, x, R.chestY - R.chestH * .04, vestFront + .058, M.trim);
    }
    this.perkBand = box("perkBand", this.head, R.skullW + .03, .03, R.skullD + .03, 0, capY - .025, .01, M.accent);
    this.perkBand.setEnabled(false);

    this.armR = node("armR", this.torso, R.armX, R.armY, R.shoulderZ);
    box("upperR", this.armR, R.upperW, R.upperH, R.upperW, 0, -R.upperH / 2, 0, M.cloth);
    for (const sx of stripeOffsets(R.armStripeX, R.stripeW, F.stripes)) {
      box("track_arm_r", this.armR, R.stripeW, R.upperH * (.27 / .3), R.upperW + .006, sx, -R.upperH / 2, 0, M.trim);
    }
    // Likewise the armband: it is an armband, so it wears the side's colour. Both were the club's
    // trim before outfits existed, when trim WAS the team's; now it is the outfit's.
    box("bandR", this.armR, R.upperW * (.125 / .11), .06, R.upperW * (.125 / .11), 0, -R.upperH / 3, 0, M.accent);
    this.forearmR = node("forearmR", this.armR, 0, R.foreY, 0);
    box("lowerR", this.forearmR, R.foreW, R.foreH, R.foreW, 0, -R.foreH / 2, 0, M.skin);
    box("handR", this.forearmR, R.handW, R.handH, R.handD, 0, R.handY, .02, M.boots);
    // The weapon hangs off the torso (not the hand chain) so it always points where the player aims;
    // the arms are posed to reach it approximately — at gameplay distances that reads correctly.
    // Its offsets are the SAME for every build: the gun is a gameplay object and must read from the
    // same place on every body, and the bore direction is a rotation the rig never touches.
    this.gunHand = node("gunHand", this.torso, R.gunX, 0.36, 0.16);

    this.armL = node("armL", this.torso, -R.armX, R.armY, R.shoulderZ);
    box("upperL", this.armL, R.upperW, R.upperH, R.upperW, 0, -R.upperH / 2, 0, M.cloth);
    for (const sx of stripeOffsets(R.armStripeX, R.stripeW, F.stripes)) {
      box("track_arm_l", this.armL, R.stripeW, R.upperH * (.27 / .3), R.upperW + .006, -sx, -R.upperH / 2, 0, M.trim);
    }
    this.forearmL = node("forearmL", this.armL, 0, R.foreY, 0);
    box("lowerL", this.forearmL, R.foreW, R.foreH, R.foreW, 0, -R.foreH / 2, 0, M.skin);
    box("handL", this.forearmL, R.handW, R.handH, R.handD, 0, R.handY, .02, M.boots);

    /** One leg. Both sides are the same chain mirrored, so the rig is read once per dimension. */
    const buildLeg = (side: 1 | -1, hip: string, knee: string): [TransformNode, TransformNode] => {
      const s = side > 0 ? "R" : "L";
      const leg = node(hip, this.hips, side * R.legX, R.legY, 0);
      box(`thigh${s}`, leg, R.thighW, R.thighH, R.thighD, 0, -R.thighH / 2, 0, M.cloth);
      for (const sx of stripeOffsets(R.legStripeX, R.stripeW, F.stripes)) {
        box(`track_leg_${s.toLowerCase()}`, leg, R.stripeW, R.thighH * (.39 / .42), R.thighD + .006, side * sx, -R.thighH / 2, 0, M.trim);
      }
      const shin = node(knee, leg, 0, R.shinY, 0);
      box(`calf${s}`, shin, R.calfW, R.calfH, R.calfD, 0, -R.calfH / 2, 0, M.cloth);
      box(`boot${s}`, shin, R.bootW, R.bootH, R.bootD, 0, R.bootY, .04, M.boots);
      box("knee_pad", shin, R.kneeW, R.kneeH, R.kneeD, 0, -R.calfH * (.045 / .4), R.calfD * (.08 / .14), M.vest);
      return [leg, shin];
    };
    [this.legR, this.shinR] = buildLeg(1, "legR", "shinR");
    [this.legL, this.shinL] = buildLeg(-1, "legL", "shinL");

    // The outfit's own pieces — a hood, a cape, a moustache. They go in BEFORE the merge, with the
    // same six materials the body uses, so a hood joins the head's cloth mesh and a cape joins the
    // torso's: an outfit adds boxes and not one draw call. Their sizes come from the rig, so a piece
    // fits whichever build is wearing it, and `outfitViolations` (shared) is what keeps them inside
    // the body a bullet can reach.
    const roles: Record<OutfitRole, PBRMaterial> = { cloth: M.cloth, vest: M.vest, trim: M.trim, boots: M.boots, skin: M.skin, hair: M.hair, accent: M.accent };
    for (const part of outfitParts(F, R)) {
      box(part.name, part.joint === "head" ? this.head : this.torso, part.w, part.h, part.d, part.x, part.y, part.z, roles[part.role]);
    }

    // Merge only within a joint and material, retaining articulation and the toggled perk band,
    // bomb pack, cap and bare head. Added clothing detail therefore does not add a draw call for
    // every pouch or buckle.
    const groups = new Map<TransformNode, Map<PBRMaterial, Mesh[]>>();
    for (const m of this.meshes) {
      if (m === this.perkBand || m === this.bareHead || this.capParts.includes(m)) continue;
      const parent = m.parent as TransformNode, mat = m.material as PBRMaterial;
      const materials = groups.get(parent) ?? new Map<PBRMaterial, Mesh[]>();
      const meshes = materials.get(mat) ?? []; meshes.push(m);
      materials.set(mat, meshes); groups.set(parent, materials);
    }
    // The cap and its visor are one object as far as the player is concerned — they come off
    // together — so they are merged into a single toggled mesh rather than kept apart. Excluding
    // two meshes from the merge instead of one would have cost a draw call per character in EVERY
    // mode for a flag that is only set in one (code review).
    const capHead = this.capParts[0].parent as TransformNode;
    for (const m of this.capParts) { m.parent = null; m.computeWorldMatrix(true); }
    this.cap = Mesh.MergeMeshes(this.capParts, true, true)!;
    this.cap.parent = capHead; this.cap.material = M.cloth; this.cap.isPickable = false; this.cap.receiveShadows = true;
    this.meshes = [this.perkBand, this.bareHead, this.cap];
    for (const [parent, materials] of groups) for (const [mat, meshes] of materials) {
      // Merge in joint-local space; the joint's world transform must not be baked twice.
      for (const m of meshes) { m.parent = null; m.computeWorldMatrix(true); }
      const merged = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true)!;
      merged.parent = parent; merged.material = mat; merged.isPickable = false; merged.receiveShadows = true;
      this.meshes.push(merged);
    }

    this.ensureWeapon(this.currentWeapon);
    this.rebuildHair();
  }

  /**
   * Re-cut the head for `this.haircutValue`. Called from the constructor and then only when the
   * replicated string changes — on equip and on a shave death, a handful of times a match.
   *
   * All of the style's clumps become ONE mesh, for the same reason the cap and its visor are one:
   * an extra mesh per character is an extra draw call in every mode, for every body on screen. A
   * style with no hair (the default cap) builds nothing at all and costs nothing.
   */
  private rebuildHair(): void {
    if (this.hair) {
      const i = this.meshes.indexOf(this.hair);
      if (i >= 0) this.meshes.splice(i, 1);
      this.hair.dispose();
      this.hair = null;
    }
    this.style = haircutLook(this.haircutValue).style;
    const parts = hairParts(this.style, this.scene, headCuts(this.rig));
    if (parts.length === 0) return;
    // Merge in head-local space: the parts are unparented, so their world matrix is their local
    // position and the head's transform is not baked into the vertices.
    for (const p of parts) p.computeWorldMatrix(true);
    const hair = parts.length === 1 ? parts[0] : Mesh.MergeMeshes(parts, true, true)!;
    hair.name = "hair";
    hair.parent = this.head;
    hair.material = this.style.tone === "stubble" ? this.mats.stubble : this.style.tone === "bleach" ? this.mats.bleach : this.mats.hair;
    hair.isPickable = false; hair.receiveShadows = true; hair.visibility = this.fade;
    this.hair = hair;
    this.meshes.push(hair);
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
    this.hips.position.y = this.rig.hipY; this.hips.rotation.set(0, 0, 0);
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
    const R = this.rig;
    const dt = Math.min(0.1, dtMs / 1000);
    this.time += dt;
    if (inp.weapon !== this.currentWeapon) {
      this.ensureWeapon(inp.weapon);
      this.weapons.get(this.currentWeapon)?.root.setEnabled(false);
      this.currentWeapon = inp.weapon;
      this.weapons.get(inp.weapon)!.root.setEnabled(true);
      void this.skinBinding.apply(this.weapons.get(inp.weapon)!, inp.weapon, this.skinIds[inp.weapon] ?? "");
    }
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt * 3); for (const m of this.meshes) m.visibility = this.fade; }
    const perked = !!inp.perked && inp.alive;
    if (this.perkBand.isEnabled() !== perked) this.perkBand.setEnabled(perked);
    // Shaved (drop D) is not gated on `alive`: the shaved head stays on the body that fell.
    const shaved = !!inp.shaved;
    // Drop E: the string, not the style, is the change detector — the same test `weapon` gets above.
    const haircut = inp.haircut ?? "";
    if (haircut !== this.haircutValue) { this.haircutValue = haircut; this.rebuildHair(); }
    // Drop E: the stubbled scalp shows under a shaved head too, not only for Ostrzyżeni's bare one.
    // It is the whole reason a shave reads at gameplay range — a pale scalp against dark remnants
    // changes the head's TONE and SILHOUETTE, where a track mown across the crown is a groove nobody
    // can see from behind or from eight metres (art review of the first cut).
    const scalp = shaved || this.style.scalp;
    if (this.bareHead.isEnabled() !== scalp) this.bareHead.setEnabled(scalp);
    // One mesh, two meanings: Drop D's bare Ostrzyżeni scalp and Drop E's shaved one are the same
    // geometry wearing different materials, so telling them apart costs a material swap on a flag
    // that changes on a death, not a second toggled mesh and the draw call that comes with it.
    const scalpMat = this.style.scalp ? this.mats.razorburn : this.mats.stubble;
    if (this.bareHead.material !== scalpMat) this.bareHead.material = scalpMat;
    // The cap comes off when the style says so, and always when shaved. The bare scalp wins over
    // hair outright: whatever a player equipped, a head that has just been done has nothing on it.
    // ...and an outfit's own headgear replaces it outright: a KIBOL wears the hood, not the hood
    // over the shop cap. The kit outfit has none, so nothing changes for a player who has not
    // rolled one.
    const capOn = !scalp && this.style.cap && this.outfit.headgear === "none";
    if (this.cap.isEnabled() !== capOn) this.cap.setEnabled(capOn);
    // A cowl is the only piece that closes over the whole skull, so it is the only one that hides
    // hair; a hood and a beanie let it out at the sides, which is what they look like in life.
    const hairOn = !shaved && !hidesHair(this.outfit);
    if (this.hair && this.hair.isEnabled() !== hairOn) this.hair.setEnabled(hairOn);

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
      this.hips.position.y = R.hipY - 0.45 * buckle - 0.35 * ef;
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
    this.blendLean += ((inp.lean ?? 0) - this.blendLean) * k;
    this.blendTac += ((inp.tac ? 1 : 0) - this.blendTac) * k;
    this.blendSlide += ((inp.slide ? 1 : 0) - this.blendSlide) * Math.min(1, dt * 14);
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
    // The build moves the hip's RESTING height and nothing else: every offset below stays in absolute
    // metres, identical for all six. MEASURED, and the reason it is not scaled by hip height: scaling
    // the crouch by the build's own hips spread the crouched crown over 69 mm (BARYŁKA 1.505 m,
    // TYCZKA 1.436 m), because a short build then dipped less. Flat offsets hold it to 11 mm. Equal
    // displacement is equal exposure, which is the thing a crouch must not sell.
    const bounce = Math.abs(c) * 0.03 * run;
    this.hips.position.y = R.hipY - 0.38 * cr + bounce - 0.05 * this.blendAir - 0.16 * this.landSquash + 0.006 * shift;
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
    this.torso.rotation.x += 0.12 * tacB - 0.5 * sl;   // sliding: the torso lies back
    this.hips.position.x = -0.05 * leanB;
    this.head.rotation.x = inp.pitch * 0.45 - 0.2 * cr + fl * 0.5 * this.flinchZ + 0.3 * sl;
    this.head.rotation.y = fl * 0.55 * this.flinchX;
    this.head.rotation.z = -0.12 * leanB;
    // Legs: alternating swing; airborne = tucked; landing = knees bend.
    const swing = 0.75 * run * (1 + 0.5 * sprint);
    // Sliding: the right leg shoots out straight ahead, the left folds under, the torso lies back.
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
    // Low-ready (art pass): the receiver sits beside the torso's right edge at chest height, a hair
    // nose-down; the bore must stay within 5° of facing (hand-pose oracle), so the tilt is small.
    this.gunHand.rotation.x = HOLD.pitch + aim * 0.5 - this.kick * 0.12 + 0.45 * sprint + 0.55 * tacB + armSwing * 0.5 + fl * 0.2 + 0.6 * throwing + 0.25 * melee - 0.9 * swingR;
    this.gunHand.rotation.y = HOLD.yaw + armSwing * 0.3 - 0.3 * throwing + 0.12 * oneHand - 0.4 * swingR;
    this.gunHand.rotation.z = -0.35 * swingR;
    this.gunHand.position.z = HOLD.z - this.kick * 0.05 - 0.08 * throwing + 0.05 * oneHand + 0.08 * swingR;
    this.gunHand.position.x = HOLD.x + 0.04 * oneHand + 0.02 * melee;
    this.gunHand.position.y = HOLD.y + 0.02 * oneHand - 0.08 * melee;
    // Right arm: upper arm hangs by the ribs (elbow just behind the shoulder line), forearm folded
    // up to the grip. Throw: the arm goes back over the shoulder, then whips forward past horizontal.
    this.armR.rotation.x = 0.1 - aim * 0.25 - this.kick * 0.2 + idleSway + 0.35 * sprint - 0.35 * tacB + armSwing + fl * 0.25 - 1.6 * thr + 0.9 * thrSwing
      - 0.25 * oneHand + 0.35 * melee - 0.9 * swingR;
    this.armR.rotation.y = -0.8 - 0.3 * thr + 0.15 * oneHand - 0.5 * swingR;
    this.forearmR.rotation.x = -2.0 + this.kick * 0.15 + 0.2 * sprint - 1.2 * thr + 0.3 * thrSwing + 0.3 * oneHand - 0.2 * melee - 0.5 * swingR;
    this.torso.rotation.y += -0.25 * thr + 0.2 * thrSwing - 0.3 * swingR;
    this.torso.rotation.x += 0.15 * thrSwing + 0.1 * swingR;
    const rl = Math.sin(this.reloadPhase * Math.PI);
    // Left arm: on the handguard for long guns; hanging half-bent for a sidearm; guarding for the clippers.
    const off = Math.max(oneHand, melee);
    this.armL.rotation.x = (-1.0 - aim * 0.25 + idleSway + 1.0 * rl + 0.2 * sprint + armSwing * 0.8 + fl * 0.25) * (1 - off) + (-0.45 + idleSway + 1.0 * rl - 0.3 * melee) * off;
    this.armL.rotation.y = (0.85 - 0.5 * rl) * (1 - off) + 0.15 * off;
    this.forearmL.rotation.x = (-0.55 + 0.6 * rl + 0.2 * sprint) * (1 - off) + (-0.9 + 0.6 * rl) * off;
  }

  setEnabled(v: boolean): void { this.root.setEnabled(v); }

  dispose(): void {
    this.skinBinding.clear();
    // Team clothing and weapon materials are shared by every body in this scene.
    this.root.dispose(false, false);
  }

  /** Called on cosmetic replication events, never to redraw a texture in the pose loop. */
  applySkins(skins: Partial<Record<WeaponId, string>>): Promise<void> {
    this.skinIds = { ...skins };
    return this.skinBinding.apply(this.weapons.get(this.currentWeapon)!, this.currentWeapon, skins[this.currentWeapon] ?? "");
  }
}

export const CHARACTER_EYE = PLAYER.eyeHeight;
import { SkinBinding, SkinRegistry } from "./skins";
