/**
 * Dynamic render scale: the one safety valve that works on every GPU. Pure logic (no engine),
 * so it is unit-tested; `installPerf` feeds it frame times and applies the result.
 *
 * Rules (hysteresis, so the scale never oscillates):
 * - Frame time is smoothed (EMA). Above `slowMs` for `holdMs` → step DOWN as far as the measurement
 *   says is needed. Below `fastMs` for `holdMs` → step UP by ONE notch.
 * - Steps are 10% of the user's chosen scale; the floor is `minFactor` of it (never below 0.5 abs).
 * - After any step the next decision waits `cooldownMs` (a scale change costs a frame or two itself).
 *
 * DOWN IS NOT SYMMETRIC WITH UP, and that is the point. One notch per hold-plus-cooldown is 2.1 s,
 * so a machine that needs the floor took EIGHT AND A HALF SECONDS of unplayable frames to get
 * there — measured on the software renderer, which needs all four notches: it stepped at 4.3 s,
 * 10.0 s, 13.5 s and 16.2 s. That slow crawl IS the "it runs badly" experience, arriving exactly
 * when a player is forming their first impression. Cost scales with the number of pixels, so the
 * frame time says how far to jump: halving the frame time means scaling by sqrt(1/2). Going UP
 * stays one notch at a time — overshooting downwards costs sharpness for a second, overshooting
 * upwards costs frames, and only one of those is felt as the game breaking.
 */
export interface DynamicScaleOptions {
  target: number;      // user's render scale (0.5..1)
  slowMs?: number;     // step down above this smoothed frame time (default 20 ms ≈ 50 fps)
  fastMs?: number;     // step up below this (default 12.5 ms ≈ 80 fps)
  holdMs?: number;     // how long the condition must persist (default 600 ms)
  cooldownMs?: number; // pause after a step (default 1500 ms)
  minFactor?: number;  // lowest scale as a fraction of target (default 0.6)
}

export class DynamicScale {
  private ema = 16;
  private since = 0;     // ms the current condition has persisted
  private cooldown = 0;
  private notch = 0;     // 0 = target, each notch = -10 %
  private readonly maxNotch: number;
  private readonly opts: Required<DynamicScaleOptions>;

  constructor(opts: DynamicScaleOptions) {
    this.opts = { slowMs: 20, fastMs: 12.5, holdMs: 600, cooldownMs: 1500, minFactor: 0.6, ...opts };
    this.maxNotch = Math.max(0, Math.round((1 - this.opts.minFactor) / 0.1));
  }

  /** Current absolute render scale. */
  get scale(): number {
    return Math.max(0.5, this.opts.target * (1 - 0.1 * this.notch));
  }

  get smoothedMs(): number { return this.ema; }

  /** Feed one frame; returns the new scale when it changed, else null. */
  update(frameMs: number): number | null {
    const dt = Math.min(100, Math.max(0, frameMs));
    this.ema += (dt - this.ema) * 0.1;
    if (this.cooldown > 0) { this.cooldown -= dt; return null; }
    const slow = this.ema > this.opts.slowMs && this.notch < this.maxNotch;
    const fast = this.ema < this.opts.fastMs && this.notch > 0;
    if (!slow && !fast) { this.since = 0; return null; }
    this.since += dt;
    if (this.since < this.opts.holdMs) return null;
    this.since = 0;
    this.cooldown = this.opts.cooldownMs;
    this.notch = slow
      ? Math.min(this.maxNotch, this.notch + this.notchesFor(this.ema))
      : this.notch - 1;
    return this.scale;
  }

  /**
   * How many notches down a frame time of `ms` calls for, at least one.
   *
   * Render cost goes with the pixel count, so the linear scale wanted is sqrt(slowMs / ms) — and a
   * notch is 10% of the target. Aim slightly INSIDE the slow threshold rather than at it, or the
   * answer is a scale that is exactly as slow as the thing being escaped from.
   */
  private notchesFor(ms: number): number {
    const want = Math.sqrt((this.opts.slowMs * 0.85) / ms);
    return Math.max(1, Math.round((1 - want) / 0.1) - this.notch);
  }

  /** User changed the base scale: restart from it. */
  retarget(target: number): void {
    this.opts.target = target;
    this.notch = 0;
    this.since = 0;
    this.cooldown = this.opts.cooldownMs;
  }
}
