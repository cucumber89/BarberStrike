import { describe, expect, it } from "vitest";
import { bracketString, currentMatch, reportWinner, seedBracket } from "@frankibarber/shared";
import { mulberry32 } from "@frankibarber/shared";
import { bracketLine, standing } from "./Bracket";

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
