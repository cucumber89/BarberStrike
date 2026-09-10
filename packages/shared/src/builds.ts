import { PLAYER } from "./constants";

/**
 * Body builds — different SILHOUETTES inside one collision box.
 *
 * ## The problem this file is shaped by
 *
 * Collision and hitscan are server-authoritative and read `PLAYER` and nothing else: the body is an
 * AABB `halfWidth` 0.35 m wide and `height` 1.8 m tall, the eye sits at `eyeHeight`, and a hit
 * counts as a headshot when it lands in the top `headFraction` of that box (`hitscan.ts:64`). So a
 * build that changed the drawn body's height or width would change NOTHING about how it is hit —
 * and that is exactly the trap. The hitbox would stay put while the target moved inside it: a small
 * build would be shot through empty air above its head, a large one would eat rounds that visibly
 * missed. Either way a player would be choosing a look and getting a fight.
 *
 * So the rule here is not "keep the builds similar". It is stronger and it is enforced by
 * construction: **every build fills the same envelope exactly, and only the distribution of mass
 * inside it differs.** `buildRig` solves for the joint offsets rather than letting a catalog entry
 * name them, so an entry CANNOT express a taller body — there is no field for it.
 *
 * Pinned bit-for-bit for every build (`envelopeOf`, asserted in `builds.test.ts`):
 *
 *  - `crownY` — the top of the skull. Nobody is drawn taller or shorter.
 *  - `footY` — the sole of the boot.
 *  - `halfW` — the widest point of the whole rest silhouette.
 *  - `headBottomY` … `headTopY` sits inside the server's head zone with a stated margin, so a shot
 *    aimed at any build's visible head lands in the band the server scores as a head.
 *  - the head's footprint stays inside the AABB's footprint, so aiming at a head never misses
 *    sideways — a hunched build leans its head forward, not out of the box.
 *
 * MEASURED, and the reason `crownY` is 1.87 rather than 1.8: today's character is already drawn
 * 10.1 cm taller than the box it is hit in (skull top 1.866 m, cap top 1.901 m, against
 * `PLAYER.height` 1.8) and its arms already hang 1.7 cm outside `halfWidth` at rest. That is a
 * pre-existing fault, not one builds introduce; the envelope is frozen AT today's numbers so the
 * default build reproduces the current character bit for bit and no build makes the gap worse. The
 * fix belongs to whoever is allowed to move the character's height — see the Decisions log.
 *
 * Nothing here imports a renderer, for the same reason `haircuts.ts` does not: this is the recipe in
 * metres, and the client's box builder is the only thing that knows what a metre looks like.
 */

/**
 * One body type, as the proportions a player picks — never as sizes.
 *
 * Every field is a ratio or a mass, deliberately: there is no `height` and no `width` to set, so a
 * catalog entry has no way to ask for a smaller target. The solver turns these into joint offsets
 * that land on the shared envelope.
 */
export interface BodyBuild {
  id: string;
  /** Shown in the wardrobe. Polish, like every other player-visible string. */
  name: string;
  /** One line of who this is, for the wardrobe card. */
  blurb: string;
  /** Hip-joint height as a fraction of the crown: high = long legs and a short torso. */
  legRatio: number;
  /** Chest box scale: the ribcage. */
  chest: number;
  /** Waist/vest scale: the gut. Above the chest scale reads as a barrel, below it as a V-taper. */
  belly: number;
  /** Arm and leg thickness scale. */
  limb: number;
  /** Gap (m) between the top of the chest and the bottom of the skull: the neck. */
  neck: number;
  /** Skull edge scale, inside the head zone. */
  head: number;
  /** Forward roll (m) of shoulders and head, plus the hump it raises on the upper back. */
  hunch: number;
}

/** What every player has worn until now. Always available, and the fallback for any unknown id. */
export const DEFAULT_BUILD = "klasyk";

