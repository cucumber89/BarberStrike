import { describe, expect, it } from "vitest";
import { DUEL, GUN_GAME, MODES, MODE_ORDER, OSTRZYZENI, convertsOnKill, duelRoundWinner, duelSpawnSide, infectionRoundWinner, ladderAfterKill, ladderDone, ladderRung, ladderWeapon, pickFirstShaved } from "./modes";
import { GAME_MODES, isGameMode } from "./types";
import { WEAPONS, WEAPON_ORDER } from "./weapons";
import { WEAPON_PRICES } from "./economy";

describe("Drop D modes are in every list the lobby and the matchmaker read", () => {
  it("names every mode once, in the picker order", () => {
    // The picker's list and the matchmaker's list are the same list.
    expect([...MODE_ORDER].sort()).toEqual([...GAME_MODES].sort());
    // `MODES` also has to describe every mode a room can still be in, which is a superset: The
    // Boys replaced FFA in the picker (PR #14) without making FFA unplayable, so a room asking
    // for it — an old link, a saved preference — must still find a name and a score limit.
    for (const m of GAME_MODES) expect(MODES[m]).toBeDefined();
    expect(Object.keys(MODES).sort()).toEqual([...GAME_MODES, "ffa"].sort());
    expect(MODE_ORDER).not.toContain("ffa");
    expect(isGameMode("ffa"), "still playable, just not offered").toBe(true);
    expect(MODES.boys.teams, "main's mode survived the merge").toBe(true);
    expect(MODES.gungame.teams).toBe(false);
    expect(MODES.gungame.shop).toBe("none");
    expect(MODES.ostrzyzeni.teams).toBe(true);
    expect(MODES.ostrzyzeni.shop).toBe("survivors");
    expect(MODES.ostrzyzeni.winner).toBe("player");
    expect(MODES.duel.teams).toBe(true);
    expect(MODES.duel.scoreLimit).toBe(DUEL.wins);
  });
});

describe("1 v 1 (GÓRA tournament pass)", () => {
  const P = (team: number, alive: boolean, health: number, connected = true) => ({ team, alive, connected, health });

  it("swaps the spawn sets every halfRounds, so both players get both starts", () => {
    expect(duelSpawnSide(0, 1)).toBe(0); expect(duelSpawnSide(1, 1)).toBe(1);
    expect(duelSpawnSide(0, DUEL.halfRounds)).toBe(0);
    expect(duelSpawnSide(0, DUEL.halfRounds + 1)).toBe(1); expect(duelSpawnSide(1, DUEL.halfRounds + 1)).toBe(0);
    expect(duelSpawnSide(0, 2 * DUEL.halfRounds + 1)).toBe(0);
    // Never both on one set.
    for (let r = 1; r <= 2 * DUEL.wins; r++) expect(duelSpawnSide(0, r)).not.toBe(duelSpawnSide(1, r));
  });

  it("ends a round on a kill, calls a trade a draw, and settles the clock on health", () => {
    const t = 10000;
    expect(duelRoundWinner([P(0, true, 100), P(1, true, 100)], 0, t)).toBeNull();
    expect(duelRoundWinner([P(0, true, 37), P(1, false, 0)], 0, t)).toEqual({ winner: 0, reason: "ELIMINATED" });
    expect(duelRoundWinner([P(0, false, 0), P(1, true, 1)], 0, t)).toEqual({ winner: 1, reason: "ELIMINATED" });
    expect(duelRoundWinner([P(0, false, 0), P(1, false, 0)], 0, t)?.winner).toBe(-1);
    expect(duelRoundWinner([P(0, true, 80), P(1, true, 45)], t, t)?.winner).toBe(0);
    expect(duelRoundWinner([P(0, true, 45), P(1, true, 80)], t, t)?.winner).toBe(1);
    expect(duelRoundWinner([P(0, true, 60), P(1, true, 60)], t, t)?.winner).toBe(-1);
    // A side that is not connected is not judged: the clock is held for them.
    expect(duelRoundWinner([P(0, true, 60), P(1, true, 60, false)], t, t)).toBeNull();
  });

  it("gives every gun on the roster a price under the round money", () => {
    for (const w of WEAPON_ORDER) expect(WEAPON_PRICES[w]).toBeLessThan(DUEL.roundMoney);
  });
});

describe("Gun Game ladder", () => {
  it("is the complete weapon roster, each once, clippers last", () => {
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
    expect(ladderRung("clippers")).toBe(13);
    expect(ladderRung("frag")).toBe(-1);
    expect(ladderDone(13)).toBe(false);
    expect(ladderDone(14)).toBe(true);
  });

  it("a kill with the rung weapon moves the killer up one and leaves the victim alone", () => {
    expect(ladderAfterKill(0, 4, "pistol")).toEqual({ killer: 1, victim: 4 });
    expect(ladderAfterKill(12, 0, "launcher")).toEqual({ killer: 13, victim: 0 });
  });

  it("a clippers kill sets the victim back one, never below the first rung, and does not advance a killer whose rung is a gun", () => {
    expect(ladderAfterKill(3, 4, "clippers")).toEqual({ killer: 3, victim: 3 });
    expect(ladderAfterKill(3, 0, "clippers")).toEqual({ killer: 3, victim: 0 });
  });

  it("on the last rung the clippers are the rung weapon: the kill both finishes the ladder and shaves the victim", () => {
    const r = ladderAfterKill(13, 7, "clippers");
    expect(r).toEqual({ killer: 14, victim: 6 });
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
