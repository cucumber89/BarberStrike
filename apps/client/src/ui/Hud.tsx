import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boysClass, GAME_VERSION, GRENADES, MODES, MatchPhase, killerName } from "@frankibarber/shared";
import { useHud } from "../game/store";
import { TeamPicker } from "./TeamPicker";
import { PlanPanel } from "./PlanPanel";
import { Hints } from "./Hints";
import { SettingsPanel } from "./SettingsPanel";
import { Shop } from "./Shop";
import { Chat } from "./Chat";
import { Minimap } from "./Minimap";
import { Scoreboard } from "./Scoreboard";
import { MatchResult, RoundBreak } from "./MatchResult";
import { standing } from "./Bracket";
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
  // The break after a round is the FIRST Prep window after Playing; the buy window that follows
  // is a second Prep with a new deadline. Remembering the break's deadline is what tells them apart.
  const prevPhase = useRef(h.phase);
  const [breakEndsAt, setBreakEndsAt] = useState(0);
  useEffect(() => {
    if (prevPhase.current === MatchPhase.Playing && h.phase === MatchPhase.Prep) setBreakEndsAt(h.phaseEndsAt);
    prevPhase.current = h.phase;
  }, [h.phase, h.phaseEndsAt]);
  const inBreak = h.phase === MatchPhase.Prep && breakEndsAt !== 0 && breakEndsAt === h.phaseEndsAt;
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
  const [paused, setPaused] = useState(false);
  const [telemetry, setTelemetry] = useState(false);
  const [pauseSettings, setPauseSettings] = useState(false);
  /** Set when a resume attempt came back without the pointer, so the card can say so and retry. */
  const [lockRefused, setLockRefused] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && document.fullscreenElement != null);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const resume = useCallback(async () => {
    const ok = await onResume();
    setLockRefused(!ok);
    if (ok) setPaused(false);
  }, [onResume]);

  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (h.chatOpen) return; // the chat box owns the keyboard (drop 5)
      // Tab is the scoreboard in play, but plain focus navigation inside the pause card / shop.
      if (e.code === "Tab" && !paused && !h.shopOpen) { e.preventDefault(); setScoreboard(true); }
      if (e.code === "Escape" && !h.shopOpen) {
        // Two ways in. Normally the browser has already released the pointer by the time this
        // runs. Under Keyboard Lock (fullscreen, Chromium) Escape reaches the page WITHOUT
        // releasing it, so the lock has to be dropped here or the pause card would be unclickable.
        e.preventDefault();
        if (paused) void resume();
        else { onPause(); setPaused(true); }
      }
      if (e.code === "F3" && import.meta.env.DEV) { e.preventDefault(); setTelemetry((t) => !t); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Tab") setScoreboard(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [h.shopOpen, h.chatOpen, paused, resume, onPause, dormant]);

  // Escape releases pointer lock (browser) → show pause overlay; clicking resume re-locks.
  // The shop and the chat box release / hold the lock on purpose, so they never count as a pause.
  useEffect(() => {
    // A DORMANT hud is the one mounted behind the loading screen from READY on (App.tsx), and
    // nobody has entered the match yet: it is connected and it has no pointer, which is exactly
    // the shape of "the player pressed Escape", so it armed the pause card 300 ms into the ready
    // screen. Invisible (`.hud.dormant`), but real: `startup.spec.ts` asserts no pause card there
    // and was passing only by beating that timer to the assertion. The gate is the same one the
    // keyboard effect above already has — a hud that is not on screen decides nothing.
    if (dormant) return;
    if (!h.pointerLocked && h.connected && h.phase !== MatchPhase.Ended && !h.shopOpen && !h.chatOpen) {
      const timer = window.setTimeout(() => setPaused(true), 300);
      return () => window.clearTimeout(timer);
    }
    if (h.pointerLocked || h.shopOpen || h.chatOpen) setPaused(false);
  }, [dormant, h.pointerLocked, h.connected, h.phase, h.shopOpen, h.chatOpen]);

  const timeLeft = h.phaseEndsAt ? h.phaseEndsAt - h.serverNow : 0;
  const lowHealth = h.alive && h.health <= 30;
  const windowSecs = h.buyWindowLeft === Infinity ? null : Math.ceil(h.buyWindowLeft / 1000);
  const shopHint = h.shopResult && !h.shopOpen && h.shopResult.reason === "closed" && now - h.shopResult.at < 1800;
  const toasts = useMemo(() => h.moneyToasts.filter((t) => t.reason !== "reset" && t.reason !== "buy"), [h.moneyToasts]);
  // Drop T: playing this pair, waiting for yours, or out — read off the bracket, not a new field.
  const myName = h.players.find((r) => r.id === h.myId)?.name ?? "";
  const tourStanding = h.bracket ? standing(h.bracket, myName) : "";
  // Drop 4: mode-aware scoring. FFA shows my kills against the leader; Domination adds the flag row.
  const teams = MODES[h.mode].teams;
  const noShop = MODES[h.mode].shop === "none";
  const noticeAge = h.flagNotice ? now - h.flagNotice.at : Infinity;

  return (
    <div className={`hud ${lowHealth ? "low-health" : ""} ${dormant ? "dormant" : ""}`} data-testid="hud" aria-hidden={dormant || undefined}>
      <SmokeVeil model={model} />
      <ModeLine model={model} />
      <Crosshair model={model} settings={settings} now={now} />
      <TopStrip model={model} />
      <FlagRow model={model} />
      {h.flagNotice && noticeAge < 2600 && !ended && (
        <div className={`flag-notice t${h.flagNotice.team}`} data-testid="flag-notice" style={{ opacity: Math.min(1, (2600 - noticeAge) / 500) }}>{h.flagNotice.text}</div>
      )}
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

      {h.reconnecting && <div className="reconnect" data-testid="reconnecting">UTRACONO POŁĄCZENIE · ŁĄCZĘ PONOWNIE…</div>}

      {/* Countdown */}
      {h.phase === MatchPhase.Countdown && (
        <div className="center-msg countdown" data-testid="countdown">{Math.max(1, Math.ceil(timeLeft / 1000))}</div>
      )}
      <Objective model={model} />

      <FlashVeil model={model} now={now} />

      {/* Death screen */}
      {!h.alive && h.connected && h.phase !== MatchPhase.Ended && (
        <div className="death" data-testid="death">
          <div className="death-title">{h.killerName ? <>WYELIMINOWAŁ CIĘ <b>{h.killerName}</b></> : "WYELIMINOWANY"}</div>
          {h.killerWeapon && h.killerName && <div className="death-weapon">{killerName(h.killerWeapon)}</div>}
          <div className="death-respawn">
            {/* A tournament leaves most of the room dead for minutes at a time, and counting down a
                respawn that is never coming is the one thing the card must not do. */}
            {tourStanding === "waiting" ? "CZEKASZ NA SWOJĄ PARĘ"
              : tourStanding === "out" ? "ODPADŁEŚ · OGLĄDASZ DO KOŃCA"
              : (h.mode === "bomb" || h.mode === "duel" || h.mode === "turniej") && (h.phase === MatchPhase.Playing || h.phase === MatchPhase.Prep) ? "WRACASZ W NASTĘPNEJ RUNDZIE"
              : `ODRODZENIE ZA ${Math.max(0, Math.ceil((h.respawnAt - now) / 1000))}`}
          </div>
        </div>
      )}

      {/* Between rounds: who took it and why, from the round's real signals */}
      {inBreak && !h.shopOpen && <RoundBreak h={h} />}

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

      {/* Buy menu (B) */}
      {h.shopOpen && h.phase !== MatchPhase.Ended && <Shop h={h} api={shop} now={now} />}

      {/* Pause / settings */}
      {paused && h.phase !== MatchPhase.Ended && (
        <div className="pause" data-testid="pause">
          <div className="pause-card">
            <div className="wordmark small">BARBERSTRIKE</div>
            <p className="pause-hint">Pauza · <kbd>ESC</kbd> albo WRÓĆ DO GRY, żeby grać dalej</p>
            <p className="pause-objective" data-testid="pause-objective"><b>{MODES[h.mode].name}</b> · {MODES[h.mode].objective}</p>
            {lockRefused && (
              <p className="pause-warn" data-testid="pause-lock-refused">
                Przeglądarka nie oddała myszy. Kliknij <strong>WRÓĆ DO GRY</strong> jeszcze raz —
                odmowa tuż po wciśnięciu Escape jest normalna i mija po sekundzie.
              </p>
            )}
            <button className="menu-btn primary" onClick={() => void resume()} data-testid="btn-resume">WRÓĆ DO GRY</button>
            <button className="menu-btn" onClick={() => void onFullscreen().then(setFullscreen)} data-testid="btn-fullscreen">
              {fullscreen ? "WYJDŹ Z PEŁNEGO EKRANU" : "PEŁNY EKRAN"}
            </button>
            <button className="menu-btn" onClick={() => setPauseSettings((v) => !v)} data-testid="btn-pause-settings">{pauseSettings ? "UKRYJ USTAWIENIA" : "USTAWIENIA"}</button>
            {!pauseSettings && <TeamPicker h={h} onChoose={onChooseTeam} />}
            {pauseSettings && <SettingsPanel settings={settings} onChange={onSettings} />}
            <button className="menu-btn" onClick={onLeave} data-testid="btn-leave">OPUŚĆ MECZ</button>
            <div className="version">v{GAME_VERSION}</div>
          </div>
        </div>
      )}

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

