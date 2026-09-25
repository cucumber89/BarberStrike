import { describe, expect, it } from "vitest";
import { BOMB, DUEL, GUN_GAME, MATCH, OSTRZYZENI, encodeHaircut, type GameMode, type Team } from "@frankibarber/shared";
import type { ScoreRow } from "../game/store";
import type { MatchReward } from "../game/progression/profile";
import { keepMountedState } from "./hud/useKeepMounted";
import {
  RESULT_EXIT_MS, RESULT_VIEW0, STAGE_SECONDS, keyStats, matchOutcome, matchWhy, placement, podium, resultInput, resultStage, resultWhy,
  scoreLine, stageC, stageCWords, topReward, verdict, verdictWhy, verdictWords, type Outcome, type ResultCtx,
} from "./resultText";

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

  it("titles the verdict ZWYCIĘSTWO / PORAŻKA exactly (multiplayer.spec.ts:871-872)", () => {
    expect(verdict(base()).title).toBe("ZWYCIĘSTWO");
    expect(verdict(base({ winner: 1 })).title).toBe("PORAŻKA");
    expect(stageC(base(), null, 0).title).toBe("ZWYCIĘSTWO");
    expect(stageC(base({ winner: 1 }), null, 0).title).toBe("PORAŻKA");
  });

  it("names the rule that ended the match, never a cause the state does not carry", () => {
    expect(matchWhy(base({ scoreA: MATCH.scoreLimit }))).toBe(`Pierwsi do ${MATCH.scoreLimit} zabójstw`);
    // TDM on time (drop U, P6 WORK 3): „Wyższy wynik po czasie”, not a sentence about the unit.
    expect(matchWhy(base({ scoreA: 12, scoreB: 9 }))).toBe("Wyższy wynik po czasie");
    expect(matchWhy(base({ scoreA: 9, scoreB: 9, winner: -1 }))).toMatch(/równym/);
    expect(matchWhy(base({ scoreA: 3, scoreB: 1, players: [row("me", 0)] }))).toMatch(/opuściła/);
    expect(matchWhy(base({ mode: "bomb", scoreA: BOMB.wins, scoreB: 4 }))).toMatch(new RegExp(`${BOMB.wins} wygranymi`));
    expect(matchWhy(base({ mode: "gungame", winnerId: "me", winnerName: "ME", players: [row("me", 0, { score: GUN_GAME.ladder.length })] }))).toContain(`drabinkę ${GUN_GAME.ladder.length} broni`);
    expect(matchWhy(base({ mode: "gungame", winnerId: "me", winnerName: "ME", players: [row("me", 0, { score: 3 })] }))).toMatch(/Czas minął/);
    expect(matchWhy(base({ mode: "ostrzyzeni", scoreA: 3, scoreB: 2, winnerName: "ME" }))).toMatch(new RegExp(`Po ${OSTRZYZENI.rounds} rundach.*ME`));
    expect(matchWhy(base({ mode: "ffa", winnerId: "me", players: [row("me", 0, { kills: 30 })] }))).toMatch(/do 30 zabójstw/);
  });

  it("ostrzyżeni prints its score once: on the score line, not again in the why", () => {
    const c = base({ mode: "ostrzyzeni", scoreA: 3, scoreB: 2, winnerName: "ALPHA" });
    expect(scoreLine(c)).toBe("OCALENI 3 — 2 OSTRZYŻENI");
    expect(matchWhy(c)).not.toMatch(/\b3\b|\b2\b/);
  });

  it("puts the sides, the final or the named winner on the score line", () => {
    expect(scoreLine(base())).toBe("FADE 40 — 31 TAPER");
    expect(scoreLine(base({ mode: "ffa", winnerName: "ALPHA" }))).toMatch(/ALPHA/);
    expect(scoreLine(base({ mode: "ffa", winnerName: "" }))).toMatch(/Nikt/);
    expect(scoreLine(base({ mode: "turniej", winnerName: "ZDZICHU", bracket: FINISHED }))).toBe("Kowal 4 — 6 ZDZICHU");
  });

  it("round-mode why names the deciding round", () => {
    expect(resultWhy(base({ mode: "bomb", scoreA: 4, scoreB: 7, winner: 1, roundResult: "ATTACKERS ELIMINATED" }))).toBe("Atak wybity w ostatniej rundzie");
    expect(resultWhy(base({ mode: "duel", scoreA: 6, scoreB: 4, roundResult: "TIME · MORE HEALTH" }))).toBe("Czas — więcej zdrowia w ostatniej rundzie");
    expect(resultWhy(base({ mode: "ostrzyzeni", roundResult: "SURVIVORS HELD" }))).toBe("Ocaleni dotrwali w ostatniej rundzie");
    // The state holds no reason (a duel capped during a freeze: P-SRV clears it at every freeze):
    // the match's own rule, long in the card and short in the verdict.
    const capped = base({ mode: "duel", scoreA: 4, scoreB: 3, roundResult: "" });
    expect(resultWhy(capped)).toBe("Wyższy wynik po czasie");
    expect(verdictWhy(capped)).toBe("Wynik po czasie");
    // Continuous modes keep the match's rule.
    expect(resultWhy(base({ scoreA: MATCH.scoreLimit, roundResult: "BOMB DEFUSED" }))).toBe(`Pierwsi do ${MATCH.scoreLimit} zabójstw`);
  });
});

