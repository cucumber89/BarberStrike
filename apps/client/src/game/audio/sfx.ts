/**
 * Sound design. Every one-shot is a pure graph builder `(g, ...) => durationSeconds` that
 * wires nodes from `g.t` into `g.out`. No asset files: transients are filtered noise bursts,
 * bodies are pitch-swept oscillators, tails are darkened noise. Levels are chosen so a single
 * sound peaks between roughly -12 and -1 dBFS before the buses (the self-test asserts this).
 */
import type { GrenadeId, WeaponId } from "@frankibarber/shared";
import { env, filter, gain, glide, noise, osc, pan, saturator, send, vary, type Graph } from "./synth";

export type SoundFn = (g: Graph) => number;

// ---------------------------------------------------------------- gunshots

interface GunVoice {
  /** Body fundamental (Hz) — the "thump". */
  f0: number;
  /** Body length (s). */
  body: number;
  /** Tail length (s) and its low-pass. */
  tail: number; tailLp: number;
  /** Transient high-pass (Hz) and length (s). */
  clickHp: number; click: number;
  /** Supersonic "crack" band: centre Hz (0 = none), length. */
  crack: number; crackLen: number;
  /** Noise width: 1 = mono burst, 2 = wide (second decorrelated layer). */
  width: 1 | 2;
  level: number;
  verb: number;
}

const GUNS: Record<WeaponId, GunVoice> = {
  pistol:   { f0: 190, body: 0.06, tail: 0.28, tailLp: 3200, clickHp: 3200, click: 0.010, crack: 0,    crackLen: 0,     width: 1, level: 0.80, verb: 0.35 },
  revolver: { f0: 120, body: 0.09, tail: 0.6,  tailLp: 2400, clickHp: 2600, click: 0.014, crack: 2200, crackLen: 0.02,  width: 2, level: 0.92, verb: 0.5 },
  smg:      { f0: 240, body: 0.04, tail: 0.16, tailLp: 4800, clickHp: 3800, click: 0.008, crack: 0,    crackLen: 0,     width: 1, level: 0.68, verb: 0.25 },
  smg2:     { f0: 290, body: 0.03, tail: 0.12, tailLp: 5200, clickHp: 4200, click: 0.006, crack: 0,    crackLen: 0,     width: 1, level: 0.62, verb: 0.22 },
  rifle:    { f0: 150, body: 0.07, tail: 0.42, tailLp: 2600, clickHp: 2800, click: 0.012, crack: 2600, crackLen: 0.025, width: 1, level: 0.86, verb: 0.40 },
  lmg:      { f0: 125, body: 0.08, tail: 0.5,  tailLp: 2200, clickHp: 2400, click: 0.013, crack: 2400, crackLen: 0.02,  width: 2, level: 0.9,  verb: 0.45 },
  shotgun:  { f0: 72,  body: 0.13, tail: 0.75, tailLp: 1300, clickHp: 1800, click: 0.018, crack: 0,    crackLen: 0,     width: 2, level: 0.95, verb: 0.55 },
  dmr:      { f0: 105, body: 0.09, tail: 0.95, tailLp: 2000, clickHp: 2400, click: 0.014, crack: 3100, crackLen: 0.035, width: 1, level: 0.92, verb: 0.60 },
  sniper:   { f0: 80,  body: 0.12, tail: 1.4,  tailLp: 1600, clickHp: 2000, click: 0.02,  crack: 3400, crackLen: 0.05,  width: 2, level: 1.0,  verb: 0.75 },
  launcher: { f0: 60,  body: 0.14, tail: 0.5,  tailLp: 900,  clickHp: 1200, click: 0.02,  crack: 0,    crackLen: 0,     width: 2, level: 0.85, verb: 0.5 },
  // Never used for a bang: the clippers "shot" is `meleeSwing` (kept so the table stays total).
  clippers: { f0: 300, body: 0.02, tail: 0.05, tailLp: 3000, clickHp: 3000, click: 0.005, crack: 0,    crackLen: 0,     width: 1, level: 0.3,  verb: 0.1 },
};

/** Clippers swing: the motor buzz rising through the arc, with a snap when it connects. */
export function meleeSwing(hit: boolean): SoundFn {
  return (g) => {
    const t = g.t;
    const buzz = osc(g, "sawtooth", 110, 0.3);
    glide(buzz.frequency, t, 95, 140, 0.25);
    const bF = filter(g, "bandpass", 900, 1.5);
    const bG = gain(g, 0);
    buzz.connect(bF); bF.connect(bG); bG.connect(g.out);
    env(bG.gain, t, 0.22, 0.02, 0.2, 0.05);
    swish(g, t + 0.02, 400, 1900, 0.18, 0.18);
    if (hit) { thud(g, t + 0.12, 150, 0.45, 0.06); click(g, t + 0.12, 2600, 0.25, 0.012); }
    return 0.45;
  };
}

