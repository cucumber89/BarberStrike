import { describe, expect, it } from "vitest";
import {
  BOMB, BOMB_SITES, DUEL, MatchPhase, NIGHT_DISTRICT, buyWindowLeft, sitesOf,
  type GameMode, type KillEvent, type Team,
} from "@frankibarber/shared";
import {
  LifeDamage, RoundWatch, buyContextFor, flagNoticeFor, killerFrom, lateJoinFor, nearBombFor, respawnAtFor, siteAt,
  type RoundView,
} from "./hudFeed";

/**
 * The HUD's live state (UI_U_SPEC §7 P1 (a)–(g)): each producer `Game` calls, driven the way the
 * room drives it. The buy tests go through the shared `buyWindowLeft` with the very context `Game`
 * builds, so they pin what the player sees under the money, not a helper's intermediate.
 */
const S = 1_000_000;
const me = { spawnedAt: S - 90_000, alive: true, shaved: false };

/** What the buy countdown reads for `mode` at server time `now`. */
function windowLeft(mode: GameMode, phase: MatchPhase, now: number, phaseEndsAt: number, bomb: { stage: string; roundEndsAt: number; result: string } | null): number {
  return buyWindowLeft(buyContextFor({ mode, phase, phaseEndsAt, bomb }, me, now, false));
}
const duelBomb = (result = "") => ({ stage: "idle", roundEndsAt: 0, result });

describe("hudFeed: buying", () => {
  it("duel break: buy window 0", () => {
    // The break after a round: Prep with the round's reason still up. Before drop U the client
    // called every duel Prep a freeze, and the HUD offered a shop the server refused.
    expect(windowLeft("duel", MatchPhase.Prep, S, S + DUEL.breakMs, duelBomb("ELIMINATED"))).toBe(0);
    // The freeze that follows (P-SRV clears the reason there) is the buy window, to its end.
    expect(windowLeft("duel", MatchPhase.Prep, S, S + 12_000, duelBomb(""))).toBe(12_000);
  });

  it("duel buy tail counts 5000→0 after release", () => {
    const release = S;
    const ends = release + DUEL.roundMs; // the round clock, as replicated
    for (const [t, left] of [[0, 5_000], [1_000, 4_000], [4_999, 1], [5_000, 0], [30_000, 0]] as const) {
      expect(windowLeft("duel", MatchPhase.Playing, release + t, ends, duelBomb("")), `${t} ms after the release`).toBe(left);
    }
    // Bomb has the same tail, off its own round clock.
    const b = { stage: "carried", roundEndsAt: release + BOMB.roundMs, result: "" };
    expect(windowLeft("bomb", MatchPhase.Playing, release + 2_000, S + 999_999, b)).toBe(BOMB.buyTailMs - 2_000);
    expect(windowLeft("bomb", MatchPhase.Prep, S, S + 7_000, { ...b, stage: "resolved", result: "BOMB DEFUSED" }), "a bomb break").toBe(0);
  });

  it("turniej buys like the duel", () => {
    for (const [phase, now, endsAt, result] of [
      [MatchPhase.Prep, S, S + 12_000, ""], [MatchPhase.Prep, S, S + DUEL.breakMs, "TIME · MORE HEALTH"],
      [MatchPhase.Playing, S + 3_000, S + DUEL.roundMs, ""], [MatchPhase.Playing, S + 6_000, S + DUEL.roundMs, ""],
    ] as const) {
      expect(windowLeft("turniej", phase, now, endsAt, duelBomb(result)), `${phase} ${result}`)
        .toBe(windowLeft("duel", phase, now, endsAt, duelBomb(result)));
    }
    expect(windowLeft("turniej", MatchPhase.Playing, S + 3_000, S + DUEL.roundMs, duelBomb(""))).toBe(2_000);
    // Before drop U turniej fell through to the continuous rules: an endless shop in every Prep.
    expect(windowLeft("turniej", MatchPhase.Prep, S, S + DUEL.breakMs, duelBomb("ELIMINATED"))).toBe(0);
  });
});

describe("hudFeed: respawn", () => {
  it("respawn deadline uses respawnDelayMs: gungame 3000 / fade 2200 / tdm 3200 / ostrzyżeni survivor next round", () => {
    const at = 50_000, live = MatchPhase.Playing, no = { shaved: false, fade: false };
    expect(respawnAtFor("gungame", live, at, no)).toBe(at + 3_000);
    expect(respawnAtFor("tdm", live, at, { shaved: false, fade: true })).toBe(at + 2_200);
    expect(respawnAtFor("tdm", live, at, no)).toBe(at + 3_200);
    expect(respawnAtFor("dom", live, at, no)).toBe(at + 3_200);
    // Ostrzyżeni: a survivor who is shaved comes back with the clippers on the short timer; one who
    // dies unshaved waits for the next round (0).
    expect(respawnAtFor("ostrzyzeni", live, at, { shaved: true, fade: false })).toBe(at + 3_000);
    expect(respawnAtFor("ostrzyzeni", live, at, no)).toBe(0);
    // The bomb and duel rounds never revive on a timer; the warm-up revives everybody.
    for (const mode of ["bomb", "duel", "turniej"] as const) {
      expect(respawnAtFor(mode, live, at, no), mode).toBe(0);
      expect(respawnAtFor(mode, MatchPhase.Waiting, at, no), `${mode} warm-up`).toBe(at + 3_200);
    }
  });
});

