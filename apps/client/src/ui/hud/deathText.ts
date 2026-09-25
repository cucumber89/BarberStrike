import { killerName } from "@frankibarber/shared";
import type { HudKiller, HudSpectating } from "../../game/store";
import { countWords } from "./format";

/**
 * Drop U (P1): THE WORDS OF DEATH — the killer card and the spectate bar (docs/UI_U_SPEC.md §5.2
 * rows 32–38 and 40, §6.5). Pure, so the reading budget is a test: the card holds 5000 ms in the
 * round modes and (2200 − 300) ms at worst in the respawn modes, and its static words must fit
 * 3 a second (`deathText.test.ts`).
 *
 * Every word is Polish and fixed here, uppercased as written (never with CSS `text-transform`);
 * the killer's and the spectated player's nicks keep their own case.
 */
export const DEATH_TEXT = {
  killedBy: "ZABIŁ CIĘ",
  selfKill: "ZGINĄŁEŚ",
  nextRound: "WRACASZ W NASTĘPNEJ RUNDZIE",
  lateJoin: "DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE",
  waiting: "CZEKASZ NA SWOJĄ PARĘ",
  out: "ODPADŁEŚ Z TURNIEJU",
  watching: "OBSERWUJESZ:",
  nobody: "NIKOGO DO OBSERWOWANIA",
  next: "NASTĘPNY",
  prev: "POPRZEDNI",
  keyNext: "LPM",
  keyPrev: "PPM",
  hp: "HP",
  dealt: "ZADANE",
  taken: "OTRZYMANE",
  headshot: "W GŁOWĘ",
} as const;

/** „ODRODZENIE ZA 3”: whole seconds, rounded up, never below 0 (the live line). */
export const respawnLine = (secs: number): string => `ODRODZENIE ZA ${secs}`;
/** Ostrzyżeni: a survivor just shaved comes back as a chaser — „WRACASZ Z MASZYNKĄ ZA 3”. */
export const clippersLine = (secs: number): string => `WRACASZ Z MASZYNKĄ ZA ${secs}`;
/** Seconds left on a respawn deadline, as the card counts them. */
export const secsLeft = (respawnAt: number, now: number): number => Math.max(0, Math.ceil((respawnAt - now) / 1000));

/** The weapon's short name, the kill feed's („K-7 Buzzcut” → „K-7”, „Frag” → „Frag”). */
export const weaponShort = (weapon: string): string => killerName(weapon).split(" ")[0];

/** „ZADANE 64 (3) · OTRZYMANE 100 (4)”: words, not arrows (veto). */
export const damageLine = (k: Pick<HudKiller, "dealt" | "dealtHits" | "taken" | "takenHits">): string =>
  `${DEATH_TEXT.dealt} ${Math.round(k.dealt)} (${k.dealtHits}) · ${DEATH_TEXT.taken} ${Math.round(k.taken)} (${k.takenHits})`;

/** The tournament bystander's place in the bracket (`standing` of `ui/Bracket.tsx`). */
export type Standing = "playing" | "waiting" | "out" | "";

export interface DeathCardInput {
  /** Who killed me; null for a self-kill (and for a bystander, who was never killed). */
  killer: HudKiller | null;
  /** Local respawn deadline; 0 = next round (`hudFeed.respawnAtFor`). */
  respawnAt: number;
  now: number;
  /** Ostrzyżeni: I am shaved now and come back with the clippers. */
  clippers: boolean;
  /** Turniej: waiting for my pair, or out — a bystander, not a casualty. */
  standing: Standing;
}

