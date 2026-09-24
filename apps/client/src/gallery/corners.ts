/**
 * Gallery file of P4-corners (docs/UI_U_SPEC.md §7, seeded by P0 step 0b): health, perks, ammo,
 * grenades, C4, the weapon name, the kill feed and the crosshair, and P4's pins on its zones
 * (`vitals`, `perks`, `inv`, `gear`, `weapon`, `feed`, `crosshair`; §8.7). The two pre-drop
 * scenarios below moved here verbatim from `hudStates.tsx`; the seeded one follows §5.2 and carries
 * no pins yet (P4 writes them in wave 2).
 */
import { S, T, kit, tdmLive, tdmRadar, type PinSet, type Scenario } from "./fixtures";

export const scenarios: Scenario[] = [
  // ---- moved verbatim from the pre-drop gallery
  {
    id: "low-health-reloading", moment: "TDM: 18 HP, płyta rozbita przed chwilą, przeładowanie pod ostrzałem",
    n: 43, maxWords: 20,
    state: {
      ...tdmLive(), health: 18, armor: 0, armorBrokeAt: T - 350, reloading: true, ammo: 0, damageAt: T - 150, damageAngle: 2.4, moneyToasts: [],
    },
    radar: tdmRadar(),
  },
  {
    id: "scoped", moment: "TDM: celujesz przez lunetę SR-50, oddech trzymany",
    n: 44, maxWords: 24,
    state: { ...tdmLive(), ...kit("sniper", 4), owned: ["pistol", "sniper"], scoped: true, scopeStyle: "tube", aiming: true, breath: 0.62, moneyToasts: [] },
    radar: tdmRadar(),
  },

  // ---- seeded from §5.2 (P0 0b)
  {
    id: "weapon-switch", n: 45, maxWords: 22, isNew: true, elapsed: 600,
    moment: "TDM: przełączasz karabin na pistolet P9 Straight Razor",
    before: { ...tdmLive(), serverNow: S - 1_600 },
    state: { ...tdmLive(), ...kit("pistol"), lastSwitchAt: T - 600, moneyToasts: [] },
    radar: tdmRadar(),
  },
];

/** P4's pins (§8.7): the crosshair, the kill feed and the corner plates. */
export const pins: PinSet = {
  "tdm-live": { expect: ["[data-testid=crosshair]", "[data-testid=killfeed] li"] },
  "bomb-live-carrier": { expect: ["[data-testid=crosshair]"] },
  "low-health-reloading": { expect: [".hud.low-health", ".reloading", ".damage-dir", ".armor-num.broke"] },
  "scoped": { expect: ["[data-testid=scope]"] },
  // Seeded scenario: P4 writes its pins in wave 2.
  "weapon-switch": {},
};
