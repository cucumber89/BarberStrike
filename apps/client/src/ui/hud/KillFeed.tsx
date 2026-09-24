import { memo } from "react";
import { MODES, MatchPhase, killerName } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { HeadShot, Razor } from "../Scoreboard";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P4): the kill feed, top right (zone `feed`), moved out of `Hud.tsx`
 * verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2). The list itself is always mounted, as it was.
 */
export const KillFeed = memo(function KillFeed(_props: ZoneProps) {
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const killFeed = useHudSlice((s) => s.killFeed);
  const myId = useHudSlice((s) => s.myId);
  const teams = useHudSlice((s) => MODES[s.mode].teams);
  return (
    <ul className="killfeed" data-zone="feed" data-testid="killfeed">
      {!ended && killFeed.map((k) => (
        <li key={k.key} className={k.victim === myId ? "me-victim" : k.killer === myId ? "me-killer" : ""}>
          <span className={`kf-name ${teams ? `t${k.killerTeam}` : "ffa"}`}>
            {k.killer === k.victim ? "" : k.killerName}
            {/* Assists: "KILLER + HELPER" before the weapon, because a kill somebody set up for you
                is not the same event as one you took alone, and the scoreboard's A column says it
                far too late to matter. The server names them on the Kill message; see KillEvent. */}
            {k.assists?.length ? <span className="kf-assist"> + {k.assists.join(" + ")}</span> : null}
          </span>
          {/* Drop E: a shave gets the razor instead of the weapon's name. Nobody needs telling it
              was the clippers — the icon IS the clippers, and what matters is that it was from
              behind. A razor is drawn rather than spelled: it reads at a glance and at 1080p. */}
          <span className="kf-weapon">
            {k.killer === k.victim ? "poległ"
              : k.shave ? <Razor className="kf-razor" title="OGOLENIE" />
              : <>{killerName(k.weapon).split(" ")[0]}{k.headshot ? <HeadShot className="kf-head" title="W GŁOWĘ" /> : null}</>}
          </span>
          <span className={`kf-name ${teams ? `t${k.victimTeam}` : "ffa"}`}>{k.victimName}</span>
        </li>
      ))}
    </ul>
  );
});
