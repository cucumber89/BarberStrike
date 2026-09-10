/**
 * The free camera a spectator flies the map with — as arithmetic, with no Babylon in it.
 *
 * The camera is the whole point of `/viewer`: it is how a match gets watched and, just as much, how
 * the map gets LOOKED AT. That makes its feel worth testing rather than tuning by hand in a
 * browser, and the only way to test it in this repo's node runner is to keep the maths out of the
 * engine. `ViewerScene` owns the Babylon camera and does nothing but apply what this returns.
 *
 * It is deliberately NOT the player's mover: no gravity, no collision, no step height. A spectator
 * flies through walls on purpose — half the reason to have one is to get behind the geometry and
 * see whether a wall is where it should be.
 */

/** Metres per second at rest, and the multiplier while the boost key is held. */
export const FLY_SPEED = 9;
export const FLY_BOOST = 4;
/** Slow, for looking closely at a joint or a sign. */
export const FLY_CRAWL = 0.25;
/** Radians per pixel of mouse movement — matched to the game's default so the hands feel the same. */
export const FLY_SENSITIVITY = 0.0022;
/**
 * The longest frame that may move the camera. A tab that was asleep for two seconds comes back
 * with one enormous delta, and without this the first frame fires the viewer across the map.
 */
export const MAX_FRAME_MS = 100;

/** Straight up and straight down stay just short of the pole, where yaw would flip. */
export const MAX_PITCH = Math.PI / 2 - 0.01;

export interface FlyInput {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  up: boolean; down: boolean;
  boost: boolean; crawl: boolean;
}

export interface FlyPose { x: number; y: number; z: number; yaw: number; pitch: number }

export const NO_INPUT: FlyInput = { forward: false, back: false, left: false, right: false, up: false, down: false, boost: false, crawl: false };

/**
 * Where the look ends up after a mouse move. Pitch is clamped rather than wrapped: a camera that
 * rolls over the top is disorienting and, for someone checking whether a roof is watertight, wrong.
 */
export function look(pose: FlyPose, dx: number, dy: number, sensitivity = FLY_SENSITIVITY): FlyPose {
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pose.pitch + dy * sensitivity));
  return { ...pose, yaw: pose.yaw + dx * sensitivity, pitch };
}

/**
 * One frame of movement. The horizontal axes follow the yaw so "forward" means "where I am
 * looking", including downwards — a spectator diving at the ground expects to arrive at it — while
 * up/down stay world-vertical, which is what makes it possible to hold a height and orbit a
 * building. Diagonals are normalised, so cutting a corner is not a speed boost.
 */
export function fly(pose: FlyPose, input: FlyInput, dtMs: number): FlyPose {
  const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const az = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const ay = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  if (!ax && !ay && !az) return pose;
  const len = Math.hypot(ax, ay, az);
  const speed = FLY_SPEED * (input.boost ? FLY_BOOST : 1) * (input.crawl ? FLY_CRAWL : 1);
  const step = (speed * Math.min(dtMs, MAX_FRAME_MS)) / 1000 / len;
  // Forward is the full look vector; strafe is horizontal, so a banked view does not roll the world.
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const fx = Math.sin(pose.yaw) * cp, fy = -sp, fz = Math.cos(pose.yaw) * cp;
  const sx = Math.cos(pose.yaw), sz = -Math.sin(pose.yaw);
  return {
    ...pose,
    x: pose.x + (fx * az + sx * ax) * step,
    y: pose.y + (fy * az + ay) * step,
    z: pose.z + (fz * az + sz * ax) * step,
  };
}

/** The key a physical code maps to, so the bindings live in one readable table. */
export function readKeys(held: ReadonlySet<string>): FlyInput {
  const on = (...codes: string[]) => codes.some((c) => held.has(c));
  return {
    forward: on("KeyW", "ArrowUp"), back: on("KeyS", "ArrowDown"),
    left: on("KeyA", "ArrowLeft"), right: on("KeyD", "ArrowRight"),
    up: on("Space"), down: on("ControlLeft", "ControlRight", "KeyC"),
    boost: on("ShiftLeft", "ShiftRight"), crawl: on("AltLeft", "AltRight"),
  };
}
