import { GRENADES } from "./grenades";

export interface SmokeCloud { x: number; y: number; z: number; born: number; until: number }
export const MAX_SMOKE_CLOUDS = 4;
export const SMOKE_CENTER_Y = 1.4;

/**
 * Steps the view's smoke opacity is rounded to — 2 % each, and staying that way.
 *
 * Why it is rounded at all: the client writes this number into the HUD store every frame a cloud is
 * on screen, and `useHud` subscribes the whole 600-line `Hud` to every field, so each DISTINCT value
 * costs a full React reconcile. Rounding is what keeps a continuous number from doing that 60 times
 * a second. Named and moved here so the reason is written down next to the number.
 *
 * Why not coarser, which was tried: MEASURED with `hud-bench --drive smoke`, halving it to 25 steps
 * took 0.49 React commits per frame to 0.42 — about 0.05 ms a frame, and nothing in the "all" case.
 * It cost more than that. The opacity deep inside a cloud sits around 0.96-1.0 depending on how far
 * the cloud has grown, and `multiplayer.spec.ts`'s smoke test asserts an exact 1 — so a coarser step
 * puts the last rung further below 1 and turns an already-marginal test into a failing one. A
 * fiftieth of the opacity of one full-screen div is not worth that.
 */
export const SMOKE_OPACITY_STEPS = 50;
export const quantSmokeOpacity = (v: number): number => Math.round(v * SMOKE_OPACITY_STEPS) / SMOKE_OPACITY_STEPS;
/** The dense core grows quickly, then clears over its last second. Used by sight and rendering. */
export function smokeRadius(cloud: SmokeCloud, now: number): number {
  return GRENADES.smoke.radius * Math.max(0, Math.min(1, (now - cloud.born) / 700, (cloud.until - now) / 1000));
}

export function smokeBlocks(clouds: readonly SmokeCloud[], now: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  for (const c of clouds) {
    const r = smokeRadius(c, now);
    if (r < 0.2) continue;
    const cy = c.y + SMOKE_CENTER_Y;
    const t = len2 ? Math.max(0, Math.min(1, ((c.x - ax) * dx + (cy - ay) * dy + (c.z - az) * dz) / len2)) : 0;
    if ((ax + t * dx - c.x) ** 2 + (ay + t * dy - cy) ** 2 + (az + t * dz - c.z) ** 2 < r * r) return true;
  }
  return false;
}
