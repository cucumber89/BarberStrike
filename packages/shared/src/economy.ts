import { BOMB } from "./bomb";
import { GRENADES, isGrenadeId, type GrenadeId, type GrenadeSlot } from "./grenades";
import { ARMOR, PERKS, PERK_ARMED_MS, isArmorId, isPerkId, noPerks, perkActive, type ArmorId, type PerkId, type PerkTimes } from "./perks";
import { MatchPhase } from "./types";
import { FREE_SIDEARM, MELEE_WEAPON, WEAPONS, isWeaponId, type WeaponId } from "./weapons";

/**
 * Buy-menu economy (1.1 drop 2, extended in drop 3 with sidearms, perks and armour). Hybrid model
 * chosen by the owner: the shop opens for `buyWindowMs` after every spawn and near buy stations
 * on the map; money comes from kills, assists and headshots; the wallet and loadout carry
 * through the match and reset when a new match starts. Pure rules here; the server applies
 * them, the client mirrors them for the UI.
 */

export const ECONOMY = {
  startMoney: 2000,
  maxMoney: 16000,
  killReward: 300,
  headshotBonus: 50,
  assistReward: 150,
  /** Damage dealt within this window before someone else's kill counts as an assist. */
  assistWindowMs: 8000,
  assistMinDamage: 30,
  buyWindowMs: 15000,
  stationRadius: 3,
  sellRatio: 0.7,
  lethalMax: 2,
  tacticalMax: 2,
} as const;

/** Weapon prices: the pistol and the clippers are free; the rest scale with time-to-kill and range. */
export const WEAPON_PRICES: Record<WeaponId, number> = {
  pistol: 0, revolver: 600, smg: 1200, smg2: 1300, shotgun: 1400, rifle: 2600, lmg: 2800, dmr: 2900, sniper: 3400, launcher: 3200, clippers: 0,
};

/** Bomb Plant (2.2): the defuse kit is bought like a plate, by defenders, in the buy phase. */
export const KIT_ITEM = "kit" as const;
export type ShopItemId = WeaponId | GrenadeId | PerkId | ArmorId | typeof KIT_ITEM;
export const isShopItemId = (v: unknown): v is ShopItemId => isWeaponId(v) || (isGrenadeId(v) && GRENADES[v].shop) || isPerkId(v) || isArmorId(v) || v === KIT_ITEM;
export function itemPrice(item: ShopItemId): number {
  if (item === KIT_ITEM) return BOMB.kitPrice;
  if (isWeaponId(item)) return WEAPON_PRICES[item];
  if (isGrenadeId(item)) return GRENADES[item].price;
  if (isPerkId(item)) return PERKS[item].price;
  return ARMOR[item].price;
}

/** Replicated part of a player's economy (mirrors PlayerState fields). */
export interface Wallet {
  money: number;
  /** Carried guns: the sidearm and at most one primary (the clippers are implicit). */
  owned: WeaponId[];
  lethal: GrenadeId | "";
  lethalCount: number;
  tactical: GrenadeId | "";
  tacticalCount: number;
  /** Plate points left (0 = none). */
  armor: number;
  /** Active perks as `until` timestamps (server clock ms). */
  perks: PerkTimes;
  /** Bomb Plant (2.2): defuse kit carried. Optional so older wallet literals stay valid. */
  kit?: boolean;
}

export const freshWallet = (): Wallet => ({ money: ECONOMY.startMoney, owned: [FREE_SIDEARM], lethal: "", lethalCount: 0, tactical: "", tacticalCount: 0, armor: 0, perks: noPerks() });

export interface BuyContext {
  bombBuying?: boolean;
  /** Bomb Plant: the buyer defends this round (the kit is theirs to buy). */
  bombDefender?: boolean;
  now: number;
  spawnedAt: number;
  phase: MatchPhase;
  alive: boolean;
  nearStation: boolean;
  /**
   * Server time the frozen preparation window ends, or 0 when the room is not frozen. A timed perk
   * bought during the countdown must not start burning while its buyer cannot move: the shop is
   * open then precisely so it can be used, and at 5 s of freeze that is a fifth of a 25 s perk.
   */
  releaseAt?: number;
}

/**
 * The shop is open during warm-up, in the frozen preparation window between waves, for a while
 * after every spawn, and next to a buy station.
 *
 * PREP IS THE POINT OF THE WINDOW (drop 7): it is the one moment nobody can shoot you, so it is
 * where a player is meant to spend money. Leaving it out would have closed the shop at exactly the
 * moment the countdown tells you to prepare.
 */
