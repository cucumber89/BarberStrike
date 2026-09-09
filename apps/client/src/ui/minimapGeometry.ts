import type { Box } from "@frankibarber/shared";

/**
 * Minimap maths (drop 5), kept pure so it can be unit-tested without a canvas.
 *
 * Named `minimapGeometry`, not `minimap`: the component beside it is `Minimap.tsx`, and on a
 * case-insensitive filesystem (Windows, macOS) `import { Minimap } from "./Minimap"` resolves to
 * whichever of the two the OS hands back. It handed back this one, so the HUD imported a module
 * with no `Minimap` export, the bundle threw a SyntaxError before React mounted, and the game was
 * a black screen with no menu — on Windows only, while Linux was perfectly happy.
 * World: +X east, +Z north, yaw 0 faces +Z. Map image: north up, x right, so a world point maps to
 * (x − minX, maxZ − z) × scale. The map is drawn rotated so the player's facing is always up.
 */

export const MINIMAP = {
  /** Pixels per metre of the pre-rendered map image. */
  scale: 6,
  /** Canvas size (px) and world radius shown (m). */
  size: 176,
  range: 24,
  /** Compass strip: half the field shown (radians) and its width (px). */
  compassHalf: Math.PI / 2,
  compassWidth: 240,
} as const;

/** World → map-image pixel. */
export function toMap(x: number, z: number, bounds: Box, scale: number = MINIMAP.scale): [number, number] {
  return [(x - bounds.minX) * scale, (bounds.maxZ - z) * scale];
}

/** Compass bearing of a world point from the viewer (0 = north, clockwise). */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

/** Signed angle of `bearing` relative to `yaw`, wrapped to −π..π (negative = to the left). */
export function relativeAngle(bearing: number, yaw: number): number {
  let d = (bearing - yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Position on the compass strip (px from its centre) for a relative angle, or null when off the strip. */
export function compassX(rel: number, half: number = MINIMAP.compassHalf, width: number = MINIMAP.compassWidth): number | null {
  if (Math.abs(rel) > half) return null;
  return (rel / half) * (width / 2);
}

/** Minimap canvas offset of a world point relative to the viewer, in a facing-up frame (px). */
export function radarOffset(vx: number, vz: number, yaw: number, x: number, z: number, pxPerM: number): [number, number] {
  const out: [number, number] = [0, 0];
  radarOffsetTo(out, vx, vz, Math.cos(yaw), Math.sin(yaw), x, z, pxPerM);
  return out;
}

/**
 * `radarOffset` without the tuple, and with the viewer's rotation passed in already resolved.
 *
 * The minimap calls this once per teammate, enemy, flag, site, station and mark, every frame it
 * draws — thirty-odd times — so the returned array and the two trig calls were thirty allocations
 * and sixty transcendentals a frame for numbers that do not change within the frame.
 */
export function radarOffsetTo(out: [number, number], vx: number, vz: number, cosYaw: number, sinYaw: number, x: number, z: number, pxPerM: number): void {
  const dx = x - vx, dz = z - vz;
  // Rotate the world by −yaw so the facing direction lands on −Y (up on screen).
  out[0] = (dx * cosYaw - dz * sinYaw) * pxPerM;
  out[1] = -(dx * sinYaw + dz * cosYaw) * pxPerM;
}
