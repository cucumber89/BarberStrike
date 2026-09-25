import React, { memo, useRef } from "react";
import { boysClass, MatchPhase, OSTRZYZENI, PERKS, PERK_EFFECT, PERK_ORDER, PLAYER, SPAWN_PROTECTION_MS, perkActive, perkTimed } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import { SHOP_ART } from "../shopArt";
import { upperPl } from "./format";
import { IconBubble, IconCross, IconPlate } from "./icons";
import type { ZoneProps } from "./types";

/**
 * Drop U, P4 (docs/UI_U_SPEC.md §7 P4 WORK 1, §4.2): the bottom-left corner as CS2 draws it — one
 * 300×64 plate with the cross and the health at t4 over a 132×4 bar, the plate icon and the armour
 * at t3 beside it (zone `vitals`), and above it a row of 36×36 perk chips (zone `perks`).
 *
 * Words are the budget (§5.1: vitals ≤ 2, ≤ 4 with the Boys class; perks ≤ 2 per chip), so every
 * state that used to be a caption is now a shape or a colour:
 * - „ZNISZCZONA” is a greyed, cracked plate for 900 ms;
 * - the steroids' „CZEKA 2s” / „+6/s” is the ring's colour (grey while the gate holds);
 * - „UZBROJONE” and „TARCZA” are the full ring and the bubble icon;
 * - a perk's name is `sr-only` text at t1, uppercased here (e2e reads „FLASZKA”, :465).
 */

/**
 * The bar is a fraction of what THIS player can hold: a Boys class, an Ostrzyżony's bigger pool,
 * or the ordinary hundred. Without this a 220 HP chaser draws a bar twice the width of its box.
 */
const maxHealthOf = (h: HudState): number => h.mode === "boys" ? boysClass(h.boysClass).health
  : h.mode === "ostrzyzeni" && !!h.players.find((r) => r.id === h.myId)?.shaved ? OSTRZYZENI.shavedHealth
  : PLAYER.maxHealth;

/** How long a broken plate stays on the plate as a greyed, cracked icon (§5.2 row 43). */
const BROKE_MS = 900;
/** A timed perk shows its seconds only in its last five (Rule P1: the ones worth knowing about). */
const ENDING_MS = 5_000;

/** Health as a band: the colour is the reading (ok above 60 %, hurt above 30 %, critical below). */
type HealthBand = "ok" | "hurt" | "critical";
const healthBand = (health: number, max: number): HealthBand =>
  health / max > 0.6 ? "ok" : health / max > 0.3 ? "hurt" : "critical";

