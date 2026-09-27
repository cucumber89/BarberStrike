import { emoteDef } from "@frankibarber/shared";

/**
 * The dances on H, as joint angles over time.
 *
 * Pure: `(emote id, seconds since it started) → pose`, no Babylon, no state, so a test can measure
 * a dance frame by frame and the wardrobe and the match cannot play it differently. `Character`
 * blends its ordinary pose into this one and back out, so a dance starts and ends without a snap.
 *
 * Conventions (the rig's, read off `Character.ts`; all radians unless named metres):
 *  - arm/forearm/leg X negative swings the limb FORWARD (−π/2 is horizontal, −π straight up);
 *    a forearm's or shin's X bends the elbow / knee (forearm −, shin +).
 *  - arm Z raises it SIDEWAYS: the right arm out with +Z, the left arm out with −Z. Leg Z likewise.
 *  - torso X + bows forward, head X + looks down, torso Z − tips to the character's right.
 *  - `hipsY` / `hipsX` are metres from the rest position; `spin` turns the whole body over its feet.
 */
export interface EmotePose {
  hipsY: number; hipsX: number; hipsRotX: number; hipsRotZ: number; spin: number;
  torsoX: number; torsoY: number; torsoZ: number;
  headX: number; headY: number; headZ: number;
  armR: [number, number, number]; foreR: [number, number, number];
  armL: [number, number, number]; foreL: [number, number, number];
  legR: [number, number]; legL: [number, number];
  shinR: number; shinL: number;
}

export const emptyEmotePose = (): EmotePose => ({
  hipsY: 0, hipsX: 0, hipsRotX: 0, hipsRotZ: 0, spin: 0,
  torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, headZ: 0,
  armR: [0, 0, 0.12], foreR: [0, 0, 0], armL: [0, 0, -0.12], foreL: [0, 0, 0],
  legR: [0, 0], legL: [0, 0], shinR: 0, shinL: 0,
});