/** Perk consumed: a gulp (flask), a syringe click + hiss (roids; was a lighter for the old joint perk), a can crack + fizz (energy), clipper buzz (fade). */
export function perkUse(kind: "flask" | "roids" | "energy" | "fade"): SoundFn {
  return (g) => {
    const t = g.t;
    switch (kind) {
      case "flask": {
        for (let i = 0; i < 3; i++) thud(g, t + i * 0.16, 180 - i * 20, 0.3, 0.05);
        click(g, t + 0.5, 3000, 0.2, 0.02);
        return 0.7;
      }
      case "roids": {
        click(g, t, 2800, 0.3, 0.012); click(g, t + 0.05, 1900, 0.2, 0.01);
        const hG = gain(g, 0);
        const hF = filter(g, "bandpass", 1500, 0.8);
        noise(g, "pink", 0.9).connect(hF); hF.connect(hG); hG.connect(g.out);
        env(hG.gain, t + 0.1, 0.12, 0.3, 0.4, 0.1);
        return 1.0;
      }
      case "energy": {
        click(g, t, 3400, 0.35, 0.015);
        const fG = gain(g, 0);
        const fF = filter(g, "highpass", 3000, 0.7);
        noise(g, "white", 0.6).connect(fF); fF.connect(fG); fG.connect(g.out);
        env(fG.gain, t + 0.02, 0.14, 0.05, 0.45);
        return 0.7;
      }
      case "fade": {
        const buzz = osc(g, "sawtooth", 120, 0.5);
        const bF = filter(g, "bandpass", 1000, 1.4);
        const bG = gain(g, 0);
        buzz.connect(bF); bF.connect(bG); bG.connect(g.out);
        env(bG.gain, t, 0.2, 0.03, 0.35, 0.1);
        return 0.6;
      }
    }
  };
}

/** Plate: a hit rings it (`broke` = it shatters). */
export function plate(broke: boolean): SoundFn {
  return (g) => {
    const t = g.t;
    const o = osc(g, "triangle", broke ? 620 : 900, 0.3);
    const oG = gain(g, 0);
    o.connect(oG); oG.connect(g.out);
    env(oG.gain, t, broke ? 0.3 : 0.18, 0.002, broke ? 0.25 : 0.12);
    click(g, t, 3200, 0.25, 0.012);
    if (broke) { for (let i = 0; i < 4; i++) click(g, t + 0.05 + i * 0.04, 2400 + g.rnd() * 1800, 0.15, 0.01); }
    return 0.5;
  };
}

export function gunshot(weapon: WeaponId, distant = false): SoundFn {
  const v = GUNS[weapon];
  return (g) => {
    const t = g.t;
    const sat = saturator(g);
    const master = gain(g, v.level);
    sat.connect(master);
    master.connect(g.out);
    send(g, master, distant ? v.verb * 1.4 : v.verb);

    // Transient click — the "snap" that reads as a gunshot even at low volume.
    const clickG = gain(g, 0);
    const clickF = filter(g, "highpass", v.clickHp, 0.8);
    noise(g, "white", v.click + 0.02).connect(clickF);
    clickF.connect(clickG);
    clickG.connect(sat);
    env(clickG.gain, t, distant ? 0.45 : 0.95, 0.0005, v.click);

    // Body thump — swept oscillator, hits ~3× f0 and falls to f0 in the first 30 ms.
    const bodyG = gain(g, 0);
    const body = osc(g, "sine", v.f0 * 3, v.body * 3);
    glide(body.frequency, t, v.f0 * 3, v.f0, Math.min(0.035, v.body * 0.6));
    body.frequency.setTargetAtTime(v.f0 * 0.7, t + 0.035, v.body);
    body.connect(bodyG);
    bodyG.connect(sat);
    env(bodyG.gain, t, 1.1, 0.001, v.body);
    // Mid noise body (the "punch" between click and tail).
    const midG = gain(g, 0);
    const midF = filter(g, "bandpass", vary(g, v.f0 * 5, 0.15), 0.9);
    noise(g, "pink", v.body * 2.2).connect(midF);
    midF.connect(midG);
    midG.connect(sat);
    env(midG.gain, t, 0.9, 0.001, v.body * 1.3);

    // Supersonic crack (rifle/dmr): very short bright band right after the click.
    if (v.crack > 0) {
      const cG = gain(g, 0);
      const cF = filter(g, "bandpass", v.crack, 2.2);
      noise(g, "white", v.crackLen + 0.02).connect(cF);
      cF.connect(cG);
      cG.connect(sat);
      env(cG.gain, t + 0.003, 0.8, 0.001, v.crackLen);
    }

    // Tail — darkening noise; the filter sweeps down while the level decays.
    const tailLayers = distant ? 1 : v.width;
    for (let i = 0; i < tailLayers; i++) {
      const tG = gain(g, 0);
      const tF = filter(g, "lowpass", distant ? v.tailLp * 0.45 : v.tailLp, 0.5);
      tF.frequency.setTargetAtTime(distant ? 400 : 700, t + 0.02, v.tail * 0.5);
      noise(g, i === 0 ? "brown" : "pink", v.tail + 0.1, vary(g, 1, 0.08)).connect(tF);
      const out: AudioNode = tailLayers === 2 ? pan(g, i === 0 ? -0.45 : 0.45) : tG;
      if (out !== tG) { tF.connect(tG); tG.connect(out); out.connect(sat); } else { tF.connect(tG); tG.connect(sat); }
      env(tG.gain, t + 0.004, (distant ? 0.55 : 0.42) / tailLayers * (i === 0 ? 1.4 : 1), 0.004, v.tail);
    }
    return v.tail + v.body + 0.25;
  };
}

