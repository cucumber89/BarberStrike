import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOYS_CLASSES, BOYS, BUILDS, buildDef, HAIRCUTS, WEAPONS, BOT_LEVELS, BOT_PRESETS, DEFAULT_MAP_ID, GAME_VERSION, MAPS, MAX_BOTS, MAX_NAME_LENGTH, MODES, MODE_ORDER, isGameMode, type BotLevel, type GameMode } from "@frankibarber/shared";
import { equippedBuild, equippedHaircut, ownedCuts } from "../game/progression/profile";
import { copyText, inviteLink, isMapId, mapChoices, parseInvite } from "./invite";
import { Connection, defaultServerUrl, type RoomListing } from "../game/net/Connection";
import type { Settings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";
import { MODE_ART, NAV_ART, mapArt } from "./menuArt";
import { Armoury } from "./Armoury";
import "./menu.css";

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  connecting: boolean;
  error?: string;
  /** `gameMode` (drop 4), `bots` (drop 5) and `mapId` (drop G) apply to quick play / create; joining by id takes the room's own. */
  onPlay: (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }, mapId: string) => void;
}

const CONTROLS: [string, string, string][] = [
  ["W A S D", "Move", "move"], ["Mouse", "Aim", "move"], ["Shift", "Sprint · hold breath (scope)", "move"],
  ["Shift ×2", "Tactical sprint (faster, on a budget)", "move"], ["Space", "Jump", "move"], ["Ctrl / C", "Crouch", "move"],
  ["Q / E", "Lean left / right", "move"],
  ["LMB", "Fire", "fight"], ["RMB", "Aim down sights", "fight"], ["R", "Reload", "fight"],
  ["1 / 2 / Wheel", "Primary / sidearm", "fight"], ["3 / V", "Clippers", "fight"], ["X", "Last weapon", "fight"],
  ["G", "Lethal (hold to cook a frag)", "fight"], ["4", "Tactical grenade", "fight"], ["F", "Inspect weapon", "fight"],
  ["B", "Buy menu", "team"], ["T (hold)", "Plant / defuse bomb · stand still", "team"], ["Tab", "Scoreboard", "team"],
  ["Enter / Y", "Chat (all / team)", "team"], ["MMB", "Mark a spot · spot an enemy", "team"], ["Esc", "Release mouse / pause", "team"],
];
const CONTROL_GROUPS: [string, string][] = [["move", "MOVEMENT"], ["fight", "COMBAT"], ["team", "TEAM & MATCH"]];

type Panel = "main" | "lobby" | "settings" | "controls" | "armoury";

/** Touch-only devices (phones/tablets) cannot play: no pointer lock, no keyboard. */
const touchOnly = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;

/** How the mode reads on its card, in two words: who is on your side, and what ends the match. */
const modeTag = (m: GameMode): string => `${MODES[m].teams ? "TEAMS" : "SOLO"} · TO ${MODES[m].scoreLimit}`;

