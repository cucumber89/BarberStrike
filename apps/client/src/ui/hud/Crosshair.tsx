import React, { memo } from "react";
import { GRENADES, perkActive, type WeaponId } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { pelletRing } from "../../game/combat/weaponFeel";
import type { Settings } from "../../settings";
import type { ZoneProps } from "./types";

/**
 * Drop U, P4 (docs/UI_U_SPEC.md §7 P4 WORK 4, §4.2): the aim point and the full-screen layers
 * around it.
 *
 * Zones: the crosshair, the cook ring, the sprint meter and the scope's breath hint are
 * `crosshair`; smoke, the damage arrow, the scope and flash (with the flask's haze) are full-screen
 * layers, `veil`, and they are siblings of the zone roots, never inside one. They render in three
 * pieces because the HUD paints its children in DOM order and none of them has a z-index: the smoke
 * under everything, the flash over nearly everything, exactly where `Hud.tsx` had them.
 *
 * The crosshair stays MOUNTED while I am dead: the §4.5 row `data-alive=false` hides it with the
 * §3.8 hide rule (corners.css), as it hides the rest of my corners, instead of unmounting it.
 */

/** Smoke in front of the eyes: the first child of the HUD, under every other piece of it. */
export const SmokeVeil = memo(function SmokeVeil(_props: ZoneProps) {
  const smokeOpacity = useHudSlice((s) => s.smokeOpacity);
  return smokeOpacity > 0 ? <div className="smoke-screen" data-zone="veil" data-testid="smoke-screen" style={{ opacity: smokeOpacity }} /> : null;
});

interface CrosshairProps extends ZoneProps {
  settings: Settings;
  /**
   * The HUD clock. The hit marker and the damage arrow age by `performance.now()`, so they need a
   * render to go away; before the split every store change and every clock tick re-rendered them,
   * and taking the clock keeps that cadence.
   */
  now: number;
}

