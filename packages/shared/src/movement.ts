import { CollisionWorld } from "./collision";
import { PLAYER } from "./constants";
import { Btn, type BodyState, type PlayerInput } from "./types";

/**
 * Deterministic player movement. Runs on the server (authoritative) and on the client
 * (prediction). Same inputs + same start state => same result, so reconciliation only
 * has to correct for inputs the server hasn't processed yet.
 *
 * Collision model: axis-aligned box (PLAYER.halfWidth, height) swept per axis with
 * step-up for small ledges. No allocations in the hot path.
 *
 * Feel targets (pinned by movement.feel.test.ts):
 *  - time to max speed ~0.15–0.25 s for walk AND sprint (acceleration is proportional to the
 *    wish speed, Quake style, so both reach their top speed on the same curve);
 *  - stop distance from walk < 0.5 m;
 *  - jump apex ≈ 0.93 m / airtime ≈ 0.58 s independent of frame rate (velocity-Verlet gravity);
 *  - 0.4 m step-up on the ground; in the air a small "mantle" allowance lets a crouch-jump top
 *    a 1.2 m crate while a 1.3 m one stays out of reach.
 */

/** Movement tunables that live with the simulation (not networking constants). */
export const MOVE = {
  /** Speed multiplier while aiming down sights (applies on top of weapon mobility). */
  adsSpeedScale: 0.8,
  /** Airborne ledge allowance (metres above the feet) when standing: a "toe catch". */
  airStepStand: 0.15,
  /** Airborne ledge allowance while crouched: the crouch-jump tuck. */
  airStepCrouch: 0.32,
} as const;

/**
 * Tactical sprint (drop 4): a faster, gun-up sprint on a budget. Double-tap Shift latches the Tac
 * button; the simulation drains `body.tac` while it is active and refills it (slower) otherwise.
 * `minToStart` is the client-side latch threshold so a nearly empty budget cannot stutter on/off.
 */
export const TAC = {
  speedScale: 1.2,
  budgetMs: 4000,
  /** Refill rate while not tac-sprinting (ms of budget per ms). */
  refillPerMs: 0.4,
  minToStart: 900,
} as const;

/**
 * Lean (drop 4): the eye moves sideways (and a touch down) while the feet stay put. Blocked by
 * walls — `leanClearance` sweeps a head-sized box towards the lean and returns how far it got —
 * and cancelled by sprinting. The server uses the same functions to validate a shot's origin.
 */
export const LEAN = {
  offset: 0.45,
  drop: 0.1,
  /** Camera roll at full lean (radians). */
  roll: 0.14,
  /** Half-extent of the head box swept for clearance. */
  headHalf: 0.16,
} as const;

export const createBody = (x = 0, y = 0, z = 0): BodyState => ({
  x, y, z, vx: 0, vy: 0, vz: 0, grounded: false, crouching: false, jumpCooldown: 0, tac: TAC.budgetMs,
});

export function copyBody(from: BodyState, to: BodyState): void {
  to.x = from.x; to.y = from.y; to.z = from.z;
  to.vx = from.vx; to.vy = from.vy; to.vz = from.vz;
  to.grounded = from.grounded; to.crouching = from.crouching; to.jumpCooldown = from.jumpCooldown;
  to.tac = from.tac;
}

export const bodyHeight = (b: BodyState): number => (b.crouching ? PLAYER.crouchHeight : PLAYER.height);
export const eyeHeight = (b: BodyState): number => (b.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);

/**
 * Sprint rule shared by the simulation and the client's feel code (viewmodel, sprint-out delay).
 * Sprinting needs forward intent and is cancelled by crouch, aiming and firing.
 */
export function sprintActive(buttons: number, crouching: boolean): boolean {
  return (buttons & Btn.Sprint) !== 0 && (buttons & Btn.Forward) !== 0 && !crouching && (buttons & (Btn.Aim | Btn.Fire)) === 0;
}

/** Tactical sprint: a sprint with the Tac button held and budget left. */
export function tacActive(buttons: number, b: BodyState): boolean {
  return (buttons & Btn.Tac) !== 0 && b.tac > 0 && sprintActive(buttons, b.crouching);
}

/** Lean intent from the buttons: -1 left, +1 right, 0 none (both keys cancel; sprinting cancels). */
export function leanOf(buttons: number, crouching: boolean): -1 | 0 | 1 {
  if (sprintActive(buttons, crouching)) return 0;
  const l = (buttons & Btn.LeanL) !== 0, r = (buttons & Btn.LeanR) !== 0;
  return l === r ? 0 : l ? -1 : 1;
}

/**
 * Fraction (0..1) of the full lean offset that fits without the head entering a solid.
 * Deterministic (fixed 8-step search) so the server and the predicting client agree.
 */
export function leanClearance(world: CollisionWorld, b: BodyState, yaw: number, lean: number): number {
  if (lean === 0) return 0;
  const rx = Math.cos(yaw) * lean, rz = -Math.sin(yaw) * lean;
  const ey = b.y + eyeHeight(b);
  const hh = LEAN.headHalf;
  let ok = 0;
  for (let i = 1; i <= 8; i++) {
    const f = i / 8;
    const cx = b.x + rx * LEAN.offset * f, cy = ey - LEAN.drop * f, cz = b.z + rz * LEAN.offset * f;
    if (world.overlaps(cx - hh, cy - hh, cz - hh, cx + hh, cy + hh, cz + hh)) break;
    ok = f;
  }
  return ok;
}

