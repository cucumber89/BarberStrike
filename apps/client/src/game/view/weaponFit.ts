/**
 * Weapon fit (drop 6b): turning a loaded glTF gun into the anchors the viewmodel already solves
 * against — `length`, `muzzle`, `eject`, `aimPoint` — without hand-tuning each weapon.
 *
 * The procedural models (weaponMeshes.ts) declare those anchors by hand. A glTF does not, but the
 * CC-BY firearm models DO name their parts (see weaponRig.ts), so the anchors can be measured:
 *  - length  : the model's extent along its forward axis, scaled to the weapon's declared length so
 *              a Babylon-unit gun matches the game's metres and the existing hip / ADS poses hold;
 *  - muzzle  : the forward-most point of the barrel / flash hider (or of the whole gun when a
 *              suppressed model has no barrel node), on the bore's own axis — NOT the model centre,
 *              or the flash and the tracer start off to one side;
 *  - aimPoint: the sight axis. With both sights present it is the REAR sight raised to the front
 *              sight's height, which is what the eye actually lines up; with one sight it is that
 *              sight; with none it is the top of the receiver above the grip.
 *  - eject    : the ejection port, or a point on the right of the receiver.
 *
 * Everything here is pure geometry on measured boxes so it can be unit-tested headlessly.
 */

/** An axis-aligned box measured in the model's own space, after the loader's root transform. */
export interface PartBox { min: [number, number, number]; max: [number, number, number] }

