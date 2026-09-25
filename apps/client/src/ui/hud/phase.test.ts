import { describe, expect, it } from "vitest";
import { BOMB, DUEL, MATCH, MatchPhase, OSTRZYZENI, type BombData, type Team } from "@frankibarber/shared";
import { initialHud, type HudState, type ScoreRow } from "../../game/store";
import { NO_OBS, clockMs, createPhaseTracker, derivePhase, endedStage, observePhase, stripSides, urgent, type PhaseModel } from "./phase";

const NOW = 1_000_000;
const st = (over: Partial<HudState>): HudState => ({ ...initialHud, serverNow: NOW, ...over });
const bomb = (over: Partial<BombData> = {}): BombData => ({
  round: 1, attackTeam: 0, stage: "buy", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0, actor: "", progress: 0, result: "", ...over,
});
const row = (id: string, team: Team, alive = true): ScoreRow => ({
  id, name: id, team, kills: 0, deaths: 0, assists: 0, score: 0, ping: 20, alive, connected: true, money: 0, bot: false, shaved: false, haircut: "",
});
/** A 4-player bracket string as the server writes it (`bracketString`), with the pair at `at`. */
const bracket = (at: number): string => `4|${at};Kowal|Rysiek|0|0|-;Zdzichu|Kasia|0|0|-;||0|0|-`;
/** Feed a sequence of states through one tracker, as the hook does, and return the last model. */
const run = (...states: HudState[]): PhaseModel => {
  const t = createPhaseTracker();
  let m!: PhaseModel;
  for (const s of states) m = t.read(s);
  return m;
};

