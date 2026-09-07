import { useHudSlice } from "../game/store";
const STAGES = [
  ["connecting", "Connecting to your match"], ["engine", "Preparing the game"],
  ["map", "Loading Night District"], ["players", "Preparing your team"],
  ["finishing", "Finishing the scene"], ["ready", "Your match is ready"],
];
export function Loading({ ready = false, entering = false, onEnter, onCancel }: { ready?: boolean; entering?: boolean; onEnter?: () => void; onCancel?: () => void }) {
  const stage = useHudSlice(s => s.loadStage);
  const idx = Math.max(0, STAGES.findIndex(([key]) => key === stage));
  return <div className="loading" data-testid="loading">
    <div className="loading-card">
      <div className="loading-eyebrow">NIGHT DISTRICT · AFTER HOURS</div>
      <h1>BARBERSTRIKE</h1>
      <p className="loading-stage" role="status">{entering ? "Joining the battlefield…" : ready ? "Ready when you are." : STAGES[idx][1]}</p>
      <div className="loading-bar" role="progressbar" aria-label="Loading progress" aria-valuemin={0} aria-valuemax={STAGES.length - 1} aria-valuenow={idx}><div className="loading-fill" style={{ width: `${idx / (STAGES.length - 1) * 100}%` }} /></div>
      <p className="loading-tip">{ready ? "Enter the map when you are ready. Your buy window starts on spawn." : "You will stay off the battlefield until loading is complete."}</p>
      {ready && <button className="menu-btn primary enter-game" onClick={onEnter} data-testid="enter-game" autoFocus>ENTER MATCH <span>→</span></button>}
      <div className="loading-controls"><span>WASD · MOVE</span><span>B · BUY / CLASS</span><span>ESC · PAUSE</span></div>
      <button className="link loading-back" onClick={onCancel} data-testid="loading-cancel">BACK TO MENU</button>
    </div>
  </div>;
}