// ---------------------------------------------------------------- weapon handling

export const dryFire: SoundFn = (g) => {
  const t = g.t;
  const clickG = gain(g, 0);
  const f = filter(g, "highpass", 2400, 1.0);
  noise(g, "white", 0.03).connect(f);
  f.connect(clickG);
  clickG.connect(g.out);
  env(clickG.gain, t, 0.5, 0.0005, 0.008);
  const ping = osc(g, "triangle", 2700, 0.06);
  const pG = gain(g, 0);
  ping.connect(pG);
  pG.connect(g.out);
  env(pG.gain, t + 0.002, 0.18, 0.001, 0.02);
  return 0.12;
};

/** A single mechanical click: metallic ping + noise tick. */
function click(g: Graph, at: number, freq: number, level: number, tick = 0.012): void {
  const nG = gain(g, 0);
  const f = filter(g, "bandpass", freq * 0.8, 1.4);
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf.white;
  src.start(at, g.rnd() * 1.5);
  src.stop(at + tick + 0.05);
  src.connect(f);
  f.connect(nG);
  nG.connect(g.out);
  env(nG.gain, at, level, 0.0005, tick);
  const o = g.ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(freq, at);
  o.start(at); o.stop(at + 0.08);
  const oG = gain(g, 0);
  o.connect(oG);
  oG.connect(g.out);
  env(oG.gain, at + 0.001, level * 0.35, 0.001, 0.018);
}

/** Low, short "thud" (mag seating, landing bodies). */
function thud(g: Graph, at: number, f0: number, level: number, len: number): void {
  const o = g.ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(f0 * 1.8, at);
  o.frequency.exponentialRampToValueAtTime(f0, at + len * 0.5);
  o.start(at); o.stop(at + len * 4);
  const oG = gain(g, 0);
  o.connect(oG);
  oG.connect(g.out);
  env(oG.gain, at, level, 0.002, len);
  const nG = gain(g, 0);
  const f = filter(g, "lowpass", 500, 0.7);
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf.pink;
  src.start(at, g.rnd() * 1.5);
  src.stop(at + len * 3);
  src.connect(f);
  f.connect(nG);
  nG.connect(g.out);
  env(nG.gain, at, level * 0.7, 0.002, len * 0.8);
}

/** Cloth/air swish: band-passed noise with a sweeping centre. */
function swish(g: Graph, at: number, from: number, to: number, len: number, level: number): void {
  const nG = gain(g, 0);
  const f = filter(g, "bandpass", from, 1.1);
  f.frequency.exponentialRampToValueAtTime(to, at + len);
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf.white;
  src.start(at, g.rnd() * 1.5);
  src.stop(at + len + 0.1);
  src.connect(f);
  f.connect(nG);
  nG.connect(g.out);
  env(nG.gain, at, level, len * 0.35, len * 0.5);
}

