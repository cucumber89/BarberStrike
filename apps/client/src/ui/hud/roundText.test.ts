import { describe, expect, it } from "vitest";
import { BOMB, DUEL, OSTRZYZENI } from "@frankibarber/shared";
import {
  freezeCopy, halftimeCard, mvpText, roleCopy, roundBannerCopy, roundEnd, roundReason, roundReasonShort, roundReasonText, roundTakerOf, roundWinnerSeen, turniejPair,
  type RoundBannerInput, type RoundSight,
} from "./roundText";
import { countWords } from "./format";

// Moved verbatim from `ui/resultText.test.ts` (its 'round end' suite) with the functions it pins.
describe("round end", () => {
  it("bomb: the side follows from the result string and who was attacking", () => {
    expect(roundEnd("bomb", "BOMB DETONATED", -1, 1, 0)).toEqual({ title: "RUNDA DLA TAPER", why: "Ładunek wybuchł", mine: false });
    expect(roundEnd("bomb", "BOMB DEFUSED", -1, 1, 0)).toEqual({ title: "RUNDA DLA FADE", why: "Ładunek rozbrojony", mine: true });
    expect(roundEnd("bomb", "ATTACKERS ELIMINATED", -1, 0, 0)?.title).toBe("RUNDA DLA TAPER");
    expect(roundEnd("bomb", "SITE SECURED", -1, 0, 1)?.mine).toBe(true);
    expect(roundEnd("bomb", "", -1, 0, 0)).toBeNull(); // the first buy window: no round yet
  });
  it("duel: the winner comes from the Prep event, a trade has none", () => {
    expect(roundEnd("duel", "ELIMINATED", 1, -1, 1)).toEqual({ title: "RUNDA DLA TAPER", why: "Przeciwnik wyeliminowany", mine: true });
    expect(roundEnd("duel", "TRADE", -1, -1, 0)?.mine).toBeNull();
    expect(roundEnd("duel", "TIME · MORE HEALTH", 0, -1, 1)?.why).toMatch(/więcej zdrowia/);
  });
  it("ostrzyżeni: survivors or shaved, and nothing before a round has ended", () => {
    expect(roundEnd("ostrzyzeni", "", OSTRZYZENI.survivorTeam, -1, 0)).toEqual({ title: "RUNDA DLA OCALENI", why: "Ktoś dotrwał nieostrzyżony do końca czasu", mine: true });
    expect(roundEnd("ostrzyzeni", "", OSTRZYZENI.shavedTeam, -1, 0)?.why).toBe("Wszyscy ostrzyżeni");
    expect(roundEnd("ostrzyzeni", "", -1, -1, 0)).toBeNull();
    expect(roundEnd("tdm", "", 0, -1, 0)).toBeNull();
  });
});

const SERVER_REASONS = ["BOMB DETONATED", "BOMB DEFUSED", "DEFENDERS ELIMINATED", "ATTACKERS ELIMINATED", "SITE SECURED", "TRADE", "ELIMINATED", "TIME · EVEN", "TIME · MORE HEALTH", "SURVIVORS HELD", "ALL SHAVED"];

