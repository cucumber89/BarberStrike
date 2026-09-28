/**
 * Foley: the body and the gear (owner, 2026-09-28: a new sound mechanic for walking, jumping,
 * shooting "and the rest").
 *
 * Every sound here is built from what it touches (`surfaces.ts`). A step is not one noise burst any
 * more but a heel strike and a toe roll, shaped by the surface's own voice: grit on concrete, a
 * bright click and a ring on tile, a hollow knock on boards, the long ring of a steel grating, a
 * crunch of gravel grains, a swish of grass, a splash. The gait sets the force and the rhythm; the
 * gear the player carries rattles with it. A jump pushes off the surface with an effort breath, a
 * landing lands on it with both feet, and a spent case bounces off it.
 *
 * Same contract as `sfx.ts`: a pure graph builder `(g) => seconds`, peaks between -40 and -1 dBFS
 * (the self-test renders every surface of every sound offline and checks).
 */
import type { WeaponId } from "@frankibarber/shared";
import type { Surface } from "./surfaces";
import { env, filter, gain, glide, noise, pan, saturator, send, vary, type Graph } from "./synth";
import type { SoundFn } from "./sfx";
import { feelOf } from "../combat/weaponFeel";

/**
 * How much the loadout rattles, from the weapon in the hands: the feel table's sway is already the
 * roster's "how heavy is this in the hand" number (VZ-9 0.5, AR-31 1.0, MG-4 1.6).
 */
export const gearOf = (weapon: WeaponId): number => Math.max(0.1, Math.min(1, 0.1 + 0.5 * feelOf(weapon).sway));

export type Gait = "crouch" | "walk" | "sprint";

interface SurfaceVoice {
  /** The strike: band-passed noise (Hz, Q, seconds, level, colour). */
  hitHz: number; hitQ: number; hitLen: number; hitLevel: number; colour: "white" | "pink" | "brown";
  /** The body under the foot: a falling sine (Hz, seconds, level). */
  bodyHz: number; bodyLen: number; bodyLevel: number;
  /** Resonant partials the surface rings at (Hz), how long and how loud. Empty = dead surface. */
  ring: readonly number[]; ringLen: number; ringLevel: number;
  /** Loose grains crushed underfoot (gravel, grit, leaves): count, centre Hz, level. */
  grains: number; grainHz: number; grainLevel: number;
  /** The toe dragging on the way off (level of a short swish). */
  scuff: number;
  /** Water: the splash replaces the strike. */
  splash: boolean;
  /** How much of the step goes into the room (a tiled shop rings, a lawn does not). */
  verb: number;
}