/** Mag out → mag in → bolt, spread across the weapon's reload time. */
export function reload(weapon: WeaponId, reloadMs: number): SoundFn {
  return (g) => {
    const R = reloadMs / 1000;
    const heavy = weapon === "shotgun" || weapon === "dmr";
    const t = g.t;
    // Release latch + mag sliding out.
    click(g, t + R * 0.10, heavy ? 1500 : 2100, 0.30);
    swish(g, t + R * 0.13, 1400, 500, 0.12, 0.10);
    if (weapon === "shotgun") {
      // Shells fed one at a time.
      for (let i = 0; i < 4; i++) { click(g, t + R * (0.28 + i * 0.13), 1300 + i * 60, 0.22, 0.010); thud(g, t + R * (0.28 + i * 0.13) + 0.01, 180, 0.12, 0.04); }
    } else {
      swish(g, t + R * 0.50, 500, 1600, 0.10, 0.08);
      thud(g, t + R * 0.60, heavy ? 130 : 170, 0.30, 0.05);
      click(g, t + R * 0.62, heavy ? 1700 : 2300, 0.28);
    }
    // Bolt / slide: two clicks, the second lower.
    click(g, t + R * 0.84, 2600, 0.34, 0.014);
    click(g, t + R * 0.84 + 0.07, 1900, 0.30, 0.012);
    thud(g, t + R * 0.84 + 0.07, 220, 0.10, 0.03);
    return R + 0.2;
  };
}

export function equip(equipMs: number): SoundFn {
  return (g) => {
    const E = Math.max(0.2, equipMs / 1000);
    swish(g, g.t, 700, 2100, E * 0.55, 0.16);
    click(g, g.t + E * 0.62, 2200, 0.26, 0.012);
    click(g, g.t + E * 0.62 + 0.05, 1500, 0.18, 0.010);
    return E + 0.1;
  };
}

// ---------------------------------------------------------------- movement

let stepSide = 1;

export function footstep(sprint: boolean, crouch: boolean, remote = false): SoundFn {
  const side = (stepSide = -stepSide);
  return (g) => {
    const t = g.t;
    const len = crouch ? 0.05 : sprint ? 0.075 : 0.06;
    const level = crouch ? 0.22 : sprint ? 0.62 : 0.42;
    const centre = vary(g, crouch ? 380 : sprint ? 900 : 640, 0.25);
    const out: AudioNode = remote ? g.out : pan(g, side * 0.14);
    if (out !== g.out) out.connect(g.out);
    const nG = gain(g, 0);
    const f = filter(g, "bandpass", centre, 0.8);
    noise(g, "pink", len + 0.05).connect(f);
    f.connect(nG);
    nG.connect(out);
    env(nG.gain, t, level, 0.003, len);
    // Heel contact: tiny low thump, bigger when sprinting.
    const hG = gain(g, 0);
    const h = osc(g, "sine", sprint ? 95 : 80, 0.08);
    h.frequency.exponentialRampToValueAtTime(45, t + 0.05);
    h.connect(hG);
    hG.connect(out);
    env(hG.gain, t, crouch ? 0.10 : sprint ? 0.32 : 0.20, 0.002, 0.035);
    return len + 0.15;
  };
}

/** Slide (2.3): cloth and grit dragged over concrete — a long falling swish with a low scrape under it. */
export function slide(): SoundFn {
  return (g) => {
    const t = g.t;
    const out = pan(g, 0); if (out !== g.out) out.connect(g.out);
    const sG = gain(g, 0);
    const f = filter(g, "bandpass", vary(g, 1400, 0.15), 0.7);
    f.frequency.exponentialRampToValueAtTime(420, t + 0.5);
    noise(g, "pink", 0.6).connect(f); f.connect(sG); sG.connect(out);
    env(sG.gain, t, 0.5, 0.02, 0.5, 0.06);
    const lG = gain(g, 0);
    const lf = filter(g, "lowpass", 220, 0.9);
    noise(g, "brown", 0.5).connect(lf); lf.connect(lG); lG.connect(out);
    env(lG.gain, t, 0.45, 0.01, 0.4);
    return 0.7;
  };
}

export const jump: SoundFn = (g) => {
  swish(g, g.t, 350, 1600, 0.14, 0.17);
  return 0.3;
};

export function landing(impactSpeed: number): SoundFn {
  const k = Math.max(0.2, Math.min(1, impactSpeed / 9));
  return (g) => {
    const sat = saturator(g);
    const m = gain(g, 0.9);
    sat.connect(m);
    m.connect(g.out);
    const sub: Graph = { ...g, out: sat };
    thud(sub, g.t, 55 + 30 * k, 0.5 + 0.6 * k, 0.09 + 0.06 * k);
    swish(sub, g.t, 900, 300, 0.08, 0.12 * k);
    send(g, m, 0.25 * k);
    return 0.45;
  };
};

// ---------------------------------------------------------------- combat feedback

