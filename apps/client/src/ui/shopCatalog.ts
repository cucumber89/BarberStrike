import {
  ARMOR, ARMOR_ORDER, GRENADES, GRENADE_ORDER, PERKS, PERK_EFFECT, PERK_ORDER, PRIMARY_ORDER, SECONDARY_ORDER, WEAPONS,
  boysAllows, isArmorId, isGrenadeId, isPerkId, isWeaponId, modeAllowsItem,
  type ArmorId, type GameMode, type GrenadeId, type PerkId, type ShopItemId, type WeaponId,
} from "@frankibarber/shared";
import { money } from "./hud/format";

/**
 * The buy menu's catalogue: which aisle holds what, in which order, under which key — ONE source
 * for the labels the rows print and the digits the keyboard handler accepts. They used to be two:
 * the row printed `1·10` for the tenth primary while the handler only took 1–9, so the shortcut
 * the screen advertised did nothing. Pure and Node-testable on purpose.
 */

/**
 * THE AISLES, in Counter-Strike 2's order and for its reason.
 *
 * They used to be four, by SLOT: primary, secondary, grenades, gear. That is how the game thinks
 * about a loadout and not how a player shops — it put a $1,200 SMG next to a $3,400 sniper in one
 * ten-row aisle, and on the pistol round it opened on an aisle where a player with $800 could not
 * afford a single thing.
 *
 * CS2 splits the guns by what you can afford and when you buy them, which is the same five
 * headings every CS player has in their fingers: pistols, the mid-tier, the rifles, gear,
 * grenades. The digits follow, so "4, 3" is a plate here as it is there.
 */
export type ShopCat = 1 | 2 | 3 | 4 | 5;
export const SHOP_CATS: readonly ShopCat[] = [1, 2, 3, 4, 5];

/** Aisle names and the one-line note under each, in Polish — the shop's language. */
export const CAT_INFO: Record<ShopCat, { label: string; short: string; note: string }> = {
  1: { label: "PISTOLETY", short: "PISTOLETY", note: "slot 2 · zawsze masz darmowy P9 · maszynka pod 3 (V)" },
  2: { label: "ŚREDNIA PÓŁKA", short: "ŚREDNIA", note: "slot 1 · tanie i skuteczne z bliska" },
  3: { label: "KARABINY", short: "KARABINY", note: "slot 1 · na każdy dystans · wymiana zwraca 70 % ceny starej broni" },
  4: { label: "WYPOSAŻENIE", short: "SPRZĘT", note: "płyta i wzmocnienia na jedno życie" },
  5: { label: "GRANATY", short: "GRANATY", note: "bojowe pod G · taktyczne pod 4 · po dwa" },
};

/** At most this many items fit one aisle's keys: digits 1–9 and then 0 for the tenth. */
export const MAX_PER_CAT = 10;

/** Key label for a position: 1–9 as printed, the tenth item is the 0 key. */
export const keyForPos = (pos: number): string => (pos === MAX_PER_CAT ? "0" : String(pos));

/** Position (1-based) a `KeyboardEvent.code` selects, or 0 when the key is not a shortcut. */
export function posForCode(code: string): number {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (!m) return 0;
  const n = Number(m[1]);
  return n === 0 ? MAX_PER_CAT : n;
}

/** Which aisle a first keypress arms, or null when the digit is not an aisle. */
export const catForCode = (code: string): ShopCat | null => {
  const n = posForCode(code);
  return n >= 1 && n <= SHOP_CATS.length ? (n as ShopCat) : null;
};

export interface CatalogCtx {
  mode: GameMode;
  /** "The Boys": the role's own list is the whole shop for it. */
  boysClass?: number;
}

/**
 * Which slot-1 guns are "the mid-tier" — CS2's second aisle: the cheap, close-range answer to a
 * pistol round you won. Everything else in slot 1 is a rifle as far as a shopper is concerned.
 */
const MID_TIER: readonly string[] = ["smg", "smg2", "shotgun", "autoshotgun"];

/** Item ids per aisle in shortcut order, for this mode and role. */
export function shopCatalog(ctx: CatalogCtx): Record<ShopCat, ShopItemId[]> {
  const boys = ctx.mode === "boys" && ctx.boysClass !== undefined;
  // Two filters, and they are different questions: what this ROLE may carry (The Boys) and what
  // this MODE stocks at all (`modeAllowsItem`, the rule the server enforces on the same purchase).
  const allowed = (id: ShopItemId) => (!boys || boysAllows(ctx.boysClass!, id)) && modeAllowsItem(ctx.mode, id);
  const primaries = PRIMARY_ORDER.filter(allowed);
  const cats: Record<ShopCat, ShopItemId[]> = {
    1: SECONDARY_ORDER.filter(allowed),
    2: primaries.filter((id) => MID_TIER.includes(id)),
    3: primaries.filter((id) => !MID_TIER.includes(id)),
    4: ([...ARMOR_ORDER, ...PERK_ORDER] as ShopItemId[]).filter(allowed),
    5: GRENADE_ORDER.filter(allowed),
  };
  for (const c of SHOP_CATS) if (cats[c].length > MAX_PER_CAT) throw new Error(`aisle ${c} has ${cats[c].length} items, more than the keys can reach`);
  return cats;
}