describe("round reasons (spec §5.4)", () => {
  it("turniej round end names the winner", () => {
    // A tournament pair IS a duel (`TdmRoom.ts:265`): team 0 is the pair's `a`, and the card names
    // the PERSON who took the round — in their own case — never FADE / TAPER.
    const pair = ["ZDZICHU", "xXPiotrekXx"] as const;
    expect(roundEnd("turniej", "ELIMINATED", 0, -1, 0, pair)).toEqual({ title: "RUNDA DLA ZDZICHU", why: "Przeciwnik wyeliminowany", mine: true });
    expect(roundEnd("turniej", "TIME · MORE HEALTH", 1, -1, 0, pair)?.title).toBe("RUNDA DLA xXPiotrekXx");
    expect(roundEnd("turniej", "TRADE", -1, -1, 0, pair)?.mine).toBeNull();
    expect(roundEnd("turniej", "", 0, -1, 0, pair)).toBeNull(); // P-SRV clears the result at every freeze
  });

  it("SURVIVORS HELD / ALL SHAVED are Polish", () => {
    // P-SRV writes these into `bomb.result` in Ostrzyżeni; the card reads them first and falls
    // back to the Prep event's winner only while the field is still empty.
    expect(roundReasonText("SURVIVORS HELD")).toBe("Ktoś dotrwał nieostrzyżony do końca czasu");
    expect(roundReasonText("ALL SHAVED")).toBe("Wszyscy ostrzyżeni");
    expect(roundReasonShort("SURVIVORS HELD")).toBe("Ocaleni dotrwali");
    expect(roundReasonShort("ALL SHAVED")).toBe("Wszyscy ostrzyżeni");
    expect(roundEnd("ostrzyzeni", "SURVIVORS HELD", -1, -1, 0)).toEqual({ title: "RUNDA DLA OCALENI", why: "Ktoś dotrwał nieostrzyżony do końca czasu", mine: true });
    expect(roundEnd("ostrzyzeni", "ALL SHAVED", OSTRZYZENI.shavedTeam, -1, 0)).toEqual({ title: "RUNDA DLA OSTRZYŻENI", why: "Wszyscy ostrzyżeni", mine: false });
    expect(roundReason("ostrzyzeni", "", OSTRZYZENI.survivorTeam)).toBe("SURVIVORS HELD");
    expect(roundReason("ostrzyzeni", "", OSTRZYZENI.shavedTeam)).toBe("ALL SHAVED");
    for (const r of ["SURVIVORS HELD", "ALL SHAVED"]) expect(roundReasonShort(r)).not.toMatch(/[A-Z]{3,} [A-Z]{3,}/);
  });

  it("every short reason ≤ 3 words and BOMB DEFUSED short is 'Ładunek rozbrojony'", () => {
    for (const r of SERVER_REASONS) {
      const short = roundReasonShort(r);
      expect(short, r).not.toBe(r); // every server string has its Polish short form
      expect(countWords(short), short).toBeLessThanOrEqual(3);
    }
    // `multiplayer.spec.ts:161` pins these words, case and all, on the round banner.
    expect(roundReasonShort("BOMB DEFUSED")).toBe("Ładunek rozbrojony");
    expect(roundReasonShort("SOMETHING NEW")).toBe("SOMETHING NEW"); // an unknown reason passes through
  });

  it("halftime card after BOMB.halfRounds", () => {
    const card = halftimeCard("bomb", BOMB.halfRounds, 0);
    // FADE attacks the first half, so after round 6 its players defend, all from $800 (§5.2 row 23).
    expect(card?.eyebrow.map((c) => c.text)).toEqual(["PRZERWA"]);
    expect(card?.title).toBe("ZMIANA STRON");
    expect(card?.line.map((p) => p.text).join(" · ")).toBe("Teraz bronisz · wszyscy zaczynają od $800");
    expect(halftimeCard("bomb", BOMB.halfRounds, 1)?.line[0].text).toBe("Teraz atakujesz");
    for (const r of [1, BOMB.halfRounds - 1, BOMB.halfRounds + 1, BOMB.maxRounds]) expect(halftimeCard("bomb", r, 0), `round ${r}`).toBeNull();
    expect(halftimeCard("duel", BOMB.halfRounds, 0)).toBeNull();
  });
});

