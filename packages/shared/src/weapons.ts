/**
 * Weapon roster. Numbers are shared by client and server. 1.0 shipped five hitscan weapons;
 * 1.1 drop 3 adds a revolver (second sidearm), a second SMG, an LMG, a scoped sniper, a grenade
 * launcher (fires the shared projectile sim) and the clippers (melee, always carried, V).
 */

export type WeaponId = "pistol" | "revolver" | "smg" | "smg2" | "rifle" | "lmg" | "shotgun" | "dmr" | "sniper" | "launcher" | "clippers";

/** One deterministic recoil step: [up, side] in radians. Patterns loop when exhausted. */
export type RecoilStep = readonly [number, number];

/** 1 = primary (bought), 2 = sidearm, 3 = melee (always carried). */
export type WeaponSlot = 1 | 2 | 3;
export type WeaponKind = "hitscan" | "melee" | "launcher";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  kind: WeaponKind;
  damage: number;
  /** Rounds per minute. */
  rpm: number;
  automatic: boolean;
  magazine: number;
  reserve: number;
  reloadMs: number;
  equipMs: number;
  /** Pellets per trigger pull (shotgun). */
  pellets: number;
  /** Base cone half-angle in radians (hip). */
  spread: number;
  /** Extra spread added per shot, decays over time. */
  spreadPerShot: number;
  spreadMax: number;
  spreadRecoveryPerSec: number;
  /** Spread multiplier while aiming down sights / sprinting / airborne. */
  spreadAim: number;
  spreadMove: number;
  spreadAir: number;
  /** Average vertical kick (radians) per shot and horizontal variance (legacy summary of the pattern). */
  recoilUp: number;
  recoilSide: number;
  /** Exponential recovery rate (1/s) of the uncountered recoil once `recoilRecoverDelayMs` has passed. */
  recoilRecoverPerSec: number;
  /** Per-shot deterministic pattern; loops. Gives each weapon its personality. */
  recoilPattern: readonly RecoilStep[];
  /** Random jitter as a fraction of each pattern step (0 = fully deterministic). */
  recoilJitter: number;
  /** Ms after the last shot before recovery kicks in, so bursts stack instead of springing back between rounds. */
  recoilRecoverDelayMs: number;
  /** Aim-down-sights zoom (FOV multiplier) and transition time. */
  adsZoom: number;
  adsMs: number;
  /** Scoped: ADS shows a scope overlay (viewmodel hidden), aim sways, breath hold (Shift) steadies it. */
  scoped: boolean;
  /** Effective range (m). Damage falls off linearly to `damageMin` at `rangeMax`. */
  range: number;
  rangeMax: number;
  damageMin: number;
  /** Movement speed multiplier while equipped. */
  mobility: number;
  /** Personality hints for presentation. */
  sound: "pistol" | "revolver" | "smg" | "smg2" | "rifle" | "lmg" | "shotgun" | "dmr" | "sniper" | "launcher" | "melee";
}

/**
 * The small slice of body/input state that affects a weapon's bullet cone.
 * Keep this data-only so the authoritative server and the client crosshair use
 * precisely the same rule.
 */
export interface SpreadContext {
  moving: boolean;
  airborne: boolean;
  crouching: boolean;
  aiming: boolean;
}