/**
 * The six builds.
 *
 * NOT GATED, and that is a decision rather than an omission (Decisions log, 2026-09-09): L1 allows
 * cosmetics to be earned, but the whole value of a build is that a room of twelve reads as twelve
 * different people, and that value is largest on the day a player arrives with nothing. Haircuts,
 * finishes and crates already carry the progression; the body a player picks is who they are, not a
 * reward. Every build is therefore available from the first launch, to everyone.
 *
 * The shoulder pad is not in this list, and that is deliberate — it is derived from the chest so it
 * always bridges torso to frame (see `SHOULDER_LAP`).
 *
 * They differ on everything a body can differ on EXCEPT the frame. MEASURED across the six: the hip
 * joint spans 0.845 m to 1.040 m (a 19 cm spread, so the leg-to-torso ratio reads at a glance), the
 * waist 0.343 m to 0.590 m, the sleeve 0.084 m to 0.139 m, the neck gap 0.024 m to 0.105 m, the head
 * 0.221 m to 0.264 m tall — while the crown (1.87 m) and the widest point (0.367 m) are identical to
 * twelve decimal places. The shoulder line is the common ground, because it is the widest point of
 * the silhouette and the one thing that must not vary — see `SHOULDER_OUTER`.
 * Evidence: `apps/client/e2e/out/builds/` (regenerate with `pnpm shots:builds`).
 */
export const BUILDS: readonly BodyBuild[] = [
  {
    id: DEFAULT_BUILD, name: "KLASYK", blurb: "Standardowa sylwetka. Nic nie wystaje, nic nie brakuje.",
    legRatio: 0.95 / 1.87, chest: 1, belly: 1, limb: 1, neck: 0.07, head: 1, hunch: 0,
  },
  {
    id: "byk", name: "BYK", blurb: "Klata jak szafa, kark schowany w barach.",
    legRatio: 0.482, chest: 1.14, belly: 1.1, limb: 1.26, neck: 0.026, head: 1.06, hunch: 0.03,
  },
  {
    id: "tyczka", name: "TYCZKA", blurb: "Same nogi i szyja. Wygląda, jakby złożono go z patyków.",
    legRatio: 0.556, chest: 0.8, belly: 0.78, limb: 0.76, neck: 0.105, head: 0.92, hunch: 0.014,
  },
  {
    id: "barylka", name: "BARYŁKA", blurb: "Niski, szeroki w pasie, na krótkich nogach.",
    legRatio: 0.452, chest: 1.06, belly: 1.34, limb: 1.1, neck: 0.024, head: 1.1, hunch: 0.018,
  },
  {
    id: "zylasty", name: "ŻYLASTY", blurb: "Barki szerokie, pas wąski. Nic zbędnego.",
    legRatio: 0.532, chest: 0.98, belly: 0.8, limb: 0.9, neck: 0.088, head: 0.93, hunch: -0.008,
  },
  {
    id: "przygarbiony", name: "PRZYGARBIONY", blurb: "Głowa do przodu, plecy w pałąk. Stoi jak po dwunastej godzinie.",
    legRatio: 0.494, chest: 1.0, belly: 1.06, limb: 0.98, neck: 0.038, head: 1, hunch: 0.075,
  },
];

const BY_ID = new Map(BUILDS.map((b) => [b.id, b]));

export const isBuildId = (v: unknown): v is string => typeof v === "string" && BY_ID.has(v);
/** The catalog entry, or the default when the id is unknown (an older or a lying client). */
export const buildDef = (id: string | undefined | null): BodyBuild => BY_ID.get(id ?? "") ?? BY_ID.get(DEFAULT_BUILD)!;

// ------------------------------------------------------------------ the rig

/**
 * Every dimension the client's box builder needs, in metres, already solved onto the envelope.
 *
 * Joint offsets are LOCAL to their parent, exactly as `Character.ts` parents them: root → hips →
 * torso → head, hips → leg → shin, torso → arm → forearm. `*Y`/`*Z` on a box are that box's centre
 * in its joint's space. The names match the meshes they size, so a reader can hold this next to the
 * constructor.
 */
