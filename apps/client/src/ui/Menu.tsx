import { useEffect, useState } from "react";
import { BOYS_CLASSES, BOYS, WEAPONS, BOT_LEVELS, BOT_PRESETS, GAME_VERSION, MAX_BOTS, MAX_NAME_LENGTH, MODES, MODE_ORDER, type BotLevel, type GameMode } from "@frankibarber/shared";
import { Connection, defaultServerUrl, type RoomListing } from "../game/net/Connection";
import type { Settings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  connecting: boolean;
  error?: string;
  /** `gameMode` (drop 4) and `bots` (drop 5) apply to quick play / create; joining by id takes the room's own. */
  onPlay: (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }) => void;
}

const CONTROLS: [string, string][] = [
  ["W A S D", "Move"], ["Mouse", "Aim"], ["LMB", "Fire"], ["RMB", "Aim down sights"], ["Shift", "Sprint · hold breath (scope)"],
  ["Shift ×2", "Tactical sprint (faster, on a budget)"], ["Q / E", "Lean left / right"], ["Space", "Jump"], ["Ctrl / C", "Crouch"],
  ["R", "Reload"], ["1 / 2 / Wheel", "Primary / sidearm"], ["3 / V", "Clippers"], ["X", "Last weapon"], ["G", "Lethal (hold to cook a frag)"],
  ["4", "Tactical grenade"], ["T (hold)", "Plant / defuse bomb · stand still"], ["B", "Buy menu"], ["F", "Inspect weapon"], ["Tab", "Scoreboard"],
  ["Enter / Y", "Chat (all / team)"], ["MMB", "Mark a spot · spot an enemy"], ["Esc", "Release mouse / pause"],
];

type Panel = "main" | "lobby" | "settings" | "controls";

/** Touch-only devices (phones/tablets) cannot play: no pointer lock, no keyboard. */
const touchOnly = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;

