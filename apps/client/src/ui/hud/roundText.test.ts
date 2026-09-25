import { describe, expect, it } from "vitest";
import { BOMB, OSTRZYZENI } from "@frankibarber/shared";
import { freezeCopy, halftimeCard, mvpText, roleCopy, roundBannerCopy, roundEnd, roundReason, roundReasonShort, roundReasonText, type RoundBannerInput } from "./roundText";
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