/** The Boys header: the class, and the next one only when it differs („Assault → Medic”). */
const boysHeader = (cls: number, next: number): string => {
  const now = boysClass(cls).name;
  const then = boysClass(next).name;
  return then === now ? now : `${now} → ${then}`;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** One 36×36 chip: a glyph inside a ring that drains with the time left, digits only at the end. */
function Chip({ kind, frac, secs, gated, name, label, testId, children }: {
  kind: string; frac: number; secs: number | null; gated?: boolean; name?: string; label?: string; testId?: string; children: React.ReactNode;
}) {
  return (
    <div className="perk" data-perk={kind} data-ending={secs !== null || undefined} data-gated={gated || undefined} data-testid={testId}>
      <span className="perk-ring" style={{ "--v": frac } as React.CSSProperties} role={label ? "img" : undefined} aria-label={label}>{children}</span>
      {name && <span className="p4-sr">{name}</span>}
      {secs !== null && <span className="perk-secs">{secs}</span>}
    </div>
  );
}

export const Vitals = memo(function Vitals({ now }: ZoneProps & { now: number }) {
  const health = useHudSlice((s) => s.health);
  const maxHealth = useHudSlice(maxHealthOf);
  const armor = useHudSlice((s) => s.armor);
  const armorBrokeAt = useHudSlice((s) => s.armorBrokeAt);
  const perks = useHudSlice((s) => s.perks);
  const serverNow = useHudSlice((s) => s.serverNow);
  const damageAt = useHudSlice((s) => s.damageAt);
  const phase = useHudSlice((s) => s.phase);
  const alive = useHudSlice((s) => s.alive);
  const spawnProtectedUntil = useHudSlice((s) => s.spawnProtectedUntil);
  const boys = useHudSlice((s) => s.mode === "boys");
  const cls = useHudSlice((s) => s.boysClass);
  const nextCls = useHudSlice((s) => s.nextClass);
  const protectedNow = alive && spawnProtectedUntil > serverNow;
  const activePerks = PERK_ORDER.filter((id) => perkActive(perks, id, serverNow));
  /**
   * Rule P2: the steroids' two-second gate. Regeneration only starts `PERK_EFFECT.roidsDelayMs`
   * after the last hit; a player who traded shots and watched their health sit still concluded the
   * perk was broken. The ring says it now: grey while the gate holds, coloured while it heals.
   */
  const roidsHeld = PERK_EFFECT.roidsDelayMs - (performance.now() - damageAt) > 0;
  /**
   * Rule P5 / the fade receipt: a fade is spent at the instant you respawn, so it never appears in
   * the perk list and the only thing the player gets for their 300 zł is a shield twice as long as
   * everyone else's. `protectedUntil` is the only evidence, and it cannot simply be compared with
   * SPAWN_PROTECTION_MS: a shield granted inside a freeze starts counting from the RELEASE, so the
   * remaining time is the whole freeze plus the shield. Hence both guards — not in Prep, and the
   * remainder inside the band only a fade can produce — and a latch on the deadline itself, so the
   * chip stays up for the full three seconds rather than the first part of them.
   */
  const fadeSeen = useRef(0);
  if (phase !== MatchPhase.Prep && spawnProtectedUntil - serverNow > SPAWN_PROTECTION_MS + 400
      && spawnProtectedUntil - serverNow <= PERK_EFFECT.fadeShieldMs + 400) fadeSeen.current = spawnProtectedUntil;
  const fadeShield = protectedNow && fadeSeen.current === spawnProtectedUntil;
  const broke = armor === 0 && now - armorBrokeAt < BROKE_MS;
  const band = healthBand(health, maxHealth);
  return (
    <>
      <div className="vitals" data-zone="vitals" data-testid="health" data-band={band}>
        <div className="vt-hp">
          <div className="vt-hp-row">
            <IconCross className="vt-cross" size={20} />
            <span className="vt-num">{health}</span>
          </div>
          <div className="vt-bar"><div className="vt-fill" style={{ "--v": clamp01(health / maxHealth) } as React.CSSProperties} /></div>
        </div>
        <div className="vt-side">
          {boys && <div className="vt-class">{boysHeader(cls, nextCls)}</div>}
          {(armor > 0 || broke) && (
            <div className="armor" data-testid="armor" data-broke={broke || undefined} aria-label={broke ? "PŁYTA ROZBITA" : undefined}>
              <span className="armor-icon">
                <IconPlate size={24} />
                {broke && (
                  <svg className="armor-crack" viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" focusable="false">
                    <path d="M13 3.5 10.5 9l3 2.5-3.5 4 2 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              {armor > 0 && <span className="armor-num">{armor}</span>}
            </div>
          )}
        </div>
      </div>
      {(activePerks.length > 0 || fadeShield) && (
        <div className="perks" data-zone="perks" data-testid="perks">
          {activePerks.map((id) => {
            const p = PERKS[id];
            const leftMs = perks[id] - serverNow;
            // Armed-for-the-round versus counting down: one rule, in `perkTimed`, because the shop
            // row for the same perk has to read the same way and used to decide it separately.
            const timed = perkTimed(id, perks[id], serverNow);
            const Art = SHOP_ART[id];
            return (
              <Chip key={id} kind={id} name={upperPl(p.name)} gated={id === "roids" && roidsHeld}
                frac={timed ? clamp01(leftMs / p.durationMs) : 1}
                secs={timed && leftMs <= ENDING_MS ? Math.max(0, Math.ceil(leftMs / 1000)) : null}>
                <Art />
              </Chip>
            );
          })}
          {fadeShield && (
            <Chip kind="shield" testId="perk-shield" label={`${upperPl(PERKS.fade.name)} · OSŁONA`}
              frac={clamp01((spawnProtectedUntil - serverNow) / PERK_EFFECT.fadeShieldMs)}
              secs={Math.max(0, Math.ceil((spawnProtectedUntil - serverNow) / 1000))}>
              <IconBubble size={20} />
            </Chip>
          )}
        </div>
      )}
    </>
  );
});