/**
 * What a thing is FOR, in the words a first-time buyer needs: range, how it fires, what it is
 * good at. A rate of fire tells nobody whether to bring it to a corridor.
 */
export const ITEM_ROLE: Record<ShopItemId, string> = {
  pistol: "boczna · zawsze twoja · celne pojedyncze strzały",
  revolver: "boczna · mocny strzał · wolny, wymaga celności",
  machinepistol: "boczna · blisko · seria, szybki ogień",
  smg: "blisko · seria · lekka, szybki bieg",
  smg2: "blisko · bardzo szybki ogień · mały magazynek",
  shotgun: "bardzo blisko · jeden strzał w korytarzu",
  carbine: "średni dystans · pojedyncze, celne · mocna",
  autoshotgun: "blisko · szybkie strzały śrutem",
  rifle: "każdy dystans · seria · pewny wybór na start",
  lmg: "długa seria · ciężka i wolna · trzyma przejście",
  dmr: "daleko · celownik · dwa trafienia kładą",
  sniper: "bardzo daleko · luneta · jeden strzał w głowę",
  launcher: "granatnik · obszar · wolne przeładowanie",
  clippers: "maszynka · z tyłu goli na miejscu",
  frag: "wybuch po 3 s · przytrzymaj G, żeby skrócić",
  molotov: "ogień na ziemi · zamyka przejście",
  knife: "cichy · leci prosto · tani",
  flash: "oślepia na chwilę · rzuć za róg",
  smoke: "zasłona dymna · zakrywa przejście",
  shell: "pocisk granatnika",
  light: "50 pkt płyty · pół obrażeń, póki wytrzyma",
  heavy: "100 pkt płyty · na całą wymianę ognia",
  flask: "20 % mniej obrażeń · 25 s",
  roids: "regeneracja 6 HP/s · 30 s",
  energy: "+15 % sprintu · 25 s",
  fade: "następny respawn 1 s szybciej · 3 s osłony",
};

export interface ItemStat { label: string; value: string }

/** A number the way Polish writes it: 4,5 — and 3 rather than 3,0. */
const pl = (n: number): string => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "").replace(".", ",");

/**
 * What each perk actually DOES, in numbers, read off `PERK_EFFECT` rather than typed out.
 *
 * The card used to show one row — "Czas: 25 s" — for every perk, so the shop answered "how long"
 * without ever answering "for what". These are the same constants the server applies, which is
 * the point: a balance change moves the price tag's promise with it instead of leaving the shop
 * quoting last month's numbers.
 */
const PERK_STATS: Record<PerkId, ItemStat[]> = {
  flask: [{ label: "Obrażenia", value: `−${Math.round(PERK_EFFECT.flaskResist * 100)} %` }],
  roids: [
    { label: "Regeneracja", value: `${PERK_EFFECT.roidsRegenPerSec} HP/s` },
    { label: "Rusza po", value: `${pl(PERK_EFFECT.roidsDelayMs / 1000)} s bez trafienia` },
  ],
  energy: [
    { label: "Sprint", value: `+${Math.round((PERK_EFFECT.energySprint - 1) * 100)} %` },
    { label: "Chód", value: `+${Math.round((PERK_EFFECT.energyWalk - 1) * 100)} %` },
  ],
  fade: [
    { label: "Odrodzenie", value: `−${pl(PERK_EFFECT.fadeRespawnMs / 1000)} s` },
    { label: "Osłona", value: `${pl(PERK_EFFECT.fadeShieldMs / 1000)} s` },
  ],
};