export interface BuildRig {
  hipY: number; torsoY: number; headY: number;
  pelvisW: number; pelvisH: number; pelvisD: number;
  chestW: number; chestH: number; chestD: number; chestY: number; chestZ: number;
  vestW: number; vestH: number; vestD: number; vestZ: number;
  shoulderX: number; shoulderW: number; shoulderH: number; shoulderD: number; shoulderY: number; shoulderZ: number;
  /** The upper back a hunch raises. `humpH` 0 means the build has none and the mesh is skipped. */
  humpW: number; humpH: number; humpD: number; humpY: number; humpZ: number;
  neckW: number; neckH: number; neckY: number;
  skullW: number; skullH: number; skullD: number; skullY: number; headZ: number;
  armX: number; armY: number; upperW: number; upperH: number; foreY: number; foreW: number; foreH: number;
  handW: number; handH: number; handD: number; handY: number;
  /** The tracksuit piping down the sleeve and the trouser: offset from the limb's centre, and its width. */
  armStripeX: number; legStripeX: number; stripeW: number;
  gunX: number;
  legX: number; legY: number; thighW: number; thighH: number; thighD: number;
  shinY: number; calfW: number; calfH: number; calfD: number;
  bootW: number; bootH: number; bootD: number; bootY: number;
  kneeW: number; kneeH: number; kneeD: number;
  /**
   * The shop cap: a constant 0.07 m box centred on the crown, on every head whatever its size.
   * It lives in the rig rather than in the constructor because it is the TOP of the silhouette —
   * higher than the skull — so the envelope has to know about it.
   */
  capH: number;
  /** Lateral scale the solver applied to land on the envelope. 1 for the default build. */
  scaleX: number;
}

/**
 * The default character, transcribed from `Character.ts` before builds existed.
 *
 * These are the numbers the game shipped with. They are here as literals rather than derived so the
 * test can assert "the default build is the character we already had" against something that did
 * not come out of the same solver it is checking.
 */
const BASE = {
  hipY: 0.95, torsoY: 0.06, headY: 0.62,
  pelvisW: 0.34, pelvisH: 0.16, pelvisD: 0.2,
  chestW: 0.42, chestH: 0.5, chestD: 0.24, chestY: 0.3,
  vestW: 0.44, vestH: 0.34, vestD: 0.27,
  shoulderX: 0.26, shoulderW: 0.12, shoulderH: 0.1, shoulderD: 0.22, shoulderY: 0.5,
  neckW: 0.1, neckH: 0.08, neckY: -0.02,
  skullW: 0.22, skullH: 0.24, skullD: 0.24, skullY: 0.12,
  armX: 0.3, armY: 0.48, upperW: 0.11, upperH: 0.3, foreY: -0.3, foreW: 0.09, foreH: 0.28,
  handW: 0.08, handH: 0.08, handD: 0.1, handY: -0.3,
  stripeX: 0.058, stripeW: 0.018,
  gunX: 0.16,
  legX: 0.1, legY: -0.05, thighW: 0.15, thighH: 0.42, thighD: 0.16,
  shinY: -0.44, calfW: 0.13, calfH: 0.4, calfD: 0.14,
  bootW: 0.14, bootH: 0.1, bootD: 0.26, bootY: -0.42,
  kneeW: 0.145, kneeH: 0.14, kneeD: 0.065,
  capH: 0.07,
} as const;

/**
 * The outer edge of the shoulder pad — the frame every build hangs off, shared and not adjustable.
 *
 * This is the decision the rest of the file is built around. The silhouette's widest point is the
 * arm, which is seated a fixed distance outside this edge, so pinning it pins the widest point of
 * every build EXACTLY rather than to a tolerance. It costs one axis of variation (nobody has wider
 * shoulders than anybody else) and buys the only claim that matters: peeking a corner exposes the
 * same number of centimetres whichever body a player chose. Everything under the shoulder line —
 * chest, gut, hips, limbs, hip height, neck, head, posture — is free, which is where the six builds
 * get their difference from.
 */
const SHOULDER_OUTER = BASE.shoulderX + BASE.shoulderW / 2;
/**
 * How far the shoulder pad laps over the chest it is bolted to.
 *
 * The pad's outer edge is the shared frame and its inner edge is the chest, so its LENGTH is not a
 * choice — it is whatever bridges the two, and this is the only free number in it. It was a catalog
 * knob for one iteration and the render showed why that was wrong: TYCZKA's narrow chest left a
 * 7.7 cm gap of open air between torso and shoulder, and the arms read as pinned on rather than
 * attached. Deriving it means a chest of any width meets its shoulder, always.
 */
const SHOULDER_LAP = 0.01;
/** How far the upper arm is seated outside the shoulder pad's edge. Constant: it is a joint, not a mass. */
const ARM_TUCK = BASE.armX + BASE.upperW / 2 - SHOULDER_OUTER;
/**
 * How far the tracksuit piping stands proud of the sleeve or trouser it runs down.
 *
 * Constant, and NOT scaled by limb thickness: piping is a strip of fabric, it gets longer on a
 * bigger arm and no thicker. It matters because this stripe is the outermost geometry on the whole
 * body (`BASE.stripeX` 0.058 against a sleeve that ends at 0.055), so scaling it with mass would
 * have made limb thickness decide the silhouette's width — the one thing that must not vary.
 */
