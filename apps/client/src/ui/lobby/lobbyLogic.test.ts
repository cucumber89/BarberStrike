import { describe, expect, it } from "vitest";
import { bracketString, mulberry32, reportWinner, currentMatch, seedBracket, TOURNAMENT_SIZES } from "@frankibarber/shared";
import type { EntrantShape } from "@frankibarber/shared";
import {
  amReady, canStart, isHost, isLobbySize, LOBBY_SIZES, matchStage, readyCount,
  rosterSummary, selfEntrant, warmupOptions, watchRows,
} from "./lobbyLogic";

const ent = (id: string, ready = false, seat = 0): EntrantShape =>
  ({ id, name: id.toUpperCase(), ready, connected: true, seat });

describe("the sizes a host may pick (D5)", () => {
  it("is exactly the shared list, 4 / 8 / 16 / 32", () => {
    expect(LOBBY_SIZES).toEqual(TOURNAMENT_SIZES);
    expect([...LOBBY_SIZES]).toEqual([4, 8, 16, 32]);
  });

  it("guards a size read from a URL or storage", () => {
    for (const n of [4, 8, 16, 32]) expect(isLobbySize(n)).toBe(true);
    for (const n of [0, 2, 5, 7, 64, -8, NaN]) expect(isLobbySize(n)).toBe(false);
  });
});

describe("readiness and the START gate", () => {
  it("counts only the ready entrants", () => {
    expect(readyCount([ent("a", true), ent("b"), ent("c", true)])).toBe(2);
    expect(readyCount([])).toBe(0);
  });

  it("START is the host's alone, and only at two ready in the waiting room", () => {
    const roster = [ent("host", true), ent("b", true)];
    expect(canStart({ selfId: "host", hostId: "host", phase: "poczekalnia", entrants: roster })).toBe(true);
    // not the host
    expect(canStart({ selfId: "b", hostId: "host", phase: "poczekalnia", entrants: roster })).toBe(false);
    // fewer than two ready
    expect(canStart({ selfId: "host", hostId: "host", phase: "poczekalnia", entrants: [ent("host", true), ent("b")] })).toBe(false);
    // the tournament already started
    expect(canStart({ selfId: "host", hostId: "host", phase: "trwa", entrants: roster })).toBe(false);
    // no host id yet
    expect(canStart({ selfId: "", hostId: "", phase: "poczekalnia", entrants: roster })).toBe(false);
  });

  it("knows the host and reads my own ready state", () => {
    expect(isHost("x", "x")).toBe(true);
    expect(isHost("x", "y")).toBe(false);
    expect(isHost("", "")).toBe(false);
    const roster = [ent("me", true), ent("you")];
    expect(selfEntrant(roster, "me")?.name).toBe("ME");
    expect(amReady(roster, "me")).toBe(true);
    expect(amReady(roster, "you")).toBe(false);
    expect(amReady(roster, "ghost")).toBe(false);
  });
});

describe("the OGLĄDAJ list pairs arenas with bracket names", () => {
  const four = () => seedBracket(["ALFA", "BRAVO", "CEZAR", "DAWID"].map((n, i) => ({ id: `p${i}`, name: n })), 4, mulberry32(3));

  it("names each live arena by its pair, in match order", () => {
    const b = four();
    const s = bracketString(b);
    const m = b.matches[0];
    const rows = watchRows(s, [
      { matchIndex: 1, roomId: "r1", live: true },
      { matchIndex: 0, roomId: "r0", live: true },
    ]);
    expect(rows.map((r) => r.matchIndex)).toEqual([0, 1]);
    expect(rows[0].roomId).toBe("r0");
    expect(rows[0].label).toBe(`${b.names[m.a]} vs ${b.names[m.b]}`);
  });

  it("falls back to the round name when a slot has no pair yet, and empty bracket is safe", () => {
    const b = four();
    // The final's slot (index 2) has no names until the semis resolve.
    expect(matchStage(bracketString(b), 2)).toBe("FINAŁ");
    expect(matchStage(bracketString(b), 0)).toBe("PÓŁFINAŁ");
    expect(matchStage("", 0)).toBe("");
    const rows = watchRows(bracketString(b), [{ matchIndex: 2, roomId: "rf", live: false }]);
    expect(rows[0].label).toBe("FINAŁ");
    expect(watchRows("", [])).toEqual([]);
  });

  it("keeps naming a decided pair, so a finished arena still reads right", () => {
    let b = four();
    b = reportWinner(b, currentMatch(b)!.a, 6, 2);
    const rows = watchRows(bracketString(b), [{ matchIndex: 0, roomId: "r0", live: false }]);
    expect(rows[0].label).toContain(" vs ");
  });
});

describe("warmup and the roster summary", () => {
  it("warmup is a one-bot duel create, never a tournament arena (D9)", () => {
    expect(warmupOptions()).toEqual({ mode: "create", gameMode: "duel", bots: 1 });
  });

  it("summarises the roster against the draw size", () => {
    expect(rosterSummary([ent("a", true), ent("b")], 8)).toBe("2 / 8 · 1 gotowych");
    expect(rosterSummary([], 4)).toBe("0 / 4 · 0 gotowych");
    // a bad size falls back to the hard cap rather than printing junk
    expect(rosterSummary([ent("a")], 7)).toBe("1 / 32 · 0 gotowych");
  });
});
