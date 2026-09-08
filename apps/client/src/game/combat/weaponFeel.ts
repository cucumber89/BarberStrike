import { WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";

/**
 * Drop B: how each weapon HANDLES and PRESENTS itself. One row per weapon, implementing
 * `docs/WEAPON_MATRIX.md`.
 *
 * Why this table is client-only (matrix decision D-B1): the server reads exactly one handling
 * number out of `WeaponDef` — `equipMs`, which gates firing (`TdmRoom.ts:538`) — so equip time is
 * a gameplay number and stays put. Everything here is presentation and local handling: it never
 * crosses the wire, adds no schema field, and cannot move the authoritative bullet cone
 * (`effectiveSpread`) or a single point of damage.
 *
 * The scope style lives here rather than on `WeaponDef.scoped` on purpose (matrix D-B2 makes the
 * DMR scoped): `scoped` is also a balance-test predicate in shared, and widening it there would
 * silently change which weapons that test covers. `WeaponDef.scoped` therefore keeps its old
 * meaning — the SR-50 — and the overlay the player actually looks through comes from `scope` below.
 */

/** Full tube (the sniper) or a light ring that leaves most of the view clear (the DMR). */
export type ScopeStyle = "tube" | "ring";

export interface WeaponFeel {
  /** Viewmodel sway amplitude, relative to the AR-31 (1 = the reference rifle). */
  sway: number;
  /** Delay before the first shot after sprinting: how long the weapon takes to come back up. */
  sprintOutMs: number;
  /** Fraction of `equipMs` the raise animation occupies. Small = snaps up, 1 = the whole draw. */
  raise: number;
  /** Muzzle flash plane size (m). 0 = no flash (melee). */
  flash: number;
  /** Camera shake per shot (radians before the user's shake scale). */
  shake: number;
  /** Tracer width relative to the 20 mm default. 0 = no tracer (melee, and the launcher's shell). */
  tracer: number;
  /** Casings ejected per shot. 0 = the brass comes out with the action instead (see `actionMs`). */
  casings: number;
  /** Casing size relative to the 12 x 12 x 30 mm default. */
  casingScale: number;
  /** Drops its brass out of the bottom instead of throwing it right (the VZ-9's magazine well). */
  ejectDown: boolean;
  /**
   * Tracers drawn per shot. The S12 throws its whole pattern, which is the only way the spray reads
   * as a spray; a belt gun draws one but a fat one (see `tracer`).
   */
  tracerCount: number;
  /** Throws a spent belt link with the case (the MG-4 alone). */
  beltLink: boolean;
  /**
   * Mechanical action worked after each shot (ms): the revolver's hammer, the shotgun's pump, the
   * sniper's bolt. 0 = the gun cycles itself. The sniper's bolt also drops it out of the scope (S1).
   */
  actionMs: number;
  /** Scope overlay style while aimed, or null for iron sights / a red dot. */
  scope: ScopeStyle | null;
  /** Whether holding still + Shift steadies the aim (matrix: the sniper alone). */
  breath: boolean;
  /** Scope drift amplitude relative to the sniper's 0.0045 rad. */
  scopeDrift: number;
  /** Crouched and still, the weapon settles onto its bipod (matrix rule B1). */
  bipod: boolean;
}

/**
 * The matrix, in numbers. Read `docs/WEAPON_MATRIX.md` for the sentence each row is trying to
 * make a player say; change a number here only by changing that document first.
 */
export const WEAPON_FEEL: Record<WeaponId, WeaponFeel> = {
  // Snappy, polite. Back on target before the next shot; the slide is the only moving part.
  pistol: {
    sway: 0.6, sprintOutMs: 90, raise: 0.6,
    flash: 0.18, shake: 0.003, tracer: 1.0, casings: 1, casingScale: 0.8, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 60, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // A hammer blow, then a slow arc back. Six cases drop together at the reload, none per shot.
  revolver: {
    sway: 1.0, sprintOutMs: 140, raise: 0.9,
    flash: 0.30, shake: 0.008, tracer: 1.15, casings: 0, casingScale: 1.0, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 120, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // Sewing machine. The brass fountain is the picture; the tail never overlaps the next shot.
  smg: {
    sway: 0.8, sprintOutMs: 110, raise: 0.7,
    flash: 0.16, shake: 0.003, tracer: 0.9, casings: 1, casingScale: 0.8, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 0, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // Screams. Fastest handling in the game and the lightest sway; ejects downward, not right.
  smg2: {
    sway: 0.5, sprintOutMs: 80, raise: 0.5,
    flash: 0.14, shake: 0.002, tracer: 0.85, casings: 1, casingScale: 0.7, ejectDown: true, tracerCount: 1, beltLink: false,
    actionMs: 0, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // The reference rifle: every other row is louder, heavier or lighter than this one.
  rifle: {
    sway: 1.0, sprintOutMs: 150, raise: 0.8,
    flash: 0.22, shake: 0.004, tracer: 1.0, casings: 1, casingScale: 1.0, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 0, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // Heavy, wide, then it settles. Slowest to bring up, and the only gun that gets a bipod.
  lmg: {
    sway: 1.6, sprintOutMs: 260, raise: 1.0,
    flash: 0.30, shake: 0.005, tracer: 1.5, casings: 1, casingScale: 1.0, ejectDown: false, tracerCount: 1, beltLink: true,
    actionMs: 0, scope: null, breath: false, scopeDrift: 0, bipod: true,
  },
  // One heavy shove, brought back by the pump — which is also when the red shell comes out.
  shotgun: {
    sway: 1.2, sprintOutMs: 180, raise: 0.9,
    flash: 0.40, shake: 0.012, tracer: 0.8, casings: 0, casingScale: 1.6, ejectDown: false, tracerCount: 9, beltLink: false,
    actionMs: 250, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // Heavy, precise, slow to settle. D-B2: a light ring the eye can see past, and no breath hold.
  dmr: {
    sway: 1.1, sprintOutMs: 200, raise: 0.9,
    flash: 0.26, shake: 0.010, tracer: 1.3, casings: 1, casingScale: 1.2, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 0, scope: "ring", breath: false, scopeDrift: 0.5, bipod: false,
  },
  // Cannon. The bolt kicks it out of the scope for most of a second (S1) and drops the case then.
  sniper: {
    sway: 1.0, sprintOutMs: 300, raise: 1.0,
    flash: 0.45, shake: 0.014, tracer: 1.6, casings: 0, casingScale: 1.8, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 700, scope: "tube", breath: true, scopeDrift: 1.0, bipod: false,
  },
  // Thump. The shell is its own tracer, and the case comes out at the break-open reload.
  launcher: {
    sway: 1.3, sprintOutMs: 220, raise: 1.0,
    flash: 0.35, shake: 0.014, tracer: 0, casings: 0, casingScale: 1.0, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 0, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
  // A nudge. Nothing fires, so nothing flashes, traces or ejects.
  clippers: {
    sway: 0.4, sprintOutMs: 60, raise: 0.4,
    flash: 0, shake: 0.002, tracer: 0, casings: 0, casingScale: 1.0, ejectDown: false, tracerCount: 1, beltLink: false,
    actionMs: 0, scope: null, breath: false, scopeDrift: 0, bipod: false,
  },
};

export const feelOf = (id: WeaponId): WeaponFeel => WEAPON_FEEL[id];

// ---------------------------------------------------------------- the matrix's named rules

/**
 * R1: aiming scales look sensitivity by the zoom actually applied, so the reticle covers the same
 * arc of the world per centimetre of mouse whatever the weapon. Mirrors the FOV blend in
 * `LocalPlayer.updateCamera` exactly — at `adsBlend` 0 it is 1, fully aimed it is `adsZoom`.
 */
export function lookScale(adsZoom: number, adsBlend: number): number {
  return 1 - adsBlend * (1 - adsZoom);
}

/** B1: the LMG settles onto its bipod after being crouched and stationary for a moment. */
export const BIPOD = { stillMs: 400, speed: 0.6, sway: 0.3, recoil: 0.6 } as const;

export function bipodDeployed(feel: WeaponFeel, crouching: boolean, stillMs: number): boolean {
  return feel.bipod && crouching && stillMs >= BIPOD.stillMs;
}

/** Viewmodel sway multiplier for a weapon, with the bipod applied when it is down. */
export function swayScaleOf(feel: WeaponFeel, bipod: boolean): number {
  return feel.sway * (bipod ? BIPOD.sway : 1);
}

/**
 * C1: a pellet weapon's cone is far wider than the crosshair's 34 px gap cap, so the shotgun draws
 * a ring at the true spread radius instead of four lines that stop growing.
 */
export const pelletRing = (id: WeaponId): boolean => WEAPONS[id].pellets > 1;

// ---------------------------------------------------------------- the signature, from the matrix

/** The six axes as a normalised vector; `weapon-signature.mjs` measures the same shape in a browser. */
export interface SignatureAxes {
  /** Total climb of a six-shot burst (rad). */
  climb: number;
  /** Sideways wander of that burst: RMS of the side steps (rad). */
  wander: number;
  /** Seconds between shots. */
  interval: number;
  /** ADS time (s) and the zoom it reaches. */
  adsMs: number;
  zoom: number;
  /** Handling: sway, sprint-out (s). */
  sway: number;
  sprintOut: number;
  /** Audio: how long the report rings for (s). */
  tail: number;
  /** Visual violence: shake per shot. */
  shake: number;
}

/**
 * Every axis is a strictly positive ratio quantity, and the ear and hand read all of them
 * proportionally: 420 rpm against 1000 rpm is the same size of difference as 45 against 107, and
 * in raw seconds those two gaps are 0.083 s and 0.79 s — a tenfold lie. So each axis is compared in
 * OCTAVES (log2) and then divided by the roster's own spread in that space (standard deviations
 * measured over all eleven weapons, 2026-09-08). A distance of 1.0 means one standard deviation on
 * one axis; the roster's median pair sits near 4.
 */
const AXIS_SCALE: Record<keyof SignatureAxes, number> = {
  climb: 1 / 1.318, wander: 1 / 0.616, interval: 1 / 1.561, adsMs: 1 / 0.478, zoom: 1 / 0.459,
  sway: 1 / 0.584, sprintOut: 1 / 0.706, tail: 1 / 1.351, shake: 1 / 1.043,
};

const BURST = 6;

/** The intended signature of a weapon, read from `WeaponDef` + the feel table (no browser needed). */
export function signatureOf(id: WeaponId, tailSeconds: number): SignatureAxes {
  const w = WEAPONS[id];
  const f = WEAPON_FEEL[id];
  let climb = 0;
  let side2 = 0;
  for (let i = 0; i < BURST; i++) {
    const step = w.recoilPattern.length ? w.recoilPattern[i % w.recoilPattern.length] : ([w.recoilUp, 0] as const);
    climb += step[0];
    side2 += step[1] * step[1];
  }
  return {
    climb,
    wander: Math.sqrt(side2 / BURST),
    interval: 60 / w.rpm,
    adsMs: w.adsMs / 1000,
    zoom: w.adsZoom,
    sway: f.sway,
    sprintOut: f.sprintOutMs / 1000,
    tail: tailSeconds,
    shake: f.shake,
  };
}

/** Euclidean distance between two signatures, per axis in octaves and normalised (see AXIS_SCALE). */
export function signatureDistance(a: SignatureAxes, b: SignatureAxes): number {
  let sum = 0;
  for (const k of Object.keys(AXIS_SCALE) as (keyof SignatureAxes)[]) {
    // Floored so a zero axis (the melee weapon zooms and travels nowhere) cannot become -Infinity.
    const d = (Math.log2(Math.max(1e-4, a[k])) - Math.log2(Math.max(1e-4, b[k]))) * AXIS_SCALE[k];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** The closest pair in the roster, which is what "they all feel different" actually rests on. */
export function closestPair(
  tail: (id: WeaponId) => number,
  ids: readonly WeaponId[] = WEAPON_ORDER,
): { a: WeaponId; b: WeaponId; distance: number } {
  let best = { a: ids[0], b: ids[1], distance: Infinity };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = signatureDistance(signatureOf(ids[i], tail(ids[i])), signatureOf(ids[j], tail(ids[j])));
      if (d < best.distance) best = { a: ids[i], b: ids[j], distance: d };
    }
  }
  return best;
}