const PIPING_PROUD = BASE.stripeX - BASE.upperW / 2;
/**
 * How far the neck box is buried in the skull above and in the chest below.
 *
 * Read off the default character: its neck is 0.08 m tall centred 0.02 m below the skull's bottom
 * face, bridging a 0.07 m gap — so 0.02 m of it is inside the head and 0.01 m inside the chest.
 */
const NECK_OVERLAP = { skull: 0.02, chest: 0.01 } as const;
/** The top of the skull, taken from the character the game already had. Every build lands here. */
const CROWN_Y = BASE.hipY + BASE.torsoY + BASE.headY + BASE.skullY + BASE.skullH / 2;
/** The sole of the boot, likewise. */
const FOOT_Y = BASE.hipY + BASE.legY + BASE.shinY + BASE.bootY - BASE.bootH / 2;

/**
 * The rig before it is normalised sideways. Vertically it already lands on the envelope: the crown
 * and the sole are solved for, not chosen, so `legRatio` moves the HIP between them and cannot move
 * either end.
 */
function naturalRig(b: BodyBuild): BuildRig {
  const crownY = CROWN_Y, footY = FOOT_Y;
  const hipY = crownY * b.legRatio;
  // ---- legs: the drop from hip joint to sole is whatever is left under the hip, split as the
  // default splits it. A short-legged build gets a short thigh AND a short shin, not stilts.
  const drop = hipY - footY;
  const legScale = drop / (BASE.hipY - footY);
  const legY = BASE.legY * legScale, shinY = BASE.shinY * legScale;
  const bootH = BASE.bootH * legScale, bootY = BASE.bootY * legScale;
  const thighH = BASE.thighH * legScale, calfH = BASE.calfH * legScale;
  // ---- head: the crown is pinned, so a bigger skull hangs LOWER from the same top, and the neck
  // gap is what is left between it and the chest. Both ends of the head are therefore known before
  // the torso is sized, which is what makes the head-zone claim provable.
  const skullH = BASE.skullH * b.head, skullW = BASE.skullW * b.head, skullD = BASE.skullD * b.head;
  const skullY = skullH / 2;
  const headY = crownY - skullH - hipY - BASE.torsoY;
  const skullBottom = crownY - skullH;
  // ---- torso: the chest fills from the hips to the bottom of the neck gap.
  const chestTop = skullBottom - b.neck;
  const chestH = BASE.chestH * b.chest;
  const chestY = chestTop - chestH / 2 - hipY - BASE.torsoY;
  const chestW = BASE.chestW * b.chest, chestD = BASE.chestD * b.chest;
  const vestH = BASE.vestH * b.belly, vestW = BASE.vestW * b.belly, vestD = BASE.vestD * b.belly;
  const shoulderH = BASE.shoulderH;
  const shoulderW = Math.max(0.04, SHOULDER_OUTER - chestW / 2 + SHOULDER_LAP);
  const shoulderY = chestTop - shoulderH / 2 - hipY - BASE.torsoY;
  const shoulderX = SHOULDER_OUTER - shoulderW / 2;
  const upperW = BASE.upperW * b.limb, upperH = BASE.upperH * b.limb;
  const thighW = BASE.thighW * b.limb;
  return {
    hipY, torsoY: BASE.torsoY, headY,
    pelvisW: BASE.pelvisW * b.belly, pelvisH: BASE.pelvisH, pelvisD: BASE.pelvisD * b.belly,
    chestW, chestH, chestD, chestY, chestZ: b.hunch * 0.35,
    vestW, vestH, vestD, vestZ: b.hunch * 0.2,
    shoulderX, shoulderW, shoulderH, shoulderD: BASE.shoulderD, shoulderY, shoulderZ: b.hunch,
    // A hunch is GEOMETRY, never a rest rotation of the torso: pitching the torso by θ drops the
    // head node by (1 − cos θ) × its offset, and the head's height is the headshot zone. A box on
    // the upper back and a forward shift keep every Y in this file under the solver's control.
    humpW: chestW * 0.72, humpH: Math.max(0, b.hunch) * 2.4, humpD: chestD * 0.6,
    humpY: shoulderY - 0.02, humpZ: -chestD / 2 - b.hunch * 0.3,
    // The neck bridges the gap and overlaps both ends, so no length of neck can open a seam at the
    // collar or under the jaw. The two overlaps are what reproduce the default character exactly.
    neckW: BASE.neckW * b.head, neckH: b.neck + NECK_OVERLAP.chest,
    neckY: skullBottom + NECK_OVERLAP.skull - (b.neck + NECK_OVERLAP.chest) / 2 - (hipY + BASE.torsoY + headY),
    skullW, skullH, skullD, skullY, headZ: b.hunch * 0.85,
    armX: SHOULDER_OUTER + ARM_TUCK - upperW / 2, armY: shoulderY - 0.02,
    upperW, upperH, foreY: -upperH, foreW: BASE.foreW * b.limb, foreH: BASE.foreH * b.limb,
    handW: BASE.handW * b.limb, handH: BASE.handH * b.limb, handD: BASE.handD * b.limb,
    handY: -BASE.foreH * b.limb - 0.02,
    armStripeX: upperW / 2 + PIPING_PROUD, legStripeX: thighW / 2 + PIPING_PROUD, stripeW: BASE.stripeW,
    gunX: BASE.gunX,
    // A thick leg stands with its feet closer together and a thin one further apart, so the stance's
    // outer edge is the thigh's own: legs never decide the silhouette's width, mass does.
    legX: BASE.legX + (BASE.thighW - thighW) / 2,
    legY, thighW, thighD: BASE.thighD * b.limb, thighH,
    shinY, calfW: BASE.calfW * b.limb, calfH, calfD: BASE.calfD * b.limb,
    bootW: BASE.bootW * b.limb, bootH, bootD: BASE.bootD * b.limb, bootY,
    kneeW: BASE.kneeW * b.limb, kneeH: BASE.kneeH * b.limb, kneeD: BASE.kneeD * b.limb,
    capH: BASE.capH, scaleX: 1,
  };
}

