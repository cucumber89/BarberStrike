import { describe, expect, it } from "vitest";
import {
  bracketString, champion, currentMatch, isDone, isTournament, parseBracket, reportWinner,
  roundName, roundsLeft, roundsOf, seedBracket, setScore, withdraw, TOURNAMENT_SIZES, type Bracket, type TournamentSize,
} from "./tournament";
import { mulberry32 } from "./rng";

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `GRACZ${i}` }));
/** A draw from a fixed seed, so every expectation below is a number somebody can re-derive. */
const draw = (n: number, size: TournamentSize = n as TournamentSize, seed = 7) => seedBracket(people(n), size, mulberry32(seed));
/** Play the bracket out, the higher-numbered id always winning, and return the finished bracket. */
const playOut = (b: Bracket, pick: (a: string, bb: string) => string = (a, bb) => (a > bb ? a : bb)): Bracket => {
  let guard = 0;
  while (!isDone(b) && guard++ < 50) {
    const m = currentMatch(b);
    if (!m) break;
    b = reportWinner(b, pick(m.a, m.b), 6, 2);
  }
  return b;
};

describe("the bracket's shape", () => {
  it("draws N − 1 matches in the rounds a knockout has", () => {
    expect(draw(4).matches).toHaveLength(3);
    expect(draw(8).matches).toHaveLength(7);
    expect(roundsOf(4)).toBe(2);
    expect(roundsOf(8)).toBe(3);
    // The first round is half the draw, and every round after it is half of the one before.
    expect(draw(8).matches.filter((m) => m.round === 0)).toHaveLength(4);
    expect(draw(8).matches.filter((m) => m.round === 1)).toHaveLength(2);
    expect(draw(8).matches.filter((m) => m.round === 2)).toHaveLength(1);
  });

  it("puts everybody in exactly once and nobody twice", () => {
    const b = draw(8);
    const first = b.matches.filter((m) => m.round === 0).flatMap((m) => [m.a, m.b]).filter(Boolean);
    expect(first.sort()).toEqual(people(8).map((p) => p.id).sort());
  });

  it("names the rounds from the end, which is how a bracket is read", () => {
    expect(roundName(1)).toBe("FINAŁ");
    expect(roundName(2)).toBe("PÓŁFINAŁ");
    expect(roundName(3)).toBe("ĆWIERĆFINAŁ");
    const b = draw(8);
    expect(roundsLeft(b), "eight entrants open on the quarter-finals").toBe(3);
  });

  it("is a draw, not a seeding — the same seed gives the same bracket and another gives another", () => {
    const order = (b: Bracket) => b.matches.filter((m) => m.round === 0).map((m) => `${m.a}v${m.b}`).join(",");
    expect(order(draw(8, 8, 7))).toBe(order(draw(8, 8, 7)));
    expect(order(draw(8, 8, 7))).not.toBe(order(draw(8, 8, 99)));
  });
});

describe("playing it out", () => {
  it("carries the winner of each pair into the next round and ends on a champion", () => {
    const b = playOut(draw(4));
    expect(isDone(b)).toBe(true);
    // The rule above always picks the higher id, so the champion is the highest entered.
    expect(champion(b)).toBe("p3");
    expect(currentMatch(b)).toBeNull();
    // Every match was decided, and the final's two players both came out of round 0.
    expect(b.matches.every((m) => m.winner)).toBe(true);
    const final = b.matches[b.matches.length - 1];
    expect([final.a, final.b].sort()).toEqual([b.matches[0].winner, b.matches[1].winner].sort());
  });

  it("plays one pair at a time, in order", () => {
    let b = draw(8);
    const seen: string[] = [];
    while (!isDone(b)) {
      const m = currentMatch(b)!;
      seen.push(`${m.round}`);
      b = reportWinner(b, m.a, 6, 0);
    }
    expect(seen, "four quarters, two semis, one final").toEqual(["0", "0", "0", "0", "1", "1", "2"]);
  });

  it("keeps the score of the pair being played, and remembers it afterwards", () => {
    let b = draw(4);
    b = setScore(b, 4, 5);
    expect(currentMatch(b)!.scoreA).toBe(4);
    expect(currentMatch(b)!.scoreB).toBe(5);
    const m0 = currentMatch(b)!;
    b = reportWinner(b, m0.b, 4, 6);
    expect(b.matches[0].scoreA).toBe(4);
    expect(b.matches[0].scoreB).toBe(6);
    expect(b.matches[0].winner).toBe(m0.b);
  });

  it("ignores a result for somebody who is not in the pair being played", () => {
    const b = draw(4);
    const before = bracketString(b);
    expect(bracketString(reportWinner(b, "nie-ma-takiego", 6, 0))).toBe(before);
  });
});