export const SURFACE_VOICE: Record<Surface, SurfaceVoice> = {
  concrete: { hitHz: 1400, hitQ: 0.9, hitLen: 0.035, hitLevel: 0.5, colour: "pink", bodyHz: 85, bodyLen: 0.04, bodyLevel: 0.22, ring: [], ringLen: 0, ringLevel: 0, grains: 2, grainHz: 3600, grainLevel: 0.06, scuff: 0.12, splash: false, verb: 0.18 },
  tile: { hitHz: 2600, hitQ: 1.2, hitLen: 0.02, hitLevel: 0.55, colour: "white", bodyHz: 110, bodyLen: 0.03, bodyLevel: 0.16, ring: [2100, 3400], ringLen: 0.05, ringLevel: 0.07, grains: 0, grainHz: 0, grainLevel: 0, scuff: 0.08, splash: false, verb: 0.3 },
  wood: { hitHz: 900, hitQ: 1.0, hitLen: 0.04, hitLevel: 0.42, colour: "pink", bodyHz: 140, bodyLen: 0.08, bodyLevel: 0.32, ring: [230, 410], ringLen: 0.09, ringLevel: 0.12, grains: 0, grainHz: 0, grainLevel: 0, scuff: 0.1, splash: false, verb: 0.2 },
  metal: { hitHz: 1800, hitQ: 1.5, hitLen: 0.022, hitLevel: 0.45, colour: "white", bodyHz: 120, bodyLen: 0.05, bodyLevel: 0.2, ring: [620, 1470, 2890], ringLen: 0.22, ringLevel: 0.11, grains: 0, grainHz: 0, grainLevel: 0, scuff: 0.1, splash: false, verb: 0.28 },
  gravel: { hitHz: 2200, hitQ: 0.7, hitLen: 0.05, hitLevel: 0.25, colour: "white", bodyHz: 70, bodyLen: 0.03, bodyLevel: 0.12, ring: [], ringLen: 0, ringLevel: 0, grains: 7, grainHz: 3800, grainLevel: 0.16, scuff: 0.2, splash: false, verb: 0.1 },
  grass: { hitHz: 3000, hitQ: 0.5, hitLen: 0.07, hitLevel: 0.2, colour: "white", bodyHz: 60, bodyLen: 0.04, bodyLevel: 0.09, ring: [], ringLen: 0, ringLevel: 0, grains: 3, grainHz: 4500, grainLevel: 0.05, scuff: 0.22, splash: false, verb: 0.04 },
  water: { hitHz: 1200, hitQ: 0.6, hitLen: 0.12, hitLevel: 0.45, colour: "white", bodyHz: 70, bodyLen: 0.04, bodyLevel: 0.12, ring: [], ringLen: 0, ringLevel: 0, grains: 4, grainHz: 900, grainLevel: 0.12, scuff: 0, splash: true, verb: 0.2 },
  soft: { hitHz: 600, hitQ: 0.6, hitLen: 0.03, hitLevel: 0.25, colour: "pink", bodyHz: 80, bodyLen: 0.03, bodyLevel: 0.12, ring: [], ringLen: 0, ringLevel: 0, grains: 0, grainHz: 0, grainLevel: 0, scuff: 0.06, splash: false, verb: 0.1 },
};

/** Force, and the gap between heel and toe, per gait. */
const GAIT = {
  crouch: { force: 0.35, roll: 0.085 },
  walk: { force: 0.7, roll: 0.055 },
  sprint: { force: 1.0, roll: 0.032 },
} as const;

// ---------------------------------------------------------------- primitives

function burst(g: Graph, at: number, colour: "white" | "pink" | "brown", hz: number, q: number, len: number, level: number, out: AudioNode): void {
  const f = filter(g, "bandpass", hz, q);
  const n = gain(g, 0);
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf[colour];
  src.start(at, g.rnd() * 1.5);
  src.stop(at + len + 0.08);
  src.connect(f); f.connect(n); n.connect(out);
  env(n.gain, at, level, 0.0015, len);
}

function sine(g: Graph, at: number, from: number, to: number, len: number, level: number, out: AudioNode, type: OscillatorType = "sine"): void {
  const o = g.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + Math.max(0.01, len * 0.7));
  o.start(at); o.stop(at + len * 5 + 0.05);
  const n = gain(g, 0);
  o.connect(n); n.connect(out);
  env(n.gain, at, level, 0.001, len);
}

function ring(g: Graph, at: number, partials: readonly number[], len: number, level: number, out: AudioNode, detune = 0.04): void {
  partials.forEach((hz, i) => sine(g, at, vary(g, hz, detune), vary(g, hz, detune) * 0.995, len * (1 - i * 0.18), level / (1 + i * 0.6), out, "triangle"));
}

function grains(g: Graph, at: number, count: number, hz: number, level: number, spread: number, out: AudioNode): void {
  for (let i = 0; i < count; i++) {
    const t = at + g.rnd() * spread;
    burst(g, t, "white", vary(g, hz, 0.35), 2.2, 0.004 + g.rnd() * 0.006, level * (0.5 + g.rnd() * 0.5), out);
  }
}

