import React, { memo } from "react";
import { useHudSlice } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P2): Domination's and the Boys' flag row (zone `top-line`) — A / B / C with
 * the owner's colour, the capture bar and the contested pulse (drop 4). Moved out of `Hud.tsx`
 * verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2).
 */
export const FlagRow = memo(function FlagRow(_props: ZoneProps) {
  const mode = useHudSlice((s) => s.mode);
  const flags = useHudSlice((s) => s.flags);
  const inFlag = useHudSlice((s) => s.inFlag);
  if (!((mode === "dom" || mode === "boys") && flags.length > 0)) return null;
  return (
    <div className="flags" data-zone="top-line" data-testid="flags">
      {flags.map((f, i) => (
        <div key={f.id} className={`flag own${f.owner} cap${f.capTeam} ${f.contested ? "contested" : ""} ${inFlag === i ? "here" : ""}`} title={f.name} data-testid={`flag-${f.id}`} data-owner={f.owner}>
          {f.id}
          {f.capTeam !== -1 && <span className="flag-cap" style={{ "--v": f.cap } as React.CSSProperties} />}
        </div>
      ))}
    </div>
  );
});
