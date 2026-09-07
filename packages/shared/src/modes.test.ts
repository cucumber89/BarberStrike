import { describe, expect, it } from "vitest";
import { GUN_GAME, MODES, MODE_ORDER, OSTRZYZENI, convertsOnKill, infectionRoundWinner, ladderAfterKill, ladderDone, ladderRung, ladderWeapon, pickFirstShaved } from "./modes";
import { GAME_MODES } from "./types";
import { WEAPONS, WEAPON_ORDER } from "./weapons";

describe("Drop D modes are in every list the lobby and the matchmaker read", () => {
  it("names every mode once, in the picker order", () => {
    expect([...MODE_ORDER].sort()).toEqual([...GAME_MODES].sort());
    expect(Object.keys(MODES).sort()).toEqual([...GAME_MODES].sort());
    expect(MODES.gungame.teams).toBe(false);
    expect(MODES.gungame.shop).toBe("none");
    expect(MODES.ostrzyzeni.teams).toBe(true);
    expect(MODES.ostrzyzeni.shop).toBe("survivors");
    expect(MODES.ostrzyzeni.winner).toBe("player");
  });
});

describe("Gun Game ladder", () => {
  it("is all 11 weapons, each once, clippers last", () => {
    expect(GUN_GAME.ladder).toHaveLength(WEAPON_ORDER.length);
    expect([...GUN_GAME.ladder].sort()).toEqual([...WEAPON_ORDER].sort());
    expect(GUN_GAME.ladder[GUN_GAME.ladder.length - 1]).toBe("clippers");
    for (const w of GUN_GAME.ladder) expect(WEAPONS[w]).toBeDefined();
    expect(MODES.gungame.scoreLimit).toBe(GUN_GAME.ladder.length);
  });

  it("maps rungs to weapons and back, clamped at both ends", () => {
    expect(ladderWeapon(0)).toBe("pistol");
    expect(ladderWeapon(-3)).toBe("pistol");
    expect(ladderWeapon(99)).toBe("clippers");
    expect(ladderRung("pistol")).toBe(0);
    expect(ladderRung("clippers")).toBe(10);
    expect(ladderRung("frag")).toBe(-1);
    expect(ladderDone(10)).toBe(false);
    expect(ladderDone(11)).toBe(true);
  });

  it("a kill with the rung weapon moves the killer up one and leaves the victim alone", () => {
    expect(ladderAfterKill(0, 4, "pistol")).toEqual({ killer: 1, victim: 4 });
    expect(ladderAfterKill(9, 0, "launcher")).toEqual({ killer: 10, victim: 0 });
  });

  it("a clippers kill sets the victim back one, never below the first rung, and does not advance a killer whose rung is a gun", () => {
    expect(ladderAfterKill(3, 4, "clippers")).toEqual({ killer: 3, victim: 3 });
    expect(ladderAfterKill(3, 0, "clippers")).toEqual({ killer: 3, victim: 0 });
  });

  it("on the last rung the clippers are the rung weapon: the kill both finishes the ladder and shaves the victim", () => {
    const r = ladderAfterKill(10, 7, "clippers");
    expect(r).toEqual({ killer: 11, victim: 6 });
    expect(ladderDone(r.killer)).toBe(true);
  });

  it("a kill with something that is not the rung weapon changes nothing", () => {
    expect(ladderAfterKill(2, 5, "rifle")).toEqual({ killer: 2, victim: 5 });
    expect(ladderAfterKill(2, 5, "fire")).toEqual({ killer: 2, victim: 5 });
  });
});

describe("Ostrzyżeni conversion rule", () => {
  it("only the clippers convert, only an unshaved victim, only while the round is live", () => {
    expect(convertsOnKill("clippers", false)).toBe(true);
    expect(convertsOnKill("clippers", true)).toBe(false);
    expect(convertsOnKill("rifle", false)).toBe(false);
    expect(convertsOnKill("clippers", false, false)).toBe(false);
  });

  it("the shaved side wins the moment nobody unshaved is standing; the survivors win on the clock", () => {
    const s = (alive: boolean, shaved: boolean, connected = true) => ({ alive, shaved, connected });
    const t = 1000, end = 5000;
    expect(infectionRoundWinner([s(true, true), s(true, false)], t, end)).toBeNull();
    expect(infectionRoundWinner([s(true, true), s(false, false)], t, end)).toBe("shaved");
    expect(infectionRoundWinner([s(true, true), s(true, true)], t, end)).toBe("shaved");
    // A survivor who left the room does not keep the round alive.
    expect(infectionRoundWinner([s(true, true), s(true, false, false)], t, end)).toBe("shaved");
    expect(infectionRoundWinner([s(true, true), s(true, false)], end, end)).toBe("survivors");
    // A dead chaser changes nothing: the shaved side respawns, a survivor standing is what counts.
    expect(infectionRoundWinner([s(false, true), s(true, false)], t, end)).toBeNull();
  });

  it("picks the first shaved from the connected players with the room's RNG", () => {
    const ps = [{ id: "a", connected: true }, { id: "b", connected: false }, { id: "c", connected: true }];
    expect(pickFirstShaved(ps, () => 0)?.id).toBe("a");
    expect(pickFirstShaved(ps, () => 0.99)?.id).toBe("c");
    expect(pickFirstShaved([], () => 0)).toBeNull();
    expect(OSTRZYZENI.shavedTeam).not.toBe(OSTRZYZENI.survivorTeam);
  });
});
