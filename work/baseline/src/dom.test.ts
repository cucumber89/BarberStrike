import { describe, expect, it } from "vitest";
import { DOM, domTick, flagStatus, inFlagZone, neutralFlag, stepFlag } from "./dom";
import { MODES } from "./modes";
import { MATCH } from "./constants";

/** Drop 4: Domination capture rules. */

const flag = { id: "A", name: "A", x: 10, y: 0, z: 10 };

describe("flag zone", () => {
  it("is a horizontal disc with a height tolerance", () => {
    expect(inFlagZone(flag, 10, 0, 10)).toBe(true);
    expect(inFlagZone(flag, 10 + DOM.radius - 0.01, 0, 10)).toBe(true);
    expect(inFlagZone(flag, 10 + DOM.radius + 0.01, 0, 10)).toBe(false);
    expect(inFlagZone(flag, 10, DOM.heightTolerance + 0.5, 10)).toBe(false); // a mezzanine above does not count
  });
});

describe("capturing", () => {
  it("a lone capturer takes a neutral flag in exactly captureMs", () => {
    const f = neutralFlag();
    let captured: number = -1;
    let t = 0;
    while (captured === -1 && t < 20000) { captured = stepFlag(f, 1, 0, 50); t += 50; }
    expect(captured).toBe(0);
    expect(t).toBe(DOM.captureMs);
    expect(f).toEqual({ owner: 0, capTeam: -1, cap: 0 });
  });

  it("more capturers are faster, capped at maxCapturers", () => {
    const time = (n: number): number => {
      const f = neutralFlag();
      let t = 0;
      while (stepFlag(f, 0, n, 50) === -1) t += 50;
      return t + 50;
    };
    expect(time(2)).toBeLessThan(time(1));
    expect(time(3)).toBeLessThan(time(2));
    expect(time(6)).toBe(time(DOM.maxCapturers));
  });

  it("is frozen while contested and bleeds off when the zone empties", () => {
    const f = neutralFlag();
    stepFlag(f, 1, 0, 3000);
    expect(f.cap).toBeCloseTo(0.5);
    stepFlag(f, 1, 1, 3000);
    expect(f.cap).toBeCloseTo(0.5); // contested: nothing moves either way
    expect(flagStatus(f, true)).toBe("contested");
    stepFlag(f, 0, 0, 1500);
    expect(f.cap).toBeCloseTo(0.25); // empty: bleeds at the capture rate
    stepFlag(f, 0, 0, 3000);
    expect(f).toEqual({ owner: -1, capTeam: -1, cap: 0 });
  });

  it("the owner standing on their flag clears an enemy's progress twice as fast; a new attacker starts over", () => {
    const f = neutralFlag();
    stepFlag(f, 1, 0, DOM.captureMs); // team 0 owns it
    expect(f.owner).toBe(0);
    stepFlag(f, 0, 1, 3000);
    expect(f.capTeam).toBe(1); expect(f.cap).toBeCloseTo(0.5);
    stepFlag(f, 1, 0, 1500);
    expect(f.cap).toBeCloseTo(0); // 0.5 gone in 1.5 s = double speed
    expect(f.owner).toBe(0);
    // Neutral flag: team 0 half way, then only team 1 arrives → team 1 starts from zero.
    const g = neutralFlag();
    stepFlag(g, 1, 0, 3000);
    stepFlag(g, 0, 1, 50);
    expect(g.capTeam).toBe(1);
    expect(g.cap).toBeLessThan(0.02);
  });

  it("scores one point per held flag per tick", () => {
    const flags = [neutralFlag(), neutralFlag(), neutralFlag()];
    expect(domTick(flags)).toEqual([0, 0]);
    flags[0].owner = 0; flags[1].owner = 0; flags[2].owner = 1;
    expect(domTick(flags)).toEqual([2, 1]);
    expect(flagStatus(flags[0], false)).toBe("owned");
    expect(flagStatus(neutralFlag(), false)).toBe("neutral");
  });
});

describe("modes", () => {
  it("names the limits the rooms enforce", () => {
    expect(MODES.tdm.scoreLimit).toBe(MATCH.scoreLimit);
    expect(MODES.dom.scoreLimit).toBe(DOM.scoreLimit);
    expect(MODES.ffa.teams).toBe(false);
    expect(MODES.dom.teams).toBe(true);
  });
});