describe("clocks", () => {
  it("duel/turniej clock is the round clock, never DUEL.matchMs", () => {
    for (const mode of ["duel", "turniej"] as const) {
      const live = derivePhase(st({ mode, phase: MatchPhase.Playing, phaseEndsAt: NOW + 42_000, matchEndsAt: NOW + DUEL.matchMs, players: [row("a", 0), row("b", 1)], bracket: bracket(0) }));
      expect(live.clockKind, mode).toBe("round");
      expect(live.clockEndsAt, mode).toBe(NOW + 42_000);
      expect(clockMs(live, NOW), mode).toBe(42_000);
      const freeze = derivePhase(st({ mode, phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, matchEndsAt: NOW + DUEL.matchMs, players: [row("a", 0), row("b", 1)], bracket: bracket(0) }));
      expect(freeze.clockKind, mode).toBe("freeze");
      expect(freeze.clockEndsAt, mode).toBe(NOW + 12_000);
    }
  });

  it("ostrzyżeni clock is the round clock, never the backstop", () => {
    const m = derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Playing, phaseEndsAt: NOW + OSTRZYZENI.roundMs, matchEndsAt: NOW + 575_000 }));
    expect(m.clockKind).toBe("round");
    expect(m.clockEndsAt).toBe(NOW + OSTRZYZENI.roundMs);
  });

  it("bomb Prep shows the freeze, not 30:00", () => {
    const m = derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, matchEndsAt: NOW + 30 * 60_000, bomb: bomb({ round: 5, stage: "buy" }) }));
    expect(m.moment).toBe("freeze");
    expect(m.clockKind).toBe("freeze");
    expect(clockMs(m, NOW)).toBe(12_000);
    // Live, before the plant: the round's own clock, again never the match backstop.
    const live = derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, phaseEndsAt: NOW + 5_000, matchEndsAt: NOW + 30 * 60_000, bomb: bomb({ round: 5, stage: "carried", roundEndsAt: NOW + 71_000 }) }));
    expect(live.clockKind).toBe("round");
    expect(live.clockEndsAt).toBe(NOW + 71_000);
  });

  it("planted → clockKind bomb with bomb.endsAt", () => {
    const m = derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ round: 5, stage: "planted", site: "A", endsAt: NOW + 28_000, roundEndsAt: NOW + 50_000 }) }));
    expect(m.clockKind).toBe("bomb");
    expect(m.clockEndsAt).toBe(NOW + 28_000);
  });

  it("urgent: round ≤ 10 s, match ≤ 30 s", () => {
    const round = derivePhase(st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 60_000 }));
    expect(urgent(round, NOW + 49_999)).toBe(false);
    expect(urgent(round, NOW + 50_000)).toBe(true);
    expect(urgent(round, NOW + 60_000)).toBe(false); // over: nothing left to hurry for
    const fuse = derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ stage: "planted", endsAt: NOW + 40_000 }) }));
    expect(urgent(fuse, NOW + 29_000)).toBe(false);
    expect(urgent(fuse, NOW + 30_000)).toBe(true);
    const match = derivePhase(st({ mode: "tdm", phase: MatchPhase.Playing, matchEndsAt: NOW + 120_000 }));
    expect(match.clockKind).toBe("match");
    expect(urgent(match, NOW + 89_999)).toBe(false);
    expect(urgent(match, NOW + 90_000)).toBe(true);
    // A freeze and a break are never "urgent", however little is left.
    const freeze = derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 2_000 }));
    expect(urgent(freeze, NOW)).toBe(false);
  });

  it("warm-up shows the word, the countdown its deadline, Ended nothing", () => {
    expect(derivePhase(st({ mode: "tdm", phase: MatchPhase.Waiting })).clockKind).toBe("warmup");
    const cd = derivePhase(st({ mode: "tdm", phase: MatchPhase.Countdown, phaseEndsAt: NOW + 3_000 }));
    expect([cd.moment, cd.clockKind, cd.clockEndsAt]).toEqual(["countdown", "countdown", NOW + 3_000]);
    const end = derivePhase(st({ mode: "tdm", phase: MatchPhase.Ended, phaseEndsAt: NOW + 5_000 }));
    expect([end.moment, end.clockKind, clockMs(end, NOW)]).toEqual(["ended", "none", 0]);
    // A TDM wave's Prep is a freeze with its own countdown (§5.2 row 6), not a break.
    const wave = run(st({ mode: "tdm", phase: MatchPhase.Playing, matchEndsAt: NOW + 200_000 }), st({ mode: "tdm", phase: MatchPhase.Prep, phaseEndsAt: NOW + 3_000, matchEndsAt: NOW + 200_000 }));
    expect([wave.moment, wave.clockKind, wave.clockEndsAt, wave.inBreak]).toEqual(["freeze", "freeze", NOW + 3_000, false]);
  });
});