export function buyWindowOpen(ctx: BuyContext): boolean {
  if (!ctx.alive) return false;
  if (ctx.bombBuying !== undefined && ctx.phase !== MatchPhase.Waiting && ctx.phase !== MatchPhase.Countdown) return ctx.bombBuying;
  if (ctx.phase === MatchPhase.Waiting || ctx.phase === MatchPhase.Countdown || ctx.phase === MatchPhase.Prep) return true;
  return ctx.now - ctx.spawnedAt < ECONOMY.buyWindowMs || ctx.nearStation;
}

/** Ms of buy window left after a spawn (0 when closed; Infinity in warm-up / at a station). */
export function buyWindowLeft(ctx: BuyContext): number {
  if (!ctx.alive) return 0;
  if (ctx.bombBuying !== undefined && ctx.phase !== MatchPhase.Waiting && ctx.phase !== MatchPhase.Countdown) return ctx.bombBuying ? Math.max(0, (ctx.releaseAt ?? ctx.now) - ctx.now) : 0;
  if (ctx.phase === MatchPhase.Waiting || ctx.phase === MatchPhase.Countdown || ctx.phase === MatchPhase.Prep || ctx.nearStation) return Infinity;
  return Math.max(0, ECONOMY.buyWindowMs - (ctx.now - ctx.spawnedAt));
}

export type BuyVerdict = { ok: true; cost: number; refund: number } | { ok: false; reason: "closed" | "money" | "owned" | "full" | "slot" };

export const primaryOf = (w: Wallet): WeaponId | null => w.owned.find((id) => WEAPONS[id].slot === 1) ?? null;
/** The sidearm actually carried: a bought revolver, otherwise the free pistol. */
export const secondaryOf = (w: Wallet): WeaponId => w.owned.find((id) => WEAPONS[id].slot === 2) ?? FREE_SIDEARM;
/** Every weapon the player can switch to, in slot order (sidearm, primary, clippers). */
export const carriedWeapons = (w: Wallet): WeaponId[] => {
  const list: WeaponId[] = [secondaryOf(w)];
  const p = primaryOf(w);
  if (p) list.push(p);
  list.push(MELEE_WEAPON);
  return list;
};
export const carries = (w: Wallet, id: WeaponId): boolean => carriedWeapons(w).includes(id);

/** Checks a purchase without applying it. `refund` = money back for the weapon being replaced. */
export function canBuy(w: Wallet, item: ShopItemId, ctx: BuyContext): BuyVerdict {
  if (!buyWindowOpen(ctx)) return { ok: false, reason: "closed" };
  const price = itemPrice(item);
  if (isWeaponId(item)) {
    const def = WEAPONS[item];
    if (def.kind === "melee" || carries(w, item)) return { ok: false, reason: "owned" };
    const current = def.slot === 1 ? primaryOf(w) : secondaryOf(w);
    const refund = current ? Math.round(WEAPON_PRICES[current] * ECONOMY.sellRatio) : 0;
    if (w.money + refund < price) return { ok: false, reason: "money" };
    return { ok: true, cost: price, refund };
  }
  if (isPerkId(item)) {
    if (perkActive(w.perks, item, ctx.now)) return { ok: false, reason: "owned" };
    if (w.money < price) return { ok: false, reason: "money" };
    return { ok: true, cost: price, refund: 0 };
  }
  if (isArmorId(item)) {
    if (w.armor >= ARMOR[item].armor) return { ok: false, reason: "owned" };
    if (w.money < price) return { ok: false, reason: "money" };
    return { ok: true, cost: price, refund: 0 };
  }
  if (item === KIT_ITEM) {
    // Bomb Plant only, defenders only: the attackers have nothing to defuse.
    if (!ctx.bombDefender) return { ok: false, reason: "closed" };
    if (w.kit) return { ok: false, reason: "owned" };
    if (w.money < price) return { ok: false, reason: "money" };
    return { ok: true, cost: price, refund: 0 };
  }
  const def = GRENADES[item];
  const slot: GrenadeSlot = def.slot;
  const kind = slot === "lethal" ? w.lethal : w.tactical;
  const count = slot === "lethal" ? w.lethalCount : w.tacticalCount;
  const max = slot === "lethal" ? ECONOMY.lethalMax : ECONOMY.tacticalMax;
  if (kind && kind !== item && count > 0) return { ok: false, reason: "slot" }; // one kind per slot
  if (count >= max) return { ok: false, reason: "full" };
  if (w.money < price) return { ok: false, reason: "money" };
  return { ok: true, cost: price, refund: 0 };
}