/** The map's real footprint, from its own bounds — a picker that says "34 × 18 m" says something. */
const mapSize = (id: string): string => {
  const b = MAPS[id]?.bounds;
  if (!b) return "";
  return `${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxZ - b.minZ)} m`;
};

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
  // Drop E: the wardrobe. Owned is DERIVED from the lifetime counters, never stored, so the list
  // cannot drift from what earned it; the equipped id is the only thing written down.
  const owned = new Set(ownedCuts().map((h) => h.id));
  const [haircut, setHaircut] = useState(() => equippedHaircut());
  // Re-read on every return from the wardrobe rather than pushed up through a callback: the build
  // has no other reader in the lobby, and a second `on…` prop for one label is not worth the wiring.
  const [build, setBuild] = useState(() => equippedBuild());
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
  const [refreshing, setRefreshing] = useState(false);
  const nickRef = useRef<HTMLInputElement>(null);
  const nameOk = name.trim().length >= 2;

  /**
   * The room list is polled on the TITLE screen too, not only in the lobby: "is anyone playing?"
   * is the first question a player has, and the old menu made you press PLAY and scroll to the
   * bottom of a column to answer it. One request every three seconds, same as before.
   */
  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const list = await Connection.listRooms(defaultServerUrl());
      setRooms(list); setListError(null);
    } catch {
      setListError("Server unreachable");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (panel !== "lobby" && panel !== "main") return;
    let alive = true;
    const tick = () => { if (alive) void refresh(); };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => { alive = false; window.clearInterval(id); };
  }, [panel, refresh]);

  /** Joinable first, then the fullest — you want the room where the match is already happening. */
  const listed = useMemo(() => {
    if (!rooms) return null;
    return [...rooms].sort((a, b) => {
      const openA = a.clients < a.maxClients ? 0 : 1, openB = b.clients < b.maxClients ? 0 : 1;
      return openA - openB || b.clients - a.clients;
    });
  }, [rooms]);
  /** Three states, not two: the first request has not come back yet, and that is not "offline". */
  const netState = listError ? "off" : rooms ? "on" : "";
  const playersOnline = rooms?.reduce((n, r) => n + r.clients, 0) ?? 0;

  const commitName = () => {
    const n = name.trim().slice(0, MAX_NAME_LENGTH);
    if (n !== settings.nickname) onSettings({ ...settings, nickname: n });
    return n;
  };
  const play = (mode: "auto" | "create") => onPlay(commitName(), roomName.trim(), mode, undefined, gameMode, bots, mapId);
  /**
   * A greyed-out match list is the wrong answer to "you have not typed a nickname yet": it makes
   * the half of the lobby a player came for look broken. The rows stay live and send the click to
   * the field that is actually missing.
   */
  const joinRoom = (r: RoomListing) => {
    if (!nameOk) { nickRef.current?.focus(); nickRef.current?.select(); return; }
    onPlay(commitName(), "", "join", r.roomId, r.metadata?.mode ?? "tdm", bots, mapId);
  };
  /** The address to send a friend: this page, the room in the path, the mode and the map in the query. */
  const link = typeof location !== "undefined" ? inviteLink(location.href, roomName, gameMode, mapId) : "";

  const status = (
    <div className={`mm-status ${netState}`} data-testid="server-status">
      <span className="mm-dot" />
      {rooms && !listError
        ? <span>{rooms.length === 0 ? "NO OPEN MATCHES" : `${rooms.length} ${rooms.length === 1 ? "MATCH" : "MATCHES"}`} · {playersOnline} {playersOnline === 1 ? "PLAYER" : "PLAYERS"}</span>
        : <span>{listError ?? "CONTACTING SERVER…"}</span>}
    </div>
  );

  /** One match, as the server browser and the title screen's live panel both draw it. */
  const roomLine = (r: RoomListing) => {
    const mode = r.metadata?.mode ?? "tdm";
    return (
      <>
        <span className={`srv-mode m-${mode}`}>{MODES[mode].short}</span>
        <span className="srv-main">
          <b className="srv-name">{r.metadata?.name || r.roomId}</b>
          {/* The listing may name the map by id (Drop G) or by name; show what the map calls itself. */}
          <span className="srv-meta">
            {MAPS[r.metadata?.map ?? ""]?.name ?? r.metadata?.map ?? MAPS[DEFAULT_MAP_ID].name}
            {(r.metadata?.bots ?? 0) > 0 && ` · ${r.metadata?.bots} ${r.metadata?.bots === 1 ? "bot" : "bots"}`}
          </span>
        </span>
        <span className="srv-count">
          <b>{r.clients}<i>/</i>{r.maxClients}</b>
          <span className="srv-bar"><i style={{ width: `${Math.round((r.clients / Math.max(1, r.maxClients)) * 100)}%` }} /></span>
        </span>
      </>
    );
  };

  /** What the list has to say when it has no rooms to show — looking, empty, or unreachable. */
  const emptyList = (short: boolean) => {
    if (listError) return <div className="srv-empty err">{listError}.{short ? "" : " The list refreshes by itself once it is back."}</div>;
    if (listed === null) return <div className="srv-empty">Looking for matches…</div>;
    if (listed.length === 0) {
      return (
        <div className="srv-empty">
          <b>No open matches.</b>
          <span>{short ? "Press PLAY and start one." : "Start one with QUICK PLAY, or name a room below and send a friend the link."}</span>
        </div>
      );
    }
    return null;
  };

  const nickField = (autoFocus: boolean) => (
    <label className="mm-field nick">
      <span>NICKNAME</span>
      <input
        ref={nickRef} value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)}
        placeholder="2–16 characters" autoFocus={autoFocus} data-testid="input-name"
        onKeyDown={(e) => { if (e.key === "Enter" && nameOk && !connecting) play("auto"); }}
      />
    </label>
  );

  return (
    <div className="menu" data-testid="menu">
      <div className="mm-bg" aria-hidden="true" />

      {panel === "main" && (
        <div className="mm-title">
          <div className="mm-title-grid">
            <div className="mm-title-left">
              <header className="mm-hero">
                <div className="mm-pole" aria-hidden="true" />
                <div>
                  <h1 className="wordmark">BARBERSTRIKE</h1>
                  <div className="subtitle">AFTER HOURS</div>
                  <p className="mm-tagline">The district is closed. The chairs are empty. Nobody is here for a haircut.</p>
                </div>
              </header>

              {error && <div className="mm-notice error" role="alert">{error}</div>}
              {mobile && (
                <div className="mm-notice" data-testid="mobile-notice">
                  BARBERSTRIKE is a desktop game — it needs a mouse and keyboard. Open it on a computer in Chrome or Chromium.
                </div>
              )}

              {!mobile && (
                <nav className="mm-nav">
                  <button className="mm-nav-btn primary" onClick={() => setPanel("lobby")} data-testid="btn-play">
                    <i className="mm-nav-no">01</i><span className="mm-nav-art"><NAV_ART.play /></span>
                    <b>PLAY</b><em>Pick a mode, pick a match</em><span className="mm-nav-go">▸</span>
                  </button>
                  <button className="mm-nav-btn" onClick={() => setPanel("settings")} data-testid="btn-settings">
                    <i className="mm-nav-no">02</i><span className="mm-nav-art"><NAV_ART.settings /></span>
                    <b>SETTINGS</b><em>Crosshair, graphics, audio, keys</em><span className="mm-nav-go">▸</span>
                  </button>
                  <button className="mm-nav-btn" onClick={() => setPanel("controls")} data-testid="btn-controls">
                    <i className="mm-nav-no">03</i><span className="mm-nav-art"><NAV_ART.controls /></span>
                    <b>CONTROLS</b><em>Every key on one card</em><span className="mm-nav-go">▸</span>
                  </button>
                  <button className="mm-nav-btn" onClick={() => setPanel("armoury")} data-testid="btn-armoury">
                    <i className="mm-nav-no">04</i><span className="mm-nav-art"><NAV_ART.armoury /></span>
                    <b>SZAFA</b><em>Postać, skiny broni i kolekcja</em><span className="mm-nav-go">▸</span>
                  </button>
                </nav>
              )}
            </div>

            {/* "Is anyone playing?" is the first question, so it is answered on the front page and
                not four clicks in. Read-only here — joining needs a nickname, which the lobby asks
                for — so the panel's job is to say what is running and hand you to the browser. */}
            <aside className="mm-live" data-testid="live-matches">
              <div className="srv-head">
                <h2 className="lb-h">LIVE MATCHES</h2>
                <button type="button" className={`srv-refresh ${refreshing ? "busy" : ""}`} onClick={() => void refresh()} title="Refresh the list">⟳</button>
              </div>
              <div className="mm-live-list">
                {emptyList(true)}
                {listed?.slice(0, 4).map((r) => (
                  <div className="srv-row static" key={r.roomId}>{roomLine(r)}</div>
                ))}
              </div>
              {!mobile && listed && listed.length > 0 && (
                <button type="button" className="mm-link" onClick={() => setPanel("lobby")}>
                  {listed.length > 4 ? `ALL ${listed.length} MATCHES ▸` : "OPEN THE MATCH LIST ▸"}
                </button>
              )}
            </aside>
          </div>

          <footer className="mm-title-foot">
            {status}
            <span className="mm-version" data-testid="version">v{GAME_VERSION}</span>
          </footer>
        </div>
      )}

      {panel !== "main" && (
        <div className="mm-shell">
          <header className="mm-bar">
            <button className="mm-back" onClick={() => setPanel("main")} data-testid="btn-back">◂ BACK</button>
            <div className="mm-bar-brand"><b>BARBERSTRIKE</b><span>{panel === "lobby" ? "LOBBY" : panel === "settings" ? "SETTINGS" : panel === "armoury" ? "SZAFA" : "CONTROLS"}</span></div>
            {panel === "lobby" ? status : <span className="mm-version">v{GAME_VERSION}</span>}
          </header>

          {error && <div className="mm-notice error" role="alert">{error}</div>}

          {panel === "lobby" && linkJoin && (
            <section className="mm-content link-join" data-testid="link-join">
              <div className="lj-card">
                <div className="lj-head">
                  <span className="lj-eyebrow">YOU WERE INVITED TO</span>
                  <b data-testid="link-room">{roomName}</b>
                  <button type="button" className="mm-link" onClick={() => setLinkJoin(false)} data-testid="btn-link-edit">CHANGE</button>
                </div>
                <div className="lj-meta">
                  <span className={`srv-mode m-${gameMode}`} data-testid="link-mode" title={MODES[gameMode].name}>{MODES[gameMode].short}</span>
                  <span className="lj-map" data-testid="link-map">{MAPS[mapId].name}</span>
                </div>
                <p className="mm-blurb">{MODES[gameMode].blurb}</p>
                {nickField(true)}
                <button className="mm-btn primary big" disabled={!nameOk || connecting} onClick={() => play("auto")} data-testid="btn-quickplay">
                  {connecting ? "CONNECTING…" : "JOIN MATCH"}
                </button>
                {!nameOk && <small className="mm-hint">Enter a nickname of at least two characters to join.</small>}
              </div>
            </section>
          )}

          {panel === "lobby" && !linkJoin && (
            <>
              <section className="mm-content lobby-grid">
                {/* ---------------------------------------------------------------- match setup */}
                <div className="lb-setup">
                  <div className="lb-block wide">
                    <h2 className="lb-h"><em>01</em> TRYB GRY</h2>
                    <div className="mode-grid" role="radiogroup" aria-label="Game mode" data-testid="mode-picker">
                      {MODE_ORDER.map((m) => {
                        const Art = MODE_ART[m];
                        return (
                          <button
                            key={m} role="radio" aria-checked={gameMode === m} className={`mode-card ${gameMode === m ? "on" : ""}`}
                            onClick={() => pickMode(m)} data-testid={`mode-${m}`} title={MODES[m].blurb}
                          >
                            <span className="mode-art"><Art /></span>
                            <b>{MODES[m].name}</b>
                            <span className="mode-tag">{modeTag(m)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mm-blurb" data-testid="mode-blurb">{MODES[gameMode].blurb}</p>
                  </div>

                  {gameMode === "boys" && (
                    <div className="lb-block wide">
                      <h2 className="lb-h"><em>02</em> KLASA</h2>
                      <div className="boys-grid">
                        {BOYS_CLASSES.map((id) => (
                          <button key={id} className={`boys-class ${boysClass === id ? "on" : ""}`} aria-pressed={boysClass === id} onClick={() => pickClass(id)}>
                            <b>{id} · {BOYS[id].name}</b>
                            <span>{BOYS[id].blurb}</span>
                            <small>Free: {WEAPONS[BOYS[id].starter].name} + pistol</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="lb-block">
                    <h2 className="lb-h"><em>{gameMode === "boys" ? "03" : "02"}</em> MAPA</h2>
                    <div className="map-grid" role="radiogroup" aria-label="Map" data-testid="map-picker">
                      {maps.map((m) => {
                        const Plan = mapArt(m.id);
                        return (
                          <button
                            key={m.id} role="radio" aria-checked={mapId === m.id} className={`map-card ${mapId === m.id ? "on" : ""}`}
                            onClick={() => pickMap(m.id)} data-testid={`map-${m.id}`} title={m.name}
                          >
                            <span className="map-plan"><Plan /></span>
                            <b>{m.name}</b>
                            <span className="map-size">{mapSize(m.id)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lb-block">
                    <h2 className="lb-h"><em>{gameMode === "boys" ? "04" : "03"}</em> BOTY <span data-testid="bots-count">{botCount === 0 ? "BRAK" : `${botCount} · ${BOT_PRESETS[botLevel].name}`}</span></h2>
                    <div className="bots-row">
                      <input type="range" min={0} max={MAX_BOTS} step={1} value={botCount} onChange={(e) => pickBots(Number(e.target.value), botLevel)} data-testid="bots-range" aria-label="Bots" />
                      <b className="bots-num">{botCount}</b>
                    </div>
                    <div className="seg" role="radiogroup" aria-label="Bot level">
                      {BOT_LEVELS.map((l) => (
                        <button key={l} role="radio" aria-checked={botLevel === l} className={`seg-btn ${botLevel === l ? "on" : ""}`} disabled={botCount === 0} onClick={() => pickBots(botCount, l)} data-testid={`bots-${l}`}>
                          {BOT_PRESETS[l].name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lb-block wide lobby-look" data-testid="haircut-picker">
                    <div><h2 className="lb-h">WYGLĄD POSTACI</h2><b>{buildDef(build).name} · {HAIRCUTS.find(h=>h.id===haircut)?.name}</b><small>{BUILDS.length} sylwetek · {owned.size}/{HAIRCUTS.length} fryzur w kolekcji · wybór zapisany dla nowego pokoju</small></div>
                    <button type="button" onClick={()=>setPanel("armoury")}>OTWÓRZ SZAFĘ ▸</button>
                  </div>
                </div>

                {/* ------------------------------------------------------------- server browser */}
                <div className="lb-servers">
                  <div className="srv-head">
                    <h2 className="lb-h">OPEN MATCHES</h2>
                    <button type="button" className={`srv-refresh ${refreshing ? "busy" : ""}`} onClick={() => void refresh()} data-testid="btn-refresh" title="Refresh the list">
                      ⟳ REFRESH
                    </button>
                  </div>

                  <div className="srv-list" data-testid="room-list">
                    {emptyList(false)}
                    {listed?.map((r) => {
                      const full = r.clients >= r.maxClients;
                      return (
                        <button
                          key={r.roomId} className={`srv-row ${full ? "full" : ""}`} data-testid={`room-${r.roomId}`}
                          disabled={connecting || full} onClick={() => joinRoom(r)}
                          title={full ? "This match is full" : !nameOk ? "Enter a nickname first" : `Join ${r.metadata?.name || r.roomId}`}
                        >
                          {roomLine(r)}
                          <span className="srv-go">{full ? "FULL" : "JOIN ▸"}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Drop D: the link that opens straight into this room. Joining by one is useless
                      if nobody can make one, so the lobby that creates the room is where it lives. */}
                  <div className="srv-private">
                    <h2 className="lb-h">PRIVATE ROOM</h2>
                    <div className="row tight">
                      <input value={roomName} maxLength={24} onChange={(e) => setRoomName(e.target.value)} placeholder="room code · e.g. late-shift" data-testid="input-room" aria-label="Room name" />
                      <button type="button" className={`mm-btn small ${showInvite ? "on" : ""}`} onClick={() => setShowInvite((v) => !v)} data-testid="btn-invite">INVITE</button>
                    </div>
                    {showInvite ? (
                      <div className="invite-box" data-testid="invite-box">
                        <div className="row tight">
                          <input readOnly value={link} data-testid="invite-link" onFocus={(e) => e.currentTarget.select()} />
                          <button type="button" className="mm-btn small" onClick={() => { void copyText(link).then((ok) => { setCopied(ok); window.setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "COPIED" : "COPY"}</button>
                        </div>
                        <small className="mm-hint">Whoever opens this lands in your room, and is only asked for a nickname.</small>
                      </div>
                    ) : (
                      <small className="mm-hint">Optional. Friends who type the same code land in the same match.</small>
                    )}
                  </div>
                </div>
              </section>

              {/* --------------------------------------------------------------------- launch */}
              <footer className="lb-launch">
                {nickField(true)}
                <div className="lb-launch-read">
                  <span className="lb-launch-mode">{MODES[gameMode].name}</span>
                  <span className="lb-launch-sub">{MAPS[mapId].name} · {botCount === 0 ? "no bots" : `${botCount} bots · ${BOT_PRESETS[botLevel].name}`}</span>
                </div>
                <div className="lb-launch-btns">
                  <button className="mm-btn primary big" disabled={!nameOk || connecting} onClick={() => play("auto")} data-testid="btn-quickplay">
                    {connecting ? "CONNECTING…" : "QUICK PLAY ▸"}
                  </button>
                  <button className="mm-btn big" disabled={!nameOk || connecting} onClick={() => play("create")} data-testid="btn-create">
                    CREATE MATCH
                  </button>
                </div>
                {!nameOk && <small className="mm-hint launch-hint">A nickname of at least two characters is all that is missing.</small>}
              </footer>
            </>
          )}

          {panel === "settings" && (
            <section className="mm-content">
              {/* `panel` is what gives the settings panel's own <h3> headings their style — the
                  pause card renders the same component, so the class stays on the wrapper. */}
              <div className="mm-card panel"><SettingsPanel settings={settings} onChange={onSettings} /></div>
            </section>
          )}

          {panel === "controls" && (
            <section className="mm-content">
              <div className="mm-card keys-grid">
                {CONTROL_GROUPS.map(([group, label]) => (
                  <div className="keys-col" key={group}>
                    <h2 className="lb-h">{label}</h2>
                    {CONTROLS.filter(([, , g]) => g === group).map(([k, v]) => (
                      <div className="keys-row" key={k}><kbd>{k}</kbd><span>{v}</span></div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {panel === "armoury" && (
            <div className="mm-content armoury-content"><Armoury onHaircut={setHaircut} onBuild={setBuild} /></div>
          )}
        </div>
      )}
    </div>
  );
}