describe("breaks", () => {
  it("break from the observed Playing→Prep edge", () => {
    const live = st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 30_000, round: 1 });
    // The break: the Prep that edge opened. The reason may be empty (P-SRV clears it only later).
    const brk = st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + DUEL.breakMs, round: 2, roundResult: "" });
    const m = run(live, brk);
    expect([m.moment, m.inBreak, m.breakSource, m.clockKind, m.clockEndsAt]).toEqual(["break", true, "edge", "break", NOW + DUEL.breakMs]);
    // The freeze that follows is still Prep, with a new deadline: no longer the break.
    const freeze = st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + DUEL.breakMs + DUEL.prepMs, round: 2, roundResult: "ELIMINATED" });
    const f = run(live, brk, freeze);
    expect([f.moment, f.inBreak, f.breakSource, f.clockKind]).toEqual(["freeze", false, null, "freeze"]);
    // The same in bomb: resolved → buy inside one Prep.
    const b = run(
      st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ round: 3, stage: "carried" }) }),
      st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + BOMB.breakMs, bomb: bomb({ round: 3, stage: "resolved", result: "BOMB DEFUSED" }) }),
    );
    expect([b.moment, b.breakSource]).toEqual(["break", "edge"]);
  });

  it("break fallback after a rejoin: bomb resolved / duel Prep with result", () => {
    // Mounted in the middle of the break: no edge was ever seen, so the state's own signs decide.
    const b = derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 3_000, bomb: bomb({ round: 4, stage: "resolved", result: "BOMB DETONATED" }) }));
    expect([b.moment, b.inBreak, b.breakSource]).toEqual(["break", true, "fallback"]);
    const bf = derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, bomb: bomb({ round: 5, stage: "buy" }) }));
    expect([bf.moment, bf.inBreak]).toEqual(["freeze", false]);
    const d = derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 3_000, round: 2, roundResult: "ELIMINATED" }));
    expect([d.moment, d.inBreak, d.breakSource]).toEqual(["break", true, "fallback"]);
    const o = derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: NOW + 3_000, round: 2, roundResult: "ALL SHAVED" }));
    expect([o.moment, o.breakSource]).toEqual(["break", "fallback"]);
    // A reconnect is a rejoin too: the observation starts over, so the fallback applies again.
    const t = createPhaseTracker();
    t.read(st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 30_000 }));
    t.read(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 1_000, round: 1, roundResult: "ELIMINATED" }));
    expect(t.obs().edgeSeen).toBe(true);
    t.read(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 1_000, round: 1, roundResult: "ELIMINATED", reconnecting: true }));
    const back = t.read(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 90_000, round: 3, roundResult: "TRADE" }));
    expect(t.obs().edgeSeen).toBe(false);
    expect([back.moment, back.breakSource]).toEqual(["break", "fallback"]);
  });

  it("fallback against P-SRV's break signal: a reason through every break, empty through every freeze", () => {
    // P-SRV (TdmRoom `beginDuelRound` / `beginInfectionRound`) clears `bomb.result` at every freeze
    // and writes the round's reason at every round end, SURVIVORS HELD / ALL SHAVED included, so a
    // HUD mounted mid-Prep reads the state alone right in each mode (R7). Bomb keeps last round's
    // reason into the freeze, which is why its fallback reads the stage and not the reason.
    const fb = (over: Partial<HudState>) => derivePhase(st({ phase: MatchPhase.Prep, phaseEndsAt: NOW + 4_000, ...over }));
    expect([fb({ mode: "ostrzyzeni", round: 2, roundResult: "SURVIVORS HELD" }).moment, fb({ mode: "ostrzyzeni", round: 2, roundResult: "ALL SHAVED" }).moment]).toEqual(["break", "break"]);
    expect(fb({ mode: "ostrzyzeni", round: 2, roundResult: "" }).moment).toBe("freeze");
    for (const r of ["ELIMINATED", "TRADE", "TIME · EVEN", "TIME · MORE HEALTH"]) expect(fb({ mode: "duel", round: 3, roundResult: r }).breakSource, r).toBe("fallback");
    expect(fb({ mode: "bomb", roundResult: "BOMB DEFUSED", bomb: bomb({ round: 5, stage: "buy", result: "BOMB DEFUSED" }) }).moment, "bomb freeze with last round's reason").toBe("freeze");
    // Turniej: a round break inside a pair has somebody alive (the winner of the round), so it is a
    // round break and not the bracket; the pair's freeze has an empty reason and both alive.
    const pair = [row("Kowal", 0), row("Rysiek", 1, false), row("Zdzichu", 0, false), row("Kasia", 1, false)];
    const tb = fb({ mode: "turniej", round: 3, roundResult: "ELIMINATED", players: pair, bracket: bracket(0), scoreA: 2, scoreB: 1 });
    expect([tb.moment, tb.betweenPairs, tb.breakSource]).toEqual(["break", false, "fallback"]);
    const tf = fb({ mode: "turniej", round: 3, roundResult: "", players: pair.map((p, i) => ({ ...p, alive: i < 2 })), bracket: bracket(0), scoreA: 2, scoreB: 1 });
    expect([tf.moment, tf.inBreak]).toEqual(["freeze", false]);
    // The first freeze after the countdown is not an edge (Countdown → Prep), and its reason is empty.
    const first = run(st({ mode: "duel", phase: MatchPhase.Countdown, phaseEndsAt: NOW + 1_000 }), st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + DUEL.prepMs }));
    expect([first.moment, first.inBreak]).toEqual(["freeze", false]);
  });

  it("duel freeze with an empty result is not a break", () => {
    const d = derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, round: 0, roundResult: "" }));
    expect([d.moment, d.inBreak, d.breakSource, d.clockKind]).toEqual(["freeze", false, null, "freeze"]);
  });

  it("halftime is the break after BOMB.halfRounds", () => {
    const at = (round: number) => run(
      st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ round, stage: "carried" }) }),
      st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + BOMB.breakMs, bomb: bomb({ round, stage: "resolved", result: "ATTACKERS ELIMINATED" }) }),
    );
    const half = at(BOMB.halfRounds);
    expect([half.moment, half.inBreak, half.sideSwap, half.clockKind]).toEqual(["halftime", true, true, "break"]);
    expect(at(BOMB.halfRounds - 1).moment).toBe("break");
    expect(at(BOMB.halfRounds + 1).moment).toBe("break");
    // The fallback finds it too (mounted during the halftime break).
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, bomb: bomb({ round: BOMB.halfRounds, stage: "resolved" }) })).moment).toBe("halftime");
    // Round 7's freeze opens the second half.
    const r7 = derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, phaseEndsAt: NOW + 13_000, bomb: bomb({ round: BOMB.halfRounds + 1, stage: "buy", attackTeam: 1 }), myTeam: 0 }));
    expect([r7.moment, r7.secondHalfStart, r7.mySide]).toEqual(["freeze", true, "obrona"]);
  });
});

