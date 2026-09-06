import React, { useEffect } from "react";
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

const REASONS: Record<string, string> = {
  closed: "The shop is closed — buy right after spawning or at a $ BUY station.",
  money: "Not enough cash.",
  owned: "Already carried / already running.",
  full: "Slot full.",
  slot: "That slot holds a different grenade — throw those first.",
  pistol: "Free gear stays with you.",
  none: "Not carried.",
  unknown: "Unknown item.",
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Buy menu (drop 2, extended in drop 3 with sidearms, perks and armour). The rules are the shared
 * economy functions, so every button state matches what the server will answer; the server's
 * ShopResult is still the only thing that changes the wallet. Opened with B by the game, which
 * releases the pointer while it is up.
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === "Escape") { e.preventDefault(); api.close(); } };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [api]);

  const verdict = (item: ShopItemId) => (open ? canBuy(wallet, item, ctx) : { ok: false as const, reason: "closed" as const });
  const click = (fn: () => void) => () => { uiSound("click"); fn(); };

  const weaponCard = (id: WeaponId) => {
    const w = WEAPONS[id];
    const carried = id === secondary || id === primary;
    const v = verdict(id);
    const sellable = carried && open && canSell(wallet, id, ctx).ok;
    const swapping = w.slot === 1 ? primary : secondary !== "pistol" ? secondary : null;
    return (
      <div key={id} className={`shop-item ${carried ? "carried" : ""} ${!carried && !v.ok ? "locked" : ""}`} data-testid={`shop-${id}`}>
        <div className="shop-item-art"><WeaponArt id={id} /></div>
        <div className="shop-item-head">
          <span className="shop-item-name">{w.name}{w.scoped && <span className="shop-slot">SCOPE</span>}</span>
          <span className="shop-item-price">{WEAPON_PRICES[id] === 0 ? "FREE" : money(WEAPON_PRICES[id])}</span>
        </div>
        <div className="shop-item-stats">
          {w.kind === "launcher" ? <><span>BLAST {GRENADES.shell.damage}</span><span>R {GRENADES.shell.radius} m</span></> : <span>DMG {w.damage}{w.pellets > 1 ? `×${w.pellets}` : ""}</span>}
          <span>RPM {w.rpm}</span><span>MAG {w.magazine}</span>
        </div>
        <div className="shop-item-blurb">{WEAPON_BLURB[id]}</div>
        <div className="shop-item-actions">
          {carried ? (
            <>
              <span className="shop-tag">CARRIED · SLOT {w.slot}</span>
              {sellable && <button className="shop-btn ghost" onClick={click(() => api.sell(id))}>SELL {money(Math.round(WEAPON_PRICES[id] * ECONOMY.sellRatio))}</button>}
            </>
          ) : (
            <button className="shop-btn" disabled={!v.ok} onClick={click(() => api.buy(id))} title={!v.ok ? REASONS[v.reason] : undefined}>
              {v.ok ? (swapping && v.refund > 0 ? `SWAP · ${money(WEAPON_PRICES[id] - v.refund)}` : "BUY") : v.reason === "money" ? "TOO POOR" : "—"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="shop" data-testid="shop" onContextMenu={(e) => e.preventDefault()}>
      <div className="shop-card">
        <div className="shop-head">
          <div>
            <div className="shop-title">FRANKI'S BACK ROOM</div>
            <div className="shop-sub">{
              h.nearStation ? "AT THE COUNTER · OPEN"
                : left !== null ? `SPAWN WINDOW · ${left}s`
                // Prep is not warm-up: it is a countdown inside a running match, and telling the
                // player otherwise is telling them the match has not started.
                : h.phase === MatchPhase.Prep ? "PREPARE · OPEN UNTIL THE WAVE"
                : "WARM-UP · OPEN"}</div>
          </div>
          <div className="shop-wallet" data-testid="shop-money">{money(h.money)}</div>
        </div>

        <div className="shop-section">PRIMARY <span className="shop-hint">one at a time · replacing refunds {Math.round(ECONOMY.sellRatio * 100)}% · slot 1</span></div>
        <div className="shop-grid">{PRIMARY_ORDER.filter(id => h.mode !== "bomb" || id !== "launcher").map(weaponCard)}</div>

        <div className="shop-section">SIDEARM <span className="shop-hint">slot 2 · the clippers are always in slot 3 (V)</span></div>
        <div className="shop-grid">{SECONDARY_ORDER.map(weaponCard)}</div>

        <div className="shop-section">GRENADES <span className="shop-hint">lethal (G) ×{ECONOMY.lethalMax} · tactical (4) ×{ECONOMY.tacticalMax} · one kind per slot</span></div>
        <div className="shop-grid grenades">
          {GRENADE_ORDER.map((id) => {
            const g = GRENADES[id];
            const count = g.slot === "lethal" ? (wallet.lethal === id ? wallet.lethalCount : 0) : (wallet.tactical === id ? wallet.tacticalCount : 0);
            const v = verdict(id);
            return (
              <div key={id} className={`shop-item ${count > 0 ? "carried" : ""} ${count === 0 && !v.ok ? "locked" : ""}`} data-testid={`shop-${id}`}>
                <div className="shop-item-art sq"><GrenadeArt id={id} /></div>
                <div className="shop-item-head">
                  <span className="shop-item-name">{g.name}<span className={`shop-slot ${g.slot}`}>{g.slot === "lethal" ? "G" : "4"}</span></span>
                  <span className="shop-item-price">{money(g.price)}</span>
                </div>
                <div className="shop-item-blurb">{GRENADE_BLURB[id]}</div>
                <div className="shop-item-actions">
                  {count > 0 && <span className="shop-tag">×{count}</span>}
                  <button className="shop-btn" disabled={!v.ok} onClick={click(() => api.buy(id))} title={!v.ok ? REASONS[v.reason] : undefined}>
                    {v.ok ? (count > 0 ? "BUY ANOTHER" : "BUY") : v.reason === "money" ? "TOO POOR" : v.reason === "full" ? "FULL" : v.reason === "slot" ? "SLOT TAKEN" : "—"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shop-section">{h.mode === "bomb" ? "TACTICAL RULES · NO PERKS / LAUNCHERS" : "BARBER PERKS"} {h.mode !== "bomb" && <span className="shop-hint">consumed on purchase · one of each at a time · the fade lasts until your next death</span>}</div>
        <div className="shop-grid perks">
          {(h.mode === "bomb" ? [] : PERK_ORDER).map((id) => {
            const p = PERKS[id];
            const active = perkActive(wallet.perks, id, h.serverNow);
            const leftS = active && p.durationMs > 0 ? Math.ceil((wallet.perks[id] - h.serverNow) / 1000) : null;
            const v = verdict(id);
            return (
              <div key={id} className={`shop-item ${active ? "carried" : ""} ${!active && !v.ok ? "locked" : ""}`} data-testid={`shop-${id}`}>
                <div className="shop-item-art sq"><PerkArt id={id} /></div>
                <div className="shop-item-head">
                  <span className="shop-item-name">{p.name}</span>
                  <span className="shop-item-price">{money(p.price)}</span>
                </div>
                <div className="shop-item-blurb">{p.blurb}</div>
                <div className="shop-item-actions">
                  {active && <span className="shop-tag">{leftS !== null ? `RUNNING · ${leftS}s` : "ARMED"}</span>}
                  <button className="shop-btn" disabled={!v.ok} onClick={click(() => api.buy(id))} title={!v.ok ? REASONS[v.reason] : undefined}>
                    {v.ok ? "USE" : v.reason === "money" ? "TOO POOR" : active ? "ACTIVE" : "—"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shop-section">ARMOUR <span className="shop-hint">absorbs half of every hit · lost on death · you have {h.armor}</span></div>
        <div className="shop-grid perks">
          {bombDefender && (() => {
            const v = verdict(KIT_ITEM);
            return (
              <div className={`shop-item ${h.kit ? "carried" : ""} ${!h.kit && !v.ok ? "locked" : ""}`} data-testid="shop-kit">
                <div className="shop-item-art sq"><KitArt /></div>
                <div className="shop-item-head">
                  <span className="shop-item-name">Defuse kit</span>
                  <span className="shop-item-price">{money(BOMB.kitPrice)}</span>
                </div>
                <div className="shop-item-stats"><span>DEFUSE {BOMB.defuseKitMs / 1000} S</span><span>WITHOUT {BOMB.defuseMs / 1000} S</span></div>
                <div className="shop-item-blurb">Cuts the defuse in half. Lost on death, kept between rounds while you live.</div>
                <div className="shop-item-actions">
                  {h.kit && <span className="shop-tag">CARRIED</span>}
                  <button className="shop-btn" disabled={!v.ok} onClick={click(() => api.buy(KIT_ITEM))} title={!v.ok ? REASONS[v.reason] : undefined}>
                    {v.ok ? "BUY" : v.reason === "money" ? "TOO POOR" : h.kit ? "OWNED" : "—"}
                  </button>
                </div>
              </div>
            );
          })()}
          {ARMOR_ORDER.map((id) => {
            const a = ARMOR[id];
            const worn = h.armor >= a.armor;
            const v = verdict(id);
            return (
              <div key={id} className={`shop-item ${worn ? "carried" : ""} ${!worn && !v.ok ? "locked" : ""}`} data-testid={`shop-${id}`}>
                <div className="shop-item-art sq"><ArmorArt id={id} /></div>
                <div className="shop-item-head">
                  <span className="shop-item-name">{a.name}</span>
                  <span className="shop-item-price">{money(a.price)}</span>
                </div>
                <div className="shop-item-stats"><span>PLATE {a.armor}</span></div>
                <div className="shop-item-blurb">{a.blurb}</div>
                <div className="shop-item-actions">
                  {worn && <span className="shop-tag">WORN</span>}
                  <button className="shop-btn" disabled={!v.ok} onClick={click(() => api.buy(id))} title={!v.ok ? REASONS[v.reason] : undefined}>
                    {v.ok ? (h.armor > 0 ? "TOP UP" : "BUY") : v.reason === "money" ? "TOO POOR" : "—"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shop-foot">
          <span className={`shop-result ${result ? (result.ok ? "ok" : "err") : ""}`} data-testid="shop-result">
            {result ? (result.ok ? `Bought ${nameOf(result.item)}.` : REASONS[result.reason ?? "unknown"] ?? result.reason) : "Kills $300 · head shot +$50 · assist $150"}
          </span>
          <button className="shop-btn ghost" onClick={click(api.close)} data-testid="shop-close">CLOSE · B</button>
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
