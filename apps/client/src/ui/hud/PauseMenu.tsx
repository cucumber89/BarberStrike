import { memo, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { GAME_VERSION, MODES, MatchPhase, type Team } from "@frankibarber/shared";
import { useHud, useHudSlice } from "../../game/store";
import type { Settings } from "../../settings";
import { SettingsPanel } from "../SettingsPanel";
import { TeamPicker } from "../TeamPicker";
import { uiFlags } from "./uiFlags";
import type { ZoneProps } from "./types";

/**
 * Drop U, P0 (seed for P7): the pause card (zone `pause`) with what opens it — Escape, and the
 * pointer lost outside the shop and the chat box for 300 ms — moved out of `Hud.tsx` verbatim
 * (docs/UI_U_SPEC.md §7 P0 0d).
 *
 * It publishes `uiFlags.overlay.pause` while the card shows, so the scoreboard's Tab and the
 * first-run hints, which used to read the HUD's own `paused`, read it from there.
 */
export interface PauseMenuProps extends ZoneProps {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onLeave: () => void;
  /** Resolves to whether the pointer really ended up locked — a refusal must be visible, not silent. */
  onResume: () => Promise<boolean>;
  /** Release the pointer so Escape can open the pause card even when the browser did not do it. */
  onPause: () => void;
  /** Toggle fullscreen; resolves to whether the game is fullscreen afterwards. */
  onFullscreen: () => Promise<boolean>;
  onChooseTeam: (t: Team) => void;
  dormant: boolean;
}

export const PauseMenu = memo(function PauseMenu({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, dormant }: PauseMenuProps) {
  const pointerLocked = useHudSlice((s) => s.pointerLocked);
  const connected = useHudSlice((s) => s.connected);
  const phase = useHudSlice((s) => s.phase);
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const chatOpen = useHudSlice((s) => s.chatOpen);
  const [paused, setPaused] = useState(false);
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
      if (chatOpen) return; // the chat box owns the keyboard (drop 5)
      if (e.code === "Escape" && !shopOpen) {
        // Two ways in. Normally the browser has already released the pointer by the time this
        // runs. Under Keyboard Lock (fullscreen, Chromium) Escape reaches the page WITHOUT
        // releasing it, so the lock has to be dropped here or the pause card would be unclickable.
        e.preventDefault();
        if (paused) void resume();
        else { onPause(); setPaused(true); }
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [shopOpen, chatOpen, paused, resume, onPause, dormant]);

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
    if (!pointerLocked && connected && phase !== MatchPhase.Ended && !shopOpen && !chatOpen) {
      const timer = window.setTimeout(() => setPaused(true), 300);
      return () => window.clearTimeout(timer);
    }
    if (pointerLocked || shopOpen || chatOpen) setPaused(false);
  }, [dormant, pointerLocked, connected, phase, shopOpen, chatOpen]);

  const open = paused && phase !== MatchPhase.Ended;
  // Published before paint, so nothing that waits on the pause is a frame late.
  useLayoutEffect(() => { uiFlags.set({ overlay: { pause: open } }); }, [open]);
  useLayoutEffect(() => () => uiFlags.set({ overlay: { pause: false } }), []);
  if (!open) return null;
  return (
    <PauseCard
      settings={settings} onSettings={onSettings} onLeave={onLeave} onChooseTeam={onChooseTeam}
      resume={resume} onFullscreen={onFullscreen} fullscreen={fullscreen} setFullscreen={setFullscreen}
      pauseSettings={pauseSettings} setPauseSettings={setPauseSettings} lockRefused={lockRefused}
    />
  );
});

interface PauseCardProps {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onLeave: () => void;
  onChooseTeam: (t: Team) => void;
  resume: () => Promise<void>;
  onFullscreen: () => Promise<boolean>;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  pauseSettings: boolean;
  setPauseSettings: (f: (v: boolean) => boolean) => void;
  lockRefused: boolean;
}

/** The card itself; the team picker reads the whole state, so it is read only while the card shows. */
function PauseCard({ settings, onSettings, onLeave, onChooseTeam, resume, onFullscreen, fullscreen, setFullscreen, pauseSettings, setPauseSettings, lockRefused }: PauseCardProps) {
  const h = useHud();
  return (
    <div className="pause" data-zone="pause" data-testid="pause">
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
  );
}