describe("the round-end banner's words", () => {
  const base: RoundBannerInput = { mode: "bomb", result: "BOMB DETONATED", roundWinner: 0, attackTeam: 0, myTeam: 0, alive: true, sideSwap: false, mvp: null };
  const line = (c: ReturnType<typeof roundBannerCopy>) => c?.line.map((p) => p.text).join(" · ");

  it("bomb: WYGRANA or PRZEGRANA, whose round, the short reason and the MVP — no score, no countdown", () => {
    const won = roundBannerCopy({ ...base, mvp: { name: "Kowal", kills: 1, why: "plant" } });
    expect(won?.cls).toBe("mine");
    expect(won?.eyebrow).toEqual([{ text: "WYGRANA", tone: "ok" }]);
    expect(won?.title).toBe("RUNDA DLA FADE");
    expect(line(won)).toBe("Ładunek wybuchł · MVP Kowal · podłożenie");
    expect(won?.line.find((p) => p.testid === "round-mvp")?.text).toBe("MVP Kowal · podłożenie");
    const lost = roundBannerCopy({ ...base, result: "ATTACKERS ELIMINATED", mvp: { name: "xXPiotrekXx", kills: 3, why: "kills" } });
    expect(lost?.cls).toBe("theirs");
    expect(lost?.eyebrow[0]).toEqual({ text: "PRZEGRANA", tone: "danger" });
    expect(lost?.titleTone).toBe("team1");
    expect(line(lost)).toBe("Atak wybity · MVP xXPiotrekXx · 3 zabójstwa");
    for (const c of [won, lost]) expect(JSON.stringify(c)).not.toMatch(/następna runda|\d+ : \d+/i);
    // The MVP is shown only when the client saw the round start (P1): no MVP, no MVP part.
    expect(line(roundBannerCopy(base))).toBe("Ładunek wybuchł");
  });

  it("duel: the carry is the line's second part, and ZMIANA STRON is a second chip after rounds 3, 6, 9", () => {
    const duel: RoundBannerInput = { ...base, mode: "duel", result: "ELIMINATED", attackTeam: -1, sideSwap: true };
    const won = roundBannerCopy(duel);
    expect(won?.eyebrow.map((c) => c.text)).toEqual(["WYGRANA", "ZMIANA STRON"]);
    expect(won?.eyebrow[1].tone).toBe("warn");
    expect(line(won)).toBe("Przeciwnik wyeliminowany · Broń zostaje");
    expect(won?.line[1].testid).toBe("round-end-carry");
    expect(line(roundBannerCopy({ ...duel, roundWinner: 1, alive: false, sideSwap: false }))).toBe("Przeciwnik wyeliminowany · Broń przepada");
    const trade = roundBannerCopy({ ...duel, result: "TRADE", roundWinner: -1, sideSwap: false });
    expect(trade?.cls).toBe("even");
    expect(trade?.eyebrow[0].text).toBe("REMIS");
  });

  it("turniej: a bystander watches — class watch, no WYGRANA/PRZEGRANA, no carry", () => {
    const watch = roundBannerCopy({ ...base, mode: "turniej", result: "ELIMINATED", attackTeam: -1, names: ["ZDZICHU", "RYSIEK"], watching: true });
    expect(watch?.cls).toBe("watch");
    expect(watch?.eyebrow).toEqual([]);
    expect(watch?.title).toBe("RUNDA DLA ZDZICHU");
    expect(line(watch)).toBe("Przeciwnik wyeliminowany");
  });

  it("the final round (stage A): eyebrow OSTATNIA RUNDA and the short reason alone", () => {
    const fin = roundBannerCopy({ ...base, result: "BOMB DEFUSED", attackTeam: 1, final: true, mvp: { name: "Kowal", kills: 2, why: "defuse" } });
    expect(fin?.eyebrow.map((c) => c.text)).toEqual(["OSTATNIA RUNDA"]);
    expect(fin?.title).toBe("RUNDA DLA FADE");
    expect(line(fin)).toBe("Ładunek rozbrojony");
  });

  it("the MVP's reason is Polish, with the plural of the kills", () => {
    expect(mvpText({ name: "a", kills: 1, why: "kills" })).toBe("MVP a · 1 zabójstwo");
    expect(mvpText({ name: "a", kills: 4, why: "kills" })).toBe("MVP a · 4 zabójstwa");
    expect(mvpText({ name: "a", kills: 5, why: "kills" })).toBe("MVP a · 5 zabójstw");
    expect(mvpText({ name: "a", kills: 0, why: "defuse" })).toBe("MVP a · rozbrojenie");
  });
});