/** Applies a purchase (call after canBuy). Returns the verdict for convenience. */
export function applyBuy(w: Wallet, item: ShopItemId, ctx: BuyContext): BuyVerdict {
  const v = canBuy(w, item, ctx);
  if (!v.ok) return v;
  w.money = Math.min(ECONOMY.maxMoney, w.money + v.refund - v.cost);
  if (isWeaponId(item)) {
    const slot = WEAPONS[item].slot;
    w.owned = w.owned.filter((id) => WEAPONS[id].slot !== slot);
    w.owned.push(item);
  } else if (isPerkId(item)) {
    const def = PERKS[item];
    const from = Math.max(ctx.now, ctx.releaseAt ?? 0); // a perk starts when the fighting does
    w.perks = { ...w.perks, [item]: def.durationMs > 0 ? from + def.durationMs : from + PERK_ARMED_MS };
  } else if (isArmorId(item)) {
    w.armor = ARMOR[item].armor;
  } else if (item === KIT_ITEM) {
    w.kit = true;
  } else {
    const def = GRENADES[item];
    if (def.slot === "lethal") { w.lethal = item; w.lethalCount += 1; } else { w.tactical = item; w.tacticalCount += 1; }
  }
  return v;
}

export type SellVerdict = { ok: true; refund: number } | { ok: false; reason: "closed" | "none" | "pistol" };

/** Selling is allowed only while the shop is open (no mid-fight refunds), never for the free gear. */
export function canSell(w: Wallet, item: WeaponId, ctx: BuyContext): SellVerdict {
  if (!buyWindowOpen(ctx)) return { ok: false, reason: "closed" };
  if (item === FREE_SIDEARM || item === MELEE_WEAPON) return { ok: false, reason: "pistol" };
  if (!w.owned.includes(item)) return { ok: false, reason: "none" };
  return { ok: true, refund: Math.round(WEAPON_PRICES[item] * ECONOMY.sellRatio) };
}

export function applySell(w: Wallet, item: WeaponId, ctx: BuyContext): SellVerdict {
  const v = canSell(w, item, ctx);
  if (!v.ok) return v;
  w.owned = w.owned.filter((id) => id !== item);
  if (!w.owned.some((id) => WEAPONS[id].slot === 2)) w.owned.unshift(FREE_SIDEARM);
  w.money = Math.min(ECONOMY.maxMoney, w.money + v.refund);
  return v;
}

/**
 * Puts one grenade of `kind` back, up to the slot's carry limit. The inverse of `takeGrenade`.
 *
 * Exists for one case: a grenade still in the air when the frozen preparation window opens is
 * removed, because it would land on players who cannot step out of the way. Removing it without
 * this would mean the thrower paid for nothing — and near the end of a wave that is not a rare
 * corner, it is roughly the last fuse-length of every wave.
 */
export function giveGrenade(w: Wallet, kind: GrenadeId): void {
  const def = GRENADES[kind];
  if (def.slot === "lethal") {
    if (w.lethal && w.lethal !== kind) return; // never swap what they are carrying
    w.lethal = kind;
    w.lethalCount = Math.min(ECONOMY.lethalMax, w.lethalCount + 1);
  } else {
    if (w.tactical && w.tactical !== kind) return;
    w.tactical = kind;
    w.tacticalCount = Math.min(ECONOMY.tacticalMax, w.tacticalCount + 1);
  }
}

/** Consumes one grenade of `kind`; false when the player has none. */
export function takeGrenade(w: Wallet, kind: GrenadeId): boolean {
  const def = GRENADES[kind];
  if (def.slot === "lethal") {
    if (w.lethal !== kind || w.lethalCount <= 0) return false;
    w.lethalCount -= 1; if (w.lethalCount === 0) w.lethal = "";
  } else {
    if (w.tactical !== kind || w.tacticalCount <= 0) return false;
    w.tacticalCount -= 1; if (w.tacticalCount === 0) w.tactical = "";
  }
  return true;
}

export const killReward = (headshot: boolean): number => ECONOMY.killReward + (headshot ? ECONOMY.headshotBonus : 0);
export const addMoney = (w: Wallet, delta: number): number => (w.money = Math.max(0, Math.min(ECONOMY.maxMoney, w.money + delta)));

/** Which carried weapon a keyboard slot means: 1 = primary, 2 = sidearm, 3 = clippers. */
export function weaponForSlot(w: Wallet, slot: number): WeaponId | null {
  if (slot === 1) return primaryOf(w);
  if (slot === 2) return secondaryOf(w);
  if (slot === 3) return MELEE_WEAPON;
  return null;
}

/** Player-facing name for anything that can kill (weapons and grenades) — for the kill feed. */
export function killerName(id: string): string {
  if (isWeaponId(id)) return WEAPONS[id].name;
  if (isGrenadeId(id)) return GRENADES[id].name;
  return id;
}