export function Menu({ settings, onSettings, connecting, error, onPlay }: Props) {
  const [panel, setPanel] = useState<Panel>("main");
  const [mobile] = useState(() => touchOnly());
  const [name, setName] = useState(settings.nickname || "");
  const [roomName, setRoomName] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    try { const m = localStorage.getItem("fb_mode"); return m === "boys" || m === "dom" || m === "bomb" ? m : "tdm"; } catch { return "tdm"; }
  });
  const [boysClass, setBoysClass] = useState(() => { try { return Number(localStorage.getItem("fb_boys_class")) || 1; } catch { return 1; } });
  const pickClass = (id: number) => { setBoysClass(id); try { localStorage.setItem("fb_boys_class", String(id)); } catch { /* private mode */ } };
  const pickMode = (m: GameMode) => { setGameMode(m); try { localStorage.setItem("fb_mode", m); } catch { /* private mode */ } };
  const [botCount, setBotCount] = useState(() => { try { return Math.max(0, Math.min(MAX_BOTS, Number(localStorage.getItem("fb_bots") ?? 0) || 0)); } catch { return 0; } });
  const [botLevel, setBotLevel] = useState<BotLevel>(() => { try { const l = localStorage.getItem("fb_botlevel"); return l === "easy" || l === "hard" ? l : "normal"; } catch { return "normal"; } });
  const pickBots = (n: number, l: BotLevel) => { setBotCount(n); setBotLevel(l); try { localStorage.setItem("fb_bots", String(n)); localStorage.setItem("fb_botlevel", l); } catch { /* private mode */ } };
  const bots = { count: botCount, level: botLevel };
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const nameOk = name.trim().length >= 2;

  useEffect(() => {
    if (panel !== "lobby") return;
    let alive = true;
    const refresh = async () => {
      try {
        const list = await Connection.listRooms(defaultServerUrl());
        if (alive) { setRooms(list); setListError(null); }
      } catch {
        if (alive) setListError("Server unreachable.");
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 3000);
    return () => { alive = false; window.clearInterval(id); };
  }, [panel]);

  const commitName = () => {
    const n = name.trim().slice(0, MAX_NAME_LENGTH);
    if (n !== settings.nickname) onSettings({ ...settings, nickname: n });
    return n;
  };

  return (
    <div className="menu" data-testid="menu">
      <div className="menu-inner">
        <header className="brand">
          <div className="wordmark">BARBERSTRIKE</div>
          <div className="subtitle">AFTER HOURS</div>
        </header>

        {error && <div className="notice error" role="alert">{error}</div>}

        {mobile && (
          <div className="notice" data-testid="mobile-notice">
            BARBERSTRIKE is a desktop game — it needs a mouse and keyboard. Open it on a computer in Chrome or Chromium.
          </div>
        )}

        {panel === "main" && !mobile && (
          <nav className="menu-list">
            <button className="menu-btn primary" onClick={() => setPanel("lobby")} data-testid="btn-play">PLAY</button>
            <button className="menu-btn" onClick={() => setPanel("settings")}>SETTINGS</button>
            <button className="menu-btn" onClick={() => setPanel("controls")}>CONTROLS</button>
          </nav>
        )}

        {panel === "lobby" && (
          <section className="panel lobby">
            <h2>LOBBY</h2>
            <label className="field">
              <span>NICKNAME</span>
              <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} placeholder="2–16 characters" autoFocus data-testid="input-name" />
            </label>
            <label className="field">
              <span>ROOM NAME (optional)</span>
              <input value={roomName} maxLength={24} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. late-shift" data-testid="input-room" />
            </label>
            <div className="field">
              <span>MODE</span>
              <div className="seg" role="radiogroup" data-testid="mode-picker">
                {MODE_ORDER.map((m) => (
                  <button key={m} role="radio" aria-checked={gameMode === m} className={`seg-btn ${gameMode === m ? "on" : ""}`} onClick={() => pickMode(m)} data-testid={`mode-${m}`} title={MODES[m].blurb}>
                    <b>{MODES[m].short}</b><span>{MODES[m].name}</span>
                  </button>
                ))}
              </div>
              <div className="muted mode-blurb" data-testid="mode-blurb">{MODES[gameMode].blurb}</div>
            </div>
            {gameMode === "boys" && <div className="boys-grid">{BOYS_CLASSES.map(id => <button key={id} className={`boys-class ${boysClass === id ? "on" : ""}`} aria-pressed={boysClass === id} onClick={() => pickClass(id)}><b>{id} · {BOYS[id].name}</b><span>{BOYS[id].blurb}</span><small>Free: {WEAPONS[BOYS[id].starter].name} + pistol</small></button>)}</div>}
            <div className="field bots-field">
              <span>BOTS <em data-testid="bots-count">{botCount === 0 ? "none" : `${botCount} · ${BOT_PRESETS[botLevel].name}`}</em></span>
              <div className="bots-row">
                <input type="range" min={0} max={MAX_BOTS} step={1} value={botCount} onChange={(e) => pickBots(Number(e.target.value), botLevel)} data-testid="bots-range" aria-label="Bots" />
                <div className="seg small" role="radiogroup">
                  {BOT_LEVELS.map((l) => (
                    <button key={l} role="radio" aria-checked={botLevel === l} className={`seg-btn ${botLevel === l ? "on" : ""}`} onClick={() => pickBots(botCount, l)} data-testid={`bots-${l}`}><b>{BOT_PRESETS[l].name}</b></button>
                  ))}
                </div>
              </div>
            </div>
            <div className="row">
              <button className="menu-btn primary" disabled={!nameOk || connecting} onClick={() => onPlay(commitName(), roomName.trim(), "auto", undefined, gameMode, bots)} data-testid="btn-quickplay">
                {connecting ? "CONNECTING…" : "QUICK PLAY"}
              </button>
              <button className="menu-btn" disabled={!nameOk || connecting} onClick={() => onPlay(commitName(), roomName.trim(), "create", undefined, gameMode, bots)} data-testid="btn-create">
                CREATE MATCH
              </button>
            </div>
            <div className="rooms">
              <div className="rooms-head"><span>OPEN MATCHES</span>{listError && <span className="muted">{listError}</span>}</div>
              {rooms && rooms.length === 0 && <div className="muted">No open matches. Create one.</div>}
              {rooms?.map((r) => (
                <button key={r.roomId} className="room-row" disabled={!nameOk || connecting || r.clients >= r.maxClients} onClick={() => onPlay(commitName(), "", "join", r.roomId, r.metadata?.mode ?? "tdm", bots)}>
                  <span className={`room-mode m-${r.metadata?.mode ?? "tdm"}`}>{MODES[r.metadata?.mode ?? "tdm"].short}</span>
                  <span className="room-name">{r.metadata?.name || r.roomId}{(r.metadata?.bots ?? 0) > 0 && <span className="room-bots"> · {r.metadata?.bots} bots</span>}</span>
                  <span className="room-map">{r.metadata?.map ?? "Night District"}</span>
                  <span className="room-count">{r.clients}/{r.maxClients}</span>
                </button>
              ))}
            </div>
            <button className="link" onClick={() => setPanel("main")}>← BACK</button>
          </section>
        )}

        {panel === "settings" && (
          <section className="panel">
            <h2>SETTINGS</h2>
            <SettingsPanel settings={settings} onChange={onSettings} />
            <button className="link" onClick={() => setPanel("main")}>← BACK</button>
          </section>
        )}

        {panel === "controls" && (
          <section className="panel controls">
            <h2>CONTROLS</h2>
            <table>
              <tbody>
                {CONTROLS.map(([k, v]) => (
                  <tr key={k}><td className="key">{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <button className="link" onClick={() => setPanel("main")}>← BACK</button>
          </section>
        )}
      </div>
      <footer className="menu-foot"><span data-testid="version">v{GAME_VERSION}</span> · Desktop only · Chrome / Chromium recommended</footer>
    </div>
  );
}
