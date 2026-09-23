/**
 * Barber perks and armour (1.1 drop 3). Perks are consumables bought in the shop: each gives one
 * timed buff (the owner asked for "funny barber perks — a flask, steroids, each with a buff";
 * the regen perk was a joint until the owner swapped it for steroids on 2026-09-03).
 * Armour is a plate that absorbs part of incoming damage until it is gone. Pure definitions and
 * maths here; the server applies them, the client mirrors them for the HUD and prediction.
 */

export type PerkId = "flask" | "roids" | "energy" | "fade";
export type ArmorId = "light" | "heavy";

export interface PerkDef {
  id: PerkId;
  /** Display name (Polish barber slang is the joke; the blurb explains it). */
  name: string;
  price: number;
  /** Buff duration in ms; 0 = armed until the next death (fade). */
  durationMs: number;
  blurb: string;
  /** HUD glyph (text, no assets). */
  glyph: string;
}

/**
 * The blurbs are in Polish because the shop, the HUD and the menus are: these six (with the two
 * plates below) were the last English sentences a player could meet in the game, sitting in the
 * tooltip of the perk row they had just paid for. Their numbers are the ones in `PERK_EFFECT`.
 */
export const PERKS: Record<PerkId, PerkDef> = {
  flask: { id: "flask", name: "Flaszka", price: 500, durationMs: 25_000, blurb: "Łyk wódki: 20 % mniej obrażeń przez 25 s i lekko rozmyte krawędzie ekranu.", glyph: "🍾" },
  roids: { id: "roids", name: "Sterydy", price: 400, durationMs: 30_000, blurb: "Zastrzyk mocy: zdrowie wraca po 6 HP/s, ale dopiero 2 s po ostatnim trafieniu. Działa 30 s.", glyph: "💉" },
  energy: { id: "energy", name: "Energetyk", price: 400, durationMs: 25_000, blurb: "Cukier i tauryna: sprint szybszy o 15 %, chód o 8 %. Przez 25 s.", glyph: "⚡" },
  fade: { id: "fade", name: "Świeży fade", price: 300, durationMs: 0, blurb: "Świeży fejd, świeża pewność: następne odrodzenie 1 s szybciej i 3 s osłony zamiast 1,5 s.", glyph: "✂" },
};

export const PERK_ORDER: PerkId[] = ["flask", "roids", "energy", "fade"];
export const isPerkId = (v: unknown): v is PerkId => typeof v === "string" && v in PERKS;

export const PERK_EFFECT = {
  flaskResist: 0.2,
  roidsRegenPerSec: 6,
  roidsDelayMs: 2000,
  energySprint: 1.15,
  energyWalk: 1.08,
  fadeRespawnMs: 1000,
  fadeShieldMs: 3000,
} as const;

/** "Until" value of an armed one-shot perk (fade): far enough to read as active until consumed. */
export const PERK_ARMED_MS = 1e9;

/**
 * How far past a perk's own duration its deadline may sit and still be read as a countdown.
 *
 * Two clocks decide this. The perk's end is stamped on the SERVER; the HUD and the shop subtract
 * the client's own estimate of that clock, so a flask bought a millisecond ago can come back as
 * 25_020 ms left against a 25_000 ms perk. Without slack the row would flip to the "armed
 * open-endedly" wording for the first instants of every perk anybody buys.
 */
export const PERK_CLOCK_SLACK_MS = 1500;

/**
 * Does this perk show a countdown, or is it armed open-endedly?
 *
 * Armed covers two cases and both read the same way to a player: a perk with no duration at all
 * (the fade, spent at the next respawn) and a perk handed out for a whole round rather than for
 * its own life (the Ostrzyżony's speed, written as `PERK_ARMED_MS`). Shown as a countdown, the
 * second one reads "999985s" and pins the bar full for the entire match.
 */
export const perkTimed = (id: PerkId, until: number, now: number): boolean =>
  PERKS[id].durationMs > 0 && until - now <= PERKS[id].durationMs + PERK_CLOCK_SLACK_MS;

export interface ArmorDef { id: ArmorId; name: string; price: number; armor: number; blurb: string }

export const ARMOR: Record<ArmorId, ArmorDef> = {
  light: { id: "light", name: "Lekka płyta", price: 650, armor: 50, blurb: "Bierze na siebie połowę każdego trafienia, póki nie zużyje swoich 50 punktów. Przepada po śmierci." },
  heavy: { id: "heavy", name: "Ciężka płyta", price: 1000, armor: 100, blurb: "Bierze na siebie połowę każdego trafienia, póki nie zużyje swoich 100 punktów. Przepada po śmierci." },
};
export const ARMOR_ORDER: ArmorId[] = ["light", "heavy"];
export const isArmorId = (v: unknown): v is ArmorId => typeof v === "string" && v in ARMOR;
export const ARMOR_MAX = 100;
/** Fraction of a hit the plate takes while it lasts. */
export const ARMOR_ABSORB = 0.5;

/** Active perks as `until` timestamps (server clock ms); 0 = inactive. */
export type PerkTimes = Record<PerkId, number>;
export const noPerks = (): PerkTimes => ({ flask: 0, roids: 0, energy: 0, fade: 0 });
export const perkActive = (times: PerkTimes, id: PerkId, now: number): boolean => times[id] > now;

/** Movement speed multiplier from perks (energy drink). `sprinting` picks the larger boost. */
export function perkSpeedScale(times: PerkTimes, now: number, sprinting: boolean): number {
  if (!perkActive(times, "energy", now)) return 1;
  return sprinting ? PERK_EFFECT.energySprint : PERK_EFFECT.energyWalk;
}

export interface DamageSplit { taken: number; absorbed: number; armorLeft: number; broke: boolean }

/**
 * Applies the flask (flat resist) then the plate (absorbs ARMOR_ABSORB of the rest until empty).
 * Integers in, integers out — health and armour are replicated as bytes.
 */
export function splitDamage(amount: number, armor: number, flask: boolean): DamageSplit {
  let dmg = flask ? Math.round(amount * (1 - PERK_EFFECT.flaskResist)) : amount;
  dmg = Math.max(flask && amount > 0 ? 1 : 0, dmg);
  const absorbed = Math.min(armor, Math.round(dmg * ARMOR_ABSORB));
  const armorLeft = armor - absorbed;
  return { taken: dmg - absorbed, absorbed, armorLeft, broke: armor > 0 && armorLeft === 0 };
}