describe("hudFeed: the killer", () => {
  it("sums this life's damage with the killer both ways, and calls a self-kill a self-kill", () => {
    const d = new LifeDamage();
    d.hit("p5", 30); d.hit("p5", 34); d.hit("p6", 90); d.hit("p5", 0);
    d.damaged("p5", 25); d.damaged("p5", 25); d.damaged("p6", 10); d.damaged("p5", 25); d.damaged("p5", 25);
    const kill: KillEvent = { killer: "p5", killerName: "xXPiotrekXx", killerTeam: 1, victim: "me", victimName: "Kowal", victimTeam: 0, weapon: "smg", headshot: true, assists: ["Gruby_Wojtek"] };
    const k = killerFrom(kill, "me", { health: 37, armor: 12 }, d, 123);
    expect(k).toEqual({
      id: "p5", name: "xXPiotrekXx", team: 1, weapon: "smg", headshot: true, assists: ["Gruby_Wojtek"],
      hp: 37, armor: 12, dealt: 64, dealtHits: 3, taken: 100, takenHits: 4, at: 123,
    });
    expect(killerFrom({ ...kill, killer: "me", killerName: "Kowal" }, "me", null, d, 1)).toBeNull();
    expect(killerFrom({ ...kill, killer: "" }, "me", null, d, 1)).toBeNull();
    d.reset();
    expect(killerFrom(kill, "me", null, d, 1)).toMatchObject({ hp: -1, dealt: 0, taken: 0 });
  });
});

describe("hudFeed: sites", () => {
  it("siteHere true inside BOMB.useRadius of A", () => {
    const sites = sitesOf(NIGHT_DISTRICT);
    const a = sites.find((s) => s.id === "A")!;
    expect(siteAt(sites, { x: a.x, y: a.y, z: a.z })).toBe("A");
    expect(siteAt(sites, { x: a.x + BOMB.useRadius - 0.01, y: a.y, z: a.z })).toBe("A");
    expect(siteAt(sites, { x: a.x + BOMB.useRadius + 0.01, y: a.y, z: a.z })).toBe("");
    expect(siteAt(sites, { x: a.x, y: a.y + 2, z: a.z }), "a floor above the site is not on it").toBe("");
    const b = BOMB_SITES[1];
    expect(siteAt(BOMB_SITES, { x: b.x, y: b.y, z: b.z + 1 })).toBe("B");
    // nearBomb: a living defender in reach of the planted bomb, nobody else.
    const planted = { stage: "planted", attackTeam: 0, x: a.x, y: a.y, z: a.z };
    expect(nearBombFor(planted, 1, true, { x: a.x + 1, y: a.y, z: a.z })).toBe(true);
    expect(nearBombFor(planted, 0, true, { x: a.x + 1, y: a.y, z: a.z }), "an attacker").toBe(false);
    expect(nearBombFor(planted, 1, false, { x: a.x + 1, y: a.y, z: a.z }), "dead").toBe(false);
    expect(nearBombFor({ ...planted, stage: "carried" }, 1, true, { x: a.x, y: a.y, z: a.z }), "not planted").toBe(false);
  });
});

// ------------------------------------------------------------------------------------ rounds

const players = [
  { id: "me", name: "Kowal", team: 0 as Team }, { id: "p1", name: "Kasia_Brzytwa", team: 0 as Team },
  { id: "p5", name: "xXPiotrekXx", team: 1 as Team }, { id: "p6", name: "Gruby_Wojtek", team: 1 as Team },
];
const view = (o: Partial<RoundView>): RoundView => ({
  mode: "bomb", phase: MatchPhase.Prep, round: 5, result: "", scoreA: 3, scoreB: 1,
  bomb: { stage: "buy", actor: "", carrier: "p1" }, players, ...o,
});
const kill = (killer: string, victim: string): KillEvent => {
  const k = players.find((p) => p.id === killer)!, v = players.find((p) => p.id === victim)!;
  return { killer, killerName: k.name, killerTeam: k.team, victim, victimName: v.name, victimTeam: v.team, weapon: "rifle", headshot: false };
};
/** A bomb round played from its freeze: the release, the kills, the bomb's stages, the break. */
function playRound(w: RoundWatch, o: { kills: [string, string][]; stages: RoundView["bomb"][]; result: string; scoreA: number; scoreB: number; mode?: GameMode; release?: boolean }): void {
  const mode = o.mode ?? "bomb";
  if (o.release !== false) w.step(view({ mode, phase: MatchPhase.Prep }));
  w.step(view({ mode, phase: MatchPhase.Playing, bomb: { stage: "carried", actor: "", carrier: "p1" } }));
  for (const [a, v] of o.kills) w.kill(kill(a, v));
  for (const b of o.stages) w.step(view({ mode, phase: MatchPhase.Playing, bomb: b }));
  w.step(view({ mode, phase: MatchPhase.Prep, result: o.result, scoreA: o.scoreA, scoreB: o.scoreB, bomb: { stage: "resolved", actor: "", carrier: "" } }));
}

