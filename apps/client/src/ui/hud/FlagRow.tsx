import React, { memo } from "react";
import { useHudSlice } from "../../game/store";
import type { ZoneProps } from "./types";

/**
 * Drop U, P2: Domination's and the Boys' flags (zone `top-line`, docs/UI_U_SPEC.md §5.2 rows 8
 * and 9) — badges only, A B C in the owner's colour, a contested one striped, and a 3 px bar
 * filling in the colour of whoever is taking it. The flag I stand on is outlined. The words about a
 * flag changing hands are the alert's (`flag-notice`, P5), and my own capture is the action slot's.
 */
export const FlagRow = memo(function FlagRow(_props: ZoneProps) {
  const mode = useHudSlice((s) => s.mode);
  const flags = useHudSlice((s) => s.flags);
  const inFlag = useHudSlice((s) => s.inFlag);
  if (!((mode === "dom" || mode === "boys") && flags.length > 0)) return null;
  return (
    <div className="flags" data-zone="top-line" data-testid="flags">
      {flags.map((f, i) => (
        <div key={f.id} className={`flag own${f.owner} cap${f.capTeam}${f.contested ? " contested" : ""}${inFlag === i ? " here" : ""}`}
          data-testid={`flag-${f.id}`} data-owner={f.owner} aria-label={f.name}>
          <b>{f.id}</b>
          {f.capTeam !== -1 && <span className="flag-cap" style={{ "--v": f.cap } as React.CSSProperties} />}
        </div>
      ))}
    </div>
  );
});
