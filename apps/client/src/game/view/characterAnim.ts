/**
 * Character animation selection (drop 6b) — pure, so the blend can be unit-tested headlessly.
 *
 * The Quaternius pack gives four directional locomotion clips (Run, Run_Back, Run_Left, Run_Right)
 * plus Walk, and nothing in between. A player strafing at 45° is between two of them, so the blend
 * picks the two nearest directions and splits the weight between them by angle. Below `runSpeed`
 * the same direction blend cross-fades into Walk instead, and standing still lands on Idle_Gun.
 *
 * `moveDir` is the direction of travel RELATIVE TO FACING, in radians: 0 = straight ahead,
 * +π/2 = strafing right, π = backwards (the same convention `RemotePlayer` already computes).
 */

export type ClipName =
  | "Idle" | "Idle_Gun" | "Idle_Gun_Pointing" | "Idle_Gun_Shoot" | "Idle_Neutral" | "Idle_Sword"
  | "Walk" | "Run" | "Run_Back" | "Run_Left" | "Run_Right" | "Run_Shoot"
  | "Gun_Shoot" | "Death" | "HitRecieve" | "HitRecieve_2" | "Interact" | "Roll" | "Wave"
  | "Kick_Left" | "Kick_Right" | "Punch_Left" | "Punch_Right" | "Sword_Slash";

/** Every clip the pack ships, in file order — used to check a rig has what we expect. */
export const PACK_CLIPS: readonly ClipName[] = [
  "Death", "Gun_Shoot", "HitRecieve", "HitRecieve_2", "Idle", "Idle_Gun", "Idle_Gun_Pointing",
  "Idle_Gun_Shoot", "Idle_Neutral", "Idle_Sword", "Interact", "Kick_Left", "Kick_Right",
  "Punch_Left", "Punch_Right", "Roll", "Run", "Run_Back", "Run_Left", "Run_Right", "Run_Shoot",
  "Sword_Slash", "Walk", "Wave",
];

/**
 * The clips the game actually drives. The pack ships 24; the other twelve (Idle_Sword, Roll, Wave,
 * the kicks…) have no caller, and keeping them is not free: Babylon evaluates every animation of
 * every PLAYING group each frame, per character. MEASURED with three skinned players on a software
 * renderer, all 24 groups running: 8 rendered frames in ten seconds and an 886 ms round-trip, i.e.
 * the client was pinned. Anything not named here is disposed as the character is built.
 */
export const USED_CLIPS: readonly ClipName[] = [
  "Idle_Gun", "Walk", "Run", "Run_Back", "Run_Left", "Run_Right",
  "Gun_Shoot", "HitRecieve", "HitRecieve_2", "Death", "Interact", "Punch_Right",
];

/** The four directional clips at their cardinal angles (radians, relative to facing). */
const DIRS: { angle: number; clip: ClipName }[] = [
  { angle: 0, clip: "Run" },
  { angle: Math.PI / 2, clip: "Run_Right" },
  { angle: Math.PI, clip: "Run_Back" },
  { angle: -Math.PI / 2, clip: "Run_Left" },
];

const wrap = (a: number): number => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * Weights for the locomotion layer. Returns the clips that should be non-zero this frame; the
 * caller sets every other clip to 0. Weights always sum to 1 so the rig never under- or
 * over-drives the skeleton (a sum below 1 leaves the character in a half-collapsed bind pose).
 */
export function locomotion(speed: number, moveDir: number, grounded: boolean, runSpeed: number): [ClipName, number][] {
  // Airborne or standing: one idle clip, full weight. The pack has no jump clip; the body keeps its
  // gun-idle pose while the root's own arc (driven by RemotePlayer) sells the jump.
  if (!grounded || speed < 0.35) return [["Idle_Gun", 1]];

  // Direction blend: the two cardinal clips either side of the travel direction.
  const a = wrap(moveDir);
  let lo = DIRS[0], hi = DIRS[0], best = Infinity, second = Infinity;
  for (const d of DIRS) {
    const diff = Math.abs(wrap(d.angle - a));
    if (diff < best) { second = best; hi = lo; best = diff; lo = d; }
    else if (diff < second) { second = diff; hi = d; }
  }
  const span = Math.abs(wrap(hi.angle - lo.angle)) || Math.PI / 2;
  const t = Math.max(0, Math.min(1, best / span));
  const dirWeights: [ClipName, number][] = lo.clip === hi.clip ? [[lo.clip, 1]] : [[lo.clip, 1 - t], [hi.clip, t]];

  // Speed blend: walk under `runSpeed`, run above it, crossfaded over the last third.
  const run = Math.max(0, Math.min(1, (speed - runSpeed * 0.66) / (runSpeed * 0.34)));
  if (run >= 1) return dirWeights;
  const out: [ClipName, number][] = [["Walk", 1 - run]];
  for (const [clip, w] of dirWeights) if (w * run > 0) out.push([clip, w * run]);
  return out;
}

/** The one-shot clip for a transient state, or null when nothing should interrupt locomotion. */
export function pickClip(state: { dead: boolean; firing: boolean; flinch: "body" | "head" | null; throwing: boolean; reloading: boolean }): ClipName | null {
  if (state.dead) return "Death";
  if (state.flinch) return state.flinch === "head" ? "HitRecieve_2" : "HitRecieve";
  if (state.throwing) return "Punch_Right";
  if (state.firing) return "Gun_Shoot";
  // The pack has no reload clip; `Interact` is the closest thing to fiddling with the weapon.
  if (state.reloading) return "Interact";
  return null;
}
