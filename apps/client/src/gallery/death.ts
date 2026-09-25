/**
 * Gallery file of P1-life (docs/UI_U_SPEC.md §7): the death moments — the killer card, spectating,
 * respawn, the tournament bystander, the late joiner — and P1's pins on its own zone (`death`,
 * §8.7/§8.8). Every death carries the fields `Game` now produces (`diedAt`, `killer`, `spectating`,
 * `lateJoin`), at the instant §5.2 photographs: the card 900 ms after a death, the bar 6.2 s after.
 */
import { BOMB, CS_ECONOMY, DUEL, MatchPhase, NIGHT_DISTRICT, OSTRZYZENI, csLossBonus, encodeHaircut, respawnDelayMs, type Team } from "@frankibarber/shared";
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
      killerName: seat("p5").name, killerWeapon: "smg", buyWindowLeft: 0, money: 350,
      diedAt: T - 900, killer: killerOf("p5", "smg", 900, { headshot: true }),
      players: roster({ f: 0.34, dead: ["me", "bot-3"] }),
      killFeed: feed(0, [[3_800, "p1", "bot-3", "rifle"], [900, "p5", "me", "smg", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { alive: false, mates: MATES }),
  },
  {
    id: "dead-respawn", moment: "TDM: zginąłeś, odrodzenie za 3 s",
    n: 35, maxWords: 28,
    state: {
      ...tdmLive(), alive: false, health: 0, killerName: seat("p6").name, killerWeapon: "smg", moneyToasts: [],
      // TDM's respawnDelayMs (3200) from the death 1.1 s ago: 2.1 s left, the card reads 3.
      diedAt: T - 1_100, respawnAt: T - 1_100 + respawnDelayMs("tdm"), killer: killerOf("p6", "smg", 1_100),
      players: roster({ f: 0.58, dead: ["me", "p7", "bot-4"] }),
      killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [2_600, "me", "bot-4", "rifle", { assists: ["p2"] }], [1_100, "p6", "me", "smg"]]),
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
      ...tdmLive(), alive: false, health: 0, respawnAt: T - 800 + respawnDelayMs("tdm"), killerName: "", killerWeapon: "frag", moneyToasts: [],
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

/** The words of the card and the bar, as the pins quote them (deathText.ts). */
const DAMAGE = "ZADANE 64 (3) · OTRZYMANE 100 (4)";
const KEYS = "LPM NASTĘPNY · PPM POPRZEDNI";
/** The pre-drop card said WYELIMINOWAŁ / WYELIMINOWANY; §5.2 has none of it. */
const NO_OLD_WORDS = [{ text: "WYELIMINOWA", zone: "death" as const }];

/**
 * P1's pins (§8.7/§8.8): the death card and the spectate bar, wherever they show or must not. The
 * §5.1 budgets of the zone are gated by the tool; `zoneWords` pins each moment's own count, so a
 * word added to one state shows up as that state's failure.
 */
export const pins: PinSet = {
  // §5.2 row 21: a break is the banner's moment — no card, no bar.
  "bomb-round-lost": { absent: ["[data-testid=death]", "[data-testid=spectate]"] },
  // Row 33: the killer card, 900 ms after the death.
  "dead-next-round": {
    expect: ["[data-testid=death]", "[data-testid=killer-hp]", "[data-testid=killer-damage]", "[data-zone=veil] .death-vignette"],
    absent: ["[data-testid=spectate]"],
    caseText: ["ZABIŁ CIĘ", "xXPiotrekXx", "K-7", "37 HP", DAMAGE, "WRACASZ W NASTĘPNEJ RUNDZIE"],
    textAbsent: NO_OLD_WORDS, zoneWords: { death: 16 },
  },
  // Row 34: 6.2 s after the death the card has folded into the bar, on Kasia's eye.
  "dead-spectate": {
    expect: ["[data-testid=spectate]"], absent: ["[data-testid=death]", "[data-testid=late-join]"],
    caseText: ["OBSERWUJESZ: Kasia_Brzytwa · 74 HP", KEYS, "WRACASZ W NASTĘPNEJ RUNDZIE"],
    textAbsent: [...NO_OLD_WORDS, { text: "ZABIŁ CIĘ", zone: "death" }], zoneWords: { death: 12 },
  },
  // Row 35: a respawn mode — no damage line, the live countdown with its draining bar.
  "dead-respawn": {
    expect: ["[data-testid=death]", "[data-testid=killer-hp]", ".death-live .death-drain"],
    absent: ["[data-testid=killer-damage]", "[data-testid=spectate]"],
    caseText: ["ZABIŁ CIĘ", "Gruby_Wojtek", "K-7", "37 HP", "ODRODZENIE ZA 3"],
    textAbsent: [...NO_OLD_WORDS, { text: "WRACASZ", zone: "death" }], zoneWords: { death: 9 },
  },
  // Row 36: my own grenade — nobody to name.
  "dead-selfkill": {
    expect: ["[data-testid=death]"], absent: ["[data-testid=killer-hp]", "[data-testid=killer-damage]", ".death-nick"],
    caseText: ["ZGINĄŁEŚ", "ODRODZENIE ZA 3"],
    textAbsent: [...NO_OLD_WORDS, { text: "ZABIŁ", zone: "death" }], zoneWords: { death: 4 },
  },
  // Row 37: the duel loser in the break — the round banner, and no card.
  "dead-in-break": {
    expect: ["[data-testid=round-end]"], absent: ["[data-testid=death]", "[data-testid=spectate]", "[data-zone=death]"],
    // The veil stays for the camera's cut to the survivor's eye; its red is gone with the round.
    invisible: ["[data-zone=veil] .death-vignette"],
  },
  // Row 38: joined mid-round — no card, no vignette, the bar alone.
  "late-join-spectate": {
    expect: ["[data-testid=spectate]", "[data-testid=late-join]"], absent: ["[data-testid=death]", ".death-vignette"],
    caseText: ["OBSERWUJESZ: Kasia_Brzytwa · 74 HP", KEYS, "DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE"],
    textAbsent: [...NO_OLD_WORDS, { text: "WRACASZ", zone: "death" }], zoneWords: { death: 12 },
  },
  // Row 32: a bystander — the bracket's word over the bar on the pair, never a death.
  "turniej-waiting": {
    expect: ["[data-testid=death]", "[data-testid=spectate]"], absent: [".death-vignette", "[data-testid=late-join]"],
    caseText: ["CZEKASZ NA SWOJĄ PARĘ", "OBSERWUJESZ: ZDZICHU · 81 HP", KEYS],
    textAbsent: [{ text: "WYELIMINOWA" }, { text: "ZABIŁ", zone: "death" }, { text: "NASTĘPNEJ RUNDZIE", zone: "death" }],
    zoneWords: { death: 12 },
  },
  // Row 40: shaved — the card's line promises the clippers.
  "infection-converted": {
    expect: ["[data-testid=death]", "[data-testid=killer-hp]"],
    caseText: ["ZABIŁ CIĘ", "RYSIEK", "Clippers", "WRACASZ Z MASZYNKĄ ZA 3"],
    textAbsent: NO_OLD_WORDS,
  },
};
