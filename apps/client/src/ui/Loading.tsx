import { useHudSlice } from "../game/store";

const STAGES: [string, string][] = [
  ["connecting", "Connecting to server"],
  ["engine", "Starting renderer"],
  ["map", "Building Night District"],
  ["players", "Syncing players"],
  ["ready", "Ready"],
];

/** Startup overlay with real stage-based progress (the game reports each stage as it completes). */
export function Loading() {
  const stage = useHudSlice((s) => s.loadStage);
  const idx = Math.max(0, STAGES.findIndex(([k]) => k === stage));
  const pct = Math.round(((idx + 1) / STAGES.length) * 100);
  return (
    <div className="loading" data-testid="loading">
      <div className="loading-card">
        <div className="wordmark small">BARBERSTRIKE</div>
        <div className="loading-stage">{STAGES[idx][1]}</div>
        <div className="loading-bar"><div className="loading-fill" style={{ width: `${pct}%` }} /></div>
        <div className="loading-steps">{STAGES.map(([k, label], i) => <span key={k} className={i <= idx ? "done" : ""}>{label}</span>)}</div>
      </div>
    </div>
  );
}
