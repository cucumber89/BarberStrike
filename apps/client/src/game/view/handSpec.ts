/**
 * First-person hand spec (2.1, drop A follow-up): the gloved hand as a small JOINTED assembly.
 *
 * Art review saw the old two-box hand (a hand box and an arm box at a fixed offset with its own
 * rotation) come apart in the inspect and reload poses — "a pile of loose blocks". Here every part
 * is placed so it touches the palm, and the forearm's box starts AT the wrist edge of the palm with
 * its joint on that face: whatever rotation a pose gives the forearm, its near end stays on the palm.
 *
 * Frame: the hand pivot's own (`vm_hand_r_pivot` / `vm_hand_l_pivot`), before the pose rotation the
 * viewmodel applies to the whole hand — +X right, +Y up, +Z forward (towards the muzzle), metres,
 * palm centred at the origin. Pure geometry (no Babylon) so `handSpec.test.ts` can judge it with the
 * same `weaponParts` rules the guns pass, and `Viewmodel.buildHands` turns it into beveled boxes.
 *
 * The palm's box is exactly `HAND_SIZE`: `supportHandHome` and the `pnpm check:weapons` support-hand
 * check measure the hand by that box, centred on the pivot.
 */

import { HAND_SIZE, type PartBox } from "./weaponFit";

export type HandSide = "left" | "right";

export interface HandPart {
  name: string;
  /** Axis-aligned box in the hand pivot's frame, before any rotation. */
  box: PartBox;
  /**
   * Jointed part: rotated (Euler, radians, Babylon order) about `at` — a point on the palm's
   * surface — rather than about its own centre, so the end that meets the palm never leaves it.
   */
  joint?: { at: [number, number, number]; rotation: [number, number, number] };
}

/** Forearm cross-section and length: a little thicker than the palm, reaching back past the frame's edge. */
const FOREARM: [number, number, number] = [0.062, 0.058, 0.24];

const boxAt = (min: [number, number, number], max: [number, number, number]): PartBox => ({ min, max });

/**
 * The parts of one hand. `side` mirrors the thumb (inner side: −X on the right hand, +X on the
 * left) and the forearm's outward yaw; the palm and fingers are symmetric.
 *
 * - palm     : `HAND_SIZE`, centred on the pivot (what the support-hand check measures).
 * - fingers  : a block at the palm's front edge hanging DOWN below it — the right hand's curl
 *              around the front of the grip, the left's under the fore-end.
 * - thumb    : a block along the inner-top edge of the palm, lying back along the grip / fore-end.
 * - forearm  : starts on the palm's wrist face (z = −HAND_SIZE.z/2) and runs back; its joint sits
 *              on that face, so its rotation (down towards the elbow, a little outward) never opens
 *              a gap between it and the palm.
 */
export function handParts(side: HandSide): HandPart[] {
  const [w, h, d] = HAND_SIZE;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const inner = side === "right" ? -1 : 1;          // the thumb side
  const palm: HandPart = { name: "palm", box: boxAt([-hx, -hy, -hz], [hx, hy, hz]) };
  // Fingers: overlap the palm's bottom by 2 mm and its front by 25 mm, then drop 26 mm below it.
  const fingers: HandPart = { name: "fingers", box: boxAt([-hx + 0.004, -hy - 0.026, hz - 0.025], [hx - 0.004, -hy + 0.002, hz + 0.012]) };
  // Thumb: lies along the inner edge, overlapping the palm's side by 3 mm, level with its top.
  const tx0 = inner * (hx - 0.003), tx1 = inner * (hx + 0.016);
  const thumb: HandPart = { name: "thumb", box: boxAt([Math.min(tx0, tx1), hy - 0.02, -0.02], [Math.max(tx0, tx1), hy + 0.002, 0.024]) };
  // Forearm: near face ON the palm's wrist face, centred a touch low (the wrist sits under the palm's mid-line).
  const [fw, fh, fl] = FOREARM;
  const wrist: [number, number, number] = [0, -0.004, -hz];
  const forearm: HandPart = {
    name: "forearm",
    box: boxAt([wrist[0] - fw / 2, wrist[1] - fh / 2, wrist[2] - fl], [wrist[0] + fw / 2, wrist[1] + fh / 2, wrist[2]]),
    // Down towards the elbow (the old arm's −0.45 tilt), and the elbow swings a little OUTWARD:
    // Babylon's Y rotation turns the −Z far end towards −X for a positive angle, so the right arm
    // (elbow to +X) takes the negative sign — which is `inner` for that side.
    joint: { at: wrist, rotation: [-0.45, 0.15 * inner, 0] },
  };
  return [palm, fingers, thumb, forearm];
}
