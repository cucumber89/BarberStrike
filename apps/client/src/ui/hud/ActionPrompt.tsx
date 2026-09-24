import React, { memo } from "react";
import { TEAM_NAMES } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P2): the action slot (zone `action`) — today the capture line of the flag
 * I stand in, with its bar. Moved out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 */
export const ActionPrompt = memo(function ActionPrompt(_props: ZoneProps) {
  const alive = useHudSlice((s) => s.alive);
  const flags = useHudSlice((s) => s.flags);
  const inFlag = useHudSlice((s) => s.inFlag);
  const myTeam = useHudSlice((s) => s.myTeam);
  const here = inFlag >= 0 ? flags[inFlag] : null;
  if (!(alive && here)) return null;
  const captureText = here.contested ? `SPORNY · ${here.id}`
    : here.capTeam === myTeam ? `PRZEJMUJESZ ${here.id} · ${Math.round(here.cap * 100)}%`
    : here.capTeam !== -1 ? `${TEAM_NAMES[here.capTeam as 0 | 1]} PRZEJMUJE ${here.id}`
    : here.owner === myTeam ? `TRZYMASZ ${here.id}` : `FLAGA WROGA ${here.id}`;
  return (
    <div className={`capture ${here.contested ? "contested" : ""} ${here.capTeam !== -1 && here.capTeam !== myTeam ? "enemy" : ""}`} data-zone="action" data-testid="capture">
      {captureText}
      {here.capTeam !== -1 && !here.contested && <div className="capture-bar"><div className="capture-fill" style={{ "--v": here.cap } as React.CSSProperties} /></div>}
    </div>
  );
});