describe("rounds", () => {
  it("round number: bomb current vs duel finished+1, finished in the break", () => {
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, bomb: bomb({ round: 5, stage: "buy" }), round: 5 })).round).toBe(5);
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, bomb: bomb({ round: 5, stage: "carried" }), round: 5 })).round).toBe(5);
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, bomb: bomb({ round: 5, stage: "resolved" }), round: 5 })).round).toBe(5);
    // Duel: `round` is the rounds finished; the one being played is the next.
    expect(derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, round: 1 })).round).toBe(2);
    expect(derivePhase(st({ mode: "duel", phase: MatchPhase.Playing, round: 1 })).round).toBe(2);
    // …and in the break after it, the round that just finished.
    expect(derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, round: 2, roundResult: "ELIMINATED" })).round).toBe(2);
    expect(derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Playing, round: 1 })).round).toBe(2);
    expect(derivePhase(st({ mode: "tdm", phase: MatchPhase.Playing, round: 0 })).round).toBe(0);
  });

  it("matchPoint 5:5 duel = both", () => {
    const mp = (scoreA: number, scoreB: number, mode: "duel" | "bomb" = "duel") =>
      derivePhase(st({ mode, phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, scoreA, scoreB, bomb: mode === "bomb" ? bomb({ stage: "buy" }) : null })).matchPoint;
    expect(mp(DUEL.wins - 1, DUEL.wins - 1)).toBe(2);
    expect(mp(DUEL.wins - 1, 2)).toBe(0);
    expect(mp(1, DUEL.wins - 1)).toBe(1);
    expect(mp(3, 3)).toBe(-1);
    expect(mp(BOMB.wins - 1, 4, "bomb")).toBe(0);
    // Ostrzyżeni and the continuous modes have no match point.
    expect(derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Playing, scoreA: 4, scoreB: 4 })).matchPoint).toBe(-1);
    expect(derivePhase(st({ mode: "tdm", phase: MatchPhase.Playing, scoreA: 39, scoreB: 39 })).matchPoint).toBe(-1);
  });

  it("the half and last-round flags, and the duel's side swap", () => {
    const duelBreak = (round: number) => derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, round, roundResult: "ELIMINATED" }));
    expect([3, 6, 9].map((r) => duelBreak(r).sideSwap)).toEqual([true, true, true]);
    expect([1, 2, 4, 5].map((r) => duelBreak(r).sideSwap)).toEqual([false, false, false, false]);
    expect(derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, round: 2 })).lastOfHalf).toBe(true); // round 3
    expect(derivePhase(st({ mode: "duel", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, round: 2 * DUEL.wins - 2 })).lastRound).toBe(true);
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, bomb: bomb({ round: BOMB.halfRounds, stage: "buy" }) })).lastOfHalf).toBe(true);
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Prep, bomb: bomb({ round: BOMB.maxRounds, stage: "buy" }) })).lastRound).toBe(true);
    expect(derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: NOW + 8_000, round: OSTRZYZENI.rounds - 1 })).lastRound).toBe(true);
  });

  it("my side: attack or defence in bomb, survivor or shaved in ostrzyżeni, nothing elsewhere", () => {
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, myTeam: 0, bomb: bomb({ attackTeam: 0, stage: "carried" }) })).mySide).toBe("atak");
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing, myTeam: 1, bomb: bomb({ attackTeam: 0, stage: "carried" }) })).mySide).toBe("obrona");
    expect(derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Prep, phaseEndsAt: NOW + 8_000, myTeam: OSTRZYZENI.survivorTeam })).mySide).toBe("ocalony");
    expect(derivePhase(st({ mode: "ostrzyzeni", phase: MatchPhase.Playing, myTeam: OSTRZYZENI.shavedTeam })).mySide).toBe("ostrzyzony");
    expect(derivePhase(st({ mode: "duel", phase: MatchPhase.Playing })).mySide).toBeNull();
    expect(derivePhase(st({ mode: "bomb", phase: MatchPhase.Waiting, bomb: bomb() })).mySide).toBeNull();
  });
});

