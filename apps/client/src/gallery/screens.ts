/**
 * Gallery file of P7-screens (docs/UI_U_SPEC.md §7): the shop, the ESC menu, loading and the menu
 * after an error, and P7's pins on its zones (`shop`, `pause`, `settings`, `prompt`, `loading`,
 * `fade`; §8.7, §8.8). The states follow §5.2 #49–57 and #64–66.
 *
 * Where a state carries `mapId`, it is the field P1 produces from the room (P0 declared it, "" until
 * then): the ESC column and the ready card name the map from it, and without it they say only the
 * mode — which is what the live game shows until P1 merges (R8).
 */
import { BOMB, MatchPhase, NIGHT_DISTRICT, bombAttackTeam, planOffer } from "@frankibarber/shared";
import {
  MATES, S, T, bombData, bombFreeze, bombMatchEnds, bombState, kit, radarFor, roster, tdmLive, tdmRadar, type PinSet, type Scenario,
} from "./fixtures";
import { ERR } from "../ui/hud/copy";

const MAP = NIGHT_DISTRICT.id;
/** The shop's five column headers (§5.2 #49). */
const TABS = [1, 2, 3, 4, 5].map((n) => `[data-testid=shop-tab-${n}]`);
/** Words the pre-drop screens printed that must be gone (§5.2 #49–50, #54, #64). */
const GONE_SHOP = [{ text: "Okno po odrodzeniu", zone: "shop" as const }, { text: "Kliknij przedmiot", zone: "shop" as const }];

export const scenarios: Scenario[] = [
  {
    // Round 2 is a plan round (`planOffer`), so the vote strip is on: „PLAN: [F1] OTWÓRZ ROLETĘ 2 ·
    // [F2] ZBURZ MUR W ZAUŁKU 1”. $4,100 is a won pistol round; 12 s of the freeze are left.
    id: "shop-open", moment: "Bomb, runda 2, zamrożenie: sklep otwarty (B), głosowanie planu",
    n: 49, maxWords: 130,
    state: bombFreeze(2, 11_400, {
      scoreA: 1, scoreB: 0, money: 4_100, ...kit("pistol"), owned: ["pistol"], shopOpen: true, pointerLocked: false, mapId: MAP,
      plan: { options: planOffer(2), tally: [2, 1], chosen: 0, appliesAt: S + 11_400, votingTeam: bombAttackTeam(2), round: 2, at: T - 3_600 },
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0, { mates: MATES }),
  },
  {
    id: "shop-open-bomb-tail", n: 50, maxWords: 130, isNew: true,
    moment: "Bomb, runda 5: 2 s po starcie rundy, sklep otwarty jeszcze 3 s",
    state: bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + BOMB.roundMs - 2_000 }), {
      phase: MatchPhase.Playing, phaseEndsAt: S + BOMB.roundMs - 2_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 2_000), scoreA: 3, scoreB: 1,
      buyWindowLeft: BOMB.buyTailMs - 2_000, money: 2_350, ...kit("pistol"), owned: ["pistol"], armor: 0,
      players: roster({ f: 0.34 }), shopOpen: true, pointerLocked: false, mapId: MAP,
    }),
    radar: radarFor(NIGHT_DISTRICT, 0, 0.05, { mates: MATES }),
  },
  {
    id: "pause", moment: "TDM: ESC — kolumna menu",
    n: 54, maxWords: 28,
    state: { ...tdmLive(), pointerLocked: false, mapId: MAP }, radar: tdmRadar(),
  },
  {
    id: "pause-leave-confirm", n: 55, maxWords: 34, isNew: true,
    moment: "TDM: ESC, potem OPUŚĆ MECZ — pytanie, czy na pewno",
    state: { ...tdmLive(), pointerLocked: false, mapId: MAP }, radar: tdmRadar(),
    clicks: ["[data-testid=btn-leave]"],
  },
  {
    // The picker opens with its answer: a side asked for 1.2 s ago keeps it open under ZMIEŃ
    // DRUŻYNĘ (PauseMenu), which is how a player who reopens ESC finds the answer.
    id: "pause-teams", n: 56, maxWords: 56, isNew: true,
    moment: "Bomb: ESC, zmiana drużyny — przejście do TAPER od następnej rundy",
    state: {
      ...bombState(bombData({ stage: "carried", carrier: "p1", roundEndsAt: S + 79_000 }), {
        phase: MatchPhase.Playing, phaseEndsAt: S + 79_000, matchEndsAt: bombMatchEnds(4, BOMB.buyMs + 36_000), scoreA: 3, scoreB: 1, buyWindowLeft: 0,
        players: roster({ f: 0.34 }), health: 100, armor: 100, ...kit("rifle", 30), owned: ["pistol", "rifle"], money: 650,
      }),
      pointerLocked: false, mapId: MAP, teamResult: { ok: true, team: 1, deferred: true, at: T - 1_200 },
    },
    radar: radarFor(NIGHT_DISTRICT, 0, 0.35, { mates: MATES }),
  },
  {
    id: "pause-settings", n: 57, maxWords: null, isNew: true,
    moment: "TDM: ESC, potem USTAWIENIA — panel obok kolumny",
    state: { ...tdmLive(), pointerLocked: false, mapId: MAP }, radar: tdmRadar(),
    clicks: ["[data-testid=btn-pause-settings]"],
  },
  {
    // No mode in the store (§5.2 #64): before the room syncs it holds the default "tdm", and the
    // card must not announce it. The runner mounts <Loading> without the menu's pick, which is the
    // join-by-room-id case: „DOŁĄCZANIE DO POKOJU”.
    id: "loading", view: "loading", moment: "Ładowanie meczu: wczytywanie mapy (dołączanie do pokoju)",
    n: 64, maxWords: 16,
    state: { loadStage: "map" },
  },
  {
    id: "loading-ready", view: "loading-ready", moment: "Ładowanie skończone: WEJDŹ DO MECZU (HUD uśpiony pod spodem)",
    n: 65, maxWords: 26,
    state: { ...bombFreeze(1, BOMB.buyMs - 200, { scoreA: 0, scoreB: 0, money: BOMB.startMoney, ...kit("pistol"), owned: ["pistol"], players: roster({ f: 0 }) }), pointerLocked: false, mapId: MAP },
  },
  {
    id: "menu-error", n: 66, maxWords: null, isNew: true, view: "menu-error", errorCode: ERR.deployTimeout,
    moment: "Menu po nieudanym wejściu do meczu (limit czasu wejścia)",
    state: {},
  },
];

