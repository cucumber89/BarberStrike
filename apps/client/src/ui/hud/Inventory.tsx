import React, { memo, useEffect, useReducer, useRef, useState } from "react";
import { GRENADES, WEAPONS, killerName, type GrenadeId, type ShopItemId, type WeaponId } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { SHOP_ART } from "../shopArt";
import { upperPl } from "./format";
import { IconBomb } from "./icons";
import type { ZoneProps } from "./types";

/**
 * Drop U, P4 (docs/UI_U_SPEC.md §7 P4 WORK 2, §4.2): the bottom-right corner as CS2 draws it.
 * - zone `inv`: one 240×64 plate, the weapon's silhouette, the magazine at t4 and „/ 90” at t2.
 *   It is the same width in every state: a reload dims the magazine and runs a 3 px bar, it never
 *   swaps the digits for PRZEŁADOWANIE (the plate used to jump from ~130 to ~240 px).
 * - zone `gear`: only what I carry — a 13 px keycap, the grenade's silhouette and ×N — and the C4
 *   with [T] when the bomb is mine, blinking on a site. Empty slots are `display: none`; the
 *   `slot-lethal` / `slot-tactical` testids stay in the DOM.
 * - zone `weapon`: the weapon's name at t1 for a moment after a switch (`lastSwitchAt`).
 *
 * Nothing here is a CSS animation longer than the gallery's 600 ms (Principle 11): the reload bar
 * is drawn from the clock at 10 Hz, and the name leaves by a timer and the §3.8 hide transition.
 */

/** The weapon name's moment (§6.1 "Weapon switch"): in 120 ms, held, gone at 1620 after its 300 ms out. */
const NAME_IN_MS = 120;
const NAME_HOLD_MS = 1_200;
const NAME_ON_MS = NAME_IN_MS + NAME_HOLD_MS;
/** How long the outgoing silhouette stays while the new one fades in (the cross-fade). */
const SWAP_MS = 120;
/** How often the reload bar is redrawn while a reload runs (each step eased by a 100 ms transition). */
const RELOAD_TICK_MS = 100;
/** A magazine at or under this fraction of its size is low (warn); empty is danger. */
const LOW_MAG = 0.25;

/** The silhouette of anything the shop sells, or its short name when there is none. */
function Art({ id, className }: { id: string; className?: string }) {
  const Draw = (SHOP_ART as Record<string, (() => React.ReactElement) | undefined>)[id];
  return <span className={className}>{Draw ? <Draw /> : <span className="art-name">{killerName(id).split(" ")[0]}</span>}</span>;
}

/** Re-render once, `ms` from now (a moment that ends, a bar that moves). */
function useWake(ms: number | null): void {
  const [, wake] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (ms === null) return;
    const t = window.setTimeout(wake, Math.max(16, ms));
    return () => window.clearTimeout(t);
  }, [ms]);
}

/**
 * The reload's progress 0..1. The store says only THAT a reload runs, so the start is latched the
 * render it begins (per weapon: a switch cancels a reload), and the bar is redrawn at 10 Hz.
 */
function useReloadFrac(reloading: boolean, weapon: string, ms: number): number {
  const start = useRef<{ weapon: string; at: number } | null>(null);
  if (!reloading) start.current = null;
  else if (start.current?.weapon !== weapon) start.current = { weapon, at: performance.now() };
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!reloading) return;
    const t = window.setInterval(tick, RELOAD_TICK_MS);
    return () => window.clearInterval(t);
  }, [reloading]);
  return start.current && ms > 0 ? Math.max(0, Math.min(1, (performance.now() - start.current.at) / ms)) : 0;
}

/** The last weapon for `SWAP_MS` after a switch, so the two silhouettes cross-fade. */
function usePrevious(weapon: string): string | null {
  const [prev, setPrev] = useState<{ from: string; to: string } | null>(null);
  const last = useRef(weapon);
  useEffect(() => {
    if (last.current === weapon) return;
    setPrev({ from: last.current, to: weapon });
    last.current = weapon;
    const t = window.setTimeout(() => setPrev(null), SWAP_MS);
    return () => window.clearTimeout(t);
  }, [weapon]);
  return prev && prev.to === weapon ? prev.from : null;
}