function tick(g: Graph, at: number, freq: number, level: number, len = 0.03): void {
  const o = g.ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(freq, at);
  o.start(at); o.stop(at + len * 5);
  const oG = gain(g, 0);
  o.connect(oG);
  oG.connect(g.out);
  env(oG.gain, at, level, 0.001, len);
  // A click transient on top so it cuts through gunfire.
  const nG = gain(g, 0);
  const f = filter(g, "highpass", freq * 1.5, 0.9);
  const src = g.ctx.createBufferSource();
  src.buffer = g.buf.white;
  src.start(at, g.rnd() * 1.5);
  src.stop(at + 0.03);
  src.connect(f);
  f.connect(nG);
  nG.connect(g.out);
  env(nG.gain, at, level * 0.5, 0.0005, 0.006);
}

export function hitConfirm(kind: "body" | "head" | "kill"): SoundFn {
  return (g) => {
    const t = g.t;
    if (kind === "body") { tick(g, t, 1900, 0.42); return 0.15; }
    if (kind === "head") { tick(g, t, 2500, 0.45, 0.025); tick(g, t + 0.045, 3300, 0.40, 0.03); return 0.2; }
    tick(g, t, 2200, 0.40, 0.03);
    tick(g, t + 0.06, 1500, 0.32, 0.05);
    thud(g, t + 0.02, 110, 0.45, 0.09);
    return 0.5;
  };
}

export const damageTaken: SoundFn = (g) => {
  const sat = saturator(g);
  const m = gain(g, 0.9);
  sat.connect(m);
  m.connect(g.out);
  const sub: Graph = { ...g, out: sat };
  thud(sub, g.t, 62, 1.0, 0.14);
  const nG = gain(g, 0);
  const f = filter(g, "lowpass", 600, 0.6);
  noise(g, "brown", 0.2).connect(f);
  f.connect(nG);
  nG.connect(sat);
  env(nG.gain, g.t, 0.7, 0.003, 0.1);
  return 0.5;
};

export const death: SoundFn = (g) => {
  const t = g.t;
  const m = gain(g, 0.55);
  m.connect(g.out);
  send(g, m, 0.5);
  const lp = filter(g, "lowpass", 900, 0.8);
  lp.frequency.exponentialRampToValueAtTime(140, t + 1.3);
  lp.connect(m);
  for (const [f, det] of [[55, -6], [82.4, 5], [110, -3]] as const) {
    const o = osc(g, "sawtooth", f, 1.6);
    o.detune.value = det;
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 1.4);
    const oG = gain(g, 0);
    o.connect(oG);
    oG.connect(lp);
    env(oG.gain, t, 0.32, 0.01, 1.1, 0.1);
  }
  thud(g, t, 48, 0.5, 0.18);
  return 1.8;
};

export const respawn: SoundFn = (g) => {
  const t = g.t;
  const m = gain(g, 0.3);
  m.connect(g.out);
  send(g, m, 0.6);
  const lp = filter(g, "lowpass", 300, 1.2);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.55);
  lp.connect(m);
  for (const f of [220, 330, 440]) {
    const o = osc(g, "triangle", f, 0.9);
    const oG = gain(g, 0);
    o.connect(oG);
    oG.connect(lp);
    env(oG.gain, t, 0.45, 0.25, 0.4, 0.1);
  }
  return 1.0;
};

// ---------------------------------------------------------------- grenades (drop 2)

/** Pin pull: a small ring click and the spoon spring. */
export const pinPull: SoundFn = (g) => {
  click(g, g.t, 2400, 0.28, 0.012);
  click(g, g.t + 0.05, 1700, 0.2, 0.01);
  swish(g, g.t + 0.06, 900, 2600, 0.08, 0.06);
  return 0.25;
};

/** The arm swing as the grenade leaves the hand. */
export const throwSwish: SoundFn = (g) => {
  swish(g, g.t, 300, 1800, 0.22, 0.2);
  return 0.35;
};

/** A grenade body hitting a surface: metallic knock scaled by impact speed. */
export function bounce(kind: GrenadeId, speed: number): SoundFn {
  const k = Math.max(0.15, Math.min(1, speed / 12));
  return (g) => {
    const t = g.t;
    const glass = kind === "molotov";
    thud(g, t, glass ? 260 : 190, 0.35 * k, 0.03);
    click(g, t, glass ? 3200 : kind === "knife" ? 4200 : 1400, 0.3 * k, 0.01);
    if (!glass) click(g, t + 0.012, 900, 0.14 * k, 0.014);
    return 0.2;
  };
}

