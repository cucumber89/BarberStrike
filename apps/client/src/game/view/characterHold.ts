/**
 * Third-person weapon hold (2.1, drop A): where the held gun sits relative to the body, as numbers.
 *
 * The art reviews kept rejecting the same thing in different words — "one tan brick", "swallowed by
 * the vest", "the stock protrudes from the bot's back" — and every attempt to fix it by eye moved
 * one end of the gun into the body while pulling the other out. A gun 1.3 m long held at the chest
 * has two ends, and a screenshot from the front only shows one of them.
 *
 * So this file computes the gun's box in TORSO space from the same constants `Character.update`
 * writes, and `characterHold.test.ts` asserts it does not intersect the vest. Pure arithmetic, no
 * Babylon: the transform below mirrors `gunHand` (a node under the torso carrying position and a
 * yaw/pitch rotation) and the weapon model parented to it at a fixed offset and scale.
 */

import type { WeaponId } from "@frankibarber/shared";
import type { PartBox } from "./weaponFit";
import { unionBox } from "./weaponFit";
import { proceduralParts } from "./weaponMeshes";

/** The vest box (`Character.buildBody`: 0.44 × 0.34 × 0.27 at y 0.3), in torso space. */
export const VEST: PartBox = { min: [-0.22, 0.13, -0.135], max: [0.22, 0.47, 0.135] };

/** How `Character.ensureWeapon` parents a weapon model under `gunHand`. */
export const GUN_OFFSET: [number, number, number] = [0, -0.02, 0.05];
export const GUN_SCALE = 0.95;

export interface HoldPose {
  /** `gunHand.position` base, in torso space. */
  position: [number, number, number];
  /** `gunHand.rotation` base (pitch x, yaw y, roll z), Babylon's yaw-pitch-roll order. */
  rotation: [number, number, number];
}

/**
 * The base pose `Character.update` writes for a weapon of this slot, with every dynamic term
 * (run swing, kick, sprint, tactical, throw, flinch, melee) at rest. Keep in step with the
 * `gunHand` block in `Character.update` — the test compares against those constants.
 */
export function holdPose(slot: 1 | 2 | 3): HoldPose {
  const oneHand = slot === 2 ? 1 : 0, melee = slot === 3 ? 1 : 0;
  return {
    position: [HOLD.x + 0.04 * oneHand + 0.02 * melee, HOLD.y + 0.02 * oneHand - 0.08 * melee, HOLD.z + 0.05 * oneHand + 0.08 * melee],
    rotation: [HOLD.pitch + 0.25 * melee, HOLD.yaw + 0.12 * oneHand, 0],
  };
}

/**
 * The hold, in one place so `Character.update` and the clearance test cannot drift apart.
 *
 * MEASURED (`characterHold.test.ts`, searched over x and z with the bore angle fixed): a long gun's
 * receiver runs BACK from the grip, so a hold on the chest centre buries it and the stock comes out
 * of the character's back — 26 cm of the SMG inside the vest at x 0.14, and the LMG still 31 mm in
 * at x 0.3. The gun clears the body when it rides just outside the shoulder (x 0.335, past the
 * vest's 0.22 half-width and the shoulder box's 0.32 edge); the stock may then sit well behind the
 * chest, because at that offset it is beside the arm rather than through the ribs. Pushing the gun
 * FORWARD instead is what produced the stiff-arm hold earlier rounds rejected, so z stays at 0.14.
 */
export const HOLD = { x: 0.335, y: 0.33, z: 0.14, pitch: 0.02, yaw: -0.06 } as const;

const rotate = (p: [number, number, number], pitch: number, yaw: number): [number, number, number] => {
  // Babylon's Node.rotation is yaw-pitch-roll: pitch about X first, then yaw about Y (roll is 0).
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = p[1] * cp - p[2] * sp, z1 = p[1] * sp + p[2] * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // Left-handed RotationY: x' = x cos + z sin, z' = −x sin + z cos.
  return [p[0] * cy + z1 * sy, y1, -p[0] * sy + z1 * cy];
};

/** The gun's axis-aligned box in TORSO space, for the given weapon at rest. */
export function gunBoxInTorso(id: WeaponId, slot: 1 | 2 | 3, pose = holdPose(slot)): PartBox {
  const pp = proceduralParts(id);
  const local = unionBox([...pp.parts, ...pp.magazine].map((p) => p.box));
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const cx of [local.min[0], local.max[0]]) {
    for (const cy of [local.min[1], local.max[1]]) {
      for (const cz of [local.min[2], local.max[2]]) {
        const scaled: [number, number, number] = [GUN_OFFSET[0] + cx * GUN_SCALE, GUN_OFFSET[1] + cy * GUN_SCALE, GUN_OFFSET[2] + cz * GUN_SCALE];
        const r = rotate(scaled, pose.rotation[0], pose.rotation[1]);
        for (let i = 0; i < 3; i++) {
          const v = pose.position[i] + r[i];
          min[i] = Math.min(min[i], v);
          max[i] = Math.max(max[i], v);
        }
      }
    }
  }
  return { min, max };
}

/** Overlap of two boxes per axis; every component > 0 means they intersect. */
export function overlap(a: PartBox, b: PartBox): [number, number, number] {
  return [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])) as [number, number, number];
}

/** Depth the gun penetrates the vest (0 = clear); the smallest axis overlap is the separation. */
export function vestPenetration(box: PartBox): number {
  const o = overlap(box, VEST);
  return o.every((v) => v > 0) ? Math.min(...o) : 0;
}
