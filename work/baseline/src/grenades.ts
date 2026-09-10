import { type CollisionWorld, makeRayHit, type RayHit } from "./collision";
import { PLAYER } from "./constants";

/**
 * Grenades and thrown equipment (1.1 drop 2). Definitions + a deterministic projectile
 * simulation shared by the server (authority: detonation, damage) and the client (visual flight
 * from the same start state, so no per-tick sync is needed). Integrator uses only + - * / and
 * sqrt, so both sides produce identical trajectories at the same fixed step.
 */

/** `shell` is the launcher's round (drop 3): never bought, fired through the same simulation. */
export type GrenadeId = "frag" | "flash" | "smoke" | "molotov" | "knife" | "shell";
export type GrenadeSlot = "lethal" | "tactical";

export interface GrenadeDef {
  id: GrenadeId;
  name: string;
  slot: GrenadeSlot;
  price: number;
  /** Fuse from the throw (ms); 0 = detonates on first impact. */
  fuseMs: number;
  /** Holding the throw key shortens the fuse (frag). */
  cookable: boolean;
  throwSpeed: number;     // m/s
  gravity: number;        // m/s² (positive)
  restitution: number;    // bounce energy kept along the normal
  friction: number;       // tangential energy lost per bounce
  radius: number;         // effect radius (m)
  damage: number;         // at the centre
  minDamage: number;      // at the edge of the radius
  /** How long the after-effect lasts (smoke cloud, fire), ms. */
  effectMs: number;
  /** Sticks into the world on impact (throwing knife). */
  sticks: boolean;
  /** Direct hit damage on a player (knife). */
  directDamage: number;
  /** Hitting a player counts as an impact (impact grenades go off on the body instead of passing through). */
  impactOnPlayer: boolean;
  /** Sold in the shop (the launcher shell is not). */
  shop: boolean;
}

export const GRENADES: Record<GrenadeId, GrenadeDef> = {
  frag: { id: "frag", name: "Frag", slot: "lethal", price: 300, fuseMs: 3200, cookable: true, throwSpeed: 17, gravity: 13, restitution: 0.35, friction: 0.5, radius: 6, damage: 120, minDamage: 15, effectMs: 0, sticks: false, directDamage: 0, impactOnPlayer: false, shop: true },
  molotov: { id: "molotov", name: "Molotov", slot: "lethal", price: 400, fuseMs: 0, cookable: false, throwSpeed: 15, gravity: 13, restitution: 0, friction: 1, radius: 3.2, damage: 0, minDamage: 0, effectMs: 6000, sticks: false, directDamage: 0, impactOnPlayer: true, shop: true },
  knife: { id: "knife", name: "Throwing knife", slot: "lethal", price: 200, fuseMs: 0, cookable: false, throwSpeed: 28, gravity: 6, restitution: 0, friction: 1, radius: 0, damage: 0, minDamage: 0, effectMs: 0, sticks: true, directDamage: 70, impactOnPlayer: false, shop: true },
  flash: { id: "flash", name: "Flashbang", slot: "tactical", price: 200, fuseMs: 1700, cookable: false, throwSpeed: 17, gravity: 13, restitution: 0.4, friction: 0.5, radius: 14, damage: 0, minDamage: 0, effectMs: 0, sticks: false, directDamage: 0, impactOnPlayer: false, shop: true },
  smoke: { id: "smoke", name: "Smoke", slot: "tactical", price: 300, fuseMs: 1500, cookable: false, throwSpeed: 16, gravity: 13, restitution: 0.25, friction: 0.6, radius: 3.5, damage: 0, minDamage: 0, effectMs: 12000, sticks: false, directDamage: 0, impactOnPlayer: false, shop: true },
  // Launcher round: fast, flat, goes off on anything it touches. Blast is smaller than a frag's.
  shell: { id: "shell", name: "GL-1 Blowout", slot: "lethal", price: 0, fuseMs: 0, cookable: false, throwSpeed: 26, gravity: 9, restitution: 0, friction: 1, radius: 4.5, damage: 95, minDamage: 20, effectMs: 0, sticks: false, directDamage: 0, impactOnPlayer: true, shop: false },
};

export const GRENADE_ORDER: GrenadeId[] = ["frag", "molotov", "knife", "flash", "smoke"];
export const isGrenadeId = (v: unknown): v is GrenadeId => typeof v === "string" && v in GRENADES;

