import type { WeaponId } from "@frankibarber/shared";

/**
 * Reload choreography as pure data: the viewmodel POSES from it, the audio module CUES from it.
 *
 * Until the gameplay-polish pass the two were written twice — a timeline of offsets here and a
 * hand-copied list of fractions in `sfx.reload` — and they had drifted: the rifle's magazine
 * seated on screen at 72–82 % of the reload while the seat THUD played at 60 %, the DMR's bolt ran
 * at 74–96 % while its click came at 84 %, and the shotgun animated six shells against four sounds
 * at unrelated times. `reloadCues` now READS the beats off the same frames the hands are posed
 * from, so a sound can only ever land where the part moves.
 *
 * Two inputs make the animation honest about the magazine (the brief: "the reload reflects the
 * real ammo state"): `shells` is how many rounds are actually being loaded into a tube or a
 * cylinder, and `empty` says whether the chamber is empty. A tactical reload with a round chambered
 * has nothing to charge, so the pistol's slide stays forward and the rifle's charging handle is
 * left alone; an empty gun locks its slide back and needs the pull at the end. The VZ-9 (smg2) is
 * deliberately left exactly as it shipped: its row is out of scope for this pass.
 */
export interface ReloadFrame {
  /** Gun body offset/rotation (camera-local metres / radians). */
  y: number; rx: number; rz: number; x: number;
  /** Magazine drop (0 = seated, 1 = fully out) for detachable mags. */
  mag: number;
  /** Action part travel (0 = forward/closed, 1 = fully back/open). */
  action: number;
  /** Left hand: 0 = on the handguard, 1 = down at the mag / shell pouch. */
  handL: number;
}

export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
export const ramp = (t: number, a: number, b: number): number => Math.max(0, Math.min(1, (t - a) / (b - a)));

/**
 * Per-weapon reload timelines. Each is a function of normalised progress, so a weapon's
 * `reloadMs` stretches the same choreography.
 *
 * Staging (art review, three rounds): the hip pose sits 26 cm under the lens at 36 cm depth, so a
 * reload that LOWERS the gun and drops the mag straight down pushes the mag and the left hand out
 * of the bottom of a 16:9 frame — the mid-frame read as "the idle pose, tilted". Every timeline
 * LIFTS the gun (`y` +0.03…+0.06) and pulls it toward the screen centre (`x` negative) while the
 * mag is out, with a strong negative cant (`rz`): in camera space +X is right and the gun is held
 * right of the eye, so a negative roll turns the underside — magwell, loading gate, the revolver's
 * swung-out cylinder — toward the lens and sends the dropped mag sideways across the frame instead
 * of down out of it. `handL` peaks are held at 0.55…0.7 so the reach stays a visible reach (the
 * hand travels 12 cm down and up to 28 cm toward the lens per unit).
 */
