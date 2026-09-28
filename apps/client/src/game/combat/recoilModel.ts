/**
 * Realistic recoil (owner, 2026-09-28: "realistyczny odrzut broni podczas strzelania").
 *
 * What it replaces: every shot used to TELEPORT the view by its pattern step, and the view then
 * decayed back exponentially — full speed the instant the hold ran out. A real gun does neither.
 * The muzzle is driven up by an impulse, so it RISES over a few tens of milliseconds; the shooter's
 * arms then bring it back down, which starts slowly, speeds up and eases into the target — a
 * critically damped spring, not an exponential. On top of that the body takes a hit the bullet
 * never sees: the head snaps, the shoulder rolls, and both are gone in a tenth of a second.
 *
 * Three parts, and only the first is aim:
 *
 * - `AimRecoil` — the offset the bullets follow. Its TOTAL per shot is exactly the weapon's pattern
 *   step (so every TTK, spray and signature number stays where Drop B tuned it); what changes is the
 *   path the view takes to get there and back. It rides the input angles like before, so the server
 *   checks each shot against the aim the shooter saw (handoff P1).
 * - `ViewPunch` — camera-only pitch and roll that springs back with a little overshoot. It never
 *   enters the input, never moves a bullet, and roll by construction cannot move the aim point.
 * - `stanceScale` — the body the gun is fired from: braced on a crouch it climbs less, on the move
 *   more, in the air much more. Camera-side like the ADS scale always was; the server's cone is its
 *   own (`effectiveSpread`), so this is feel, not a hidden accuracy buff.
 *
 * Pure: no Babylon, no DOM, the clock is passed in. `recoilModel.test.ts` judges it.
 */

/** Per weapon: how the kick is delivered. Lives in the feel table (`weaponFeel.ts`). */
export interface RecoilShape {
  /** Time for the muzzle to finish rising (ms). Kept well under the fire interval of automatics. */
  kickMs: number;
  /** Camera-only punch as a fraction of the aim kick (0 = none). */
  punch: number;
  /** Camera roll per shot (rad), random side. */
  roll: number;
}

export const DEFAULT_SHAPE: RecoilShape = { kickMs: 30, punch: 0.3, roll: 0.006 };

/** How a stance changes the kick. Mirrors the shape of the server's spread modifiers, softer. */
export const STANCE = { crouch: 0.82, moving: 1.12, airborne: 1.45, aimed: 0.7, punchAimed: 0.35 } as const;

export interface Stance { crouching: boolean; moving: boolean; airborne: boolean; aiming: boolean }

/** Multiplier on the aim kick for the body the shot is fired from. */
export function stanceScale(s: Stance): number {
  let k = s.aiming ? STANCE.aimed : 1;
  if (s.airborne) k *= STANCE.airborne;
  else {
    if (s.crouching) k *= STANCE.crouch;
    if (s.moving) k *= STANCE.moving;
  }
  return k;
}

/**
 * A critically damped spring's exact step: no overshoot, no framerate dependence, stable at any dt.
 * x(t) = (x0 + (v0 + w x0) t) e^{-wt}; returns the new [x, v] in `out`.
 */
export function criticalStep(x0: number, v0: number, w: number, dt: number, out: [number, number]): [number, number] {
  const e = Math.exp(-w * dt);
  const c = v0 + w * x0;
  out[0] = (x0 + c * dt) * e;
  out[1] = (v0 - w * c * dt) * e;
  return out;
}

/**
 * Converts the old exponential "recover per second" into the spring's angular frequency so the two
 * settle to 5 % at the same moment: e^{-r t} = 0.05 at r t = 3.0; (1 + w t) e^{-w t} = 0.05 at
 * w t = 4.74. Heavy guns that used to come back slowly still do.
 */
export const springRate = (recoverPerSec: number): number => recoverPerSec * (4.74 / 3);

const tmp: [number, number] = [0, 0];

/** The aim offset the bullets follow: rise over `kickMs`, hold, then a critically damped return. */
export class AimRecoil {
  /** Current offsets (rad). Pitch UP is negative, as on the camera. */
  pitch = 0;
  yaw = 0;
  /** Kick still to be delivered by the rise. */
  private owedPitch = 0;
  private owedYaw = 0;
  private vPitch = 0;
  private vYaw = 0;
  private tau = 0.01;
  private omega = 12;
  private holdUntil = 0;

  /**
   * A shot. `up` / `side` are the pattern step (already stance-scaled); the view will have moved by
   * exactly that much once the rise completes (95 % by `kickMs`, the rest in the next few frames).
   */
  kick(up: number, side: number, kickMs: number, recoverPerSec: number, holdMs: number, now: number): void {
    this.owedPitch -= up;
    this.owedYaw += side;
    // A third of the rise time: e^{-3} leaves 5 % owed at `kickMs`.
    this.tau = Math.max(0.002, kickMs / 3000);
    this.omega = springRate(recoverPerSec);
    this.holdUntil = now + Math.max(holdMs, kickMs);
    // The arms stop pulling back the moment the next shot goes: the new kick owns the gun.
    this.vPitch = 0; this.vYaw = 0;
  }