/** Burn damage per second inside a molotov fire. */
export const FIRE_DPS = 22;
/** Radius of the projectile body (m), used for wall clearance. */
export const PROJECTILE_RADIUS = 0.08;
/** Minimum interval between throws (ms), enforced by the server. */
export const THROW_INTERVAL_MS = 600;

export interface Projectile {
  id: number;
  kind: GrenadeId;
  owner: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Ms since the throw. */
  ageMs: number;
  /** Ms after which it detonates (0 = on impact). */
  fuseMs: number;
  /** Came to rest on the ground (still ticks its fuse). */
  resting: boolean;
  /** Rolling on the ground: no gravity hops, steady drag until it rests. */
  rolling: boolean;
  /** Stuck in a wall (knife). */
  stuck: boolean;
  /** Normal of the last surface it touched (for the stuck knife / resting orientation). */
  nx: number; ny: number; nz: number;
  bounces: number;
}

export function createProjectile(id: number, kind: GrenadeId, owner: string, o: [number, number, number], d: [number, number, number], cookMs = 0, extraV: [number, number, number] = [0, 0, 0]): Projectile {
  const def = GRENADES[kind];
  const fuse = def.fuseMs > 0 ? Math.max(1, def.fuseMs - (def.cookable ? cookMs : 0)) : 0;
  return {
    id, kind, owner,
    x: o[0], y: o[1], z: o[2],
    vx: d[0] * def.throwSpeed + extraV[0], vy: d[1] * def.throwSpeed + extraV[1], vz: d[2] * def.throwSpeed + extraV[2],
    ageMs: 0, fuseMs: fuse, resting: false, rolling: false, stuck: false, nx: 0, ny: 1, nz: 0, bounces: 0,
  };
}

export type StepResult = "flying" | "resting" | "stuck" | "detonate";

const hitTmp: RayHit = makeRayHit();

/** Contact response shared by the swept hit and the sphere push-out. */
function contact(p: Projectile, def: GrenadeDef, nx: number, ny: number, nz: number): StepResult | null {
  p.nx = nx; p.ny = ny; p.nz = nz;
  p.bounces++;
  if (def.fuseMs === 0 && !def.sticks) return "detonate";        // impact grenade (molotov)
  if (def.sticks) { p.vx = p.vy = p.vz = 0; p.stuck = true; return "stuck"; }
  // Reflect: split into normal / tangential parts. A weak bounce on the ground becomes a roll
  // (no more hopping, steady drag) so the grenade settles in well under a second.
  const vn = p.vx * nx + p.vy * ny + p.vz * nz;
  if (vn > 0) return null;                                          // already separating
  let bounce = -vn * def.restitution;
  const rolling = ny > 0.7 && bounce < 0.9;
  const keep = rolling ? 0.85 : 1 - def.friction * 0.5;
  const tx = (p.vx - vn * nx) * keep, ty = (p.vy - vn * ny) * keep, tz = (p.vz - vn * nz) * keep;
  if (rolling) { bounce = 0; p.rolling = true; }
  p.vx = tx + bounce * nx; p.vy = ty + bounce * ny; p.vz = tz + bounce * nz;
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
  if (ny > 0.7 && speed < 1.2) { p.vx = p.vy = p.vz = 0; p.resting = true; return "resting"; }
  return null;
}

/**
 * Sphere vs boxes: pushes the body out of any box it overlaps and reports the contact normal.
 * The swept ray handles fast motion; this handles the shallow approach where the ray passes but
 * the body still ends up closer than its radius (measured: a frag sank through the floor after
 * its fourth bounce without this).
 */
function pushOut(world: CollisionWorld, p: Projectile): [number, number, number] | null {
  const r = PROJECTILE_RADIUS;
  let normal: [number, number, number] | null = null;
  for (let i = 0; i < world.boxes.length; i++) {
    const b = world.boxes[i];
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cy = Math.max(b.minY, Math.min(p.y, b.maxY)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const push = r - d;
      p.x += nx * push; p.y += ny * push; p.z += nz * push;
      normal = [nx, ny, nz];
    } else {
      // Centre inside the box: leave through the nearest face.
      const ex = Math.min(p.x - b.minX, b.maxX - p.x), ey = Math.min(p.y - b.minY, b.maxY - p.y), ez = Math.min(p.z - b.minZ, b.maxZ - p.z);
      if (ey <= ex && ey <= ez) { const up = p.y - b.minY < b.maxY - p.y ? -1 : 1; p.y = (up > 0 ? b.maxY : b.minY) + up * r; normal = [0, up, 0]; }
      else if (ex <= ez) { const sx = p.x - b.minX < b.maxX - p.x ? -1 : 1; p.x = (sx > 0 ? b.maxX : b.minX) + sx * r; normal = [sx, 0, 0]; }
      else { const sz = p.z - b.minZ < b.maxZ - p.z ? -1 : 1; p.z = (sz > 0 ? b.maxZ : b.minZ) + sz * r; normal = [0, 0, sz]; }
    }
  }
  return normal;
}

