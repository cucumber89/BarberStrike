import { describe, expect, it } from "vitest";
import { DUEL, bracketString, currentMatch, reportWinner, seedBracket, withdraw, type Bracket } from "@frankibarber/shared";
import { mulberry32 } from "@frankibarber/shared";
import { bracketLine, bracketStage, pairCard, pairNames, standing } from "./Bracket";
import { countWords } from "./hud/format";

/**
 * The one line the HUD carries while a pair is being played. The bracket itself is drawn from
 * `parseBracket`, which is tested where it lives; this is about what a player reads in the corner.
 */
describe("the bracket's one line", () => {
  const four = () => seedBracket(
    ["ALFA", "BRAVO", "CEZAR", "DAWID"].map((n, i) => ({ id: `p${i}`, name: n })), 4, mulberry32(3));

  it("names the round and the two who are on", () => {
    const b = four();
    const m = currentMatch(b)!;
    const line = bracketLine(bracketString(b));
    expect(line).toContain("PÓŁFINAŁ");
    expect(line).toContain(b.names[m.a]);
    expect(line).toContain(b.names[m.b]);
    expect(line).toContain("vs");
  });

  it("says FINAŁ when it is the final", () => {
    let b = four();
    b = reportWinner(b, currentMatch(b)!.a, 6, 1);
    b = reportWinner(b, currentMatch(b)!.a, 6, 0);
    expect(bracketLine(bracketString(b))).toContain("FINAŁ");
  });

  it("says nothing at all when there is no bracket, rather than half a line", () => {
    expect(bracketLine("")).toBe("");
    expect(bracketLine("rubbish")).toBe("");
  });

  it("is empty once the final has been played", () => {
    let b = four();
    for (let i = 0; i < 3; i++) b = reportWinner(b, currentMatch(b)!.a, 6, 0);
    expect(bracketLine(bracketString(b)), "nobody is on").toBe("");
  });
});

describe("where you stand in the draw", () => {
  const four = () => seedBracket(
    ["ALFA", "BRAVO", "CEZAR", "DAWID"].map((n, i) => ({ id: `p${i}`, name: n })), 4, mulberry32(3));

  it("tells the three cases apart, which is what a dead player's card needs", () => {
    const b = four();
    const s = bracketString(b);
    const m = b.matches[0];
    const playing = [b.names[m.a], b.names[m.b]];
    const waiting = ["ALFA", "BRAVO", "CEZAR", "DAWID"].filter((n) => !playing.includes(n));
    for (const n of playing) expect(standing(s, n), n).toBe("playing");
    for (const n of waiting) expect(standing(s, n), n).toBe("waiting");
  });

  it("says OUT to whoever lost, and WAITING to whoever went through", () => {
    let b = four();
    const m = b.matches[0];
    b = reportWinner(b, m.a, 6, 2);
    const s = bracketString(b);
    expect(standing(s, b.names[m.a]), "through to the final").toBe("waiting");
    expect(standing(s, b.names[m.b]), "knocked out").toBe("out");
  });

  it("says nothing when there is no bracket or no name", () => {
    expect(standing("", "ALFA")).toBe("");
    expect(standing(bracketString(four()), "")).toBe("");
  });
});

describe("the two on the board", () => {
  const four = () => seedBracket(
    ["ALFA", "BRAVO", "CEZAR", "DAWID"].map((n, i) => ({ id: `p${i}`, name: n })), 4, mulberry32(3));

  it("gives the scoreboard two people instead of two side names", () => {
    const b = four();
    const names = pairNames(bracketString(b))!;
    expect(names, "side order: a is team 0").toEqual([b.names[b.matches[0].a], b.names[b.matches[0].b]]);
  });

  it("gives nothing between pairs and after the final, so the bar falls back to the sides", () => {
    let b = four();
    for (let i = 0; i < 3; i++) b = reportWinner(b, currentMatch(b)!.a, 6, 0);
    expect(pairNames(bracketString(b))).toBeNull();
    expect(pairNames("")).toBeNull();
  });
});

