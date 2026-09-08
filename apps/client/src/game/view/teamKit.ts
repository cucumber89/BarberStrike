import type { Team } from "@frankibarber/shared";

/**
 * What each side wears.
 *
 * Team 0 wears a kit built from the colours of **MKS Marcovia Marki**, the football club in Marki
 * the owner named. Sourced and cross-checked before use, not guessed:
 *
 *   - Miasto Marki (the town's own site), "Stulatka w formie!" — the club's colours are
 *     biało-żółto-zielone (white, yellow and green), and it plays in characteristic green-yellow
 *     shirts.  https://www.marki.pl/aktualnosc-11443-stulatka_w_formie
 *   - marki.net.pl, "Historia klubów sportowych na terenie Marek" — same three colours, and the
 *     club's history from 1923.  http://www.marki.net.pl/historia-klubow-sportowych-na-terenie-marek-159
 *   - Akademia Piłkarska Marcovia Marki (the club).  https://marcovia-marki.pl/klub/
 *
 * HONEST LIMIT: those pages could not be opened from this environment (the network proxy refuses
 * every one of those hosts), so the colours come from three independent search results that agree,
 * and the crest itself was never seen. What follows is therefore a kit INSPIRED BY the club's
 * colours — the green-yellow shirt with white trim the sources describe — and deliberately not a
 * reproduction of the badge. If the owner wants the real crest, it needs the actual artwork and a
 * licence decision, which is a question for them, not a guess for here.
 *
 * TWO CONSTRAINTS THIS FILE EXISTS TO KEEP, both from the brief:
 *
 *  1. COLOURS ONLY. Not one box moves, resizes or is added. A skin that changes the silhouette
 *     changes how easy a player is to see and hit, and this is a competitive shooter — so the kit
 *     is a palette swap over the existing named parts and nothing else. Hitboxes come from
 *     `PLAYER` and never touched geometry in the first place; `teamKit.test.ts` holds the line.
 *  2. THE TWO SIDES MUST NOT BE CONFUSABLE. Yellow-and-green against brown-and-violet is a
 *     separation of both hue and value, so it survives a dark corner, a smoke and colour-blindness
 *     — the test checks the numbers rather than trusting the eye.
 */

export interface TeamKit {
  /** Shirt, trousers, cap: the largest area, so this is the colour the side is recognised by. */
  cloth: string;
  /** Vest, shoulders, apron, knee pads: the second colour of the strip. */
  vest: string;
  /** Team-identifying panels front and back. Kept close to the HUD's team colour on purpose, so
   *  the body on screen and the dot on the minimap are obviously the same side. */
  accent: string;
  /** Narrow club trim — armbands, chest stripe. The third colour. */
  trim: string;
  boots: string;
  skin: string;
  /** Shown in the settings / scoreboard when a kit is named. */
  name: string;
}

export const TEAM_KITS: Record<Team, TeamKit> = {
  // MARCOVIA — white, yellow and green, as the sources above describe the club.
  0: {
    name: "MARCOVIA",
    cloth: "#e3c02c",  // shirt and trousers: the club yellow
    vest: "#12703a",   // vest, shoulders, apron: the club green
    accent: "#d9a441", // TEAM_COLORS[0]: the panels match the minimap dot
    trim: "#f2f2ee",   // armbands and chest stripe: the club white
    boots: "#23272d",
    skin: "#c39270",
  },
  // The opposition keeps the house colours: brown workwear under a grey vest, violet flashes.
  1: {
    name: "TAPER",
    cloth: "#705044",
    vest: "#939990",
    accent: "#7a5cc9",
    trim: "#cfc4ea",
    boots: "#292e35",
    skin: "#c39270",
  },
};

/** sRGB hex → relative luminance (WCAG). Used to prove the two kits differ in value, not only hue. */
export function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

/** WCAG contrast ratio between two hex colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
