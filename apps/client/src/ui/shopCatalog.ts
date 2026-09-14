import {
  ARMOR, ARMOR_ORDER, GRENADES, GRENADE_ORDER, PERKS, PERK_ORDER, PRIMARY_ORDER, SECONDARY_ORDER, WEAPONS,
  boysAllows, isArmorId, isGrenadeId, isPerkId, isWeaponId,
  type ArmorId, type GameMode, type GrenadeId, type PerkId, type ShopItemId, type WeaponId,
} from "@frankibarber/shared";

/**
 * The buy menu's catalogue: which aisle holds what, in which order, under which key — ONE source
 * for the labels the rows print and the digits the keyboard handler accepts. They used to be two:
 * the row printed `1·10` for the tenth primary while the handler only took 1–9, so the shortcut
 * the screen advertised did nothing. Pure and Node-testable on purpose.
 */

export type ShopCat = 1 | 2 | 3 | 4;
export const SHOP_CATS: readonly ShopCat[] = [1, 2, 3, 4];

/** Aisle names and the one-line note under each, in Polish — the shop's language. */
export const CAT_INFO: Record<ShopCat, { label: string; short: string; note: string }> = {
  1: { label: "BROŃ GŁÓWNA", short: "GŁÓWNA", note: "slot 1 · wymiana zwraca 70 % ceny starej broni" },
  2: { label: "BROŃ BOCZNA", short: "BOCZNA", note: "slot 2 · maszynka zawsze pod 3 (V)" },
  3: { label: "GRANATY", short: "GRANATY", note: "bojowe pod G · taktyczne pod 4 · po dwa" },
  4: { label: "WYPOSAŻENIE", short: "SPRZĘT", note: "płyta i wzmocnienia na jedno życie" },
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
  return n >= 1 && n <= 4 ? (n as ShopCat) : null;
};

export interface CatalogCtx {
  mode: GameMode;
  /** "The Boys": the role's own list is the whole shop for it. */
  boysClass?: number;
}

/** Item ids per aisle in shortcut order, for this mode and role. */
export function shopCatalog(ctx: CatalogCtx): Record<ShopCat, ShopItemId[]> {
  const boys = ctx.mode === "boys" && ctx.boysClass !== undefined;
  const allowed = (id: string) => !boys || boysAllows(ctx.boysClass!, id);
  const bomb = ctx.mode === "bomb";
  const cats: Record<ShopCat, ShopItemId[]> = {
    1: PRIMARY_ORDER.filter((id) => (!bomb || id !== "launcher") && allowed(id)),
    2: SECONDARY_ORDER.filter(allowed),
    3: GRENADE_ORDER.filter(allowed),
    4: ([...ARMOR_ORDER, ...(bomb ? [] : PERK_ORDER)] as ShopItemId[]).filter(allowed),
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

/** The numbers behind the role line, for the detail panel (hover / focus / keyboard). */
export function itemStats(id: ShopItemId): ItemStat[] {
  if (isWeaponId(id)) {
    const w = WEAPONS[id as WeaponId];
    const out: ItemStat[] = [];
    if (w.kind === "launcher") out.push({ label: "Wybuch", value: `${GRENADES.shell.radius} m` });
    else out.push({ label: "Obrażenia", value: w.pellets > 1 ? `${w.pellets} × ${w.damage}` : `${w.damage}` });
    out.push({ label: "Ogień", value: `${w.rpm}/min` });
    out.push({ label: "Tryb", value: w.automatic ? "seria" : "pojedynczy" });
    if (w.magazine > 0) out.push({ label: "Magazynek", value: `${w.magazine} + ${w.reserve}` });
    out.push({ label: "Zasięg", value: `${w.range} m` });
    out.push({ label: "Przeładowanie", value: `${(w.reloadMs / 1000).toFixed(1)} s` });
    return out;
  }
  if (isGrenadeId(id)) {
    const g = GRENADES[id as GrenadeId];
    const out: ItemStat[] = [];
    if (g.damage > 0) out.push({ label: "Obrażenia", value: `${g.damage}` });
    out.push({ label: "Promień", value: `${g.radius} m` });
    if (g.fuseMs > 0) out.push({ label: "Zapalnik", value: `${(g.fuseMs / 1000).toFixed(1)} s` });
    out.push({ label: "Slot", value: g.slot === "lethal" ? "bojowy (G)" : "taktyczny (4)" });
    return out;
  }
  if (isPerkId(id)) {
    const p = PERKS[id as PerkId];
    return p.durationMs > 0 ? [{ label: "Czas", value: `${Math.round(p.durationMs / 1000)} s` }] : [{ label: "Działa", value: "przy następnym odrodzeniu" }];
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
