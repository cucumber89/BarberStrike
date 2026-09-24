import { useEffect, useState } from "react";
import { GAME_VERSION, GRENADES } from "@frankibarber/shared";
import { useHud } from "../game/store";
import type { HudProps } from "./hud/types";
import { usePhaseModel } from "./hud/phase";
import { Crosshair, FlashVeil, SmokeVeil } from "./hud/Crosshair";
import { Vitals } from "./hud/Vitals";
import { Inventory } from "./hud/Inventory";
import { KillFeed } from "./hud/KillFeed";
import { TopStrip } from "./hud/TopStrip";
import { ModeLine, Objective } from "./hud/ModeLine";
import { FlagRow } from "./hud/FlagRow";
import { ActionPrompt } from "./hud/ActionPrompt";
import { BracketHud } from "./hud/BracketHud";
import { FlagNotice, Moments } from "./hud/Moments";
import { RoundBannerLayer } from "./hud/RoundBanner";
import { DeathCard } from "./hud/DeathCard";
import { PauseMenu } from "./hud/PauseMenu";
import { ShopLayer } from "./hud/ShopLayer";
import { ScoreboardOverlay } from "./hud/ScoreboardOverlay";
import { ResultLayer } from "./hud/ResultLayer";
import { HintLine, LeftColumn, PlanCard } from "./hud/LeftColumn";
import { Wallet } from "./hud/Wallet";

/** The props are the drop-U contract (`hud/types.ts`): today's, plus the inert `entering`. */
type Props = HudProps;

/** Re-renders on a timer so countdowns tick without the game loop pushing state. */
function useClock(intervalMs: number): number {
  const [t, setT] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(performance.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}

export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, onVotePlan, shop, chat, radar, dormant = false }: Props) {
  const h = useHud();
  const model = usePhaseModel();
  /**
   * Rule G9: the cook ring belongs to the ONE grenade that cooks. A smoke, a flash, a molotov or a
   * knife is in the hand for the 180 ms of the wind-up and never cooks, so the ring it used to draw
   * was an empty circle — and it cost the crosshair for exactly the moment the throw is aimed. Only
   * the frag replaces the crosshair now; everything else is thrown with the sight you aim with.
   */
  const cookRing = h.cookingKind !== "" && GRENADES[h.cookingKind].cookable;
  // The flash overlay and cook ring need a smooth clock; everything else is fine at 4 Hz.
  const fast = h.flashUntil > performance.now() || cookRing;
  const now = useClock(fast ? 33 : 250);
  const [telemetry, setTelemetry] = useState(false);

  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (h.chatOpen) return; // the chat box owns the keyboard (drop 5)
      if (e.code === "F3" && import.meta.env.DEV) { e.preventDefault(); setTelemetry((t) => !t); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [h.chatOpen, dormant]);

  const lowHealth = h.alive && h.health <= 30;

  return (
    <div className={`hud ${lowHealth ? "low-health" : ""} ${dormant ? "dormant" : ""}`} data-testid="hud" aria-hidden={dormant || undefined}>
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

      {/* Frame counter. The player can turn this on in a built game now — it used to be DEV-only,
          so the one number anybody asks for ("what fps am I getting?") did not exist outside a dev
          server. The F3 telemetry table stays a development thing. */}
      {(settings.hud.fps || import.meta.env.DEV) && (
        <div className="debug" data-testid="debug">
          v{GAME_VERSION} · {h.fps} fps · {h.ping} ms{!telemetry && import.meta.env.DEV && " · F3"}
          {telemetry && (
            <table className="telemetry"><tbody>
              {Object.entries(h.telemetry).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}
    </div>
  );
}

