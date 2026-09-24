/**
 * Gallery file of P3-left (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the left column — radar,
 * money and the buy row, the round plan, chat, hints — and P3's pins on its zones (`radar`,
 * `wallet`, `plan`, `chat`, `hint`; §8.7). The pre-drop scenario below moved here verbatim from
 * `hudStates.tsx`; the seeded ones follow §5.2 and carry no pins yet (P3 writes them in wave 2).
 */
import { BOMB, MatchPhase, NIGHT_DISTRICT, planOffer } from "@frankibarber/shared";
import {
  MATES, S, T, bombData, bombFreeze, bombMatchEnds, bombState, chatLines, kit, radarFor, roster, type PinSet, type Scenario,
} from "./fixtures";

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "bomb-freeze", moment: "Bomb, runda 5, zamrożenie: zakupy + głosowanie planu (atak)",
    n: 10, maxWords: 48,
    state: bombFreeze(5, 11_400, {
      scoreA: 3, scoreB: 1,
      plan: { options: planOffer(5), tally: [1, 2], chosen: 0, appliesAt: S + 11_400, votingTeam: 0, round: 5, at: T - 3_600 },
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "shop-closed-flash", n: 46, maxWords: 22, isNew: true, elapsed: 600,
    moment: "Bomb, runda 5 trwa: B po zamknięciu okna zakupów — sklep zamknięty",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 88_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 88_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 27_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34 }), health: 100, armor: 0, ...kit("pistol"), owned: ["pistol"], money: 2_900,
      shopResult: { ok: false, item: "", reason: "closed", at: T - 600 },
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.3, { mates: MATES }),
  },
  {
    id: "chat-busy", n: 47, maxWords: 90, isNew: true,
    moment: "Bomb, runda 5, zamrożenie: 6 linii czatu, +$300 za sprzedaż, 3 perki, portfel i plan rundy",
    state: bombFreeze(5, 9_400, {
      scoreA: 3, scoreB: 1, money: 3_450,
      plan: { options: planOffer(5), tally: [2, 1], chosen: 0, appliesAt: S + 9_400, votingTeam: 0, round: 5, at: T - 5_600 },
      perks: { flask: S + 45_000, roids: S + 45_000, energy: S + 45_000, fade: 0 },
      moneyToasts: [{ key: 9, delta: 300, reason: "sell", total: 3_450, at: T - 900 }],
      chat: chatLines(0, [
        [8_300, "p1", "biorę A, kto ze mną?"], [7_100, "p2", "ja środkiem"], [5_800, "p5", "powodzenia", true],
        [4_600, "me", "głosujcie F1, roleta"], [3_200, "p6", "gl hf", true], [1_500, "p1", "ok, F1"],
      ]),
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "radar-rim-pins", n: 48, maxWords: 24, isNew: true,
    moment: "Bomb, runda 5 trwa: 14 s po starcie, jeszcze przy spawnie ataku — A i B poza zasięgiem radaru",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 101_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + 101_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 14_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
      players: roster({ f: 0.34 }), health: 100, armor: 100, ...kit("rifle"), owned: ["pistol", "rifle"], money: 650,
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.05, { mates: MATES }),
  },
];

/** P3's pins (§8.7): the buy prompt and the plan vote. */
export const pins: PinSet = {
  "tdm-wave-prep": { expect: ["[data-testid=buy-prompt]"] },
  "bomb-freeze": { expect: ["[data-testid=plan-vote]", "[data-testid=buy-prompt]"] },
  "bomb-halftime": { expect: ["[data-testid=buy-prompt]"] },
  "duel-freeze": { expect: ["[data-testid=buy-prompt]"] },
  "duel-live-buytail": { expect: ["[data-testid=buy-prompt]"] },
  // Seeded scenarios: P3 writes these pins in wave 2.
  "shop-closed-flash": {},
  "chat-busy": {},
  "radar-rim-pins": {},
};
