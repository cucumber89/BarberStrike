/**
 * Gallery file of P4-corners (docs/UI_U_SPEC.md §7 P4, seeded by P0 step 0b): health, perks, ammo,
 * grenades, C4, the weapon name, the kill feed and the crosshair, and P4's pins on its zones
 * (`vitals`, `perks`, `inv`, `gear`, `weapon`, `feed`, `crosshair`; §8.7, re-pinned to §5.2 and
 * the P4 ACCEPTANCE).
 */
import { S, T, kit, tdmLive, tdmRadar, type PinSet, type Scenario } from "./fixtures";

/** The zones P4 hides while I am dead (§4.5 `data-alive=false`), as `invisible` selectors. */
const DEAD_HIDDEN = ["[data-zone=vitals]", "[data-zone=inv]", "[data-zone=gear]", "[data-zone=crosshair]"];

export const scenarios: Scenario[] = [
  {
    // The reload is the moment's edge: it began 900 ms before the photograph (`elapsed`), so the
    // 3 px bar stands at 900 / 2100 of the AR-31's reload instead of at an empty start.
    id: "low-health-reloading", moment: "TDM: 18 HP, płyta rozbita przed chwilą, przeładowanie pod ostrzałem",
    n: 43, maxWords: 20, elapsed: 900,
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
  {
    id: "weapon-switch", n: 45, maxWords: 22, isNew: true, elapsed: 600,
    moment: "TDM: przełączasz karabin na pistolet P9 Straight Razor",
    before: { ...tdmLive(), serverNow: S - 1_600 },
    state: { ...tdmLive(), ...kit("pistol"), lastSwitchAt: T - 600, moneyToasts: [] },
    radar: tdmRadar(),
  },
];

/** P4's pins (§8.8): the crosshair, the kill feed and the corner plates, per §5.2 and ACCEPTANCE. */
export const pins: PinSet = {
  // Row 5: health, armour „50”, ammo „19 / 120” with the rifle's silhouette, the frag and the flash
  // as icons with their keys, the feed's rows at ≤ 3 words with the assist and the headshot icon.
  "tdm-live": {
    expect: ["[data-testid=crosshair]", "[data-testid=killfeed] li", "[data-testid=killfeed] li[data-me=killer]", "[data-testid=killfeed] .kf-head",
      "[data-testid=killfeed] .kf-art svg", "[data-testid=ammo] .ammo-gun svg", "[data-testid=slot-lethal] .gear-art svg", "[data-testid=slot-tactical] .gear-art svg"],
    absent: ["[data-testid=c4]", "[data-testid=perks]", "[data-testid=weapon-name]"],
    caseText: ["Kowal", "+ Młody_Tomek", "JANUSZ"],
    textAbsent: [{ text: "AR-31", zone: "feed" }, { text: "FRAG", zone: "gear" }, { text: "BOJOWY", zone: "gear" }, { text: "AR-31", zone: "inv" }],
    zoneWords: { vitals: 2, inv: 2, gear: 2 },
  },
  // Row 11: the C4 with its [T] keycap in the gear row, beside the frag and the smoke. Whether it
  // blinks follows `siteHere` in P2's fixture, so it is not pinned here.
  "bomb-live-carrier": {
    expect: ["[data-testid=crosshair]", "[data-testid=c4] .gear-c4", "[data-testid=slot-lethal] .gear-art svg", "[data-testid=slot-tactical] .gear-art svg"],
    zoneWords: { gear: 3, inv: 2 },
  },
  // Row 43: the digits stay through the reload („0” and „/ 120”), dimmed, with the 3 px bar; the
  // broken plate is an icon; no word says either.
  "low-health-reloading": {
    expect: [".hud.low-health", ".ammo[data-reloading]", ".ammo[data-reloading][data-mag=empty] .ammo-reload-fill", ".damage-dir", ".armor[data-broke] .armor-crack",
      ".vitals[data-band=critical]"],
    caseText: ["0/ 120"],
    textAbsent: [{ text: "PRZEŁADOWANIE", zone: "inv" }, { text: "ZNISZCZONA", zone: "vitals" }],
    zoneWords: { inv: 2, vitals: 1 },
  },
  // Row 44: „[SHIFT] WSTRZYMAJ ODDECH” at t1, the bar under it, in the crosshair zone (not the veil);
  // the crosshair itself is gone in ADS (e2e :490).
  "scoped": {
    expect: ["[data-testid=scope]", "[data-zone=crosshair].breath .breath-bar", "[data-testid=scope][data-zone=veil]"],
    absent: ["[data-testid=crosshair]", "[data-testid=scope] .breath"],
    text: ["WSTRZYMAJ ODDECH"],
    zoneWords: { crosshair: 3 },
  },
  // Row 45: the weapon's name at t1 in its own zone, uppercased in JS.
  "weapon-switch": {
    expect: ["[data-testid=weapon-name][data-zone=weapon][data-on]"],
    caseText: ["P9 STRAIGHT RAZOR"],
    zoneWords: { weapon: 3, inv: 2 },
  },
  // Row 41: no empty grenade slots — both slots stay in the DOM, neither is seen.
  "gungame-live": {
    invisible: ["[data-testid=slot-lethal]", "[data-testid=slot-tactical]"],
    zoneWords: { gear: 0 },
  },
  // Row 9: the class header in the vitals plate, in its own case.
  "boys-live": {
    caseText: ["Assault → Medic"],
    zoneWords: { vitals: 4 },
  },
  // Row 33: dead — my corners and the aim point are hidden (§4.5); the feed stays.
  "dead-next-round": {
    invisible: DEAD_HIDDEN,
    expect: ["[data-testid=killfeed] li[data-me=victim]"],
  },
};