describe("a draw with empty slots", () => {
  it("never offers a pair that is not two people", () => {
    // Five entrants in a bracket of eight. Byes are settled when they are REACHED, not up front,
    // so what matters is that every pair the room is ever handed has somebody on both sides.
    let b = draw(5, 8);
    let guard = 0;
    while (!isDone(b) && guard++ < 50) {
      const m = currentMatch(b);
      expect(m, `pair ${b.at} was offered with an empty side`).not.toBeNull();
      expect(m!.a, `pair ${b.at}`).toBeTruthy();
      expect(m!.b, `pair ${b.at}`).toBeTruthy();
      b = reportWinner(b, m!.a, 6, 1);
    }
    expect(isDone(b)).toBe(true);
    // Five people in a draw of eight play four matches, not seven: three of the seven are walked.
    expect(b.matches.filter((m) => m.scoreA + m.scoreB > 0)).toHaveLength(4);
  });

  it("still ends on one champion however lopsided the draw", () => {
    for (const n of [2, 3, 5, 6, 7]) {
      const b = playOut(draw(n, 8));
      expect(isDone(b), `${n} entrants`).toBe(true);
      expect(champion(b), `${n} entrants`).toBe(`p${n - 1}`);
    }
  });
});

describe("somebody leaves", () => {
  it("is a walkover when it is one of the two playing", () => {
    let b = draw(4);
    const m = currentMatch(b)!;
    b = withdraw(b, m.a);
    expect(b.matches[0].winner, "the one still there goes through").toBe(m.b);
    expect(b.at).toBe(1);
  });

  it("strikes a waiting entrant out of the draw instead of making their opponent wait", () => {
    let b = draw(8);
    const later = b.matches[3];                 // the last quarter-final, not the one being played
    b = withdraw(b, later.a);
    expect(b.matches[3].a).toBe("");
    // And when that pair comes round it is a bye: the survivor is already through.
    b = reportWinner(b, currentMatch(b)!.a, 6, 0);
    b = reportWinner(b, currentMatch(b)!.a, 6, 0);
    b = reportWinner(b, currentMatch(b)!.a, 6, 0);
    expect(b.matches[3].winner, "the player who did turn up").toBe(later.b);
    expect(currentMatch(b)!.round, "and the semi-final is next").toBe(1);
  });

  it("does not fall over when both sides of the pair being played leave", () => {
    let b = draw(4);
    const m = currentMatch(b)!;
    b = withdraw(b, m.a);
    b = withdraw(b, m.b);
    expect(isDone(b) || currentMatch(b) !== null, "the bracket is still coherent").toBe(true);
    expect(() => playOut(b)).not.toThrow();
  });
});

