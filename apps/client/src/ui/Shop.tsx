import React, { useEffect, useMemo, useRef, useState } from "react";
import { MatchPhase,
  ARMOR, BOYS, BOYS_CLASSES, ECONOMY, GRENADES, PERKS, PERK_ORDER, WEAPONS, WEAPON_PRICES,
  boysClass, buyShortfall, canBuy, canSell, perkActive, primaryOf, secondaryOf,
  isArmorId, isGrenadeId, isPerkId, isWeaponId,
  type ArmorId, type GrenadeId, type PerkId, type ShopItemId, type Wallet, type WeaponId,
} from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";
import { feelOf } from "../game/combat/weaponFeel";
import { SHOP_ART } from "./shopArt";
import { CAT_INFO, ITEM_ROLE, SHOP_CATS, catForCode, itemName, itemStats, keyForPos, posForCode, shopCatalog, type ShopCat } from "./shopCatalog";

export interface ShopApi {
  /** "The Boys" mode: pick the role you respawn as. */
  selectClass?(id: number): void;
  buy(item: ShopItemId): void;
  sell(item: WeaponId): void;
  close(): void;
}

interface Props { h: HudState; api: ShopApi; now: number }

/**
 * Why a request was refused, in words a player can act on. Shown ON the row (not only in the
 * result line), because a greyed button with no reason is the thing players complain about. The
 * money case is built from the wallet instead (see `why()`): "brakuje $300" beats "za drogo".
 */
const REASONS: Record<string, string> = {
  closed: "Sklep zamknięty — kupuj po odrodzeniu albo przy ladzie $",
  money: "Za mało pieniędzy",
  owned: "Już to masz",
  full: "Masz już maksimum",
  slot: "Inny granat zajmuje ten slot",
  pistol: "Darmowy sprzęt — nie na sprzedaż",
  none: "Nie masz tego",
  unknown: "Nieznany przedmiot",
  class: "Nie dla twojej roli",
  "no-shop": "W tym trybie nie ma sklepu",
  shaved: "Ostrzyżeni nie kupują — masz maszynkę",
};

