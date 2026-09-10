import { PLAYER } from "./constants";
import { BODY_ENVELOPE, type BuildRig } from "./builds";

/**
 * Character outfits — what a body WEARS, on top of the build that decides its shape.
 *
 * ## The trap this file is shaped by
 *
 * A build could not change how a player is hit. An outfit cannot either — it adds no size and the
 * hitbox is `PLAYER` — but it can break something the game needs just as badly: **telling the two
 * sides apart.** Every body in a match is one of two teams, and today a player reads that off the
 * kit, which is the largest coloured area on screen (`teamKit.ts`). An outfit that repainted the
 * whole body would put two identical NIETOPERZs on opposite sides of a doorway, and the game would
 * be asking players to shoot their own team.
 *
 * So `OutfitPalette` has **no `accent` field**, and that is the enforcement, not a convention: the
 * accent role — the chest panel, the back panel, the badge, the armband — is the team's, on every
 * outfit, and an outfit has no way to name it. What an outfit owns is cloth, vest, trim, boots and
 * skin. `outfits.test.ts` checks that the reserved role survives every entry in the catalog.
 *
 * ## Geometry
 *
 * A piece is a handful of boxes in the same joint spaces `builds.ts` solves, so it rides the build
 * it is worn on: BARYŁKA's hood is BARYŁKA-sized. Every piece is bounded — inside the AABB's
 * footprint, and no taller above the crown than a haircut already goes — because a cape that hung
 * out of the box a bullet can reach would be a thing you can see, aim at and miss.
 *
 * Nothing here imports a renderer, for the same reason `haircuts.ts` and `builds.ts` do not.
 */

/** The five tiers, matching the weapon finishes' so one crate can roll either. */
export type OutfitRarity = "pospolity" | "rzadki" | "epicki" | "legendarny" | "zloty";

/**
 * The colours an outfit owns.
 *
 * `accent` is missing on purpose and must stay missing — see the docblock. `hair` is optional: most
 * outfits leave the player's own haircut colour alone, a wig or a dye job does not.
 */
export interface OutfitPalette {
  /** Shirt, trousers, cap: the largest area on the body. */
  cloth: string;
  /** Vest, shoulders, apron, knee pads. */
  vest: string;
  /** Narrow trim — piping, armband, chest stripe. */
  trim: string;
  boots: string;
  skin: string;
  hair?: string;
}

export type Headgear = "none" | "beanie" | "hood" | "bucket" | "paper" | "cowl";
export type FacePiece = "none" | "moustache" | "beard" | "bandana";
export type BackPiece = "none" | "cape" | "backpack";
export type NeckPiece = "none" | "scarf" | "tie";

export interface OutfitDef {
  id: string;
  /** Shown in the wardrobe and on the crate reveal. Polish, like every player-visible string. */
  name: string;
  blurb: string;
  rarity: OutfitRarity;
  /** Absent means "wear this team's own kit" — the look the game shipped with. */
  palette?: OutfitPalette;
  headgear: Headgear;
  face: FacePiece;
  back: BackPiece;
  neck: NeckPiece;
  /**
   * Stripes down the sleeve and the trouser leg — the TOTAL, at least one.
   *
   * The outermost one is the body's own piping and is never removed: it is the widest geometry on
   * the whole character (`builds.ts`, `PIPING_PROUD`), so an outfit that dropped it would be 1.2 cm
   * narrower than every other outfit. Extra stripes are added INBOARD of it, where they change the
   * look and not the silhouette.
   */
  stripes: number;
  /** The barber's apron across the front. */
  apron: boolean;
}

/** The kit every player already wears. Always owned, never dropped, and the fallback for junk ids. */
export const DEFAULT_OUTFIT = "klubowy";

const fit = (o: Partial<OutfitDef> & Pick<OutfitDef, "id" | "name" | "blurb" | "rarity">): OutfitDef =>
  ({ headgear: "none", face: "none", back: "none", neck: "none", stripes: 1, apron: false, ...o });

/**
 * The wardrobe. Thirteen looks off the estate, the shop and one bad idea with a bedsheet.
 *
 * Everything except the kit is a crate drop (L5: earned, never bought), spread across the same five
 * tiers as the weapon finishes so one crate can roll either. The tiers are set by how much of a
 * character a look is rather than by how much geometry it costs: a tracksuit is a Tuesday, a cape is
 * the thing somebody screenshots.
 */
