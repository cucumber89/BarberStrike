import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GAME_VERSION, MODES, MatchPhase, type GameMode, type Team } from "@frankibarber/shared";
import { useHud, useHudSlice } from "../../game/store";
import type { Settings } from "../../settings";
import { SettingsPanel } from "../SettingsPanel";
import { TeamPicker, teamPickerShown } from "../TeamPicker";
import { MODE_TITLE, mapTitle } from "./copy";
import { uiFlags } from "./uiFlags";
import { useKeepMounted } from "./useKeepMounted";
import type { ZoneProps } from "./types";

/**
 * The ESC menu (zone `pause`), CS2's shape: a column on the left, the match still running and
 * visible beside it under a light dim, settings opening beside the column rather than inside it
 * (zone `settings`), the team picker opening inline under its button, and leaving behind an
 * explicit „NA PEWNO WYJŚĆ?” (docs/UI_U_SPEC.md §4.4, §5.2 #54–57, §6.1).
 *
 * What opens it is unchanged from the pre-drop HUD: Escape, and the pointer lost outside the shop
 * and the chat box for 300 ms. Two exceptions, both from §6.1:
 * - a dormant HUD (the one mounted behind the loading card) never arms it (`startup.spec.ts:16`);
 * - after a match ends and the next one starts (Ended → Waiting) the pointer is free because the
 *   player was reading the result, not because they asked for a menu. So for 2500 ms nothing arms
 *   it, and the resume prompt „KLIKNIJ, ŻEBY GRAĆ” (zone `prompt`) stands in its place until a
 *   click takes the pointer or Escape opens the menu.
 *
 * The menu never crosses a match's end (`pausedAfterPhase`): Escape during Ended only frees the
 * pointer, and a menu open when the match ended is shut on that edge, so the new match starts
 * unpaused and the resume prompt is the only thing on screen.
 *
 * It publishes `uiFlags.overlay.pause` while the column shows, which hides the other zones (§4.5).
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

/** §6.1 New match: how long after Ended → Waiting the pointer being free does not open the menu. */
export const NEW_MATCH_QUIET_MS = 2500;
/** §6.1: the column's exit, and the settings panel's. */
const CLOSE_MS = 160;
const SETTINGS_CLOSE_MS = 120;

/**
 * Pure: whether the menu is still asked for after the phase went `was` → `now`. Any edge into or
 * out of Ended clears it: the result card has the screen during Ended, and a new match starts
 * unpaused (§6.1 New match) — a `paused` carried through Ended would open the column (and its
 * dim) on the first Waiting frame, beside „KLIKNIJ, ŻEBY GRAĆ”.
 */
export function pausedAfterPhase(paused: boolean, was: MatchPhase, now: MatchPhase): boolean {
  if (was === now) return paused;
  return was === MatchPhase.Ended || now === MatchPhase.Ended ? false : paused;
}

/** Pure: whether Escape asks for the menu in `phase`. During Ended it only frees the pointer. */
export function escapeAsksMenu(phase: MatchPhase): boolean {
  return phase !== MatchPhase.Ended;
}