/** Melee: a hit from behind (attacker inside the victim's rear half-space) is a one-hit kill. */
export const MELEE = { range: 2.1, backstabDamage: 100, backstabCos: 0.35 } as const;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol", name: "P9 Straight Razor", slot: 2, kind: "hitscan",
    damage: 26, rpm: 420, automatic: false, magazine: 12, reserve: 60,
    reloadMs: 1200, equipMs: 320, pellets: 1,
    // Bloom builds when the trigger is spammed (per shot > recovery over one interval) and settles in ~0.5 s.
    spread: 0.006, spreadPerShot: 0.016, spreadMax: 0.05, spreadRecoveryPerSec: 0.07,
    spreadAim: 0.5, spreadMove: 1.6, spreadAir: 2.5,
    // Light, snappy: small kick that is almost gone before the next shot.
    recoilUp: 0.021, recoilSide: 0.005, recoilRecoverPerSec: 12,
    recoilPattern: [[0.020, 0.004], [0.022, -0.005], [0.024, 0.006], [0.021, -0.004]],
    recoilJitter: 0.15, recoilRecoverDelayMs: 50,
    adsZoom: 0.8, adsMs: 110, scoped: false,
    range: 22, rangeMax: 45, damageMin: 16, mobility: 1.0, sound: "pistol",
  },
  revolver: {
    id: "revolver", name: "R-44 Razorback", slot: 2, kind: "hitscan",
    damage: 55, rpm: 150, automatic: false, magazine: 6, reserve: 24,
    reloadMs: 2300, equipMs: 380, pellets: 1,
    spread: 0.005, spreadPerShot: 0.03, spreadMax: 0.07, spreadRecoveryPerSec: 0.08,
    spreadAim: 0.35, spreadMove: 1.8, spreadAir: 3.0,
    // One big kick per shot, settles fast enough for a deliberate second.
    recoilUp: 0.06, recoilSide: 0.008, recoilRecoverPerSec: 7,
    recoilPattern: [[0.06, 0.008], [0.063, -0.01], [0.058, 0.012]],
    recoilJitter: 0.15, recoilRecoverDelayMs: 100,
    adsZoom: 0.78, adsMs: 120, scoped: false,
    range: 28, rangeMax: 55, damageMin: 34, mobility: 0.98, sound: "revolver",
  },
  smg: {
    id: "smg", name: "K-7 Buzzcut", slot: 1, kind: "hitscan",
    damage: 18, rpm: 840, automatic: true, magazine: 32, reserve: 128,
    reloadMs: 1700, equipMs: 380, pellets: 1,
    // Bloom is the SMG's limiter: noticeable after ~8 rounds, capped wide.
    spread: 0.012, spreadPerShot: 0.008, spreadMax: 0.07, spreadRecoveryPerSec: 0.06,
    spreadAim: 0.55, spreadMove: 1.3, spreadAir: 2.2,
    // Fast, small, buzzing: tiny steps that wander left/right.
    recoilUp: 0.008, recoilSide: 0.005, recoilRecoverPerSec: 10,
    recoilPattern: [[0.008, 0.002], [0.009, -0.003], [0.008, 0.004], [0.010, -0.002], [0.007, 0.005], [0.008, -0.005], [0.006, 0.006], [0.007, -0.006]],
    recoilJitter: 0.3, recoilRecoverDelayMs: 70,
    adsZoom: 0.78, adsMs: 100, scoped: false,
    range: 16, rangeMax: 38, damageMin: 11, mobility: 1.0, sound: "smg",
  },
  smg2: {
    id: "smg2", name: "VZ-9 Trim", slot: 1, kind: "hitscan",
    damage: 15, rpm: 1000, automatic: true, magazine: 24, reserve: 168,
    reloadMs: 1500, equipMs: 300, pellets: 1,
    // Screams through the mag: wide bloom, fastest handling in the game.
    spread: 0.014, spreadPerShot: 0.007, spreadMax: 0.08, spreadRecoveryPerSec: 0.07,
    spreadAim: 0.6, spreadMove: 1.25, spreadAir: 2.0,
    recoilUp: 0.007, recoilSide: 0.006, recoilRecoverPerSec: 11,
    recoilPattern: [[0.007, 0.004], [0.008, -0.005], [0.006, 0.006], [0.007, -0.006], [0.009, 0.003], [0.006, -0.004]],
    recoilJitter: 0.35, recoilRecoverDelayMs: 60,
    adsZoom: 0.8, adsMs: 90, scoped: false,
    range: 13, rangeMax: 32, damageMin: 9, mobility: 1.03, sound: "smg2",
  },
  rifle: {
    id: "rifle", name: "AR-31 Pompadour", slot: 1, kind: "hitscan",
    damage: 27, rpm: 650, automatic: true, magazine: 30, reserve: 120,
    reloadMs: 2100, equipMs: 460, pellets: 1,
    spread: 0.007, spreadPerShot: 0.007, spreadMax: 0.06, spreadRecoveryPerSec: 0.045,
    spreadAim: 0.4, spreadMove: 1.7, spreadAir: 2.8,
    // Climbs for the first five rounds, then drifts right, then back left (learnable).
    recoilUp: 0.013, recoilSide: 0.006, recoilRecoverPerSec: 8,
    recoilPattern: [
      [0.017, 0.001], [0.018, -0.002], [0.019, 0.002], [0.018, 0.003], [0.016, 0.004],
      [0.010, 0.009], [0.008, 0.011], [0.007, 0.010], [0.008, 0.006],
      [0.007, -0.009], [0.007, -0.012], [0.006, -0.010], [0.008, -0.004],
    ],
    recoilJitter: 0.18, recoilRecoverDelayMs: 90,
    adsZoom: 0.75, adsMs: 120, scoped: false,
    range: 32, rangeMax: 70, damageMin: 19, mobility: 0.94, sound: "rifle",
  },
  lmg: {
    id: "lmg", name: "MG-4 Bulk", slot: 1, kind: "hitscan",
    damage: 24, rpm: 600, automatic: true, magazine: 100, reserve: 200,
    reloadMs: 5200, equipMs: 720, pellets: 1,
    // Wide from the hip, tightens after a few rounds in ADS (the pattern flattens out).
    spread: 0.016, spreadPerShot: 0.004, spreadMax: 0.05, spreadRecoveryPerSec: 0.04,
    spreadAim: 0.35, spreadMove: 2.0, spreadAir: 3.2,
    recoilUp: 0.014, recoilSide: 0.008, recoilRecoverPerSec: 6,
    recoilPattern: [
      [0.020, 0.004], [0.019, -0.006], [0.017, 0.008], [0.014, -0.009], [0.011, 0.010],
      [0.009, -0.010], [0.009, 0.009], [0.008, -0.008], [0.008, 0.008], [0.008, -0.008],
    ],
    recoilJitter: 0.22, recoilRecoverDelayMs: 110,
    adsZoom: 0.75, adsMs: 240, scoped: false,
    range: 34, rangeMax: 75, damageMin: 17, mobility: 0.82, sound: "lmg",
  },
  shotgun: {
    id: "shotgun", name: "S12 Wet Shave", slot: 1, kind: "hitscan",
    // 9 x 10 = 90: every pellet in the torso at point-blank range and the victim still lives. It
    // WAS 9 x 12 = 108, which is a guaranteed kill for a hit that asks nothing of the shooter and
    // offers the victim nothing back. The one-shot is still there, it just has to be aimed: pellets
    // landing on the head are worth 16 each, so two of the nine in the collar is 102 and a kill.
    damage: 10, rpm: 78, automatic: false, magazine: 6, reserve: 30,
    reloadMs: 2600, equipMs: 520, pellets: 9,
    // Pellet cone: devastating inside 6 m (all 9 pellets land on a torso), weak past 15 m.
    spread: 0.055, spreadPerShot: 0.0, spreadMax: 0.055, spreadRecoveryPerSec: 0.1,
    spreadAim: 0.85, spreadMove: 1.1, spreadAir: 1.3,
    // One heavy kick.
    recoilUp: 0.075, recoilSide: 0.010, recoilRecoverPerSec: 7,
    recoilPattern: [[0.075, 0.010], [0.078, -0.012]],
    recoilJitter: 0.25, recoilRecoverDelayMs: 120,
    adsZoom: 0.85, adsMs: 130, scoped: false,
    range: 9, rangeMax: 22, damageMin: 3, mobility: 0.92, sound: "shotgun",
  },
  dmr: {
    id: "dmr", name: "M-1 Clean Line", slot: 1, kind: "hitscan",
    // 63, not 62, for one reason: 62 x 1.6 is 99.2, so a perfect head shot left the victim alive on
    // 0.8 health. One point turns that into 100.8 and gives the weapon the identity it was reaching
    // for — two to the body, one to the head — and settles the overlap with the revolver, which
    // matched its 400 ms body kill for a fifth of the price but needs two head shots.
    damage: 63, rpm: 150, automatic: false, magazine: 8, reserve: 40,
    reloadMs: 2400, equipMs: 600, pellets: 1,
    spread: 0.004, spreadPerShot: 0.035, spreadMax: 0.08, spreadRecoveryPerSec: 0.07,
    spreadAim: 0.15, spreadMove: 3.0, spreadAir: 4.0,
    // Heavy, slow to settle: the follow-up has to be timed.
    recoilUp: 0.057, recoilSide: 0.010, recoilRecoverPerSec: 4.5,
    recoilPattern: [[0.055, 0.008], [0.058, -0.010], [0.060, 0.012]],
    recoilJitter: 0.12, recoilRecoverDelayMs: 160,
    adsZoom: 0.6, adsMs: 140, scoped: false,
    range: 60, rangeMax: 120, damageMin: 45, mobility: 0.88, sound: "dmr",
  },
  sniper: {
    id: "sniper", name: "SR-50 Longcut", slot: 1, kind: "hitscan",
    // 85 to the body, 136 to the head. It WAS 95, which is the worst of the two conventions a
    // sniper can pick: it neither kills on a body hit nor honestly refuses to, and it left the
    // shooter owing a 1.3 s follow-up after a shot they had played perfectly. Now the rule is one
    // line long — the head is a kill at ANY range (112 even at 200 m), the body never is.
    damage: 85, rpm: 45, automatic: false, magazine: 5, reserve: 25,
    reloadMs: 3200, equipMs: 800, pellets: 1,
    // Useless from the hip, laser in the scope.
    spread: 0.06, spreadPerShot: 0.04, spreadMax: 0.12, spreadRecoveryPerSec: 0.08,
    spreadAim: 0.03, spreadMove: 2.5, spreadAir: 3.0,
    recoilUp: 0.09, recoilSide: 0.012, recoilRecoverPerSec: 3.5,
    recoilPattern: [[0.09, 0.012], [0.095, -0.014]],
    recoilJitter: 0.1, recoilRecoverDelayMs: 220,
    adsZoom: 0.28, adsMs: 260, scoped: true,
    range: 100, rangeMax: 200, damageMin: 70, mobility: 0.84, sound: "sniper",
  },
  launcher: {
    id: "launcher", name: "GL-1 Blowout", slot: 1, kind: "launcher",
    // Damage comes from the shell's blast (GRENADES.shell); `damage` is unused for the arc itself.
    damage: 0, rpm: 60, automatic: false, magazine: 1, reserve: 4,
    reloadMs: 2600, equipMs: 700, pellets: 1,
    spread: 0.004, spreadPerShot: 0.0, spreadMax: 0.01, spreadRecoveryPerSec: 0.1,
    spreadAim: 0.5, spreadMove: 1.5, spreadAir: 2.0,
    recoilUp: 0.07, recoilSide: 0.01, recoilRecoverPerSec: 5,
    recoilPattern: [[0.07, 0.01]],
    recoilJitter: 0.1, recoilRecoverDelayMs: 150,
    adsZoom: 0.82, adsMs: 160, scoped: false,
    range: 40, rangeMax: 40, damageMin: 0, mobility: 0.86, sound: "launcher",
  },
  clippers: {
    id: "clippers", name: "Clippers", slot: 3, kind: "melee",
    damage: 45, rpm: 100, automatic: false, magazine: 0, reserve: 0,
    reloadMs: 0, equipMs: 260, pellets: 1,
    spread: 0, spreadPerShot: 0, spreadMax: 0, spreadRecoveryPerSec: 1,
    spreadAim: 1, spreadMove: 1, spreadAir: 1,
    recoilUp: 0.0, recoilSide: 0, recoilRecoverPerSec: 10,
    recoilPattern: [[0.012, 0.01], [0.012, -0.01]],
    recoilJitter: 0.2, recoilRecoverDelayMs: 40,
    adsZoom: 1, adsMs: 100, scoped: false,
    range: MELEE.range, rangeMax: MELEE.range, damageMin: 45, mobility: 1.06, sound: "melee",
  },
};

