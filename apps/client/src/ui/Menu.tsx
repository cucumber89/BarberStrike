import { useEffect, useMemo, useState } from "react";
import { BOYS_CLASSES, BOYS, WEAPONS, BOT_LEVELS, BOT_PRESETS, DEFAULT_MAP_ID, GAME_VERSION, MAPS, MAX_BOTS, MAX_NAME_LENGTH, MODES, MODE_ORDER, isGameMode, type BotLevel, type GameMode } from "@frankibarber/shared";
import { copyText, inviteLink, isMapId, mapChoices, parseInvite } from "./invite";
import { Connection, defaultServerUrl, type RoomListing } from "../game/net/Connection";
import type { Settings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  connecting: boolean;
  error?: string;
  /** `gameMode` (drop 4), `bots` (drop 5) and `mapId` (drop G) apply to quick play / create; joining by id takes the room's own. */
  onPlay: (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }, mapId: string) => void;
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
  // Drop D, join by link: what `/r/<room>?mode=…` asks for, read once at load.
  const invite = useMemo(() => parseInvite(typeof location !== "undefined" ? location.search : "", typeof location !== "undefined" ? location.pathname : ""), []);
  const [panel, setPanel] = useState<Panel>(() => (invite.room ? "lobby" : "main"));
  // A link was sent by a friend, so the lobby asks for a nickname and nothing else — the room and
  // the mode are the link's. CHANGE opens the full lobby.
  const [linkJoin, setLinkJoin] = useState(invite.viaLink && invite.room.length > 0);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobile] = useState(() => touchOnly());
  const [name, setName] = useState(settings.nickname || "");
  const [roomName, setRoomName] = useState(invite.room);
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    if (invite.mode) return invite.mode;
    try { const m = localStorage.getItem("fb_mode"); return isGameMode(m) && m !== "ffa" ? m : "tdm"; } catch { return "tdm"; }
  });
  const [boysClass, setBoysClass] = useState(() => { try { return Number(localStorage.getItem("fb_boys_class")) || 1; } catch { return 1; } });
  const pickClass = (id: number) => { setBoysClass(id); try { localStorage.setItem("fb_boys_class", String(id)); } catch { /* private mode */ } };
  const pickMode = (m: GameMode) => { setGameMode(m); try { localStorage.setItem("fb_mode", m); } catch { /* private mode */ } };
  // Drop G: the map the room plays. A link's map wins, then the last one picked here; with neither
  // it is the map the game has always opened on.
  const [mapId, setMapId] = useState<string>(() => {
    if (invite.map) return invite.map;
    try { const m = localStorage.getItem("fb_map"); return isMapId(m) ? m : DEFAULT_MAP_ID; } catch { return DEFAULT_MAP_ID; }
  });
  const pickMap = (id: string) => { setMapId(id); try { localStorage.setItem("fb_map", id); } catch { /* private mode */ } };
  const maps = useMemo(() => mapChoices(), []);
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
  const play = (mode: "auto" | "create") => onPlay(commitName(), roomName.trim(), mode, undefined, gameMode, bots, mapId);
  /** The address to send a friend: this page, the room in the path, the mode and the map in the query. */
  const link = typeof location !== "undefined" ? inviteLink(location.href, roomName, gameMode, mapId) : "";

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

        {panel === "lobby" && linkJoin && (
          <section className="panel lobby" data-testid="link-join">
            <div className="link-join">
              <div className="link-join-room">
                <span>YOU WERE INVITED TO</span>
                <b data-testid="link-room">{roomName}</b>
                <span className={`room-mode m-${gameMode}`} data-testid="link-mode" title={MODES[gameMode].name}>{MODES[gameMode].short}</span>
                <button type="button" className="link" onClick={() => setLinkJoin(false)} data-testid="btn-link-edit">CHANGE</button>
              </div>
              <div className="muted mode-blurb">{MODES[gameMode].blurb} · <span data-testid="link-map">{MAPS[mapId].name}</span></div>
              <label className="field">
                <span>NICKNAME</span>
                <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} placeholder="2–16 characters" autoFocus data-testid="input-name" onKeyDown={(e) => { if (e.key === "Enter" && nameOk && !connecting) play("auto"); }} />
              </label>
              <div className="row">
                <button className="menu-btn primary" disabled={!nameOk || connecting} onClick={() => play("auto")} data-testid="btn-quickplay">
                  {connecting ? "CONNECTING…" : "JOIN"}
                </button>
              </div>
              {!nameOk && <small className="muted">Enter a nickname of at least two characters to join.</small>}
            </div>
          </section>
        )}

        {panel === "lobby" && !linkJoin && (
          <section className="panel lobby">
            <h2>LOBBY</h2>
            <label className="field">
              <span>NICKNAME</span>
              <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} placeholder="2–16 characters" autoFocus data-testid="input-name" />
            </label>
            <label className="field">
              <span>ROOM NAME <em className="muted">optional · the code your friends type</em></span>
              <div className="row tight">
                <input value={roomName} maxLength={24} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. late-shift" data-testid="input-room" />
                <button type="button" className={`menu-btn small ${showInvite ? "" : "ghost"}`} onClick={() => setShowInvite((v) => !v)} data-testid="btn-invite">INVITE</button>
              </div>
            </label>
            {/* Drop D: the link that opens straight into this room. Joining by one is useless if
                nobody can make one, so the lobby that creates the room is where it lives. */}
            {showInvite && (
              <div className="invite-box" data-testid="invite-box">
                <div className="copy-row">
                  <input readOnly value={link} data-testid="invite-link" onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="menu-btn small" onClick={() => { void copyText(link).then((ok) => { setCopied(ok); window.setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "COPIED" : "COPY"}</button>
                </div>
                <small className="muted">Whoever opens this lands in your room, and is only asked for a nickname.</small>
              </div>
            )}
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
            {/* Drop G: the second map. Same picker as the mode above it — the room plays the one
                chosen here, and the invite link carries it so a friend lands on the same one. */}
            <div className="field">
              <span>MAP</span>
              <div className="seg" role="radiogroup" data-testid="map-picker">
                {maps.map((m) => (
                  <button key={m.id} role="radio" aria-checked={mapId === m.id} className={`seg-btn ${mapId === m.id ? "on" : ""}`} onClick={() => pickMap(m.id)} data-testid={`map-${m.id}`} title={m.name}>
                    <b>{m.name}</b>
                  </button>
                ))}
              </div>
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
              <button className="menu-btn primary" disabled={!nameOk || connecting} onClick={() => play("auto")} data-testid="btn-quickplay">
                {connecting ? "CONNECTING…" : "QUICK PLAY"}
              </button>
              <button className="menu-btn" disabled={!nameOk || connecting} onClick={() => play("create")} data-testid="btn-create">
                CREATE MATCH
              </button>
            </div>
            <div className="rooms">
              <div className="rooms-head"><span>OPEN MATCHES</span>{listError && <span className="muted">{listError}</span>}</div>
              {rooms && rooms.length === 0 && <div className="muted">No open matches. Create one.</div>}
              {rooms?.map((r) => (
                <button key={r.roomId} className="room-row" disabled={!nameOk || connecting || r.clients >= r.maxClients} onClick={() => onPlay(commitName(), "", "join", r.roomId, r.metadata?.mode ?? "tdm", bots, mapId)}>
                  <span className={`room-mode m-${r.metadata?.mode ?? "tdm"}`}>{MODES[r.metadata?.mode ?? "tdm"].short}</span>
                  <span className="room-name">{r.metadata?.name || r.roomId}{(r.metadata?.bots ?? 0) > 0 && <span className="room-bots"> · {r.metadata?.bots} bots</span>}</span>
                  {/* The listing may name the map by id (Drop G) or by name; show what the map calls itself. */}
                  <span className="room-map">{MAPS[r.metadata?.map ?? ""]?.name ?? r.metadata?.map ?? MAPS[DEFAULT_MAP_ID].name}</span>
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
