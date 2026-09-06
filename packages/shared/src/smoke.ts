import { GRENADES } from "./grenades";

export interface SmokeCloud { x: number; y: number; z: number; born: number; until: number }
export const MAX_SMOKE_CLOUDS = 4;
export const SMOKE_CENTER_Y = 1.4;
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