export const WEAPON_ORDER: WeaponId[] = ["pistol", "revolver", "smg", "smg2", "rifle", "lmg", "shotgun", "dmr", "sniper", "launcher", "clippers"];
/** Primaries in shop order (cheap to expensive). */
export const PRIMARY_ORDER: WeaponId[] = ["smg", "smg2", "shotgun", "rifle", "lmg", "dmr", "sniper", "launcher"];
export const SECONDARY_ORDER: WeaponId[] = ["pistol", "revolver"];
export const DEFAULT_WEAPON: WeaponId = "pistol";
export const FREE_SIDEARM: WeaponId = "pistol";
export const MELEE_WEAPON: WeaponId = "clippers";

export const isWeaponId = (v: unknown): v is WeaponId => typeof v === "string" && v in WEAPONS;

export const fireIntervalMs = (w: WeaponDef): number => 60000 / w.rpm;

/** Idle time after which the recoil pattern restarts from its first step. */
export const recoilResetMs = (w: WeaponDef): number => fireIntervalMs(w) * 1.8 + 80;

/**
 * Effective cone half-angle in radians. `bloom` is the accumulated per-shot
 * spread before the next trigger pull. This deliberately applies to every
 * pellet too: a shotgun should not become perfectly stable while jumping just
 * because it fires more than one trace.
 */