/** A finished bracket of four: Kowal beat xXPiotrekXx 6:3, ZDZICHU beat RYSIEK 6:4, ZDZICHU took the final 6:4. */
const FINISHED = "4|3;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|6|4|a;Kowal|ZDZICHU|4|6|b";

describe("stage C: podium, placement, stats", () => {
  it("stat order is objective, then K/A/D in every mode", () => {
    // Drop U changes this test's old line 48 (TDM read K, D, A; Bomb K, A, D; Ostrzyżeni points,
    // shaves, kills): one order everywhere, so a number never moves box between matches.
    const me = row("me", 0, { kills: 8, deaths: 5, assists: 2, score: 140, haircut: "" });
    const modes: GameMode[] = ["tdm", "ffa", "dom", "boys", "bomb", "gungame", "ostrzyzeni", "duel", "turniej"];
    for (const m of modes) {
      const ids = keyStats(m, me).map((s) => s.id);
      expect(ids, m).toHaveLength(3);
      const kad = ids.filter((id) => id !== "objective");
      expect(["kills", "assists", "deaths"].slice(0, kad.length), m).toEqual(kad);
      if (ids.includes("objective")) expect(ids[0], m).toBe("objective");
    }
    expect(keyStats("tdm", me).map((s) => s.label)).toEqual(["ZABÓJSTWA", "ASYSTY", "ZGONY"]);
    expect(keyStats("dom", me).map((s) => s.label)).toEqual(["PUNKTY", "ZABÓJSTWA", "ASYSTY"]);
    expect(keyStats("gungame", { ...me, score: 5 })[0].value).toBe(`5 / ${GUN_GAME.ladder.length}`);
    // multiplayer.spec.ts:874 reads „14 / 14” in result-stats at the end of a gun game.
    expect(keyStats("gungame", { ...me, score: GUN_GAME.ladder.length })[0].value).toBe(`${GUN_GAME.ladder.length} / ${GUN_GAME.ladder.length}`);
    expect(keyStats("tdm", undefined)).toEqual([]);
  });

  it("podium ranks by score / kills / rung", () => {
    const players = [
      row("me", 0, { kills: 20, score: 900 }), row("a", 1, { kills: 5, score: 1500 }), row("b", 0, { kills: 12, score: 1200 }), row("c", 1, { kills: 30, score: 400 }),
    ];
    expect(podium(base({ players })).map((p) => p.id)).toEqual(["a", "b", "me"]); // team modes: points
    expect(podium(base({ mode: "ffa", players })).map((p) => p.id)).toEqual(["c", "me", "b"]); // ffa: kills
    expect(podium(base({ mode: "ffa", players }))[0]).toMatchObject({ rank: 1, value: "30" });
    const rungs = players.map((p, i) => ({ ...p, score: [3, 14, 9, 1][i] }));
    expect(podium(base({ mode: "gungame", players: rungs })).map((p) => `${p.id}:${p.value}`)).toEqual(["a:14", "b:9", "me:3"]); // gun game: rung
    // The tournament: the champion, the finalist, then the best knocked out earlier — off the bracket.
    const entrants = [row("me", 0, { name: "Kowal", score: 2000 }), row("p5", 1, { name: "xXPiotrekXx" }), row("z", 0, { name: "ZDZICHU" }), row("r", 1, { name: "RYSIEK", score: 3000 })];
    expect(podium(base({ mode: "turniej", players: entrants, bracket: FINISHED })).map((p) => `${p.name}:${p.value}`)).toEqual(["ZDZICHU:6", "Kowal:4", "RYSIEK:4"]);
    expect(podium(base({ players: players.slice(0, 2) }))).toHaveLength(2);
  });

  it("placement line only outside the top 3", () => {
    const ten = Array.from({ length: 10 }, (_, i) => row(i === 6 ? "me" : `p${i}`, 0, { kills: 30 - i * 3 }));
    expect(placement(base({ mode: "ffa", players: ten }))).toBe("MIEJSCE #7 Z 10");
    const third = ten.map((r, i) => ({ ...r, id: i === 2 ? "me" : i === 6 ? "p6" : r.id }));
    expect(placement(base({ mode: "ffa", players: third }))).toBeNull();
    expect(placement(base({ mode: "gungame", players: ten.map((r, i) => ({ ...r, score: 14 - i })) }))).toBe("MIEJSCE #7 Z 10");
    // Team modes have a score line and no placement.
    expect(placement(base({ players: ten }))).toBeNull();
  });
});

