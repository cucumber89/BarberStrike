import type { LifetimeStats } from "./progression";
import { MELEE_WEAPON } from "./weapons";

/**
 * Drop E — the shave (ogolenie) and haircuts.
 *
 * Two things live here because they are the same thing seen from two sides:
 *
 *  - A **shave** is a clippers kill from behind. The victim does not just die, they get done: they
 *    come back wearing a haircut somebody else chose for them, and they wear it for the rest of the
 *    match. It is the mechanic the whole game is named after.
 *  - A **haircut** is a cosmetic a player earns and equips. L1 is not negotiable: a haircut is
 *    never a stat, never a purchase and never a gate. The unlock predicates below read a lifetime
 *    counter and nothing else, so a player who joins on Friday brings exactly the same numbers into
 *    the fight as one who has played since Thursday — they just look different.
 *
 * ## One replicated field
 *
 * Both live in ONE schema string, `PlayerState.haircut`, encoded `"<id>"` or `"<id>#<n>"`:
 * the equipped catalog id, plus the number of times its owner has been shaved this match. That is
 * deliberate and it is the reason the field can be a string rather than a string and a counter:
 *
 *  - it changes on equip and on a shave death, never per tick (L6);
 *  - the equipped id SURVIVES the shave, so when the match ends the player still owns the look they
 *    chose and the next match starts from it;
 *  - the count is exact rather than clamped to the number of drawable stages, so the match award
 *    can rank players who have all been ruined.
 *
 * Nothing here imports a renderer. `HaircutStyle` is the recipe in metres; the client's head
 * builder is the only thing that knows what a metre looks like.
 */

/** How a head is dressed. Numbers are metres, in the character's head-local space. */
export interface HaircutStyle {
  /** Wear the shop cap. The hair is hidden under it — this is the default look. */
  cap: boolean;
  /** Hair slab standing on the crown. 0 = shaved to the skin on top. */
  crown: number;
  /**
   * How wide that slab is across the head. The skull is 0.22 m wide, so `FULL_CROWN` is a covering
   * and anything much less is a ridge — which is what separates a MOHAWK (a narrow strip of hair
   * left standing) from a shave stage (a wide strip of hair taken away). Those are opposites and
   * the catalog had them confused: a mohawk written as a `track` is a reverse mohawk.
   */
  width: number;
  /** Hair down the sides and back. 0 = clipped to the skin around. */
  sides: number;
  /** Fringe hanging forward over the brow. 0 = none. */
  fringe: number;
  /** A clipper track mown through the crown, front to back. 0 = none. This is what "bad" is. */
  track: number;
  /** A stray clump left standing after the track went through. 0 = none. */
  tuft: number;
  /**
   * The clippers have been over this head: show the stubbled SCALP under whatever hair is left.
   *
   * This is the only thing about a shave that survives being 14 pixels tall. An art review of the
   * first cut found that at 8 m no shave stage read as a bad haircut at all — the track was a groove
   * on the crown, invisible from behind and about one pixel wide down the sights. A pale scalp under
   * dark remnants flips the head's TONE and narrows its SILHOUETTE, and those are the two things
   * that still read when the detail is gone.
   */
  scalp: boolean;
  /** Which of the three head tones the hair takes. */
  tone: "hair" | "bleach" | "stubble";
}

export interface HaircutDef {
  id: string;
  /** Shown in the picker and on the summary screen. */
  name: string;
  style: HaircutStyle;
  /** What a player did to get it, in words, for the picker. */
  requirement: string;
  /**
   * Earned when this returns true. Pure and lifetime-only, so the whole set can be re-evaluated on
   * any change — the same shape as `BADGES`, for the same reason.
   */
  unlockedBy: (s: LifetimeStats) => boolean;
}

/** A crown that covers the whole skull. Narrower than this reads as a ridge, not as hair. */
export const FULL_CROWN = 0.222;

const style = (s: Partial<HaircutStyle>): HaircutStyle =>
  ({ cap: false, crown: 0, width: FULL_CROWN, sides: 0, fringe: 0, track: 0, tuft: 0, scalp: false, tone: "hair", ...s });

/** The default look: the shop cap, which is what every character has worn until now. */
export const DEFAULT_HAIRCUT = "cap";

/**
 * Equippable haircuts. The first is free and always owned; the rest are earned.
 *
 * The requirements are spread across counters a player fills by playing differently (kills, heads,
 * assists, wins, shaves given) rather than all off one number, so the set does not unlock in a
 * single evening of one player farming one stat.
 */