/** The card's lines. Empty strings are not drawn. */
export interface DeathCardText {
  /** „ZABIŁ CIĘ” / „ZGINĄŁEŚ”; "" for a bystander. */
  eyebrow: string;
  /** A bystander's title: „CZEKASZ NA SWOJĄ PARĘ” / „ODPADŁEŚ Z TURNIEJU”. */
  title: string;
  /** The killer's nick, in its own case. */
  nick: string;
  /** The killer's weapon, short. */
  weapon: string;
  /** The killer's HP (live), or "" when unknown. */
  hp: string;
  /** This life's damage with the killer, in the round modes. */
  damage: string;
  /** The static last line: „WRACASZ W NASTĘPNEJ RUNDZIE”. */
  footer: string;
  /** The live last line: „ODRODZENIE ZA 3” / „WRACASZ Z MASZYNKĄ ZA 3”. */
  live: string;
}

/**
 * What the card says. A bystander gets the bracket's word and nothing about a death that did not
 * happen; a self-kill says so and names nobody; a killer card names the killer, the gun, their HP
 * and — when the wait is a whole round, so there is time to read it — the damage both ways.
 */
export function deathCard(i: DeathCardInput): DeathCardText {
  const none: DeathCardText = { eyebrow: "", title: "", nick: "", weapon: "", hp: "", damage: "", footer: "", live: "" };
  if (i.standing === "waiting" || i.standing === "out") return { ...none, title: i.standing === "waiting" ? DEATH_TEXT.waiting : DEATH_TEXT.out };
  const timed = i.respawnAt > 0;
  const tail = timed
    ? { live: (i.clippers ? clippersLine : respawnLine)(secsLeft(i.respawnAt, i.now)) }
    : { footer: DEATH_TEXT.nextRound };
  const k = i.killer;
  if (!k) return { ...none, eyebrow: DEATH_TEXT.selfKill, ...tail };
  return {
    ...none, ...tail,
    eyebrow: DEATH_TEXT.killedBy, nick: k.name, weapon: weaponShort(k.weapon),
    hp: k.hp >= 0 ? String(Math.max(0, Math.round(k.hp))) : "",
    damage: timed ? "" : damageLine(k),
  };
}

/** The words that leave with the card (§3.10): everything but the live HP and the live countdown. */
export const staticWords = (c: DeathCardText): number =>
  countWords([c.eyebrow, c.title, c.nick, c.weapon, c.damage, c.footer].join(" "));
/** The live words: the HP line („37 HP”) and the countdown. */
export const liveWords = (c: DeathCardText): number =>
  countWords([c.hp ? `${c.hp} ${DEATH_TEXT.hp}` : "", c.live].join(" "));

export interface SpectateBarText {
  /** „OBSERWUJESZ:” before a nick, or „NIKOGO DO OBSERWOWANIA” alone. */
  watch: string;
  nick: string;
  /** The spectated player's HP, "" when unknown. */
  hp: string;
  /** The footer: „WRACASZ W NASTĘPNEJ RUNDZIE” / „DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE”; "" for a bystander. */
  footer: string;
}

/** The spectate bar's lines (the key line is fixed: [LPM] NASTĘPNY · [PPM] POPRZEDNI). */
export function spectateBar(i: { target: HudSpectating | null; lateJoin: boolean; standing: Standing }): SpectateBarText {
  const footer = i.standing === "waiting" || i.standing === "out" ? "" : i.lateJoin ? DEATH_TEXT.lateJoin : DEATH_TEXT.nextRound;
  if (!i.target) return { watch: DEATH_TEXT.nobody, nick: "", hp: "", footer };
  return { watch: DEATH_TEXT.watching, nick: i.target.name, hp: i.target.health >= 0 ? String(Math.max(0, Math.round(i.target.health))) : "", footer };
}

/** The bar's words, key line included. */
export const barWords = (b: SpectateBarText): number =>
  countWords([b.watch, b.nick, b.hp ? `${b.hp} ${DEATH_TEXT.hp}` : "", `${DEATH_TEXT.keyNext} ${DEATH_TEXT.next} ${DEATH_TEXT.keyPrev} ${DEATH_TEXT.prev}`, b.footer].join(" "));