/** Eye position including the lean (feet-relative body, view yaw, lean intent -1..1). */
export function leanEye(world: CollisionWorld, b: BodyState, yaw: number, lean: number, out: [number, number, number]): [number, number, number] {
  const c = lean === 0 ? 0 : leanClearance(world, b, yaw, Math.sign(lean)) * Math.abs(lean);
  const rx = Math.cos(yaw) * Math.sign(lean), rz = -Math.sin(yaw) * Math.sign(lean);
  out[0] = b.x + rx * LEAN.offset * c;
  out[1] = b.y + eyeHeight(b) - LEAN.drop * c;
  out[2] = b.z + rz * LEAN.offset * c;
  return out;
}

const HW = PLAYER.halfWidth;
const SKIN = 0.001;

function collides(world: CollisionWorld, x: number, y: number, z: number, h: number): boolean {
  return world.overlaps(x - HW, y, z - HW, x + HW, y + h, z + HW);
}

/**
 * Move along one axis with binary-search back-off on collision. Returns true if blocked.
 * Cheap and robust for box worlds; precision ~1 mm.
 */
function sweepAxis(world: CollisionWorld, b: BodyState, axis: 0 | 1 | 2, delta: number, h: number): boolean {
  if (delta === 0) return false;
  const ox = b.x, oy = b.y, oz = b.z;
  let nx = ox, ny = oy, nz = oz;
  if (axis === 0) nx += delta; else if (axis === 1) ny += delta; else nz += delta;
  if (!collides(world, nx, ny, nz, h)) {
    b.x = nx; b.y = ny; b.z = nz;
    return false;
  }
  // Blocked: find the largest free fraction.
  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) * 0.5;
    const tx = ox + (axis === 0 ? delta * mid : 0);
    const ty = oy + (axis === 1 ? delta * mid : 0);
    const tz = oz + (axis === 2 ? delta * mid : 0);
    if (collides(world, tx, ty, tz, h)) hi = mid; else lo = mid;
  }
  const f = Math.max(0, lo - SKIN / Math.abs(delta));
  if (axis === 0) b.x = ox + delta * f; else if (axis === 1) b.y = oy + delta * f; else b.z = oz + delta * f;
  return true;
}

/**
 * Horizontal sweep with step-up: if blocked, try lifting by the step allowance and re-sweeping.
 * On the ground the allowance is PLAYER.stepHeight; in the air it is a much smaller "mantle"
 * margin (bigger while crouching) so jumps can top a ledge the apex only just reaches.
 */
function moveHorizontal(world: CollisionWorld, b: BodyState, axis: 0 | 2, delta: number, h: number): void {
  const sx = b.x, sy = b.y, sz = b.z;
  const blocked = sweepAxis(world, b, axis, delta, h);
  if (!blocked) return;
  const step = b.grounded ? PLAYER.stepHeight : b.crouching ? MOVE.airStepCrouch : MOVE.airStepStand;
  // Attempt step-up.
  const rx = b.x, rz = b.z; // position after partial move
  b.x = sx; b.y = sy; b.z = sz;
  const lifted = !sweepAxis(world, b, 1, step, h);
  if (lifted) {
    const stepBlocked = sweepAxis(world, b, axis, delta, h);
    // Settle back down onto the step.
    sweepAxis(world, b, 1, -step, h);
    const progressStep = axis === 0 ? Math.abs(b.x - sx) : Math.abs(b.z - sz);
    const progressFlat = axis === 0 ? Math.abs(rx - sx) : Math.abs(rz - sz);
    if (!stepBlocked || progressStep > progressFlat + 1e-4) return;
  }
  // Step failed: keep flat partial move, kill velocity on this axis.
  b.x = axis === 0 ? rx : sx; b.y = sy; b.z = axis === 2 ? rz : sz;
  if (axis === 0) b.vx = 0; else b.vz = 0;
}

/**
 * Advance the body by `input.dt` milliseconds.
 * `speedScale` lets the caller apply weapon mobility.
 */
