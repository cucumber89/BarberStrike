import { memo } from "react";
import { MatchPhase, killerName } from "@frankibarber/shared";
import { useHudSlice, type HudState } from "../../game/store";
import { standing } from "../Bracket";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P1): the death screen, moved out of `Hud.tsx` verbatim
 * (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 *
 * Today's `.death` is one full-screen element: a 55 % black backdrop with the card's lines
 * centred in it. The backdrop is a full-screen layer, so it is now its own `veil` element, and the
 * lines are the `death` zone root beside it — never inside it. Both carry `.death`, so the layout
 * is the same box; the card's own background is cleared inline, so the black is laid down once,
 * exactly as before. P1 replaces both (death.css).
 */
export const DeathCard = memo(function DeathCard({ now }: ZoneProps & { now: number }) {
  const dead = useHudSlice((s) => !s.alive && s.connected && s.phase !== MatchPhase.Ended);
  return dead ? <DeathScreen now={now} /> : null;
});

/** Drop T: playing this pair, waiting for yours, or out — read off the bracket, not a new field. */
const standingOf = (h: HudState): string => {
  const myName = h.players.find((r) => r.id === h.myId)?.name ?? "";
  return h.bracket ? standing(h.bracket, myName) : "";
};

const NO_BACKDROP = { background: "none" } as const;

function DeathScreen({ now }: { now: number }) {
  const killer = useHudSlice((s) => s.killerName);
  const killerWeapon = useHudSlice((s) => s.killerWeapon);
  const mode = useHudSlice((s) => s.mode);
  const phase = useHudSlice((s) => s.phase);
  const respawnAt = useHudSlice((s) => s.respawnAt);
  const tourStanding = useHudSlice(standingOf);
  return (
    <>
      <div className="death" data-zone="veil" />
      <div className="death" data-zone="death" data-testid="death" style={NO_BACKDROP}>
        <div className="death-title">{killer ? <>WYELIMINOWAŁ CIĘ <b>{killer}</b></> : "WYELIMINOWANY"}</div>
        {killerWeapon && killer && <div className="death-weapon">{killerName(killerWeapon)}</div>}
        <div className="death-respawn">
          {/* A tournament leaves most of the room dead for minutes at a time, and counting down a
              respawn that is never coming is the one thing the card must not do. */}
          {tourStanding === "waiting" ? "CZEKASZ NA SWOJĄ PARĘ"
            : tourStanding === "out" ? "ODPADŁEŚ · OGLĄDASZ DO KOŃCA"
            : (mode === "bomb" || mode === "duel" || mode === "turniej") && (phase === MatchPhase.Playing || phase === MatchPhase.Prep) ? "WRACASZ W NASTĘPNEJ RUNDZIE"
            : `ODRODZENIE ZA ${Math.max(0, Math.ceil((respawnAt - now) / 1000))}`}
        </div>
      </div>
    </>
  );
}