/** Every field that is a horizontal size or a horizontal joint offset. Scaling these is the normalisation. */
const LATERAL: readonly (keyof BuildRig)[] = [
  "pelvisW", "chestW", "vestW", "shoulderX", "shoulderW", "humpW", "neckW", "skullW",
  "armX", "upperW", "foreW", "handW", "armStripeX", "legStripeX", "stripeW", "gunX",
  "legX", "thighW", "calfW", "bootW", "kneeW",
];

/**
 * The widest point of the whole rest silhouette, on either side of the centre line.
 *
 * The rest pose, not the animated one: the walk cycle swings the arms out by the same angles for
 * every build, so a rest-pose peak that is equal is an animated peak that is equal too.
 */
export function halfWidthOf(r: BuildRig): number {
  return Math.max(
    r.pelvisW / 2, r.chestW / 2, r.vestW / 2, r.humpW / 2, headHalfWidth(r),
    r.shoulderX + r.shoulderW / 2,
    r.armX + Math.max(r.upperW / 2, r.armStripeX + r.stripeW / 2, r.foreW / 2, r.handW / 2),
    r.legX + Math.max(r.thighW / 2, r.legStripeX + r.stripeW / 2, r.calfW / 2, r.bootW / 2, r.kneeW / 2),
  );
}

/**
 * The head's own half-width, which is NOT the skull's: the headset sits on the side of it and the
 * cap is a size larger, and both are wider than the bone. `Character.build.test.ts` measures the
 * meshes, so this has to name the widest of the three or the model is describing a smaller head
 * than the one on screen — and it is this number the "a head is always inside the footprint that
 * can be hit" claim rests on.
 */
export const headHalfWidth = (r: BuildRig): number =>
  Math.max(r.skullW / 2 + .015 + .02, r.skullW / 2 + .01, r.skullW / 2);

/** Where the drawn body starts and stops. Pinned across every build; see the docblock. */
export interface BodyEnvelope {
  crownY: number; footY: number; halfW: number;
  /** The top of the whole silhouette — the cap, which sits proud of the crown. */
  topY: number;
  headTopY: number; headBottomY: number;
  /** The head's own footprint, half-extents about the body's centre line. */
  headHalfX: number; headMaxZ: number;
}

