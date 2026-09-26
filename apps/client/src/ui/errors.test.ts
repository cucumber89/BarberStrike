import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, DUEL_MAP_ID, GAME_MODES } from "@frankibarber/shared";
import { ERR, ERROR_TEXT, mapTitle, type ErrCode } from "./hud/copy";
import { errorCode, humanError } from "./errors";
import { pickedMap } from "./Loading";

/**
 * Drop U §5.5 (P7): the menu's error line is always one of the Polish `ERROR_TEXT` sentences.
 * These are the English strings the browser, the socket, Colyseus and our own renderer check
 * actually produce — quoted, not invented — plus the ones today's `Game.ts` still raises.
 */
const NETWORK = [
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "connect ECONNREFUSED 127.0.0.1:2567",
  "getaddrinfo ENOTFOUND game.example",
  "Server did not respond (welcome timeout).",
  "net::ERR_CONNECTION_REFUSED",
];
const FULL = ['room "k3Jd9" is locked', "That room is full."];
const NOT_FOUND = ['room "k3Jd9" not found', "no rooms found with provided criteria", 'room "k3Jd9" has been disposed.'];
const WEBGL = [
  "This game needs WebGL2, and this browser did not provide it. A recent Chrome, Edge or Firefox will have it — and if you are already on one, check that hardware acceleration is switched on in the browser's settings.",
  "WebGPU adapter request failed",
];
/** Messages no rule knows: they must come out as `unknown`, never as themselves. */
const STRAY = [
  "Deployment timeout. Please reconnect.",
  "Scene startup timeout. Try lower graphics settings.",
  "Connection to the server was lost.",
  "Connection error.",
  "Startup cancelled",
  "TypeError: Cannot read properties of undefined (reading 'x')",
  "",
];

/**
 * Forty words that are English and not Polish (so no „to”, „a”, „do”, „no”, „nie”…): any of them
 * in the returned text means an English message leaked through to the menu.
 */
const ENGLISH = [
  "the", "please", "try", "again", "server", "connection", "error", "lost", "failed", "fetch",
  "network", "room", "full", "found", "cannot", "reach", "running", "deployment", "startup", "timeout",
  "loading", "took", "long", "lower", "graphics", "settings", "something", "went", "wrong", "this",
  "that", "browser", "hardware", "acceleration", "enable", "refused", "reconnect", "scene", "game", "unknown",
];
const englishIn = (s: string): string[] => ENGLISH.filter((w) => new RegExp(`(^|[^\\p{L}])${w}($|[^\\p{L}])`, "iu").test(s));

describe("humanError (ui/errors.ts)", () => {
  it("every code maps to its Polish text", () => {
    const codes = Object.values(ERR) as ErrCode[];
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(errorCode(new Error(code)), code).toBe(code);
      expect(humanError(new Error(code)), code).toBe(ERROR_TEXT[code]);
      expect(humanError(code), `${code} as a bare string`).toBe(ERROR_TEXT[code]);
    }
  });

  it("network, full, not-found and WebGL messages map to codes", () => {
    for (const m of NETWORK) expect(errorCode(new Error(m)), m).toBe(ERR.serverUnreachable);
    for (const m of FULL) expect(errorCode(new Error(m)), m).toBe(ERR.roomFull);
    for (const m of NOT_FOUND) expect(errorCode(new Error(m)), m).toBe(ERR.roomNotFound);
    for (const m of WEBGL) expect(errorCode(new Error(m)), m).toBe(ERR.noWebgl);
    // Our own timeouts are codes now; as English they no longer pose as "the server is down".
    expect(errorCode(new Error("Deployment timeout. Please reconnect."))).toBe(ERR.unknown);
    expect(errorCode(new Error("Scene startup timeout. Try lower graphics settings."))).toBe(ERR.unknown);
    // Not an Error at all (a rejected promise can carry anything).
    expect(errorCode(undefined)).toBe(ERR.unknown);
    expect(errorCode({ code: 4000 })).toBe(ERR.unknown);
  });

  it("no returned text contains an English word from a 40-word list", () => {
    expect(ENGLISH).toHaveLength(40);
    expect(new Set(ENGLISH).size).toBe(40);
    // The list does catch English: it is not vacuous.
    expect(englishIn("Deployment timeout. Please reconnect.")).toEqual(["please", "deployment", "timeout", "reconnect"]);
    const inputs = [...Object.values(ERR), ...NETWORK, ...FULL, ...NOT_FOUND, ...WEBGL, ...STRAY];
    for (const m of inputs) {
      const out = humanError(new Error(m));
      expect(Object.values(ERROR_TEXT), m).toContain(out);
      expect(englishIn(out), `${m} → ${out}`).toEqual([]);
    }
  });
});

/**
 * The loading card must not name a map the room will not play (§5.2 #64, audit P7-1): the server puts
 * a duel and a tournament on a 1 v 1 arena — the default unless the lobby asked for the other one
 * (`TdmRoom.ts` `get duel()` → `duelMapOf`, Drop W P1). Here because P7 owns no test file for the
 * loading card, and a wrong card is what the menu then shows as the match's first words.
 */
describe("loading card map", () => {
  it("duel and turniej load the default arena unless GÓRA was picked; other modes keep the menu's map", () => {
    expect(pickedMap("duel", DEFAULT_MAP_ID)).toBe(DUEL_MAP_ID);
    expect(pickedMap("turniej", DEFAULT_MAP_ID)).toBe(DUEL_MAP_ID);
    expect(pickedMap("duel", "no-such-map")).toBe(DUEL_MAP_ID);
    expect(pickedMap("duel", "gora")).toBe("gora");
    expect(pickedMap("turniej", "gora")).toBe("gora");
    expect(mapTitle(pickedMap("duel", DEFAULT_MAP_ID))).toBe("DOLNA");
    expect(mapTitle(pickedMap("duel", "gora"))).toBe("GÓRA (DACH)");
    for (const m of GAME_MODES.filter((g) => g !== "duel" && g !== "turniej")) expect(pickedMap(m, DEFAULT_MAP_ID), m).toBe(DEFAULT_MAP_ID);
    expect(pickedMap(undefined, "")).toBe("");
  });
});
