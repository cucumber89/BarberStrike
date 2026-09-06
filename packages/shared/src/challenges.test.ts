import { describe, expect, it } from "vitest";
import { CHALLENGE_POOL, DAILY_COUNT, advanceDaily, dailyChallenges, dailyProgress, dayKey, emptyDaily } from "./challenges";
import type { MatchStats } from "./progression";

const match = (over: Partial<MatchStats> = {}): MatchStats => ({
  kills: 0, headshots: 0, assists: 0, deaths: 0, captures: 0, wavesSurvived: 0, result: -1, mode: "tdm", ...over,
});

describe("daily challenges", () => {
  it("has unique ids and sane numbers in the pool", () => {
    expect(new Set(CHALLENGE_POOL.map((c) => c.id)).size).toBe(CHALLENGE_POOL.length);
    for (const c of CHALLENGE_POOL) {
      expect(c.goal).toBeGreaterThan(0);
      expect(c.xp).toBeGreaterThan(0);
      expect(c.text.length).toBeGreaterThan(5);
    }
  });

  it("picks the same three for the same day, on every machine", () => {
    const a = dailyChallenges("2026-09-06").map((c) => c.id);
    const b = dailyChallenges("2026-09-06").map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DAILY_COUNT);
    expect(new Set(a).size).toBe(DAILY_COUNT);
  });

  it("changes from day to day, and never doubles a family", () => {
    const days = Array.from({ length: 60 }, (_, i) => dayKey(new Date(2026, 0, 1 + i)));
    const sets = days.map((d) => dailyChallenges(d).map((c) => c.id).join(","));
    // Not every day has to differ from every other, but a pick that ignored the date would.
    expect(new Set(sets).size).toBeGreaterThan(30);
    for (const d of days) {
      const fam = dailyChallenges(d).map((c) => (c.id.startsWith("w-") ? c.id.split("-")[1] : c.id.split("-")[0]));
      expect(new Set(fam).size, d).toBe(fam.length);
    }
  });

  it("formats the day locally", () => {
    expect(dayKey(new Date(2026, 8, 6, 23, 59))).toBe("2026-09-06");
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("counts a match, caps at the goal, finishes once, and pays what it promised", () => {
    const day = "2026-09-06";
    const cs = dailyChallenges(day);
    // Drive one match that satisfies everything at once.
    const stats = match({ kills: 100, headshots: 50, assists: 20, captures: 10, wavesSurvived: 20, result: 1, mode: "dom" });
    const weapons = Object.fromEntries(["clippers", "shotgun", "sniper", "pistol", "revolver", "frag", "knife", "launcher", "lmg", "smg2", "dmr"].map((w) => [w, 50]));
    const first = advanceDaily(null, day, stats, weapons);
    // Whatever the day picked, a "matches-N" or "wins-2" goal cannot finish in one match; the rest can.
    for (const c of cs) {
      const p = dailyProgress(first.state, day, c);
      expect(p.have).toBeLessThanOrEqual(c.goal);
      if (c.goal === 1 || !/^(matches|wins)-/.test(c.id)) expect(p.done, c.id).toBe(true);
    }
    const second = advanceDaily(first.state, day, stats, weapons);
    for (const c of first.completed) expect(second.completed.map((x) => x.id)).not.toContain(c.id);
    expect(second.state.done).toEqual(first.state.done.concat(second.completed.map((c) => c.id)));
  });

  it("forgets yesterday", () => {
    const y = advanceDaily(emptyDaily("2026-09-05"), "2026-09-05", match({ kills: 5 }), {});
    const today = advanceDaily(y.state, "2026-09-06", match(), {});
    expect(today.state.day).toBe("2026-09-06");
    expect(today.state.done).toEqual([]);
    expect(Object.values(today.state.progress).every((v) => v === 0)).toBe(true);
    expect(dailyProgress(y.state, "2026-09-06", dailyChallenges("2026-09-06")[0])).toEqual({ have: 0, done: false });
  });
});