function swishOn(g: Graph, at: number, from: number, to: number, len: number, level: number, out: AudioNode): void {
  const f = filter(g, "bandpass", from, 1.0);
  f.frequency.exponentialRampToValueAtTime(to, at + len);
  const n = gain(g, 0);
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf.white;
  src.start(at, g.rnd() * 1.5);
  src.stop(at + len + 0.1);
  src.connect(f); f.connect(n); n.connect(out);
  env(n.gain, at, level, len * 0.3, len * 0.55);
}

function splash(g: Graph, at: number, force: number, out: AudioNode): void {
  const f = filter(g, "bandpass", 700, 0.7);
  glide(f.frequency, at, 600, 2600, 0.1);
  const n = gain(g, 0);
  noise(g, "white", 0.25).connect(f); f.connect(n); n.connect(out);
  env(n.gain, at, 0.35 * force, 0.004, 0.16);
  // Bubbles: short rising sines, the part the ear files as "water".
  for (let i = 0; i < 3; i++) {
    const t = at + 0.02 + g.rnd() * 0.12;
    const o = g.ctx.createOscillator();
    o.type = "sine";
    const f0 = vary(g, 520, 0.3);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.04);
    o.start(t); o.stop(t + 0.08);
    const bg = gain(g, 0);
    o.connect(bg); bg.connect(out);
    env(bg.gain, t, 0.08 * force, 0.002, 0.03);
  }
}

/** One contact with a surface: the strike, the body, the ring, the grains. */
function contact(g: Graph, at: number, v: SurfaceVoice, force: number, out: AudioNode): void {
  const tone = vary(g, 1, 0.1);
  if (v.splash) splash(g, at, force, out);
  else burst(g, at, v.colour, v.hitHz * tone, v.hitQ, v.hitLen, v.hitLevel * force, out);
  sine(g, at, v.bodyHz * 1.8 * tone, v.bodyHz * 0.6, v.bodyLen, v.bodyLevel * force, out);
  if (v.ring.length) ring(g, at + 0.002, v.ring, v.ringLen, v.ringLevel * force, out);
  if (v.grains) grains(g, at, Math.round(v.grains * (0.5 + force * 0.5)), v.grainHz, v.grainLevel * force, 0.05 + 0.04 * force, out);
}

/** Cloth and kit moving with the body: a rustle plus, for a heavy loadout, a couple of metal ticks. */
function gearLayer(g: Graph, at: number, gear: number, force: number, out: AudioNode): void {
  if (gear <= 0) return;
  burst(g, at + 0.01, "pink", vary(g, 1900, 0.2), 0.8, 0.05, 0.05 * force * (0.5 + gear), out);
  if (gear > 0.3 && force > 0.6) {
    const n = Math.round(1 + gear * 2);
    for (let i = 0; i < n; i++) burst(g, at + 0.015 + g.rnd() * 0.05, "white", vary(g, 4200, 0.25), 3, 0.004, 0.05 * gear * force, out);
  }
}

// ---------------------------------------------------------------- the body

let stepSide = 1;

/**
 * A footstep on `surface`: heel strike, then the toe rolling off `roll` seconds later. `gear` (0..1)
 * is how much the loadout rattles; `remote` steps stay mono because the panner places them.
 */
export function step(surface: Surface, gait: Gait, gear = 0.4, remote = false): SoundFn {
  const side = (stepSide = -stepSide);
  const v = SURFACE_VOICE[surface];
  const gt = GAIT[gait];
  return (g) => {
    const t = g.t;
    const out: AudioNode = remote ? gain(g, 1) : pan(g, side * 0.12);
    out.connect(g.out);
    send(g, out, v.verb);
    const force = gt.force * vary(g, 1, 0.12);
    contact(g, t, v, force, out);
    // The toe: the same surface, softer, a beat later — two contacts is what a real step is.
    contact(g, t + gt.roll * vary(g, 1, 0.2), v, force * 0.45, out);
    if (v.scuff > 0) swishOn(g, t + gt.roll, vary(g, 2400, 0.2), 900, 0.05, v.scuff * force * 0.5, out);
    gearLayer(g, t, gear, force, out);
    return gt.roll + Math.max(0.12, v.ringLen) + 0.1;
  };
}