describe("between pairs", () => {
  const pair = [row("Kowal", 0), row("Rysiek", 1), row("Zdzichu", 0, false), row("Kasia", 1, false)];
  const dead = pair.map((p) => ({ ...p, alive: false }));
  const freeze0 = st({ mode: "turniej", phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, bracket: bracket(0), players: pair, scoreA: 2, scoreB: 1, round: 3 });

  it("betweenPairs when the pair is decided", () => {
    const live = st({ ...freeze0, phase: MatchPhase.Playing, phaseEndsAt: NOW + 40_000, scoreA: DUEL.wins - 1, scoreB: 4 });
    const decided = st({ ...freeze0, phase: MatchPhase.Prep, phaseEndsAt: NOW + 9_000, bracket: bracket(1), players: dead, scoreA: DUEL.wins, scoreB: 4, roundResult: "ELIMINATED" });
    const m = run(freeze0, live, decided);
    expect([m.moment, m.betweenPairs, m.inBreak, m.clockKind, m.clockEndsAt]).toEqual(["betweenPairs", true, false, "break", NOW + 9_000]);
    // The next pair's first freeze: scores reset, the pair alive, the new `at` latched.
    const next = st({ ...freeze0, phaseEndsAt: NOW + 30_000, bracket: bracket(1), players: [row("Kowal", 0, false), row("Rysiek", 1, false), row("Zdzichu", 0), row("Kasia", 1)], scoreA: 0, scoreB: 0, round: 0, roundResult: "" });
    const n = run(freeze0, live, decided, next);
    expect([n.moment, n.betweenPairs, n.round]).toEqual(["freeze", false, 1]);
  });

  it("betweenPairs after a walkover in the freeze (bracket at moved, scores below DUEL.wins)", () => {
    const walkover = st({ ...freeze0, phaseEndsAt: NOW + 9_000, bracket: bracket(1), players: dead });
    const m = run(freeze0, walkover);
    expect(Math.max(walkover.scoreA, walkover.scoreB)).toBeLessThan(DUEL.wins);
    expect([m.moment, m.betweenPairs]).toEqual(["betweenPairs", true]);
  });

  it("betweenPairs fallback: nobody alive and not TRADE", () => {
    // Mounted between pairs: nothing latched, so the state's own sign decides.
    expect(derivePhase(st({ ...freeze0, players: dead, roundResult: "ELIMINATED" })).moment).toBe("betweenPairs");
    // A trade kills both players inside a pair: that is a round break, not the bracket.
    const trade = derivePhase(st({ ...freeze0, players: dead, roundResult: "TRADE" }));
    expect([trade.moment, trade.betweenPairs]).toEqual(["break", false]);
    // Somebody alive: the pair is still being played.
    expect(derivePhase(st({ ...freeze0, roundResult: "" })).betweenPairs).toBe(false);
  });

  it("turniej is treated as duel", () => {
    const shared: Partial<HudState> = { phase: MatchPhase.Prep, phaseEndsAt: NOW + 12_000, scoreA: DUEL.wins - 1, scoreB: DUEL.wins - 1, round: 2, players: pair, bracket: bracket(0) };
    const d = derivePhase(st({ ...shared, mode: "duel" }));
    const t = derivePhase(st({ ...shared, mode: "turniej" }));
    expect({ ...t, mode: "duel" }).toEqual(d);
    expect([t.roundMode, t.matchPoint, t.lastOfHalf]).toEqual([true, 2, true]);
    const tb = run(st({ ...shared, mode: "turniej", phase: MatchPhase.Playing, scoreA: 2, scoreB: 1 }), st({ ...shared, mode: "turniej", scoreA: 3, scoreB: 1, round: 3, phaseEndsAt: NOW + DUEL.breakMs }));
    expect([tb.moment, tb.sideSwap]).toEqual(["break", true]);
  });
});

