import { type Box, type CollisionWorld, makeRayHit, rayBox } from "./collision";
import { PLAYER } from "./constants";
import { damageAtDistance, type WeaponDef } from "./weapons";

/** A hittable target: a player body box at some position (feet origin). */
export interface Target {
  id: string;
  x: number;
  y: number;
  z: number;
  crouching: boolean;
}

export interface HitResult {
  /** Target id or null for world/miss. */
  targetId: string | null;
  headshot: boolean;
  distance: number;
  /** End point of the trace. */
  ex: number;
  ey: number;
  ez: number;
  damage: number;
}

const scratchBox: Box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const worldHit = makeRayHit();

export function targetBox(t: Target, out: Box): Box {
  const h = t.crouching ? PLAYER.crouchHeight : PLAYER.height;
  out.minX = t.x - PLAYER.halfWidth; out.maxX = t.x + PLAYER.halfWidth;
  out.minZ = t.z - PLAYER.halfWidth; out.maxZ = t.z + PLAYER.halfWidth;
  out.minY = t.y; out.maxY = t.y + h;
  return out;
}

/**
 * Trace one bullet. World geometry occludes players. Head zone = top `headFraction` of the body.
 * Deterministic and allocation-light (one result object per call).
 */
export function traceBullet(
  world: CollisionWorld,
  weapon: WeaponDef,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  targets: Target[],
  ignoreId: string,
  maxDist = weapon.rangeMax * 1.5,
): HitResult {
  world.raycast(ox, oy, oz, dx, dy, dz, maxDist, worldHit);
  let best = worldHit.hit ? worldHit.t : maxDist;
  let bestId: string | null = null;
  let headshot = false;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.id === ignoreId) continue;
    const b = targetBox(t, scratchBox);
    const d = rayBox(ox, oy, oz, dx, dy, dz, b, best);
    if (d >= 0 && d < best) {
      best = d;
      bestId = t.id;
      const hitY = oy + dy * d;
      const h = t.crouching ? PLAYER.crouchHeight : PLAYER.height;
      headshot = hitY >= t.y + h * (1 - PLAYER.headFraction);
    }
  }
  const dmg = bestId ? damageAtDistance(weapon, best) : 0;
  return {
    targetId: bestId,
    headshot,
    distance: best,
    ex: ox + dx * best, ey: oy + dy * best, ez: oz + dz * best,
    damage: dmg,
  };
}

/** Tiny seeded PRNG (mulberry32) so pellet patterns are reproducible on the server. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Offsets a direction by a random cone angle. Writes into `out` [x,y,z].
 * `spread` is the cone half-angle (radians).
 */
export function spreadDirection(dx: number, dy: number, dz: number, spread: number, rand: () => number, out: [number, number, number]): void {
  if (spread <= 0) { out[0] = dx; out[1] = dy; out[2] = dz; return; }
  // Build an orthonormal basis around d.
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.99) { ux = 1; uy = 0; }
  // right = d x up
  let rx = dy * uz - dz * uy, ry = dz * ux - dx * uz, rz = dx * uy - dy * ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // up2 = right x d
  const px = ry * dz - rz * dy, py = rz * dx - rx * dz, pz = rx * dy - ry * dx;
  const ang = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * spread; // uniform over disc
  const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
  const cr = Math.cos(r), sr = Math.sin(r) / (r || 1);
  // small-angle rotation: d*cos(r) + (right*ca + up*sa)*sin(r)/r
  let x = dx * cr + (rx * ca + px * sa) * sr;
  let y = dy * cr + (ry * ca + py * sa) * sr;
  let z = dz * cr + (rz * ca + pz * sa) * sr;
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
}