export const OUTFITS: readonly OutfitDef[] = [
  fit({
    id: DEFAULT_OUTFIT, name: "KLUBOWY", rarity: "pospolity",
    blurb: "Barwy klubu. To, w czym wszyscy zaczynają.",
    apron: true,
  }),
  fit({
    id: "dresik", name: "DRESIK", rarity: "pospolity",
    blurb: "Granatowy komplet, trzy paski, kaptur zostaje w domu.",
    palette: { cloth: "#2a3140", vest: "#1e2431", trim: "#dfe3ea", boots: "#0f1218", skin: "#c39270" },
    stripes: 3,
  }),
  fit({
    id: "dres-niebieski", name: "NIEBIESKI W DWA PASKI", rarity: "pospolity",
    blurb: "Ten niebieski. Dwa paski, bo trzeci się sprał.",
    palette: { cloth: "#1e50a8", vest: "#17408a", trim: "#f2f4f8", boots: "#12161d", skin: "#c39270" },
    stripes: 2,
  }),
  fit({
    id: "dres-wasy", name: "DRESIK Z WĄSEM", rarity: "rzadki",
    blurb: "Szary komplet i wąs, który widział transformację ustrojową.",
    palette: { cloth: "#6e7078", vest: "#55575e", trim: "#1c1e22", boots: "#24262b", skin: "#c08c68" },
    face: "moustache", stripes: 2,
  }),
  fit({
    id: "barber", name: "BARBER", rarity: "rzadki",
    blurb: "Biały kitel, czarny fartuch, grzebień w kieszeni. Gospodarz.",
    palette: { cloth: "#efeee8", vest: "#1d2126", trim: "#b8912f", boots: "#16181c", skin: "#c39270" },
    apron: true,
  }),
  fit({
    id: "kurier", name: "KURIER", rarity: "rzadki",
    blurb: "Odblask, plecak, dwie minuty do końca okna dostawy.",
    palette: { cloth: "#1d2430", vest: "#d8e838", trim: "#2a3140", boots: "#14181f", skin: "#b9865f" },
    back: "backpack",
  }),
  fit({
    id: "wedkarz", name: "WĘDKARZ", rarity: "rzadki",
    blurb: "Kapelusz, kamizelka na muchy, spokój człowieka znad zalewu.",
    palette: { cloth: "#4c5b3f", vest: "#6b7a52", trim: "#b8a55e", boots: "#2d2f28", skin: "#bb8a62" },
    headgear: "bucket", face: "beard",
  }),
  fit({
    id: "kibol", name: "KIBOL", rarity: "epicki",
    blurb: "Kaptur na oczy, szalik na twarz. Nikt nie wie, jak wygląda.",
    palette: { cloth: "#15181d", vest: "#23282f", trim: "#c8332f", boots: "#8f2222", skin: "#c39270" },
    headgear: "hood", face: "bandana", neck: "scarf",
  }),
  fit({
    id: "kebab", name: "KEBAB MISTRZ", rarity: "epicki",
    blurb: "Papierowa czapka, czerwony fartuch, nóż zostawiony w pracy.",
    palette: { cloth: "#e8e4d8", vest: "#b8352c", trim: "#d9c26a", boots: "#23252a", skin: "#a9764c" },
    headgear: "paper", face: "moustache", apron: true,
  }),
  fit({
    id: "bramkarz", name: "BRAMKARZ", rarity: "epicki",
    blurb: "Czarna bomberka, słuchawka, lista gości w głowie.",
    palette: { cloth: "#101216", vest: "#2e333c", trim: "#464d58", boots: "#0a0b0e", skin: "#b5825c" },
    face: "beard", neck: "tie",
  }),
  fit({
    id: "garnitur", name: "GARNITUR NA WESELE", rarity: "legendarny",
    blurb: "Jedyny garnitur, jaki masz. Był na dwóch weselach i jednej stypie.",
    palette: { cloth: "#2b2f39", vest: "#15171c", trim: "#f2f2ee", boots: "#0d0f13", skin: "#c39270" },
    neck: "tie",
  }),
  fit({
    id: "menel", name: "MENEL Z ŁAWKI", rarity: "legendarny",
    blurb: "Trzy warstwy, czapka do brwi, broda z zeszłego sezonu.",
    palette: { cloth: "#5a5347", vest: "#3f4a3c", trim: "#6b5f4a", boots: "#2b2723", skin: "#a8846a", hair: "#4a4136" },
    headgear: "beanie", face: "beard",
  }),
  fit({
    // Not the licensed one, and named so nobody could think it was: this is the estate's version,
    // a bedsheet and two bits of cardboard. The joke is the point.
    id: "nietoperz", name: "NIETOPERZ Z MAREK", rarity: "zloty",
    blurb: "Peleryna z prześcieradła, uszy z kartonu. Nocny obrońca osiedla.",
    palette: { cloth: "#1b1f2b", vest: "#0b0c11", trim: "#5b6273", boots: "#08090c", skin: "#c39270" },
    headgear: "cowl", back: "cape",
  }),
];