export const HAIRCUTS: readonly HaircutDef[] = [
  {
    id: DEFAULT_HAIRCUT, name: "CZAPKA FIRMOWA", requirement: "Zawsze",
    style: style({ cap: true }), unlockedBy: () => true,
  },
  {
    id: "buzz", name: "NA JEŻA", requirement: "Rozegraj mecz",
    style: style({ crown: 0.012, sides: 0.01 }), unlockedBy: (s) => s.matches >= 1,
  },
  {
    id: "pompadour", name: "POMPADOUR", requirement: "50 zabójstw",
    style: style({ crown: 0.075, sides: 0.012, fringe: 0.05 }), unlockedBy: (s) => s.kills >= 50,
  },
  {
    id: "taper", name: "CIENIOWANY", requirement: "25 trafień w głowę",
    style: style({ crown: 0.04, sides: 0.006 }), unlockedBy: (s) => s.headshots >= 25,
  },
  {
    id: "curtains", name: "NA ZASŁONKI", requirement: "25 asyst",
    style: style({ crown: 0.03, sides: 0.028, fringe: 0.055 }), unlockedBy: (s) => s.assists >= 25,
  },
  {
    id: "bowl", name: "NA GARNEK", requirement: "10 meczów",
    style: style({ crown: 0.035, sides: 0.032, fringe: 0.045 }), unlockedBy: (s) => s.matches >= 10,
  },
  {
    id: "topknot", name: "KUCYK", requirement: "5 wygranych",
    style: style({ crown: 0.02, sides: 0.008, tuft: 0.09 }), unlockedBy: (s) => s.wins >= 5,
  },
  {
    id: "mohawk", name: "IROKEZ", requirement: "5 ogoleń",
    // A strip of hair LEFT, not taken: a narrow, tall crown with the sides clipped to the skin.
    style: style({ crown: 0.115, width: 0.058, sides: 0 }), unlockedBy: (s) => s.shaves >= 5,
  },
  {
    id: "bleach", name: "BLOND", requirement: "20 ogoleń",
    style: style({ crown: 0.045, sides: 0.02, fringe: 0.03, tone: "bleach" }), unlockedBy: (s) => s.shaves >= 20,
  },
];

const BY_ID = new Map(HAIRCUTS.map((h) => [h.id, h]));

/**
 * What a shaved head looks like, by how many times it has been done. Index 0 is the first shave.
 *
 * They get worse, and the last one is the floor: a fifth shave cannot make a head worse than
 * ruined, so the visual saturates while the COUNT (the thing the award ranks) does not.
 */
export const SHAVE_STAGES: readonly HaircutDef[] = [
  // What escalates is HOW MUCH HAIR IS LEFT, and every stage shows the scalp under it. The first cut
  // of these escalated the track's WIDTH instead, and an art review found the result unreadable at
  // gameplay range and, at the worst stage, two pale slivers standing off the skull that read as
  // horns rather than as a ruined head. Coverage down to nothing is the thing a player can see.
  {
    id: "shave-1", name: "PODCIĘCIE", requirement: "Ogolony raz",
    // Still a head of hair, with one gash taken out of it.
    style: style({ crown: 0.05, sides: 0.03, fringe: 0.02, track: 0.10, scalp: true }),
    unlockedBy: () => false,
  },
  {
    id: "shave-2", name: "SCHODY", requirement: "Ogolony dwa razy",
    // Two ridges and a clump on a scalp that is now showing.
    style: style({ crown: 0.05, sides: 0.014, track: 0.16, tuft: 0.05, scalp: true }),
    unlockedBy: () => false,
  },
  {
    id: "shave-3", name: "DOLINA", requirement: "Ogolony trzy razy",
    // The crown is gone; a rim around the sides and one clump survive.
    style: style({ crown: 0, sides: 0.01, tuft: 0.075, scalp: true }),
    unlockedBy: () => false,
  },
  {
    id: "shave-4", name: "RUINA", requirement: "Ogolony cztery razy lub więcej",
    // Nothing left but scalp and one clump the clippers went round. The head goes pale and narrow,
    // which is the read that survives at 8 m where a groove on the crown does not.
    style: style({ crown: 0, sides: 0, tuft: 0.105, scalp: true }),
    unlockedBy: () => false,
  },
];

/**
 * How much hair a style leaves, in metres across the head. Not a stat — a number the tests use to
 * assert that being shaved repeatedly takes hair away rather than rearranging it.
 */
export const hairLeft = (s: HaircutStyle): number =>
  (s.crown > 0 ? Math.max(0, s.width - s.track) : 0) + s.sides * 2 + s.tuft * 0.5;

