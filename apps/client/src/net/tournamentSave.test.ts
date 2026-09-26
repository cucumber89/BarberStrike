import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bracketString, mulberry32, reportWinner, seedBracket } from "@frankibarber/shared";
import { loadProfile } from "../game/progression/profile";
import { championName, recordFromBracket, saveTournamentRecord } from "./tournamentSave";

/**
 * Tournament save (drop V, P7), client half: does a finished bracket become a `TournamentRecord` on
 * the profile's shelf, exactly once? Runs in node, so — like the profile suite — it hands the module a
 * memory-backed `localStorage` to write to.
 */

function memoryStorage(): Map<string, string> {
  const mem = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
    };
  });
  afterAll(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });
  beforeEach(() => mem.clear());
  return mem;
}

/** A finished 4-player bracket string where the entrant named `winnerName` wins it all. */
function finishedBracketString(names: string[], winnerId: string): string {
  const ids = names.map((_, i) => `p${i + 1}`);
  let b = seedBracket(ids.map((id, i) => ({ id, name: names[i] })), 4, mulberry32(1));
  let guard = 0;
  while (b.at < b.matches.length && guard++ < 20) {
    const m = b.matches[b.at];
    const through = m.a === winnerId || m.b === winnerId ? winnerId : m.a || m.b;
    b = reportWinner(b, through, 6, 0);
  }
  return bracketString(b);
}

describe("championName", () => {
  it("names the winner of a finished bracket", () => {
    const s = finishedBracketString(["Franki", "Bot", "C", "D"], "p1");
    expect(championName(s)).toBe("Franki");
  });

  it("is empty while the bracket is still being played", () => {
    const b = seedBracket([{ id: "p1", name: "A" }, { id: "p2", name: "B" }], 4, mulberry32(1));
    expect(championName(bracketString(b))).toBe("");
  });
});

describe("recordFromBracket", () => {
  it("carries the size and the champion nick", () => {
    const s = finishedBracketString(["Franki", "B", "C", "D"], "p1");
    const rec = recordFromBracket(s, "t1", 1_700_000_000_000);
    expect(rec).not.toBeNull();
    expect(rec!.size).toBe(4);
    expect(rec!.winner).toBe("Franki");
    expect(rec!.endedAt).toBe(1_700_000_000_000);
    expect(rec!.id).toBe("t1");
  });

  it("is null for an undecided bracket", () => {
    const b = seedBracket([{ id: "p1", name: "A" }, { id: "p2", name: "B" }], 4, mulberry32(1));
    expect(recordFromBracket(bracketString(b), "t1")).toBeNull();
  });
});

describe("saveTournamentRecord", () => {
  memoryStorage();

  it("appends one record to the profile shelf", () => {
    expect(loadProfile().tournaments.length).toBe(0);
    saveTournamentRecord({ id: "t1", endedAt: 1, size: 4, winner: "Franki" });
    const after = loadProfile();
    expect(after.tournaments.length).toBe(1);
    expect(after.tournaments[0].winner).toBe("Franki");
  });

  it("does not duplicate a record with the same id", () => {
    saveTournamentRecord({ id: "same", endedAt: 1, size: 4, winner: "A" });
    saveTournamentRecord({ id: "same", endedAt: 2, size: 8, winner: "A" });
    expect(loadProfile().tournaments.length).toBe(1);
  });

  it("keeps distinct records", () => {
    saveTournamentRecord({ id: "a", endedAt: 1, size: 4, winner: "A" });
    saveTournamentRecord({ id: "b", endedAt: 2, size: 8, winner: "B" });
    expect(loadProfile().tournaments.length).toBe(2);
  });
});