const BY_ID = new Map(OUTFITS.map((o) => [o.id, o]));

export const isOutfitId = (v: unknown): v is string => typeof v === "string" && BY_ID.has(v);
/** The catalog entry, or the kit when the id is unknown (an older or a lying client). */
export const outfitDef = (id: string | undefined | null): OutfitDef => BY_ID.get(id ?? "") ?? BY_ID.get(DEFAULT_OUTFIT)!;
/** Everything a crate can roll. The kit is not a prize; every player already has it. */
export const DROPPABLE_OUTFITS = OUTFITS.filter((o) => o.id !== DEFAULT_OUTFIT);

/** A cowl hides the hair under it; a hood or a beanie lets it show at the sides. */
export const hidesHair = (o: OutfitDef): boolean => o.headgear === "cowl";

// ------------------------------------------------------------------ the pieces

/**
 * Which shared material a piece is painted with.
 *
 * `accent` is here and NOT in `OutfitPalette`: a piece may be painted in the team's colour (a back
 * piece has to re-site the side's panel onto itself), but no outfit can decide what that colour is.
 */
export type OutfitRole = "cloth" | "vest" | "trim" | "boots" | "skin" | "hair" | "accent";
/** Which joint a piece hangs from, in the chain `Character.ts` builds. */
export type OutfitJoint = "head" | "torso";

/**
 * The materials the base body ALREADY paints on each joint — and therefore the only ones a piece
 * may use.
 *
 * The body is merged per (joint, material) pair, so a piece in a pair the body already has is free:
 * it joins an existing mesh and the character still costs the draw calls it did before. A piece in a
 * NEW pair creates a mesh, and a room holds twelve bodies. MEASURED before this rule existed: a
 * beard or a hat band in `hair`/`trim` on the head took the body from 32 meshes to 33 or 34, and
 * MENEL and KEBAB were the two that did it. Constraining the palette instead of the art costs a
 * moustache its own colour — it wears the outfit's `boots` tone, which is the dark one anyway.
 */
export const JOINT_ROLES: Record<OutfitJoint, readonly OutfitRole[]> = {
  head: ["skin", "cloth", "boots"],
  // `accent` is here and nowhere in `OutfitPalette`, and the two are different things: the palette
  // is which COLOURS an outfit sets, this is which MATERIALS a piece may be painted with. A back
  // piece needs the team's material to put the side's panel back on the outside of itself — see
  // `outfitParts`. It still cannot choose what that colour is.
  torso: ["cloth", "vest", "trim", "boots", "accent"],
};

/** One box of an outfit, in its joint's local space. */
export interface OutfitBox {
  name: string;
  joint: OutfitJoint;
  role: OutfitRole;
  w: number; h: number; d: number;
  x: number; y: number; z: number;
}

/**
 * How far above the crown an outfit may reach.
 *
 * The same allowance a haircut already takes (IROKEZ stands 11.5 cm proud), so headgear cannot make
 * a player taller than the tallest thing the game already draws on a head.
 */
export const OUTFIT_HEAD_ROOM = 0.1;
/** How close to the edge of the hittable footprint a piece may come. */
const FOOTPRINT = PLAYER.halfWidth - 0.02;

/**
 * The boxes one outfit asks for, sized against the body it is worn on.
 *
 * Everything is derived from the rig rather than fixed, so a piece fits every build: a hood on
 * BARYŁKA's big skull is a bigger hood, not a hat sitting on top of one.
 */
