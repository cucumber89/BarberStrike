import { describe, expect, it } from "vitest";
import { OSTRZYZENI } from "@frankibarber/shared";
import { roundEnd } from "./roundText";

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
