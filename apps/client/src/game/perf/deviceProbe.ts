import type { AutoTier } from "./autoQuality";

/**
 * What can this machine probably do, before it has rendered anything?
 *
 * Only used to pick a STARTING level. Guessing from hardware strings is unreliable — a laptop with
 * eight cores can have a GPU from 2014, and a phone reports whatever it likes — so the guess is
 * deliberately conservative and the real decision is made a few seconds later by `AutoQuality`
 * from measured frame times. Starting one level too low costs a few seconds of softness; starting
 * too high costs the player's first impression of the game, and those are not equal.
 */

export interface DeviceReport {
  tier: AutoTier;
  /** Why, in a sentence, for the settings panel and the report. */
  why: string;
  cores: number;
  memoryGb: number | null;
  /** Unmasked GPU string when the browser will say (Chromium), else null. */
  gpu: string | null;
  mobile: boolean;
  /** Set when the device cannot run the game at all. */
  fatal?: string;
}

/** GPUs and GPU families that are integrated, ancient, or software — always start at the bottom. */
const WEAK = /(swiftshader|llvmpipe|software|microsoft basic|mesa offscreen|intel.*(hd (graphics )?[2-5]\d{2}|gma)|geforce (8|9)\d{2}[^0-9]|radeon (hd )?[2-6]\d{3})/i;
/** Discrete parts fast enough that the top level is a sensible opening bid. */
const STRONG = /(rtx\s?[2-9]\d{3}|gtx\s?1[0-9]{3}|radeon\s?rx\s?[5-9]\d{3}|apple m[1-9]|arc\s?a[3-9]\d{2})/i;

function gpuString(gl: WebGL2RenderingContext): string | null {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    return String(gl.getParameter(gl.RENDERER));
  } catch { return null; }
}

/**
 * Reads what the browser will tell us. Creates and throws away its own tiny WebGL2 context, so it
 * can run before the game's canvas exists — a canvas can only ever hold one kind of context.
 */
export function probeDevice(): DeviceReport {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memoryGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(nav.userAgent ?? "") || (nav.maxTouchPoints ?? 0) > 2;

  let gpu: string | null = null;
  let webgl2 = false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (gl) { webgl2 = true; gpu = gpuString(gl); gl.getExtension("WEBGL_lose_context")?.loseContext(); }
  } catch { /* blocked or unavailable; handled below */ }

  if (!webgl2) {
    return { tier: "low", why: "This browser does not offer WebGL2.", cores, memoryGb, gpu, mobile,
      fatal: "This game needs WebGL2, which this browser did not provide. Try a recent Chrome, Edge or Firefox, and check that hardware acceleration is switched on." };
  }

  if (mobile) return { tier: "low", why: "Mobile GPU — starting at Performance.", cores, memoryGb, gpu, mobile };
  if (gpu && WEAK.test(gpu)) return { tier: "low", why: `${gpu} is a software or integrated renderer — starting at Performance.`, cores, memoryGb, gpu, mobile };
  if (cores <= 2 || (memoryGb !== null && memoryGb <= 2)) return { tier: "low", why: `${cores} cores${memoryGb ? `, ${memoryGb} GB` : ""} — starting at Performance.`, cores, memoryGb, gpu, mobile };
  if (gpu && STRONG.test(gpu) && cores >= 8) return { tier: "high", why: `${gpu} — starting at Quality.`, cores, memoryGb, gpu, mobile };
  return { tier: "medium", why: gpu ? `${gpu} — starting at Balanced.` : `${cores} cores — starting at Balanced.`, cores, memoryGb, gpu, mobile };
}

/**
 * A few seconds of real frames beat any hardware string. Returns the level those frames justify,
 * given where the probe started.
 *
 * Never raises by more than one level: the opening seconds of a match are not its heaviest, so a
 * quiet spawn room must not talk the game into a level it cannot hold once the shooting starts.
 */
export function tierFromMeasurement(start: AutoTier, medianFrameMs: number, targetFps = 60): AutoTier {
  const order: AutoTier[] = ["low", "medium", "high"];
  const budget = 1000 / targetFps;
  const at = order.indexOf(start);
  if (medianFrameMs > budget * 1.6) return order[Math.max(0, at - 2)];
  if (medianFrameMs > budget) return order[Math.max(0, at - 1)];
  if (medianFrameMs < budget * 0.55) return order[Math.min(order.length - 1, at + 1)];
  return start;
}