/** Frag explosion: sub thump, crack, long dark tail. `distance` (m) softens and darkens it. */
export function explosion(distance: number): SoundFn {
  const near = Math.max(0, Math.min(1, 1 - distance / 40));
  return (g) => {
    const t = g.t;
    const sat = saturator(g);
    const master = gain(g, 0.6 + 0.4 * near);
    sat.connect(master);
    master.connect(g.out);
    send(g, master, 0.55 + 0.35 * (1 - near));
    // Sub thump.
    const sub = osc(g, "sine", 120, 0.6);
    glide(sub.frequency, t, 120, 38, 0.25);
    const subG = gain(g, 0);
    sub.connect(subG); subG.connect(sat);
    env(subG.gain, t, 1.2, 0.002, 0.45);
    // Crack.
    const cG = gain(g, 0);
    const cF = filter(g, "bandpass", 1800, 0.9);
    noise(g, "white", 0.08).connect(cF);
    cF.connect(cG); cG.connect(sat);
    env(cG.gain, t, 0.9 * (0.4 + 0.6 * near), 0.001, 0.05);
    // Body + tail: darkening noise, longer when close.
    const tG = gain(g, 0);
    const tF = filter(g, "lowpass", 2600 * (0.4 + 0.6 * near), 0.5);
    tF.frequency.setTargetAtTime(220, t + 0.05, 0.5);
    noise(g, "brown", 1.8).connect(tF);
    tF.connect(tG); tG.connect(sat);
    env(tG.gain, t + 0.005, 0.8, 0.005, 1.1 + 0.6 * near);
    // Debris ticks.
    for (let i = 0; i < 5; i++) click(g, t + 0.12 + i * 0.09 + g.rnd() * 0.05, 1500 + g.rnd() * 1500, 0.1 * near, 0.01);
    return 2.4;
  };
}

/**
 * The planted charge (2.3). `urgency` 0..1 over the fuse: the chirp gets a touch higher and sharper;
 * ≥ 2 is the final tone, one long unbroken note before the blast.
 */
export function bombBeep(urgency: number): SoundFn {
  return (g) => {
    const t = g.t;
    if (urgency >= 2) {
      const o = osc(g, "square", 2200, 1.15); const f = filter(g, "lowpass", 5200, 0.5); const gg = gain(g, 0);
      o.connect(f); f.connect(gg); gg.connect(g.out);
      env(gg.gain, t, 0.35, 0.004, 0.08, 1.02);
      return 1.2;
    }
    const u = Math.max(0, Math.min(1, urgency));
    const freq = 2000 + 500 * u, len = 0.055 + 0.02 * (1 - u);
    const o = osc(g, "square", freq, len + 0.05); const f = filter(g, "lowpass", 5200, 0.5); const gg = gain(g, 0);
    o.connect(f); f.connect(gg); gg.connect(g.out);
    env(gg.gain, t, 0.3 + 0.15 * u, 0.003, 0.02, len);
    return len + 0.1;
  };
}

/** "Bomb has been planted": three rising keypad tones and a latch. */
export const bombPlanted: SoundFn = (g) => {
  const t = g.t;
  [620, 830, 1040].forEach((f, i) => {
    const o = osc(g, "square", f, 0.12); const lp = filter(g, "lowpass", 3600, 0.6); const gg = gain(g, 0);
    o.connect(lp); lp.connect(gg); gg.connect(g.out);
    env(gg.gain, t + i * 0.11, 0.28, 0.004, 0.03, 0.07);
  });
  click(g, t + 0.36, 900, 0.25, 0.02);
  return 0.6;
};

/** "Bomb has been defused": two falling tones and the wire snip. */
export const bombDefused: SoundFn = (g) => {
  const t = g.t;
  [1040, 620].forEach((f, i) => {
    const o = osc(g, "square", f, 0.16); const lp = filter(g, "lowpass", 3600, 0.6); const gg = gain(g, 0);
    o.connect(lp); lp.connect(gg); gg.connect(g.out);
    env(gg.gain, t + i * 0.15, 0.26, 0.004, 0.04, 0.1);
  });
  click(g, t + 0.34, 2400, 0.3, 0.015);
  return 0.6;
};

