/**
 * Gallery file of P2-top (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the live match in every mode
 * — the strip, the mode line, flags, the action slot, the bracket card — and P2's pins on its zones
 * (`top`, `top-line`, `action`, `bracket`; §8.7). The eleven pre-drop scenarios below moved here
 * verbatim from `hudStates.tsx`; the seeded ones follow §5.2 and carry no pins yet (P2 writes them
 * in wave 2, re-pinning the clocks to m:ss per §8.4).
 */
import {
  BOMB, BOYS, CS_ECONOMY, ECONOMY, MatchPhase, NIGHT_DISTRICT, OSTRZYZENI, TEAM_NAMES, TOURNAMENT, WEAPONS,
  encodeHaircut, ladderWeapon, planOffer, type Team,
} from "@frankibarber/shared";
import {
  DUEL_MAP, MATES, S, SEATS, SITE_A, T, TOUR, base, bombData, bombMatchEnds, bombState, chatLines, feed, kit, pairMatchEnds,
  radarFor, roster, tdmLive, tdmRadar, turniej, type PinSet, type Scenario,
} from "./fixtures";

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "warmup", moment: "Rozgrzewka: sam na serwerze, czekasz na drugiego gracza",
    n: 1, maxWords: 18,
    state: { ...base("tdm"), phase: MatchPhase.Waiting, players: roster({ f: 0, only: ["me"] }), money: ECONOMY.startMoney, buyWindowLeft: Infinity },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.1, { mates: [] }),
  },
  {
    id: "tdm-live", moment: "TDM, fala trwa: 23 : 19, 4:12 do końca",
    n: 5, maxWords: 30,
    state: tdmLive(), radar: tdmRadar(),
  },
  {
    id: "tdm-wave-prep", moment: "TDM, przerwa między falami: wszyscy wstają, 3 s zamrożenia",
    n: 6, maxWords: 24,
    before: { ...tdmLive(), serverNow: S - 1_800, phaseEndsAt: S - 1_700 },
    state: {
      ...tdmLive(), phase: MatchPhase.Prep, phaseEndsAt: S + 3_200, matchEndsAt: S + 235_000, scoreA: 24, scoreB: 19,
      players: roster({ f: 0.6 }), health: 100, ammo: WEAPONS.rifle.magazine, buyWindowLeft: Infinity, moneyToasts: [],
      killFeed: feed(0, [[4_300, "p5", "bot-2", "dmr", { headshot: true }], [2_700, "me", "bot-4", "rifle", { assists: ["p2"] }], [2_000, "p1", "p6", "smg"]]),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "dom-live-capturing", moment: "Domination: stoisz na B i przejmujesz ją (62 %)",
    n: 8, maxWords: 32,
    state: {
      ...base("dom"), phase: MatchPhase.Playing, phaseEndsAt: S + 6_000, matchEndsAt: S + 303_000, scoreA: 61, scoreB: 54,
      players: roster({ f: 0.5, dead: ["p2"] }), health: 88, armor: 50, ...kit("smg", 22), owned: ["pistol", "smg"], money: 2_800,
      tactical: "smoke", tacticalCount: 1, buyWindowLeft: 0,
      flags: NIGHT_DISTRICT.flags.map((f, i) => ({ id: f.id, name: f.name, owner: i === 0 ? 0 : i === 2 ? 1 : -1, capTeam: i === 1 ? 0 : -1, cap: i === 1 ? 0.62 : 0, contested: false })),
      inFlag: 1,
      flagNotice: { text: `${TEAM_NAMES[0]} TOOK ${NIGHT_DISTRICT.flags[0]?.id ?? "A"} · ${NIGHT_DISTRICT.flags[0]?.name ?? ""}`, team: 0, at: T - 900 },
      killFeed: feed(0, [[3_900, "p6", "p2", "rifle"], [2_200, "me", "p6", "smg", { headshot: true }]]),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.55, { mates: MATES, dead: ["p2"], spotted: true }),
  },
  {
    id: "bomb-live-carrier", moment: "Bomb, runda trwa, niesiesz ładunek (atak)",
    n: 11, maxWords: 28,
    state: bombState(bombData({ stage: "carried", carrier: "me", roundEndsAt: S + 71_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 71_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 44_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, dead: ["p7", "bot-2"] }), health: 100, armor: 100, ...kit("rifle", 27), owned: ["pistol", "rifle"], money: 350,
      lethal: "frag", lethalCount: 1, tactical: "smoke", tacticalCount: 1,
      plan: { options: planOffer(5), tally: [1, 2], chosen: planOffer(5)[1] ?? 0, appliesAt: S - 44_000, votingTeam: 0, round: 5, at: T - 44_000 },
      planId: planOffer(5)[1] ?? 0,
      killFeed: feed(0, [[4_100, "p1", "p7", "rifle"], [1_900, "bot-3", "bot-2", "smg"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: MATES, dead: ["bot-2"], spotted: true }),
  },
  {
    id: "bomb-planted-defender", moment: "Bomb: ładunek podłożony na A, bronisz, 28 s do wybuchu",
    n: 15, maxWords: 28,
    state: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + 27_400, roundEndsAt: S + 40_000 }), {
      myTeam: 1, phase: MatchPhase.Playing, phaseEndsAt: S + 40_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 75_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, myTeam: 1, dead: ["p2", "bot-1", "p6"] }), health: 54, armor: 30, ...kit("rifle", 12), owned: ["pistol", "rifle"], money: 1_150,
      tactical: "flash", tacticalCount: 1,
      killFeed: feed(1, [[5_200, "p6", "p2", "rifle"], [3_300, "bot-3", "bot-1", "shotgun"], [900, "me", "p6", "rifle", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.5, { mates: MATES, dead: ["p2", "bot-1"], spotted: true }),
  },
  {
    id: "duel-freeze", moment: "1 v 1: zamrożenie przed rundą 2 (15 s na zakupy)",
    n: 24, maxWords: 18,
    state: {
      ...base("duel"), phase: MatchPhase.Prep, phaseEndsAt: S + 11_200, matchEndsAt: S + 13 * 60_000 + 12_000, round: 1, scoreA: 1, scoreB: 0,
      players: roster({ f: 0.1, only: ["me", "p5"] }), buyWindowLeft: 11_200, money: CS_ECONOMY.start + CS_ECONOMY.win - 500,
    },
    radar: radarFor(DUEL_MAP, 0, 0, { mates: [] }),
  },
  {
    id: "duel-live-buytail", moment: "1 v 1: runda ruszyła, sklep otwarty jeszcze 3 s",
    n: 25, maxWords: 18,
    state: {
      ...base("duel"), phase: MatchPhase.Playing, phaseEndsAt: S + 57_600, matchEndsAt: S + 12 * 60_000 + 55_000, round: 1, scoreA: 1, scoreB: 0,
      players: roster({ f: 0.1, only: ["me", "p5"] }), buyWindowLeft: 2_600, money: 150, ...kit("smg"), owned: ["pistol", "smg"], armor: 100,
    },
    radar: radarFor(DUEL_MAP, 0, 0.1, { mates: [] }),
  },
  {
    id: "duel-match-point", moment: "1 v 1: runda 10 przy 5 : 4 — meczbol",
    n: 27, maxWords: 18,
    state: {
      ...base("duel"), phase: MatchPhase.Playing, phaseEndsAt: S + 41_300, matchEndsAt: S + 4 * 60_000 + 30_000, round: 9, scoreA: 5, scoreB: 4,
      players: roster({ f: 0.8, only: ["me", "p5"] }), buyWindowLeft: 0, health: 100, armor: 100, ...kit("rifle", 30), owned: ["pistol", "rifle"], money: 5_450,
      lethal: "frag", lethalCount: 1,
    },
    radar: radarFor(DUEL_MAP, 0, 0.3, { mates: [] }),
  },
  {
    id: "infection-prep", moment: "Ostrzyżeni: przygotowanie do rundy 2, RYSIEK dostał maszynkę",
    n: 39, maxWords: 28,
    state: {
      // The room's clock for the whole match (TdmRoom `startMatch`), one round and 2.7 s in.
      ...base("ostrzyzeni"), phase: MatchPhase.Prep, phaseEndsAt: S + 5_300, round: 1, scoreA: 1, scoreB: 0,
      matchEndsAt: S + OSTRZYZENI.rounds * (OSTRZYZENI.prepMs + OSTRZYZENI.roundMs + OSTRZYZENI.breakMs) + 60_000
        - (OSTRZYZENI.prepMs + OSTRZYZENI.roundMs + OSTRZYZENI.breakMs) - (OSTRZYZENI.prepMs - 5_300),
      players: roster({
        f: 0.2, myTeam: 0,
        set: Object.fromEntries(SEATS.map((s) => [s.id, s.id === "bot-3" ? { team: 1 as Team, shaved: true, haircut: encodeHaircut(s.hair, 2) } : { team: 0 as Team }])),
      }),
      buyWindowLeft: Infinity, money: 1_200,
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "gungame-live", moment: "Gun Game: szczebel 7/14, prowadzi xXPiotrekXx (9/14)",
    n: 41, maxWords: 22,
    state: {
      ...base("gungame"), phase: MatchPhase.Playing, phaseEndsAt: S + 190_000, matchEndsAt: S + 190_000,
      players: roster({
        f: 0.5, ffa: true,
        set: { me: { score: 6, kills: 7 }, p5: { score: 8, kills: 10 }, p1: { score: 5, kills: 6 }, p6: { score: 5, kills: 5 }, p2: { score: 4, kills: 5 },
          "bot-1": { score: 3, kills: 3 }, p7: { score: 3, kills: 4 }, "bot-3": { score: 2, kills: 2 }, "bot-2": { score: 1, kills: 1 }, "bot-4": { score: 1, kills: 2 } },
      }),
      ...kit(ladderWeapon(6), 4), owned: [ladderWeapon(6)], money: 0, buyWindowLeft: 0,
      killFeed: feed(0, [[4_400, "p5", "p7", ladderWeapon(8)], [2_500, "p1", "bot-2", ladderWeapon(5), { headshot: true }], [700, "me", "p2", ladderWeapon(5)]], true),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: [], spotted: true }),
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "ffa-live", n: 7, maxWords: 26, isNew: true,
    moment: "FFA: masz 12 zabójstw, prowadzi xXPiotrekXx (18), 3:40 do końca",
    state: {
      ...base("ffa"), phase: MatchPhase.Playing, phaseEndsAt: S + 5_200, matchEndsAt: S + 220_000,
      players: roster({ f: 0.6, ffa: true, dead: ["p6"], set: { me: { kills: 12, deaths: 9, score: 1_200 }, p5: { kills: 18, deaths: 6, score: 1_800 } } }),
      health: 64, armor: 0, ...kit("smg", 17), owned: ["pistol", "smg"], money: 2_150, buyWindowLeft: 0, lethal: "frag", lethalCount: 1,
      killFeed: feed(0, [[4_200, "p5", "p6", "dmr", { headshot: true }], [2_000, "me", "bot-3", "smg"]], true),
      moneyToasts: [{ key: 2, delta: ECONOMY.killReward, reason: "kill", total: 2_150, at: T - 1_900 }],
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: [], spotted: true }),
  },
  {
    id: "boys-live", n: 9, maxWords: 34, isNew: true,
    moment: "The Boys: Assault przy stacji, następna klasa Medic, 47 : 52",
    state: {
      ...base("boys"), phase: MatchPhase.Playing, phaseEndsAt: S + 6_000, matchEndsAt: S + 288_000, scoreA: 47, scoreB: 52,
      players: roster({ f: 0.45, dead: ["bot-4"] }), boysClass: 2, nextClass: 4, health: BOYS[2].health, armor: 0,
      ...kit("rifle", 24), owned: ["pistol", "rifle"], lethal: "frag", lethalCount: 1, money: 1_250, nearStation: true, buyWindowLeft: Infinity,
      flags: NIGHT_DISTRICT.flags.map((f, i) => ({ id: f.id, name: f.name, owner: i === 0 ? 1 : i === 2 ? 0 : -1, capTeam: i === 1 ? 1 : -1, cap: i === 1 ? 0.3 : 0, contested: i === 1 })),
      killFeed: feed(0, [[3_300, "p1", "bot-4", "smg"]]),
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.1, { mates: MATES }),
  },
  {
    id: "bomb-live-defender", n: 12, maxWords: 28, isNew: true,
    moment: "Bomb, runda 5 trwa: bronisz A / B, ładunek u atakujących",
    state: bombState(bombData({ stage: "carried", carrier: "p5", roundEndsAt: S + 83_000 }), {
      myTeam: 1, phase: MatchPhase.Playing, phaseEndsAt: S + 83_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 32_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, myTeam: 1, dead: ["bot-4"] }), health: 100, armor: 100, ...kit("carbine", 25), owned: ["pistol", "carbine"], money: 900,
      tactical: "smoke", tacticalCount: 1,
      killFeed: feed(1, [[2_600, "p2", "bot-4", "carbine"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.4, { mates: MATES, spotted: true }),
  },
  {
    id: "bomb-live-escort", n: 13, maxWords: 28, isNew: true,
    moment: "Bomb, runda 5 trwa: atakujesz, ładunek niesie Kasia",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 79_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 79_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 36_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34 }), health: 100, armor: 100, ...kit("rifle", 30), owned: ["pistol", "rifle"], money: 650,
      lethal: "frag", lethalCount: 1, tactical: "flash", tacticalCount: 1,
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.35, { mates: MATES }),
  },
  {
    id: "bomb-dropped", n: 14, maxWords: 28, isNew: true,
    moment: "Bomb, runda 5: Kasia padła z ładunkiem — leży na ulicy, atakujesz",
    state: bombState(bombData({ stage: "dropped", carrier: "", x: SITE_A.x * 0.5, y: 0, z: SITE_A.z * 0.5, roundEndsAt: S + 61_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 61_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 54_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, dead: ["p1", "bot-4"] }), health: 82, armor: 50, ...kit("rifle", 21), owned: ["pistol", "rifle"], money: 650,
      killFeed: feed(0, [[4_700, "me", "bot-4", "rifle"], [2_100, "p6", "p1", "smg"]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: MATES, dead: ["p1"], spotted: true }),
  },
  {
    id: "bomb-defusing", n: 16, maxWords: 52, isNew: true,
    moment: "Bomb: rozbrajasz ładunek na A (45 %), 21 s do wybuchu, na czacie 4 linie",
    state: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + 21_000, roundEndsAt: S + 40_000, actor: "me", progress: 0.45 }), {
      myTeam: 1, phase: MatchPhase.Playing, phaseEndsAt: S + 40_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 94_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, myTeam: 1, dead: ["p2", "bot-1", "p6", "p7", "bot-3"] }), health: 41, armor: 0, ...kit("rifle", 8), owned: ["pistol", "rifle"], money: 1_150,
      nearBomb: true, siteHere: "A",
      chat: chatLines(1, [[7_400, "p1", "rozbrajaj, kryję cię"], [5_800, "p2", "jeden na schodach"], [4_100, "p5", "nie zdążysz", true], [2_300, "p1", "dawaj dawaj"]]),
      killFeed: feed(1, [[5_600, "me", "p7", "rifle"], [3_000, "p1", "bot-3", "smg", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.7, { mates: MATES, dead: ["p2", "bot-1"] }),
  },
  {
    id: "bomb-teammate-defusing", n: 17, maxWords: 28, isNew: true,
    moment: "Bomb: Kasia rozbraja ładunek na A (30 %), ty pilnujesz",
    state: bombState(bombData({ stage: "planted", site: SITE_A.id, x: SITE_A.x, y: SITE_A.y, z: SITE_A.z, endsAt: S + 26_000, roundEndsAt: S + 40_000, actor: "p1", progress: 0.3 }), {
      myTeam: 1, phase: MatchPhase.Playing, phaseEndsAt: S + 40_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 89_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34, myTeam: 1, dead: ["p2", "p6", "bot-3"] }), health: 70, armor: 30, ...kit("rifle", 17), owned: ["pistol", "rifle"], money: 1_150,
      killFeed: feed(1, [[4_400, "me", "p6", "rifle", { headshot: true }]]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.65, { mates: MATES, dead: ["p2"] }),
  },
  {
    id: "turniej-freeze", n: 28, maxWords: 22, isNew: true,
    moment: "Turniej, półfinał Kowal — xXPiotrekXx (1 : 0): zamrożenie przed rundą 2",
    state: turniej(TOUR.semi1, ["me", "p5"], {
      phase: MatchPhase.Prep, phaseEndsAt: S + 11_200, matchEndsAt: pairMatchEnds(1), round: 1, scoreA: 1, scoreB: 0,
      buyWindowLeft: 11_200, money: CS_ECONOMY.start + CS_ECONOMY.win - 500,
    }),
    radar: radarFor(DUEL_MAP, 0, 0, { mates: [] }),
  },
  {
    id: "turniej-between-pairs", n: 30, maxWords: 30, isNew: true, elapsed: 2_500,
    moment: "Turniej: ZDZICHU wygrał półfinał 6 : 4 — przerwa przed finałem Kowal — ZDZICHU",
    before: turniej(TOUR.semi2, ["bot-1", "bot-3"], {
      phase: MatchPhase.Playing, serverNow: S - 3_500, phaseEndsAt: S + 21_000, matchEndsAt: pairMatchEnds(9), round: 9, scoreA: 5, scoreB: 4, buyWindowLeft: 0,
    }),
    state: turniej(TOUR.toFinal, null, {
      phase: MatchPhase.Prep, phaseEndsAt: S + TOURNAMENT.breakMs - 2_500, matchEndsAt: pairMatchEnds(10), round: 10, scoreA: 6, scoreB: 4,
      roundResult: "ELIMINATED", roundWinner: 0, buyWindowLeft: 0,
      killFeed: feed(0, [[2_700, "bot-1", "bot-3", "smg", { headshot: true }]]),
    }),
    radar: radarFor(DUEL_MAP, 0, 0.5, { alive: false, mates: [] }),
  },
  {
    id: "turniej-walkover", n: 31, maxWords: 28, isNew: true, elapsed: 1_200,
    moment: "Turniej: RYSIEK wyszedł w zamrożeniu — walkower, ZDZICHU w finale",
    before: turniej(TOUR.semi2Freeze, ["bot-1", "bot-3"], {
      phase: MatchPhase.Prep, serverNow: S - 2_200, phaseEndsAt: S + 6_000, matchEndsAt: pairMatchEnds(3), round: 3, scoreA: 2, scoreB: 1, buyWindowLeft: 8_200,
    }),
    state: turniej(TOUR.walkover, null, {
      phase: MatchPhase.Prep, phaseEndsAt: S + TOURNAMENT.breakMs - 1_200, matchEndsAt: pairMatchEnds(3), round: 3, scoreA: 2, scoreB: 1, buyWindowLeft: 0,
    }, { gone: ["bot-3"] }),
    radar: radarFor(DUEL_MAP, 0, 0.2, { alive: false, mates: [] }),
  },
];