export function envelopeOf(r: BuildRig): BodyEnvelope {
  const headNodeY = r.hipY + r.torsoY + r.headY;
  return {
    crownY: headNodeY + r.skullY + r.skullH / 2,
    topY: headNodeY + r.skullY + r.skullH / 2 + r.capH / 2,
    footY: r.hipY + r.legY + r.shinY + r.bootY - r.bootH / 2,
    halfW: halfWidthOf(r),
    headTopY: headNodeY + r.skullY + r.skullH / 2,
    headBottomY: headNodeY + r.skullY - r.skullH / 2,
    headHalfX: headHalfWidth(r),
    headMaxZ: Math.abs(r.headZ) + r.skullD / 2,
  };
}

const DEFAULT_NATURAL = naturalRig(BUILDS[0]);
/** The widest point, likewise. Solved rather than declared, so the default build is untouched. */
const HALF_W = halfWidthOf(DEFAULT_NATURAL);

/** The envelope every build fills, frozen at the numbers the default character already had. */
export const BODY_ENVELOPE: BodyEnvelope = envelopeOf(DEFAULT_NATURAL);

/**
 * The rig for a build: the natural proportions, scaled sideways onto the shared envelope.
 *
 * One uniform lateral factor, so the ratios WITHIN a build survive — a barrel stays a barrel — while
 * its widest point lands exactly on everyone else's. Vertical geometry is already solved and is not
 * touched here.
 */
export function buildRig(build: BodyBuild | string): BuildRig {
  const b = typeof build === "string" ? buildDef(build) : build;
  const r = naturalRig(b);
  const scaleX = HALF_W / halfWidthOf(r);
  for (const key of LATERAL) (r[key] as number) *= scaleX;
  r.scaleX = scaleX;
  return r;
}

// ------------------------------------------------------------------ the silhouette, for the tests

/** One structural box in body space (the joint chain already applied at rest). */
export interface SilhouetteBox { name: string; halfW: number; y: number; h: number }

/**
 * The rest silhouette as seen from the front: every structural box, flattened to a half-width and a
 * height band. Kit detail (badges, pouches, goggles) is left out — it sits inside these boxes and
 * cannot move the outline.
 */
export function silhouette(r: BuildRig): SilhouetteBox[] {
  const torsoY = r.hipY + r.torsoY, headNodeY = torsoY + r.headY, shinNodeY = r.hipY + r.legY + r.shinY;
  return [
    { name: "pelvis", halfW: r.pelvisW / 2, y: r.hipY - 0.02, h: r.pelvisH },
    { name: "chest", halfW: r.chestW / 2, y: torsoY + r.chestY, h: r.chestH },
    { name: "vest", halfW: r.vestW / 2, y: torsoY + r.chestY, h: r.vestH },
    { name: "shoulders", halfW: r.shoulderX + r.shoulderW / 2, y: torsoY + r.shoulderY, h: r.shoulderH },
    ...(r.humpH > 0 ? [{ name: "hump", halfW: r.humpW / 2, y: torsoY + r.humpY, h: r.humpH }] : []),
    { name: "neck", halfW: r.neckW / 2, y: headNodeY + r.neckY, h: r.neckH },
    // The head as WORN: the skull, plus the headset on the side of it and the cap over it. See
    // `headHalfWidth` for why the bone alone is the wrong number.
    { name: "head", halfW: headHalfWidth(r), y: headNodeY + r.skullY + r.capH / 4, h: r.skullH + r.capH / 2 },
    // The sleeve and trouser piping stands 3 mm proud of the limb it runs down, which makes IT the
    // outermost geometry on the body rather than the limb — the reason `PIPING_PROUD` is a constant.
    { name: "sleevePiping", halfW: r.armX + r.armStripeX + r.stripeW / 2, y: torsoY + r.armY - r.upperH / 2, h: r.upperH * (.27 / .3) },
    { name: "upperArm", halfW: r.armX + r.upperW / 2, y: torsoY + r.armY - r.upperH / 2, h: r.upperH },
    { name: "forearm", halfW: r.armX + r.foreW / 2, y: torsoY + r.armY + r.foreY - r.foreH / 2, h: r.foreH },
    { name: "hand", halfW: r.armX + r.handW / 2, y: torsoY + r.armY + r.foreY + r.handY, h: r.handH },
    { name: "trouserPiping", halfW: r.legX + r.legStripeX + r.stripeW / 2, y: r.hipY + r.legY - r.thighH / 2, h: r.thighH * (.39 / .42) },
    { name: "thigh", halfW: r.legX + r.thighW / 2, y: r.hipY + r.legY - r.thighH / 2, h: r.thighH },
    { name: "calf", halfW: r.legX + r.calfW / 2, y: shinNodeY - r.calfH / 2, h: r.calfH },
    // The knee pad is the widest thing on the lower leg — wider than the calf it sits on — so it is
    // structure here even though it is kit. Leaving it out let the measured body poke 2.5 mm past
    // what this function promised, which `Character.build.test.ts` caught.
    { name: "knee", halfW: r.legX + r.kneeW / 2, y: shinNodeY - r.calfH * (.045 / .4), h: r.kneeH },
    { name: "boot", halfW: r.legX + r.bootW / 2, y: shinNodeY + r.bootY, h: r.bootH },
  ];
}