/** The charge going off (2.3): the frag's shape, three times the weight, a tail that rolls on. */
export function c4Blast(distance: number): SoundFn {
  const near = Math.max(0, Math.min(1, 1 - distance / 90));
  return (g) => {
    const t = g.t;
    const sat = saturator(g);
    const master = gain(g, 0.75 + 0.35 * near);
    sat.connect(master); master.connect(g.out);
    send(g, master, 0.6 + 0.3 * (1 - near));
    // Sub: deeper and much longer than a grenade's.
    const sub = osc(g, "sine", 95, 1.6);
    glide(sub.frequency, t, 95, 24, 0.9);
    const subG = gain(g, 0); sub.connect(subG); subG.connect(sat);
    env(subG.gain, t, 1.4, 0.002, 1.3);
    // Crack, then the pressure wave: a second, lower slap a few ms later.
    const cG = gain(g, 0); const cF = filter(g, "bandpass", 1500, 0.8);
    noise(g, "white", 0.12).connect(cF); cF.connect(cG); cG.connect(sat);
    env(cG.gain, t, 1.0 * (0.5 + 0.5 * near), 0.001, 0.08);
    const pG = gain(g, 0); const pF = filter(g, "lowpass", 900, 0.7);
    noise(g, "brown", 0.3).connect(pF); pF.connect(pG); pG.connect(sat);
    env(pG.gain, t + 0.03, 1.1, 0.004, 0.25);
    // Tail: rolls on for seconds, darkening; longer up close.
    const tG = gain(g, 0); const tF = filter(g, "lowpass", 2200 * (0.4 + 0.6 * near), 0.5);
    tF.frequency.setTargetAtTime(150, t + 0.1, 0.9);
    noise(g, "brown", 4.2).connect(tF); tF.connect(tG); tG.connect(sat);
    env(tG.gain, t + 0.01, 0.9, 0.01, 2.6 + 1.2 * near);
    // Debris: a longer rain of it.
    for (let i = 0; i < 12; i++) click(g, t + 0.2 + i * 0.13 + g.rnd() * 0.08, 900 + g.rnd() * 2200, 0.12 * near, 0.012);
    return 4.6;
  };
}

/** Flashbang: a hard crack, then a ringing sine that fades with the blindness. `strength` 0..1 (0 = heard from afar). */
export function flashBang(strength: number): SoundFn {
  return (g) => {
    const t = g.t;
    const sat = saturator(g);
    const m = gain(g, 0.9);
    sat.connect(m); m.connect(g.out);
    send(g, m, 0.5);
    const cG = gain(g, 0);
    const cF = filter(g, "highpass", 900, 0.8);
    noise(g, "white", 0.12).connect(cF);
    cF.connect(cG); cG.connect(sat);
    env(cG.gain, t, 1.1, 0.001, 0.09);
    thud(g, t, 150, 0.6, 0.06);
    if (strength > 0.05) {
      const ring = osc(g, "sine", 3400, 0.4 + strength * 2.4);
      const rG = gain(g, 0);
      ring.connect(rG); rG.connect(g.out);
      env(rG.gain, t + 0.02, 0.16 * strength, 0.01, 0.4 + strength * 2.2, 0.1);
    }
    return 0.6 + strength * 2.5;
  };
}

/** Smoke canister: pop, then a hiss that runs for `seconds`. */
export function smokeHiss(seconds: number): SoundFn {
  return (g) => {
    const t = g.t;
    click(g, t, 1300, 0.3, 0.02);
    const hG = gain(g, 0);
    const hF = filter(g, "bandpass", 2600, 0.6);
    noise(g, "white", seconds + 0.5).connect(hF);
    hF.connect(hG); hG.connect(g.out);
    env(hG.gain, t + 0.02, 0.18, 0.15, seconds * 0.7, seconds * 0.25);
    return seconds + 0.5;
  };
}

/** Molotov: glass shatter and the whump of the fire catching; a crackle loop follows via `fireCrackle`. */
export const molotovBreak: SoundFn = (g) => {
  const t = g.t;
  for (let i = 0; i < 7; i++) click(g, t + i * 0.012 + g.rnd() * 0.01, 3200 + g.rnd() * 2500, 0.22, 0.008);
  const wG = gain(g, 0);
  const wF = filter(g, "lowpass", 900, 0.6);
  noise(g, "brown", 0.5).connect(wF);
  wF.connect(wG); wG.connect(g.out);
  env(wG.gain, t + 0.03, 0.7, 0.04, 0.35);
  thud(g, t + 0.03, 90, 0.5, 0.1);
  return 0.9;
};

/** Burning pool: filtered crackle for `seconds` (played positionally). */
export function fireCrackle(seconds: number): SoundFn {
  return (g) => {
    const t = g.t;
    const bG = gain(g, 0);
    const bF = filter(g, "bandpass", 700, 0.5);
    noise(g, "pink", seconds + 0.5).connect(bF);
    bF.connect(bG); bG.connect(g.out);
    env(bG.gain, t, 0.3, 0.2, seconds * 0.75, seconds * 0.2);
    for (let i = 0; i < seconds * 9; i++) click(g, t + g.rnd() * seconds, 1800 + g.rnd() * 2200, 0.08 + g.rnd() * 0.08, 0.006);
    return seconds + 0.5;
  };
}

