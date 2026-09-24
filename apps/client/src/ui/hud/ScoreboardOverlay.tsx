import { memo, useEffect, useLayoutEffect, useState } from "react";
import { MatchPhase } from "@frankibarber/shared";
import { useHudSlice } from "../../game/store";
import { Scoreboard } from "../Scoreboard";
import { uiFlags } from "./uiFlags";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P6): the Tab scoreboard (zone `scoreboard`) and the key that holds it open,
 * moved out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d). It publishes
 * `uiFlags.overlay.tab` while the board shows, and reads the pause card's flag where the HUD used
 * to read its own `paused`.
 */
export const ScoreboardOverlay = memo(function ScoreboardOverlay({ dormant }: ZoneProps & { dormant: boolean }) {
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const chatOpen = useHudSlice((s) => s.chatOpen);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  const [scoreboard, setScoreboard] = useState(false);

  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (chatOpen) return; // the chat box owns the keyboard (drop 5)
      // Tab is the scoreboard in play, but plain focus navigation inside the pause card / shop.
      if (e.code === "Tab" && !uiFlags.get().overlay.pause && !shopOpen) { e.preventDefault(); setScoreboard(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Tab") setScoreboard(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [shopOpen, chatOpen, dormant]);

  const open = scoreboard && !ended;
  // Published before paint, like the pause card's flag.
  useLayoutEffect(() => { uiFlags.set({ overlay: { tab: open } }); }, [open]);
  useLayoutEffect(() => () => uiFlags.set({ overlay: { tab: false } }), []);
  return open ? <Board /> : null;
});

/** Scoreboard (Tab): the rows are read only while it is held. */
function Board() {
  const players = useHudSlice((s) => s.players);
  const myId = useHudSlice((s) => s.myId);
  const mode = useHudSlice((s) => s.mode);
  return <div className="scoreboard-wrap" data-zone="scoreboard" data-testid="scoreboard"><Scoreboard rows={players} myId={myId} mode={mode} /></div>;
}
