import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MatchPhase,
  ARMOR, BOYS, BOYS_CLASSES, ECONOMY, GRENADES, PERKS, WEAPONS, WEAPON_PRICES,
  boysClass, buyShortfall, canBuy, canSell, csKillReward, perkActive, perkTimed, planById, primaryOf, secondaryOf,
  isArmorId, isGrenadeId, isWeaponId,
  type ArmorId, type GameMode, type GrenadeId, type PerkId, type ShopItemId, type Wallet, type WeaponId,
} from "@frankibarber/shared";
import type { HudState } from "../game/store";
import { uiSound } from "../game/audio";
import { feelOf } from "../game/combat/weaponFeel";
import { SHOP_ART } from "./shopArt";
import { money } from "./hud/format";
import { CAT_INFO, ITEM_ROLE, SHOP_CATS, catForCode, itemName, itemStats, keyForPos, posForCode, shopCatalog, tileTag, type ShopCat } from "./shopCatalog";

export interface ShopApi {
  /** "The Boys" mode: pick the role you respawn as. */
  selectClass?(id: number): void;
  buy(item: ShopItemId): void;
  sell(item: WeaponId): void;
  close(): void;
}

interface Props {
  h: HudState; api: ShopApi; now: number;
  /**
   * False while the card plays its exit (`ShopLayer`, 160 ms): drawn, but its keys are off, so a
   * digit pressed on the way out cannot buy anything (`useKeepMounted`, §6.1). Defaults to true.
   */
  live?: boolean;
}

/**
 * Why the server refused a request, for the result line (3 s after its answer). A refusal the
 * shelf can predict is on the tile already, as one or two words; these are the rest.
 */
const REASONS: Record<string, string> = {
  closed: "Sklep zamknięty",
  money: "Za mało pieniędzy",
  owned: "Już to masz",
  full: "Masz już maksimum",
  slot: "Inny granat zajmuje ten slot",
  pistol: "Darmowy sprzęt — nie na sprzedaż",
  none: "Nie masz tego",
  unknown: "Nieznany przedmiot",
  class: "Nie dla twojej roli",
  "no-shop": "W tym trybie nie ma sklepu",
  mode: "Nie w tym trybie",
  shaved: "Ostrzyżeni nie kupują",
};

/**
 * The scoped rifle's mark: a reticle after its name (Principle 7, an icon where CS2 would use one).
 * It is an icon, not a word: its name „LUNETA” is the image's `aria-label` for a screen reader, and
 * the same word sits in the tile's text undisplayed (`.tile-scope-word`, display none) for the e2e
 * that reads the tile's textContent (`multiplayer.spec.ts:472`). As `sr-only` text it counted as a
 * seventh word on a sniper that is also short of money (key, name ×2, price, „Brakuje $1,050”).
 */
function Scope() {
  return (
    <span className="tile-scope" role="img" aria-label="LUNETA">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 0v5M8 11v5M0 8h5M11 8h5" /></svg>
      <span className="tile-scope-word" aria-hidden="true">LUNETA</span>
    </span>
  );
}

/** The modes that pay Counter-Strike's kill table by weapon (`csRules` on the server). */
const CS_MODES = new Set<GameMode>(["bomb", "duel", "turniej"]);

/** How long a click waits for the server's answer before the button is offered again. */
const PENDING_MS = 2000;
/** An armed aisle forgets itself after this, so a stray "1" cannot buy something a while later. */
const ARM_MS = 6000;

type Verdict = ReturnType<typeof canBuy> | { ok: false; reason: "class" };

/** One tile's state, worked out once and then drawn. */
interface TileState {
  /** On you now: the gun in its slot, the plate you wear, a running perk, a grenade in hand. */
  carried: boolean;
  v: Verdict;
  /** The tag a carried item shows beside its price (≤ 3 words): „MASZ”, „nosisz”, „działa jeszcze 12s”. */
  have?: string;
  /** What leaves the wallet: the price, or a swap's net after the old gun's refund. */
  price: number;
  /** The net of a swap (price − refund); undefined when nothing is traded in. */
  swapNet?: number;
  /** A small tag after the name: ×N/max on grenades you carry. */
  badge?: string;
  /** The tube scope: a reticle after the name, labelled „LUNETA” (the word the e2e pins). */
  scope?: boolean;
  sell?: WeaponId;
}

