import { memo } from "react";
import { MODES, MatchPhase } from "@frankibarber/shared";
import { useHud, useHudSlice } from "../../game/store";
import type { RadarSnapshot } from "../../game/Game";
import { Chat, type ChatApi } from "../Chat";
import { Hints } from "../Hints";
import { Minimap } from "../Minimap";
import { PlanPanel } from "../PlanPanel";
import { useUiFlags } from "./uiFlags";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P3): the left column's pieces — the radar, the chat, the first-run hints
 * and the round's plan — moved out of `Hud.tsx` verbatim (docs/UI_U_SPEC.md §7 P0 0d, §4.2). The
 * column has no zone of its own; each piece is its own zone root (`radar`, `chat`, `hint`, `plan`).
 *
 * They mount at three places because the HUD paints its un-z-indexed children in DOM order: the
 * radar and the chat under the kill feed, the hints and the plan over the cards. Their roots are in
 * `Minimap.tsx`, `Chat.tsx`, `Hints.tsx` and `PlanPanel.tsx` (P3's), so P0 marks each zone with a
 * `display: contents` wrapper — no box, no layout, no paint — and P3 moves the attribute onto the
 * component's own root.
 */

const CONTENTS = { display: "contents" } as const;

/** The radar (drop 5) and the chat (drop 5). */
export const LeftColumn = memo(function LeftColumn({ radar, chat }: ZoneProps & { radar: () => RadarSnapshot | null; chat: ChatApi }) {
  // Minimap + compass (drop 5): hidden behind the scope and the result screen. The tube takes your
  // surroundings away with it; the M-1's ring is the weapon that does NOT, which is most of what
  // separates the two long rifles in play.
  const showRadar = useHudSlice((s) => s.connected && s.scopeStyle !== "tube" && s.phase !== MatchPhase.Ended);
  const connected = useHudSlice((s) => s.connected);
  const lines = useHudSlice((s) => s.chat);
  const open = useHudSlice((s) => s.chatOpen);
  const teams = useHudSlice((s) => MODES[s.mode].teams);
  const myId = useHudSlice((s) => s.myId);
  return (
    <>
      {showRadar && <div data-zone="radar" style={CONTENTS}><Minimap radar={radar} /></div>}
      {connected && <div data-zone="chat" style={CONTENTS}><Chat lines={lines} open={open} teams={teams} myId={myId} api={chat} /></div>}
    </>
  );
});

/**
 * First-run hints: one short line, once each, never blocking (2.4). NOT while dormant: a hint is
 * shown once ever and then remembered, so letting the timer run behind an invisible HUD would burn
 * them all before the player saw one. Not under the pause card either (its `uiFlags` flag).
 */
export const HintLine = memo(function HintLine({ dormant }: ZoneProps & { dormant: boolean }) {
  const paused = useUiFlags((f) => f.overlay.pause);
  const ended = useHudSlice((s) => s.phase === MatchPhase.Ended);
  return !paused && !dormant && !ended ? <HintsMount /> : null;
});

function HintsMount() {
  const h = useHud();
  return <div data-zone="hint" style={CONTENTS}><Hints h={h} /></div>;
}

/** Living arena: the round's plan vote, or what is in force (2.4). Not over the shop. */
export const PlanCard = memo(function PlanCard({ onVote }: ZoneProps & { onVote: (id: number) => void }) {
  const show = useHudSlice((s) => !s.shopOpen && s.phase !== MatchPhase.Ended);
  return show ? <PlanMount onVote={onVote} /> : null;
});

function PlanMount({ onVote }: { onVote: (id: number) => void }) {
  const h = useHud();
  return <div data-zone="plan" style={CONTENTS}><PlanPanel h={h} onVote={onVote} /></div>;
}
