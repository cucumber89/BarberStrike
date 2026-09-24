/**
 * Gallery file of P5-moments (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the moments around the
 * fight — intro and countdown, WALCZ!, round start and end, plant, halftime, the final round, the
 * alerts — and P5's pins on its zones (`banner`, `alert`, `intro`; §8.7). The five pre-drop
 * scenarios below moved here verbatim from `hudStates.tsx`; the seeded ones follow §5.2 and carry
 * no pins yet (P5 writes them in wave 2).
 */
import {
  BOMB, CS_ECONOMY, DUEL, ECONOMY, MATCH, MatchPhase, NIGHT_DISTRICT, csLossBonus, ladderWeapon, planOffer,
} from "@frankibarber/shared";
import {
  DUEL_MAP, MATES, REWARD_WIN, S, SITE_A, T, TDM_LIMIT, TOUR, base, bombData, bombFreeze, bombMatchEnds, bombState, feed, kit,
  pairMatchEnds, radarFor, roster, seat, tdmLive, tdmRadar, turniej, type PinSet, type Scenario,
} from "./fixtures";
import type { HudState } from "../game/store";

/** Gun Game, 5:03 left: me on rung `rung` (0-based), xXPiotrekXx on 11. */
const gungame = (rung: number, rest: Partial<HudState> = {}): Partial<HudState> => ({
  ...base("gungame"), phase: MatchPhase.Playing, phaseEndsAt: S + 303_000, matchEndsAt: S + 303_000,
  players: roster({
    f: 0.8, ffa: true,
    set: { me: { score: rung, kills: rung + 2 }, p5: { score: 11, kills: 13 }, p1: { score: 9, kills: 10 }, p6: { score: 8, kills: 9 } },
  }),
  ...kit(ladderWeapon(rung)), owned: [ladderWeapon(rung)], money: 0, buyWindowLeft: 0, ...rest,
});

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "countdown", moment: "Odliczanie do startu meczu (3…)",
    n: 2, maxWords: 24,
    state: { ...base("tdm"), phase: MatchPhase.Countdown, phaseEndsAt: S + 2_600, players: roster({ f: 0 }), money: ECONOMY.startMoney, buyWindowLeft: Infinity },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "bomb-round-won", moment: "Bomb: przerwa po rundzie — ładunek wybuchł, runda dla nas",
    n: 20, maxWords: 34,
    before: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, z: SITE_A.z, endsAt: S + 200, roundEndsAt: S + 20_000 }), {
      phase: MatchPhase.Playing, serverNow: S - 1_600, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), scoreA: 3, scoreB: 1, players: roster({ f: 0.36, dead: ["p2", "p5", "p6"] }),
      ...kit("rifle", 14), owned: ["pistol", "rifle"], health: 63, money: 450,
    }),
    state: bombState(bombData({ stage: "resolved", site: SITE_A.id, x: SITE_A.x, z: SITE_A.z, result: "BOMB DETONATED" }), {
      phase: MatchPhase.Prep, phaseEndsAt: S + 3_400, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), roundWinner: 0, scoreA: 4, scoreB: 1,
      players: roster({ f: 0.36, dead: ["p2", "p5", "p6", "p7", "bot-3", "bot-4"] }), ...kit("rifle", 14), owned: ["pistol", "rifle"], health: 63, money: 450 + BOMB.winMoney,
      killFeed: feed(0, [[4_600, "me", "p6", "rifle"], [1_300, "p1", "p5", "rifle", { headshot: true }]]),
      moneyToasts: [{ key: 7, delta: BOMB.winMoney, reason: "capture", total: 450 + BOMB.winMoney, at: T - 600 }],
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.6, { mates: MATES, dead: ["p2"] }),
  },
  {
    id: "bomb-round-lost", moment: "Bomb: przerwa po rundzie — atak wybity, zginąłeś, runda dla nich",
    n: 21, maxWords: 30,
    before: bombState(bombData({ stage: "dropped", roundEndsAt: S + 30_000 }), {
      phase: MatchPhase.Playing, serverNow: S - 1_600, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), scoreA: 3, scoreB: 1, alive: false, health: 0, killerName: seat("p6").name, killerWeapon: "smg",
      players: roster({ f: 0.36, dead: ["me", "p1", "bot-1", "bot-2", "p7"] }), money: 200,
    }),
    state: bombState(bombData({ stage: "resolved", result: "ATTACKERS ELIMINATED" }), {
      phase: MatchPhase.Prep, phaseEndsAt: S + 3_400, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 80_000 + 1_600), roundWinner: 1, scoreA: 3, scoreB: 2, alive: false, health: 0,
      killerName: seat("p6").name, killerWeapon: "smg",
      players: roster({ f: 0.36, dead: ["me", "p1", "p2", "bot-1", "bot-2", "p7"] }), money: 200 + csLossBonus(0),
      killFeed: feed(0, [[5_000, "p6", "me", "smg"], [2_900, "p5", "p1", "dmr", { headshot: true }], [1_200, "bot-3", "p2", "shotgun"]]),
      moneyToasts: [{ key: 8, delta: csLossBonus(0), reason: "capture", total: 200 + csLossBonus(0), at: T - 600 }],
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.55, { alive: false, mates: MATES, dead: ["p1", "p2", "bot-1", "bot-2"] }),
  },
  {
    id: "bomb-halftime", moment: "Bomb: połowa — runda 7, zmiana stron, pistolety i 800 $",
    n: 22, maxWords: 24,
    state: bombFreeze(7, 12_600, {
      scoreA: 4, scoreB: 2, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], armor: 0, players: roster({ f: 0.5 }),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0, { mates: MATES }),
  },
  {
    id: "duel-round-break", moment: "1 v 1: przerwa po rundzie, wygrałeś ją i przeżyłeś",
    n: 26, maxWords: 26,
    before: {
      ...base("duel"), phase: MatchPhase.Playing, serverNow: S - 900, phaseEndsAt: S + 31_000, matchEndsAt: S + 12 * 60_000, round: 1, scoreA: 1, scoreB: 0,
      players: roster({ f: 0.1, only: ["me", "p5"] }), ...kit("smg", 9), owned: ["pistol", "smg"], armor: 70, health: 61, money: 150,
    },
    state: {
      ...base("duel"), phase: MatchPhase.Prep, phaseEndsAt: S + 2_100, matchEndsAt: S + 12 * 60_000, round: 2, scoreA: 2, scoreB: 0,
      roundResult: "ELIMINATED", roundWinner: 0, buyWindowLeft: 0,
      players: roster({ f: 0.15, only: ["me", "p5"], dead: ["p5"] }), ...kit("smg", 9), owned: ["pistol", "smg"], armor: 70, health: 61,
      money: 150 + ECONOMY.killReward + CS_ECONOMY.win,
      killFeed: feed(0, [[900, "me", "p5", "smg", { headshot: true }]]),
      moneyToasts: [
        { key: 3, delta: ECONOMY.killReward, reason: "kill", total: 150 + ECONOMY.killReward, at: T - 900 },
        { key: 4, delta: CS_ECONOMY.win, reason: "round", total: 150 + ECONOMY.killReward + CS_ECONOMY.win, at: T - 880 },
      ],
    },
    radar: radarFor(DUEL_MAP, 0, 0.5, { mates: [] }),
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "countdown-aborted", n: 3, maxWords: 20, isNew: true, elapsed: 600,
    moment: "Odliczanie przerwane: drugi gracz wyszedł, wracamy do rozgrzewki",
    before: {
      ...base("tdm"), phase: MatchPhase.Countdown, serverNow: S - 1_600, phaseEndsAt: S + 1_200, players: roster({ f: 0, only: ["me", "p5"] }),
      money: ECONOMY.startMoney, buyWindowLeft: Infinity,
    },
    state: { ...base("tdm"), phase: MatchPhase.Waiting, players: roster({ f: 0, only: ["me"] }), money: ECONOMY.startMoney, buyWindowLeft: Infinity },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.1, { mates: [] }),
  },
  {
    id: "fight-start", n: 4, maxWords: 16, isNew: true, elapsed: 400,
    moment: "TDM: odliczanie się skończyło — WALCZ! (400 ms po starcie)",
    before: {
      ...base("tdm"), phase: MatchPhase.Countdown, serverNow: S - 1_400, phaseEndsAt: S - 400, players: roster({ f: 0 }),
      money: ECONOMY.startMoney, buyWindowLeft: Infinity,
    },
    state: {
      ...base("tdm"), phase: MatchPhase.Playing, phaseEndsAt: S - 400 + MATCH.waveMs, matchEndsAt: S - 400 + MATCH.durationMs, players: roster({ f: 0 }),
      money: ECONOMY.startMoney, buyWindowLeft: ECONOMY.buyWindowMs - 400,
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.02, { mates: MATES }),
  },
  {
    id: "bomb-planted-alert", n: 18, maxWords: 30, isNew: true, elapsed: 800,
    moment: "Bomb: xXPiotrekXx podłożył ładunek na A 0,8 s temu — bronisz",
    before: bombState(bombData({ stage: "carried", carrier: "p5", actor: "p5", progress: 0.95, roundEndsAt: S + 49_000 }), {
      myTeam: 1, phase: MatchPhase.Playing, serverNow: S - 1_800, phaseEndsAt: S + 49_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 64_200), scoreA: 3, scoreB: 1,
      buyWindowLeft: 0, players: roster({ f: 0.34, myTeam: 1, dead: ["bot-1", "p7"] }), health: 88, armor: 50, ...kit("rifle", 22), owned: ["pistol", "rifle"], money: 1_150,
    }),
    state: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + BOMB.fuseMs - 800, roundEndsAt: S + 49_000 }), {
      myTeam: 1, phase: MatchPhase.Playing, phaseEndsAt: S + 49_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 66_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, myTeam: 1, dead: ["bot-1", "p7"] }), health: 88, armor: 50, ...kit("rifle", 22), owned: ["pistol", "rifle"], money: 1_150,
      killFeed: feed(1, [[4_900, "p5", "bot-1", "rifle"], [3_300, "me", "p7", "rifle"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.45, { mates: MATES, dead: ["bot-1"], spotted: true }),
  },
  {
    id: "round-freeze-start", n: 19, maxWords: 26, isNew: true, elapsed: 900,
    moment: "Bomb: zamrożenie rundy 5 zaczęło się 0,9 s temu (baner RUNDA 5)",
    before: bombState(bombData({ round: 4, stage: "resolved", result: "DEFENDERS ELIMINATED" }), {
      phase: MatchPhase.Prep, serverNow: S - 1_900, phaseEndsAt: S - 900, matchEndsAt: bombMatchEnds(4, 0), roundWinner: 0, scoreA: 3, scoreB: 1,
      players: roster({ f: 0.3, dead: ["p2", "p5", "p6", "p7", "bot-3", "bot-4"] }), ...kit("rifle", 14), owned: ["pistol", "rifle"], money: 3_150,
    }),
    state: bombFreeze(5, BOMB.buyMs - 900, {
      scoreA: 3, scoreB: 1,
      plan: { options: planOffer(5), tally: [0, 0], chosen: 0, appliesAt: S + BOMB.buyMs - 900, votingTeam: 0, round: 5, at: T - 900 },
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "bomb-halftime-break", n: 23, maxWords: 28, isNew: true, elapsed: 9_000,
    moment: "Bomb: przerwa po rundzie 6 (połowa, 15 s), 9 s w nią — karta ZMIANA STRON",
    before: bombState(bombData({ round: 6, stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + 5_000, actor: "p5", progress: 0.97, roundEndsAt: S + 20_000 }), {
      phase: MatchPhase.Playing, serverNow: S - 10_000, matchEndsAt: bombMatchEnds(5, BOMB.buyMs + 88_000), scoreA: 3, scoreB: 2,
      players: roster({ f: 0.5, dead: ["p1", "p2", "p6", "bot-4"] }), ...kit("rifle", 6), owned: ["pistol", "rifle"], health: 35, money: 2_100,
    }),
    state: bombState(bombData({ round: 6, stage: "resolved", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, result: "BOMB DEFUSED" }), {
      // The 15 s halftime break is P-SRV's (§6.2); the photograph is 9 s into it.
      phase: MatchPhase.Prep, phaseEndsAt: S + 15_000 - 9_000, matchEndsAt: bombMatchEnds(5, BOMB.buyMs + 88_000 + 9_000), roundWinner: 1, scoreA: 3, scoreB: 3,
      players: roster({ f: 0.5, dead: ["me", "p1", "p2", "p6", "bot-4"] }), alive: false, health: 0, killerName: seat("p5").name, killerWeapon: "rifle",
      money: 2_100 + CS_ECONOMY.plantedLoss, buyWindowLeft: 0,
      killFeed: feed(0, [[9_400, "p5", "me", "rifle"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.6, { alive: false, mates: MATES, dead: ["p1", "p2"] }),
  },
  {
    id: "turniej-round-break", n: 29, maxWords: 26, isNew: true, elapsed: 1_500,
    moment: "Turniej: przerwa po rundzie 7 półfinału — runda dla ZDZICHU, oglądasz",
    before: turniej("4|1;Kowal|xXPiotrekXx|6|3|a;ZDZICHU|RYSIEK|3|3|-;Kowal||0|0|-", ["bot-1", "bot-3"], {
      phase: MatchPhase.Playing, serverNow: S - 2_500, phaseEndsAt: S + 33_000, matchEndsAt: pairMatchEnds(6), round: 6, scoreA: 3, scoreB: 3, buyWindowLeft: 0,
    }),
    state: turniej(TOUR.semi2, ["bot-1", "bot-3"], {
      phase: MatchPhase.Prep, phaseEndsAt: S + DUEL.breakMs - 1_500, matchEndsAt: pairMatchEnds(7), round: 7, scoreA: 4, scoreB: 3,
      roundResult: "ELIMINATED", roundWinner: 0, buyWindowLeft: 0,
      killFeed: feed(0, [[1_700, "bot-1", "bot-3", "smg"]]),
    }, { dead: ["bot-3"] }),
    radar: radarFor(DUEL_MAP, 0, 0.5, { alive: false, mates: [] }),
  },
  {
    id: "gungame-last-weapon", n: 42, maxWords: 24, isNew: true, elapsed: 600,
    moment: "Gun Game: zabójstwo daje ci ostatnią broń (14/14)",
    before: { ...gungame(12), serverNow: S - 1_600 },
    state: gungame(13, { killFeed: feed(0, [[3_800, "p5", "p7", ladderWeapon(11)], [600, "me", "p2", ladderWeapon(12)]], true) }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: [], spotted: true }),
  },
  {
    id: "match-end-final-round", n: 58, maxWords: 26, isNew: true, elapsed: 1_500,
    moment: "Bomb: rozbroiłeś ładunek w rundzie 11 — 7 : 4, etap A końca meczu",
    before: bombState(bombData({ round: 11, attackTeam: 1, stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + 8_000, actor: "me", progress: 0.97, roundEndsAt: S + 30_000 }), {
      phase: MatchPhase.Playing, serverNow: S - 2_500, matchEndsAt: bombMatchEnds(10, BOMB.buyMs + 70_000), scoreA: 6, scoreB: 4,
      players: roster({ f: 0.9, dead: ["p1", "p2", "p5", "p6", "p7", "bot-3"] }), ...kit("rifle", 9), owned: ["pistol", "rifle"], health: 42, money: 1_900,
    }),
    state: bombState(bombData({ round: 11, attackTeam: 1, stage: "resolved", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, result: "BOMB DEFUSED" }), {
      phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 1_500, roundWinner: 0, winner: 0, scoreA: 7, scoreB: 4, reward: REWARD_WIN,
      players: roster({ f: 0.9, dead: ["p1", "p2", "p5", "p6", "p7", "bot-3"] }), ...kit("rifle", 9), owned: ["pistol", "rifle"], health: 42, money: 1_900,
      killFeed: feed(0, [[4_300, "bot-1", "p7", "smg"], [3_100, "me", "bot-3", "rifle"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.7, { mates: MATES, dead: ["p1", "p2"] }),
  },
  {
    id: "new-match-warmup", n: 67, maxWords: 24, isNew: true, elapsed: 700,
    moment: "Nowy mecz: wynik zamknięty, wracamy do rozgrzewki (mysz wolna)",
    before: {
      ...base("tdm"), phase: MatchPhase.Ended, serverNow: S - 1_700, phaseEndsAt: S - 700, scoreA: TDM_LIMIT, scoreB: 33, winner: 0, reward: REWARD_WIN,
      players: roster({ f: 1 }), ...kit("rifle", 11), owned: ["pistol", "rifle"], money: 5_200, pointerLocked: false,
    },
    state: {
      ...base("tdm"), phase: MatchPhase.Waiting, pointerLocked: false, players: roster({ f: 0 }), money: ECONOMY.startMoney, buyWindowLeft: Infinity,
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "reconnecting", n: 68, maxWords: 26, isNew: true,
    moment: "TDM: połączenie zerwane w trakcie fali — łączę ponownie",
    state: { ...tdmLive(), reconnecting: true },
    radar: tdmRadar(),
  },
  {
    id: "break-rejoin", n: 69, maxWords: 28, isNew: true,
    moment: "1 v 1: HUD wstaje w środku przerwy po rundzie (bez krawędzi Playing → Prep)",
    state: {
      ...base("duel"), phase: MatchPhase.Prep, phaseEndsAt: S + 1_800, matchEndsAt: S + 10 * 60_000, round: 5, scoreA: 3, scoreB: 2,
      roundResult: "TIME · MORE HEALTH", roundWinner: 0, buyWindowLeft: 0,
      players: roster({ f: 0.4, only: ["me", "p5"] }), ...kit("smg", 12), owned: ["pistol", "smg"], health: 47, armor: 0, money: 2_300,
    },
    radar: radarFor(DUEL_MAP, 0, 0.5, { mates: [] }),
  },
];

/** P5's pins (§8.7): the countdown, the flag notice and the round-end banner. */
export const pins: PinSet = {
  "countdown": { expect: ["[data-testid=countdown]"] },
  "dom-live-capturing": { expect: ["[data-testid=flag-notice]"] },
  "bomb-round-won": { expect: ["[data-testid=round-end].mine"], text: ["RUNDA DLA FADE"] },
  "bomb-round-lost": { expect: ["[data-testid=round-end].theirs"], text: ["RUNDA DLA TAPER"] },
  "duel-round-break": { expect: ["[data-testid=round-end].mine", "[data-testid=round-end-carry]"] },
  // Seeded scenarios: P5 writes these pins in wave 2.
  "countdown-aborted": {},
  "fight-start": {},
  "bomb-planted-alert": {},
  "round-freeze-start": {},
  "bomb-halftime-break": {},
  "turniej-round-break": {},
  "gungame-last-weapon": {},
  "match-end-final-round": {},
  "new-match-warmup": {},
  "reconnecting": {},
  "break-rejoin": {},
};
