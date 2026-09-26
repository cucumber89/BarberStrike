import { describe, expect, it } from "vitest";
import { MatchPhase } from "@frankibarber/shared";
import { escapeAsksMenu, pausedAfterPhase } from "./PauseMenu";

/**
 * The menu never crosses a match's end (§6.1 New match): the auditor's case was Escape pressed
 * during Ended (or the menu open when the match ended), which left `paused` true, so the first
 * Waiting frame opened the ESC column and its dim beside „KLIKNIJ, ŻEBY GRAĆ”.
 */
const PHASES = Object.values(MatchPhase);

/** The component's two paths, replayed: Escape (if not already paused) then each phase edge. */
function replay(steps: (MatchPhase | "esc")[], start: MatchPhase): boolean {
  let paused = false, phase = start;
  for (const s of steps) {
    if (s === "esc") { if (!paused && escapeAsksMenu(phase)) paused = true; continue; }
    paused = pausedAfterPhase(paused, phase, s);
    phase = s;
  }
  return paused && phase !== MatchPhase.Ended;
}

describe("PauseMenu across a match's end", () => {
  it("Escape during Ended asks for no menu", () => {
    expect(escapeAsksMenu(MatchPhase.Ended)).toBe(false);
    for (const p of PHASES.filter((p) => p !== MatchPhase.Ended)) expect(escapeAsksMenu(p)).toBe(true);
  });

  it("every edge into or out of Ended clears the menu; no other edge touches it", () => {
    for (const was of PHASES) for (const now of PHASES) {
      const crosses = was !== now && (was === MatchPhase.Ended || now === MatchPhase.Ended);
      expect(pausedAfterPhase(true, was, now)).toBe(!crosses);
      expect(pausedAfterPhase(false, was, now)).toBe(false);
    }
  });

  it("the new match starts unpaused: Escape during Ended, then Waiting", () => {
    expect(replay(["esc", MatchPhase.Waiting], MatchPhase.Ended)).toBe(false);
  });

  it("the new match starts unpaused: menu open when the match ended, then Waiting", () => {
    expect(replay(["esc", MatchPhase.Ended, "esc", MatchPhase.Waiting], MatchPhase.Playing)).toBe(false);
    expect(replay(["esc", MatchPhase.Ended, MatchPhase.Waiting], MatchPhase.Playing)).toBe(false);
  });

  it("a pause inside a match survives its own phase edges (warm-up → play)", () => {
    expect(replay(["esc", MatchPhase.Playing], MatchPhase.Waiting)).toBe(true);
  });
});