/**
 * The buy menu, CS2's: the five aisles side by side as columns — pistols, the mid-tier, rifles,
 * gear, grenades — every item on one screen, nothing to scroll and nothing behind a tab. A tile is
 * the key („3·2”), the name, the price and at most one tag („MASZ”, „nosisz”, „działa jeszcze 12s”,
 * „Brakuje $1,400”) — the tag BESIDE the price, never in its place, so a gun you cannot afford
 * still says what it costs: ≤ 6 words (docs/UI_U_SPEC.md §5.2 #49–50). A gun you carry and may
 * sell shows SPRZEDAJ as its one tag. The header is the three
 * things a buyer checks — SKLEP · money · time left — and, in a plan round, the one-line vote
 * (`shop-plan`; F1 / F2 stay live through the plan card, P3). The strip under the shelf says what
 * the focused item is FOR and, in the Counter-Strike modes, what a kill with it pays.
 *
 * Every rule shown is the shared economy function the server runs, so no tile promises something
 * the server then refuses; the server's ShopResult is still the only thing that moves the wallet,
 * and a click is greyed (`pending`) until that answer arrives.
 *
 * KEYS: an aisle digit (1–5) arms the aisle, then the item's digit (1–9, 0 for the tenth) buys it —
 * `shopCatalog` is the one source for the printed key and the accepted one. Clicking a column's
 * header arms it too; pressing that same aisle's digit next keeps it armed (the header shows the
 * digit, so that is what a player presses), any other digit buys from it. Tab is never taken:
 * the scoreboard opens over the shop, as in CS2.
 */