/** P2's pins (§8.7): the strip's clock and scores, the mode lines and the action slot. */
export const pins: PinSet = {
  "warmup": { expect: ["[data-testid=objective]", "[data-testid=timer]"], text: ["ROZGRZEWKA"] },
  "countdown": { expect: ["[data-testid=objective]"], text: ["START 3"] },
  "tdm-live": { expect: ["[data-testid=score-goal]"], text: ["04:12"] },
  "tdm-wave-prep": { expect: ["[data-testid=timer]"], text: ["03:55"] },
  "dom-live-capturing": { expect: ["[data-testid=capture]", "[data-testid=flags]"], text: ["62%"] },
  "bomb-freeze": { expect: ["[data-testid=bomb-hud]"], text: ["START ZA 12s", "23:17"] },
  "bomb-live-carrier": { expect: ["[data-testid=bomb-hud]"], text: ["MASZ ŁADUNEK", "01:11"] },
  "bomb-planted-defender": { expect: [".bomb-hud.armed", "[data-testid=timer].urgent"], text: ["ROZBROIĆ", "00:28"] },
  "bomb-round-won": { expect: ["[data-testid=bomb-hud]"] },
  "bomb-round-lost": { text: ["21:44"] },
  "bomb-halftime": { expect: ["[data-testid=bomb-hud]"], text: ["ZMIANA STRON", "OBRONA", "19:58"] },
  "duel-freeze": { expect: ["[data-testid=duel-line]"], text: ["ZAMROŻENIE", "START ZA 12s"] },
  "duel-live-buytail": { expect: ["[data-testid=duel-line]"], text: ["SKLEP OTWARTY JESZCZE 3s"] },
  "duel-round-break": { expect: ["[data-testid=duel-line]"], text: ["NASTĘPNA RUNDA ZA 3s"] },
  "duel-match-point": { expect: ["[data-testid=duel-line]"], text: ["MECZBOL", "00:42"] },
  "infection-prep": { expect: ["[data-testid=infection-line]"], text: ["RUNDA 2 / 5", "RUNDA ZA 6s", "07:50"] },
  "gungame-live": { expect: ["[data-testid=ladder]", "[data-testid=ladder-gun]"], text: ["7/14"] },
  // Seeded scenarios: P2 writes these pins in wave 2.
  "ffa-live": {},
  "boys-live": {},
  "bomb-live-defender": {},
  "bomb-live-escort": {},
  "bomb-dropped": {},
  "bomb-defusing": {},
  "bomb-teammate-defusing": {},
  "turniej-freeze": {},
  "turniej-between-pairs": {},
  "turniej-walkover": {},
};