describe("the freeze start and the role card", () => {
  const f = { mode: "bomb" as const, round: 5, matchPoint: -1 as const, lastOfHalf: false, lastRound: false, secondHalfStart: false, mySide: "atak" as const, myTeam: 0 as const, bracket: "" };
  it("title RUNDA n, my side in bomb, and at most one eyebrow — match point first", () => {
    expect(freezeCopy(f)).toMatchObject({ eyebrow: [], title: "RUNDA 5", line: [{ text: "ATAKUJESZ" }], glow: false });
    expect(freezeCopy({ ...f, round: 7, secondHalfStart: true, mySide: "obrona" as never }).eyebrow[0].text).toBe("DRUGA POŁOWA");
    expect(freezeCopy({ ...f, round: 7, secondHalfStart: true, mySide: "obrona" as never }).line[0].text).toBe("BRONISZ");
    expect(freezeCopy({ ...f, round: 6, lastOfHalf: true }).eyebrow[0].text).toBe("OSTATNIA RUNDA POŁOWY");
    expect(freezeCopy({ ...f, round: 12, lastRound: true, matchPoint: 0 as never }).eyebrow.map((c) => c.text)).toEqual(["MECZBOL · FADE"]);
    expect(freezeCopy({ ...f, round: 12, lastRound: true }).eyebrow[0].text).toBe("OSTATNIA RUNDA");
    const both = freezeCopy({ ...f, mode: "duel", mySide: null, round: 11, lastRound: true, matchPoint: 2 as never });
    expect(both.eyebrow[0].text).toBe("MECZBOL DLA OBU");
    expect(both.glow).toBe(true);
    expect(both.line).toEqual([]);
  });
  it("turniej: the stage as the eyebrow, and the pair on the line in round 1 only", () => {
    const tf = { ...f, mode: "turniej" as const, mySide: null, bracket: "4|1;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|0|0|-;Kowal||0|0|-" };
    expect(freezeCopy({ ...tf, round: 1 })).toMatchObject({ eyebrow: [{ text: "PÓŁFINAŁ" }], title: "RUNDA 1", line: [{ text: "ZDZICHU vs RYSIEK" }] });
    expect(freezeCopy({ ...tf, round: 2 }).line).toEqual([]);
  });
  it("the role card: the chaser shaves, a survivor survives and learns who has the clippers", () => {
    expect(roleCopy(false, "RYSIEK")).toMatchObject({ title: "PRZETRWAJ", line: [{ text: "RYSIEK MA MASZYNKĘ" }] });
    expect(roleCopy(true, "Kowal")).toMatchObject({ title: "MASZ MASZYNKĘ", line: [{ text: "OGOL WSZYSTKICH" }] });
  });
});