describe("the string the clients are sent", () => {
  it("survives a round trip and stays small", () => {
    let b = draw(8);
    b = reportWinner(b, currentMatch(b)!.a, 6, 3);
    const s = bracketString(b);
    expect(s.length, "an eight-player bracket on the wire").toBeLessThan(400);
    const view = parseBracket(s)!;
    expect(view.size).toBe(8);
    expect(view.at).toBe(1);
    expect(view.matches).toHaveLength(7);
    expect(view.matches[0].winner).toBe("a");
    expect(view.matches[0].scoreA).toBe(6);
    expect(view.matches[0].scoreB).toBe(3);
    // The reader re-derives which round each match belongs to from the shape alone.
    expect(view.matches.map((m) => m.round)).toEqual([0, 0, 0, 0, 1, 1, 2]);
  });

  it("carries the name of a player who has already left the room", () => {
    let b = draw(4);
    const gone = currentMatch(b)!.a;
    b = withdraw(b, gone);
    expect(bracketString(b)).toContain(b.names[gone]);
  });

  it("refuses to let a nickname break the format", () => {
    const b = seedBracket([{ id: "x", name: "a|b;c" }, { id: "y", name: "OK" }], 4, mulberry32(1));
    const s = bracketString(b);
    const view = parseBracket(s)!;
    expect(view.matches).toHaveLength(3);
    expect(s).not.toContain("a|b;c");
  });

  it("returns null for rubbish rather than half a bracket", () => {
    expect(parseBracket("")).toBeNull();
    expect(parseBracket("nonsense")).toBeNull();
    expect(parseBracket("5|0;a|b|0|0|-"), "five is not a bracket size").toBeNull();
    expect(parseBracket("4|0;short")).toBeNull();
  });
});

describe("drop V: sixteen and thirty-two on parallel arenas", () => {
  it("offers all four draw sizes", () => {
    expect(TOURNAMENT_SIZES).toEqual([4, 8, 16, 32]);
  });

  it("draws the right number of rounds and matches for 16 and 32", () => {
    expect(roundsOf(16)).toBe(4);
    expect(roundsOf(32)).toBe(5);
    expect(draw(16).matches).toHaveLength(15);
    expect(draw(32).matches).toHaveLength(31);
    expect(draw(32).matches.filter((m) => m.round === 0)).toHaveLength(16);
  });

  it("names the early rounds of a big draw as the fractions they are read with", () => {
    expect(roundName(4)).toBe("1/8");   // round of sixteen
    expect(roundName(5)).toBe("1/16");  // round of thirty-two
    // The three near the end keep their words.
    expect(roundName(3)).toBe("ĆWIERĆFINAŁ");
    expect(roundName(2)).toBe("PÓŁFINAŁ");
    expect(roundName(1)).toBe("FINAŁ");
    expect(roundsLeft(draw(16)), "sixteen entrants open on the 1/8").toBe(4);
    expect(roundsLeft(draw(32)), "thirty-two entrants open on the 1/16").toBe(5);
  });

  it("seeds 20 entrants into a bracket of 32: 32 slots, 12 byes", () => {
    const b = seedBracket(people(20), 32, mulberry32(7));
    const firstRound = b.matches.filter((m) => m.round === 0);
    const slots = firstRound.flatMap((m) => [m.a, m.b]);
    expect(slots).toHaveLength(32);
    expect(slots.filter(Boolean)).toHaveLength(20);
    expect(slots.filter((s) => s === "")).toHaveLength(12); // the byes
    // Everybody is placed exactly once.
    expect(slots.filter(Boolean).sort()).toEqual(people(20).map((p) => p.id).sort());
  });

  it("plays a 32-draw out to a single champion", () => {
    // The higher entrant NUMBER always wins (a numeric pick, since "p9" > "p31" lexically).
    const num = (id: string) => Number(id.slice(1));
    const b = playOut(draw(32), (a, bb) => (num(a) > num(bb) ? a : bb));
    expect(isDone(b)).toBe(true);
    expect(champion(b)).toBe("p31");
  });

  it("round-trips bracketString → parseBracket for 16 and 32", () => {
    for (const size of [16, 32] as const) {
      let b = draw(size);
      b = reportWinner(b, currentMatch(b)!.a, 6, 2);
      const s = bracketString(b);
      const view = parseBracket(s)!;
      expect(view, `size ${size}`).not.toBeNull();
      expect(view.size).toBe(size);
      expect(view.at).toBe(b.at);
      expect(view.matches).toHaveLength(size - 1);
      expect(view.matches[0].winner).toBe("a");
      expect(view.matches[0].scoreA).toBe(6);
      expect(view.matches[0].scoreB).toBe(2);
      expect(view.matches.filter((m) => m.round === 0)).toHaveLength(size / 2);
    }
  });
});

it("knows which mode runs a bracket", () => {
  expect(isTournament("turniej")).toBe(true);
  expect(isTournament("duel")).toBe(false);
  expect(isTournament("tdm")).toBe(false);
});
