/**
 * Gallery file of P6-end (docs/UI_U_SPEC.md §7 P6): the Tab scoreboard and the match result in its
 * three stages, and P6's pins on its zones (`scoreboard`, `result`; §8.7, §8.8). The pins say what
 * each moment must show a player — the verdict, the podium, the stat order, the history strip, the
 * board over the shop — and what it must no longer show (the English, the [TAB] keycap, the false
 * "the next match starts by itself").
 */
import { BOMB, MATCH, MatchPhase, NIGHT_DISTRICT, encodeHaircut } from "@frankibarber/shared";
import {
  DUEL_MAP, MATES, REWARD_LOSS, REWARD_WIN, S, TDM_LIMIT, TOUR, base, bombData, bombFreeze, bombState, kit, pairMatchEnds, radarFor, roster, seat,
  tdmLive, tdmRadar, turniej, type PinSet, type Scenario,
} from "./fixtures";

export const scenarios: Scenario[] = [
  // ---- pre-drop scenarios (their states kept; the map named, and the loss made coherent)
  {
    id: "scoreboard", moment: "TDM: trzymasz Tab — tabela wyników",
    n: 51, maxWords: 120,
    state: {
      ...tdmLive(), mapId: NIGHT_DISTRICT.id,
      players: roster({ f: 0.58, dead: ["p7", "bot-2", "bot-4"], set: { "bot-3": { haircut: encodeHaircut("mohawk", 2) } } }),
    },
    radar: tdmRadar(), keys: ["Tab"],
  },
  {
    id: "match-end-win", moment: `TDM: koniec meczu, wygrana ${TDM_LIMIT} : 33`,
    n: 60, maxWords: 42,
    state: {
      ...base("tdm"), mapId: NIGHT_DISTRICT.id, phase: MatchPhase.Ended, phaseEndsAt: S + 11_400, scoreA: TDM_LIMIT, scoreB: 33, winner: 0, reward: REWARD_WIN,
      players: roster({ f: 1, set: { "bot-3": { haircut: encodeHaircut("mohawk", 3) }, p2: { haircut: encodeHaircut("bowl", 1) } } }),
      ...kit("rifle", 11), owned: ["pistol", "rifle"], money: 5_200,
    },
    radar: tdmRadar(),
  },
  {
    // I play TAPER and attack in round 11 (`bombAttackTeam`): we are wiped, FADE takes the match
    // 7 : 4 — the deciding round reads „Atak wybity” from my seat (§5.2 #61).
    id: "match-end-loss", moment: "Bomb: koniec meczu, porażka 4 : 7 — atak wybity w rundzie 11",
    n: 61, maxWords: 42,
    state: bombState(bombData({ round: 11, attackTeam: 1, stage: "resolved", result: "ATTACKERS ELIMINATED" }), {
      myTeam: 1, mapId: NIGHT_DISTRICT.id, phase: MatchPhase.Ended, phaseEndsAt: S + 11_400, scoreA: 7, scoreB: 4, winner: 0, roundWinner: 0, reward: REWARD_LOSS,
      players: roster({ f: 0.9, myTeam: 1, set: { p1: { haircut: encodeHaircut("bleach", 2) } } }), money: 1_900,
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.5, { mates: MATES }),
  },

  // ---- drop U scenarios (§5.2)
  {
    id: "scoreboard-bomb-history", n: 52, maxWords: 130, isNew: true,
    moment: "Bomb, runda 7, zamrożenie: sklep otwarty i trzymasz Tab — tabela z historią rund (od rundy 2)",
    state: bombFreeze(7, 11_600, {
      mapId: NIGHT_DISTRICT.id, scoreA: 4, scoreB: 2, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], armor: 0, players: roster({ f: 0.5 }),
      shopOpen: true, pointerLocked: false,
      roundHistory: [
        { round: 2, winner: 0, reason: "BOMB DETONATED" }, { round: 3, winner: 1, reason: "ATTACKERS ELIMINATED" },
        { round: 4, winner: 0, reason: "DEFENDERS ELIMINATED" }, { round: 5, winner: 0, reason: "BOMB DETONATED" },
        { round: 6, winner: 1, reason: "BOMB DEFUSED" },
      ],
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0, { mates: MATES }),
    keys: ["Tab"],
  },
  {
    id: "scoreboard-turniej", n: 53, maxWords: 90, isNew: true,
    moment: "Turniej, półfinał Kowal — xXPiotrekXx (1 : 0) trwa: trzymasz Tab",
    state: turniej(TOUR.semi1, ["me", "p5"], {
      mapId: DUEL_MAP.id, phase: MatchPhase.Playing, phaseEndsAt: S + 44_000, matchEndsAt: pairMatchEnds(1), round: 1, scoreA: 1, scoreB: 0, buyWindowLeft: 0,
      ...kit("smg", 20), owned: ["pistol", "smg"], armor: 100, money: 450,
    }),
    radar: radarFor(DUEL_MAP, 0, 0.3, { mates: [] }),
    keys: ["Tab"],
  },
  {
    id: "match-end-verdict", n: 59, maxWords: 10, isNew: true, elapsed: 4_000,
    moment: "Bomb: koniec meczu 7 : 4 po rozbrojeniu, etap B — werdykt",
    state: bombState(bombData({ round: 11, attackTeam: 1, stage: "resolved", result: "BOMB DEFUSED" }), {
      mapId: NIGHT_DISTRICT.id, phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 4_000, roundWinner: 0, winner: 0, scoreA: 7, scoreB: 4, reward: REWARD_WIN,
      players: roster({ f: 0.9 }), ...kit("rifle", 9), owned: ["pistol", "rifle"], money: 1_900,
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.7, { mates: MATES }),
  },
  {
    id: "match-end-ffa", n: 62, maxWords: 48, isNew: true, elapsed: 5_000,
    moment: "FFA: koniec meczu — wygrał xXPiotrekXx (30), jesteś siódmy z dziesięciu",
    state: {
      ...base("ffa"), mapId: NIGHT_DISTRICT.id, phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 5_000, winnerId: "p5", winnerName: seat("p5").name,
      players: roster({ f: 1, ffa: true, set: { p5: { kills: 30, score: 3_000 }, me: { kills: 6, deaths: 14, assists: 1, score: 650 }, p6: { haircut: encodeHaircut("slickback", 2) } } }),
      reward: REWARD_LOSS, ...kit("smg", 11), owned: ["pistol", "smg"], money: 2_700,
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: [] }),
  },
  {
    id: "match-end-turniej", n: 63, maxWords: 44, isNew: true, elapsed: 8_000,
    moment: "Turniej: ZDZICHU wygrał z tobą finał 6 : 4 — koniec drabinki, etap C",
    state: turniej(TOUR.done, ["me", "bot-1"], {
      mapId: DUEL_MAP.id, phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 8_000, matchEndsAt: pairMatchEnds(10), round: 10, scoreA: 4, scoreB: 6,
      roundWinner: 1, winner: 1, winnerId: "bot-1", winnerName: seat("bot-1").name, reward: REWARD_LOSS,
    }, { dead: ["me"] }),
    radar: radarFor(DUEL_MAP, 0, 0.5, { alive: false, mates: [] }),
  },
];

/** The result card's zone at stage C in round modes and in continuous modes (§5.1). */
const C_ROUND = 42, C_CONTINUOUS = 48;
/** What the result must never say again: the English and the false "starts by itself" (§5.2 #60). */
const GONE = [{ text: "startuje sam", zone: "result" as const }, { text: "TEAM DEATHMATCH" }, { text: "FREE FOR ALL" }, { text: "BOMB PLANT" }];
/** Stage C's stat order in every mode: the objective first where the mode has one, then K, A, D. */
const KAD = [".result-stat:nth-child(1)[data-stat=kills]", ".result-stat:nth-child(2)[data-stat=assists]", ".result-stat:nth-child(3)[data-stat=deaths]"];

/** P6's pins (§8.7, §8.8): the scoreboard and the result card. */
export const pins: PinSet = {
  "scoreboard": {
    expect: [
      "[data-testid=scoreboard][data-zone=scoreboard]", "[data-testid=sb-header]",
      // My team first, the enemy below; a dead player at half strength with the skull.
      "[data-testid=scoreboard] .sb-team:first-child.mine.t0", "[data-testid=scoreboard] .sb-team:nth-child(2).theirs.t1",
      "[data-testid=scoreboard] tr.dead .sb-skull", "[data-testid=scoreboard] .sb-team.mine td.sb-money:not(:empty)",
    ],
    // `$` only on my side.
    absent: ["[data-testid=scoreboard] .sb-team.theirs td.sb-money:not(:empty)", "[data-testid=sb-history]"],
    caseText: ["DRUŻYNOWY DEATHMATCH", "NIGHT DISTRICT", "PKT", "PING", "xXPiotrekXx"],
    textAbsent: [{ text: "TEAM DEATHMATCH" }],
    zoneWords: { scoreboard: 110 },
  },
  "scoreboard-bomb-history": {
    expect: [
      "[data-testid=scoreboard]", "[data-zone=shop]",
      // 12 slots; round 1 was before I joined (empty), 2–6 seen with their reasons, 7 is now; the swap gap after 6.
      "[data-testid=sb-history] [data-slot='12']", "[data-testid=sb-history] [data-slot='1'].empty",
      "[data-testid=sb-history] [data-slot='2'].w0[data-reason=detonation]", "[data-testid=sb-history] [data-slot='3'].w1[data-reason=elimination]",
      "[data-testid=sb-history] [data-slot='6'].w1.gap[data-reason=defuse]", "[data-testid=sb-history] [data-slot='7'].now.empty",
    ],
    absent: ["[data-testid=sb-history] [data-slot='13']"],
    caseText: ["RUNDA 7 / 12", "0:12", "ŁADUNEK", "NIGHT DISTRICT"],
    zoneWords: { scoreboard: 110 },
  },
  "scoreboard-turniej": {
    expect: [
      "[data-testid=scoreboard] [data-testid=bracket]", "[data-testid=scoreboard] .sb-team.pair tbody tr:nth-child(2)[data-testid=sb-row]",
    ],
    // The pair's two rows only: the bystanders are in the draw below them.
    absent: ["[data-testid=scoreboard] .sb-team.pair tbody tr:nth-child(3)", "[data-testid=sb-history]"],
    caseText: ["Kowal", "xXPiotrekXx", "TURNIEJ"],
    textAbsent: [{ text: "FADE", zone: "scoreboard" }, { text: "TAPER", zone: "scoreboard" }],
    zoneWords: { scoreboard: 90 },
  },
  "match-end-final-round": {
    // Stage A: the card is already mounted (e2e reads `summary` from t = 0), and invisible.
    expect: ["[data-testid=result][data-stage=A]", "[data-testid=summary]"],
    invisible: ["[data-testid=result]"],
  },
  "match-end-verdict": {
    expect: ["[data-testid=result][data-stage=B][data-outcome=win]", "[data-testid=result-verdict-why]"],
    invisible: [".result-card"],
    caseText: ["ZWYCIĘSTWO", "FADE 7 — 4 TAPER", "Ładunek rozbrojony"],
    zoneWords: { result: 8 },
  },
  "match-end-win": {
    expect: [
      "[data-testid=result][data-outcome=win][data-stage=C]", "[data-testid=podium] .podium-step.r1 .podium-star",
      "[data-testid=result-tab-summary]", "[data-testid=result-tab-table]", "[data-testid=summary-worst-haircut]", "[data-testid=summary-toggle]", ...KAD,
    ],
    absent: ["[data-testid=result-tab-bracket]", ".result-tabs kbd", "[data-testid=placement]"],
    invisible: ["[data-testid=result-verdict-why]"],
    text: ["ZWYCIĘSTWO"],
    caseText: ["FADE 40 — 33 TAPER", "Pierwsi do 40 zabójstw", "PODSUMOWANIE", "TABELA", "+790 XP", "POZIOM 4", "NAJGORSZA FRYZURA:", "RYSIEK", "×3", "SZCZEGÓŁY", "ROZGRZEWKA ZA 12s", "WYJDŹ DO MENU"],
    textAbsent: GONE,
    zoneWords: { result: C_ROUND }, // §5.2 #60 caps the TDM card at 42 too (ACCEPTANCE), under the continuous 48
  },
  "match-end-loss": {
    expect: ["[data-testid=result][data-outcome=loss][data-stage=C]", "[data-testid=podium]", ...KAD],
    text: ["PORAŻKA"],
    caseText: ["FADE 7 — 4 TAPER", "Atak wybity w ostatniej rundzie", "ROZGRZEWKA ZA 12s"],
    textAbsent: GONE,
    zoneWords: { result: C_ROUND },
  },
  "match-end-ffa": {
    // No score line: the podium is FFA's score (#1 is the winner), and I am 7th, so my place shows.
    expect: ["[data-testid=result][data-outcome=loss][data-stage=C]", ".result-top [data-testid=result-score] [data-testid=podium]", ".result-top [data-testid=placement]", ...KAD],
    absent: [".result-summary [data-testid=podium]"],
    caseText: ["MIEJSCE #7 Z 10", "xXPiotrekXx", "Pierwszy do 30 zabójstw"],
    textAbsent: [...GONE, { text: "bierze tę noc", zone: "result" }],
    zoneWords: { result: C_CONTINUOUS },
  },
  "match-end-turniej": {
    expect: ["[data-testid=result][data-outcome=loss][data-stage=C]", "[data-testid=result-tab-bracket]", "[data-testid=podium] .podium-step.r1"],
    caseText: ["ZDZICHU wygrał finał drabinki", "Kowal 4 — 6 ZDZICHU", "DRABINKA"],
    textAbsent: GONE,
    zoneWords: { result: C_ROUND },
  },
  "new-match-warmup": {
    // Ended → Waiting 700 ms ago: the card faded out over 400 ms and is gone (keep-mounted, §6.1).
    absent: ["[data-testid=result]"],
  },
};