/** Push-off: the feet leave the surface, the body exhales with the effort, the clothes whip. */
export function jumpOff(surface: Surface, gear = 0.4): SoundFn {
  const v = SURFACE_VOICE[surface];
  return (g) => {
    const t = g.t;
    const out = gain(g, 1);
    out.connect(g.out);
    send(g, out, v.verb * 0.8);
    contact(g, t, v, 0.75, out);
    if (v.scuff > 0) swishOn(g, t + 0.01, 1600, 3200, 0.06, v.scuff * 0.6, out);
    // The effort: a short exhale through a vowel-shaped band pair.
    for (const [hz, q, lvl] of [[1100, 2.2, 0.09], [2500, 3, 0.05]] as const) burst(g, t + 0.03, "pink", vary(g, hz, 0.06), q, 0.14, lvl, out);
    swishOn(g, t + 0.02, 350, 1600, 0.14, 0.14, out);
    gearLayer(g, t + 0.02, gear, 0.9, out);
    return 0.4;
  };
}

/**
 * Landing on `surface` at `impactSpeed` m/s: both feet a moment apart, the body sinking into the
 * knees, the kit settling — and, from a real drop, the air pushed out of the lungs.
 */
export function land(surface: Surface, impactSpeed: number, gear = 0.4, remote = false): SoundFn {
  const v = SURFACE_VOICE[surface];
  const k = Math.max(0.2, Math.min(1, impactSpeed / 9));
  return (g) => {
    const t = g.t;
    const sat = saturator(g);
    const m = gain(g, 0.85);
    sat.connect(m); m.connect(g.out);
    send(g, m, v.verb * (0.6 + 0.6 * k));
    const out = remote ? sat : (() => { const p = pan(g, 0); p.connect(sat); return p; })();
    contact(g, t, v, 0.6 + 0.5 * k, out);
    contact(g, t + vary(g, 0.022, 0.3), v, 0.45 + 0.4 * k, out);
    // The weight: a low thump that grows with the drop.
    sine(g, t, 110 + 30 * k, 45, 0.08 + 0.07 * k, 0.35 + 0.45 * k, out);
    gearLayer(g, t + 0.02, gear, 0.6 + 0.4 * k, out);
    if (gear > 0 && k > 0.5) for (let i = 0; i < 3; i++) burst(g, t + 0.04 + g.rnd() * 0.08, "white", vary(g, 3200, 0.3), 3, 0.005, 0.07 * k * gear, out);
    if (!remote && k > 0.6) for (const [hz, q, lvl] of [[700, 2, 0.1], [1500, 2.6, 0.05]] as const) burst(g, t + 0.05, "pink", hz, q, 0.12, lvl * k, out);
    return 0.5 + v.ringLen;
  };
}

// ---------------------------------------------------------------- the gear

/** Aim in / out, crouch down / stand up: cloth, a strap, the stock meeting the shoulder. */
export type FoleyKind = "aimIn" | "aimOut" | "crouch" | "stand";

export function foley(kind: FoleyKind, gear = 0.4): SoundFn {
  return (g) => {
    const t = g.t;
    const out = gain(g, 1);
    out.connect(g.out);
    switch (kind) {
      case "aimIn":
        swishOn(g, t, 900, 2200, 0.08, 0.08, out);
        // The stock against the shoulder, and the kit shifting.
        sine(g, t + 0.06, 180, 90, 0.03, 0.08, out);
        burst(g, t + 0.065, "white", vary(g, 3800, 0.2), 3, 0.004, 0.035 * (0.5 + gear), out);
        return 0.25;
      case "aimOut":
        swishOn(g, t, 1800, 800, 0.08, 0.06, out);
        return 0.2;
      case "crouch":
        swishOn(g, t, 1400, 500, 0.16, 0.1, out);
        sine(g, t + 0.1, 120, 60, 0.04, 0.1, out);
        gearLayer(g, t + 0.08, gear, 0.7, out);
        return 0.35;
      case "stand":
        swishOn(g, t, 500, 1500, 0.14, 0.08, out);
        gearLayer(g, t + 0.06, gear, 0.5, out);
        return 0.3;
    }
  };
}

