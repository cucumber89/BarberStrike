import { describe, expect, it } from "vitest";
import {
  BADGES, MAX_LEVEL, XP, addMatch, emptyLifetime, levelFor, newBadges, titleFor, xpForMatch, xpToNext,
  type LifetimeStats, type MatchStats,
} from "./progression";

const match = (over: Partial<MatchStats> = {}): MatchStats => ({
  kills: 0, headshots: 0, assists: 0, deaths: 0, captures: 0, wavesSurvived: 0, result: -1, mode: "tdm", ...over,
});

describe("match XP", () => {
  it("pays for every line it shows, and shows every line it pays for", () => {
    const { lines, total } = xpForMatch(match({ kills: 8, headshots: 3, assists: 2, captures: 1, wavesSurvived: 4, result: 1 }));
    expect(total).toBe(8 * XP.kill + 3 * XP.headshot + 2 * XP.assist + XP.capture + 4 * XP.waveSurvived + XP.played + XP.win);
    // The screen has to explain itself: a bare total teaches a player nothing.
    expect(lines.reduce((n, l) => n + l.xp, 0)).toBe(total);
    expect(lines.every((l) => l.xp > 0)).toBe(true);
  });

  it("never lists a zero", () => {
    const { lines } = xpForMatch(match({ result: -1 }));
    expect(lines.map((l) => l.label)).toEqual(["Rozegrany mecz"]);
  });

  it("pays for turning up, wins more than draws, and draws more than losses", () => {
    const lost = xpForMatch(match({ result: -1 })).total;
    const drew = xpForMatch(match({ result: 0 })).total;
    const won = xpForMatch(match({ result: 1 })).total;
    expect(lost).toBe(XP.played);
    expect(drew).toBeGreaterThan(lost);
    expect(won).toBeGreaterThan(drew);
  });
});

describe("levels", () => {
  it("starts at 1 with nothing, and the bar never lies", () => {
    const l0 = levelFor(0);
    expect(l0).toMatchObject({ level: 1, into: 0, need: xpToNext(1), total: 0 });
    // `into` is always inside the level it reports, or the bar overflows on screen.
    for (const xp of [0, 1, 999, 1000, 1001, 5_000, 50_000, 500_000]) {
      const l = levelFor(xp);
      expect(l.into, `into at ${xp}`).toBeGreaterThanOrEqual(0);
      if (l.level < MAX_LEVEL) expect(l.into, `into at ${xp}`).toBeLessThan(l.need);
    }
  });

  it("charges exactly what `xpToNext` says, level by level", () => {
    let acc = 0;
    for (let lvl = 1; lvl < 8; lvl++) {
      expect(levelFor(acc).level, `at ${acc} xp`).toBe(lvl);
      acc += xpToNext(lvl);
      expect(levelFor(acc).level, `one xp short of ${lvl + 1} was ${acc}`).toBe(lvl + 1);
      expect(levelFor(acc - 1).level).toBe(lvl);
    }
  });

  it("stops at the ceiling instead of looping for ever", () => {
    const l = levelFor(50_000_000);
    expect(l.level).toBe(MAX_LEVEL);
    expect(Number.isFinite(l.into)).toBe(true);
  });

  it("gives a title that only ever goes up", () => {
    let last = titleFor(1);
    const seen = [last];
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      const t = titleFor(lvl);
      if (t !== last) { seen.push(t); last = t; }
    }
    expect(seen[0]).toBe("PRAKTYKANT");
    expect(new Set(seen).size).toBe(seen.length); // never returns to an earlier title
  });
});

describe("badges", () => {
  const life = (over: Partial<LifetimeStats> = {}): LifetimeStats => ({ ...emptyLifetime(), ...over });

  it("has no badge that is earned by doing nothing", () => {
    for (const b of BADGES) expect(b.earned(emptyLifetime()), `${b.id} on a fresh profile`).toBe(false);
  });

  it("has unique ids and names", () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(new Set(BADGES.map((b) => b.name)).size).toBe(BADGES.length);
  });

  it("reports only what is newly earned", () => {
    const before = life({ kills: 99 });
    const after = life({ kills: 100 });
    expect(newBadges(before, after)).toEqual(["kills-100"]);
    // Nothing already held is announced again — a badge is news exactly once.
    expect(newBadges(after, life({ kills: 120 }))).toEqual([]);
  });

  it("counts a flawless match as no deaths AND some kills", () => {
    const start = emptyLifetime();
    const idle = addMatch(start, { kills: 0, headshots: 0, assists: 0, deaths: 0, captures: 0, wavesSurvived: 0, result: -1, mode: "tdm" }, 0);
    expect(idle.flawless, "standing in a corner is not a flawless match").toBe(0);
    const real = addMatch(start, { kills: 4, headshots: 0, assists: 0, deaths: 0, captures: 0, wavesSurvived: 0, result: 1, mode: "tdm" }, 0);
    expect(real.flawless).toBe(1);
  });

  it("keeps the best single match, not the last one", () => {
    let l = addMatch(emptyLifetime(), match({ kills: 12 }), 0);
    l = addMatch(l, match({ kills: 3 }), 0);
    expect(l.bestKills).toBe(12);
    expect(l.kills).toBe(15);
  });
});