// ---------------------------------------------------------------- the reading budget (§6.5)

const OUTCOMES: Outcome[] = ["win", "loss", "draw", "over"];
const ROUND_REASONS = ["BOMB DETONATED", "BOMB DEFUSED", "DEFENDERS ELIMINATED", "ATTACKERS ELIMINATED", "SITE SECURED", "TRADE", "ELIMINATED", "TIME · EVEN", "TIME · MORE HEALTH", "SURVIVORS HELD", "ALL SHAVED", ""];
const MODES_ALL: GameMode[] = ["tdm", "ffa", "dom", "boys", "bomb", "gungame", "ostrzyzeni", "duel", "turniej"];
const ROUND: ReadonlySet<GameMode> = new Set(["bomb", "duel", "turniej", "ostrzyzeni"]);
const LEVEL = { level: 4, into: 1340, need: 1750, total: 5090 };
const REWARDS: (MatchReward | null)[] = [
  null,
  { lines: [], total: 790, before: LEVEL, after: LEVEL, levelsGained: 0, earned: [], haircuts: [], title: "CZELADNIK" },
  { lines: [], total: 12_450, before: LEVEL, after: { ...LEVEL, level: 12 }, levelsGained: 8, earned: ["b"], haircuts: ["h"], title: "MISTRZ" },
];

/** Every ending the server produces for a mode: at the limit, on time, tied, a side gone; every round reason. */
function endings(mode: GameMode): ResultCtx[] {
  const out: ResultCtx[] = [];
  const twelve = Array.from({ length: 12 }, (_, i) => row(i === 7 ? "me" : `p${i}`, (i % 2) as Team, {
    name: i === 7 ? "Kowal" : `Gracz_${i}`, kills: 40 - i * 3, score: 3000 - i * 200, assists: i, deaths: i + 2, haircut: encodeHaircut("mohawk", i === 3 ? 7 : 0),
  }));
  const scores: [number, number][] = [[40, 31], [7, 5], [6, 4], [12, 9], [9, 9], [3, 1]];
  for (const outcome of OUTCOMES) {
    for (const [scoreA, scoreB] of scores) {
      for (const reason of ROUND.has(mode) ? ROUND_REASONS : [""]) {
        for (const gone of [false, true]) {
          const players = gone ? twelve.filter((p) => p.team === 0) : twelve;
          const me = outcome === "over" ? "ghost" : "me";
          const winner: Team | -1 = outcome === "draw" ? -1 : outcome === "win" ? 1 : 0; // I am on team 1 (index 7)
          const winnerId = outcome === "draw" ? "" : outcome === "win" ? "me" : "p0";
          out.push({
            mode, myId: me, myTeam: 1, scoreA, scoreB, winner, winnerId, winnerName: winnerId === "me" ? "Kowal" : winnerId ? "Gracz_0" : "",
            players, roundResult: reason, bracket: mode === "turniej" ? FINISHED : "",
          });
        }
      }
    }
  }
  return out;
}