const TAU = Math.PI * 2;
const set3 = (v: [number, number, number], x: number, y: number, z: number) => { v[0] = x; v[1] = y; v[2] = z; };
const set2 = (v: [number, number], x: number, z: number) => { v[0] = x; v[1] = z; };
/** 0 → 1 over the first `span` of a unit interval, eased: a snap into a pose that still reads as motion. */
const snap = (f: number, span = 0.18) => { const x = Math.min(1, f / span); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Dance = (t: number, p: EmotePose) => void;

const DANCES: Record<string, Dance> = {
  /** A big wave over the head, the forearm doing the work. */
  machanie(t, p) {
    const w = Math.sin(t * TAU * 2.5);
    set3(p.armR, 0, 0, 2.3 + 0.1 * w);
    set3(p.foreR, 0, 0, 0.75 + 0.35 * w); // always bent: an open hand swinging, never a straight arm
    set3(p.armL, 0.05, 0, -0.14);
    p.headZ = -0.08 + 0.04 * w; p.headY = 0.15;
    p.torsoZ = -0.05; p.hipsX = 0.02;
  },

  /** The barber's own: a comb stroked back over the crown, the other hand on the hip. */
  czesanie(t, p) {
    const s = Math.sin(t * TAU / 1.4 * 2);
    set3(p.armR, -2.45, 0, 0.35);
    set3(p.foreR, -1.45 + 0.35 * s, 0, 0);
    set3(p.armL, 0.25, 0.5, -0.75);
    set3(p.foreL, -1.5, 0, 0);
    p.headX = -0.12 + 0.05 * s; p.headZ = 0.12; p.headY = -0.2;
    p.torsoZ = 0.04; p.hipsX = -0.03; p.hipsRotZ = 0.05;
  },

  /** Stiff, stepped arm positions: the pose snaps between eight frames and holds. */
  robot(t, p) {
    const beat = t * 4, i = Math.floor(beat) % 8, f = snap(beat % 1, 0.25);
    const R = [[-1.57, -1.57], [-1.57, -1.57], [0, -1.57], [0, -1.57], [-1.57, 0], [-1.57, 0], [-3.0, -1.57], [0, -1.57]];
    const L = [[0, -1.57], [-1.57, -1.57], [-1.57, -1.57], [0, -1.57], [0, -1.57], [-1.57, -1.57], [0, -1.57], [-3.0, -1.57]];
    const heads = [0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0];
    const prev = (i + 7) % 8;
    set3(p.armR, lerp(R[prev][0], R[i][0], f), 0, 0.18);
    set3(p.foreR, lerp(R[prev][1], R[i][1], f), 0, 0);
    set3(p.armL, lerp(L[prev][0], L[i][0], f), 0, -0.18);
    set3(p.foreL, lerp(L[prev][1], L[i][1], f), 0, 0);
    p.headY = lerp(heads[prev], heads[i], f);
    p.torsoY = p.headY * 0.35;
    const knee = i % 2 ? 0.25 : 0.05;
    p.shinR = p.shinL = knee; p.legR[0] = p.legL[0] = -knee * 0.5; p.hipsY = -knee * 0.12;
  },

  /** Face into one elbow, the other arm thrown out and up. Alternates sides every beat. */
  dab(t, p) {
    const half = 0.9, side = Math.floor(t / half) % 2 === 0 ? 1 : -1, f = snap((t % half) / half, 0.14);
    const out: [number, number, number] = [-0.55 * f, 0, 2.0 * f + 0.12 * (1 - f)];
    const across: [number, number, number] = [-1.75 * f, 0.7 * f, 0];
    const bend = -2.0 * f;
    if (side > 0) {
      set3(p.armR, out[0], out[1], out[2]); set3(p.foreR, 0, 0, 0);
      set3(p.armL, across[0], across[1], across[2]); set3(p.foreL, bend, 0, 0);
    } else {
      set3(p.armL, out[0], out[1], -out[2]); set3(p.foreL, 0, 0, 0);
      set3(p.armR, across[0], -across[1], across[2]); set3(p.foreR, bend, 0, 0);
    }
    p.headX = 0.55 * f; p.headY = 0.35 * side * f; p.torsoX = 0.2 * f; p.torsoZ = 0.08 * side * f;
    p.shinR = p.shinL = 0.15 * f; p.legR[0] = p.legL[0] = -0.08 * f;
  },

  /** The floss: straight arms swing one way, the hips the other, arms passing front and back. */
  nitka(t, p) {
    const w = t * TAU / 0.9, s = Math.sin(w), c = Math.cos(w);
    set3(p.armR, -0.42 * c, 0, 0.3 + 0.55 * s);
    set3(p.armL, 0.42 * c, 0, -0.3 + 0.55 * s);
    set3(p.foreR, -0.1, 0, 0); set3(p.foreL, -0.1, 0, 0);
    p.hipsX = -0.07 * s; p.hipsRotZ = 0.14 * s; p.hipsRotX = 0; p.hipsY = -0.03 - 0.02 * Math.abs(c);
    p.torsoZ = -0.2 * s; p.headZ = 0.1 * s;
    p.legR[0] = p.legL[0] = -0.12; p.shinR = p.shinL = 0.25;
  },

  /** "Take the L": an L on the forehead, the legs kicked out to the side in turn. */
  "frajer-l"(t, p) {
    const w = t * TAU / 1.0, s = Math.sin(w);
    set3(p.armL, -2.05, 0.45, -0.1);
    set3(p.foreL, -1.95, 0, 0);
    set3(p.armR, -0.2 - 0.25 * s, 0, 0.4 + 0.2 * Math.abs(s));
    set3(p.foreR, -0.5, 0, 0);
    const r = Math.max(0, s), l = Math.max(0, -s);
    set2(p.legR, -0.15 * r, 0.55 * r); set2(p.legL, -0.15 * l, -0.55 * l);
    p.shinR = 0.6 * r + 0.1; p.shinL = 0.6 * l + 0.1;
    p.hipsY = 0.03 * Math.abs(s) - 0.02; p.hipsRotZ = 0.12 * (l - r);
    p.headX = -0.1; p.headZ = 0.12 * s; p.torsoZ = 0.06 * s;
  },

  /** The horse dance: wrists crossed on invisible reins, a gallop on the spot. */
  konik(t, p) {
    const w = t * TAU / 0.8, s = Math.sin(w), b = Math.abs(Math.sin(w * 2));
    set3(p.armR, -1.05 - 0.15 * b, 0, -0.32);
    set3(p.foreR, -0.7, 0, 0);
    set3(p.armL, -1.05 - 0.15 * b, 0, 0.32);
    set3(p.foreL, -0.7, 0, 0);
    const r = Math.max(0, s), l = Math.max(0, -s);
    set2(p.legR, -0.5 * r - 0.1, 0.12); set2(p.legL, -0.5 * l - 0.1, -0.12);
    p.shinR = 0.9 * r + 0.25; p.shinL = 0.9 * l + 0.25;
    p.hipsY = -0.06 + 0.05 * b; p.torsoX = 0.12; p.headX = -0.05 + 0.06 * b;
  },

  /** The default dance everyone knows: fists driven down across the body in turn, knees on the beat. */
  domowka(t, p) {
    const beat = t * 2, i = Math.floor(beat) % 2, f = snap(beat % 1, 0.3), side = i === 0 ? 1 : -1;
    const bounce = Math.sin((beat % 1) * Math.PI);
    const punch = (arm: [number, number, number], fore: [number, number, number], mirror: number) => {
      set3(arm, lerp(-1.5, -0.45, f), 0, mirror * lerp(0.55, -0.3, f)); set3(fore, lerp(-1.9, -0.25, f), 0, 0);
    };
    const back = (arm: [number, number, number], fore: [number, number, number], mirror: number) => {
      set3(arm, lerp(-0.45, -1.5, f), 0, mirror * lerp(-0.3, 0.55, f)); set3(fore, lerp(-0.25, -1.9, f), 0, 0);
    };
    if (side > 0) { punch(p.armR, p.foreR, 1); back(p.armL, p.foreL, -1); }
    else { punch(p.armL, p.foreL, -1); back(p.armR, p.foreR, 1); }
    p.torsoY = 0.22 * side * (f * 2 - 1); p.torsoX = 0.1;
    p.shinR = p.shinL = 0.15 + 0.4 * bounce; p.legR[0] = p.legL[0] = -0.08 - 0.2 * bounce;
    p.hipsY = -0.02 - 0.08 * bounce; p.headX = 0.05 + 0.08 * bounce;
  },

  /** The Slav squat: heels down, elbows on knees, a slow look round the block and a seed to the mouth. */
  przysiad(t, p) {
    const T = 3.2, u = t % T;
    set2(p.legR, -1.95, 0.42); set2(p.legL, -1.95, -0.42);
    p.shinR = p.shinL = 2.5;
    p.hipsY = -0.55; p.torsoX = 0.5; p.hipsRotX = 0;
    const seed = u > 1.9 && u < 2.7 ? Math.sin((u - 1.9) / 0.8 * Math.PI) : 0;
    set3(p.armR, -1.1 - 0.5 * seed, 0, 0.3 - 0.15 * seed);
    set3(p.foreR, -0.35 - 1.6 * seed, 0, 0);
    set3(p.armL, -1.1, 0, -0.3);
    set3(p.foreL, -0.35, 0, 0);
    p.headX = -0.45 + 0.1 * seed; p.headY = 0.55 * Math.sin(u / T * TAU);
  },

  /** The kazachok: arms folded high, a leg shot out of a deep crouch on every beat. */
  kozak(t, p) {
    const w = t * TAU / 0.7, s = Math.sin(w);
    // Folded: the upper arms forward, the forearms turned in across the chest about the arm's own axis.
    set3(p.armR, -1.0, 0, 0.3); set3(p.foreR, -1.6, -1.25, 0);
    set3(p.armL, -1.0, 0, -0.3); set3(p.foreL, -1.6, 1.25, 0);
    const r = Math.max(0, s), l = Math.max(0, -s);
    set2(p.legR, lerp(-1.6, -1.35, r), 0.15); set2(p.legL, lerp(-1.6, -1.35, l), -0.15);
    p.shinR = lerp(2.3, 0.05, r); p.shinL = lerp(2.3, 0.05, l);
    p.hipsY = -0.5 + 0.04 * Math.abs(s); p.torsoX = -0.05; p.headX = -0.1;
  },

  /** The windmill: arms straight out and the whole body spinning on the planted foot. */
  wiatrak(t, p) {
    const w = t * TAU / 1.0;
    p.spin = w % TAU;
    const flap = 0.1 * Math.sin(w * 2);
    set3(p.armR, 0, 0, 1.55 + flap); set3(p.armL, 0, 0, -1.55 - flap);
    set2(p.legL, -0.55, -0.1); p.shinL = 1.1;
    set2(p.legR, 0, 0.05); p.shinR = 0.05;
    p.torsoZ = 0.12; p.headX = -0.25; p.hipsY = 0.01;
  },

  /**
   * Spucha — the owner's request, the crude one, legendary. Knees out, hips forward, one hand on the
   * back of the head and the other pumping in front of the belt, faster and faster; then the finish:
   * a thrust, the head thrown back and the pumping hand flung out forward and up like something just
   * went off — then a slump, a breath, and again. Cartoon boxes, no anatomy, no effects.
   */
  spucha(t, p) {
    const PUMP = 2.3, BURST = 0.35; // then the slump until the loop ends (3.2 s)
    set2(p.legR, -0.35, 0.28); set2(p.legL, -0.35, -0.28);
    set3(p.armL, -2.5, 0, -0.55);
    set3(p.foreL, -1.9, 0, 0);
    if (t < PUMP) {
      // The stroke accelerates from ~2.5 Hz to ~6 Hz: phase is the integral of a rising frequency.
      const phase = TAU * (2.5 * t + 0.76 * t * t), s = Math.sin(phase), k = t / PUMP;
      set3(p.armR, -0.25 + (0.1 + 0.05 * k) * s, 0, -0.26);
      set3(p.foreR, -0.9 + (0.4 + 0.1 * k) * s, 0, 0);
      p.shinR = p.shinL = 0.6 + 0.05 * s + 0.15 * k;
      p.hipsY = -0.14 + 0.012 * s - 0.03 * k; p.hipsRotX = -0.12 - 0.05 * s;
      p.torsoX = -0.1 + 0.12 * k; p.headX = -0.4 * (1 - k) + 0.25 * k - 0.05 * s; p.headZ = 0.06 * Math.sin(phase / 4);
      return;
    }
    if (t < PUMP + BURST) {
      // The burst: the hand shoots out forward and up, the elbow snaps straight, the hips thrust, the
      // head goes back. Fast in (first 20 %), held with a shudder.
      const u = (t - PUMP) / BURST, f = snap(u, 0.2), shake = 0.05 * Math.sin(u * TAU * 5) * (1 - u);
      set3(p.armR, lerp(-0.25, -1.5, f) + shake, 0, lerp(-0.26, 0.15, f));
      set3(p.foreR, lerp(-0.9, -0.05, f), 0, 0);
      set3(p.armL, lerp(-2.5, -2.8, f), 0, -0.55);
      p.shinR = p.shinL = lerp(0.75, 0.2, f);
      p.hipsY = lerp(-0.17, -0.05, f); p.hipsRotX = lerp(-0.12, -0.32, f);
      p.torsoX = lerp(0.02, -0.28, f); p.headX = lerp(0.25, -0.6, f) + shake; p.headZ = 0;
      return;
    }
    // The slump: everything goes limp, the thrown arm drops, a long breath out.
    const u = (t - PUMP - BURST) / (3.2 - PUMP - BURST), f = snap(u, 0.6), breath = Math.sin(u * Math.PI);
    set3(p.armR, lerp(-1.5, -0.25, f), 0, lerp(0.15, -0.26, f));
    set3(p.foreR, lerp(-0.05, -0.9, f), 0, 0);
    set3(p.armL, lerp(-2.8, -2.5, f), 0, -0.55);
    p.shinR = p.shinL = lerp(0.2, 0.6, f) + 0.15 * breath;
    p.hipsY = lerp(-0.05, -0.14, f) - 0.04 * breath; p.hipsRotX = lerp(-0.32, -0.12, f);
    p.torsoX = lerp(-0.28, -0.1, f) + 0.25 * breath; p.headX = lerp(-0.6, -0.4, f) + 0.45 * breath;
  },
};

/**
 * Writes the pose of `id` at `t` seconds into `out` (allocated once by the caller). Unknown ids play
 * the wave. The dance loops at its own `loopMs`, so the pose at `t` and at `t + loop` are the same.
 */
export function emotePose(id: string, t: number, out: EmotePose): EmotePose {
  const def = emoteDef(id);
  const rest = emptyEmotePose();
  Object.assign(out, rest, { armR: out.armR, foreR: out.foreR, armL: out.armL, foreL: out.foreL, legR: out.legR, legL: out.legL });
  set3(out.armR, ...rest.armR); set3(out.foreR, ...rest.foreR); set3(out.armL, ...rest.armL); set3(out.foreL, ...rest.foreL);
  set2(out.legR, 0, 0); set2(out.legL, 0, 0);
  const loop = def.loopMs / 1000;
  DANCES[def.id](Math.max(0, t) % loop, out);
  return out;
}

/** Every emote id has a dance: checked by the test, so a catalog entry cannot ship as a T-pose. */
export const hasDance = (id: string): boolean => id in DANCES;