export function reloadFrame(weapon: WeaponId, t: number, shells = 6, empty = true): ReloadFrame {
  const f: ReloadFrame = { y: 0, rx: 0, rz: 0, x: 0, mag: 0, action: 0, handL: 0 };
  const n = Math.max(1, Math.round(shells));
  switch (weapon) {
    case "pistol": {
      // Bring the gun up and in, cant it so the magwell faces the eye, mag drops across the
      // frame, new mag slams; on an empty gun the slide was locked back and is released at the end.
      const tilt = bump(t, 0.05, 0.9);
      f.y = 0.05 * tilt; f.rx = 0.2 * tilt; f.rz = -1.0 * tilt; f.x = -0.06 * tilt;
      f.mag = t < 0.15 ? 0 : t < 0.35 ? smooth(ramp(t, 0.15, 0.35)) : t < 0.55 ? 1 : 1 - smooth(ramp(t, 0.55, 0.75));
      f.action = empty ? (t < 0.8 ? 1 : 1 - smooth(ramp(t, 0.8, 0.9))) : 0;
      f.handL = 0.55 * bump(t, 0.1, 0.85);
      break;
    }
    case "smg":
    case "machinepistol":
    case "carbine":
    case "rifle": {
      // Lift and cant the gun over, rock the mag out sideways, seat the new one; on an empty gun
      // the left hand then tugs the charging handle, otherwise it goes straight back to the guard.
      const tilt = bump(t, 0.05, 0.92);
      f.y = 0.05 * tilt; f.rx = 0.22 * tilt; f.rz = -0.85 * tilt; f.x = -0.06 * tilt;
      f.mag = t < 0.12 ? 0 : t < 0.38 ? smooth(ramp(t, 0.12, 0.38)) : t < 0.52 ? 1 : 1 - smooth(ramp(t, 0.52, 0.78));
      const seat = bump(t, 0.72, 0.82);
      f.y -= 0.02 * seat; // the slam
      f.action = empty ? bump(t, 0.84, 0.98) : 0;
      f.handL = t < 0.84 ? 0.7 * bump(t, 0.08, 0.84) : empty ? bump(t, 0.84, 0.98) * 0.45 : 0;
      break;
    }
    case "shotgun":
    case "autoshotgun": {
      // Shell by shell — as many as are actually going in: the gun comes up and rolls so the
      // loading gate on the underside faces the eye, the hand reaches to it once per shell. An
      // empty chamber is pumped at the end; a topped-up tube is not.
      const roll = bump(t, 0.04, 0.9);
      f.y = 0.04 * roll; f.rx = 0.15 * roll; f.rz = -0.8 * roll; f.x = -0.05 * roll;
      const per = 0.82 / n;
      const i = Math.min(n - 1, Math.floor(ramp(t, 0.06, 0.88) * n));
      const local = (t - 0.06 - i * per) / per;
      f.handL = t < 0.06 || t > 0.88 ? 0 : 0.3 + 0.35 * Math.sin(Math.max(0, Math.min(1, local)) * Math.PI);
      f.y -= 0.012 * bump(local, 0.4, 0.7);
      f.action = empty ? bump(t, 0.9, 1.0) : 0;
      break;
    }
    case "dmr":
    case "sniper": {
      // Mag swap with the gun raised and canted, then — only on an empty chamber — the bolt: back
      // (chamber) and forward.
      const tilt = bump(t, 0.05, 0.9);
      f.y = 0.05 * tilt; f.rx = 0.22 * tilt; f.rz = -0.85 * tilt; f.x = -0.06 * tilt;
      f.mag = t < 0.1 ? 0 : t < 0.35 ? smooth(ramp(t, 0.1, 0.35)) : t < 0.48 ? 1 : 1 - smooth(ramp(t, 0.48, 0.7));
      f.action = empty ? (t < 0.74 ? 0 : t < 0.84 ? smooth(ramp(t, 0.74, 0.84)) : 1 - smooth(ramp(t, 0.84, 0.96))) : 0;
      f.handL = t < 0.72 ? 0.7 * bump(t, 0.06, 0.72) : empty ? bump(t, 0.72, 0.98) * 0.5 : 0;
      break;
    }
    case "revolver": {
      // Swing out, dump the brass, feed one by one (as many as were fired), snap shut. The gun comes
      // up and rolls hard so the cylinder side (the left) turns up toward the eye.
      const roll = bump(t, 0.04, 0.92);
      f.y = 0.05 * roll; f.rx = 0.25 * roll; f.rz = -1.1 * roll; f.x = -0.06 * roll;
      const per = 0.5 / n;
      const i = Math.min(n - 1, Math.floor(ramp(t, 0.3, 0.8) * n));
      const local = (t - 0.3 - i * per) / per;
      f.handL = t < 0.12 ? 0 : t < 0.3 ? 0.45 * smooth(ramp(t, 0.12, 0.3)) : t < 0.8 ? 0.45 + 0.3 * Math.sin(Math.max(0, Math.min(1, local)) * Math.PI) : 0.45 * (1 - smooth(ramp(t, 0.8, 0.95)));
      f.y -= 0.01 * bump(t, 0.9, 0.98); // the snap shut
      break;
    }
    case "smg2": {
      // Like the SMG but faster hands: mag out early, in by the middle, a quick charge.
      const tilt = bump(t, 0.04, 0.9);
      f.y = 0.05 * tilt; f.rx = 0.22 * tilt; f.rz = -0.9 * tilt; f.x = -0.06 * tilt;
      f.mag = t < 0.08 ? 0 : t < 0.3 ? smooth(ramp(t, 0.08, 0.3)) : t < 0.42 ? 1 : 1 - smooth(ramp(t, 0.42, 0.66));
      f.y -= 0.02 * bump(t, 0.62, 0.72);
      f.action = bump(t, 0.78, 0.94);
      f.handL = t < 0.78 ? 0.7 * bump(t, 0.06, 0.78) : bump(t, 0.78, 0.94) * 0.45;
      break;
    }
    case "lmg": {
      // Feed cover up, belt box off, new box on, belt laid in, cover slammed, charge. Lifted and
      // rolled so the box side and the open cover both face the eye. A belt gun is charged whatever
      // was in the chamber: the belt has to be pulled through.
      const tilt = bump(t, 0.03, 0.95);
      f.y = 0.04 * tilt; f.rx = 0.3 * tilt; f.rz = -0.6 * tilt; f.x = -0.06 * tilt;
      f.action = t < 0.08 ? 0 : t < 0.18 ? smooth(ramp(t, 0.08, 0.18)) : t < 0.74 ? 1 : t < 0.82 ? 1 - smooth(ramp(t, 0.74, 0.82)) : bump(t, 0.86, 0.98);
      f.mag = t < 0.18 ? 0 : t < 0.36 ? smooth(ramp(t, 0.18, 0.36)) : t < 0.5 ? 1 : 1 - smooth(ramp(t, 0.5, 0.68));
      f.y -= 0.02 * bump(t, 0.78, 0.84);
      f.handL = t < 0.86 ? 0.7 * bump(t, 0.05, 0.86) : bump(t, 0.86, 0.98) * 0.45;
      break;
    }
    case "launcher": {
      // Break open (the pump node tips the barrel), shell out, shell in, snap shut — raised and
      // canted so the open breech is in view.
      const tilt = bump(t, 0.05, 0.9);
      f.y = 0.04 * tilt; f.rx = 0.15 * tilt; f.rz = -0.8 * tilt; f.x = -0.05 * tilt;
      f.action = t < 0.1 ? 0 : t < 0.25 ? smooth(ramp(t, 0.1, 0.25)) : t < 0.7 ? 1 : 1 - smooth(ramp(t, 0.7, 0.85));
      f.handL = 0.6 * bump(t, 0.2, 0.8);
      f.y -= 0.015 * bump(t, 0.84, 0.92);
      break;
    }
    case "clippers": break; // nothing to reload
  }
  return f;
}