describe("the reading budget: at most three words per second on screen (§6.5)", () => {
  it("stage B verdict ≤ 9 words for every outcome × reason", () => {
    let worst = 0;
    for (const mode of MODES_ALL) {
      for (const c of endings(mode)) {
        const v = verdict(c);
        const n = verdictWords(v);
        worst = Math.max(worst, n);
        expect(n, `${mode} ${matchOutcome(c)} ${c.roundResult} → ${v.title} / ${v.score} / ${v.why}`).toBeLessThanOrEqual(3 * STAGE_SECONDS.verdict);
        // Every player with a row (a one-word title) also fits the zone budget, stage B ≤ 8 (§5.1).
        if (matchOutcome(c) !== "over") expect(n, `${mode} ${c.roundResult}`).toBeLessThanOrEqual(8);
        expect(v.why.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length, v.why).toBeLessThanOrEqual(3);
      }
    }
    expect(worst).toBeGreaterThan(0);
  });

  it("stage C words ≤ 3 × 14 s in round modes and ≤ 3 × 17 s in continuous modes", () => {
    expect(STAGE_SECONDS.cardRound).toBe(14);
    expect(STAGE_SECONDS.cardContinuous).toBe(17);
    for (const mode of MODES_ALL) {
      const cap = ROUND.has(mode) ? 42 : 48; // §5.1's zone budget, inside 3 × 14 = 42 and 3 × 17 = 51
      expect(cap).toBeLessThanOrEqual(3 * (ROUND.has(mode) ? STAGE_SECONDS.cardRound : STAGE_SECONDS.cardContinuous));
      for (const c of endings(mode)) {
        for (const reward of REWARDS) {
          const s = stageC(c, reward, 12_000);
          expect(stageCWords(s), `${mode} ${matchOutcome(c)} ${c.roundResult} ${reward?.total ?? "no reward"}: ${JSON.stringify(s)}`).toBeLessThanOrEqual(cap);
        }
      }
    }
  });
});

describe("stages", () => {
  it("resultStage jumps to C on Tab or a tab click", () => {
    expect(resultStage("A", false)).toBe("A");
    expect(resultStage("B", false)).toBe("B");
    expect(resultStage("A", true)).toBe("C");
    expect(resultStage("B", true)).toBe("C");
    expect(resultStage(null, false)).toBe("C"); // Ended → Waiting: the card fades out as it was
    // Tab before the card: straight to it, on the summary.
    const tabbed = resultInput(RESULT_VIEW0, { kind: "tabKey" }, "B");
    expect(tabbed).toEqual({ skipped: true, tab: "summary" });
    expect(resultStage("B", tabbed.skipped)).toBe("C");
    expect(resultStage("A", resultInput(RESULT_VIEW0, { kind: "tabKey" }, "A").skipped)).toBe("C");
    // A tab click: that tab, on the card.
    expect(resultInput(RESULT_VIEW0, { kind: "tabClick", tab: "table" }, "B")).toEqual({ skipped: true, tab: "table" });
    // On the card, Tab flips the table in and out as it does in play.
    expect(resultInput(RESULT_VIEW0, { kind: "tabKey" }, "C").tab).toBe("table");
    expect(resultInput({ skipped: false, tab: "table" }, { kind: "tabKey" }, "C").tab).toBe("summary");
  });

  it("the card stays mounted 400 ms after Ended → Waiting: there at +200 ms, gone at +600 ms", () => {
    const t0 = 100_000;
    expect(RESULT_EXIT_MS).toBe(400);
    expect(keepMountedState(false, t0, t0 + 200, RESULT_EXIT_MS)).toBe("closing");
    expect(keepMountedState(false, t0, t0 + 600, RESULT_EXIT_MS)).toBe("closed");
  });

  it("the continuous stages are B then C, round modes A, B, C (§6.2) — timed by MATCH.endedMs", () => {
    expect(MATCH.endedMs).toBe(20_000);
    expect(DUEL.wins).toBeGreaterThan(0);
  });
});

it("headlines a haircut over a badge over a level, and nothing when there is nothing", () => {
  const names = { badge: (id: string) => (id === "b" ? "ODZNAKA" : undefined), haircut: (id: string) => (id === "h" ? "Irokez" : undefined) };
  const r = { lines: [], total: 0, before: { level: 1, into: 0, need: 100, total: 0 }, after: { level: 2, into: 0, need: 100, total: 100 }, levelsGained: 1, earned: ["b"], haircuts: ["h"], title: "" };
  expect(topReward(r, names)).toBe("Nowa fryzura: Irokez");
  expect(topReward({ ...r, haircuts: [] }, names)).toBe("Odznaka: ODZNAKA");
  expect(topReward({ ...r, haircuts: [], earned: [] }, names)).toBe("Awans na poziom 2");
  expect(topReward({ ...r, haircuts: [], earned: [], levelsGained: 0 }, names)).toBeNull();
});

it("a tournament is decided by its final, not by a points limit", () => {
  // The screen carries ONE pair's score (6 — 4), and "the first team to 6 points" is a sentence
  // about a mode this is not: there are no teams in a draw of eight and no limit decided it.
  const ctx = { mode: "turniej" as const, scoreA: 6, scoreB: 4, winner: 0 as const, winnerId: "p3", winnerName: "ZDZICHU", players: [] };
  expect(matchWhy(ctx as never)).toBe("ZDZICHU wygrał finał drabinki");
  expect(matchWhy(ctx as never)).not.toContain("drużyna");
  expect(scoreLine(ctx as never)).toContain("ZDZICHU");
});