export function effectiveSpread(w: WeaponDef, bloom: number, state: SpreadContext): number {
  let spread = w.spread + Math.max(0, bloom);
  if (state.moving) spread *= w.spreadMove;
  if (state.airborne) spread *= w.spreadAir;
  if (state.crouching) spread *= 0.8;
  if (state.aiming) spread *= w.spreadAim;
  return spread;
}

/**
 * Recoil kick for the `index`-th consecutive shot: the deterministic pattern step plus a little
 * jitter (`rand` in [0,1)). Writes [up, side] radians into `out`.
 */
export function recoilStep(w: WeaponDef, index: number, rand: () => number, out: [number, number]): [number, number] {
  const p = w.recoilPattern;
  const step = p.length ? p[index % p.length] : [w.recoilUp, 0] as const;
  const j = w.recoilJitter;
  out[0] = step[0] * (1 + (rand() * 2 - 1) * j * 0.5);
  out[1] = step[1] + (rand() * 2 - 1) * j * Math.abs(step[0]);
  return out;
}

/**
 * Accumulated bloom (radians, on top of the base spread) after `shots` consecutive rounds at the
 * weapon's fire rate — the same accumulate/recover rule the client mirror and the server apply.
 */
export function bloomAfterBurst(w: WeaponDef, shots: number): number {
  const interval = fireIntervalMs(w) / 1000;
  let s = 0;
  for (let i = 0; i < shots; i++) {
    if (i > 0) s = Math.max(0, s - w.spreadRecoveryPerSec * interval);
    s = Math.min(w.spreadMax, s + w.spreadPerShot);
  }
  return s;
}

/** Damage after linear falloff between `range` and `rangeMax`. */
export function damageAtDistance(w: WeaponDef, dist: number): number {
  if (dist <= w.range) return w.damage;
  if (dist >= w.rangeMax) return w.damageMin;
  const t = (dist - w.range) / (w.rangeMax - w.range);
  return w.damage + (w.damageMin - w.damage) * t;
}

/** True when the melee swing lands from behind: the victim faces away from the attacker. */
export function isBackstab(victimYaw: number, attackerX: number, attackerZ: number, victimX: number, victimZ: number): boolean {
  const fx = Math.sin(victimYaw), fz = Math.cos(victimYaw);
  let dx = attackerX - victimX, dz = attackerZ - victimZ;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  // Attacker behind = the direction to the attacker points against the victim's facing.
  return dx * fx + dz * fz < -MELEE.backstabCos;
}

/** Uses ammo at all (melee does not). */
export const usesAmmo = (w: WeaponDef): boolean => w.kind !== "melee";
