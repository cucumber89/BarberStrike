import { PLAYER, wrapAngle } from "@frankibarber/shared";

/**
 * Drop U (P1): THE DEATH CAM, CS2's first beat of death (docs/UI_U_SPEC.md §7 P1 (i), §6.1).
 *
 * The eye drops 0.9 m over 400 ms — the body going down — and turns to face the killer over
 * 600 ms, so the first thing a dead player sees is who did it. Nothing else moves: no roll, no FOV
 * change, no chase camera, no outline (veto). Pure: the local player applies the pose it returns
 * while dead (`LocalPlayer.deadView`) and drops it at the spawn, which is what makes the spawn pose
 * exact — the death cam never writes the player's own yaw, pitch or body, it only overrides what
 * the camera shows.
 *
 * The direction to the killer is the one the kill already uses to throw a body away from its
 * killer (`view/index.ts`, "Deaths fall away from the killer"): `killer − victim` on the ground,
 * as a yaw of `atan2(dx, dz)` — the convention of `aimDirection` and of the e2e `lookAt`.
 */
export const DEATH_CAM = {
  /** How far the eye falls, and over how long. */
  dropM: 0.9, dropMs: 400,
  /** How long the turn to the killer takes. */
  turnMs: 600,
  /** The eye never goes lower than this over the body's feet (a crouched death has less to fall). */
  minEyeM: 0.2,
  /** Where on the killer the eye settles: their eye, so a standing killer is looked in the face. */
  aimAtM: PLAYER.eyeHeight,
  /** The view's own pitch limit (`LocalPlayer`'s MAX_PITCH). */
  maxPitch: 1.5,
} as const;

/** A camera pose: where the eye is and where it looks (yaw and pitch as `LocalPlayer` has them). */
export interface Pose { x: number; y: number; z: number; yaw: number; pitch: number }

/** One death, as the cam needs it: the pose the player died with, the feet under it, and when. */
export interface DeathCam {
  from: Readonly<Pose>;
  /** The body's feet (the eye cannot fall through them). */
  floorY: number;
  /** Local time of the death (`performance.now()`). */
  at: number;
}

export const startDeathCam = (from: Pose, floorY: number, at: number): DeathCam => ({ from: { ...from }, floorY, at });

/** Ease-out cubic: the fall is fast, then settles. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
/** Ease-in-out cubic: the head turns, it does not snap. */
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** The yaw and pitch that look from `eye` at `target` (`killer − victim`, as the kill throws the body). */
export function faceTo(eye: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): { yaw: number; pitch: number } {
  const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y - eye.y;
  const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  return { yaw: Math.atan2(dx, dz), pitch: Math.max(-DEATH_CAM.maxPitch, Math.min(DEATH_CAM.maxPitch, pitch)) };
}

/**
 * The pose `now`, into `out`. `killer` is the killer's FEET where the game can see them (they may
 * still move: the view keeps facing them), or null for a self-kill — then the eye only falls.
 */
export function deathCamPose(cam: DeathCam, killer: { x: number; y: number; z: number } | null, now: number, out: Pose): Pose {
  const t = Math.max(0, now - cam.at);
  const f = cam.from;
  const drop = Math.min(DEATH_CAM.dropM, Math.max(0, f.y - (cam.floorY + DEATH_CAM.minEyeM))) * easeOut(clamp01(t / DEATH_CAM.dropMs));
  out.x = f.x; out.y = f.y - drop; out.z = f.z;
  out.yaw = f.yaw; out.pitch = f.pitch;
  if (killer) {
    const want = faceTo(out, { x: killer.x, y: killer.y + DEATH_CAM.aimAtM, z: killer.z });
    const k = easeInOut(clamp01(t / DEATH_CAM.turnMs));
    // The short way round, and landing EXACTLY on the target once the turn is over.
    out.yaw = k >= 1 ? want.yaw : wrapAngle(f.yaw + wrapAngle(want.yaw - f.yaw) * k);
    out.pitch = k >= 1 ? want.pitch : f.pitch + (want.pitch - f.pitch) * k;
  }
  return out;
}