/** Bands the width profile is sampled in. 60 over 1.9 m is about 3 cm — finer than the eye reads. */
export const PROFILE_BANDS = 60;

/**
 * Half-width of the silhouette in each of `PROFILE_BANDS` bands from the sole to the crown.
 *
 * This is the shape of a build as a number: two builds that differ here differ on screen, and two
 * that do not are a recolour. `builds.test.ts` uses it from both ends — to prove the six are really
 * six, and to prove none of them presents more of a target than another.
 */
export function widthProfile(r: BuildRig): number[] {
  const boxes = silhouette(r), lo = BODY_ENVELOPE.footY, hi = BODY_ENVELOPE.crownY;
  const step = (hi - lo) / PROFILE_BANDS;
  const out: number[] = [];
  for (let i = 0; i < PROFILE_BANDS; i++) {
    // A box counts for a band it OVERLAPS, not one whose centre it happens to contain. Sampling at
    // band centres made the model disagree with the meshes at every box edge — a shoulder ending
    // 3 mm inside a band read as bare neck — and those disagreements are exactly what the geometry
    // test is there to find, so the metric must not manufacture them.
    const top = lo + (i + 1) * step, bottom = lo + i * step;
    let w = 0;
    for (const b of boxes) if (b.y + b.h / 2 >= bottom && b.y - b.h / 2 <= top) w = Math.max(w, b.halfW);
    out.push(w);
  }
  return out;
}

/** The frontal area of the silhouette (m²) — how much of a target a build is, as one number. */
export const frontalArea = (r: BuildRig): number => {
  const step = (BODY_ENVELOPE.crownY - BODY_ENVELOPE.footY) / PROFILE_BANDS;
  return widthProfile(r).reduce((sum, halfW) => sum + halfW * 2 * step, 0);
};

/** Largest band-to-band difference between two profiles (m). Zero means the same silhouette. */
export const profileDistance = (a: number[], b: number[]): number =>
  a.reduce((worst, v, i) => Math.max(worst, Math.abs(v - b[i])), 0);

// ------------------------------------------------------------------ what the server hits

/** The collision and hitscan facts for a build: `PLAYER`, unchanged, for every one of them. */
export interface Hitbox {
  halfWidth: number; height: number; crouchHeight: number;
  eyeHeight: number; crouchEyeHeight: number; headFraction: number;
}

/**
 * What the server uses to hit a player wearing this build.
 *
 * It takes the build and ignores it, and that is the point: the signature exists so a test can ask
 * every build the question and compare the answers. If a later change ever makes a build matter
 * here, this function is where it has to be written down, and `builds.test.ts` fails the moment it
 * is (`hitboxFor` is compared against `PLAYER` field by field for every entry in `BUILDS`).
 */
export function hitboxFor(_build: BodyBuild | string): Hitbox {
  return {
    halfWidth: PLAYER.halfWidth, height: PLAYER.height, crouchHeight: PLAYER.crouchHeight,
    eyeHeight: PLAYER.eyeHeight, crouchEyeHeight: PLAYER.crouchEyeHeight, headFraction: PLAYER.headFraction,
  };
}

/** The y a hit must reach to score as a headshot on a standing player. */
export const headZoneStart = (): number => PLAYER.height * (1 - PLAYER.headFraction);
