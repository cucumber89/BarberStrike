/**
 * FPS meter (drop V, P8c). Pure frame-time bookkeeping, no engine and no DOM, so `fpsMeter.test.ts`
 * pins it without a browser and both the in-game `PerfBadge` and the headless `fps-stream.mjs` tool
 * feed it the same way: push every rendered frame's `dt` (ms), read back a MEDIAN frame time and the
 * FPS it implies, and ask whether the machine has been "barely keeping up" long enough to warn.
 *
 * MEDIAN, not mean, on purpose (same reason `deviceProbe` measures the median): one 300 ms GC hitch
 * or asset decode must not decide that the hardware is slow. The badge reads a rolling window; the
 * warning banner ("sprzęt ledwo nadąża") is a separate, slower judgement — it fires only when the
 * measured FPS stays under `WARN_FPS` for at least `WARN_HOLD_MS`, and clears once it recovers.
 */

/** The acceptance threshold from V_SPEC section 2: below this FPS the machine is judged to struggle. */
export const WARN_FPS = 40;
/** How long FPS must sit under `WARN_FPS` before the banner shows — three seconds, from the spec. */
export const WARN_HOLD_MS = 3000;

/** A frame time (ms) that maps to at least 1000 fps is treated as this floor, so FPS never divides by ~0. */
const MIN_FRAME_MS = 1;

/** The reading the badge paints: median frame time (ms), the FPS it implies, and how many frames it saw. */
export interface FpsReading {
  /** Median frame time over the window, in milliseconds. 0 before any frame is seen. */
  frameMs: number;
  /** Whole FPS implied by `frameMs` (`round(1000 / frameMs)`). 0 before any frame is seen. */
  fps: number;
  /** Frames the window currently holds. */
  samples: number;
}

/** The whole-number FPS a median frame time implies. */
export function fpsFromFrameMs(frameMs: number): number {
  if (frameMs <= 0) return 0;
  return Math.round(1000 / Math.max(MIN_FRAME_MS, frameMs));
}

/** The median of frame times, without mutating the caller's array. 0 for an empty window. */
export function medianFrameMs(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  // Even count: average the two middle samples so a 2-frame window is not just the larger one.
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface FpsMeterOptions {
  /** How many recent frames the median is taken over. */
  window?: number;
  /** FPS at or below which the "barely keeping up" clock runs. */
  warnFps?: number;
  /** How long that clock must run before `warn` latches true. */
  warnHoldMs?: number;
}

export class FpsMeter {
  private readonly window: number;
  private readonly warnFps: number;
  private readonly warnHoldMs: number;
  /** Ring of the last `window` frame times (ms). */
  private samples: number[] = [];
  /** Accumulated time (ms) FPS has been under the warn threshold without recovering. */
  private belowMs = 0;
  private warned = false;

  constructor(opts: FpsMeterOptions = {}) {
    this.window = Math.max(1, opts.window ?? 120);
    this.warnFps = opts.warnFps ?? WARN_FPS;
    this.warnHoldMs = opts.warnHoldMs ?? WARN_HOLD_MS;
  }

  /**
   * Record one rendered frame (`dt` in ms). Frames a backgrounded tab or a shader compile produced
   * are not the GPU being slow — the caller should skip them, exactly as the auto director does.
   */
  push(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.samples.push(dt);
    if (this.samples.length > this.window) this.samples.shift();

    // The warn clock runs on the current median, not the single frame, so one hitch cannot latch it.
    const fps = this.reading().fps;
    if (fps > 0 && fps < this.warnFps) {
      this.belowMs += dt;
      if (this.belowMs >= this.warnHoldMs) this.warned = true;
    } else if (fps >= this.warnFps) {
      this.belowMs = 0;
      this.warned = false;
    }
  }

  /** The current median frame time, the FPS it implies, and the sample count. */
  reading(): FpsReading {
    const frameMs = medianFrameMs(this.samples);
    return { frameMs, fps: fpsFromFrameMs(frameMs), samples: this.samples.length };
  }

  /** True once FPS has stayed under the warn threshold for the hold window; false once it recovers. */
  get warn(): boolean { return this.warned; }

  /** How long (ms) FPS has been under the threshold without recovering, for tests and diagnostics. */
  get belowFor(): number { return this.belowMs; }

  /** Forget every sample and the warn state — used when a match ends or the meter is re-armed. */
  reset(): void {
    this.samples = [];
    this.belowMs = 0;
    this.warned = false;
  }
}