export function simulateBody(world: CollisionWorld, b: BodyState, input: PlayerInput, speedScale = 1, prevButtons = 0): void {
  const dt = Math.min(input.dt, 50) / 1000;
  if (dt <= 0) return;
  const btn = input.buttons;

  // Crouch: stand up only if there is headroom.
  const wantCrouch = (btn & Btn.Crouch) !== 0;
  if (wantCrouch !== b.crouching) {
    if (wantCrouch) b.crouching = true;
    else if (!collides(world, b.x, b.y, b.z, PLAYER.height)) b.crouching = false;
  }
  const h = bodyHeight(b);

  // Wish direction in world space from yaw.
  let fwd = 0, side = 0;
  if (btn & Btn.Forward) fwd += 1;
  if (btn & Btn.Back) fwd -= 1;
  if (btn & Btn.Right) side += 1;
  if (btn & Btn.Left) side -= 1;
  const sinY = Math.sin(input.yaw), cosY = Math.cos(input.yaw);
  // Forward vector for yaw: (sin, 0, cos) — matches Babylon's left-handed convention used on the client.
  let wx = fwd * sinY + side * cosY;
  let wz = fwd * cosY - side * sinY;
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-6) { wx /= wl; wz /= wl; }

  const sprinting = sprintActive(btn, b.crouching);
  // Tactical sprint (drop 4): faster on a draining budget; the budget refills while not in use.
  // An empty budget does NOT refill while Tac + sprint are still held — otherwise a single frame of
  // refill would re-enable it and the speed would flicker; the player has to let go first.
  const tac = tacActive(btn, b);
  if (tac) b.tac = Math.max(0, b.tac - dt * 1000);
  else if ((btn & Btn.Tac) === 0 || !sprintActive(btn, b.crouching)) b.tac = Math.min(TAC.budgetMs, b.tac + dt * 1000 * TAC.refillPerMs);
  let maxSpeed = b.crouching ? PLAYER.crouchSpeed : sprinting ? PLAYER.sprintSpeed * (tac ? TAC.speedScale : 1) : PLAYER.walkSpeed;
  if (fwd <= 0 && !b.crouching) maxSpeed *= PLAYER.strafeFactor;
  if (btn & Btn.Aim) maxSpeed *= MOVE.adsSpeedScale;
  maxSpeed *= speedScale;
  const wishSpeed = wl > 1e-6 ? maxSpeed : 0;

  if (b.grounded) {
    // Friction.
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 1e-4) {
      const control = Math.max(speed, PLAYER.stopSpeed);
      const drop = control * PLAYER.friction * dt;
      const ns = Math.max(0, speed - drop) / speed;
      b.vx *= ns; b.vz *= ns;
    } else { b.vx = 0; b.vz = 0; }
    // Acceleration towards wish velocity, proportional to the wish speed (Quake): walk, sprint
    // and crouch all reach their top speed in the same time.
    if (wishSpeed > 0) {
      const cur = b.vx * wx + b.vz * wz;
      const add = wishSpeed - cur;
      if (add > 0) {
        const acc = Math.min(add, PLAYER.groundAccel * wishSpeed * dt);
        b.vx += wx * acc; b.vz += wz * acc;
      }
    }
    // Clamp to max speed on ground.
    const s2 = Math.hypot(b.vx, b.vz);
    if (s2 > maxSpeed) { b.vx *= maxSpeed / s2; b.vz *= maxSpeed / s2; }
  } else if (wishSpeed > 0) {
    // Air control (Quake-style limited acceleration).
    const cur = b.vx * wx + b.vz * wz;
    const add = Math.min(wishSpeed, PLAYER.airMaxSpeed) - cur;
    if (add > 0) {
      const acc = Math.min(add, PLAYER.airAccel * dt);
      b.vx += wx * acc; b.vz += wz * acc;
    }
  }

  // Jump (edge-triggered so holding space doesn't pogo).
  if (b.jumpCooldown > 0) b.jumpCooldown = Math.max(0, b.jumpCooldown - dt * 1000);
  const jumpPressed = (btn & Btn.Jump) !== 0 && (prevButtons & Btn.Jump) === 0;
  if (jumpPressed && b.grounded && b.jumpCooldown === 0) {
    b.vy = PLAYER.jumpVelocity;
    b.grounded = false;
  }

  // Gravity, velocity-Verlet: the position step uses the average of the old and new velocity so
  // the ballistic arc (apex, airtime) does not depend on the frame rate.
  let dy = 0;
  if (!b.grounded) {
    const v0 = b.vy;
    b.vy = Math.max(PLAYER.terminalVelocity, v0 + PLAYER.gravity * dt);
    dy = (v0 + b.vy) * 0.5 * dt;
  } else if (b.vy < 0) b.vy = 0;

  // Integrate with per-axis sweeps.
  moveHorizontal(world, b, 0, b.vx * dt, h);
  moveHorizontal(world, b, 2, b.vz * dt, h);

  const wasGrounded = b.grounded;
  if (dy !== 0) {
    const blocked = sweepAxis(world, b, 1, dy, h);
    if (blocked) {
      if (dy < 0) {
        if (!wasGrounded) b.jumpCooldown = PLAYER.jumpCooldownMs;
        b.grounded = true;
      }
      b.vy = 0;
    } else if (dy < 0) {
      b.grounded = false;
    }
  }
  // Ground probe: stay grounded when standing on something (avoids flicker on flat floors).
  if (b.vy <= 0) {
    const onGround = collides(world, b.x, b.y - 0.02, b.z, h);
    if (onGround && !b.grounded) { b.grounded = true; b.vy = 0; }
    else if (!onGround && b.grounded) {
      // Snap down small drops (stairs) so we don't go airborne on every step.
      const sy = b.y;
      const hit = sweepAxis(world, b, 1, -PLAYER.stepHeight, h);
      if (!hit) { b.y = sy; b.grounded = false; }
    }
  }
}
