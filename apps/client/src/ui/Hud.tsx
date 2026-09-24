import { memo, useEffect, useState } from "react";
import { GAME_VERSION, GRENADES } from "@frankibarber/shared";
import { useHudSlice } from "../game/store";
import type { HudProps } from "./hud/types";
import { endedStage, usePhaseModel } from "./hud/phase";
import { overlayAttr, useUiFlags } from "./hud/uiFlags";
import { Crosshair, FlashVeil, SmokeVeil } from "./hud/Crosshair";
import { ModeLine, Objective } from "./hud/ModeLine";
import { TopStrip } from "./hud/TopStrip";
import { FlagRow } from "./hud/FlagRow";
import { FlagNotice, Moments } from "./hud/Moments";
import { ActionPrompt } from "./hud/ActionPrompt";
import { HintLine, LeftColumn, PlanCard } from "./hud/LeftColumn";
import { KillFeed } from "./hud/KillFeed";
import { Vitals } from "./hud/Vitals";
import { Wallet } from "./hud/Wallet";
import { Inventory } from "./hud/Inventory";
import { DeathCard } from "./hud/DeathCard";
import { RoundBannerLayer } from "./hud/RoundBanner";
import { BracketHud } from "./hud/BracketHud";
import { ResultLayer } from "./hud/ResultLayer";
import { ScoreboardOverlay } from "./hud/ScoreboardOverlay";
import { ShopLayer } from "./hud/ShopLayer";
import { PauseMenu } from "./hud/PauseMenu";

/**
 * The in-match HUD: the zone components of `ui/hud/` (drop U, docs/UI_U_SPEC.md §7 P0 0d), each
 * gated by the condition it had here and reading its own slice of the store. They mount in the old
 * order: nothing here has a z-index, so DOM order IS paint order (smoke under all, flash over the
 * corners, cards and menus over the flash). The root computes the phase model once for every zone,
 * runs the clock, keeps `low-health`, `dormant` and the frame counter, and carries the §4.5
 * attributes and the class `entering`, which nothing reads yet.
 */
export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, onVotePlan, shop, chat, radar, dormant = false, entering = false }: HudProps) {
  const model = usePhaseModel();
  const alive = useHudSlice((s) => s.alive);
  const lowHealth = useHudSlice((s) => s.alive && s.health <= 30);
  const flashUntil = useHudSlice((s) => s.flashUntil);
  // Rule G9 (Crosshair.tsx): only the frag cooks, and only its ring replaces the crosshair.
  const cookRing = useHudSlice((s) => s.cookingKind !== "" && GRENADES[s.cookingKind].cookable);
  // The flash overlay and cook ring need a smooth clock; everything else is fine at 4 Hz.
  const now = useClock(flashUntil > performance.now() || cookRing ? 33 : 250);
  const stage = useHudSlice((s) => endedStage(model, s.serverNow));
  const overlay = useUiFlags((f) => f.overlay);
  const bannerUp = useUiFlags((f) => f.bannerUp);
  return (
    <div className={`hud ${lowHealth ? "low-health" : ""} ${dormant ? "dormant" : ""}${entering ? " entering" : ""}`} data-testid="hud" aria-hidden={dormant || undefined}
      data-alive={String(alive)} data-overlay={overlayAttr(overlay)} data-moment={model.moment} data-stage={stage ?? undefined} data-banner={bannerUp ? "1" : undefined}>
      <SmokeVeil model={model} />
      <ModeLine model={model} />
      <Crosshair model={model} settings={settings} now={now} />
      <TopStrip model={model} />
      <FlagRow model={model} />
      <FlagNotice model={model} now={now} />
      <ActionPrompt model={model} />
      <LeftColumn model={model} radar={radar} chat={chat} />
      <KillFeed model={model} />
      <Vitals model={model} now={now} />
      <Wallet model={model} now={now} />
      <Inventory model={model} />
      <Moments model={model} />
      <Objective model={model} />
      <FlashVeil model={model} now={now} />
      <DeathCard model={model} now={now} />
      <RoundBannerLayer model={model} />
      <BracketHud model={model} />
      <ResultLayer model={model} now={now} onLeave={onLeave} />
      <ScoreboardOverlay model={model} dormant={dormant} />
      <HintLine model={model} dormant={dormant} />
      <PlanCard model={model} onVote={onVotePlan} />
      <ShopLayer model={model} api={shop} now={now} />
      <PauseMenu model={model} settings={settings} onSettings={onSettings} onLeave={onLeave} onResume={onResume} onPause={onPause}
        onFullscreen={onFullscreen} onChooseTeam={onChooseTeam} dormant={dormant} />
      <FrameCounter show={settings.hud.fps || import.meta.env.DEV} dormant={dormant} />
    </div>
  );
}

/** Re-renders on a timer so countdowns tick without the game loop pushing state. */
function useClock(intervalMs: number): number {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(performance.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}

/** Frame counter: the player's own fps setting in a build (it was DEV-only); F3's table stays DEV. */
const FrameCounter = memo(function FrameCounter({ show, dormant }: { show: boolean; dormant: boolean }) {
  const fps = useHudSlice((s) => s.fps);
  const ping = useHudSlice((s) => s.ping);
  const rows = useHudSlice((s) => s.telemetry);
  const chatOpen = useHudSlice((s) => s.chatOpen);
  const [telemetry, setTelemetry] = useState(false);
  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (chatOpen) return; // the chat box owns the keyboard (drop 5)
      if (e.code === "F3" && import.meta.env.DEV) { e.preventDefault(); setTelemetry((t) => !t); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [chatOpen, dormant]);
  if (!show) return null;
  return (
    <div className="debug" data-testid="debug">
      v{GAME_VERSION} · {fps} fps · {ping} ms{!telemetry && import.meta.env.DEV && " · F3"}
      {telemetry && (
        <table className="telemetry"><tbody>
          {Object.entries(rows).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>
      )}
    </div>
  );
});
