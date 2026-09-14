import type React from "react";
import { MODES } from "@frankibarber/shared";
import { useHudSlice } from "../game/store";
const STAGES = [
  ["connecting", "Łączę z meczem"], ["engine", "Przygotowuję grę"],
  ["map", "Wczytuję mapę"], ["players", "Przygotowuję drużynę"],
  ["finishing", "Kończę scenę"], ["ready", "Mecz gotowy"],
];
export function Loading({ ready = false, entering = false, onEnter, onCancel }: { ready?: boolean; entering?: boolean; onEnter?: () => void; onCancel?: () => void }) {
  const stage = useHudSlice(s => s.loadStage);
  // Known once the room state has synced (the "players" stage on); "tdm" before that.
  const mode = useHudSlice(s => s.mode);
  const idx = Math.max(0, STAGES.findIndex(([key]) => key === stage));
  const progress = Math.round((idx / (STAGES.length - 1)) * 100);
  return <div className="loading" data-testid="loading">
    <div className="loading-grain" aria-hidden="true" />
    <div className="loading-card">
      <div className="loading-eyebrow"><span /> NIGHT DISTRICT / AFTER HOURS</div>
      <h1><span>BARBER</span><strong>STRIKE</strong></h1>
      <div className="loading-rule"><i /><b>✂</b><i /></div>
      <div className="loading-readout">
        <span className="loading-step">WEJŚCIE / 0{idx + 1}</span>
        <b>{ready ? "GOTOWE" : `${progress}%`}</b>
      </div>
      <p className="loading-stage" role="status">{entering ? "Wchodzisz na osiedle…" : ready ? "Gotowe, kiedy ty." : STAGES[idx][1]}</p>
      <div className="loading-bar" role="progressbar" aria-label="Postęp ładowania" aria-valuemin={0} aria-valuemax={STAGES.length - 1} aria-valuenow={idx}><div className="loading-fill" style={{ "--v": idx / (STAGES.length - 1) } as React.CSSProperties} /></div>
      <p className="loading-tip">{ready ? "Wejdź, kiedy chcesz. Sklep otwiera się po odrodzeniu (B)." : "Zostajesz poza walką, dopóki wszystko się nie wczyta."}</p>
      {ready && <p className="loading-objective" data-testid="loading-objective"><b>{MODES[mode].name}</b> · {MODES[mode].objective}</p>}
      {ready && <button className="menu-btn primary enter-game" onClick={onEnter} data-testid="enter-game" autoFocus>WEJDŹ DO MECZU <span>→</span></button>}
      <div className="loading-controls"><span><kbd>WASD</kbd> RUCH</span><span><kbd>B</kbd> SKLEP / ROLA</span><span><kbd>ESC</kbd> PAUZA</span></div>
      <button className="link loading-back" onClick={onCancel} data-testid="loading-cancel">WRÓĆ DO MENU</button>
    </div>
    <div className="loading-corner tl" aria-hidden="true" /><div className="loading-corner br" aria-hidden="true" />
  </div>;
}
