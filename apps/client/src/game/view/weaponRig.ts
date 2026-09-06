/**
 * Weapon rig (drop 6b). The CC-BY firearm models ship as a tree of NAMED nodes — `Magazine`,
 * `slide`, `Bolt`, `Charging_Handle`, `Front_Sight`, `Rear_Sight`, `Revolving_Cylinder`, `Rocket`,
 * `Barrel`, `Flashhider` — so the parts the viewmodel animates (magazine drop, action cycle) and the
 * anchors it solves against (muzzle, sight axis) can be READ OFF THE MODEL instead of eyeballed.
 *
 * This file is pure name→role classification so it can be unit-tested against the real node lists
 * without a browser. The geometry (world positions, bounding boxes) is resolved by the loader.
 *
 * The names are messy in exactly the ways that matter, and every rule below exists because of a
 * real file in `public/models/raw/firearms`:
 *  - `Magazine_Release`, `Mag_Release`, `Magazine_Release_Housing` are BUTTONS, not the magazine;
 *  - `Magazines` / `Barrels` / `Bullets` / `Handguards` are GROUP nodes with no geometry of their own;
 *  - SRSA1 has a real `Bolt` AND `Bolt_1`…`Bolt_10`, which are decorative screws;
 *  - `Charging_Handle_Bolt`, `Bolt_Stop`, `Bolt_Release`, `Bolt_Firing`, `Bolt_Ball` are furniture;
 *  - sights come as `Rear_Sight`, `Rear_Sights`, and as `*_Mount` / `*_Housing` / `*_Screw` /
 *    `*_Connector` / `*_Glow` variants that must not win.
 */

export type RigRole = "magazine" | "action" | "frontSight" | "rearSight" | "muzzle" | "cylinder" | "eject" | "projectile" | "grip" | "trigger";

/** How the action moves when the weapon cycles or reloads. Mirrors `ActionKind` in weaponMeshes. */
export type RigAction = "slide" | "bolt" | "charge" | "cylinder" | "none";

export interface RigMatch {
  /** Node name chosen for the role. */
  name: string;
  /** Lower is better; only used to pick between candidates. */
  rank: number;
}

export type Rig = Partial<Record<RigRole, string>> & { action?: string; actionKind: RigAction };

const norm = (s: string): string => s.toLowerCase().replace(/\.\d+$/, "").replace(/[\s-]+/g, "_");

/** Group nodes carry children, never the part itself. */
const GROUP = /^(magazines|barrels|bullets|handguards|body_parts|magazine_release_housing)$/;
/** Sub-parts that borrow a role's word but are furniture. */
const FURNITURE = /(release|stop|firing|ball|arm|mount|housing|screw|connector|adjuster|block|cover|lug|guard|spring|latch|sling|ring|rail|pin|switch|port|cap|tube|under|inner|left|right|back|front_ring)/;

/**
 * Picks the best node for a role from `names`.
 * `exact` beats `prefix` beats `contains`, and anything matching FURNITURE is only a last resort.
 */
function pick(names: string[], exact: RegExp, loose: RegExp, allowFurniture = false): string | undefined {
  let best: RigMatch | null = null;
  for (const raw of names) {
    const n = norm(raw);
    if (GROUP.test(n)) continue;
    // `Bolt_3` style trailing indices are decorative hardware, never the action.
    const indexed = /_\d+$/.test(n);
    let rank: number;
    if (exact.test(n)) rank = indexed ? 40 : 0;
    else if (loose.test(n)) rank = indexed ? 60 : 20;
    else continue;
    if (FURNITURE.test(n)) { if (!allowFurniture) continue; rank += 30; }
    if (!best || rank < best.rank) best = { name: raw, rank };
  }
  return best?.name;
}

/**
 * Classifies a weapon model's node names into the roles the viewmodel drives.
 * Unknown roles are simply absent — the caller falls back to a derived anchor or skips the motion.
 */
export function buildRig(names: string[]): Rig {
  const set = new Set(names.map(norm));
  const magazine = pick(names, /^magazine$/, /^(magazine|mag)(_standard|_box|_long|_short)?$/);
  // A `Cylinder` node only means a revolver when the swing-out hardware is there too: the MP5SD has
  // a node called `Cylinder` that belongs to its stock.
  const revolver = set.has("revolving_cylinder") || set.has("cylinder_arm") || set.has("extractor_rod");
  const cylinder = revolver ? pick(names, /^revolving_cylinder$/, /^(revolving_)?cylinder$/) : undefined;
  // A bolt-action rifle carries the bolt handle (`Bolt_Arm` / `Bolt_Ball`) and often ALSO a node
  // called `Slide` in its furniture — SRSA1 does. The handle is the tell, so the bolt wins.
  const boltAction = set.has("bolt_arm") || set.has("bolt_ball");
  const slide = boltAction ? undefined : pick(names, /^slide$/, /^slide$/);
  const bolt = pick(names, /^bolt$/, /^bolt$/);
  const charge = pick(names, /^charging_handle$/, /^charging_handle(_handle)?$/, true);
  const frontSight = pick(names, /^front_sights?$/, /^front_sights?(_glow|_open_ring)?$/);
  const rearSight = pick(names, /^rear_sights?$/, /^rear_sights?(_glow.*)?$/);
  // Optional: a suppressed weapon can have no barrel node at all (the MP5SD's can is its handguard),
  // in which case the loader derives the muzzle from the model's forward-most point instead.
  const muzzle = pick(names, /^(flashhider|compensator|suppressor|silencer)$/, /^(flashhider|compensator|suppressor|silencer|muzzle)(_long|_short)?$/)
    ?? pick(names, /^barrel$/, /^(barrel|.*_barrel)(_long|_short)?$/)
    // A launcher has no barrel or flash hider: its `Tube` is the bore. Exact match only, so the
    // MK14's `Gas_Tube` cannot win.
    ?? pick(names, /^tube$/, /^tube$/, true);
  const eject = pick(names, /^ejection_port$/, /^(ejection|ejector)_port.*$/, true);
  const projectile = pick(names, /^rocket$/, /^(rocket|grenade|shell)$/);
  // Where the hand goes. `Grip_Safety` (SR1MP) and `Bottom_Grip_Ring` (RPG) must NOT win — the
  // first is a lever, the second a carry handle — so only a bare grip counts.
  const grip = pick(names, /^(pistol_)?grip$/, /^(pistol_)?grip(_panel)?$/);
  // The trigger is the fallback hand anchor: every gun in the pack that has no bare `Grip` node
  // still has one, and it sits within a couple of centimetres of the web of the hand.
  const trigger = pick(names, /^trigger$/, /^trigger$/);

  // The action the reload timeline drives, in the order a gun actually cycles.
  const action = slide ?? bolt ?? charge ?? cylinder;
  const actionKind: RigAction = slide ? "slide" : bolt ? "bolt" : charge ? "charge" : cylinder ? "cylinder" : "none";

  const rig: Rig = { actionKind };
  if (magazine) rig.magazine = magazine;
  if (cylinder) rig.cylinder = cylinder;
  if (frontSight) rig.frontSight = frontSight;
  if (rearSight) rig.rearSight = rearSight;
  if (muzzle) rig.muzzle = muzzle;
  if (eject) rig.eject = eject;
  if (projectile) rig.projectile = projectile;
  if (grip) rig.grip = grip;
  if (trigger) rig.trigger = trigger;
  if (action) rig.action = action;
  return rig;
}
