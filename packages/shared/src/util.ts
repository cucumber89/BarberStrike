import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from "./constants";

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest-path angle interpolation. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function wrapAngle(a: number): number {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Sanitises a nickname: trims, strips control chars, restricts to safe characters, clamps length. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^\p{L}\p{N} _\-.]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  if (cleaned.length < MIN_NAME_LENGTH) return null;
  return cleaned;
}

export const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && isFiniteNumber(v[0]) && isFiniteNumber(v[1]) && isFiniteNumber(v[2]);
}

/** Direction from yaw/pitch (yaw 0 = +Z, pitch positive = looking down, Babylon convention). */
export function aimDirection(yaw: number, pitch: number, out: [number, number, number]): void {
  const cp = Math.cos(pitch);
  out[0] = Math.sin(yaw) * cp;
  out[1] = -Math.sin(pitch);
  out[2] = Math.cos(yaw) * cp;
}