/** The count the field will hold. A uint8's worth is far more shaves than a match can contain. */
export const MAX_SHAVES = 255;

export const isHaircutId = (v: unknown): v is string => typeof v === "string" && BY_ID.has(v);

/** The catalog entry, or the default when the id is unknown (an older or a lying client). */
export const haircutDef = (id: string): HaircutDef => BY_ID.get(id) ?? BY_ID.get(DEFAULT_HAIRCUT)!;

/** Haircuts this lifetime has earned, catalog order. Always at least the default. */
export const ownedHaircuts = (s: LifetimeStats): HaircutDef[] => HAIRCUTS.filter((h) => h.unlockedBy(s));

/** Ids earned by `after` that `before` had not. The haircut half of `newBadges`. */
export const newHaircuts = (before: LifetimeStats, after: LifetimeStats): string[] =>
  HAIRCUTS.filter((h) => h.unlockedBy(after) && !h.unlockedBy(before)).map((h) => h.id);

// ------------------------------------------------------------------ the one field

/** The equipped id and the shave count carried by one `PlayerState.haircut` value. */
export interface HaircutState { id: string; shaves: number }

/** `"buzz"` / `"buzz#3"`. An empty value is the default, never shaved. */
export function encodeHaircut(id: string, shaves: number): string {
  const safe = isHaircutId(id) ? id : DEFAULT_HAIRCUT;
  const n = Math.max(0, Math.min(MAX_SHAVES, Math.floor(shaves) || 0));
  return n > 0 ? `${safe}#${n}` : safe;
}

/** Reads the field. Anything unparseable reads as the default, unshaved — never as a throw. */
export function parseHaircut(value: string | undefined | null): HaircutState {
  if (typeof value !== "string" || value === "") return { id: DEFAULT_HAIRCUT, shaves: 0 };
  const hash = value.indexOf("#");
  const id = hash < 0 ? value : value.slice(0, hash);
  const raw = hash < 0 ? 0 : Number.parseInt(value.slice(hash + 1), 10);
  const shaves = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_SHAVES, raw)) : 0;
  return { id: isHaircutId(id) ? id : DEFAULT_HAIRCUT, shaves };
}

/** The field after one more shave. The equipped id is kept: the player still owns their look. */
export const shaveOnce = (value: string | undefined | null): string => {
  const { id, shaves } = parseHaircut(value);
  return encodeHaircut(id, shaves + 1);
};

/** The field with the shaves wiped — what a fresh match starts from. */
export const resetShaves = (value: string | undefined | null): string => encodeHaircut(parseHaircut(value).id, 0);

/** What to DRAW for a field value: the shave stage once shaved, otherwise the equipped haircut. */
export function haircutLook(value: string | undefined | null): HaircutDef {
  const { id, shaves } = parseHaircut(value);
  if (shaves <= 0) return haircutDef(id);
  return SHAVE_STAGES[Math.min(shaves, SHAVE_STAGES.length) - 1];
}

// ------------------------------------------------------------------ the rule and the award

/**
 * The rule: a clippers kill **from behind** is a shave. Everything else — a clippers kill to the
 * face, a backstab with any other weapon (there is no such thing, but the rule does not assume it)
 * — is an ordinary kill.
 *
 * The server decides it, like every other kill fact, from the backstab test the melee swing already
 * runs (`isBackstab`, weapons.ts). No new geometry, no client claim.
 */
export const isShave = (weapon: string, backstab: boolean): boolean => backstab && weapon === MELEE_WEAPON;

/** One row of the match summary's input: what a player's field said when the match ended. */
export interface HaircutRow { id: string; name: string; haircut: string }

/** The "Najgorsza fryzura" winner: who was shaved most. */
export interface WorstHaircut { id: string; name: string; shaves: number; look: HaircutDef }

/**
 * "Najgorsza fryzura" — the most-shaved player in the match, or null when nobody was shaved.
 *
 * Ties break on the player id, ascending, so every client that renders the same match names the
 * same person. Ranking by the COUNT rather than by the drawn stage is why the count is not clamped
 * to four: three players all sitting at RUINA still have an order.
 */
export function worstHaircut(rows: readonly HaircutRow[]): WorstHaircut | null {
  let best: WorstHaircut | null = null;
  for (const r of rows) {
    const { shaves } = parseHaircut(r.haircut);
    if (shaves <= 0) continue;
    if (!best || shaves > best.shaves || (shaves === best.shaves && r.id < best.id)) {
      best = { id: r.id, name: r.name, shaves, look: haircutLook(r.haircut) };
    }
  }
  return best;
}
