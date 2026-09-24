/**
 * Gallery file of P1-life (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the death moments — the
 * killer card, spectating, respawn, the tournament bystander — and P1's pins on its own zone
 * (`death`, §8.7). The two pre-drop scenarios below moved here verbatim from `hudStates.tsx`; the
 * seeded ones follow §5.2 and carry no pins yet (P1 writes them in wave 2).
 */
import { BOMB, CS_ECONOMY, DUEL, MatchPhase, NIGHT_DISTRICT, OSTRZYZENI, csLossBonus, encodeHaircut, type Team } from "@frankibarber/shared";
import {
  DUEL_MAP, MATES, S, SEATS, T, TOUR, base, bombData, bombMatchEnds, bombState, feed, killerOf, kit, pairMatchEnds, radarFor, roster, seat,
  tdmLive, tdmRadar, turniej, type PinSet, type Scenario,
} from "./fixtures";
import type { HudState } from "../game/store";

/** Ostrzyżeni, round 2, 29 s into the live round: RYSIEK (bot-3) holds the clippers. */
const ostrzyzeniLive = (meShaved: boolean, rest: Partial<HudState> = {}): Partial<HudState> => {
  const cycle = OSTRZYZENI.prepMs + OSTRZYZENI.roundMs + OSTRZYZENI.breakMs;
  return {
    ...base("ostrzyzeni", meShaved ? 1 : 0), phase: MatchPhase.Playing, phaseEndsAt: S + 61_000, round: 1, scoreA: 1, scoreB: 0,
    matchEndsAt: S + OSTRZYZENI.rounds * cycle + 60_000 - cycle - OSTRZYZENI.prepMs - 29_000,
    players: roster({
      f: 0.2, myTeam: 0,
      set: Object.fromEntries(SEATS.map((s) => [s.id,
        s.id === "bot-3" ? { team: 1 as Team, shaved: true, haircut: encodeHaircut(s.hair, 2) }
        : s.id === "me" && meShaved ? { team: 1 as Team, shaved: true, alive: false, haircut: encodeHaircut(s.hair, 1) }
        : { team: 0 as Team }])),
    }),
    buyWindowLeft: 0, money: 1_200, ...kit("smg", 21), owned: ["pistol", "smg"], ...rest,
  };
};

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "dead-next-round", moment: "Bomb: zginąłeś w trakcie rundy, wracasz w następnej",
    n: 33, maxWords: 32,
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 64_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 64_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 51_000), scoreA: 3, scoreB: 1, alive: false, health: 0,
      killerName: seat("p5").name, killerWeapon: "dmr", buyWindowLeft: 0, money: 350,
      players: roster({ f: 0.34, dead: ["me", "bot-3"] }),
      killFeed: feed(0, [[3_800, "p1", "bot-3", "rifle"], [900, "p5", "me", "dmr", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { alive: false, mates: MATES }),
  },
  {
    id: "dead-respawn", moment: "TDM: zginąłeś, odrodzenie za 3 s",
    n: 35, maxWords: 28,
    state: {
      ...tdmLive(), alive: false, health: 0, respawnAt: T + 2_300, killerName: seat("p6").name, killerWeapon: "shotgun", moneyToasts: [],
      players: roster({ f: 0.58, dead: ["me", "p7", "bot-4"] }),
      killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [2_600, "me", "bot-4", "rifle", { assists: ["p2"] }], [1_100, "p6", "me", "shotgun"]]),
    },
    radar: tdmRadar({ alive: false }),
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "turniej-waiting", n: 32, maxWords: 26, isNew: true,
    moment: "Turniej: czekasz na swoją parę, oglądasz półfinał ZDZICHU — RYSIEK (2 : 1)",
    state: turniej(TOUR.semi1Waiting, ["bot-1", "bot-3"], {
      phase: MatchPhase.Playing, phaseEndsAt: S + 38_000, matchEndsAt: pairMatchEnds(3), round: 3, scoreA: 2, scoreB: 1,
      buyWindowLeft: 0, money: CS_ECONOMY.start, killerName: "", killerWeapon: null,
      spectating: { id: "bot-1", name: seat("bot-1").name, health: 81 },
    }),
    radar: radarFor(DUEL_MAP, 0, 0.4, { alive: false, mates: [] }),
  },
  {
    id: "dead-spectate", n: 34, maxWords: 30, isNew: true, elapsed: 6_200,
    moment: "Bomb: zginąłeś 6 s temu — karta zwinięta, obserwujesz Kasię (74 HP)",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 58_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 58_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 57_000), scoreA: 3, scoreB: 1, alive: false, health: 0,
      killerName: seat("p5").name, killerWeapon: "dmr", buyWindowLeft: 0, money: 350,
      diedAt: T - 6_200, killer: killerOf("p5", "dmr", 6_200, { headshot: true }),
      spectating: { id: "p1", name: seat("p1").name, health: 74 },
      players: roster({ f: 0.34, dead: ["me", "bot-3"], set: { p1: { health: 74 } } }),
      killFeed: feed(0, [[3_800, "p1", "bot-3", "rifle"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.55, { alive: false, mates: MATES }),
  },
  {
    id: "dead-selfkill", n: 36, maxWords: 24, isNew: true, elapsed: 800,
    moment: "TDM: własny granat — zginąłeś sam, odrodzenie za 3 s",
    state: {
      ...tdmLive(), alive: false, health: 0, respawnAt: T + 2_400, killerName: "", killerWeapon: "frag", moneyToasts: [],
      diedAt: T - 800, killer: null, lethal: "", lethalCount: 0,
      players: roster({ f: 0.58, dead: ["me", "p7", "bot-4"] }),
      killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [3_100, "p5", "bot-2", "dmr", { headshot: true }], [800, "me", "me", "frag"]]),
    },
    radar: tdmRadar({ alive: false }),
  },
  {
    id: "dead-in-break", n: 37, maxWords: 26, isNew: true, elapsed: 1_200,
    moment: "1 v 1: przegrałeś rundę 4 i leżysz — przerwa po rundzie",
    before: {
      ...base("duel"), phase: MatchPhase.Playing, serverNow: S - 2_200, phaseEndsAt: S + 27_000, matchEndsAt: S + 11 * 60_000, round: 3, scoreA: 2, scoreB: 1,
      players: roster({ f: 0.25, only: ["me", "p5"] }), health: 22, armor: 0, ...kit("smg", 4), owned: ["pistol", "smg"], money: 400, buyWindowLeft: 0,
    },
    state: {
      ...base("duel"), phase: MatchPhase.Prep, phaseEndsAt: S + DUEL.breakMs - 1_200, matchEndsAt: S + 11 * 60_000, round: 4, scoreA: 2, scoreB: 2,
      roundResult: "ELIMINATED", roundWinner: 1, buyWindowLeft: 0,
      players: roster({ f: 0.25, only: ["me", "p5"], dead: ["me"] }), alive: false, health: 0, ...kit("smg", 4), owned: ["pistol", "smg"], armor: 0,
      killerName: seat("p5").name, killerWeapon: "rifle", diedAt: T - 1_400, killer: killerOf("p5", "rifle", 1_400, { hp: 58, dealt: 42, dealtHits: 2 }),
      money: 400 + csLossBonus(0),
      killFeed: feed(0, [[1_400, "p5", "me", "rifle"]]),
      moneyToasts: [{ key: 5, delta: csLossBonus(0), reason: "loss", total: 400 + csLossBonus(0), at: T - 1_150 }],
    },
    radar: radarFor(DUEL_MAP, 0, 0.5, { alive: false, mates: [] }),
  },
  {
    id: "late-join-spectate", n: 38, maxWords: 28, isNew: true,
    moment: "Bomb: dołączyłeś w trakcie rundy — obserwujesz Kasię do następnej",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 76_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 76_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 39_000), scoreA: 3, scoreB: 1,
      alive: false, health: 0, lateJoin: true, buyWindowLeft: 0, money: BOMB.startMoney, killerName: "", killerWeapon: null,
      spectating: { id: "p1", name: seat("p1").name, health: 74 },
      players: roster({ f: 0.34, dead: ["me", "p7"], set: { me: { kills: 0, deaths: 0, assists: 0, score: 0 }, p1: { health: 74 } } }),
      killFeed: feed(0, [[2_400, "p2", "p7", "smg"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { alive: false, mates: MATES }),
  },
  {
    id: "infection-converted", n: 40, maxWords: 24, isNew: true, elapsed: 700,
    moment: "Ostrzyżeni: RYSIEK cię ogolił — jesteś ostrzyżony, wracasz z maszynką za 3 s",
    before: { ...ostrzyzeniLive(false), serverNow: S - 1_700, health: 64 },
    state: ostrzyzeniLive(true, {
      alive: false, health: 0, respawnAt: T - 700 + OSTRZYZENI.shavedRespawnMs, killerName: seat("bot-3").name, killerWeapon: "clippers",
      diedAt: T - 700, killer: killerOf("bot-3", "clippers", 700, { team: 1, hp: 220, dealt: 18, dealtHits: 1 }),
      killFeed: feed(0, [[3_900, "bot-3", "p2", "clippers", { shave: true }], [700, "bot-3", "me", "clippers", { shave: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { alive: false, mates: MATES }),
  },
];

/** P1's pins (§8.7): the death card, wherever it shows or must not. */
export const pins: PinSet = {
  "bomb-round-lost": { expect: ["[data-testid=death]"], text: ["WRACASZ W NASTĘPNEJ RUNDZIE"] },
  "dead-next-round": { expect: ["[data-testid=death]"], text: ["WRACASZ W NASTĘPNEJ RUNDZIE"] },
  "dead-respawn": { expect: ["[data-testid=death]"], text: ["ODRODZENIE ZA 3"] },
  // Seeded scenarios: P1 writes these pins in wave 2.
  "turniej-waiting": {},
  "dead-spectate": {},
  "dead-selfkill": {},
  "dead-in-break": {},
  "late-join-spectate": {},
  "infection-converted": {},
};
