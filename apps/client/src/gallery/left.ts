/**
 * Gallery file of P3-left (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): the left column — radar,
 * money and the buy row, the round plan, chat, hints — and P3's pins on its zones (`radar`,
 * `wallet`, `plan`, `chat`, `hint`; §8.7). The pre-drop scenario below moved here from
 * `hudStates.tsx`; the seeded ones follow §5.2. P3 (wave 2) wrote the pins at the end.
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
    // §5.2 #10 photographs the vote as „[F1] OTWÓRZ ROLETĘ · 2”, „[F2] ZBURZ MUR W ZAUŁKU · 1” — plans
    // 1 and 2, the offer of `planOffer(2)` — 3 s into the freeze (12 s left), nobody's vote mine yet.
    state: bombFreeze(5, 11_400, {
      scoreA: 3, scoreB: 1,
      plan: { options: planOffer(2), tally: [2, 1], chosen: 0, appliesAt: S + 11_400, votingTeam: 0, round: 5, at: T - 3_600 },
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
      // The same vote as `bomb-freeze` (§5.2 #47: "bomb freeze … the plan card").
      plan: { options: planOffer(2), tally: [2, 1], chosen: 0, appliesAt: S + 9_400, votingTeam: 0, round: 5, at: T - 5_600 },
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

/** No English in the plan and the chat (§7 P3 ACCEPTANCE: vote|your|costs|force|team|all|say). */
const ENGLISH = ["vote", "your", "costs", "force", "team", "all", "say"];
const noEnglish = (...zones: ("plan" | "chat")[]) => zones.flatMap((zone) => ENGLISH.map((text) => ({ text, zone })));

/**
 * P3's pins (§8.7, §8.8): the left column's contract in every moment P3 proves. The radar's 14 px
 * canvas floor is not a pin — the tool reads it from `window.__canvasText` (`canvasMin`).
 */
export const pins: PinSet = {
  "tdm-wave-prep": { expect: ["[data-testid=buy-prompt]"] },
  "bomb-halftime": { expect: ["[data-testid=buy-prompt]"] },
  "duel-freeze": { expect: ["[data-testid=buy-prompt]"] },
  // §5.2 #10: the money, the buy row with its seconds, and the Polish plan card — gain and cost
  // under the LEADING option only (F1, 2 votes), never under F2 („Przejdziesz…” is F2's gain).
  "bomb-freeze": {
    expect: ["[data-testid=plan-vote]", "[data-testid=buy-prompt]", "[data-testid=buy-countdown]", "[data-testid=plan-option-1]", "[data-testid=plan-option-2]", "[data-testid=minimap]"],
    // At 600 px high and less the card drops the gain and the cost and the rows carry two-word
    // names (§4.2), so the pins hold what every size shows.
    caseText: ["$3,150", "PLAN RUNDY · 12s", "F1 OTWÓRZ ROLETĘ · 2", "F2 ZBURZ MUR"],
    textAbsent: [...noEnglish("plan"), { text: "Przejdziesz", zone: "plan" }, { text: "SKLEP", zone: "wallet" }],
    zoneWords: { wallet: 4, plan: 24 },
  },
  // §5.2 #46: B after the window — the crossed cart and two words, no buy row; the old sentence
  // („PODEJDŹ DO LADY”) and the word SKLEP beside the key are gone.
  "shop-closed-flash": {
    expect: ["[data-testid=shop-closed] .wallet-cart.crossed", "[data-testid=money]"],
    absent: ["[data-testid=buy-prompt]"],
    caseText: ["SKLEP ZAMKNIĘTY"],
    textAbsent: [{ text: "PODEJDŹ", zone: "wallet" }],
    zoneWords: { wallet: 5 },
  },
  // §5.2 #47: six lines with Polish tags, one merged toast with no reason word, the plan card.
  "chat-busy": {
    expect: ["[data-testid=chat] [data-testid=chat-line]", "[data-testid=plan-vote]", "[data-testid=wallet] .wallet-toast"],
    caseText: ["[DRUŻYNA]", "[WSZYSCY]", "+$300"],
    textAbsent: [...noEnglish("plan", "chat"), { text: "SPRZEDAŻ", zone: "wallet" }],
    zoneWords: { wallet: 4, plan: 24 },
  },
  // §5.2 #48: one instrument — the compass strip is gone; the letters are on the canvas (canvasMin).
  "radar-rim-pins": { expect: ["[data-testid=minimap] canvas.radar"], absent: [".compass", "[data-testid=minimap] canvas + canvas"] },
  // §5.3: the attack sees the dropped bomb on the radar (a canvas icon; see the PNG).
  "bomb-dropped": { expect: ["[data-testid=minimap] canvas.radar", "[data-testid=money]"] },
  // §5.2 #1: the window is endless — the cart and [B], no countdown and no „OTWARTY”.
  "warmup": { expect: ["[data-testid=buy-prompt] .wallet-key"], absent: ["[data-testid=buy-countdown]"], textAbsent: [{ text: "OTWARTY", zone: "wallet" }, { text: "SKLEP", zone: "wallet" }] },
  // §5.2 #5: the kill's toast is „+$300” alone — no ZABÓJSTWO.
  "tdm-live": { caseText: ["+$300"], textAbsent: [{ text: "ZABÓJSTWO", zone: "wallet" }], zoneWords: { wallet: 2 } },
  // §5.2 #25: the buy tail „[B] 3s”, amber (≤ 5 s).
  "duel-live-buytail": { expect: ["[data-testid=buy-prompt]", ".wallet-buy.warn [data-testid=buy-countdown]"] },
  // §4.5: dead, the money stays (the next buy depends on it); the buy row does not.
  "dead-next-round": { expect: ["[data-zone=wallet] [data-testid=money]"], text: ["$350"], absent: ["[data-testid=buy-prompt]"] },
};
