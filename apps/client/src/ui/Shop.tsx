import React, { useEffect, useMemo, useState } from "react";
import { MatchPhase,
  ARMOR, ARMOR_ORDER, BOMB, ECONOMY, GRENADES, GRENADE_ORDER, KIT_ITEM, PERKS, PERK_ORDER, PRIMARY_ORDER, SECONDARY_ORDER, WEAPONS, WEAPON_PRICES,
  canBuy, canSell, perkActive, primaryOf, secondaryOf,
  type GrenadeId, type ShopItemId, type Wallet, type WeaponId,
} from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";
import { ArmorArt, GrenadeArt, KitArt, PerkArt, WeaponArt } from "./art/GearArt";
import { GRENADE_BLURB, WEAPON_BLURB } from "./gearText";

export interface ShopApi {
  buy(item: ShopItemId): void;
  sell(item: WeaponId): void;
  close(): void;
}

interface Props { h: HudState; api: ShopApi; now: number }

/**
 * Why an item cannot be bought, in a few words a player can act on. Shown ON the row, not only in
 * a tooltip — a greyed button with no reason is the thing players complain about.
 */
const REASONS: Record<string, string> = {
  closed: "Shut — buy at spawn or a $ station",
  money: "Costs more than you have",
  owned: "You already have it",
  full: "Carrying the maximum",
  slot: "Other grenade in that slot",
  pistol: "Free kit, always yours",
  none: "Not carried",
  unknown: "Unknown item",
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** The four aisles, in the order the brief asks for and the order the shortcut keys follow. */
type CatId = 1 | 2 | 3 | 4;
const CATS: { id: CatId; label: string; note: string }[] = [
  { id: 1, label: "PRIMARY", note: "slot 1 · swapping refunds " },
  { id: 2, label: "SIDEARM", note: "slot 2 · clippers are always slot 3 (V)" },
  { id: 3, label: "GRENADES", note: "lethal G · tactical 4" },
  { id: 4, label: "EQUIPMENT", note: "armour, kit and perks" },
];

/**
 * Buy menu. Every rule shown here is the shared economy function the server will run, so no button
 * promises something the server then refuses; the server's ShopResult is still the only thing that
 * moves the wallet.
 *
 * LAYOUT RULE, and the reason this file looks the way it does: the whole menu must fit on one
 * screen at 1280 × 720 with nothing cut off and nothing to scroll. The old menu was one column of
 * tall cards roughly 3.3 screens deep, so CLOSE and the result line — the two things a player
 * needs most — were below the fold with no scroll affordance. It is now three aisles side by side
 * of short rows: 22 items, tallest aisle 8 rows, which fits 720p with room to spare and therefore
 * needs no category tabs and no shrunken text. `.shop-card` is `overflow: hidden` so a future
 * addition that does not fit fails loudly instead of quietly hiding CLOSE again.
 */
export function Shop({ h, api, now }: Props) {
  const wallet: Wallet = { money: h.money, owned: h.owned, lethal: h.lethal, lethalCount: h.lethalCount, tactical: h.tactical, tacticalCount: h.tacticalCount, armor: h.armor, perks: h.perks, kit: h.kit };
  const bombDefender = h.mode === "bomb" && !!h.bomb && h.bomb.attackTeam !== h.myTeam;
  const ctx = { now: h.serverNow, spawnedAt: -1e9, phase: h.phase, alive: h.alive, nearStation: true, bombDefender }; // window state comes from `buyWindowLeft` already
  const open = h.buyWindowLeft > 0;
  const primary = primaryOf(wallet);
  const secondary = secondaryOf(wallet);
  const left = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const result = h.shopResult && now - h.shopResult.at < 3000 ? h.shopResult : null;

  /** First key of a two-key buy: aisle, then position. Shown on every row as e.g. "1·4". */
  const [aisle, setAisle] = useState<CatId | null>(null);

  const verdict = (item: ShopItemId) => (open ? canBuy(wallet, item, ctx) : { ok: false as const, reason: "closed" as const });
  const click = (fn: () => void) => () => { uiSound("click"); fn(); };

  /** What each aisle holds, in shortcut order. Built once per render; the keyboard uses the same list. */
  const aisles = useMemo(() => {
    const gear: ShopItemId[] = [...ARMOR_ORDER, ...(bombDefender ? [KIT_ITEM] : []), ...(h.mode === "bomb" ? [] : PERK_ORDER)] as ShopItemId[];
    return {
      1: PRIMARY_ORDER.filter((id) => h.mode !== "bomb" || id !== "launcher") as ShopItemId[],
      2: [...SECONDARY_ORDER] as ShopItemId[],
      3: [...GRENADE_ORDER] as ShopItemId[],
      4: gear,
    } as Record<CatId, ShopItemId[]>;
  }, [h.mode, bombDefender]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape") { e.preventDefault(); if (aisle) setAisle(null); else api.close(); return; }
      if (!e.code.startsWith("Digit")) return;
      const n = Number(e.code.slice(5));
      if (!Number.isFinite(n) || n < 1) return;
      e.preventDefault();
      if (aisle === null) { if (n <= 4) { uiSound("click"); setAisle(n as CatId); } return; }
      const item = aisles[aisle][n - 1];
      setAisle(null);
      if (item && verdict(item).ok) { uiSound("click"); api.buy(item); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
    // `verdict` closes over the wallet, which changes on every purchase — rebinding is the point.
  });

  /** One row. `cat`/`pos` render the two-key shortcut; `art` is a 26 px glyph, not a card. */
  const row = (
    key: string, cat: CatId, pos: number, art: React.ReactNode, name: React.ReactNode,
    price: number, stats: React.ReactNode, blurb: string,
    state: { carried: boolean; tag?: string; verdict: ReturnType<typeof verdict>; label: string; onBuy: () => void; extra?: React.ReactNode; price?: React.ReactNode },
  ) => {
    const v = state.verdict;
    const blocked = !state.carried && !v.ok;
    return (
      <div key={key} className={`shop-row ${state.carried ? "carried" : ""} ${blocked ? "locked" : ""} ${aisle === cat ? "aisle-armed" : ""}`} data-testid={`shop-${key}`} title={blurb}>
        <span className="shop-key" aria-label={`shortcut ${cat} then ${pos}`}>{cat}<i>·</i>{pos}</span>
        <span className="shop-row-art">{art}</span>
        <span className="shop-row-main">
          <span className="shop-row-name">{name}</span>
          <span className="shop-row-stats">{blocked ? <em className="shop-why">{REASONS[v.reason] ?? v.reason}</em> : stats}</span>
        </span>
        <span className="shop-row-price">{state.price ?? (price === 0 ? "FREE" : money(price))}</span>
        {state.tag && <span className="shop-tag">{state.tag}</span>}
        {state.extra}
        {/* An item you already have needs no button: the tag beside it (SLOT 1 / WORN / ×2) says
            so, and a dead "OWNED" or "—" control was squeezing the name down to one letter. */}
        {!(state.carried && !v.ok) && (
          <button className="shop-btn" disabled={!v.ok} onClick={click(state.onBuy)} data-testid={`buy-${key}`}>{state.label}</button>
        )}
      </div>
    );
  };

  const weaponRow = (cat: CatId) => (id: WeaponId, i: number) => {
    const w = WEAPONS[id];
    const carried = id === secondary || id === primary;
    const v = verdict(id);
    const sellable = carried && open && canSell(wallet, id, ctx).ok;
    const swapping = w.slot === 1 ? primary : secondary !== "pistol" ? secondary : null;
    return row(id, cat, i + 1, <WeaponArt id={id} />,
      <>{w.name}{w.scoped && <span className="shop-slot">SCOPE</span>}</>,
      WEAPON_PRICES[id],
      w.kind === "launcher"
        ? <>BLAST {GRENADES.shell.damage} · R {GRENADES.shell.radius} m · MAG {w.magazine}</>
        : <>DMG {w.damage}{w.pellets > 1 ? `×${w.pellets}` : ""} · RPM {w.rpm} · MAG {w.magazine}</>,
      WEAPON_BLURB[id],
      {
        carried, verdict: v,
        tag: carried ? `SLOT ${w.slot}` : undefined,
        // The old label read "SWAP $-620" whenever the gun being replaced refunded more than the
        // new one costs. A negative price is not a thing; that case is money BACK, so the price
        // cell says so and the button just names the action.
        price: swapping && v.ok && v.refund > 0
          ? (() => { const net = WEAPON_PRICES[id] - v.refund;
              return <><s>{money(WEAPON_PRICES[id])}</s>{net >= 0 ? money(net) : <span className="credit">+{money(-net)}</span>}</>; })()
          : undefined,
        label: carried ? "OWNED" : v.ok ? (swapping && v.refund > 0 ? "SWAP" : "BUY") : v.reason === "money" ? "TOO POOR" : "—",
        onBuy: () => api.buy(id),
        extra: sellable ? <button className="shop-btn ghost" onClick={click(() => api.sell(id))} data-testid={`sell-${id}`}>SELL {money(Math.round(WEAPON_PRICES[id] * ECONOMY.sellRatio))}</button> : undefined,
      });
  };

  const grenadeRow = (id: GrenadeId, i: number) => {
    const g = GRENADES[id];
    const count = g.slot === "lethal" ? (wallet.lethal === id ? wallet.lethalCount : 0) : (wallet.tactical === id ? wallet.tacticalCount : 0);
    const v = verdict(id);
    return row(id, 3, i + 1, <GrenadeArt id={id} />,
      <>{g.name}<span className={`shop-slot ${g.slot}`}>{g.slot === "lethal" ? "G" : "4"}</span></>,
      g.price,
      <>{g.damage > 0 ? `DMG ${g.damage} · R ${g.radius} m` : `R ${g.radius} m`}{g.slot === "lethal" ? " · cook with G" : ""}</>,
      GRENADE_BLURB[id],
      {
        carried: count > 0, verdict: v, tag: count > 0 ? `×${count}` : undefined,
        label: v.ok ? (count > 0 ? "+1" : "BUY") : v.reason === "money" ? "TOO POOR" : v.reason === "full" ? "FULL" : v.reason === "slot" ? "SLOT TAKEN" : "—",
        onBuy: () => api.buy(id),
      });
  };

  /** Equipment is three kinds of thing in one aisle, so positions run straight through it. */
  const gearRows = () => {
    let pos = 0;
    const out: React.ReactNode[] = [];
    for (const id of ARMOR_ORDER) {
      const a = ARMOR[id]; const worn = h.armor >= a.armor; const v = verdict(id); pos++;
      out.push(row(id, 4, pos, <ArmorArt id={id} />, a.name, a.price, <>PLATE {a.armor} · halves every hit</>, a.blurb,
        { carried: worn, verdict: v, tag: worn ? "WORN" : undefined, label: v.ok ? (h.armor > 0 ? "TOP UP" : "BUY") : v.reason === "money" ? "TOO POOR" : "—", onBuy: () => api.buy(id) }));
    }
    if (bombDefender) {
      const v = verdict(KIT_ITEM); pos++;
      out.push(row("kit", 4, pos, <KitArt />, "Defuse kit", BOMB.kitPrice,
        <>DEFUSE {BOMB.defuseKitMs / 1000}s (was {BOMB.defuseMs / 1000}s)</>,
        "Cuts the defuse in half. Lost on death, kept between rounds while you live.",
        { carried: !!h.kit, verdict: v, tag: h.kit ? "CARRIED" : undefined, label: v.ok ? "BUY" : v.reason === "money" ? "TOO POOR" : h.kit ? "OWNED" : "—", onBuy: () => api.buy(KIT_ITEM) }));
    }
    if (h.mode !== "bomb") for (const id of PERK_ORDER) {
      const p = PERKS[id]; const active = perkActive(wallet.perks, id, h.serverNow); const v = verdict(id); pos++;
      const leftS = active && p.durationMs > 0 ? Math.ceil((wallet.perks[id] - h.serverNow) / 1000) : null;
      out.push(row(id, 4, pos, <PerkArt id={id} />, p.name, p.price, <>{p.blurb}</>, p.blurb,
        { carried: active, verdict: v, tag: active ? (leftS !== null ? `RUNNING ${leftS}s` : "ARMED") : undefined, label: v.ok ? "USE" : v.reason === "money" ? "TOO POOR" : active ? "ACTIVE" : "—", onBuy: () => api.buy(id) }));
    }
    return out;
  };

  const aisleHead = (c: CatId, extra?: React.ReactNode) => {
    const cat = CATS.find((x) => x.id === c)!;
    return (
      <div className={`shop-aisle-head ${aisle === c ? "armed" : ""}`}>
        <span className="shop-aisle-key">{c}</span>
        <span className="shop-aisle-label">{cat.label}</span>
        <span className="shop-hint">{extra ?? cat.note}</span>
      </div>
    );
  };

  return (
    <div className="shop" data-testid="shop" onContextMenu={(e) => e.preventDefault()}>
      <div className="shop-card">
        <div className="shop-head">
          <div className="shop-head-left">
            <div className="shop-title">BUY MENU</div>
            <div className="shop-sub">{
              h.nearStation ? "At the counter · open"
                : left !== null ? `Spawn window · ${left}s left`
                : h.phase === MatchPhase.Prep ? "Prepare · open until the wave"
                : "Warm-up · open"}</div>
          </div>
          <div className="shop-head-right">
            <div className="shop-wallet" data-testid="shop-money">{money(h.money)}</div>
            <button className="shop-btn ghost" onClick={click(api.close)} data-testid="shop-close">CLOSE · ESC</button>
          </div>
        </div>

        <div className="shop-body">
          <section className="shop-aisle">
            {aisleHead(1, <>slot 1 · swap refunds {Math.round(ECONOMY.sellRatio * 100)}%</>)}
            {aisles[1].map(weaponRow(1) as (id: ShopItemId, i: number) => React.ReactNode)}
          </section>
          <section className="shop-aisle">
            {aisleHead(2)}
            {aisles[2].map(weaponRow(2) as (id: ShopItemId, i: number) => React.ReactNode)}
            {aisleHead(3, <>lethal G ×{ECONOMY.lethalMax} · tactical 4 ×{ECONOMY.tacticalMax}</>)}
            {(aisles[3] as GrenadeId[]).map(grenadeRow)}
          </section>
          <section className="shop-aisle">
            {aisleHead(4, h.mode === "bomb" ? <>no perks in bomb mode</> : <>armour, kit and perks</>)}
            {gearRows()}
          </section>
        </div>

        <div className="shop-foot">
          <span className={`shop-result ${result ? (result.ok ? "ok" : "err") : ""}`} data-testid="shop-result">
            {result
              ? (result.ok ? `✓ Bought ${nameOf(result.item)}.` : `✕ ${REASONS[result.reason ?? "unknown"] ?? result.reason}`)
              : aisle !== null
                ? `${CATS.find((c) => c.id === aisle)!.label} — now press the item's number`
                : "Kills $300 · head shot +$50 · assist $150"}
          </span>
          <span className="shop-keyhelp">
            Click an item to buy · or press its two numbers · <kbd>ESC</kbd> or <kbd>B</kbd> to close and play on
          </span>
        </div>
      </div>
    </div>
  );
}

function nameOf(item: string): string {
  if (item in WEAPONS) return WEAPONS[item as WeaponId].name;
  if (item in GRENADES) return GRENADES[item as GrenadeId].name;
  if (item in PERKS) return PERKS[item as keyof typeof PERKS].name;
  if (item in ARMOR) return ARMOR[item as keyof typeof ARMOR].name;
  if (item === KIT_ITEM) return "Defuse kit";
  return item;
}