/**
 * The machine inside a self-loading gun, right by the ear: the carrier slamming back and home a
 * few milliseconds after the report. With the magazine nearly empty it rings lighter — the spring
 * and the last rounds rattle in a hollow box, which a shooter learns to hear as "reload soon".
 */
export function mechanism(weapon: WeaponId, lowAmmo = 0): SoundFn {
  const heavy = weapon === "lmg" || weapon === "dmr" || weapon === "autoshotgun";
  const light = weapon === "pistol" || weapon === "machinepistol" || weapon === "smg" || weapon === "smg2";
  return (g) => {
    const t = g.t;
    const out = gain(g, 1);
    out.connect(g.out);
    const hz = heavy ? 2200 : light ? 3600 : 2900;
    burst(g, t + 0.012, "white", hz, 2.5, 0.006, 0.16, out);
    burst(g, t + (heavy ? 0.045 : light ? 0.028 : 0.036), "white", hz * 0.8, 2.2, 0.008, 0.14, out);
    sine(g, t + 0.012, heavy ? 420 : 620, heavy ? 300 : 480, 0.02, 0.06, out, "triangle");
    if (lowAmmo > 0) ring(g, t + 0.03, [vary(g, 5200, 0.05), 7900], 0.07, 0.05 + 0.07 * lowAmmo, out, 0.02);
    return 0.2;
  };
}

/** What a case is made of: rifle and pistol brass, a plastic shotgun hull, a big magnum case. */
export type CaseKind = "brass" | "hull" | "big";

/**
 * A spent case landing on `surface`: two or three bounces, each quieter and closer together. Brass
 * rings on hard floors and all but vanishes in grass; a shotgun hull is a dull plastic tock.
 */
export function casing(surface: Surface, kind: CaseKind): SoundFn {
  const v = SURFACE_VOICE[surface];
  return (g) => {
    const t = g.t;
    const out = gain(g, 1);
    out.connect(g.out);
    send(g, out, v.verb * 0.6);
    const hard = surface === "concrete" || surface === "tile" || surface === "metal";
    const damp = surface === "grass" ? 0.15 : surface === "water" ? 0.25 : surface === "soft" ? 0.3 : surface === "gravel" ? 0.5 : surface === "wood" ? 0.7 : 1;
    const bounces = surface === "grass" || surface === "water" ? 1 : hard ? 3 : 2;
    let at = t, gap = vary(g, 0.09, 0.2), level = 0.12 * damp;
    for (let i = 0; i < bounces; i++) {
      if (kind === "hull") {
        // Plastic does not ring, so all of a hull's level is in the knock.
        burst(g, at, "pink", vary(g, 900, 0.1), 1.4, 0.02, level * 2.4, out);
        sine(g, at, 420, 260, 0.02, level * 1.2, out);
      } else {
        const base = kind === "big" ? 2600 : 3900;
        ring(g, at, surface === "wood" ? [base * 0.6] : [base, base * 1.57, base * 2.3], hard ? (kind === "big" ? 0.09 : 0.06) : 0.025, level, out, 0.03);
        burst(g, at, "white", 5000, 1.5, 0.004, level * 0.8, out);
      }
      if (surface === "water") splash(g, at, 0.15, out);
      at += gap; gap *= 0.62; level *= 0.55;
    }
    return 0.5;
  };
}