export function Shop({ h, api, now, live = true }: Props) {
  const wallet: Wallet = { money: h.money, owned: h.owned, lethal: h.lethal, lethalCount: h.lethalCount, tactical: h.tactical, tacticalCount: h.tacticalCount, armor: h.armor, perks: h.perks };
  const boys = h.mode === "boys";
  const ctx = { boysClass: boys ? h.boysClass : undefined, now: h.serverNow, spawnedAt: -1e9, phase: h.phase, alive: h.alive, nearStation: true }; // window state comes from `buyWindowLeft` already
  const open = h.buyWindowLeft > 0;
  const primary = primaryOf(wallet);
  const secondary = secondaryOf(wallet);
  const left = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const result = h.shopResult && now - h.shopResult.at < 3000 ? h.shopResult : null;
  const cs = CS_MODES.has(h.mode);

  const cats = useMemo(() => shopCatalog({ mode: h.mode, boysClass: boys ? h.boysClass : undefined }), [h.mode, boys, h.boysClass]);
  /** Set by an aisle digit or a column click: the next digit picks an item from that aisle. */
  const [armed, setArmed] = useState<{ cat: ShopCat; by: "key" | "click" } | null>(null);
  const armedAt = useRef(0);
  /** The tile under the mouse or keyboard, for the detail strip. */
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
  useEffect(() => { if (armed && now - armedAt.current > ARM_MS) setArmed(null); }, [now, armed]);

  const verdict = (item: ShopItemId): Verdict =>
    !SHOP_CATS.some((c) => cats[c].includes(item)) ? { ok: false, reason: "class" }
    : open ? canBuy(wallet, item, ctx)
    : { ok: false, reason: "closed" };
  const isPending = (item: string) => item in pending;
  const request = (item: ShopItemId, fn: () => void) => {
    if (isPending(item)) return;
    uiSound("click");
    setPending((p) => ({ ...p, [item]: now }));
    fn();
  };
  const arm = (cat: ShopCat, by: "key" | "click") => { uiSound("click"); setArmed({ cat, by }); armedAt.current = now; };

  useEffect(() => {
    if (!live) return;
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Escape") { e.preventDefault(); if (armed) setArmed(null); else api.close(); return; }
      const pos = posForCode(e.code);
      if (pos === 0) return; // not a digit: Tab, B and everything else pass through untouched
      e.preventDefault();
      const aisle = catForCode(e.code);
      if (!armed || (armed.by === "click" && aisle === armed.cat)) {
        if (aisle) arm(aisle, "key");
        return;
      }
      setArmed(null);
      const item = cats[armed.cat][pos - 1];
      if (item && verdict(item).ok) request(item, () => api.buy(item));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
    // `verdict` closes over the wallet, which changes on every purchase — rebinding is the point.
  });

  const tile = (id: ShopItemId, cat: ShopCat, pos: number, s: TileState) => {
    const Art = SHOP_ART[id];
    const busy = isPending(id);
    const reason = s.v.ok ? "" : s.v.reason;
    const short = reason === "money" ? buyShortfall(wallet, id, ctx) : 0;
    // The one tag comes from WHY the item is refused, not from carrying it (`tileTag`): one Frag of
    // two in the pocket is refused for money or a shut window, and the tile says that, with its
    // `why-{id}`. A closed shop greys the shelf and says so once, in the header.
    const t = tileTag({ reason, carried: s.carried, have: s.have ?? "", short });
    const blocked = t.locked;
    const refusal = t.tone === "no" ? t.text : "";
    const buyable = s.v.ok && !busy;
    // The price is ALWAYS printed (§5.2 #49: key, name, price, at most one tag), as one word: a free
    // gun reads „$0” — „ZA DARMO” beside „MASZ” made „1·1 P9 Straight Razor MASZ ZA DARMO” seven
    // words. A swap shows its net: the free P9 taken back for a carried revolver pays the revolver's
    // refund, and a bare „$0” there would hide the $420 you get.
    const priceText = busy ? "…"
      : s.swapNet !== undefined ? (s.swapNet >= 0 ? money(s.swapNet) : `+${money(-s.swapNet)}`)
      : money(s.price);
    // The one tag: a refusal the shelf can predict, or what a carried item is doing. A gun you
    // carry and may sell shows SPRZEDAJ there instead (the tile's brass edge already says it is yours).
    const tag = s.sell ? "" : t.text;
    const label = `${itemName(id)}, ${s.price === 0 ? "za darmo" : money(s.price)}${s.swapNet !== undefined ? `, z wymianą ${money(s.swapNet)}` : ""}${tag ? ` — ${tag}` : ""}`;
    return (
      <div key={id}
        className={`shop-tile${s.carried ? " carried" : ""}${blocked ? " locked" : ""}${busy ? " pending" : ""}`}
        data-testid={`shop-${id}`}
        onMouseEnter={() => setFocus(id)}>
        <button className="tile-hit" disabled={!buyable} data-testid={`buy-${id}`} aria-label={label}
          onClick={() => request(id, () => api.buy(id))} onFocus={() => setFocus(id)} />
        <span className="tile-art" aria-hidden="true"><Art /></span>
        <span className="tile-name">{itemName(id)}{s.badge && <small className="tile-badge">{s.badge}</small>}{s.scope && <Scope />}</span>
        {/* The foot: the one tag on its own line, then the key and the price — the tag beside the
            price, never in its place (§5.2 #49). On a short tile (TDM's six rows on a small screen)
            the lines tighten and SPRZEDAJ shrinks to its icon beside the key — `screens.css`. */}
        <span className="tile-foot">
          {/* One text node, so the key is one word („3·2”, §3.10) and `ui-fit.mjs` reads it whole. */}
          <span className="tile-key" aria-hidden="true">{`${cat}·${keyForPos(pos)}`}</span>
          {s.sell ? (
            <span className="tile-tag sell">
              <button className="tile-sell" disabled={busy} onClick={() => request(id, () => api.sell(s.sell!))} data-testid={`sell-${id}`}
                aria-label={`Sprzedaj za ${money(Math.round(WEAPON_PRICES[s.sell] * ECONOMY.sellRatio))}`}
                title={`Sprzedaj za ${money(Math.round(WEAPON_PRICES[s.sell] * ECONOMY.sellRatio))}`}>
                <svg className="tile-sell-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" /></svg>
                <span className="tile-sell-word">SPRZEDAJ</span>
              </button>
            </span>
          ) : tag ? (
            <span className={`tile-tag ${refusal ? "no" : "have"}`} data-testid={refusal ? `why-${id}` : undefined}>{tag}</span>
          ) : null}
          <span className={`tile-price${s.swapNet !== undefined && !busy ? " swap" : ""}`}
            title={s.swapNet !== undefined ? "Z wymianą: stara broń wraca za 70 % ceny" : undefined}>
            {s.swapNet !== undefined && !busy && <i className="tile-swap" aria-hidden="true">⇄</i>}{priceText}
          </span>
        </span>
      </div>
    );
  };

  const weaponTile = (id: WeaponId, cat: ShopCat, i: number) => {
    const w = WEAPONS[id];
    const starter = boys && id === boysClass(h.boysClass).starter;
    const carried = id === secondary || id === primary;
    const v = verdict(id);
    const sellable = carried && open && canSell(wallet, id, ctx).ok;
    const swapping = w.slot === 1 ? primary : secondary !== "pistol" ? secondary : null;
    const refund = v.ok ? v.refund : 0;
    return tile(id, cat, i + 1, {
      carried, v, price: starter ? 0 : WEAPON_PRICES[id], have: "MASZ",
      swapNet: !carried && !starter && swapping && refund > 0 ? WEAPON_PRICES[id] - refund : undefined,
      // The badge follows the glass the player will actually look through (matrix D-B2), not
      // WeaponDef.scoped, which stays the sniper-only balance predicate it has always been.
      scope: feelOf(w.id).scope === "tube",
      sell: sellable ? id : undefined,
    });
  };

  const grenadeTile = (id: GrenadeId, cat: ShopCat, i: number) => {
    const g = GRENADES[id];
    const count = g.slot === "lethal" ? (wallet.lethal === id ? wallet.lethalCount : 0) : (wallet.tactical === id ? wallet.tacticalCount : 0);
    const max = g.slot === "lethal" ? ECONOMY.lethalMax : ECONOMY.tacticalMax;
    // „PEŁNO” only when the slot really is full; one of two reads „×1/2” after the name (the base
    // shop's „masz ×1 z 2”, in one word) and the tile's tag stays free for the real refusal.
    return tile(id, cat, i + 1, { carried: count > 0, v: verdict(id), price: g.price, have: count >= max ? "PEŁNO" : "", badge: count > 0 ? `×${count}/${max}` : undefined });
  };

  const gearTile = (id: ShopItemId, cat: ShopCat, i: number) => {
    if (isArmorId(id)) {
      const a = ARMOR[id as ArmorId];
      return tile(id, cat, i + 1, { carried: h.armor >= a.armor, v: verdict(id), price: a.price, have: "nosisz" });
    }
    const p = PERKS[id as PerkId];
    const active = perkActive(wallet.perks, id as PerkId, h.serverNow);
    // `perkTimed`, not `durationMs > 0`: a perk armed for the whole round (the Ostrzyżony's speed)
    // otherwise printed "działa jeszcze 999985 s", and — the other way round — a flask bought this
    // instant can measure a few ms OVER its own duration against the client's estimate of the
    // server clock, which without the slack in that rule would read "uzbrojone" on a perk that is
    // plainly counting down.
    const leftS = active && perkTimed(id as PerkId, wallet.perks[id as PerkId], h.serverNow)
      ? Math.max(1, Math.ceil((wallet.perks[id as PerkId] - h.serverNow) / 1000)) : null;
    return tile(id, cat, i + 1, { carried: active, v: verdict(id), price: p.price, have: leftS !== null ? `działa jeszcze ${leftS}s` : "uzbrojone" });
  };

  const aisle = (c: ShopCat) =>
    c <= 3 ? (cats[c] as WeaponId[]).map((id, i) => weaponTile(id, c, i))
    : c === 5 ? (cats[5] as GrenadeId[]).map((id, i) => grenadeTile(id, c, i))
    : cats[4].map((id, i) => gearTile(id, c, i));

  /** The strip's item: the tile under the mouse, else the gun in hand's slot (primary first). */
  const detailId: ShopItemId | null = focus ?? primary ?? secondary ?? null;
  const DetailArt = detailId ? SHOP_ART[detailId] : null;
  const killPay = cs && detailId && (isWeaponId(detailId) || (isGrenadeId(detailId) && GRENADES[detailId].slot === "lethal"))
    ? csKillReward(detailId) : 0;

  // The living arena's vote, as one line. The plan card (P3) stays mounted under the shop with F1 /
  // F2 live, so the keys printed here work; the defence sees the attack's vote without keys.
  const p = h.plan;
  const voting = !!p && p.options.length > 0 && p.chosen === 0 && h.phase === MatchPhase.Prep && h.serverNow < p.appliesAt;
  const myVote = voting && h.myTeam === p!.votingTeam;

  /** Every aisle's shelf has the same rows, the longest aisle's (at least five), so tiles line up across. */
  const rows = Math.max(5, ...SHOP_CATS.map((c) => cats[c].length));
  const countdown = !open ? "ZAMKNIĘTY" : left !== null ? `${left}s` : h.nearStation ? "PRZY LADZIE" : "OTWARTY";
  const armedCat = armed?.cat ?? null;

  return (
    <div className="shop" data-testid="shop" data-zone="shop" onContextMenu={(e) => e.preventDefault()}>
      <div className="shop-card">
        <div className="shop-head">
          <div className="shop-headline">
            <span className="shop-title">SKLEP</span>
            <b className="shop-wallet" data-testid="shop-money">{money(h.money)}</b>
            <b className={`shop-countdown${left !== null && left <= 5 && open ? " warn" : ""}${!open ? " shut" : ""}`} data-testid="shop-countdown">{countdown}</b>
          </div>
          {voting && (
            <div className="shop-plan" data-testid="shop-plan">
              <span className="shop-plan-label">{myVote ? "PLAN:" : "PLAN RYWALI:"}</span>
              {p!.options.map((id, i) => (
                <span key={id} className="shop-plan-opt">
                  {myVote && <kbd>F{i + 1}</kbd>}{planById(id)?.name ?? ""}<b>{p!.tally[i] ?? 0}</b>
                </span>
              ))}
            </div>
          )}
        </div>

        {boys && (
          <section className="boys-strip" data-testid="boys-picker">
            <span className="boys-strip-label">ROLA</span>
            <div className="boys-strip-row">
              {BOYS_CLASSES.map((id) => {
                const c = BOYS[id];
                const mates = h.players.filter((pl) => pl.connected && pl.team === h.myTeam && pl.boysClass === id).length;
                return (
                  <button key={id} className={`boys-chip ${h.nextClass === id ? "on" : ""}`} aria-pressed={h.nextClass === id}
                    data-testid={`boys-class-${id}`} title={c.blurb}
                    onClick={() => { uiSound("click"); api.selectClass?.(id); }}>
                    <b>{c.name}</b>
                    <span>{h.boysClass === id ? "AKTYWNA" : h.nextClass === id ? "OD ODRODZENIA" : `${mates} W DRUŻYNIE`}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className={`shop-grid${open ? "" : " shut"}`} data-testid="shop-grid" style={{ "--rows": rows } as CSSProperties}>
          {SHOP_CATS.map((c) => (
            <section key={c} className={`shop-aisle${armedCat === c ? " armed" : ""}`} aria-label={CAT_INFO[c].label}>
              <button className="shop-tab" aria-pressed={armedCat === c} data-testid={`shop-tab-${c}`}
                onClick={() => (armedCat === c ? setArmed(null) : arm(c, "click"))}>
                <kbd>{c}</kbd>{CAT_INFO[c].label}
              </button>
              <div className="shop-shelf">{aisle(c)}</div>
            </section>
          ))}
        </div>

        {detailId && DetailArt && (
          <div className="shop-detail" data-testid="shop-detail" title={itemStats(detailId).map((s) => `${s.label}: ${s.value}`).join(" · ")}>
            <span className="shop-detail-art" aria-hidden="true"><DetailArt /></span>
            <b className="shop-detail-name">{itemName(detailId)}</b>
            <span className="shop-detail-role">{ITEM_ROLE[detailId]}</span>
            {killPay > 0 && <b className="shop-detail-pay">+{money(killPay)} ZA ZABÓJSTWO</b>}
          </div>
        )}

        <div className="shop-foot">
          <span className={`shop-result${result ? (result.ok ? " ok" : " err") : armed ? " armed" : ""}`} data-testid="shop-result" role="status">
            {result
              ? (result.ok ? `✓ ${result.sold ? "Sprzedano" : "Kupiono"}: ${itemName(result.item)}` : `✕ ${REASONS[result.reason ?? "unknown"] ?? result.reason}`)
              : armed
                ? `${CAT_INFO[armed.cat].label} · naciśnij numer z kafelka`
                : cs ? ""
                  : `Zabójstwo ${money(ECONOMY.killReward)} · w głowę +${money(ECONOMY.headshotBonus)} · asysta ${money(ECONOMY.assistReward)}`}
          </span>
          <span className="shop-keys">
            <span><kbd>1–5</kbd> DZIAŁ</span>
            <span><kbd>0–9</kbd> PRZEDMIOT</span>
            <button className="shop-close" onClick={() => { uiSound("click"); api.close(); }} data-testid="shop-close"><kbd>B</kbd> ZAMKNIJ</button>
          </span>
        </div>
      </div>
    </div>
  );
}