export const PauseMenu = memo(function PauseMenu({ settings, onSettings, onLeave, onResume, onPause, onFullscreen, onChooseTeam, dormant }: PauseMenuProps) {
  const pointerLocked = useHudSlice((s) => s.pointerLocked);
  const connected = useHudSlice((s) => s.connected);
  const phase = useHudSlice((s) => s.phase);
  const shopOpen = useHudSlice((s) => s.shopOpen);
  const chatOpen = useHudSlice((s) => s.chatOpen);
  const [paused, setPaused] = useState(false);
  /** The phase `paused` was last squared with; the edge is taken DURING render (see below). */
  const [seenPhase, setSeenPhase] = useState(phase);
  /** The resume prompt after a new match (see the header). */
  const [prompt, setPrompt] = useState(false);
  /** `performance.now()` until which a free pointer does not arm the menu (see the header). */
  const quietUntil = useRef(0);
  const lastPhase = useRef(phase);
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

  // A new match (Ended → Waiting): whatever was open at the end is closed, and the quiet window
  // starts. Declared before the arming effect below, which reads the window in the same commit.
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (was !== MatchPhase.Ended || phase === MatchPhase.Ended) return;
    quietUntil.current = performance.now() + NEW_MATCH_QUIET_MS;
  }, [phase]);

  useEffect(() => {
    if (dormant) return;
    const down = (e: KeyboardEvent) => {
      if (chatOpen) return; // the chat box owns the keyboard (drop 5)
      if (e.code === "Escape" && !shopOpen) {
        // Two ways in. Normally the browser has already released the pointer by the time this
        // runs. Under Keyboard Lock (fullscreen, Chromium) Escape reaches the page WITHOUT
        // releasing it, so the lock has to be dropped here or the pause card would be unclickable.
        e.preventDefault();
        setPrompt(false);
        if (paused) void resume();
        else { onPause(); if (escapeAsksMenu(phase)) setPaused(true); }
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [shopOpen, chatOpen, paused, resume, onPause, dormant, phase]);

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
      // A new match's quiet window: the prompt, not the menu. The prompt then stays until a click
      // or Escape; after the window only a LATER loss of the pointer arms the menu.
      if (performance.now() < quietUntil.current) { setPrompt(true); return; }
      if (prompt) return;
      const timer = window.setTimeout(() => setPaused(true), 300);
      return () => window.clearTimeout(timer);
    }
    if (pointerLocked) setPrompt(false);
    if (pointerLocked || shopOpen || chatOpen) setPaused(false);
  }, [dormant, pointerLocked, connected, phase, shopOpen, chatOpen, prompt]);

  // The phase edge is squared with `paused` in the same render (React's "adjust state on a prop
  // change" pattern), and `open` reads the squared value: an effect would be a frame late, and
  // that one frame of `open` would already have started the column's 160 ms exit below.
  let pausedNow = paused;
  if (seenPhase !== phase) {
    pausedNow = pausedAfterPhase(paused, seenPhase, phase);
    setSeenPhase(phase);
    if (pausedNow !== paused) setPaused(pausedNow);
  }
  const open = pausedNow && phase !== MatchPhase.Ended;
  const mount = useKeepMounted(open, CLOSE_MS);
  // Published before paint, so nothing that waits on the pause is a frame late.
  useLayoutEffect(() => { uiFlags.set({ overlay: { pause: open } }); }, [open]);
  useLayoutEffect(() => () => uiFlags.set({ overlay: { pause: false } }), []);
  const showPrompt = prompt && !open && phase !== MatchPhase.Ended && !dormant;
  return (
    <>
      {showPrompt && <p className="resume-prompt" data-zone="prompt" data-testid="resume-prompt">KLIKNIJ, ŻEBY GRAĆ</p>}
      {mount !== "closed" && (
        <PauseCard
          closing={mount === "closing"}
          settings={settings} onSettings={onSettings} onLeave={onLeave} onChooseTeam={onChooseTeam}
          resume={resume} onFullscreen={onFullscreen} fullscreen={fullscreen} setFullscreen={setFullscreen}
          pauseSettings={pauseSettings} setPauseSettings={setPauseSettings} lockRefused={lockRefused}
        />
      )}
    </>
  );
});

