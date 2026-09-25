import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { countWords, fmtClock, money, plPlural, upperPl } from "./format";

/**
 * The gallery tool's word rule, transcribed from `e2e/tools/hud-states.mjs` (the `words +=` line
 * and the `text` normalisation above it). The first test also checks the tool still carries both
 * pieces, so a change to the tool's rule fails here instead of drifting from `countWords`.
 */
const TOOL = readFileSync(new URL("../../../e2e/tools/hud-states.mjs", import.meta.url), "utf8");
const toolRule = (raw: string): number => {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
};

/** Twelve fixtures and the count §3.10 says each one has. */
const FIXTURES: [string, number][] = [
  ["", 0],
  [" \n\t ", 0],
  ["· — / →", 0],
  ["RUNDA 5 / 12", 3],
  ["FADE 40 — 31 TAPER", 4],
  ["Ładunek wybuchł · MVP Kowal · podłożenie", 5],
  ["(3)", 1],
  ["#3 +790 $4,100", 3],
  ["12s 0:12 [B] ×3", 4],
  ["ZADANE 64 (3) · OTRZYMANE 100 (4)", 6],
  ["  OBSERWUJESZ:\n Kasia_Brzytwa\t· 74 HP ", 4],
  ["C-20 Side Part → M-1", 4],
];

describe("countWords", () => {
  it("countWords equals the tool's token rule on 12 fixtures", () => {
    expect(TOOL).toContain(`.replace(/\\s+/g, " ").trim()`);
    expect(TOOL).toContain(`.split(" ").filter((w) => /[\\p{L}\\p{N}]/u.test(w)).length`);
    expect(FIXTURES).toHaveLength(12);
    for (const [s, n] of FIXTURES) {
      expect(countWords(s), JSON.stringify(s)).toBe(toolRule(s));
      expect(countWords(s), JSON.stringify(s)).toBe(n);
    }
  });
});

describe("plPlural", () => {
  it("plPlural 1/2/5/12/22", () => {
    const g = (n: number) => plPlural(n, "GRACZ", "GRACZE", "GRACZY");
    expect([1, 2, 5, 12, 22].map(g)).toEqual(["GRACZ", "GRACZE", "GRACZY", "GRACZY", "GRACZE"]);
    const b = (n: number) => plPlural(n, "BOT", "BOTY", "BOTÓW");
    expect([0, 1, 3, 4, 11, 13, 14, 24, 25, 104, 112].map(b)).toEqual(["BOTÓW", "BOT", "BOTY", "BOTY", "BOTÓW", "BOTÓW", "BOTÓW", "BOTY", "BOTÓW", "BOTY", "BOTÓW"]);
  });
});

describe("clock, money, case", () => {
  it("fmtClock is m:ss, rounds up, and never goes negative", () => {
    expect(fmtClock(252_000)).toBe("4:12");
    expect(fmtClock(2_001)).toBe("0:03");
    expect(fmtClock(3_000)).toBe("0:03");
    expect(fmtClock(15 * 60_000)).toBe("15:00");
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(-500)).toBe("0:00");
    expect(fmtClock(Infinity)).toBe("0:00");
  });
  it("money writes dollars with thousands separators and the sign in front", () => {
    expect(money(1000)).toBe("$1,000");
    expect(money(4100)).toBe("$4,100");
    expect(money(0)).toBe("$0");
    expect(money(-300)).toBe("-$300");
  });
  it("upperPl keeps the Polish letters", () => {
    expect(upperPl("zwycięstwo")).toBe("ZWYCIĘSTWO");
    expect(upperPl("ładunek na a")).toBe("ŁADUNEK NA A");
    expect(upperPl("żółć źdźbło ńś")).toBe("ŻÓŁĆ ŹDŹBŁO ŃŚ");
  });
});
