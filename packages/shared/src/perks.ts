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

export const PERKS: Record<PerkId, PerkDef> = {
  flask: { id: "flask", name: "Flaszka", price: 500, durationMs: 25_000, blurb: "A pull of vodka: 20 % less damage taken for 25 s, slightly blurry edges.", glyph: "🍾" },
  roids: { id: "roids", name: "Sterydy", price: 400, durationMs: 30_000, blurb: "A jab of juice: health regenerates 6/s after 2 s without damage, for 30 s.", glyph: "💉" },
  energy: { id: "energy", name: "Energetyk", price: 400, durationMs: 25_000, blurb: "Sugar and taurine: 15 % faster sprint, 8 % faster walk, for 25 s.", glyph: "⚡" },
  fade: { id: "fade", name: "Świeży fade", price: 300, durationMs: 0, blurb: "Fresh cut, fresh confidence: next respawn 1 s faster with a 3 s shield.", glyph: "✂" },
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

export interface ArmorDef { id: ArmorId; name: string; price: number; armor: number; blurb: string }

export const ARMOR: Record<ArmorId, ArmorDef> = {
  light: { id: "light", name: "Light plate", price: 650, armor: 50, blurb: "Absorbs half of every hit until 50 points are gone. Lost on death." },
  heavy: { id: "heavy", name: "Heavy plate", price: 1000, armor: 100, blurb: "Absorbs half of every hit until 100 points are gone. Lost on death." },
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
