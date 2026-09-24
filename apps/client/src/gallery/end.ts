/**
 * Gallery file of P6-end (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the Tab scoreboard and the
 * match result in its three stages, and P6's pins on its zones (`scoreboard`, `result`; §8.7). The
 * three pre-drop scenarios below moved here verbatim from `hudStates.tsx`; the seeded ones follow
 * §5.2 and carry no pins yet (P6 writes them in wave 2).
 */
import { BOMB, MATCH, MatchPhase, NIGHT_DISTRICT, encodeHaircut } from "@frankibarber/shared";
import {
  DUEL_MAP, MATES, REWARD_LOSS, REWARD_WIN, S, TDM_LIMIT, TOUR, base, bombData, bombFreeze, bombState, kit, pairMatchEnds, radarFor, roster, seat,
  tdmLive, tdmRadar, turniej, type PinSet, type Scenario,
} from "./fixtures";

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "scoreboard", moment: "TDM: trzymasz Tab — tabela wyników",
    n: 51, maxWords: 120,
    state: tdmLive(), radar: tdmRadar(), keys: ["Tab"],
  },
  {
    id: "match-end-win", moment: `TDM: koniec meczu, wygrana ${TDM_LIMIT} : 33`,
    n: 60, maxWords: 42,
    state: {
      ...base("tdm"), phase: MatchPhase.Ended, phaseEndsAt: S + 11_400, scoreA: TDM_LIMIT, scoreB: 33, winner: 0, reward: REWARD_WIN,
      players: roster({ f: 1, set: { "bot-3": { haircut: encodeHaircut("mohawk", 3) }, p2: { haircut: encodeHaircut("bowl", 1) } } }),
      ...kit("rifle", 11), owned: ["pistol", "rifle"], money: 5_200,
    },
    radar: tdmRadar(),
  },
  {
    id: "match-end-loss", moment: "Bomb: koniec meczu, porażka 4 : 7",
    n: 61, maxWords: 42,
    state: bombState(bombData({ round: 11, attackTeam: 1, stage: "resolved", result: "BOMB DETONATED" }), {
      phase: MatchPhase.Ended, phaseEndsAt: S + 11_400, scoreA: 4, scoreB: 7, winner: 1, reward: REWARD_LOSS,
      players: roster({ f: 0.9, set: { p1: { haircut: encodeHaircut("bleach", 2) } } }), money: 1_900,
    }),
    radar: radarFor(NIGHT_DISTRICT, 1, 0.5, { mates: MATES }),
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "scoreboard-bomb-history", n: 52, maxWords: 130, isNew: true,
    moment: "Bomb, runda 7, zamrożenie: sklep otwarty i trzymasz Tab — tabela z historią rund (od rundy 2)",
    state: bombFreeze(7, 11_600, {
      scoreA: 4, scoreB: 2, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], armor: 0, players: roster({ f: 0.5 }),
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
      phase: MatchPhase.Playing, phaseEndsAt: S + 44_000, matchEndsAt: pairMatchEnds(1), round: 1, scoreA: 1, scoreB: 0, buyWindowLeft: 0,
      ...kit("smg", 20), owned: ["pistol", "smg"], armor: 100, money: 450,
    }),
    radar: radarFor(DUEL_MAP, 0, 0.3, { mates: [] }),
    keys: ["Tab"],
  },
  {
    id: "match-end-verdict", n: 59, maxWords: 10, isNew: true, elapsed: 4_000,
    moment: "Bomb: koniec meczu 7 : 4 po rozbrojeniu, etap B — werdykt",
    state: bombState(bombData({ round: 11, attackTeam: 1, stage: "resolved", result: "BOMB DEFUSED" }), {
      phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 4_000, roundWinner: 0, winner: 0, scoreA: 7, scoreB: 4, reward: REWARD_WIN,
      players: roster({ f: 0.9 }), ...kit("rifle", 9), owned: ["pistol", "rifle"], money: 1_900,
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.7, { mates: MATES }),
  },
  {
    id: "match-end-ffa", n: 62, maxWords: 48, isNew: true, elapsed: 5_000,
    moment: "FFA: koniec meczu — wygrał xXPiotrekXx (30), jesteś siódmy z dziesięciu",
    state: {
      ...base("ffa"), phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 5_000, winnerId: "p5", winnerName: seat("p5").name,
      players: roster({ f: 1, ffa: true, set: { p5: { kills: 30, score: 3_000 }, me: { kills: 6, deaths: 14, assists: 1, score: 650 } } }),
      reward: REWARD_LOSS, ...kit("smg", 11), owned: ["pistol", "smg"], money: 2_700,
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.5, { mates: [] }),
  },
  {
    id: "match-end-turniej", n: 63, maxWords: 44, isNew: true, elapsed: 8_000,
    moment: "Turniej: ZDZICHU wygrał z tobą finał 6 : 4 — koniec drabinki, etap C",
    state: turniej(TOUR.done, ["me", "bot-1"], {
      phase: MatchPhase.Ended, phaseEndsAt: S + MATCH.endedMs - 8_000, matchEndsAt: pairMatchEnds(10), round: 10, scoreA: 4, scoreB: 6,
      roundWinner: 1, winner: 1, winnerId: "bot-1", winnerName: seat("bot-1").name, reward: REWARD_LOSS,
    }, { dead: ["me"] }),
    radar: radarFor(DUEL_MAP, 0, 0.5, { alive: false, mates: [] }),
  },
];

/** P6's pins (§8.7): the scoreboard and the result card. */
export const pins: PinSet = {
  "scoreboard": { expect: ["[data-testid=scoreboard]"] },
  "match-end-win": { expect: ["[data-testid=result][data-outcome=win]"], text: ["ZWYCIĘSTWO"] },
  "match-end-loss": { expect: ["[data-testid=result][data-outcome=loss]"], text: ["PORAŻKA"] },
  // Seeded scenarios: P6 writes these pins in wave 2.
  "scoreboard-bomb-history": {},
  "scoreboard-turniej": {},
  "match-end-verdict": {},
  "match-end-ffa": {},
  "match-end-turniej": {},
};