/**
 * Advances a projectile by `dtMs` against the static world. Returns what happened this step.
 * Callers detonate on "detonate" (fuse or impact) and stop simulating after "stuck".
 */
export function stepProjectile(world: CollisionWorld, p: Projectile, dtMs: number): StepResult {
  const def = GRENADES[p.kind];
  const dt = dtMs / 1000;
  p.ageMs += dtMs;
  if (p.stuck) return "stuck";
  if (p.fuseMs > 0 && p.ageMs >= p.fuseMs) return "detonate";
  if (p.resting) return "resting";

  if (p.rolling) {
    // Ground drag; leave the rolling state at an edge (nothing under the body any more).
    world.raycast(p.x, p.y, p.z, 0, -1, 0, PROJECTILE_RADIUS + 0.06, hitTmp);
    if (!hitTmp.hit || hitTmp.ny < 0.7) { p.rolling = false; }
    else {
      const drag = Math.max(0, 1 - 3.5 * dt);
      p.vx *= drag; p.vz *= drag; p.vy = 0;
      p.y = hitTmp.y + PROJECTILE_RADIUS;
      if (p.vx * p.vx + p.vz * p.vz < 0.36) { p.vx = p.vz = 0; p.resting = true; return "resting"; }
    }
  }
  if (!p.rolling) p.vy -= def.gravity * dt;
  let remaining = dt;
  // Up to three sub-segments per step so a corner bounce cannot tunnel.
  for (let iter = 0; iter < 3 && remaining > 0; iter++) {
    const sx = p.vx * remaining, sy = p.vy * remaining, sz = p.vz * remaining;
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (len < 1e-6) break;
    const dx = sx / len, dy = sy / len, dz = sz / len;
    world.raycast(p.x, p.y, p.z, dx, dy, dz, len + PROJECTILE_RADIUS, hitTmp);
    if (!hitTmp.hit) {
      p.x += sx; p.y += sy; p.z += sz;
      const n = pushOut(world, p);
      if (n) { const r = contact(p, def, n[0], n[1], n[2]); if (r) return r; }
      break;
    }
    // Move up to the surface (minus the body radius), then respond.
    const travel = Math.max(0, hitTmp.t - PROJECTILE_RADIUS);
    p.x += dx * travel; p.y += dy * travel; p.z += dz * travel;
    const r = contact(p, def, hitTmp.nx, hitTmp.ny, hitTmp.nz);
    if (r) return r;
    remaining *= 1 - travel / Math.max(travel, len);
  }
  return "flying";
}

/** Damage from an explosion at distance `dist` (m); 0 beyond the radius or without line of sight. */
export function explosionDamage(def: GrenadeDef, dist: number, losBlocked: boolean): number {
  if (losBlocked || dist >= def.radius || def.damage <= 0) return 0;
  const t = dist / def.radius;
  return Math.round(def.damage - (def.damage - def.minDamage) * t);
}

/**
 * Flash strength 0..1 for a viewer: falls with distance, strongest when looking at the flash,
 * never zero in the radius (peripheral vision), zero without line of sight.
 */
export function flashStrength(def: GrenadeDef, dist: number, cosToFlash: number, losBlocked: boolean): number {
  if (losBlocked || dist >= def.radius) return 0;
  const byDist = Math.sqrt(Math.max(0, 1 - dist / def.radius));
  const byAngle = cosToFlash > 0.6 ? 1 : cosToFlash > 0 ? 0.6 : 0.25;
  return Math.min(1, byDist * byAngle);
}

/** Blind duration (ms) for a flash strength. */
export const flashMs = (strength: number): number => Math.round(strength * 2600);

/** Player eye position used for flash / LOS checks. */
export const eyeOf = (y: number, crouching: boolean): number => y + (crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);
