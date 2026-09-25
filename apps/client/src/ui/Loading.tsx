import type React from "react";
import { DUEL_MAP_ID, MODES, TEAM_NAMES, scoreLimitFor, type GameMode } from "@frankibarber/shared";
import { useHudSlice } from "../game/store";
import { MODE_TITLE, mapTitle, modeGoal } from "./hud/copy";

/**
 * The loading card (zone `loading`, docs/UI_U_SPEC.md §5.2 #64–65), the way CS2 and Call of Duty
 * load a match: WHERE (the map, as the eyebrow), WHAT (the mode, as the title), the goal in one
 * line, one bar with one word for the step it is on, and — once it is ready — which side you are
 * on, one button and the three keys you need first. Nothing else: the brand, the step counter
 * („WEJŚCIE / 03”) and the tagline („AFTER HOURS”) are gone, and so is the sentence about the shop.
 *
 * The mode and the map come from the MENU (`gameMode`, `mapId`: the arguments of `App.play`), because
 * the store only learns them when the room syncs (`loadStage` "players", `Game.ts:224`) and until
 * then holds the default "tdm" — which is how the old card announced TEAM DEATHMATCH over a Bomb
 * match. Joining a room by its id, the menu does not know them either, and the card says so
 * („DOŁĄCZANIE DO POKOJU”) until the room does.
 */
const STAGES = ["connecting", "engine", "map", "players", "finishing", "ready"] as const;
/** One word or two per step, uppercase, in Polish; the last one is the one GOTOWE on the card. */
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  connecting: "ŁĄCZENIE",
  engine: "START SILNIKA",
  map: "ŁADOWANIE MAPY",
  players: "ŁADOWANIE GRACZY",
  finishing: "PRZYGOTOWANIE SCENY",
  ready: "GOTOWE",
};
/** Sides a loading card may name. Ostrzyżeni's are drawn at the round, the 1 v 1 has no team. */
const NAMED_SIDES = new Set<GameMode>(["tdm", "dom", "boys", "bomb"]);

/**
 * The map the room will really play (§5.2 #64). The server puts a duel and a tournament on the 1 v 1
 * arena whatever the lobby asked for (`TdmRoom.ts` `get duel()` → `MAPS[DUEL_MAP_ID]`), so for them
 * the menu's map is not the truth — and `store.mapId` has no producer yet, so the card cannot wait
 * for the room to correct it. `App.play` passes this, and the card applies it to the room's mode too.
 */
export const pickedMap = (gameMode: GameMode | undefined, mapId: string): string =>
  gameMode === "duel" || gameMode === "turniej" ? DUEL_MAP_ID : mapId;

export interface LoadingProps {
  ready?: boolean;
  /** WEJDŹ DO MECZU was pressed: the black is coming in over this card. */
  entering?: boolean;
  /** The menu's pick; undefined when joining a room by its id (§5.2 #64). */
  gameMode?: GameMode;
  mapId?: string;
  onEnter?: () => void;
  onCancel?: () => void;
}

export function Loading({ ready = false, entering = false, gameMode, mapId, onEnter, onCancel }: LoadingProps) {
  const stage = useHudSlice((s) => s.loadStage);
  const idx = Math.max(0, STAGES.indexOf(stage as (typeof STAGES)[number]));
  // The room is synced from "players" on: from then on ITS mode and map are the truth.
  const synced = idx >= STAGES.indexOf("players");
  const roomMode = useHudSlice((s) => s.mode);
  const roomMap = useHudSlice((s) => s.mapId);
  const bodies = useHudSlice((s) => s.players.length);
  const myTeam = useHudSlice((s) => s.myTeam);
  const mode: GameMode | undefined = synced ? roomMode : gameMode;
  const map = mapTitle(pickedMap(mode, (synced && roomMap) || mapId || ""));
  const progress = idx / (STAGES.length - 1);
  const label = ready ? STAGE_LABEL.ready : entering ? "WCHODZISZ" : STAGE_LABEL[STAGES[idx]];
  return (
    <div className="loading" data-testid="loading" data-zone="loading">
      <div className="loading-grain" aria-hidden="true" />
      <div className="loading-card">
        {mode && map && <div className="loading-eyebrow">{map}</div>}
        <h1 className="loading-title">{mode ? MODE_TITLE[mode] : "DOŁĄCZANIE DO POKOJU"}</h1>
        {mode && <p className="loading-objective" data-testid="loading-objective">{modeGoal(mode, synced ? scoreLimitFor(mode, bodies) : undefined)}</p>}
        <div className="loading-step" role="status">
          <span>{label}</span>
          {!ready && !entering && <b>{Math.round(progress * 100)}%</b>}
        </div>
        <div className="loading-bar" role="progressbar" aria-label="Postęp ładowania" aria-valuemin={0} aria-valuemax={STAGES.length - 1} aria-valuenow={idx}>
          <div className="loading-fill" style={{ "--v": ready || entering ? 1 : progress } as React.CSSProperties} />
        </div>
        {ready && mode && NAMED_SIDES.has(mode) && MODES[mode].teams && (
          <p className="loading-side" data-team={myTeam}>GRASZ W <b>{TEAM_NAMES[myTeam]}</b></p>
        )}
        {ready && <button className="enter-game" onClick={onEnter} data-testid="enter-game" autoFocus>WEJDŹ DO MECZU</button>}
        {ready && (
          <p className="loading-keys">
            <span><kbd>WASD</kbd> RUCH</span>
            {mode && MODES[mode].shop !== "none" && <span><kbd>B</kbd> SKLEP</span>}
            <span><kbd>ESC</kbd> MENU</span>
          </p>
        )}
        <button className="loading-back" onClick={onCancel} data-testid="loading-cancel">WRÓĆ DO MENU</button>
      </div>
    </div>
  );
}