describe("the pair card and the strip's stage (drop U, P2)", () => {
  const draw = (names: string[], size: 4 | 8, seed = 3) =>
    seedBracket(names.map((n, i) => ({ id: `p${i}`, name: n })), size, mulberry32(seed));
  const FOUR = ["ALFA", "BRAVO", "CEZAR", "DAWID"];
  // The longest nicks the bracket keeps (`clean` cuts at 16). Each is one word, as the spec's worst
  // case counts them (§6.5: „xXPiotrekXx”); a nick with spaces in it (`sanitizeName` allows them)
  // adds its extra words to the eyebrow and the next-pair line.
  const EIGHT = ["xXPiotrekXx_1234", "Kasia_Brzytwa", "Jan_Kowalski", "ZDZICHU", "RYSIEK", "Gruby_Wojtek", "Młody_Tomek", "GRAZYNA"];

  it("bracketStage names the round without the pair", () => {
    let b = draw(FOUR, 4);
    const m = currentMatch(b)!;
    expect(bracketStage(bracketString(b))).toBe("PÓŁFINAŁ");
    expect(bracketStage(bracketString(b))).not.toContain(b.names[m.a]);
    expect(bracketStage(bracketString(b))).not.toContain("vs");
    b = reportWinner(b, currentMatch(b)!.a, DUEL.wins, 1);
    b = reportWinner(b, currentMatch(b)!.a, DUEL.wins, 2);
    expect(bracketStage(bracketString(b))).toBe("FINAŁ");
    expect(bracketStage(bracketString(draw(EIGHT, 8)))).toBe("ĆWIERĆFINAŁ");
    b = reportWinner(b, currentMatch(b)!.a, DUEL.wins, 0);
    expect(bracketStage(bracketString(b)), "the final is over").toBe("");
    expect(bracketStage("")).toBe("");
    expect(bracketStage("rubbish")).toBe("");
  });

  it("pairCard names who went through, how, and who is up next", () => {
    let b = draw(FOUR, 4);
    const first = currentMatch(b)!;
    b = reportWinner(b, first.b, 4, DUEL.wins);
    const s = bracketString(b);
    const next = currentMatch(b)!;
    const card = pairCard(s, b.names[first.a], "ELIMINATED")!;
    expect(card.eyebrow).toBe(`${b.names[first.b]} PRZECHODZI DALEJ`);
    expect(card.verdict, "the winner's score first, then the short reason").toBe(`${DUEL.wins} : 4 · Przeciwnik wyeliminowany`);
    expect(card.title).toBe("NASTĘPNA PARA · PÓŁFINAŁ");
    expect(card.next).toBe(`${b.names[next.a]} vs ${b.names[next.b]}`);
    expect(card.standing, "the loser").toBe("ODPADŁEŚ Z TURNIEJU");
    expect(pairCard(s, b.names[next.a], "ELIMINATED")!.standing).toBe("GRASZ TERAZ");
    expect(pairCard(s, b.names[first.b], "ELIMINATED")!.standing, "through, waiting for the final").toBe("CZEKASZ NA SWOJĄ PARĘ");
    expect(pairCard(s, "", "ELIMINATED")!.standing).toBe("");
    // The short reason (§5.4), never the long one: „Czas — więcej zdrowia”, not „Czas minął — więcej zdrowia wygrywa”.
    expect(pairCard(s, "", "TIME · MORE HEALTH")!.verdict).toBe(`${DUEL.wins} : 4 · Czas — więcej zdrowia`);
    // Nothing decided yet, or no bracket at all: no card rather than half a card.
    expect(pairCard(bracketString(draw(FOUR, 4)), "ALFA", "")).toBeNull();
    expect(pairCard("", "ALFA", "ELIMINATED")).toBeNull();
  });

  it("walkover eyebrow", () => {
    // Somebody left in the freeze at 2 : 1: the room withdraws them, the bracket moves on with the
    // scores as they stood, and the freeze had already cleared the round reason.
    let b = draw(FOUR, 4);
    const m = currentMatch(b)!;
    b = withdraw({ ...b, matches: b.matches.map((x, i) => (i === b.at ? { ...x, scoreA: 2, scoreB: 1 } : x)) }, m.b);
    const card = pairCard(bracketString(b), b.names[m.a], "")!;
    expect(card.walkover).toBe(true);
    expect(card.eyebrow).toBe(`WALKOWER · ${b.names[m.a]} DALEJ`);
    expect(card.verdict, "a walkover has no score").toBeNull();
    // The gallery's own walkover (gallery/fixtures.ts TOUR.walkover).
    const tour = pairCard("4|2;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|2|1|a;Kowal|ZDZICHU|0|0|-", "Kowal", "")!;
    expect([tour.eyebrow, tour.verdict, tour.title, tour.next, tour.standing]).toEqual(["WALKOWER · ZDZICHU DALEJ", null, "NASTĘPNA PARA · FINAŁ", "Kowal vs ZDZICHU", "GRASZ TERAZ"]);
    // A pair capped by the match clock below DUEL.wins still carries its last round's reason: a result, not a walkover.
    const capped = pairCard("4|2;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|4|3|a;Kowal|ZDZICHU|0|0|-", "Kowal", "TIME · MORE HEALTH")!;
    expect([capped.walkover, capped.eyebrow, capped.verdict]).toEqual([false, "ZDZICHU PRZECHODZI DALEJ", "4 : 3 · Czas — więcej zdrowia"]);
  });

  it("pairCard ≤ 18 words for every fixture", () => {
    // Every decided pair of a four and an eight (each pair won by either side, at the closest
    // score), every round reason the server writes, each entrant's standing, and a walkover.
    const reasons = ["", "BOMB DETONATED", "BOMB DEFUSED", "DEFENDERS ELIMINATED", "ATTACKERS ELIMINATED", "SITE SECURED", "TRADE",
      "ELIMINATED", "TIME · EVEN", "TIME · MORE HEALTH", "SURVIVORS HELD", "ALL SHAVED"];
    const cards: string[] = [];
    for (const [names, size] of [[FOUR, 4], [EIGHT, 8]] as const) {
      for (const side of ["a", "b"] as const) {
        let b: Bracket = draw([...names], size);
        while (currentMatch(b)) {
          const m = currentMatch(b)!;
          const after = reportWinner(b, m[side], side === "a" ? DUEL.wins : DUEL.wins - 1, side === "a" ? DUEL.wins - 1 : DUEL.wins);
          const gone = withdraw(b, side === "a" ? m.b : m.a);
          for (const me of [...names, ""]) {
            for (const r of reasons) { const c = pairCard(bracketString(after), me, r); if (c) cards.push([c.eyebrow, c.verdict ?? "", c.title, c.next, c.standing].join(" ")); }
            const w = pairCard(bracketString(gone), me, "");
            if (w) cards.push([w.eyebrow, w.verdict ?? "", w.title, w.next, w.standing].join(" "));
          }
          b = after;
        }
      }
    }
    expect(cards.length).toBeGreaterThan(500);
    const worst = cards.reduce((a, c) => (countWords(c) > countWords(a) ? c : a), "");
    expect(countWords(worst), worst).toBeLessThanOrEqual(18);
  });
});