describe("ended and the strip", () => {
  it("endedStage A/B/C at 0/3000/6000 (round) and B/C at 0/3000 (continuous)", () => {
    const at = (mode: "bomb" | "tdm", elapsed: number) => {
      const phaseEndsAt = NOW + MATCH.endedMs - elapsed;
      return endedStage(derivePhase(st({ mode, phase: MatchPhase.Ended, phaseEndsAt })), NOW);
    };
    expect([0, 2999, 3000, 5999, 6000, MATCH.endedMs].map((e) => at("bomb", e))).toEqual(["A", "A", "B", "B", "C", "C"]);
    expect([0, 2999, 3000, MATCH.endedMs].map((e) => at("tdm", e))).toEqual(["B", "B", "C", "C"]);
    expect(endedStage(derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing })), NOW)).toBeNull();
  });

  it("stripSides puts my team left and keeps one object per case", () => {
    const team = derivePhase(st({ mode: "bomb", phase: MatchPhase.Playing }));
    expect(stripSides(team, { myTeam: 0 })).toEqual({ left: 0, right: 1, order: [0, 2] });
    expect(stripSides(team, { myTeam: 1 })).toEqual({ left: 1, right: 0, order: [2, 0] });
    expect(stripSides(team, { myTeam: 1 })).toBe(stripSides(team, { myTeam: 1 }));
    const ffa = derivePhase(st({ mode: "ffa", phase: MatchPhase.Playing }));
    expect(stripSides(ffa, { myTeam: 1 })).toEqual({ left: "me", right: "best", order: [0, 2] });
    expect(stripSides(derivePhase(st({ mode: "gungame" })), { myTeam: 0 }).left).toBe("me");
  });

  it("the tracker hands back the same model object until a field changes", () => {
    const t = createPhaseTracker();
    const a = t.read(st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 30_000 }));
    const b = t.read(st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 30_000, health: 40 }));
    expect(b).toBe(a);
    const c = t.read(st({ mode: "duel", phase: MatchPhase.Playing, phaseEndsAt: NOW + 29_000 }));
    expect(c).not.toBe(a);
    expect(observePhase(NO_OBS, null, st({ mode: "duel" }))).toBe(NO_OBS);
  });
});