export function outfitParts(o: OutfitDef, r: BuildRig): OutfitBox[] {
  const parts: OutfitBox[] = [];
  const add = (name: string, joint: OutfitJoint, role: OutfitRole, w: number, h: number, d: number, x: number, y: number, z: number) =>
    parts.push({ name, joint, role, w, h, d, x, y, z });

  // Head-local landmarks, the same ones the hair is cut against.
  const crown = r.skullY + r.skullH / 2, hx = r.skullW / 2, hz = r.skullD / 2;
  const chin = r.skullY - r.skullH / 2;
  /** The top edge of the goggle frame, from the expression `Character.ts` places it with. */
  const brow = r.skullY + r.skullH * (.035 / .24) + .075 / 2;
  const k = r.skullW / 0.22;   // head scale, so a piece keeps its proportions on any skull

  switch (o.headgear) {
    case "beanie":
      // Pulled down to the brow, with a rolled band round the bottom edge.
      add("fit_beanie", "head", "cloth", r.skullW + .022, r.skullH * .5, r.skullD + .022, 0, crown - r.skullH * .22, 0);
      add("fit_beanie_band", "head", "boots", r.skullW + .03, .034, r.skullD + .03, 0, crown - r.skullH * .44, 0);
      break;
    case "hood":
      // A shell round the back and sides of the skull plus a drape down the neck. Open at the front,
      // which is what makes it a hood rather than a helmet.
      add("fit_hood_top", "head", "cloth", r.skullW + .04, r.skullH * .42, r.skullD + .04, 0, crown - r.skullH * .1, -.012);
      add("fit_hood_l", "head", "cloth", .028, r.skullH * .8, r.skullD + .03, -(hx + .022), r.skullY, -.01);
      add("fit_hood_r", "head", "cloth", .028, r.skullH * .8, r.skullD + .03, hx + .022, r.skullY, -.01);
      add("fit_hood_back", "head", "cloth", r.skullW + .05, r.skullH * .95, .03, 0, r.skullY - r.skullH * .08, -(hz + .028));
      break;
    case "bucket":
      add("fit_bucket", "head", "cloth", r.skullW + .018, r.skullH * .42, r.skullD + .018, 0, crown - r.skullH * .12, 0);
      add("fit_bucket_brim", "head", "cloth", r.skullW + .13, .022, r.skullD + .13, 0, crown - r.skullH * .32, 0);
      break;
    case "paper":
      // Tall, straight-sided, and white by the palette: a cook's hat, not a chef's toque.
      add("fit_paper", "head", "cloth", r.skullW * .88, OUTFIT_HEAD_ROOM * .82, r.skullD * .88, 0, crown + OUTFIT_HEAD_ROOM * .38, 0);
      add("fit_paper_band", "head", "boots", r.skullW + .012, .026, r.skullD + .012, 0, crown + .008, 0);
      break;
    case "cowl": {
      // Open at the front, like the hood — the first cut enclosed the whole skull and swallowed the
      // goggles with it, which took a team-coloured part off the head and left a featureless block.
      // The ears are the silhouette, so they take the head room and nothing else does.
      const cap = crown - brow + .022, capY = (crown + brow) / 2 + .011;
      add("fit_cowl", "head", "cloth", r.skullW + .018, cap, r.skullD + .018, 0, capY, -.002);
      for (const s of [-1, 1]) add("fit_cowl_cheek", "head", "cloth", .026, r.skullH * .62, r.skullD + .012, s * (hx + .011), r.skullY + r.skullH * .08, -.006);
      add("fit_cowl_back", "head", "cloth", r.skullW + .022, r.skullH * .86, .03, 0, r.skullY + r.skullH * .06, -(hz + .015));
      // Tall, narrow and set well out on the corners of the skull: two bits of cardboard.
      for (const s of [-1, 1]) {
        add("fit_cowl_ear", "head", "cloth", .034 * k, OUTFIT_HEAD_ROOM * .95, .028 * k, s * hx * .66, crown + OUTFIT_HEAD_ROOM * .42, -.028);
      }
      break;
    }
    default: break;
  }

  switch (o.face) {
    case "moustache":
      // Between the mask's top edge and the goggles: the one band of face that is visible.
      add("fit_moustache", "head", "boots", r.skullW * .42, .026, .03, 0, r.skullY - r.skullH * .04, hz + .008);
      break;
    case "beard":
      add("fit_beard", "head", "boots", r.skullW * .8, r.skullH * .3, .045, 0, chin + r.skullH * .1, hz - .012);
      add("fit_beard_chin", "head", "boots", r.skullW * .55, .05, .055, 0, chin + .012, hz - .022);
      break;
    case "bandana":
      add("fit_bandana", "head", "boots", r.skullW + .012, r.skullH * .26, .05, 0, chin + r.skullH * .18, hz - .006);
      break;
    default: break;
  }

  switch (o.neck) {
    case "scarf":
      add("fit_scarf", "torso", "trim", r.chestW * .62, .07, r.chestD + .05, 0, r.chestY + r.chestH * .46, r.chestZ);
      add("fit_scarf_tail", "torso", "trim", .075, r.chestH * .5, .03, r.chestW * .17, r.chestY + r.chestH * .16, r.chestZ + r.chestD / 2 + .022);
      break;
    case "tie":
      add("fit_tie", "torso", "trim", .05, r.chestH * .56, .02, 0, r.chestY + r.chestH * .1, r.chestZ + r.chestD / 2 + .03);
      add("fit_tie_knot", "torso", "trim", .05, .045, .026, 0, r.chestY + r.chestH * .42, r.chestZ + r.chestD / 2 + .032);
      break;
    default: break;
  }

  // The team's back panel lives on the CHEST box, so anything hung on the back covers it — MEASURED
  // from behind: NIETOPERZ's cape hid it completely, which is the exact failure the reserved accent
  // role exists to prevent, arriving through geometry instead of through colour. So every back piece
  // carries the panel back out to its own surface, at the size the body already uses.
  switch (o.back) {
    case "cape": {
      // Hangs from the shoulder line to mid-thigh, hugging the back. Both extents are clamped: the
      // depth to the footprint, because a cape past the AABB is geometry a bullet cannot touch, and
      // the width to the silhouette, because a cape past THAT is a bigger target. It is cut as wide
      // as those allow — a cape narrower than the shoulders reads as a towel.
      const z = Math.max(-(FOOTPRINT - .02), r.chestZ - r.chestD / 2 - .05);
      const w = Math.min((BODY_ENVELOPE.halfW - .012) * 2, r.chestW * 1.6);
      add("fit_cape", "torso", "cloth", w, r.chestH * 1.5, .026, 0, r.chestY - r.chestH * .38, z);
      add("fit_cape_collar", "torso", "cloth", r.chestW * 1.04, .08, .055, 0, r.chestY + r.chestH * .45, z + .02);
      add("fit_back_team_panel", "torso", "accent", r.chestW * (.32 / .42), .17, .02, 0, r.chestY + r.chestH * .14, z - .032);
      break;
    }
    case "backpack": {
      const z = Math.max(-(FOOTPRINT - .06), r.chestZ - r.chestD / 2 - .085);
      add("fit_pack", "torso", "boots", r.chestW * .74, r.chestH * .66, .13, 0, r.chestY + r.chestH * .06, z);
      add("fit_pack_flap", "torso", "trim", r.chestW * .6, .05, .14, 0, r.chestY + r.chestH * .3, z - .004);
      add("fit_back_team_panel", "torso", "accent", r.chestW * (.32 / .42), .14, .02, 0, r.chestY - r.chestH * .1, z - .09);
      break;
    }
    default: break;
  }

  return parts;
}

