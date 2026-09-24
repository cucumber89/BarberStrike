import React, { useEffect, useMemo, useState } from "react";
import { boysClass, GAME_VERSION, GRENADES, MODES, MatchPhase } from "@frankibarber/shared";
import { useHud } from "../game/store";
import { PlanPanel } from "./PlanPanel";
import { Hints } from "./Hints";
import { Chat } from "./Chat";
import { Minimap } from "./Minimap";
import { Scoreboard } from "./Scoreboard";
import { MatchResult } from "./MatchResult";
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
import { uiFlags, useUiFlags } from "./hud/uiFlags";

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

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const REASON_SHORT: Record<string, string> = { kill: "ZABÓJSTWO", headshot: "W GŁOWĘ", assist: "ASYSTA", buy: "", sell: "SPRZEDAŻ", reset: "", round: "WYGRANA RUNDA", loss: "BONUS ZA PRZEGRANĄ" };

export function Hud({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, onVotePlan, shop, chat, radar, dormant = false }: Props) {
  const h = useHud();
  const model = usePhaseModel();
  const ended = h.phase === MatchPhase.Ended;
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
  const [scoreboard, setScoreboard] = useState(false);
  const [telemetry, setTelemetry] = useState(false);
  // The pause card is PauseMenu's; it publishes whether it shows.
  const paused = useUiFlags((f) => f.overlay.pause);

  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (h.chatOpen) return; // the chat box owns the keyboard (drop 5)
      // Tab is the scoreboard in play, but plain focus navigation inside the pause card / shop.
      if (e.code === "Tab" && !uiFlags.get().overlay.pause && !h.shopOpen) { e.preventDefault(); setScoreboard(true); }
      if (e.code === "F3" && import.meta.env.DEV) { e.preventDefault(); setTelemetry((t) => !t); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Tab") setScoreboard(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [h.shopOpen, h.chatOpen, dormant]);

  const lowHealth = h.alive && h.health <= 30;
  const windowSecs = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const shopHint = h.shopResult && !h.shopOpen && h.shopResult.reason === "closed" && now - h.shopResult.at < 1800;
  const toasts = useMemo(() => h.moneyToasts.filter((t) => t.reason !== "reset" && t.reason !== "buy"), [h.moneyToasts]);
  // Drop 4: mode-aware scoring. FFA shows my kills against the leader; Domination adds the flag row.
  const teams = MODES[h.mode].teams;
  const noShop = MODES[h.mode].shop === "none";

  return (
    <div className={`hud ${lowHealth ? "low-health" : ""} ${dormant ? "dormant" : ""}`} data-testid="hud" aria-hidden={dormant || undefined}>
      <SmokeVeil model={model} />
      <ModeLine model={model} />
      <Crosshair model={model} settings={settings} now={now} />
      <TopStrip model={model} />
      <FlagRow model={model} />
      <FlagNotice model={model} now={now} />
      <ActionPrompt model={model} />

      {/* Minimap + compass (drop 5): hidden behind the scope and the result screen */}
      {/* The tube takes your surroundings away with it; the M-1's ring is the weapon that does NOT,
          which is most of what separates the two long rifles in play. */}
      {h.connected && h.scopeStyle !== "tube" && h.phase !== MatchPhase.Ended && <Minimap radar={radar} />}
      {/* Chat (drop 5) */}
      {h.connected && <Chat lines={h.chat} open={h.chatOpen} teams={teams} myId={h.myId} api={chat} />}

      <KillFeed model={model} />

      <Vitals model={model} now={now} />

      {/* Wallet + buy prompt (drop 2) */}
      {h.connected && !noShop && !ended && (
        <div className="wallet" data-testid="wallet">
          {h.mode === "boys" && <div className="wallet-role">{boysClass(h.boysClass).name} · B: rola / sklep{h.nextClass !== h.boysClass ? ` · następna: ${boysClass(h.nextClass).name}` : ""}</div>}
          <div className={`wallet-money ${h.money >= 8000 ? "rich" : ""}`} data-testid="money">{money(h.money)}</div>
          {h.alive && !h.shopOpen && h.buyWindowLeft > 0 && (
            <div className={`wallet-prompt ${h.nearStation ? "station" : ""} ${windowSecs !== null && windowSecs <= 5 ? "urgent" : ""}`} data-testid="buy-prompt">
              <kbd>B</kbd><span>SKLEP</span><strong data-testid="buy-countdown">{windowSecs !== null ? `${windowSecs}s` : "OTWARTY"}</strong>
            </div>
          )}
        </div>
      )}
      <div className="money-toasts" aria-live="polite">
        {!ended && toasts.map((t) => (
          <div key={t.key} className={`money-toast ${t.delta < 0 ? "neg" : ""}`}>{t.delta > 0 ? "+" : ""}{money(t.delta)}<span className="why">{REASON_SHORT[t.reason] ?? t.reason.toUpperCase()}</span></div>
        ))}
      </div>
      {shopHint && !ended && <div className="shop-closed-hint" data-testid="shop-closed">{noShop ? `W TRYBIE ${MODES[h.mode].name} NIE MA SKLEPU · BROŃ DAJĄ ZABÓJSTWA` : "SKLEP ZAMKNIĘTY · PODEJDŹ DO LADY $"}</div>}

      <Inventory model={model} />

      <Moments model={model} />
      <Objective model={model} />

      <FlashVeil model={model} now={now} />

      <DeathCard model={model} now={now} />

      <RoundBannerLayer model={model} />

      <BracketHud model={model} />

      {/* Match end */}
      {ended && <MatchResult h={h} now={now} onLeave={onLeave} />}

      {/* Scoreboard (Tab) */}
      {scoreboard && h.phase !== MatchPhase.Ended && (
        <div className="scoreboard-wrap" data-testid="scoreboard"><Scoreboard rows={h.players} myId={h.myId} mode={h.mode} /></div>
      )}

      {/* First-run hints: one short line, once each, never blocking (2.4) */}
      {/* NOT while dormant: a hint is shown once ever and then remembered, so letting the timer
          run behind an invisible HUD would burn them all before the player saw one. */}
      {!paused && !dormant && !ended && <Hints h={h} />}

      {/* Living arena: the round's plan vote, or what is in force (2.4) */}
      {!h.shopOpen && !ended && <PlanPanel h={h} onVote={onVotePlan} />}

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

