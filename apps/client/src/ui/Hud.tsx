import { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { GAME_VERSION, GRENADES } from "@frankibarber/shared";
import { hud, useHudSlice } from "../game/store";
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
import { PerfBadge } from "./hud/PerfBadge";

/**
 * The in-match HUD: the zone components of `ui/hud/` (drop U, docs/UI_U_SPEC.md §7 P0 0d), each
 * gated as it was here and reading its own store slice, mounted in the old order (no z-index here:
 * DOM order IS paint order). The root makes the phase model once, runs the clock, and keeps
 * `low-health`, `dormant`, the frame counter, the §4.5 attributes and `entering` (unread yet).
 */
export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, onVotePlan, shop, chat, radar, dormant = false, entering = false }: HudProps) {
  const model = usePhaseModel();
  const alive = useHudSlice((s) => s.alive);
  const lowHealth = useHudSlice((s) => s.alive && s.health <= 30);
  const flashUntil = useHudSlice((s) => s.flashUntil);
  // The flash and the frag's cook ring (Rule G9, Crosshair.tsx) need a smooth clock; the rest 4 Hz.
  const cookRing = useHudSlice((s) => s.cookingKind !== "" && GRENADES[s.cookingKind].cookable);
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
      <PerfBadge settings={settings} onSettings={onSettings} dormant={dormant} />
    </div>
  );
}

/**
 * Re-renders so countdowns tick, never staler than `intervalMs`. A tick due as the store notifies
 * joins that batch (both external stores: one commit), as a whole-HUD re-render used to absorb it.
 */
function useClock(intervalMs: number): number {
  const [c] = useState(() => ({ t: performance.now(), ls: new Set<() => void>() }));
  const sub = useCallback((l: () => void) => { c.ls.add(l); return () => { c.ls.delete(l); }; }, [c]);
  useEffect(() => {
    let timer = 0;
    const tick = () => { c.t = performance.now(); c.ls.forEach((l) => l()); window.clearTimeout(timer); timer = window.setTimeout(tick, intervalMs); };
    timer = window.setTimeout(tick, intervalMs);
    const off = hud.subscribe(() => { if (performance.now() - c.t >= intervalMs * 0.75) tick(); });
    return () => { window.clearTimeout(timer); off(); };
  }, [c, intervalMs]);
  return useSyncExternalStore(sub, () => c.t);
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