/**
 * Every reason a piece could be unfair, as one list.
 *
 * Used by `outfits.test.ts` across every outfit × build pair. A piece outside the footprint or above
 * the head room is one a player can see and aim at but not hit, which is the same defect as a head
 * drawn above its own hitbox — the difference being that this one would be introduced here, on
 * purpose, by a catalog entry somebody added later.
 */
export function outfitViolations(o: OutfitDef, r: BuildRig): string[] {
  const bad: string[] = [];
  const headNodeY = r.hipY + r.torsoY + r.headY, torsoY = r.hipY + r.torsoY;
  for (const p of outfitParts(o, r)) {
    const baseY = p.joint === "head" ? headNodeY : torsoY;
    const baseZ = p.joint === "head" ? r.headZ : 0;
    const top = baseY + p.y + p.h / 2, bottom = baseY + p.y - p.h / 2;
    if (Math.abs(p.x) + p.w / 2 > BODY_ENVELOPE.halfW) bad.push(`${p.name} is wider than the silhouette`);
    if (Math.abs(baseZ + p.z) + p.d / 2 > PLAYER.halfWidth) bad.push(`${p.name} reaches outside the hittable footprint`);
    if (top > BODY_ENVELOPE.crownY + OUTFIT_HEAD_ROOM) bad.push(`${p.name} stands above the head room`);
    if (bottom < BODY_ENVELOPE.footY) bad.push(`${p.name} hangs below the sole`);
    if (!JOINT_ROLES[p.joint].includes(p.role)) bad.push(`${p.name} paints ${p.role} on the ${p.joint}, which costs a draw call`);
  }
  return bad;
}