/** P7's pins (§8.7, §8.8): what each moment must show, and what the old screens said that must not. */
export const pins: PinSet = {
  "shop-open": {
    expect: ["[data-testid=shop][data-zone=shop]", ...TABS, "[data-testid=shop-plan]", "[data-testid=shop-countdown]", "[data-testid=shop-money]", "[data-testid=shop-close]", "[data-testid=shop-detail]"],
    caseText: ["SKLEP", "$4,100", "12s", "PISTOLETY", "ŚREDNIA PÓŁKA", "KARABINY", "WYPOSAŻENIE", "GRANATY", "PLAN:", "OTWÓRZ ROLETĘ", "ZA ZABÓJSTWO", "DZIAŁ", "PRZEDMIOT", "ZAMKNIJ", "LUNETA"],
    // CS modes: the kill pays by weapon in the detail strip, so the flat $300 / +$50 line is gone.
    textAbsent: [...GONE_SHOP, { text: "Zabójstwo $300", zone: "shop" }, { text: "CZAS NA ZAKUPY", zone: "shop" }],
    absent: [".shop-countdown.warn", "[data-testid=why-pistol]"],
  },
  "shop-open-bomb-tail": {
    expect: ["[data-testid=shop][data-zone=shop]", ...TABS, ".shop-countdown.warn", "[data-testid=why-rifle]"],
    caseText: ["$2,350", "3s", "Brakuje $250"],
    absent: ["[data-testid=shop-plan]"],
    textAbsent: [...GONE_SHOP, { text: "odrodzeniu", zone: "shop" }, { text: "Zabójstwo $300", zone: "shop" }],
  },
  "pause": {
    expect: ["[data-testid=pause][data-zone=pause]", "[data-testid=btn-resume]", "[data-testid=btn-pause-settings]", "[data-testid=btn-teams]", "[data-testid=btn-fullscreen]", "[data-testid=btn-leave]"],
    caseText: ["MENU", "MECZ TRWA DALEJ", "DRUŻYNOWY DEATHMATCH · NIGHT DISTRICT", "WRÓĆ DO GRY", "USTAWIENIA", "ZMIEŃ DRUŻYNĘ", "PEŁNY EKRAN", "OPUŚĆ MECZ"],
    absent: ["[data-testid=team-picker]", "[data-testid=btn-leave-confirm]", "[data-testid=pause-lock-refused]", "[data-zone=settings]"],
    textAbsent: [{ text: "Pauza", zone: "pause" }, { text: "BARBERSTRIKE", zone: "pause" }, { text: "Eliminuj", zone: "pause" }],
    // §4.5: the strip stays visible under pause, so the column ends left of it at every size.
    leftOf: ["[data-testid=pause]", "[data-zone=top]"],
  },
  "pause-leave-confirm": {
    expect: ["[data-testid=btn-leave-confirm]", "[data-testid=btn-leave-cancel]"],
    caseText: ["NA PEWNO WYJŚĆ?", "TAK, WYJDŹ", "ANULUJ"],
    // §4.5: the strip stays visible under pause, so the column ends left of it at every size.
    leftOf: ["[data-testid=pause]", "[data-zone=top]"],
  },
  "pause-teams": {
    expect: ["[data-testid=team-picker]", "[data-testid=team-answer]", "[data-testid=team-0]:disabled", "[data-testid=team-1]:disabled"],
    caseText: ["TWOJA STRONA", "ZMIANA OD NASTĘPNEJ RUNDY", "5 GRACZY · 2 BOTY", "JESTEŚ TU", "NIE — ta strona byłaby większa", "Następną rundę zaczniesz w TAPER.", "ŁADUNEK · NIGHT DISTRICT"],
    textAbsent: ["YOUR", "players", "bots", "JOIN", "CAN'T", "You will"].map((text) => ({ text, zone: "pause" as const })),
    // §4.5: the strip stays visible under pause, so the column ends left of it at every size.
    leftOf: ["[data-testid=pause]", "[data-zone=top]"],
  },
  "pause-settings": {
    expect: ["[data-zone=settings] [data-testid=settings]"],
    leftOf: ["[data-testid=pause]", "[data-testid=settings]"],
    noScroll: [".set-body"],
  },
  "loading": {
    expect: ["[data-testid=loading][data-zone=loading]", "[data-testid=loading-cancel]"],
    caseText: ["DOŁĄCZANIE DO POKOJU", "ŁADOWANIE MAPY", "WRÓĆ DO MENU"],
    // The store's default mode is "tdm"; the card must not read it before the room syncs.
    absent: ["[data-testid=enter-game]", "[data-testid=loading-objective]", ".loading-eyebrow"],
    textAbsent: ["WEJŚCIE /", "AFTER HOURS", "DEATHMATCH", "BARBERSTRIKE"].map((text) => ({ text, zone: "loading" as const })),
  },
  "loading-ready": {
    expect: ["[data-testid=enter-game]", ".hud.dormant", "[data-testid=loading-objective]", ".loading-eyebrow"],
    caseText: ["NIGHT DISTRICT", "ŁADUNEK", "PODŁÓŻ ALBO ROZBRÓJ", "GOTOWE", "GRASZ W FADE", "WEJDŹ DO MECZU", "RUCH", "SKLEP", "MENU"],
    textAbsent: ["po odrodzeniu", "WEJŚCIE /", "AFTER HOURS", "Gotowe, kiedy ty", "BOMB PLANT"].map((text) => ({ text, zone: "loading" as const })),
  },
  "menu-error": {
    text: ["Nie udało się wejść do meczu"],
    textAbsent: [{ text: "Deployment" }, { text: "timeout" }, { text: "Please" }],
  },
  // P5's scenario; the prompt in place of the ESC menu is P7's (§5.2 #67, §6.1 New match).
  "new-match-warmup": {
    expect: ["[data-testid=resume-prompt][data-zone=prompt]"],
    // Nothing of the menu: not the column, not its dim, not a closing layer (§6.1 New match).
    absent: ["[data-testid=pause]", ".pause-layer", ".pause-dim"],
    caseText: ["KLIKNIJ, ŻEBY GRAĆ"],
  },
};