/** One grenade slot: hidden (`display: none`) while empty, the testid always in the DOM. */
function Slot({ testId, keyCap, id, count, cooking }: { testId: string; keyCap: string; id: GrenadeId | ""; count: number; cooking: boolean }) {
  return (
    <div className="gear-item" data-testid={testId} data-empty={!id || undefined} data-cooking={cooking || undefined}
      aria-label={id ? GRENADES[id].name : undefined}>
      <kbd className="p4-key">{keyCap}</kbd>
      {id && <Art id={id} className="gear-art" />}
      {id && count > 1 && <span className="gear-n">×{count}</span>}
    </div>
  );
}

/** Zone `weapon`: the new weapon's name, uppercased in JS („P9 STRAIGHT RAZOR”), for 1500 ms. */
function WeaponName({ weapon, at }: { weapon: WeaponId; at: number }) {
  const age = performance.now() - at;
  const on = at > 0 && age < NAME_ON_MS;
  useWake(on ? NAME_ON_MS - age : null);
  if (!at) return null;
  return (
    <div key={at} className="weapon-name" data-zone="weapon" data-testid="weapon-name" data-on={on || undefined}>
      {upperPl(WEAPONS[weapon].name)}
    </div>
  );
}

export const Inventory = memo(function Inventory(_props: ZoneProps) {
  const lethal = useHudSlice((s) => s.lethal);
  const lethalCount = useHudSlice((s) => s.lethalCount);
  const tactical = useHudSlice((s) => s.tactical);
  const tacticalCount = useHudSlice((s) => s.tacticalCount);
  const cookingKind = useHudSlice((s) => s.cookingKind);
  const weapon = useHudSlice((s) => s.weapon);
  const ammo = useHudSlice((s) => s.ammo);
  const reserve = useHudSlice((s) => s.reserve);
  const reloading = useHudSlice((s) => s.reloading);
  const lastSwitchAt = useHudSlice((s) => s.lastSwitchAt);
  const carrier = useHudSlice((s) => !!s.bomb && s.bomb.stage === "carried" && s.bomb.carrier !== "" && s.bomb.carrier === s.myId);
  const siteHere = useHudSlice((s) => s.siteHere);
  const w = WEAPONS[weapon];
  const melee = w.kind === "melee";
  const frac = useReloadFrac(reloading && !melee, weapon, w.reloadMs);
  const prev = usePrevious(weapon);
  const mag = melee ? "" : ammo === 0 ? "empty" : ammo <= w.magazine * LOW_MAG ? "low" : "";
  const cookingSlot = cookingKind ? GRENADES[cookingKind].slot : "";
  const nothing = !lethal && !tactical && !carrier;
  return (
    <>
      <div className="gear" data-zone="gear" data-testid="gear" data-none={nothing || undefined}>
        <Slot testId="slot-lethal" keyCap="G" id={lethal} count={lethalCount} cooking={cookingSlot === "lethal"} />
        <Slot testId="slot-tactical" keyCap="4" id={tactical} count={tacticalCount} cooking={cookingSlot === "tactical"} />
        {carrier && (
          <div className="gear-item" data-testid="c4" data-site={siteHere || undefined} aria-label={siteHere ? `ŁADUNEK · PUNKT ${siteHere}` : "ŁADUNEK"}>
            <kbd className="p4-key">T</kbd>
            <IconBomb className="gear-c4" size={22} />
          </div>
        )}
      </div>
      <WeaponName weapon={weapon} at={lastSwitchAt} />
      <div className="ammo" data-zone="inv" data-testid="ammo" data-reloading={(reloading && !melee) || undefined} data-mag={mag || undefined}>
        <span className="ammo-art" aria-label={w.name} role="img">
          {prev && <Art key={`out-${prev}`} id={prev as ShopItemId} className="ammo-gun out" />}
          <Art key={weapon} id={weapon} className={`ammo-gun${prev ? " in" : ""}`} />
        </span>
        <span className="ammo-count">
          <span className="mag">{melee ? "∞" : ammo}</span>
          {!melee && <span className="res"><span className="sep">/</span> {reserve}</span>}
        </span>
        {reloading && !melee && (
          <span className="ammo-reload"><span className="ammo-reload-fill" style={{ "--v": frac } as React.CSSProperties} /></span>
        )}
      </div>
    </>
  );
});