export const centre = (b: PartBox): [number, number, number] =>
  [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

export const sizeOf = (b: PartBox): [number, number, number] =>
  [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

export const unionBox = (boxes: PartBox[]): PartBox => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  return { min, max };
};

/**
 * Uniform scale that makes the model's forward extent equal the weapon's declared length.
 * Guarded: a degenerate model (zero depth) keeps scale 1 rather than exploding to Infinity.
 */
export function fitScale(whole: PartBox, targetLength: number): number {
  const depth = whole.max[2] - whole.min[2];
  if (!(depth > 1e-6) || !(targetLength > 0)) return 1;
  return targetLength / depth;
}

export interface Anchors {
  muzzle: [number, number, number];
  eject: [number, number, number];
  aimPoint: [number, number, number];
  length: number;
}

export interface FitInput {
  /** Bounding box of the whole model. */
  whole: PartBox;
  /** Bounding box of the barrel / flash hider / tube, when the rig found one. */
  barrel?: PartBox;
  frontSight?: PartBox;
  rearSight?: PartBox;
  eject?: PartBox;
  /** Declared length of the weapon in metres (WeaponSpec.length of the procedural model). */
  targetLength: number;
  /** Every part's box (unscaled frame). Lets a derived ejection port land ON the gun's surface. */
  parts?: PartBox[];
}

/**
 * Measures the anchors, in the SCALED model's space (i.e. after multiplying by `fitScale`), with
 * +Z forward, +Y up, +X right — the same frame the procedural specs use.
 */
export function fitAnchors(input: FitInput): Anchors {
  const s = fitScale(input.whole, input.targetLength);
  const sc = (v: [number, number, number]): [number, number, number] => [v[0] * s, v[1] * s, v[2] * s];
  const whole = input.whole;

  // ---- muzzle: forward-most point of the bore, on the bore's own axis.
  const bore = input.barrel ?? whole;
  const bc = centre(bore);
  const muzzle: [number, number, number] = [bc[0], bc[1], Math.max(bore.max[2], whole.max[2] * 0.999)];
  // A barrel node that is shorter than the body (a bullpup's barrel sits inside the shell) must still
  // put the muzzle at the FRONT of the gun, so the forward-most of the two wins.
  muzzle[2] = input.barrel ? Math.max(input.barrel.max[2], whole.max[2]) : whole.max[2];

  // ---- aim point: the eye lines up the rear notch with the front post, so use the rear sight's
  // position at the front sight's height. That is the line the ADS solver puts on the camera axis.
  let aim: [number, number, number];
  if (input.rearSight && input.frontSight) {
    const r = centre(input.rearSight), f = centre(input.frontSight);
    aim = [(r[0] + f[0]) / 2, Math.max(r[1], f[1]), r[2]];
  } else if (input.rearSight) {
    const r = centre(input.rearSight);
    aim = [r[0], input.rearSight.max[1], r[2]];
  } else if (input.frontSight) {
    const f = centre(input.frontSight);
    aim = [f[0], input.frontSight.max[1], f[2]];
  } else {
    // No sights modelled: the top of the receiver, a third of the way back from the muzzle.
    aim = [centre(whole)[0], whole.max[1], whole.min[2] + (whole.max[2] - whole.min[2]) * 0.62];
  }

  // ---- ejection port: measured when present, otherwise the right of the receiver just behind the
  // midpoint, which is where a case leaves every gun in this pack.
  //
  // Measured (drop A): `whole.max[0]` is the widest thing on the gun — a bolt handle, a sling
  // swivel — so the derived point sat 11–31 mm off the receiver in the air on the MK14, SRSA1 and
  // RPG. With the parts known, take the right face of whatever part actually spans that (y, z).
  let ej: [number, number, number];
  if (input.eject) ej = centre(input.eject);
  else {
    const wc = centre(whole);
    const ey = wc[1] + (whole.max[1] - wc[1]) * 0.4, ez = wc[2] + (whole.max[2] - wc[2]) * 0.25;
    let ex = -Infinity;
    for (const p of input.parts ?? []) {
      if (p.min[1] <= ey && ey <= p.max[1] && p.min[2] <= ez && ez <= p.max[2]) ex = Math.max(ex, p.max[0]);
    }
    if (ex !== -Infinity) ej = [ex, ey, ez];
    else if (input.parts && input.parts.length > 0) {
      // Nothing spans that (y, z) — the RPG's derived point sits above its tube — so slide onto the
      // nearest part in the y/z plane and take its right face there.
      let best = input.parts[0], bd = Infinity;
      for (const p of input.parts) {
        const dy = Math.max(0, p.min[1] - ey, ey - p.max[1]), dz = Math.max(0, p.min[2] - ez, ez - p.max[2]);
        const d = dy * dy + dz * dz;
        if (d < bd) { bd = d; best = p; }
      }
      ej = [best.max[0], Math.min(Math.max(ey, best.min[1]), best.max[1]), Math.min(Math.max(ez, best.min[2]), best.max[2])];
    } else ej = [whole.max[0], ey, ez];
  }

  return { muzzle: sc(muzzle), eject: sc(ej), aimPoint: sc(aim), length: input.targetLength };
}

/**
 * Which way the model points, as a yaw (radians) that turns its bore onto +Z.
 *
 * The pack is not consistent: some guns are modelled down +Z, some down −Z, some down an X axis.
 * Rather than hand-tune eight numbers that silently rot when a file is replaced, this reads the
 * geometry: the bore runs along the model's LONGER horizontal axis, and the muzzle end is the end
 * the barrel sits towards (or, with no barrel node, the end AWAY from the magazine — a magazine is
 * always at the grip end of a gun). With neither, +Z is assumed, which is what the loader's own
 * root transform already produces for a normally-authored glTF.
 *
 * Returns one of 0, ±π/2, π: models in this pack are axis-aligned, and snapping to a quarter turn
 * avoids introducing a skew that a measured angle would.
 */
export function guessForward(whole: PartBox, barrel?: PartBox, magazine?: PartBox, sights?: { front?: PartBox; rear?: PartBox }): number {
  const size = sizeOf(whole);
  const axis: 0 | 2 = size[0] > size[2] ? 0 : 2;   // 0 = X, 2 = Z
  const wc = centre(whole);
  let sign = 1;
  // Measured (drop A): the RPG is one centred `Tube` with no magazine, so the barrel gave no signal
  // and the launcher was built facing BACKWARDS — muzzle on the rear cover, front sight at the
  // back. A front sight is in front of a rear sight by definition, so when the model names both
  // they are the surest signal there is and go first.
  const ds = sights?.front && sights?.rear ? centre(sights.front)[axis] - centre(sights.rear)[axis] : 0;
  if (Math.abs(ds) > size[axis] * 0.02) sign = ds > 0 ? 1 : -1;
  else if (barrel && Math.abs(centre(barrel)[axis] - wc[axis]) > size[axis] * 0.02) {
    sign = centre(barrel)[axis] - wc[axis] > 0 ? 1 : -1;
  } else if (magazine) {
    // The magazine lives at the grip end, so the muzzle is the other way.
    const d = centre(magazine)[axis] - wc[axis];
    if (Math.abs(d) > size[axis] * 0.02) sign = d > 0 ? -1 : 1;
  }
  if (axis === 2) return sign > 0 ? 0 : Math.PI;
  // Babylon's left-handed RotationY maps (1,0,0) to (cos, 0, −sin): −π/2 sends +X onto +Z.
  return sign > 0 ? -Math.PI / 2 : Math.PI / 2;
}

/** The viewmodel's hand box (`Viewmodel.buildHands`), so a check can ask whether it touches the gun. */
export const HAND_SIZE: [number, number, number] = [0.058, 0.04, 0.075];

/**
 * Where the support (left) hand rests, in gun space, from the weapon's length alone: a sidearm is
 * supported at the grip (the old universal 30 cm offset put the hand beyond a pistol's muzzle);
 * a long gun keeps its support under the fore-end, about half-way out, never past 36 cm.
 * Pure so `weaponParts` can check the hand is on the fore-end without a scene.
 */
export function supportHandHome(length: number, parts?: PartBox[]): [number, number, number] {
  if (length <= 0.2) return [-0.03, -0.065, -0.005];
  const z = Math.min(0.36, length * 0.52);
  const home: [number, number, number] = [-0.03, -0.035, z];
  if (!parts) return home;
  // Measured (drop A): with the fixed −0.035 the hand box hovered 13–25 mm UNDER every long gun's
  // fore-end, because the fore-ends of the pack sit at y ≈ 0 while the hand's top was at −0.015.
  // So read the underside of the fore-end where the hand goes — the lowest part that spans the
  // hand's depth and straddles the centre line (a bipod leg or a sling swivel off to one side does
  // not count) — and rest the hand's top 4 mm inside it, which reads as a grasp and stays within
  // the 5 mm attachment tolerance.
  const z0 = z - HAND_SIZE[2] / 2, z1 = z + HAND_SIZE[2] / 2;
  let bottom = Infinity;
  for (const b of parts) {
    if (b.max[2] < z0 || b.min[2] > z1) continue;
    if (b.min[0] > 0 || b.max[0] < 0) continue;
    bottom = Math.min(bottom, b.min[1]);
  }
  if (bottom === Infinity) return home;
  home[1] = bottom - HAND_SIZE[1] / 2 + 0.004;
  return home;
}

/**
 * Where the model's origin must sit so the gun hangs in the hand the way the procedural specs do.
 *
 * Those specs put (0,0,0) at the top of the grip — the web of the hand — with the barrel running
 * out along +Z. So the loader measures that same point on a glTF and shifts the model by −origin.
 * Priority: the grip (exactly the right point), then the trigger (a finger's width above it, which
 * is close enough that no pose needed retuning), then a proportion of the bounding box for a model
 * that names neither (the RPG's grips are all `*_Ring` / `*_Left` furniture).
 */
export function gripOrigin(whole: PartBox, grip?: PartBox, trigger?: PartBox): [number, number, number] {
  if (grip) { const c = centre(grip); return [c[0], grip.max[1], c[2]]; }
  if (trigger) { const c = centre(trigger); return [c[0], c[1], c[2]]; }
  const c = centre(whole), s = sizeOf(whole);
  return [c[0], whole.min[1] + s[1] * 0.55, whole.min[2] + s[2] * 0.3];
}