describe("hudFeed: the round MVP and the history", () => {
  it("mvp: defuser on BOMB DEFUSED, planter on DETONATED, most kills otherwise, none outside bomb", () => {
    // Detonated: Kasia planted (the server clears `actor` on the plant tick; the last actor seen
    // during the plant is the one). Kowal has more kills, but the bomb is the round's story.
    let w = new RoundWatch();
    playRound(w, {
      kills: [["me", "p5"], ["me", "p6"]], result: "BOMB DETONATED", scoreA: 4, scoreB: 1,
      stages: [{ stage: "carried", actor: "p1", carrier: "p1" }, { stage: "planted", actor: "", carrier: "" }],
    });
    expect(w.mvp).toEqual({ id: "p1", name: "Kasia_Brzytwa", kills: 0, why: "plant" });
    // Defused: the defender who held T to the end, not the planter and not the fragger.
    w = new RoundWatch();
    playRound(w, {
      kills: [["p5", "me"], ["p5", "p1"]], result: "BOMB DEFUSED", scoreA: 3, scoreB: 2,
      stages: [{ stage: "carried", actor: "p1", carrier: "p1" }, { stage: "planted", actor: "", carrier: "" }, { stage: "planted", actor: "p6", carrier: "" }],
    });
    expect(w.mvp).toEqual({ id: "p6", name: "Gruby_Wojtek", kills: 0, why: "defuse" });
    // Anything else: the most kills on the winning side; a tie goes to the one who got there first.
    w = new RoundWatch();
    playRound(w, { kills: [["p6", "p1"], ["p5", "me"], ["p5", "p1"], ["p6", "me"], ["me", "p5"]], result: "ATTACKERS ELIMINATED", scoreA: 3, scoreB: 2, stages: [] });
    expect(w.mvp).toEqual({ id: "p6", name: "Gruby_Wojtek", kills: 2, why: "kills" });
    expect(w.history).toEqual([{ round: 5, winner: 1, reason: "ATTACKERS ELIMINATED" }]);
    // The same round in a duel has a record but no MVP: the MVP is bomb's.
    w = new RoundWatch();
    playRound(w, { mode: "duel", kills: [["me", "p5"]], result: "ELIMINATED", scoreA: 4, scoreB: 1, stages: [] });
    expect(w.mvp).toBeNull();
    expect(w.history).toEqual([{ round: 5, winner: 0, reason: "ELIMINATED" }]);
  });

  it("mvp null when the round start was not observed", () => {
    // Joined mid-round: the first thing this client saw was the round being played. The kills it
    // saw are real, but not all of the round's — an MVP from them would be invented.
    const w = new RoundWatch();
    playRound(w, { release: false, kills: [["me", "p5"], ["me", "p6"]], result: "DEFENDERS ELIMINATED", scoreA: 4, scoreB: 1, stages: [] });
    expect(w.mvp).toBeNull();
    // The round's end WAS seen, so it is in the history; the rounds before the join are not.
    expect(w.history).toEqual([{ round: 5, winner: 0, reason: "DEFENDERS ELIMINATED" }]);
    // A round seen from its release on does get one.
    playRound(w, { kills: [["me", "p5"]], result: "DEFENDERS ELIMINATED", scoreA: 5, scoreB: 1, stages: [] });
    expect(w.mvp).toMatchObject({ id: "me", why: "kills", kills: 1 });
    expect(w.history).toHaveLength(2);
    // A rejoin in the middle of a break (no Playing→Prep seen) appends nothing.
    const late = new RoundWatch();
    late.step(view({ phase: MatchPhase.Prep, result: "BOMB DEFUSED" }));
    late.step(view({ phase: MatchPhase.Prep, result: "BOMB DEFUSED" }));
    expect(late.history).toEqual([]);
    expect(late.mvp).toBeNull();
  });
});

describe("hudFeed: flags and late joins", () => {
  it("flagNotice carries flag, name and team", () => {
    expect(flagNoticeFor({ id: "A", name: "DEPOT" }, 0, 42)).toEqual({ text: "A DLA FADE", flag: "A", name: "DEPOT", team: 0, at: 42 });
    expect(flagNoticeFor({ id: "C", name: "ROOF" }, 1, 7).text).toBe("C DLA TAPER");
  });

  it("lateJoin when dead in a round mode with no kill seen", () => {
    expect(lateJoinFor("bomb", MatchPhase.Playing, false, false)).toBe(true);
    expect(lateJoinFor("duel", MatchPhase.Playing, false, false)).toBe(true);
    expect(lateJoinFor("bomb", MatchPhase.Playing, false, true), "killed: that is a death, not a late join").toBe(false);
    expect(lateJoinFor("bomb", MatchPhase.Playing, true, false), "alive").toBe(false);
    expect(lateJoinFor("tdm", MatchPhase.Playing, false, false), "a respawn mode").toBe(false);
    expect(lateJoinFor("bomb", MatchPhase.Waiting, false, false), "warm-up").toBe(false);
  });
});