/** What the audio module hears at a beat of the reload. */
export type ReloadCueKind =
  | "magOut"        // the latch and the magazine sliding out
  | "magIn"         // the fresh magazine going in
  | "seat"          // the slam home
  | "actionBack"    // slide / bolt / charging handle pulled back (or a cover opened)
  | "actionForward" // …and released home (or the cover slammed)
  | "shell"         // one shell pushed into a tube or a cylinder
  | "open"          // a cylinder swung out / a breech broken open
  | "close";        // …and snapped shut

export interface ReloadCue { t: number; kind: ReloadCueKind }

const STEPS = 400;

/**
 * The beats of a reload, read off the choreography itself at `STEPS` samples: where the mag
 * leaves and lands, where an action opens and closes, where each shell goes in. Anything that is
 * a mechanical sound in the ear is a part moving on screen, so the sound is placed where the part
 * moves and nowhere else.
 */
export function reloadCues(weapon: WeaponId, shells = 6, empty = true): ReloadCue[] {
  const cues: ReloadCue[] = [];
  const shellFed = weapon === "shotgun" || weapon === "autoshotgun" || weapon === "revolver";
  let prev = reloadFrame(weapon, 0, shells, empty);
  let magWasOut = false;
  let actionOpens = 0;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const f = reloadFrame(weapon, t, shells, empty);
    // Magazine: out when it starts to move, in when it starts back, seated when it lands.
    if (prev.mag <= 0.02 && f.mag > 0.02 && !magWasOut) { cues.push({ t, kind: "magOut" }); magWasOut = true; }
    if (magWasOut && prev.mag >= 0.98 && f.mag < 0.98) cues.push({ t, kind: "magIn" });
    if (magWasOut && prev.mag > 0.02 && f.mag <= 0.02) { cues.push({ t, kind: "seat" }); magWasOut = false; }
    // Action: a rising edge through half travel is the pull, a falling one the release. The pistol's
    // slide STARTS locked back (no rising edge), so its one falling edge is the release alone. On a
    // belt gun and a break-open launcher the FIRST cycle is the cover / breech, not a charge.
    if (prev.action < 0.5 && f.action >= 0.5) { actionOpens++; cues.push({ t, kind: (weapon === "lmg" || weapon === "launcher") && actionOpens === 1 ? "open" : "actionBack" }); }
    if (prev.action >= 0.5 && f.action < 0.5) cues.push({ t, kind: (weapon === "lmg" || weapon === "launcher") && actionOpens <= 1 ? "close" : "actionForward" });
    prev = f;
  }
  if (shellFed) {
    // Each reach to the gate peaks once per shell: a local maximum of the hand above the reach floor.
    let a = reloadFrame(weapon, 0, shells, empty).handL, b = reloadFrame(weapon, 1 / STEPS, shells, empty).handL;
    for (let i = 2; i <= STEPS; i++) {
      const c = reloadFrame(weapon, i / STEPS, shells, empty).handL;
      if (b > a && b >= c && b > 0.5) cues.push({ t: (i - 1) / STEPS, kind: "shell" });
      a = b; b = c;
    }
    if (weapon === "revolver") {
      // The cylinder comes out as the hand first reaches it and snaps shut as the hand leaves.
      let open = -1, close = -1;
      for (let i = 1; i <= STEPS; i++) {
        const h = reloadFrame(weapon, i / STEPS, shells, empty).handL;
        if (open < 0 && h > 0.3) open = i / STEPS;
        if (open >= 0 && h > 0.3) close = i / STEPS;
      }
      if (open >= 0) cues.push({ t: open, kind: "open" });
      if (close >= 0) cues.push({ t: close, kind: "close" });
    }
  }
  cues.sort((p, q) => p.t - q.t);
  return cues;
}
