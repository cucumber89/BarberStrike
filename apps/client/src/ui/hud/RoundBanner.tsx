import { Fragment, memo, useLayoutEffect, useRef, useState } from "react";
import { DUEL, MatchPhase, type Team } from "@frankibarber/shared";
import { useHud, type HudState } from "../../game/store";
import { roundBannerCopy, turniejPair, type BannerCopy, type RoundBannerCopy } from "./roundText";
import type { PhaseModel } from "./phase";
import type { ZoneProps } from "./types";

/**
 * Drop U, P5: the banner (docs/UI_U_SPEC.md §3.7) and the round-end card drawn in it.
 *
 * `BannerFrame` is every banner's shape: a full-width band (zone `veil`) and, centred on it, the
 * content box (zone `banner`) with exactly three rows — the eyebrow chips (t1), the title (t5, one
 * line) and one line (t2) whose parts are joined with „ · ”. The band and the box are siblings in a
 * stage that has no zone, so zones never nest and the band is exactly as tall as the box.
 *
 * `RoundBanner({h, model?, standalone?})` is the frozen standalone signature `uiFit.tsx` mounts
 * (§7.0): the round-end card for the state `h`, classes `round-end` plus `mine` / `theirs` /
 * `even` / `watch` (`multiplayer.spec.ts:160-163`). In the HUD, `<Moments>` decides when it shows
 * (the moment bus, `bus.ts`) and mounts it; `standalone` draws it with no timing at all.
 */

/**
 * A title longer than this does not fit the banner box at t5 in Bebas Neue (measured at 1600×900:
 * „RUNDA DLA OCALENI”, 17, is 543 of the box's 576 px), so it is set at t4 instead. Wide glyphs can
 * overflow sooner („RUNDA DLA WWWWWWW” is 658 px): the frame measures its title once the display
 * face is loaded, and drops to t4 whenever it does not fit.
 */
const LONG_TITLE = 17;

export function BannerFrame({ copy, testid, className, glow }: { copy: BannerCopy; testid: string; className?: string; glow?: boolean }) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState<string | null>(null);
  const long = copy.title.length > LONG_TITLE || overflows === copy.title;
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || long) return;
    const check = () => { if (el.isConnected && el.scrollWidth > el.clientWidth + 1) setOverflows(copy.title); };
    // Measured in Bebas Neue only: a fallback face is wider, and would drop a title that fits.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts || fonts.status === "loaded") { check(); return; }
    let live = true;
    void fonts.ready.then(() => { if (live) check(); });
    return () => { live = false; };
  }, [copy.title, long]);
  return (
    <div className="moment-stage">
      <div className={`moment-band rule-${copy.rule}`} data-zone="veil" aria-hidden="true" />
      <div className={`moment-banner${className ? ` ${className}` : ""}`} data-zone="banner" data-testid={testid} role="status">
        <div className={`mb-eyebrow${glow ? " glow" : ""}`}>
          {copy.eyebrow.map((c) => <span key={c.text} className={`mb-chip tone-${c.tone}`}>{c.text}</span>)}
        </div>
        <div ref={titleRef} className={`mb-title tone-${copy.titleTone}${long ? " long" : ""}`}>{copy.title}</div>
        <div className="mb-line">
          {copy.line.map((p, i) => (
            <Fragment key={p.text}>
              {i > 0 && <span className="mb-sep" aria-hidden="true"> · </span>}
              <span className={p.testid ? `mb-part ${p.testid}` : "mb-part"} data-testid={p.testid}>{p.text}</span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The round-end card's words for a state: the round's result and winner, the pair in turniej
 * (and whether I only watch it), the carry, the side swap, the MVP; at the match's end (Ended,
 * stage A) the final-round form. Null when the state does not say who took the round.
 */
export function roundBannerOf(h: HudState, model?: PhaseModel): RoundBannerCopy | null {
  const pair = h.mode === "turniej" ? turniejPair(h.bracket) : null;
  const myName = h.players.find((p) => p.id === h.myId)?.name ?? "";
  const duel = h.mode === "duel" || h.mode === "turniej";
  return roundBannerCopy({
    mode: h.mode, result: h.roundResult, roundWinner: h.roundWinner,
    attackTeam: h.bomb ? (h.bomb.attackTeam as Team) : -1, myTeam: h.myTeam,
    names: pair?.names ?? null, watching: !!pair && !!myName && !pair.names.includes(myName),
    alive: h.alive,
    sideSwap: model ? model.sideSwap : duel && h.round > 0 && h.round % DUEL.halfRounds === 0,
    mvp: h.roundMvp,
    final: model ? model.moment === "ended" : h.phase === MatchPhase.Ended,
  });
}

export function RoundBanner({ h, model }: { h: HudState; model?: PhaseModel; standalone?: boolean }) {
  const copy = roundBannerOf(h, model);
  if (!copy) return null;
  const final = model ? model.moment === "ended" : h.phase === MatchPhase.Ended;
  return <BannerFrame copy={copy} testid="round-end" className={`round-end ${copy.cls}${final ? " final" : ""}`} />;
}

/** The HUD's live round-end card: the whole state (the MVP may land a moment after the break). */
export function RoundBannerLive({ model }: ZoneProps) {
  const h = useHud();
  return <RoundBanner h={h} model={model} />;
}

/**
 * `Hud.tsx` (frozen) still mounts the round banner's old layer here. The card now shows only when
 * the moment bus gives it the banner slot, so `<Moments>` mounts it; this mount draws nothing.
 */
export const RoundBannerLayer = memo(function RoundBannerLayer(_props: ZoneProps) {
  return null;
});