  /** Advances the rise and, after the hold, the return. `dt` in seconds, `now` in ms. */
  step(dt: number, now: number): void {
    if (this.owedPitch !== 0 || this.owedYaw !== 0) {
      const f = 1 - Math.exp(-dt / this.tau);
      const dp = this.owedPitch * f, dy = this.owedYaw * f;
      this.pitch += dp; this.yaw += dy;
      this.owedPitch -= dp; this.owedYaw -= dy;
      if (Math.abs(this.owedPitch) < 1e-5) { this.pitch += this.owedPitch; this.owedPitch = 0; }
      if (Math.abs(this.owedYaw) < 1e-5) { this.yaw += this.owedYaw; this.owedYaw = 0; }
    }
    if (now < this.holdUntil) return;
    // The return. A critically damped spring cannot overshoot from rest, but mouse compensation
    // (`spend`) can leave velocity pointing past zero — so a crossing is clamped to rest at zero,
    // never allowed to swing the view the other way.
    const p0 = this.pitch, y0 = this.yaw;
    criticalStep(this.pitch, this.vPitch, this.omega, dt, tmp); this.pitch = tmp[0]; this.vPitch = tmp[1];
    criticalStep(this.yaw, this.vYaw, this.omega, dt, tmp); this.yaw = tmp[0]; this.vYaw = tmp[1];
    if (p0 !== 0 && Math.sign(this.pitch) !== Math.sign(p0)) { this.pitch = 0; this.vPitch = 0; }
    if (y0 !== 0 && Math.sign(this.yaw) !== Math.sign(y0)) { this.yaw = 0; this.vYaw = 0; }
    if (Math.abs(this.pitch) < 1e-4 && Math.abs(this.vPitch) < 1e-3) { this.pitch = 0; this.vPitch = 0; }
    if (Math.abs(this.yaw) < 1e-4 && Math.abs(this.vYaw) < 1e-3) { this.yaw = 0; this.vYaw = 0; }
  }

  /**
   * The shooter pulled down against the climb: that much of the recoil is already dealt with, and
   * the view must not spring back over their correction. Same rule as before the spring.
   */
  spendPitch(mouseDelta: number): void {
    if (this.pitch === 0 || mouseDelta === 0 || Math.sign(mouseDelta) === Math.sign(this.pitch)) return;
    const spend = Math.min(Math.abs(this.pitch), Math.abs(mouseDelta));
    this.pitch -= Math.sign(this.pitch) * spend;
  }

  /** Where the view ends up once the rise completes: what `weapon-signature.mjs` samples at a shot. */
  get totalPitch(): number { return this.pitch + this.owedPitch; }
  get totalYaw(): number { return this.yaw + this.owedYaw; }

  reset(): void {
    this.pitch = this.yaw = this.owedPitch = this.owedYaw = this.vPitch = this.vYaw = 0;
    this.holdUntil = 0;
  }
}

/**
 * One underdamped spring: an impulse throws it out, it comes back past zero a little and settles.
 * The overshoot is what makes a kick read as a body absorbing a blow rather than a value decaying.
 */
export class Spring {
  x = 0;
  v = 0;
  constructor(public omega: number, public zeta: number) {}

  /** Adds velocity so a spring at rest peaks at about `peak`. */
  impulse(peak: number): void {
    // For zeta ~0.5 the first peak of an impulse response is ~0.53 v/w (exactly v/(e w) at zeta 1).
    this.v += (peak * this.omega) / peakFactor(this.zeta);
  }

  step(dt: number): void {
    // Semi-implicit Euler, sub-stepped so a long frame cannot blow the spring up.
    const n = Math.max(1, Math.ceil((dt * this.omega) / 0.25));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.omega * this.omega * this.x - 2 * this.zeta * this.omega * this.v) * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.x) < 1e-6 && Math.abs(this.v) < 1e-5) { this.x = 0; this.v = 0; }
  }

  reset(): void { this.x = 0; this.v = 0; }
}

/** Peak of the unit-velocity impulse response of a spring with this damping, times omega. */
export function peakFactor(zeta: number): number {
  if (zeta >= 1) return 1 / Math.E;
  const wd = Math.sqrt(1 - zeta * zeta);
  const tPeak = Math.atan2(wd, zeta) / wd; // in units of 1/omega
  return Math.exp(-zeta * tPeak) * Math.sin(wd * tPeak) / wd;
}

/** Camera-only punch: pitch and roll, springing back with a little overshoot. Never aim. */
export class ViewPunch {
  readonly pitch = new Spring(34, 0.52);
  readonly roll = new Spring(26, 0.45);

  /** `up` is the aim kick (rad) this shot put on the view. */
  hit(up: number, shape: RecoilShape, aiming: boolean, rnd: () => number): void {
    const k = aiming ? STANCE.punchAimed : 1;
    if (shape.punch > 0) this.pitch.impulse(-up * shape.punch * k);
    if (shape.roll > 0) this.roll.impulse((rnd() < 0.5 ? -1 : 1) * shape.roll * (0.6 + 0.4 * rnd()) * k);
  }

  step(dt: number): void { this.pitch.step(dt); this.roll.step(dt); }
  reset(): void { this.pitch.reset(); this.roll.reset(); }
}
