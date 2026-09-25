import type { Box } from "@frankibarber/shared";

/**
 * Minimap maths (drop 5), kept pure so it can be unit-tested without a canvas. Drop U (P3) removed
 * the 240×20 compass strip and its bearings: north and every objective beyond the radar's range
 * now sit ON the radar's rim (`rimPin`), where the eye already is.
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
  /** Canvas size at 1600×900 (px; the CSS box is `--hud-radar`, 144–176) and world radius shown (m). */
  size: 176,
  range: 24,
  /** Canvas letters (the rim's „N”, sites, flags, marks): the HUD's 14 px floor (§2 Principle 2). */
  letterPx: 14,
  /** How far inside the edge a rim pin's centre sits (px): a 14 px letter clears the 2 px ring. */
  rimInset: 11,
} as const;

/** World → map-image pixel. */
export function toMap(x: number, z: number, bounds: Box, scale: number = MINIMAP.scale): [number, number] {
  return [(x - bounds.minX) * scale, (bounds.maxZ - z) * scale];
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

/**
 * Where a radar mark goes (drop U, P3): in place while it lies within `rim` px of the centre,
 * otherwise ON the rim, in its own direction — so a site 60 m away still says which way it is,
 * as the compass strip used to, without a second instrument. Writes the canvas offset into `out`
 * (no allocation: the radar calls it for every objective, every frame) and returns whether the
 * mark was pinned to the rim.
 */
export function rimPin(out: [number, number], ox: number, oy: number, rim: number): boolean {
  const d = Math.hypot(ox, oy);
  if (d <= rim) { out[0] = ox; out[1] = oy; return false; }
  const k = rim / d;
  out[0] = ox * k; out[1] = oy * k;
  return true;
}
