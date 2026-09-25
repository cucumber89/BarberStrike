/**
 * Gallery file of P4-corners (docs/UI_U_SPEC.md §7 P4, seeded by P0 step 0b): health, perks, ammo,
 * grenades, C4, the weapon name, the kill feed and the crosshair, and P4's pins on its zones
 * (`vitals`, `perks`, `inv`, `gear`, `weapon`, `feed`, `crosshair`; §8.7, re-pinned to §5.2 and
 * the P4 ACCEPTANCE).
 */
import { noPerks } from "@frankibarber/shared";
import { S, T, feed, kit, tdmLive, tdmRadar, type PinSet, type Scenario } from "./fixtures";

/** The zones P4 hides while I am dead (§4.5 `data-alive=false`), as `invisible` selectors. */
const DEAD_HIDDEN = ["[data-zone=vitals]", "[data-zone=inv]", "[data-zone=gear]", "[data-zone=crosshair]"];

export const scenarios: Scenario[] = [
  {
    // The reload is the moment's edge: it began 900 ms before the photograph (`elapsed`), so the
    // 3 px bar stands at 900 / 2100 of the AR-31's reload instead of at an empty start.
    // The steroids run (12 s of 30 left, so no digits: those are for the last five) and the hit
    // 150 ms ago holds their two-second gate: the chip's ring is grey, the one perk state that
    // exists only under fire (Rule P2, P4 WORK 1).
    id: "low-health-reloading", moment: "TDM: 18 HP, płyta rozbita przed chwilą, przeładowanie pod ostrzałem, sterydy wstrzymane trafieniem",
    n: 43, maxWords: 20, elapsed: 900,
    state: {
      ...tdmLive(), health: 18, armor: 0, armorBrokeAt: T - 350, reloading: true, ammo: 0, damageAt: T - 150, damageAngle: 2.4, moneyToasts: [],
      perks: { ...noPerks(), roids: S + 12_000 },
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
    // Just respawned with a fade: killed 3.1 s ago, back 2.2 s later (the fade's second off
    // `respawnDelayMs`), so the fade's shield has 2.1 of its 3 s left — the bubble chip, not the
    // plate (P4 WORK 1) — and 300 ms after the spawn the rifle goes for the pistol. A flask bought
    // in the last life survives the death (only the fade is spent, `TdmRoom.ts:1032`) and is in its
    // last five seconds, so its chip shows its digits. The feed agrees: my death is its last row,
    // not the kill `tdmLive` credits me with 1.6 s ago.
    id: "weapon-switch", n: 45, maxWords: 22, isNew: true, elapsed: 600,
    moment: "TDM: tuż po odrodzeniu ze świeżym fade (osłona) przełączasz karabin na pistolet P9 Straight Razor; flaszce zostały 4 s",
    before: { ...tdmLive(), serverNow: S - 1_600 },
    state: {
      ...tdmLive(), ...kit("pistol"), lastSwitchAt: T - 600, moneyToasts: [], armor: 0,
      perks: { ...noPerks(), flask: S + 4_000 }, spawnProtectedUntil: S + 2_100,
      killFeed: feed(0, [[4_800, "p1", "p7", "rifle"], [3_300, "p5", "bot-2", "dmr", { headshot: true }], [3_100, "p6", "me", "shotgun"]]),
    },
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
  // WORK 1: the steroids' gate is a grey ring with no word („CZEKA 2s” is gone) and no digits
  // (12 s left is not the last five); the name is sr-only, uppercased in JS.
  "low-health-reloading": {
    expect: [".hud.low-health", ".ammo[data-reloading]", ".ammo[data-reloading][data-mag=empty] .ammo-reload-fill", ".damage-dir", ".armor[data-broke] .armor-crack",
      ".vitals[data-band=critical]", "[data-testid=perks][data-zone=perks] .perk[data-perk=roids][data-gated] .perk-ring"],
    absent: ["[data-testid=perks] .perk-secs", "[data-testid=perks] .perk[data-ending]"],
    caseText: ["0/ 120", "STERYDY"],
    textAbsent: [{ text: "PRZEŁADOWANIE", zone: "inv" }, { text: "ZNISZCZONA", zone: "vitals" }, { text: "CZEKA", zone: "perks" }],
    zoneWords: { inv: 2, vitals: 1, perks: 1 },
  },
  // Row 44: „[SHIFT] WSTRZYMAJ ODDECH” at t1, the bar under it, in the crosshair zone (not the veil);
  // the crosshair itself is gone in ADS (e2e :490).
  "scoped": {
    expect: ["[data-testid=scope]", "[data-zone=crosshair].breath .breath-bar", "[data-testid=scope][data-zone=veil]"],
    absent: ["[data-testid=crosshair]", "[data-testid=scope] .breath"],
    text: ["WSTRZYMAJ ODDECH"],
    zoneWords: { crosshair: 3 },
  },
  // Row 45: the weapon's name at t1 in its own zone, uppercased in JS. WORK 1: the fade's shield is
  // the bubble chip (not the plate; the spent fade is no chip of its own) with its seconds, and the
  // flask in its last five seconds shows its digits in a red ring: „FLASZKA” (sr-only) and „4”.
  "weapon-switch": {
    expect: ["[data-testid=weapon-name][data-zone=weapon][data-on]", "[data-testid=perks] [data-testid=perk-shield][data-perk=shield] .perk-secs",
      "[data-testid=perk-shield] .perk-ring svg circle[fill=none]", "[data-testid=perks] .perk[data-perk=flask][data-ending] .perk-secs"],
    absent: ["[data-testid=perks] .perk[data-perk=fade]", "[data-testid=perk-shield] .armor-icon"],
    caseText: ["P9 STRAIGHT RAZOR", "FLASZKA"],
    zoneWords: { weapon: 3, inv: 2, perks: 3 },
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
