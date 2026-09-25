/**
 * Gallery file of P2-top (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the live match in every mode
 * — the strip, the mode line, flags, the action slot, the pair card — and P2's pins on its zones
 * (`top`, `top-line`, `action`, `bracket`; §8.7). The eleven pre-drop scenarios below moved here
 * from `hudStates.tsx`; the seeded ones follow §5.2. The pins are §5.2's copy, the clocks re-pinned
 * to m:ss (§8.4), and wave 2 moved four photographed instants onto the spec's row (see the notes).
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
      // 2.6 s left (§5.2 row 6: „0:03”, inside the last 3 s, so the clock is pulsing).
      ...tdmLive(), phase: MatchPhase.Prep, phaseEndsAt: S + 2_600, matchEndsAt: S + 235_000, scoreA: 24, scoreB: 19,
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
      // On site A (§5.2 row 11: the C4 blinks and the action slot says how to plant).
      siteHere: "A",
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
      // Standing at the bomb (§5.2 row 15: „PRZYTRZYMAJ [T] · ROZBRÓJ”).
      nearBomb: true,
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
      // 5:03 on the match clock (§5.2 row 41).
      ...base("gungame"), phase: MatchPhase.Playing, phaseEndsAt: S + 303_000, matchEndsAt: S + 303_000,
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

/**
 * P2's pins (§8.7, §8.8): the strip's clock and scores, the mode lines, the action slot and the pair
 * card, in §5.2's exact copy. Clocks are m:ss now (§8.4): „04:12” → „4:12”, and a round mode's
 * freeze, round and break show their own clock, never the match backstop („23:17”, „21:44”, „19:58”,
 * „07:50” were the backstop). `bomb-hud` is not rendered in a break any more (§8.4).
 */
