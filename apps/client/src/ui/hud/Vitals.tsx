import React, { memo, useRef } from "react";
import { boysClass, MatchPhase, OSTRZYZENI, PERKS, PERK_EFFECT, PERK_ORDER, PLAYER, SPAWN_PROTECTION_MS, perkActive, perkTimed } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P4): the bottom-left corner — health and armour (zone `vitals`) and the
 * perk list (zone `perks`), moved out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 */

/**
 * The bar is a fraction of what THIS player can hold: a Boys class, an Ostrzyżony's bigger pool,
 * or the ordinary hundred. Without this a 220 HP chaser draws a bar twice the width of its box.
 */
const maxHealthOf = (h: HudState): number => h.mode === "boys" ? boysClass(h.boysClass).health
  : h.mode === "ostrzyzeni" && !!h.players.find((r) => r.id === h.myId)?.shaved ? OSTRZYZENI.shavedHealth
  : PLAYER.maxHealth;

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
  const protectedNow = alive && spawnProtectedUntil > serverNow;
  const activePerks = PERK_ORDER.filter((id) => perkActive(perks, id, serverNow));
  /**
   * Rule P2: the steroids' two-second gate, in words. Regeneration only starts after
   * `PERK_EFFECT.roidsDelayMs` without a hit, and nothing on the screen said so — so a player who
   * bought the perk, traded shots, and watched their health sit at 40 concluded the perk was
   * broken. The row now reads either the gate counting down or the rate it is actually healing at.
   */
  const roidsHeldMs = Math.max(0, PERK_EFFECT.roidsDelayMs - (performance.now() - damageAt));
  /**
   * Rule P5 / the fade receipt: a fade is spent at the instant you respawn, so it never appears in
   * the perk list and the only thing the player gets for their 300 zł is a shield twice as long as
   * everyone else's. `protectedUntil` is the only evidence, and it cannot simply be compared with
   * SPAWN_PROTECTION_MS: a shield granted inside a freeze starts counting from the RELEASE, so the
   * remaining time is the whole freeze plus the shield. Hence both guards — not in Prep, and the
   * remainder inside the band only a fade can produce — and a latch on the deadline itself, so the
   * badge stays up for the full three seconds rather than the first part of them.
   */
  const fadeSeen = useRef(0);
  if (phase !== MatchPhase.Prep && spawnProtectedUntil - serverNow > SPAWN_PROTECTION_MS + 400
      && spawnProtectedUntil - serverNow <= PERK_EFFECT.fadeShieldMs + 400) fadeSeen.current = spawnProtectedUntil;
  const fadeShield = protectedNow && fadeSeen.current === spawnProtectedUntil;
  const brokeAge = now - armorBrokeAt;
  return (
    <>
      {/* Bottom-left: health */}
      <div className={`health hp-${health / maxHealth > 0.6 ? "ok" : health / maxHealth > 0.3 ? "hurt" : "critical"}`} data-zone="vitals" data-testid="health">
        <div className="health-num">{health}</div>
        <div className="health-bars">
          <div className="health-bar"><div className="health-fill" style={{ "--v": health / maxHealth } as React.CSSProperties} /></div>
          {armor > 0 && <div className="armor-bar"><div className="armor-fill" style={{ "--v": armor / 100 } as React.CSSProperties} /></div>}
        </div>
        {(armor > 0 || brokeAge < 900) && <div className={`armor-num ${brokeAge < 900 ? "broke" : ""}`} data-testid="armor">🛡 {brokeAge < 900 && armor === 0 ? "ZNISZCZONA" : armor}</div>}
      </div>
      {(activePerks.length > 0 || fadeShield) && (
        <div className="perk-list" data-zone="perks" data-testid="perks">
          {activePerks.map((id) => {
            const p = PERKS[id];
            const leftMs = perks[id] - serverNow;
            // Armed-for-the-round versus counting down: one rule, in `perkTimed`, because the shop
            // row for the same perk has to read the same way and used to decide it separately.
            const timed = perkTimed(id, perks[id], serverNow);
            const frac = timed ? Math.max(0, Math.min(1, leftMs / p.durationMs)) : 1;
            // Rule P1: the last five seconds are the ones worth knowing about — a flask running out
            // in the middle of a fight changes what you can walk into. The bar shrank towards it
            // and said nothing.
            const ending = timed && leftMs <= 5000;
            const note = id === "roids" ? (roidsHeldMs > 0 ? `CZEKA ${Math.ceil(roidsHeldMs / 1000)}s` : `+${PERK_EFFECT.roidsRegenPerSec}/s`) : "";
            return (
              <div key={id} className={`perk perk-${id} ${ending ? "ending" : ""} ${note && roidsHeldMs > 0 ? "held" : ""}`} title={p.blurb}>
                <span className="perk-glyph">{p.glyph}</span>
                <span className="perk-name">{p.name.toUpperCase()}</span>
                {note && <span className="perk-note">{note}</span>}
                <span className="perk-time">{timed ? `${Math.max(0, Math.ceil(leftMs / 1000))}s` : "UZBROJONE"}</span>
                <span className="perk-bar" style={{ "--v": frac } as React.CSSProperties} />
              </div>
            );
          })}
          {fadeShield && (
            <div className="perk perk-fade" data-testid="perk-shield" title={PERKS.fade.blurb}>
              <span className="perk-glyph">🛡</span>
              <span className="perk-name">ŚWIEŻY FADE</span>
              <span className="perk-note">TARCZA</span>
              <span className="perk-time">{Math.max(0, Math.ceil((spawnProtectedUntil - serverNow) / 1000))}s</span>
              <span className="perk-bar" style={{ "--v": Math.max(0, Math.min(1, (spawnProtectedUntil - serverNow) / PERK_EFFECT.fadeShieldMs)) } as React.CSSProperties} />
            </div>
          )}
        </div>
      )}
    </>
  );
});
