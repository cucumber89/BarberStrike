import { describe, expect, it } from "vitest";
import { BOMB, GUN_GAME, MATCH, OSTRZYZENI } from "@frankibarber/shared";
import type { ScoreRow } from "../game/store";
import { keyStats, matchOutcome, matchWhy, scoreLine, topReward, type ResultCtx } from "./resultText";

const row = (id: string, team: 0 | 1, over: Partial<ScoreRow> = {}): ScoreRow => ({
  id, name: id.toUpperCase(), team, kills: 0, deaths: 0, assists: 0, score: 0, ping: 20, alive: true, connected: true, money: 0, bot: false, shaved: false, haircut: "", ...over,
});
const base = (over: Partial<ResultCtx> = {}): ResultCtx => ({
  mode: "tdm", winner: 0, winnerId: "", winnerName: "", myId: "me", myTeam: 0, scoreA: 40, scoreB: 31,
  players: [row("me", 0, { kills: 8, deaths: 5, assists: 2 }), row("foe", 1, { kills: 6 })], ...over,
});

describe("match outcome and why", () => {
  it("reads the outcome from the local seat: team modes by side, player modes by id, watchers get 'over'", () => {
    expect(matchOutcome(base())).toBe("win");
    expect(matchOutcome(base({ winner: 1 }))).toBe("loss");
    expect(matchOutcome(base({ winner: -1 }))).toBe("draw");
    expect(matchOutcome(base({ myId: "ghost" }))).toBe("over");
    expect(matchOutcome(base({ mode: "ffa", winnerId: "me" }))).toBe("win");
    expect(matchOutcome(base({ mode: "ffa", winnerId: "foe" }))).toBe("loss");
    expect(matchOutcome(base({ mode: "ffa", winnerId: "" }))).toBe("draw");
    // Ostrzyżeni names a player even though it has sides — the same rule the profile uses.
    expect(matchOutcome(base({ mode: "ostrzyzeni", winner: 1, myTeam: 0, winnerId: "me" }))).toBe("win");
  });

  it("names the rule that ended the match, never a cause the state does not carry", () => {
    expect(matchWhy(base({ scoreA: MATCH.scoreLimit }))).toMatch(new RegExp(`do ${MATCH.scoreLimit} zabójstw`));
    expect(matchWhy(base({ scoreA: 12, scoreB: 9 }))).toMatch(/Czas minął/);
    expect(matchWhy(base({ scoreA: 9, scoreB: 9, winner: -1 }))).toMatch(/równym/);
    expect(matchWhy(base({ scoreA: 3, scoreB: 1, players: [row("me", 0)] }))).toMatch(/opuściła/);
    expect(matchWhy(base({ mode: "bomb", scoreA: BOMB.wins, scoreB: 4 }))).toMatch(new RegExp(`${BOMB.wins} wygranymi`));
    expect(matchWhy(base({ mode: "gungame", winnerId: "me", winnerName: "ME", players: [row("me", 0, { score: GUN_GAME.ladder.length })] }))).toMatch(/drabinkę/);
    expect(matchWhy(base({ mode: "gungame", winnerId: "me", winnerName: "ME", players: [row("me", 0, { score: 3 })] }))).toMatch(/Czas minął/);
    expect(matchWhy(base({ mode: "ostrzyzeni", scoreA: 3, scoreB: 2, winnerName: "ME" }))).toMatch(new RegExp(`Po ${OSTRZYZENI.rounds} rundach.*ME`));
    expect(matchWhy(base({ mode: "ffa", winnerId: "me", players: [row("me", 0, { kills: 30 })] }))).toMatch(/do 30 zabójstw/);
  });

  it("puts the sides or the named winner on the score line", () => {
    expect(scoreLine(base())).toBe("FADE 40 — 31 TAPER");
    expect(scoreLine(base({ mode: "ffa", winnerName: "ALPHA" }))).toMatch(/ALPHA/);
    expect(scoreLine(base({ mode: "ffa", winnerName: "" }))).toMatch(/Nikt/);
    expect(scoreLine(base({ mode: "ostrzyzeni", scoreA: 3, scoreB: 2, winnerName: "ALPHA" }))).toMatch(/OCALENI 3 — 2 OSTRZYŻENI · ALPHA/);
  });

  it("picks three stats that fit the mode, with the objective ahead of kills where there is one", () => {
    const me = row("me", 0, { kills: 8, deaths: 5, assists: 2, score: 140, haircut: "" });
    expect(keyStats("tdm", me).map((s) => s.label)).toEqual(["Zabójstwa", "Zgony", "Asysty"]);
    expect(keyStats("dom", me).map((s) => s.label)).toEqual(["Punkty", "Zabójstwa", "Asysty"]);
    expect(keyStats("gungame", { ...me, score: 5 })[0].value).toBe(`5 / ${GUN_GAME.ladder.length}`);
    expect(keyStats("ostrzyzeni", me).map((s) => s.label)).toContain("Razy ogolony");
    expect(keyStats("tdm", undefined)).toEqual([]);
  });

  it("headlines a haircut over a badge over a level, and nothing when there is nothing", () => {
    const names = { badge: (id: string) => (id === "b" ? "ODZNAKA" : undefined), haircut: (id: string) => (id === "h" ? "Irokez" : undefined) };
    const r = { lines: [], total: 0, before: { level: 1, into: 0, need: 100, total: 0 }, after: { level: 2, into: 0, need: 100, total: 100 }, levelsGained: 1, earned: ["b"], haircuts: ["h"], title: "" };
    expect(topReward(r, names)).toBe("Nowa fryzura: Irokez");
    expect(topReward({ ...r, haircuts: [] }, names)).toBe("Odznaka: ODZNAKA");
    expect(topReward({ ...r, haircuts: [], earned: [] }, names)).toBe("Awans na poziom 2");
    expect(topReward({ ...r, haircuts: [], earned: [], levelsGained: 0 }, names)).toBeNull();
  });
});

it("a tournament is decided by its final, not by a points limit", () => {
  // The screen carries ONE pair's score (6 — 4), and "the first team to 6 points" is a sentence
  // about a mode this is not: there are no teams in a draw of eight and no limit decided it.
  const ctx = { mode: "turniej" as const, scoreA: 6, scoreB: 4, winner: 0 as const, winnerId: "p3", winnerName: "ZDZICHU", players: [] };
  expect(matchWhy(ctx as never)).toBe("ZDZICHU wygrał finał drabinki");
  expect(matchWhy(ctx as never)).not.toContain("drużyna");
  expect(scoreLine(ctx as never)).toContain("ZDZICHU");
});
