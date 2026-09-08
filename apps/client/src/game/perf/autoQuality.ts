/**
 * Automatic quality: pick a level from what the device can actually do, then keep it there.
 *
 * Three rules, and they exist because the failure modes are worse than the problem:
 *
 * 1. NEVER OSCILLATE. A game that flips between sharp and soft every few seconds is more annoying
 *    than one that is simply a bit soft, and a quality change costs a frame or two of its own —
 *    so a director that thrashes makes the very thing it is measuring worse. Stepping down needs
 *    a sustained bad stretch; stepping up needs a much longer good one, and every step up must
 *    clear a margin, not merely the threshold it fell through (that gap IS the anti-flap).
 * 2. ONE STEP AT A TIME, so a change is a nudge rather than the picture falling apart.
 * 3. GIVE UP GRACEFULLY. After a few reversals the director stops raising quality for the rest of
 *    the session and settles at the level that held. A machine that sits exactly on a boundary
 *    should end up stable, not busy.
 *
 * Pure logic, no engine: `installPerf` feeds it frame times and applies what it returns.
 */

/** The three levels automatic mode chooses between; "ultra" stays a deliberate manual choice. */
export type AutoTier = "low" | "medium" | "high";
export const AUTO_TIERS: readonly AutoTier[] = ["low", "medium", "high"];

export interface AutoQualityOptions {
  /** Frames per second the director is trying to protect. */
  targetFps?: number;
  /** Step DOWN after this long above the slow threshold. */
  downHoldMs?: number;
  /** Step UP only after this long comfortably below it — deliberately much longer. */
  upHoldMs?: number;
  /** Ignore everything for this long after a change (the change itself costs frames). */
  settleMs?: number;
  /** Headroom a level must show before the director will try the next one up. */
  upMarginMs?: number;
  /** After this many down-after-up reversals, stop trying to go up at all. */
  maxReversals?: number;
}

export interface AutoQualityState {
  tier: AutoTier;
  /** How many times a step up was undone; at `maxReversals` the ceiling is locked. */
  reversals: number;
  locked: boolean;
}

export class AutoQuality {
  private opts: Required<AutoQualityOptions>;
  private ema = 16.7;
  private good = 0;
  private bad = 0;
  private settle = 0;
  private index: number;
  private reversals = 0;
  private lockedCeiling: number | null = null;
  /** Set when the last change was a step UP, so an immediate step down counts as a reversal. */
  private lastWasUp = false;

  constructor(start: AutoTier = "medium", opts: AutoQualityOptions = {}) {
    this.opts = {
      targetFps: 60, downHoldMs: 2500, upHoldMs: 9000, settleMs: 2000, upMarginMs: 3.5, maxReversals: 2,
      ...opts,
    };
    this.index = Math.max(0, AUTO_TIERS.indexOf(start));
  }

  get tier(): AutoTier { return AUTO_TIERS[this.index]; }
  get smoothedMs(): number { return this.ema; }
  get state(): AutoQualityState {
    return { tier: this.tier, reversals: this.reversals, locked: this.lockedCeiling !== null };
  }

  /** Frame budget in ms the director is defending. */
  private get budgetMs(): number { return 1000 / this.opts.targetFps; }

  setTargetFps(fps: number): void { this.opts.targetFps = Math.max(30, Math.min(240, fps)); }

  /** The player moved the slider by hand: adopt it and forget every judgement made so far. */
  reset(tier: AutoTier): void {
    this.index = Math.max(0, AUTO_TIERS.indexOf(tier));
    this.good = this.bad = 0;
    this.settle = this.opts.settleMs;
    this.reversals = 0;
    this.lockedCeiling = null;
    this.lastWasUp = false;
  }

  /**
   * Feed one frame. Returns the new tier when it changed, else null.
   *
   * `dt` is the frame time in ms. Pass only frames that were really rendered — a backgrounded tab
   * or a shader compile is not the GPU being slow, and treating it as such drops quality for a
   * hitch the player never saw.
   */
  update(dt: number): AutoTier | null {
    // A single 300 ms hitch (asset decode, GC) must not drag the average into "step down" on its
    // own; clamping the sample keeps one bad frame from outweighing a second of good ones.
    this.ema += (Math.min(dt, 100) - this.ema) * 0.06;
    if (this.settle > 0) { this.settle -= dt; return null; }

    const slow = this.ema > this.budgetMs;
    const fast = this.ema < this.budgetMs - this.opts.upMarginMs;
    if (slow) { this.bad += dt; this.good = 0; } else if (fast) { this.good += dt; this.bad = 0; } else { this.good = this.bad = 0; }

    if (this.bad >= this.opts.downHoldMs && this.index > 0) {
      this.index--;
      if (this.lastWasUp) {
        // We raised quality and had to take it straight back: this machine sits on the boundary.
        this.reversals++;
        if (this.reversals >= this.opts.maxReversals) this.lockedCeiling = this.index;
      }
      this.lastWasUp = false;
      this.after();
      return this.tier;
    }
    const ceiling = this.lockedCeiling ?? AUTO_TIERS.length - 1;
    if (this.good >= this.opts.upHoldMs && this.index < ceiling) {
      this.index++;
      this.lastWasUp = true;
      this.after();
      return this.tier;
    }
    return null;
  }

  private after(): void {
    this.good = this.bad = 0;
    this.settle = this.opts.settleMs;
    this.ema = this.budgetMs; // do not judge the new level on the old level's frames
  }
}
