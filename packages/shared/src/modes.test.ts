import { describe, expect, it } from "vitest";
import { DUEL, GUN_GAME, MODES, MODE_ORDER, OSTRZYZENI, TOURNAMENT, convertsOnKill, isOpenMode, modeCapacity, openPlayerCap,
  TDM_SCORE_LIMIT_MAX, scoreLimitFor, tdmScoreLimit,
  duelHalfStart, duelKillReward, duelLossBonus, duelPurseAfter, duelStartMoney, freshDuelPurse, duelRoundWinner, duelSpawnSide, infectionRoundWinner, ladderAfterKill, ladderDone, ladderRung, ladderWeapon, pickFirstShaved } from "./modes";
import { GAME_MODES, isGameMode } from "./types";
import { MATCH, MAX_PLAYERS, OPEN_MAX_PLAYERS, OPEN_PLAYER_CAP_MAX } from "./constants";
import { WEAPONS, WEAPON_ORDER } from "./weapons";
import { ARMOR } from "./perks";
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

  it("the longest decided duel fits DUEL.matchMs", () => {
    // First to `wins` with every round decided is 5–5 and an eleventh: 2 · wins − 1 rounds, each a
    // freeze, a round and a break. 11 × (15 + 60 + 5) s = 880 s, 20 s inside the 900 s cap — which
    // is why the duel's break is 5 s and not CS's 7 (11 × 82 = 902 would not fit). Drawn rounds
    // can still run past it; that is what the cap is for.
    const rounds = 2 * DUEL.wins - 1;
    const longest = rounds * (DUEL.prepMs + DUEL.roundMs + DUEL.breakMs);
    expect(rounds).toBe(11);
    expect(DUEL.breakMs).toBe(5000);
    expect(longest).toBe(880_000);
    expect(longest).toBeLessThanOrEqual(DUEL.matchMs);
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

  /**
   * The floor is a GAMEPLAY promise, so it is pinned against the price list rather than against
   * itself: whatever a round has done to you, you can still walk out with a real primary and a
   * plate. It deliberately does NOT reach the rifle (2600) or the sniper (3400) — those stay
   * something a won round buys, or the economy would have nothing left to be about.
   */
  it("keeps a floored duellist in a real gun and a plate, and the best guns out of reach", () => {
    const floor = DUEL.economy.floor;
    expect(WEAPON_PRICES.carbine, "a floored round still buys a proper primary").toBeLessThanOrEqual(floor);
    expect(WEAPON_PRICES.smg + ARMOR.heavy.price, "or a lighter gun and the heavy plate").toBeLessThanOrEqual(floor);
    expect(WEAPON_PRICES.rifle, "the rifle is earned, not floored into your hand").toBeGreaterThan(floor);
    // The pistol round is the pistol round: the free sidearm and an upgrade, nothing more.
    expect(WEAPON_PRICES.revolver).toBeLessThanOrEqual(DUEL.economy.start);
    for (const w of WEAPON_ORDER) expect(WEAPON_PRICES[w], `${w} is reachable in a won round`).toBeLessThan(DUEL.economy.win + floor);
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

/**
 * How many people fit, per mode. One table, read by the room (seats and `maxClients`), by
 * `/health` and by anything that wants to print a denominator, so the answer cannot differ
 * between the server that enforces it and the screen that shows it.
 */
describe("room capacity", () => {
  it("makes deathmatch an open lobby and leaves every other mode its roster", () => {
    expect(isOpenMode("tdm"), "TEAM DEATHMATCH").toBe(true);
    expect(isOpenMode("ffa"), "FREE FOR ALL").toBe(true);
    for (const m of GAME_MODES) {
      if (m === "tdm" || m === "ffa") continue;
      expect(isOpenMode(m), `${m} keeps its roster`).toBe(false);
      // The two brackets of the mode table: a duel is its two seats, a tournament is its whole
      // draw, everything else is the twelve-body roster.
      expect(modeCapacity(m)).toBe(m === "duel" ? DUEL.players : m === "turniej" ? TOURNAMENT.maxSize : MAX_PLAYERS);
    }
    expect(modeCapacity("tdm")).toBe(OPEN_MAX_PLAYERS);
    expect(modeCapacity("ffa")).toBe(OPEN_MAX_PLAYERS);
  });

  it("says the same thing in the mode table as in the rules", () => {
    // MODES is defined before DUEL and TOURNAMENT, so the tournament card spells its numbers out.
    // This is what stops them drifting apart.
    expect(MODES.turniej.scoreLimit, "a pair is first to DUEL.wins").toBe(DUEL.wins);
    expect(MODES.turniej.blurb).toContain(`${DUEL.wins} rund`);
    expect(MODES.turniej.blurb).toContain(TOURNAMENT.sizes.join(" albo "));
    expect(MODES.turniej.objective).toContain(`${DUEL.wins} rund`);
  });

  it("lets a host move the open cap, within what the build will serve", () => {
    expect(openPlayerCap(undefined), "unset falls back to the measured default").toBe(OPEN_MAX_PLAYERS);
    expect(openPlayerCap("")).toBe(OPEN_MAX_PLAYERS);
    expect(openPlayerCap("not a number")).toBe(OPEN_MAX_PLAYERS);
    expect(openPlayerCap("24")).toBe(24);
    expect(openPlayerCap(40.4)).toBe(40);
    // Clamped, never refused: a typo in an env var on somebody's VPS must not stop a room starting.
    expect(openPlayerCap("0")).toBe(2);
    expect(openPlayerCap("-9")).toBe(2);
    expect(openPlayerCap("100000")).toBe(OPEN_PLAYER_CAP_MAX);
    // And the cap only reaches the modes it is for.
    expect(modeCapacity("tdm", openPlayerCap("24"))).toBe(24);
    expect(modeCapacity("bomb", openPlayerCap("24"))).toBe(MAX_PLAYERS);
    expect(modeCapacity("duel", openPlayerCap("24"))).toBe(DUEL.players);
  });

  it("holds at least the old room, so nothing this changes can make a room smaller", () => {
    // A duel and a tournament are the two modes whose roster is smaller than the old room ON
    // PURPOSE: two seats, and one bracket.
    for (const m of GAME_MODES) expect(modeCapacity(m)).toBeGreaterThanOrEqual(m === "duel" ? 2 : m === "turniej" ? TOURNAMENT.maxSize : MAX_PLAYERS);
    expect(OPEN_MAX_PLAYERS).toBeGreaterThan(MAX_PLAYERS);
    expect(OPEN_PLAYER_CAP_MAX).toBeGreaterThanOrEqual(OPEN_MAX_PLAYERS);
  });
});

/**
 * The 1 v 1's economy: Counter-Strike's, with the floor the owner asked for.
 *
 * Every number here is a CS number (start $800, round $3250, the $1400→$3400 ladder, the kill
 * table) except `floor`, which is the one deliberate departure and is tested as such: it is what
 * a duellist ACTUALLY starts a round with, and the pistol round is exempt from it.
 */
describe("the duel economy", () => {
  it("pays the round award, climbs the loss ladder, and stops at its top", () => {
    const e = DUEL.economy;
    let purse = freshDuelPurse();
    expect(purse.money).toBe(e.start);

    // Three losses in a row: each pays one rung further up the ladder.
    purse = duelPurseAfter({ money: 0, losses: 0 }, "loss");
    expect(purse).toEqual({ money: e.lossBase, losses: 1 });
    purse = duelPurseAfter(purse, "loss");
    expect(purse.money).toBe(e.lossBase + (e.lossBase + e.lossStep));
    expect(purse.losses).toBe(2);
    // The ladder stops climbing at lossMax however long the run gets.
    expect(duelLossBonus(0)).toBe(e.lossBase);
    expect(duelLossBonus(99)).toBe(e.lossMax);

    // A win pays the round award and clears the streak.
    const won = duelPurseAfter({ money: 1000, losses: 3 }, "win");
    expect(won).toEqual({ money: 1000 + e.win, losses: 0 });

    // A drawn round (a trade, or the clock with even health) pays the first rung and punishes
    // nobody's next round: neither player lost it.
    const drawn = duelPurseAfter({ money: 500, losses: 2 }, "draw");
    expect(drawn).toEqual({ money: 500 + e.lossBase, losses: 2 });

    // Nobody carries more than the cap.
    expect(duelPurseAfter({ money: e.max, losses: 0 }, "win").money).toBe(e.max);
  });

  it("starts a half on pistol money and every other round on at least the floor", () => {
    const e = DUEL.economy;
    // Rounds 1, 4, 7… are the pistol rounds — the swap rounds, and the ones the floor skips.
    expect(duelHalfStart(1)).toBe(true);
    expect(duelHalfStart(DUEL.halfRounds + 1)).toBe(true);
    for (let r = 2; r <= DUEL.halfRounds; r++) expect(duelHalfStart(r), `round ${r}`).toBe(false);

    expect(duelStartMoney({ money: 12000, losses: 0 }, 1), "a pistol round is a pistol round").toBe(e.start);
    expect(duelStartMoney({ money: 200, losses: 2 }, 2), "the floor catches a broke duellist").toBe(e.floor);
    expect(duelStartMoney({ money: 7400, losses: 0 }, 2), "and leaves a rich one alone").toBe(7400);
    expect(duelStartMoney({ money: 99999, losses: 0 }, 2)).toBe(e.max);
  });

  it("pays a kill by the weapon that made it, CS's table", () => {
    expect(duelKillReward("clippers"), "the knife award, and this game's knife is a pair of clippers").toBe(1500);
    expect(duelKillReward("shotgun")).toBe(900);
    expect(duelKillReward("autoshotgun")).toBe(900);
    expect(duelKillReward("smg")).toBe(600);
    expect(duelKillReward("machinepistol")).toBe(600);
    expect(duelKillReward("sniper"), "the AWP tax").toBe(100);
    expect(duelKillReward("rifle"), "the flat award").toBe(300);
    expect(duelKillReward("pistol")).toBe(300);
    expect(duelKillReward("something else entirely")).toBe(300);
  });

  it("gives the buy window CS's shape: the freeze, and a tail past it", () => {
    expect(DUEL.prepMs, "mp_freezetime").toBe(15000);
    expect(DUEL.prepMs + DUEL.buyTailMs, "mp_buytime, counted from the start of the round").toBe(20000);
    // The freeze cannot be longer than the round it prepares for.
    expect(DUEL.prepMs).toBeLessThan(DUEL.roundMs);
  });
});

/**
 * How long a deathmatch lasts, now that a room can hold forty bodies. TDM's is a TEAM total, so it
 * fills at the rate the whole room shoots; FFA's is a personal one and is deliberately fixed.
 */
describe("the deathmatch limit follows the room", () => {
  it("leaves a normal room exactly as it was", () => {
    expect(tdmScoreLimit(MAX_PLAYERS)).toBe(MATCH.scoreLimit);
    expect(tdmScoreLimit(2), "a two-player room does not get a shorter match than the shipped one").toBe(MATCH.scoreLimit);
    expect(scoreLimitFor("tdm", MAX_PLAYERS)).toBe(MATCH.scoreLimit);
  });

  it("raises it with the crowd, and stops at a number somebody has time to reach", () => {
    expect(tdmScoreLimit(24), "twice the bodies, twice the kills").toBe(MATCH.scoreLimit * 2);
    expect(tdmScoreLimit(40)).toBeGreaterThan(MATCH.scoreLimit * 3);
    expect(tdmScoreLimit(40)).toBeLessThanOrEqual(TDM_SCORE_LIMIT_MAX);
    expect(tdmScoreLimit(1000), "the ceiling holds").toBe(TDM_SCORE_LIMIT_MAX);
    // It only ever climbs, so a player who joins cannot end the match by arriving.
    for (let n = 2; n < 60; n++) expect(tdmScoreLimit(n + 1)).toBeGreaterThanOrEqual(tdmScoreLimit(n));
  });

  it("moves nothing else", () => {
    for (const m of GAME_MODES) {
      if (m === "tdm") continue;
      expect(scoreLimitFor(m, 40), m).toBe(MODES[m].scoreLimit);
    }
    expect(scoreLimitFor("ffa", 40), "FFA's is a personal total: more players make it harder, not easier").toBe(MODES.ffa.scoreLimit);
  });
});
