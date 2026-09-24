import { describe, expect, it } from "vitest";
import { BOMB, DEFAULT_MAP_ID, DUEL, DUEL_MAP_ID, GAME_MODES, GUN_GAME, MODES, OSTRZYZENI, TDM_SCORE_LIMIT_MAX, type GameMode } from "@frankibarber/shared";
import { ERR, ERROR_TEXT, MODE_TITLE, SIDE_WORD, isErrCode, mapTitle, modeGoal } from "./copy";
import { countWords, upperPl } from "./format";

/** Every mode the rules define — `GAME_MODES` is the menu's list and leaves out the legacy ffa. */
const ALL_MODES = Object.keys(MODES) as GameMode[];

/**
 * English words that must never reach a player. Only words that are not also Polish: „to”, „on”,
 * „go”, „no”, „a” and „i” are Polish words and would flag correct text.
 */
const ENGLISH = new Set([
  "the", "and", "or", "you", "your", "is", "are", "was", "not", "could", "cannot", "can't", "couldn't",
  "failed", "fail", "error", "server", "connection", "connect", "room", "full", "found", "timeout",
  "timed", "out", "load", "loading", "please", "try", "again", "lost", "unknown", "something",
  "went", "wrong", "browser", "enable", "hardware", "acceleration", "scene", "deploy", "deployment",
  "startup", "match", "network", "game", "unreachable", "reached", "cancelled", "with", "this",
]);

describe("errors", () => {
  it("every error code has Polish text with no English word", () => {
    const codes = Object.values(ERR);
    expect(codes.sort()).toEqual(["connection-error", "connection-lost", "deploy-timeout", "load-timeout", "no-webgl", "room-full", "room-not-found", "scene-timeout", "server-unreachable", "unknown"]);
    expect(Object.keys(ERROR_TEXT).sort()).toEqual(codes);
    for (const code of codes) {
      const text = ERROR_TEXT[code];
      expect(text.length, code).toBeGreaterThan(10);
      expect(text, code).toMatch(/\.$/);
      const english = (text.toLowerCase().match(/[\p{L}']+/gu) ?? []).filter((w) => ENGLISH.has(w));
      expect(english, `${code}: ${text}`).toEqual([]);
    }
    // The line the menu shows after a failed join (gallery `menu-error`, §5.2 row 66).
    expect(ERROR_TEXT[ERR.deployTimeout]).toContain("Nie udało się wejść do meczu");
  });

  it("isErrCode knows the codes and nothing else", () => {
    for (const code of Object.values(ERR)) expect(isErrCode(code)).toBe(true);
    expect(isErrCode("Deployment timed out")).toBe(false);
    expect(isErrCode("toString")).toBe(false);
    expect(isErrCode("")).toBe(false);
  });
});

describe("mode copy", () => {
  it("MODE_TITLE covers every GameMode", () => {
    expect(Object.keys(MODE_TITLE).sort()).toEqual([...ALL_MODES].sort());
    for (const m of [...GAME_MODES, "ffa" as const]) {
      const title = MODE_TITLE[m];
      expect(title, m).toBeTruthy();
      expect(title, m).toBe(upperPl(title));
      expect(countWords(title), m).toBeLessThanOrEqual(3);
    }
    expect(MODE_TITLE.tdm).toBe("DRUŻYNOWY DEATHMATCH");
    expect(MODE_TITLE.bomb).toBe("ŁADUNEK");
  });

  it("modeGoal ≤ 5 words for every mode", () => {
    for (const m of ALL_MODES) {
      const goal = modeGoal(m);
      expect(countWords(goal), `${m}: ${goal}`).toBeLessThanOrEqual(5);
      expect(goal, m).toBe(upperPl(goal));
    }
    // The room's own TDM limit, up to its ceiling, still fits.
    expect(countWords(modeGoal("tdm", TDM_SCORE_LIMIT_MAX))).toBeLessThanOrEqual(5);
  });

  it("modeGoal takes its numbers from the rules, not from literals", () => {
    expect(modeGoal("tdm", 55)).toBe("PIERWSI DO 55 ZABÓJSTW");
    expect(modeGoal("tdm")).toBe(`PIERWSI DO ${MODES.tdm.scoreLimit} ZABÓJSTW`);
    expect(modeGoal("ffa")).toBe(`PIERWSZY DO ${MODES.ffa.scoreLimit} ZABÓJSTW`);
    expect(modeGoal("dom")).toBe(`PIERWSI DO ${MODES.dom.scoreLimit} PUNKTÓW`);
    expect(modeGoal("boys")).toBe(`PIERWSI DO ${MODES.boys.scoreLimit} PUNKTÓW`);
    expect(modeGoal("bomb")).toBe(`PODŁÓŻ ALBO ROZBRÓJ · DO ${BOMB.wins}`);
    expect(modeGoal("gungame")).toBe(`ZALICZ ${GUN_GAME.ladder.length} BRONI`);
    expect(modeGoal("ostrzyzeni")).toBe(`UCIEKAJ ALBO GOL · ${OSTRZYZENI.rounds} RUND`);
    expect(modeGoal("duel")).toBe(`DO ${DUEL.wins} WYGRANYCH RUND`);
    expect(modeGoal("turniej")).toBe("WYGRAJ SWOJĄ PARĘ");
  });

  it("SIDE_WORD names every side in one word, and mapTitle names the maps", () => {
    expect(Object.values(SIDE_WORD)).toEqual(["ATAK", "OBRONA", "OCALONY", "OSTRZYŻONY"]);
    expect(mapTitle(DEFAULT_MAP_ID)).toBe("NIGHT DISTRICT");
    expect(mapTitle(DUEL_MAP_ID)).toBe("GÓRA (DACH)");
    expect(mapTitle("")).toBe("");
    expect(mapTitle("no-such-map")).toBe("");
  });
});