/** Throwing knife hitting a wall (stuck) or a body. */
export function knifeHit(body: boolean): SoundFn {
  return (g) => {
    const t = g.t;
    if (body) { thud(g, t, 140, 0.4, 0.05); swish(g, t, 1200, 400, 0.08, 0.1); return 0.3; }
    click(g, t, 3800, 0.35, 0.012);
    const ring = osc(g, "triangle", 2900, 0.3);
    const rG = gain(g, 0);
    ring.connect(rG); rG.connect(g.out);
    env(rG.gain, t + 0.005, 0.12, 0.002, 0.25);
    return 0.4;
  };
}

/** Shop: cash register for a purchase, a coin drop for a sale, a dull buzz for a refusal. */
export function cash(kind: "buy" | "sell" | "deny"): SoundFn {
  return (g) => {
    const t = g.t;
    if (kind === "deny") {
      const o = osc(g, "square", 160, 0.16);
      const f = filter(g, "lowpass", 700, 0.7);
      const oG = gain(g, 0);
      o.connect(f); f.connect(oG); oG.connect(g.out);
      env(oG.gain, t, 0.2, 0.004, 0.08, 0.05);
      return 0.3;
    }
    if (kind === "sell") { tick(g, t, 2600, 0.22, 0.03); tick(g, t + 0.07, 3200, 0.18, 0.04); return 0.25; }
    click(g, t, 2000, 0.3, 0.015);
    tick(g, t + 0.06, 2093, 0.25, 0.08);
    tick(g, t + 0.06, 2637, 0.18, 0.09);
    click(g, t + 0.16, 1400, 0.2, 0.02);
    return 0.4;
  };
}

// ---------------------------------------------------------------- UI + match

export type UiSoundKind = "hover" | "click" | "back" | "open" | "close" | "error";

export function ui(kind: UiSoundKind): SoundFn {
  return (g) => {
    const t = g.t;
    switch (kind) {
      case "hover": tick(g, t, 1500, 0.12, 0.012); return 0.08;
      case "click": tick(g, t, 1000, 0.30, 0.02); tick(g, t + 0.03, 1400, 0.16, 0.015); return 0.12;
      case "back": tick(g, t, 800, 0.26, 0.025); return 0.12;
      case "open": swish(g, t, 500, 2200, 0.12, 0.10); tick(g, t + 0.09, 1300, 0.2, 0.02); return 0.25;
      case "close": swish(g, t, 2200, 500, 0.12, 0.10); tick(g, t + 0.09, 900, 0.2, 0.02); return 0.25;
      case "error": {
        const o = osc(g, "square", 190, 0.14);
        const f = filter(g, "lowpass", 900, 0.7);
        const oG = gain(g, 0);
        o.connect(f); f.connect(oG); oG.connect(g.out);
        env(oG.gain, t, 0.22, 0.004, 0.06, 0.05);
        return 0.25;
      }
    }
  };
}

export function countdownBeep(final: boolean): SoundFn {
  return (g) => {
    const o = osc(g, "sine", final ? 1320 : 880, 0.2);
    const oG = gain(g, 0);
    o.connect(oG);
    oG.connect(g.out);
    env(oG.gain, g.t, final ? 0.32 : 0.24, 0.004, 0.09, final ? 0.10 : 0.04);
    return 0.4;
  };
}

/** Two low notes, restrained; the second lands a fifth up (start) or a fourth down (end). */
export function stinger(kind: "start" | "end"): SoundFn {
  return (g) => {
    const t = g.t;
    const m = gain(g, 0.5);
    m.connect(g.out);
    send(g, m, 0.7);
    const lp = filter(g, "lowpass", 700, 0.9);
    lp.connect(m);
    const notes: [number, number][] = kind === "start" ? [[73.4, 0], [110, 0.42]] : [[110, 0], [82.4, 0.5]];
    for (const [f, at] of notes) {
      for (const det of [-7, 6]) {
        const o = g.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, t + at);
        o.detune.value = det;
        o.start(t + at); o.stop(t + at + 1.6);
        const oG = gain(g, 0);
        o.connect(oG);
        oG.connect(lp);
        env(oG.gain, t + at, 0.28, 0.03, kind === "end" ? 0.9 : 0.6, 0.15);
      }
    }
    thud(g, t, 45, 0.5, 0.16);
    return 2.2;
  };
}
