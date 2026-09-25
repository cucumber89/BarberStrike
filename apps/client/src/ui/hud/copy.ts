import { BOMB, DUEL, GUN_GAME, MAPS, MODES, OSTRZYZENI, type GameMode } from "@frankibarber/shared";
import { plPlural, upperPl } from "./format";
import type { Side } from "./types";

/**
 * Drop U: the HUD's words that are not a sentence about one moment — mode titles, the one-line
 * goal, side names, map titles and the error texts. One table each, in Polish (Principle 10).
 * The menu keeps its own copy and is not touched.
 *
 * Owned by P0 and frozen for the drop (docs/UI_U_SPEC.md §7.0): every package reads it, none edits it.
 */

/** The mode as the HUD titles it: the loading card, the pause column, the scoreboard header. */
export const MODE_TITLE: Record<GameMode, string> = {
  tdm: "DRUŻYNOWY DEATHMATCH",
  ffa: "KAŻDY NA SIEBIE",
  dom: "DOMINACJA",
  boys: "THE BOYS",
  bomb: "ŁADUNEK",
  gungame: "WYŚCIG BRONI",
  ostrzyzeni: "OSTRZYŻENI",
  duel: "POJEDYNEK",
  turniej: "TURNIEJ",
};

/**
 * The goal in at most five uppercase words (the warm-up mode line, the loading card). Every number
 * comes from the rules: `limit` is the room's score limit (`scoreLimitFor`, which only moves in
 * TDM) and defaults to the mode's own; the round modes read their constants.
 */
export function modeGoal(mode: GameMode, limit: number = MODES[mode].scoreLimit): string {
  switch (mode) {
    case "tdm": return `PIERWSI DO ${limit} ZABÓJSTW`;
    case "ffa": return `PIERWSZY DO ${limit} ZABÓJSTW`;
    case "dom": case "boys": return `PIERWSI DO ${limit} PUNKTÓW`;
    case "bomb": return `PODŁÓŻ ALBO ROZBRÓJ · DO ${BOMB.wins}`;
    case "gungame": return `ZALICZ ${GUN_GAME.ladder.length} BRONI`;
    case "ostrzyzeni": return `UCIEKAJ ALBO GOL · ${OSTRZYZENI.rounds} ${plPlural(OSTRZYZENI.rounds, "RUNDA", "RUNDY", "RUND")}`;
    case "duel": return `DO ${DUEL.wins} WYGRANYCH RUND`;
    case "turniej": return "WYGRAJ SWOJĄ PARĘ";
  }
}

/** My side, as one word: the strip badge (`role-badge`) and the round banners. */
export const SIDE_WORD: Record<Side, string> = {
  atak: "ATAK",
  obrona: "OBRONA",
  ocalony: "OCALONY",
  ostrzyzony: "OSTRZYŻONY",
};

/** The map's name in the HUD's case („NIGHT DISTRICT”, „GÓRA (DACH)”); "" for an unknown id. */
export const mapTitle = (mapId: string): string => {
  const map = MAPS[mapId];
  return map ? upperPl(map.name) : "";
};

/**
 * Error CODES (§5.5). Code raises one (`new Error(ERR.deployTimeout)`), the screen maps it to
 * `ERROR_TEXT` — so the words live here and nothing matches English text to decide what to show.
 */
export const ERR = {
  loadTimeout: "load-timeout",
  serverUnreachable: "server-unreachable",
  connectionLost: "connection-lost",
  connectionError: "connection-error",
  roomFull: "room-full",
  roomNotFound: "room-not-found",
  sceneTimeout: "scene-timeout",
  deployTimeout: "deploy-timeout",
  noWebgl: "no-webgl",
  unknown: "unknown",
} as const;
export type ErrCode = (typeof ERR)[keyof typeof ERR];

/** What the player reads for each code. */
export const ERROR_TEXT: Record<ErrCode, string> = {
  "load-timeout": "Ładowanie trwało za długo. Spróbuj jeszcze raz albo obniż grafikę.",
  "server-unreachable": "Nie można połączyć z serwerem gry.",
  "connection-lost": "Utracono połączenie z serwerem.",
  "connection-error": "Błąd połączenia z serwerem.",
  "room-full": "Ten pokój jest pełny.",
  "room-not-found": "Nie ma takiego pokoju.",
  "scene-timeout": "Scena nie wystartowała. Obniż ustawienia grafiki.",
  "deploy-timeout": "Nie udało się wejść do meczu. Połącz się ponownie.",
  "no-webgl": "Gra nie ruszy w tej przeglądarce: włącz akcelerację sprzętową albo WebGL2.",
  "unknown": "Coś poszło nie tak.",
};

/** Is this string one of the codes (for example an `Error.message` raised with `ERR.*`)? */
export const isErrCode = (s: string): s is ErrCode => Object.prototype.hasOwnProperty.call(ERROR_TEXT, s);