/** Short state for the disabled button, so the state is a WORD and not only a grey colour. */
const BLOCKED_LABEL: Record<string, string> = {
  closed: "ZAMKNIĘTE", money: "BRAK KASY", owned: "MASZ", full: "PEŁNO", slot: "SLOT ZAJĘTY", class: "NIE TA ROLA", "no-shop": "BRAK SKLEPU", shaved: "NIE TERAZ",
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** How long a click waits for the server's answer before the button is offered again. */
const PENDING_MS = 2000;
/** An armed aisle forgets itself after this, so a stray "1" cannot buy something a while later. */
const ARM_MS = 6000;

type Verdict = ReturnType<typeof canBuy> | { ok: false; reason: "class" };

/**
 * Buy menu. Every rule shown here is the shared economy function the server will run, so no
 * button promises something the server then refuses; the server's ShopResult is still the only
 * thing that moves the wallet, and a click is greyed (`pending`) until that answer arrives.
 *
 * LAYOUT: four aisles as tabs on a left rail, one aisle at a time on the right as full-width
 * rows. The previous one-screen menu put 24 rows in three columns and paid for it in 9.5 px stat
 * lines, names cut to "M-1 Clean Li…" and two buy buttons below the fold at 125 % zoom. One aisle
 * at a time is never more than ten rows, which is what the digit keys can reach anyway, so every
 * row gets a name at 17 px, a role line a first-time buyer can read, a large silhouette and a
 * price cell that says what the swap really costs. `e2e/tools/ui-fit.mjs` measures all four tabs.
 *
 * KEYS, unchanged in spirit: an aisle digit (1–4) first — it also switches the tab — then the
 * item's digit, 1–9 and 0 for the tenth. `shopCatalog` is the one source for both the printed
 * shortcut and what the handler accepts.
 */
export function Shop({ h, api, now }: Props) {
  const wallet: Wallet = { money: h.money, owned: h.owned, lethal: h.lethal, lethalCount: h.lethalCount, tactical: h.tactical, tacticalCount: h.tacticalCount, armor: h.armor, perks: h.perks };
  const boys = h.mode === "boys";
  const ctx = { boysClass: boys ? h.boysClass : undefined, now: h.serverNow, spawnedAt: -1e9, phase: h.phase, alive: h.alive, nearStation: true }; // window state comes from `buyWindowLeft` already
  const open = h.buyWindowLeft > 0;
  const primary = primaryOf(wallet);
  const secondary = secondaryOf(wallet);
  const left = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const result = h.shopResult && now - h.shopResult.at < 3000 ? h.shopResult : null;

  const cats = useMemo(() => shopCatalog({ mode: h.mode, boysClass: boys ? h.boysClass : undefined }), [h.mode, boys, h.boysClass]);
  /** The aisle on screen. */
  const [cat, setCat] = useState<ShopCat>(1);
  /** Set by the first digit: the next digit picks an item from `cat`. Cleared by use, Escape or time. */
  const [armed, setArmed] = useState(false);
  const armedAt = useRef(0);
  /** The row under the mouse or keyboard, for the detail panel. */
  const [focus, setFocus] = useState<ShopItemId | null>(null);
  /** Items with a request in flight: item → time sent. */
  const [pending, setPending] = useState<Record<string, number>>({});
  const lastResultAt = useRef(h.shopResult?.at ?? 0);

  // A server answer (any answer: they come back in order) releases every pending button; so does
  // time, in case the answer never comes.
  useEffect(() => {
    const at = h.shopResult?.at ?? 0;
    if (at !== lastResultAt.current) { lastResultAt.current = at; setPending({}); }
  }, [h.shopResult]);
  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const stale = Object.entries(pending).filter(([, t]) => now - t > PENDING_MS);
    if (stale.length) setPending((p) => { const n = { ...p }; for (const [k] of stale) delete n[k]; return n; });
  }, [now, pending]);
  useEffect(() => { if (armed && now - armedAt.current > ARM_MS) setArmed(false); }, [now, armed]);

  const verdict = (item: ShopItemId): Verdict =>
    !cats[1].includes(item) && !cats[2].includes(item) && !cats[3].includes(item) && !cats[4].includes(item) ? { ok: false, reason: "class" }
    : open ? canBuy(wallet, item, ctx)
    : { ok: false, reason: "closed" };
  const why = (v: Verdict): string => v.ok ? "" : v.reason === "money" ? "" : REASONS[v.reason] ?? v.reason;
  const isPending = (item: string) => item in pending;
  const request = (item: ShopItemId, fn: () => void) => {
    if (isPending(item)) return;
    uiSound("click");
    setPending((p) => ({ ...p, [item]: now }));
    fn();
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Escape") { e.preventDefault(); if (armed) setArmed(false); else api.close(); return; }
      const pos = posForCode(e.code);
      if (pos === 0) return;
      e.preventDefault();
      if (!armed) {
        const c = catForCode(e.code);
        if (c) { uiSound("click"); setCat(c); setArmed(true); armedAt.current = now; }
        return;
      }
      setArmed(false);
      const item = cats[cat][pos - 1];
      if (item && verdict(item).ok) request(item, () => api.buy(item));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
    // `verdict` closes over the wallet, which changes on every purchase — rebinding is the point.
  });

  const swapLine = (id: WeaponId, v: Verdict, starter: boolean): { text: string; tone: string } | null => {
    if (!v.ok || starter) return null;
    const net = WEAPON_PRICES[id] - v.refund;
    if (v.refund <= 0) return null;
    return net > 0 ? { text: `dopłata ${money(net)}`, tone: "pay" } : net < 0 ? { text: `zwrot ${money(-net)}`, tone: "credit" } : { text: "bez dopłaty", tone: "" };
  };

  interface RowState {
    carried: boolean; tag?: string; v: Verdict; label: string; onBuy: () => void;
    sub?: { text: string; tone: string } | null; price: number; sell?: WeaponId;
  }

  const row = (id: ShopItemId, pos: number, name: React.ReactNode, s: RowState) => {
    const Art = SHOP_ART[id];
    const blocked = !s.carried && !s.v.ok;
    const short = !s.v.ok && s.v.reason === "money" ? buyShortfall(wallet, id, ctx) : 0;
    const reason = blocked ? (short > 0 ? `Brakuje ${money(short)}` : why(s.v)) : "";
    const busy = isPending(id);
    return (
      <div key={id} tabIndex={0} role="group"
        className={`shop-row ${s.carried ? "carried" : ""} ${blocked ? "locked" : ""} ${armed ? "aisle-armed" : ""} ${busy ? "pending" : ""}`}
        data-testid={`shop-${id}`} aria-label={`${itemName(id)}, ${money(s.price)}`}
        onMouseEnter={() => setFocus(id)} onFocus={() => setFocus(id)}>
        <span className="shop-key" aria-label={`skrót ${cat} potem ${keyForPos(pos)}`}>{cat}<i>·</i>{keyForPos(pos)}</span>
        <span className="shop-row-art"><Art /></span>
        <span className="shop-row-main">
          <span className="shop-row-name">{name}</span>
          <span className={`shop-row-role ${blocked ? "why" : ""}`} data-testid={blocked ? `why-${id}` : undefined}>
            {blocked ? <><i aria-hidden>✕</i> {reason}</> : ITEM_ROLE[id]}
          </span>
        </span>
        <span className="shop-row-price">
          <b>{s.price === 0 ? "ZA DARMO" : money(s.price)}</b>
          {s.sub ? <small className={s.sub.tone}>{s.sub.text}</small> : s.tag ? <small className="tag">{s.tag}</small> : null}
        </span>
        <span className="shop-row-actions">
          {s.sell && (
            <button className="shop-btn ghost" disabled={busy} onClick={() => request(id, () => api.sell(s.sell!))} data-testid={`sell-${id}`}
              title={`Sprzedaj za ${money(Math.round(WEAPON_PRICES[s.sell] * ECONOMY.sellRatio))}`}>
              SPRZEDAJ<span className="shop-sell-amount"> {money(Math.round(WEAPON_PRICES[s.sell] * ECONOMY.sellRatio))}</span>
            </button>
          )}
          {/* An item you already have needs no buy button: the price cell says MASZ / SLOT 1. */}
          {!(s.carried && !s.v.ok) && (
            <button className={`shop-btn ${blocked ? "blocked" : ""}`} disabled={!s.v.ok || busy} onClick={() => request(id, s.onBuy)} data-testid={`buy-${id}`}>
              {busy ? "…" : s.v.ok ? s.label : BLOCKED_LABEL[s.v.reason] ?? "—"}
            </button>
          )}
        </span>
      </div>
    );
  };

  const weaponRow = (id: WeaponId, i: number) => {
    const w = WEAPONS[id];
    const starter = boys && id === boysClass(h.boysClass).starter;
    const carried = id === secondary || id === primary;
    const v = verdict(id);
    const sellable = carried && open && canSell(wallet, id, ctx).ok;
    const swapping = w.slot === 1 ? primary : secondary !== "pistol" ? secondary : null;
    // The SCOPE badge follows the glass the player will actually look through (matrix D-B2), not
    // WeaponDef.scoped, which stays the sniper-only balance predicate it has always been.
    const glass = feelOf(w.id).scope;
    return row(id, i + 1,
      <>{w.name}{glass !== null && <span className="shop-slot">{glass === "tube" ? "LUNETA" : "CELOWNIK"}</span>}</>,
      {
        carried, v, price: starter ? 0 : WEAPON_PRICES[id],
        tag: carried ? `MASZ · SLOT ${w.slot}` : undefined,
        sub: carried ? { text: `masz · slot ${w.slot}`, tone: "tag" } : swapping ? swapLine(id, v, starter) : null,
        label: starter ? "ZA DARMO" : swapping && v.ok && v.refund > 0 ? "WYMIEŃ" : "KUP",
        onBuy: () => api.buy(id),
        sell: sellable ? id : undefined,
      });
  };

  const grenadeRow = (id: GrenadeId, i: number) => {
    const g = GRENADES[id];
    const count = g.slot === "lethal" ? (wallet.lethal === id ? wallet.lethalCount : 0) : (wallet.tactical === id ? wallet.tacticalCount : 0);
    const v = verdict(id);
    const max = g.slot === "lethal" ? ECONOMY.lethalMax : ECONOMY.tacticalMax;
    return row(id, i + 1,
      <>{g.name}<span className={`shop-slot ${g.slot}`}>{g.slot === "lethal" ? "G" : "4"}</span></>,
      {
        carried: count > 0, v, price: g.price,
        sub: count > 0 ? { text: `masz ×${count} z ${max}`, tone: "tag" } : null,
        label: count > 0 ? "DOKUP" : "KUP",
        onBuy: () => api.buy(id),
      });
  };

  const gearRow = (id: ShopItemId, i: number) => {
    if (isArmorId(id)) {
      const a = ARMOR[id as ArmorId]; const worn = h.armor >= a.armor; const v = verdict(id);
      return row(id, i + 1, a.name, {
        carried: worn, v, price: a.price,
        sub: worn ? { text: "nosisz", tone: "tag" } : h.armor > 0 ? { text: `masz ${h.armor} pkt`, tone: "tag" } : null,
        label: h.armor > 0 ? "ULEPSZ" : "KUP", onBuy: () => api.buy(id),
      });
    }
    const p = PERKS[id as PerkId]; const active = perkActive(wallet.perks, id as PerkId, h.serverNow); const v = verdict(id);
    const leftS = active && p.durationMs > 0 ? Math.ceil((wallet.perks[id as PerkId] - h.serverNow) / 1000) : null;
    return row(id, i + 1, p.name, {
      carried: active, v, price: p.price,
      sub: active ? { text: leftS !== null ? `działa jeszcze ${leftS} s` : "uzbrojone", tone: "tag" } : null,
      label: "UŻYJ", onBuy: () => api.buy(id),
    });
  };

  const rows = cat === 1 || cat === 2 ? (cats[cat] as WeaponId[]).map(weaponRow)
    : cat === 3 ? (cats[3] as GrenadeId[]).map(grenadeRow)
    : cats[4].map(gearRow);

  /** What each aisle says about the loadout right now, on its tab — the "what do I have" line. */
  const carriedLine = (c: ShopCat): string => {
    if (c === 1) return primary ? WEAPONS[primary].name : "brak — kup broń";
    if (c === 2) return WEAPONS[secondary].name;
    if (c === 3) {
      const parts = [wallet.lethal ? `${GRENADES[wallet.lethal].name} ×${wallet.lethalCount}` : "", wallet.tactical ? `${GRENADES[wallet.tactical].name} ×${wallet.tacticalCount}` : ""].filter(Boolean);
      return parts.length ? parts.join(" · ") : "brak granatów";
    }
    const perks = PERK_ORDER.filter((id) => perkActive(wallet.perks, id, h.serverNow)).length;
    const plate = h.armor > 0 ? `płyta ${h.armor}` : "brak płyty";
    return perks > 0 ? `${plate} · ${perks} ${perks === 1 ? "wzmocnienie" : "wzmocnienia"}` : plate;
  };

  /** Detail panel: the focused row, else what this aisle already holds, else its first item. */
  const detailId: ShopItemId | null = focus && cats[cat].includes(focus) ? focus
    : cat === 1 ? (primary ?? cats[1][0] ?? null)
    : cat === 2 ? secondary
    : cats[cat][0] ?? null;
  const DetailArt = detailId ? SHOP_ART[detailId] : null;
  const detailPrice = detailId ? (isWeaponId(detailId) ? WEAPON_PRICES[detailId] : isGrenadeId(detailId) ? GRENADES[detailId].price : isPerkId(detailId) ? PERKS[detailId].price : ARMOR[detailId as ArmorId].price) : 0;

  const status = !h.alive ? "Obserwujesz · zmiana roli od następnego odrodzenia"
    : !open ? "Sklep zamknięty · znajdź ladę $ na mapie"
    : h.nearStation ? "Przy ladzie · otwarte"
    : left !== null ? `Okno po odrodzeniu · zostało ${left} s`
    // Prep is not warm-up: it is a countdown inside a running match.
    : h.phase === MatchPhase.Prep ? "Przygotowanie · otwarte do startu rundy"
    : "Rozgrzewka · otwarte";

  return (
    <div className="shop" data-testid="shop" onContextMenu={(e) => e.preventDefault()}>
      <div className="shop-card">
        <div className="shop-head">
          <div className="shop-head-left">
            <div className="shop-title">SKLEP</div>
            <div className="shop-sub">{status}</div>
          </div>
          <div className="shop-head-right">
            <div className={`shop-countdown ${left !== null && left <= 5 ? "urgent" : ""}`} data-testid="shop-countdown">
              <small>CZAS NA ZAKUPY</small><strong>{!open ? "ZAMKNIĘTE" : left === null ? "OTWARTE" : `${left}s`}</strong>
            </div>
            <div className="shop-wallet" data-testid="shop-money"><small>TWOJA KASA</small>{money(h.money)}</div>
            <button className="shop-btn ghost close" onClick={() => { uiSound("click"); api.close(); }} data-testid="shop-close">ZAMKNIJ · ESC</button>
          </div>
        </div>

        {boys && (
          <section className="boys-strip" data-testid="boys-picker">
            <span className="boys-strip-label">TWOJA ROLA<small>zmiana przy odrodzeniu · kasa zostaje</small></span>
            <div className="boys-strip-row">
              {BOYS_CLASSES.map((id) => {
                const c = BOYS[id];
                const mates = h.players.filter((p) => p.connected && p.team === h.myTeam && p.boysClass === id).length;
                return (
                  <button key={id} className={`boys-chip ${h.nextClass === id ? "on" : ""}`} aria-pressed={h.nextClass === id}
                    data-testid={`boys-class-${id}`} title={c.blurb}
                    onClick={() => { uiSound("click"); api.selectClass?.(id); }}>
                    <b>{c.name}</b>
                    <span>{h.boysClass === id ? "AKTYWNA" : h.nextClass === id ? "OD ODRODZENIA" : `${mates} w drużynie`}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="shop-main">
          <nav className="shop-rail" aria-label="Działy sklepu">
            {SHOP_CATS.map((c) => (
              <button key={c} className={`shop-tab ${cat === c ? "on" : ""} ${armed && cat === c ? "armed" : ""}`} aria-pressed={cat === c}
                data-testid={`shop-tab-${c}`} onClick={() => { uiSound("click"); setCat(c); setArmed(false); }}>
                <span className="shop-tab-key">{c}</span>
                <span className="shop-tab-text">
                  <b>{CAT_INFO[c].label}</b>
                  <small>{carriedLine(c)}</small>
                </span>
                <span className="shop-tab-count">{cats[c].length}</span>
              </button>
            ))}
            {detailId && DetailArt && (
              <div className="shop-detail" data-testid="shop-detail">
                <div className="shop-detail-art"><DetailArt /></div>
                <div className="shop-detail-name">{itemName(detailId)}</div>
                <div className="shop-detail-role">{ITEM_ROLE[detailId]}</div>
                <dl className="shop-detail-stats">
                  {itemStats(detailId).map((s) => <React.Fragment key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></React.Fragment>)}
                  <dt>Cena</dt><dd>{detailPrice === 0 ? "za darmo" : money(detailPrice)}</dd>
                </dl>
              </div>
            )}
          </nav>

          <section className="shop-panel" aria-live="polite">
            <div className={`shop-aisle-head ${armed ? "armed" : ""}`}>
              <span className="shop-aisle-key">{cat}</span>
              <span className="shop-aisle-label">{CAT_INFO[cat].label}</span>
              <span className="shop-hint">{cat === 1 ? `slot 1 · wymiana zwraca ${Math.round(ECONOMY.sellRatio * 100)} % ceny starej broni`
                : cat === 3 ? `bojowe pod G ×${ECONOMY.lethalMax} · taktyczne pod 4 ×${ECONOMY.tacticalMax}`
                : cat === 4 && h.mode === "bomb" ? "w trybie bomby bez wzmocnień"
                : CAT_INFO[cat].note}</span>
            </div>
            <div className="shop-grid" data-testid="shop-grid">
              {rows}
            </div>
          </section>
        </div>

        <div className="shop-foot">
          <span className={`shop-result ${result ? (result.ok ? "ok" : "err") : ""}`} data-testid="shop-result" role="status">
            {result
              ? (result.ok ? `✓ ${result.sold ? "Sprzedano" : "Kupiono"}: ${itemName(result.item)}` : `✕ ${REASONS[result.reason ?? "unknown"] ?? result.reason}`)
              : armed
                ? `${CAT_INFO[cat].label} — teraz naciśnij numer przedmiotu (1–9, 0 = dziesiąty)`
                : `Zabójstwo ${money(ECONOMY.killReward)} · strzał w głowę +${money(ECONOMY.headshotBonus)} · asysta ${money(ECONOMY.assistReward)}`}
          </span>
          <span className="shop-keyhelp">
            Kliknij przedmiot · albo wciśnij dwie cyfry: dział, potem pozycja · <kbd>ESC</kbd> lub <kbd>B</kbd> zamyka i wracasz do gry
          </span>
        </div>
      </div>
    </div>
  );
}