/** The numbers behind the role line, for the detail panel (hover / focus / keyboard). */
export function itemStats(id: ShopItemId): ItemStat[] {
  if (isWeaponId(id)) {
    const w = WEAPONS[id as WeaponId];
    const launcher = w.kind === "launcher";
    const out: ItemStat[] = [];
    // The launcher's damage is its SHELL's, and it is not a number the weapon table holds: `w.damage`
    // is 0 for it, so the most expensive gun in the shop advertised no damage at all. `w.range` is
    // a hitscan figure and equally meaningless for a grenade that flies until it hits something —
    // the card promised "Zasięg 40 m" for a weapon with no such limit, so that row is skipped here
    // and only here. Everything else (rate of fire, reload) is the same question for every gun.
    if (launcher) out.push({ label: "Wybuch", value: `${GRENADES.shell.damage} obr. · ${pl(GRENADES.shell.radius)} m` });
    else out.push({ label: "Obrażenia", value: w.pellets > 1 ? `${w.pellets} × ${w.damage}` : `${w.damage}` });
    out.push({ label: "Ogień", value: `${w.rpm}/min` });
    out.push({ label: "Tryb", value: w.automatic ? "seria" : "pojedynczy" });
    if (w.magazine > 0) out.push({ label: "Magazynek", value: `${w.magazine} + ${w.reserve}` });
    if (!launcher) out.push({ label: "Zasięg", value: `${w.range} m` });
    out.push({ label: "Przeładowanie", value: `${pl(w.reloadMs / 1000)} s` });
    return out;
  }
  if (isGrenadeId(id)) {
    const g = GRENADES[id as GrenadeId];
    const out: ItemStat[] = [];
    if (g.damage > 0) out.push({ label: "Obrażenia", value: `${g.damage}` });
    if (g.directDamage > 0) out.push({ label: "Trafienie wprost", value: `${g.directDamage}` });
    if (g.radius > 0) out.push({ label: "Promień", value: `${pl(g.radius)} m` });
    if (g.effectMs > 0) out.push({ label: "Trwa", value: `${pl(g.effectMs / 1000)} s` });
    out.push({ label: "Zapalnik", value: g.fuseMs > 0 ? `${pl(g.fuseMs / 1000)} s` : "przy uderzeniu" });
    out.push({ label: "Slot", value: g.slot === "lethal" ? "bojowy (G)" : "taktyczny (4)" });
    return out;
  }
  if (isPerkId(id)) {
    const p = PERKS[id as PerkId];
    return [
      ...PERK_STATS[id as PerkId],
      p.durationMs > 0 ? { label: "Czas", value: `${Math.round(p.durationMs / 1000)} s` } : { label: "Działa", value: "przy następnym odrodzeniu" },
    ];
  }
  if (isArmorId(id)) return [{ label: "Płyta", value: `${ARMOR[id as ArmorId].armor} pkt` }, { label: "Trwa", value: "do śmierci" }];
  return [];
}

export function itemName(id: string): string {
  if (isWeaponId(id)) return WEAPONS[id as WeaponId].name;
  if (isGrenadeId(id)) return GRENADES[id as GrenadeId].name;
  if (isPerkId(id)) return PERKS[id as PerkId].name;
  if (isArmorId(id)) return ARMOR[id as ArmorId].name;
  return id;
}

/** A refusal on the tile, as its one tag: one or two words (a tile is ≤ 6 words, §5.2 #49). */
export const BLOCKED_LABEL: Record<string, string> = {
  owned: "MASZ", full: "PEŁNO", slot: "SLOT ZAJĘTY", class: "NIE TA ROLA", mode: "NIE TU", "no-shop": "BRAK SKLEPU", shaved: "NIE TERAZ",
};

export interface TileTagIn {
  /** Why the shop refuses the item (`canBuy`'s reason, or the shelf's own "closed" / "class"), "" when it sells. */
  reason: string;
  /** On you now: the gun in its slot, the plate you wear, a running perk, at least one of this grenade. */
  carried: boolean;
  /** What a carried item says when HAVING it is the refusal: „MASZ”, „nosisz”, „działa jeszcze 12s”, „PEŁNO”. */
  have: string;
  /** The money missing on a "money" refusal (`buyShortfall`), 0 otherwise. */
  short: number;
}
/** The tile's one tag: its text, its tone (`no` = a refusal, `why-{id}`; `have` = yours), and whether the tile greys. */
export interface TileTag { text: string; tone: "no" | "have" | ""; locked: boolean }

/**
 * The tile's one tag (§5.2 #49), from the REASON the shop refuses the item — never from "carried"
 * alone. Carrying one Frag of two does not make the slot full: the second one is refused for money
 * or a shut window, and that is what the tile must say (the refusal, with its `why-{id}`). Only
 * "owned" / "full" — having it IS the reason — print what you have. A shut shop says so once, in
 * the header, so its tiles keep only what you carry.
 */
export function tileTag({ reason, carried, have, short }: TileTagIn): TileTag {
  if (!reason) return { text: "", tone: "", locked: false };
  if (reason === "owned" || reason === "full") return { text: have || BLOCKED_LABEL[reason], tone: "have", locked: false };
  if (reason === "closed") return carried ? { text: have, tone: have ? "have" : "", locked: false } : { text: "", tone: "", locked: true };
  return { text: short > 0 ? `Brakuje ${money(short)}` : BLOCKED_LABEL[reason] ?? "", tone: "no", locked: true };
}
