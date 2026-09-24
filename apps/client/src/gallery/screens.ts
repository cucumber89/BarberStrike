/**
 * Gallery file of P7-screens (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the shop, the ESC menu,
 * loading and the menu after an error, and P7's pins on its zones (`shop`, `pause`, `settings`,
 * `prompt`, `loading`, `fade`; §8.7). The four pre-drop scenarios below moved here verbatim from
 * `hudStates.tsx`; the seeded ones follow §5.2 and carry no pins yet (P7 writes them in wave 2).
 */
import { BOMB, MatchPhase, NIGHT_DISTRICT } from "@frankibarber/shared";
import {
  MATES, S, T, bombData, bombFreeze, bombMatchEnds, bombState, kit, radarFor, roster, tdmLive, tdmRadar, type PinSet, type Scenario,
} from "./fixtures";
import { ERR } from "../ui/hud/copy";

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "shop-open", moment: "Bomb, runda 4, zamrożenie: sklep otwarty (B)",
    n: 49, maxWords: 130,
    state: bombFreeze(4, 9_800, { scoreA: 2, scoreB: 1, money: 4_150, ...kit("pistol"), owned: ["pistol"], shopOpen: true, pointerLocked: false }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "pause", moment: "TDM: ESC — karta pauzy",
    n: 54, maxWords: 28,
    state: { ...tdmLive(), pointerLocked: false }, radar: tdmRadar(),
  },
  {
    id: "loading", view: "loading", moment: "Ładowanie meczu: wczytywanie mapy",
    n: 64, maxWords: 16,
    state: { mode: "bomb", loadStage: "map" },
  },
  {
    id: "loading-ready", view: "loading-ready", moment: "Ładowanie skończone: WEJDŹ DO MECZU (HUD uśpiony pod spodem)",
    n: 65, maxWords: 26,
    state: { ...bombFreeze(1, BOMB.buyMs - 200, { scoreA: 0, scoreB: 0, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], players: roster({ f: 0 }) }), pointerLocked: false },
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "shop-open-bomb-tail", n: 50, maxWords: 130, isNew: true,
    moment: "Bomb, runda 5: 2 s po starcie rundy, sklep otwarty jeszcze 3 s",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + BOMB.roundMs - 2_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + BOMB.roundMs - 2_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 2_000), scoreA: 3, scoreB: 1,
      buyWindowLeft: BOMB.buyTailMs - 2_000, money: 2_350, ...kit("pistol"), owned: ["pistol"], armor: 0,
      players: roster({ f: 0.34 }), shopOpen: true, pointerLocked: false,
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.05, { mates: MATES }),
  },
  {
    id: "pause-leave-confirm", n: 55, maxWords: 34, isNew: true,
    moment: "TDM: ESC, potem OPUŚĆ MECZ — pytanie, czy na pewno",
    state: { ...tdmLive(), pointerLocked: false }, radar: tdmRadar(),
    clicks: ["[data-testid=btn-leave]"],
  },
  {
    id: "pause-teams", n: 56, maxWords: 56, isNew: true,
    moment: "Bomb: ESC, zmiana drużyny — przejście do TAPER od następnej rundy",
    state: {
      ...bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 79_000 }), {
        phase: MatchPhase.Playing, phaseEndsAt: S + 79_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 36_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
        players: roster({ f: 0.34 }), health: 100, armor: 100, ...kit("rifle", 30), owned: ["pistol", "rifle"], money: 650,
      }),
      pointerLocked: false, teamResult: { ok: true, team: 1, deferred: true, at: T - 1_200 },
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.35, { mates: MATES }),
  },
  {
    id: "pause-settings", n: 57, maxWords: null, isNew: true,
    moment: "TDM: ESC, potem USTAWIENIA — panel obok kolumny",
    state: { ...tdmLive(), pointerLocked: false }, radar: tdmRadar(),
    clicks: ["[data-testid=btn-pause-settings]"],
  },
  {
    id: "menu-error", n: 66, maxWords: null, isNew: true, view: "menu-error", errorCode: ERR.deployTimeout,
    moment: "Menu po nieudanym wejściu do meczu (limit czasu wejścia)",
    state: {},
  },
];

/** P7's pins (§8.7): the shop, the pause card, loading and the dormant HUD behind it. */
export const pins: PinSet = {
  "shop-open": { expect: ["[data-testid=shop]"] },
  "pause": { expect: ["[data-testid=pause]", "[data-testid=btn-resume]"] },
  "loading": { expect: ["[data-testid=loading]"] },
  "loading-ready": { expect: ["[data-testid=enter-game]", ".hud.dormant"] },
  // Seeded scenarios: P7 writes these pins in wave 2.
  "shop-open-bomb-tail": {},
  "pause-leave-confirm": {},
  "pause-teams": {},
  "pause-settings": {},
  "menu-error": {},
};