/** The damage arrow, the crosshair, the cook ring, the sprint meter and the scope. */
export const Crosshair = memo(function Crosshair({ settings }: CrosshairProps) {
  const alive = useHudSlice((s) => s.alive);
  const pointerLocked = useHudSlice((s) => s.pointerLocked);
  const aiming = useHudSlice((s) => s.aiming);
  const weapon = useHudSlice((s) => s.weapon);
  const crosshairSpread = useHudSlice((s) => s.crosshairSpread);
  const serverNow = useHudSlice((s) => s.serverNow);
  const spawnProtectedUntil = useHudSlice((s) => s.spawnProtectedUntil);
  const hitAt = useHudSlice((s) => s.hitAt);
  const hitKill = useHudSlice((s) => s.hitKill);
  const hitHead = useHudSlice((s) => s.hitHead);
  const hitArmor = useHudSlice((s) => s.hitArmor);
  const damageAt = useHudSlice((s) => s.damageAt);
  const damageAngle = useHudSlice((s) => s.damageAngle);
  const cookingKind = useHudSlice((s) => s.cookingKind);
  const cooking = useHudSlice((s) => s.cooking);
  const tac = useHudSlice((s) => s.tac);
  const tacOn = useHudSlice((s) => s.tacOn);
  const scoped = useHudSlice((s) => s.scoped);
  const scopeStyle = useHudSlice((s) => s.scopeStyle);
  const breath = useHudSlice((s) => s.breath);
  /**
   * Rule G9: the cook ring belongs to the ONE grenade that cooks. A smoke, a flash, a molotov or a
   * knife is in the hand for the 180 ms of the wind-up and never cooks, so the ring it used to draw
   * was an empty circle — and it cost the crosshair for exactly the moment the throw is aimed. Only
   * the frag replaces the crosshair now; everything else is thrown with the sight you aim with.
   */
  const cookRing = cookingKind !== "" && GRENADES[cookingKind].cookable;
  const hitAge = performance.now() - hitAt;
  const dmgAge = performance.now() - damageAt;
  // Crosshair gap grows with the effective spread (radians → px at the current FOV). Clamped for readability.
  const ch = settings.hud.crosshair;
  // The gap is the player's own resting gap, opened by the real spread when they asked for that.
  const gap = ch.dynamic ? Math.round(Math.min(34, ch.gap + crosshairSpread * 900)) : ch.gap;
  // C1 (matrix): pellet weapons show the true cone as a ring, uncapped — the gap above stops at
  // 34 px, and the S12's cone is roughly 50.
  const spreadRing = pelletRing(weapon as WeaponId) ? Math.round(crosshairSpread * 900) : null;
  const protectedNow = alive && spawnProtectedUntil > serverNow;
  return (
    <>
      {/* Damage vignette / direction */}
      {dmgAge < 600 && <div className="damage-dir" data-zone="veil" style={{ transform: `rotate(${damageAngle}rad)`, opacity: 1 - dmgAge / 600 }} />}

      {/* Crosshair (hidden in ADS, and while a frag cooks: there the ring takes its place).
          Shape, size, thickness, gap and colour come from the player's own settings — this is the
          one piece of UI they look at every second of the match. */}
      {pointerLocked && !aiming && !cookRing && (
        <div
          className={`crosshair ch-${ch.style} ${ch.outline ? "outlined" : ""} ${hitAge < 180 ? (hitKill ? "kill" : hitHead ? "head" : hitArmor ? "armor" : "hit") : ""} ${protectedNow ? "shield" : ""}`}
          data-zone="crosshair"
          data-testid="crosshair"
          style={{ "--gap": `${gap}px`, "--len": `${ch.size}px`, "--gap-n": gap, "--len-n": ch.size, "--w": `${ch.thickness}px`, "--ch-color": ch.color } as React.CSSProperties}
        >
          {ch.style !== "dot" && ch.style !== "circle" && <><span className="ch-top" /><span className="ch-bottom" /><span className="ch-left" /><span className="ch-right" /></>}
          {ch.style === "circle" && <span className="ch-circle" />}
          {(ch.style === "dot" || ch.style === "cross-dot") && <span className="ch-dot" />}
          {/* C1: a pellet gun's cone is far wider than the 34 px the four lines can open to, so the
              S12 draws the real radius as a ring. Four lines that stopped growing told the player
              nothing about where nine pellets were actually going. */}
          {spreadRing !== null && <span className="ch-ring" style={{ "--r": `${spreadRing}px` } as React.CSSProperties} />}
          {hitAge < 180 && <span className="hitmarker" />}
          {protectedNow && <span className="ch-shield" />}
        </div>
      )}
      {alive && cookRing && (
        <div className="cook" data-zone="crosshair" data-testid="cook" style={{ "--p": `${Math.round(cooking * 100)}%` } as React.CSSProperties} />
      )}
      {/* Tactical sprint budget (drop 4): only while it is running or refilling */}
      {alive && pointerLocked && (tacOn || tac < 0.98) && (
        <div className={`tac-meter ${tacOn ? "on" : ""} ${tac <= 0.01 ? "empty" : ""}`} data-zone="crosshair" data-testid="tac"><div className="tac-fill" style={{ "--v": tac } as React.CSSProperties} /></div>
      )}
      {/* Scope (drop 3): black mask with a round window, a reticle, breath meter.
          Drop B / D-B2: the SR-50 keeps the full tube; the M-1 gets a light ring that leaves most
          of the view clear and has no breath to hold, so the two long rifles are not one weapon
          shown twice. */}
      {alive && scoped && (
        <div className={`scope ${scopeStyle === "ring" ? "ring" : ""}`} data-zone="veil" data-testid="scope" data-style={scopeStyle ?? ""}>
          <div className="scope-mask" />
          <div className={`scope-reticle ${hitAge < 180 ? "hit" : ""}`}><span className="v" /><span className="hz" /><span className="dot" /></div>
        </div>
      )}
      {/* The SR-50's breath: „[SHIFT] WSTRZYMAJ ODDECH” at t1 with the bar UNDER the words (§5.2
          row 44), in the `crosshair` zone beside the scope veil, not inside it. Out of breath it
          reads „ZADYSZKA” over an empty bar. */}
      {alive && scoped && scopeStyle === "tube" && (
        <div className="breath" data-zone="crosshair" data-spent={breath <= 0 || undefined}>
          <span className="breath-line">{breath <= 0 ? "ZADYSZKA" : <><kbd className="breath-key">SHIFT</kbd> WSTRZYMAJ ODDECH</>}</span>
          <span className="breath-bar"><span className="breath-fill" style={{ "--v": Math.max(0, Math.min(1, breath)) } as React.CSSProperties} /></span>
        </div>
      )}
    </>
  );
});

/** The flask's blurred edges and flash blindness: over everything but the cards and the menus. */
export const FlashVeil = memo(function FlashVeil({ now }: ZoneProps & { now: number }) {
  // `activePerks.includes("flask")` in `Hud.tsx`: the flask is in PERK_ORDER, so it is this.
  const flaskLeft = useHudSlice((s) => (s.alive && perkActive(s.perks, "flask", s.serverNow) ? s.perks.flask - s.serverNow : null));
  const flashUntil = useHudSlice((s) => s.flashUntil);
  const flashAt = useHudSlice((s) => s.flashAt);
  const flashStrength = useHudSlice((s) => s.flashStrength);
  // Flash: full white, then a fade whose length scales with the strength (the last third is a haze).
  const flashLeft = flashUntil - now;
  const flashTotal = Math.max(1, flashUntil - flashAt);
  const flashOpacity = flashLeft > 0 ? Math.min(1, (flashLeft / flashTotal) * 1.6) * (0.35 + 0.65 * flashStrength) : 0;
  return (
    <>
      {/* Flask (drop 3): the promised blurry edges. Rule P5: they used to switch off between two
          frames, 25 s after the bottle — the screen cleared and nothing said the 20 % resistance
          had gone with it. The haze now thins over the last four seconds, so the perk ending is
          something the player SEES rather than something they find out by dying. */}
      {flaskLeft !== null && (
        <div className="flask-haze" data-zone="veil" style={{ "--v": Math.max(0.15, Math.min(1, flaskLeft / 4000)) } as React.CSSProperties} />
      )}
      {/* Flash blindness (above everything but the menus) */}
      {flashOpacity > 0.01 && <div className="flash-out" data-zone="veil" data-testid="flash" style={{ opacity: flashOpacity }} />}
    </>
  );
});
