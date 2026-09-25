import { memo, useCallback } from "react";
import { useHudSlice } from "../../game/store";
import type { Settings } from "../../settings";

/**
 * Drop V (P8c): the release-build performance surface. Three things, from `hud.perfStat` (published
 * every window by `perf/index.ts`, in production too — the old `if(dev)` gate is lifted):
 *
 *  - `perf-fps`  — a small FPS badge. Shown when the player has the FPS readout on, OR whenever the
 *    machine is struggling (`warn`), so a slow session surfaces the number even if the badge was off.
 *  - `toggle-fps` — flips `settings.hud.fps`, the same preference the pause-menu HUD tab exposes, so
 *    the badge can be turned on or off without leaving the match.
 *  - `perf-warn` — the „sprzęt ledwo nadąża" banner. It latches once FPS sits under 40 for ≥ 3 s
 *    (the meter's own judgement) and clears when frames recover.
 *
 * This is a client-only readout: `perfStat` lives in the HUD store, never in a Colyseus schema (L6).
 */
export const PerfBadge = memo(function PerfBadge({ settings, onSettings, dormant = false }: {
  settings: Settings;
  onSettings: (s: Settings) => void;
  dormant?: boolean;
}) {
  const fps = useHudSlice((s) => s.perfStat.fps);
  const frameMs = useHudSlice((s) => s.perfStat.frameMs);
  const warn = useHudSlice((s) => s.perfStat.warn);
  const showFps = settings.hud.fps;

  const toggle = useCallback(() => {
    onSettings({ ...settings, hud: { ...settings.hud, fps: !settings.hud.fps } });
  }, [settings, onSettings]);

  if (dormant) return null;

  return (
    <div className="perf-badge">
      {(showFps || warn) && (
        <button
          type="button"
          className={`perf-fps${warn ? " low" : ""}`}
          data-testid="perf-fps"
          data-fps={fps}
          onClick={toggle}
          title="Przełącz licznik klatek"
        >
          <span className="perf-fps-num">{fps}</span> FPS
          <span className="perf-fps-ms">{frameMs.toFixed(1)} ms</span>
        </button>
      )}
      <button
        type="button"
        className="perf-toggle"
        data-testid="toggle-fps"
        aria-pressed={showFps}
        onClick={toggle}
      >
        {showFps ? "UKRYJ FPS" : "POKAŻ FPS"}
      </button>
      {warn && (
        <div className="perf-warn" data-testid="perf-warn" role="status">
          Sprzęt ledwo nadąża
        </div>
      )}
    </div>
  );
});