const TIMER = "[data-testid=timer]";
export const pins: PinSet = {
  "warmup": {
    expect: ["[data-testid=objective]", `${TIMER}[data-kind=warmup]`, "[data-testid=warmup-players]"],
    caseText: ["ROZGRZEWKA", "GRACZE 1/2", "PIERWSI DO 40 ZABÓJSTW"], absent: ["[data-testid=role-badge]", "[data-testid=alive-a]"],
  },
  "countdown": { expect: ["[data-testid=objective]", `${TIMER}[data-kind=countdown]`, "[data-testid=score-goal]"], caseText: ["0:03", "DO 40"], textAbsent: [{ text: "START 3" }] },
  "tdm-live": {
    expect: ["[data-testid=score-goal]", `${TIMER}[data-kind=match]`, ".ts-side.mine [data-testid=score-a]"],
    caseText: ["4:12", "DO 40", "FADE", "TAPER"], absent: ["[data-testid=alive-a]", "[data-zone=top-line]"],
  },
  "tdm-wave-prep": {
    expect: ["[data-testid=mode-line]", `${TIMER}[data-kind=freeze]`, `${TIMER} .ts-digits.tick`],
    caseText: ["0:03", "ZAMROŻENIE"], textAbsent: [{ text: "03:55" }],
  },
  "ffa-live": {
    expect: ["[data-testid=score-a]", "[data-testid=score-b]", ".ts-side.best.lead"],
    caseText: ["TY", "xXPiotrekXx", "3:40", "DO 30"], leftOf: ["[data-testid=score-a]", "[data-testid=score-b]"], absent: [".ts-side.mine"],
  },
  "dom-live-capturing": {
    expect: ["[data-testid=capture][data-progress]", "[data-testid=flags]", "[data-testid=flag-B].here", "[data-testid=capture] .act-bar"],
    caseText: ["PRZEJMUJESZ B · 62%", "5:03", "DO 100"],
  },
  "boys-live": {
    expect: [".top-bar[data-mode=boys]", "[data-testid=flags]", "[data-testid=flag-B].contested"],
    caseText: ["4:48", "DO 100"],
  },
  "bomb-freeze": {
    expect: [`${TIMER}[data-kind=freeze]`, "[data-testid=round-label]", "[data-testid=role-badge]", "[data-testid=alive-a]", "[data-testid=alive-b]"],
    caseText: ["0:12", "RUNDA 5 / 12", "ATAK"], absent: ["[data-testid=bomb-hud]", "[data-zone=top-line]"],
  },
  "bomb-live-carrier": {
    expect: ["[data-testid=bomb-hud]", `${TIMER}[data-kind=round]`, "[data-zone=action][data-kind=prompt-plant]"],
    caseText: ["MASZ ŁADUNEK", "1:11", "PRZYTRZYMAJ [T] · PODŁÓŻ"], absent: ["[data-testid=role-badge]"],
  },
  "bomb-live-defender": { expect: ["[data-testid=bomb-hud]", ".ts-side.l.t1.mine"], caseText: ["BROŃ PUNKTÓW A / B", "1:23"], absent: ["[data-zone=action]"] },
  "bomb-live-escort": { expect: ["[data-testid=bomb-hud]"], caseText: ["OSŁANIAJ NIOSĄCEGO ŁADUNEK", "1:19"] },
  "bomb-dropped": { expect: ["[data-testid=bomb-hud]"], caseText: ["ŁADUNEK UPUSZCZONY — PODNIEŚ GO", "1:01"] },
  "bomb-planted-defender": {
    expect: [".bomb-hud.armed", `${TIMER}[data-kind=bomb][aria-label="ŁADUNEK A"] .ts-bomb`, "[data-zone=action][data-kind=prompt-defuse]"],
    caseText: ["ŁADUNEK NA A — ROZBRÓJ [T]", "0:28", "PRZYTRZYMAJ [T] · ROZBRÓJ"],
    leftOf: ["[data-testid=score-b]", "[data-testid=score-a]"], textAbsent: [{ text: "00:28" }],
  },
  "bomb-defusing": {
    expect: ["[data-zone=action][data-kind=defuse][data-progress] .act-bar", `${TIMER}[data-kind=bomb]`],
    caseText: ["ROZBRAJANIE", "0:21", "ŁADUNEK NA A — ROZBRÓJ [T]"],
  },
  "bomb-teammate-defusing": {
    expect: ["[data-testid=bomb-hud].armed .ml-bar.t1", `${TIMER}[data-kind=bomb]`],
    caseText: ["Kasia_Brzytwa ROZBRAJA", "0:26"], absent: ["[data-zone=action]"],
  },
  "bomb-round-won": { expect: [`${TIMER}[data-kind=break]`], absent: ["[data-testid=bomb-hud]"], caseText: ["0:04"] },
  "bomb-round-lost": { expect: [`${TIMER}[data-kind=break]`], absent: ["[data-testid=bomb-hud]"], caseText: ["0:04"], textAbsent: [{ text: "21:44" }] },
  "bomb-halftime": { expect: ["[data-testid=role-badge]", `${TIMER}[data-kind=freeze]`], caseText: ["OBRONA", "0:13", "RUNDA 7 / 12"], textAbsent: [{ text: "19:58" }] },
  "duel-freeze": {
    expect: [`${TIMER}[data-kind=freeze]`, "[data-testid=round-label]", "[data-testid=score-goal]", "[data-testid=alive-a][data-count=\"1\"]"],
    caseText: ["0:12", "RUNDA 2", "DO 6"], absent: ["[data-testid=duel-line]", "[data-zone=top-line]"],
  },
  "duel-live-buytail": { expect: [`${TIMER}[data-kind=round]`], caseText: ["0:58"], absent: ["[data-testid=duel-line]", "[data-zone=top-line]"] },
  "duel-round-break": { expect: [`${TIMER}[data-kind=break]`], caseText: ["0:03"], absent: ["[data-testid=duel-line]"] },
  "duel-match-point": { expect: ["[data-testid=duel-line].warn"], caseText: ["MECZBOL · FADE", "0:42"], textAbsent: [{ text: "BRONISZ MECZBOLU" }] },
  "infection-prep": {
    expect: ["[data-testid=infection-line]", "[data-testid=mode-line]", `${TIMER}[data-kind=freeze]`, "[data-testid=role-badge]"],
    caseText: ["RUNDA 2 / 5 · 9 NIEOSTRZYŻONYCH", "0:06", "UCIEKAJ PRZED MASZYNKĄ", "OCALONY", "OCALENI", "OSTRZYŻENI"],
    textAbsent: [{ text: "07:50" }, { text: "RUNDA ZA" }],
    // My badge is its own item in row 2, left of the full-width line and never run into it.
    leftOf: ["[data-testid=role-badge]", "[data-testid=infection-line]"],
  },
  "gungame-live": {
    expect: ["[data-testid=ladder]", "[data-testid=ladder-gun]", "[data-testid=score-b]"],
    // §5.2's „C-20 Side Part → M-1” is an example; the ladder's rung 7 is whatever GUN_GAME says.
    caseText: ["7/14", `${WEAPONS[ladderWeapon(6)].name} → ${WEAPONS[ladderWeapon(7)].name.split(" ")[0]}`, "9/14", "xXPiotrekXx", "5:03"],
  },
  "turniej-freeze": {
    expect: ["[data-testid=bracket-strip]", `${TIMER}[data-kind=freeze]`, "[data-testid=alive-a][data-count=\"1\"]", "[data-testid=alive-b][data-count=\"1\"]"],
    caseText: ["PÓŁFINAŁ · RUNDA 2", "Kowal", "xXPiotrekXx", "0:12"], absent: ["[data-testid=bracket-card]", ".ts-pip.dead"],
  },
  "turniej-between-pairs": {
    expect: ["[data-testid=bracket-card]", `${TIMER}[data-kind=break]`, "[data-testid=bracket-strip]"],
    caseText: ["ZDZICHU PRZECHODZI DALEJ", "6 : 4 · Przeciwnik wyeliminowany", "NASTĘPNA PARA · FINAŁ", "Kowal vs ZDZICHU", "GRASZ TERAZ", "DRABINKA", "0:07"],
    absent: ["[data-testid=score-a]", "[data-testid=score-b]", "[data-zone=top-line]"],
  },
  "turniej-walkover": {
    expect: ["[data-testid=bracket-card].walkover"],
    caseText: ["WALKOWER · ZDZICHU DALEJ", "NASTĘPNA PARA · FINAŁ", "Kowal vs ZDZICHU"], absent: [".bc-verdict"],
  },
};
