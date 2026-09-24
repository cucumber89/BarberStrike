import { memo } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P5): the match's moments — the flag notice and the reconnect line (zone
 * `alert`) and the countdown digit (zone `banner`). Moved out of `Hud.tsx` verbatim
 * (docs/UI_U_SPEC.md §7 P0 0d, §4.2). `FlagNotice` and `Moments` mount at the two places they
 * had in the HUD's paint order.
 */

/** A flag changed hands (drop 4): 2.6 s, fading over the last half second. */
export const FlagNotice = memo(function FlagNotice({ now }: ZoneProps & { now: number }) {
  const flagNotice = useHudSlice((s) => s.flagNotice);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const noticeAge = flagNotice ? now - flagNotice.at : Infinity;
  if (!(flagNotice && noticeAge < 2600 && !ended)) return null;
  return (
    <div className={`flag-notice t${flagNotice.team}`} data-zone="alert" data-testid="flag-notice" style={{ opacity: Math.min(1, (2600 - noticeAge) / 500) }}>{flagNotice.text}</div>
  );
});

/** The countdown's digit, 0 outside the countdown: it changes once a second, not per snapshot. */
const countdownOf = (h: HudState): number =>
  h.phase === MatchPhase.Countdown ? Math.max(1, Math.ceil((h.phaseEndsAt ? h.phaseEndsAt - h.serverNow : 0) / 1000)) : 0;

/** The lost connection, and the countdown. */
export const Moments = memo(function Moments(_props: ZoneProps) {
  const reconnecting = useHudSlice((s) => s.reconnecting);
  const countdown = useHudSlice(countdownOf);
  return (
    <>
      {reconnecting && <div className="reconnect" data-zone="alert" data-testid="reconnecting">UTRACONO POŁĄCZENIE · ŁĄCZĘ PONOWNIE…</div>}

      {/* Countdown */}
      {countdown > 0 && (
        <div className="center-msg countdown" data-zone="banner" data-testid="countdown">{countdown}</div>
      )}
    </>
  );
});