describe("who took a 1 v 1 round, as the client saw it", () => {
  const pr = (name: string, team: 0 | 1, alive = true, health?: number) => ({ name, team, alive, connected: true, health });
  const sight = (o: Partial<RoundSight>): RoundSight => ({
    mode: "duel", result: "ELIMINATED", scoreA: 3, scoreB: 2, before: null, ended: false, players: [pr("Kowal", 0), pr("RYSIEK", 1, false)], ...o,
  });

  it("a winner's reason with the store's -1 is NOT a draw: the card says nothing until somebody is known", () => {
    // The deciding round has no Prep event and a reload starts from -1 (`store.ts` initialHud):
    // before the drop's fix this read „RUNDA BEZ ROZSTRZYGNIĘCIA” (audit cases A, B).
    expect(roundEnd("duel", "ELIMINATED", -1, -1, 0)).toBeNull();
    expect(roundEnd("turniej", "TIME · MORE HEALTH", -1, -1, 0, ["Kowal", "RYSIEK"])).toBeNull();
    // A trade, or even health at the time, is a draw whatever `roundWinner` holds.
    expect(roundEnd("duel", "TRADE", 0, -1, 0)).toEqual({ title: "RUNDA BEZ ROZSTRZYGNIĘCIA", why: "Obaj padli — runda bez punktu", mine: null });
    expect(roundEnd("duel", "TIME · EVEN", 1, -1, 0)?.mine).toBeNull();
  });

  it("the score that went up since the round was being played names the side", () => {
    expect(roundWinnerSeen(sight({ before: { a: 2, b: 2 }, players: [] }))).toBe(0);
    expect(roundWinnerSeen(sight({ before: { a: 3, b: 1 }, players: [] }))).toBe(1);
    // Draw reasons first: a trade takes no point, whatever else is seen.
    expect(roundWinnerSeen(sight({ result: "TRADE", before: { a: 2, b: 2 } }))).toBe(-1);
    expect(roundWinnerSeen(sight({ result: "TIME · EVEN" }))).toBe(-1);
    expect(roundWinnerSeen(sight({ result: "" }))).toBeNull(); // no round has ended
  });

  it("at the match's end, the side at DUEL.wins took the deciding round", () => {
    expect(roundWinnerSeen(sight({ ended: true, scoreA: 4, scoreB: DUEL.wins, players: [] }))).toBe(1);
    // A match that ended on the clock below DUEL.wins proves nothing by the score alone.
    expect(roundWinnerSeen(sight({ ended: true, result: "TIME · MORE HEALTH", scoreA: 4, scoreB: 3, players: [] }))).toBeNull();
  });

  it("after a reload: the one standing after ELIMINATED, the healthier one after TIME · MORE HEALTH", () => {
    expect(roundWinnerSeen(sight({}))).toBe(0);
    expect(roundWinnerSeen(sight({ players: [pr("Kowal", 0, false), pr("RYSIEK", 1)] }))).toBe(1);
    expect(roundWinnerSeen(sight({ players: [pr("Kowal", 0), pr("RYSIEK", 1)] }))).toBeNull(); // both up: not an elimination to read
    expect(roundWinnerSeen(sight({ result: "TIME · MORE HEALTH", players: [pr("Kowal", 0, true, 30), pr("RYSIEK", 1, true, 64)] }))).toBe(1);
    // Before P1 writes `ScoreRow.health` the rows carry none: unknown, never a guess.
    expect(roundWinnerSeen(sight({ result: "TIME · MORE HEALTH", players: [pr("Kowal", 0), pr("RYSIEK", 1)] }))).toBeNull();
    // Turniej: only the pair on the board counts — the bystanders are dead bodies on both sides.
    const rows = [pr("Kowal", 0, false), pr("xXPiotrekXx", 1, false), pr("ZDZICHU", 0), pr("RYSIEK", 1, false)];
    expect(roundWinnerSeen(sight({ mode: "turniej", players: rows, pair: ["ZDZICHU", "RYSIEK"] }))).toBe(0);
    // Not a 1 v 1: the result names the side there.
    expect(roundWinnerSeen(sight({ mode: "bomb", result: "BOMB DEFUSED" }))).toBeNull();
  });

  it("the deciding round's taker is the round's, not the match's (the verdict stinger under stage A)", () => {
    // Audit case D: Ostrzyżeni's fifth round went to the shaved (ALL SHAVED) while the match went to
    // the survivors 3 : 2 — the Ended event's winner (0) is the match's; the round was team 1's.
    const base = { scoreA: 3, scoreB: 2, before: { a: 3, b: 1 }, ended: true, players: [], roundWinner: -1 as const, attackTeam: -1 as const };
    expect(roundTakerOf({ ...base, mode: "ostrzyzeni", result: "ALL SHAVED" })).toBe(OSTRZYZENI.shavedTeam);
    // Bomb's twelfth round won by the defence while the match ends 6 : 6 (a draw for the match).
    expect(roundTakerOf({ ...base, mode: "bomb", result: "ATTACKERS ELIMINATED", scoreA: 6, scoreB: 6, attackTeam: 0 })).toBe(1);
    // The duel: the score the Ended event found, and the one the sync brought.
    expect(roundTakerOf({ ...base, mode: "duel", result: "ELIMINATED", scoreA: 5, scoreB: 6, before: { a: 5, b: 5 } })).toBe(1);
    expect(roundTakerOf({ ...base, mode: "duel", result: "", scoreA: 4, scoreB: 3 })).toBeNull(); // capped in a freeze: no round
  });

  it("turniej: a settled bracket (the final just reported) still names the final's pair", () => {
    expect(turniejPair("4|3;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|6|4|a;Kowal|ZDZICHU|4|6|b")).toEqual({ names: ["Kowal", "ZDZICHU"], stage: "FINAŁ" });
    expect(turniejPair("4|1;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|4|3|-;Kowal||0|0|-")).toEqual({ names: ["ZDZICHU", "RYSIEK"], stage: "PÓŁFINAŁ" });
  });
});