interface PauseCardProps {
  /** On its way out (§6.1, 160 ms): drawn, but it answers nothing. */
  closing: boolean;
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

/**
 * „DRUŻYNOWY DEATHMATCH · NIGHT DISTRICT”: the mode's HUD title and the map, when it is known. Each
 * part is kept whole (`white-space: nowrap`), so a line too long for the column breaks at the dot
 * and never inside the map's name.
 */
function PauseObjective({ mode, mapId }: { mode: GameMode; mapId: string }) {
  const map = mapTitle(mapId);
  return (
    <p className="pause-objective" data-testid="pause-objective">
      <span>{MODE_TITLE[mode]}</span>{map && <>{" · "}<span>{map}</span></>}
    </p>
  );
}

/** The column itself; the team picker reads the whole state, so it is read only while the card shows. */
function PauseCard({ closing, settings, onSettings, onLeave, onChooseTeam, resume, onFullscreen, fullscreen, setFullscreen, pauseSettings, setPauseSettings, lockRefused }: PauseCardProps) {
  const h = useHud();
  const teams = teamPickerShown(h.mode) && MODES[h.mode].teams;
  // Open when a side was just asked for: the answer (6 s) belongs under the cards it answers.
  const [teamsOpen, setTeamsOpen] = useState(() => !!h.teamResult && performance.now() - h.teamResult.at < 6000);
  const [confirm, setConfirm] = useState(false);
  const settingsMount = useKeepMounted(pauseSettings, SETTINGS_CLOSE_MS);
  return (
    // Closing: `.closing` takes the pointer away from it (screens.css), so it answers nothing.
    <div className={`pause-layer${closing ? " closing" : ""}`}>
      <div className="pause-dim" aria-hidden="true" />
      <div className="pause" data-zone="pause" data-testid="pause" role="dialog" aria-label="Menu">
        <div className="pause-head">
          <h2 className="pause-title">MENU</h2>
          {/* One text node: „v2.1” is one word (§3.10), not „v” and „2.1”. */}
          <span className="pause-version">{`v${GAME_VERSION}`}</span>
        </div>
        <p className="pause-live">MECZ TRWA DALEJ</p>
        <PauseObjective mode={h.mode} mapId={h.mapId} />
        {lockRefused && (
          // A refused pointer lock has to be SAID: Chrome refuses it for about a second after
          // Escape left the previous lock, and a silent refusal reads as a frozen game.
          <p className="pause-warn" data-testid="pause-lock-refused">MYSZ NIE WRÓCIŁA — KLIKNIJ JESZCZE RAZ</p>
        )}
        <div className="pause-nav">
          <button className="pause-btn primary" onClick={() => void resume()} data-testid="btn-resume">WRÓĆ DO GRY</button>
          <button className="pause-btn" aria-pressed={pauseSettings} onClick={() => setPauseSettings((v) => !v)} data-testid="btn-pause-settings">USTAWIENIA</button>
          {teams && (
            <button className="pause-btn" aria-pressed={teamsOpen} aria-controls="team-picker" onClick={() => setTeamsOpen((v) => !v)} data-testid="btn-teams">ZMIEŃ DRUŻYNĘ</button>
          )}
          {teams && teamsOpen && <TeamPicker h={h} onChoose={onChooseTeam} />}
          <button className="pause-btn switch" aria-pressed={fullscreen} onClick={() => void onFullscreen().then(setFullscreen)} data-testid="btn-fullscreen">
            PEŁNY EKRAN<span className="pause-switch" aria-hidden="true" />
          </button>
          <button className="pause-btn leave" aria-expanded={confirm} onClick={() => setConfirm((v) => !v)} data-testid="btn-leave">OPUŚĆ MECZ</button>
          {confirm && (
            <div className="pause-confirm" role="group" aria-label="Potwierdź wyjście">
              <p>NA PEWNO WYJŚĆ?</p>
              <div className="pause-confirm-row">
                <button className="pause-btn leave primary" onClick={onLeave} data-testid="btn-leave-confirm" autoFocus>TAK, WYJDŹ</button>
                <button className="pause-btn" onClick={() => setConfirm(false)} data-testid="btn-leave-cancel">ANULUJ</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {settingsMount !== "closed" && (
        // The panel is SettingsPanel, untouched; it carries `data-testid="settings"` itself.
        <div className={`pause-settings${settingsMount === "closing" ? " closing" : ""}`} data-zone="settings">
          <SettingsPanel settings={settings} onChange={onSettings} />
        </div>
      )}
    </div>
  );
}
