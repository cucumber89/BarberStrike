import { useCallback, useEffect, useMemo, useState } from "react";
import { BOT_LEVELS, BOT_PRESETS, GAME_VERSION, MAX_BOTS, MAX_NAME_LENGTH, MODES, MODE_ORDER, type BotLevel, type GameMode } from "@frankibarber/shared";
import { Connection, defaultServerUrl, type RoomListing } from "../game/net/Connection";
import { loadProfile, type Profile } from "../game/progression/profile";
import { uiSound } from "../game/audio";
import type { Settings } from "../settings";
import { SettingsPanel, type SettingsTab } from "./SettingsPanel";
import { Armoury } from "./Armoury";
import { DailyChallenges, LevelCard, ProfilePanel } from "./Profile";
import { HowToPlay } from "./HowToPlay";
import { CopyRow, Online, ServerLine, type ServerStatus } from "./Online";
import { inviteLink, isSharedOrigin, parseInvite, suggestRoomName } from "./invite";
import { MenuCover } from "./MenuCover";

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  connecting: boolean;
  error?: string;
  /** `gameMode` (drop 4) and `bots` (drop 5) apply to quick play / create; joining by id takes the room's own. */
  onPlay: (name: string, roomName: string, mode: "auto" | "create" | "join", roomId: string | undefined, gameMode: GameMode, bots: { count: number; level: BotLevel }) => void;
}

type Panel = "main" | "lobby" | "armoury" | "profile" | "settings" | "howto" | "online";

const NAV: { id: Panel; label: string; blurb: string; testid: string }[] = [
  { id: "lobby", label: "PLAY", blurb: "Quick play, create a match, join a friend", testid: "btn-play" },
  { id: "armoury", label: "ARMOURY", blurb: "Every gun and gadget, drawn, with your mastery", testid: "btn-armoury" },
  { id: "profile", label: "PROFILE", blurb: "Level, badges, stats, today's challenges", testid: "btn-profile" },
  { id: "online", label: "PLAY ONLINE", blurb: "Invite links and how to host for friends", testid: "btn-online" },
  { id: "howto", label: "HOW TO PLAY", blurb: "The rules, the economy, the keys", testid: "btn-howto" },
  { id: "settings", label: "SETTINGS", blurb: "Mouse, graphics, audio, crosshair, keys", testid: "btn-settings" },
];

const TITLES_OF: Record<Panel, string> = { main: "", lobby: "LOBBY", armoury: "ARMOURY", profile: "PROFILE", settings: "SETTINGS", howto: "HOW TO PLAY", online: "PLAY ONLINE" };

/** Touch-only devices (phones/tablets) cannot play: no pointer lock, no keyboard. */
const touchOnly = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/**
 * The main menu (2.1). The first screen answers three questions before a click — who am I
 * (level, title, challenges), is anyone playing (server line), and how do I get my friends in
 * (invite) — and every panel is one step deep with the same BACK.
 */
export function Menu({ settings, onSettings, connecting, error, onPlay }: Props) {
  const invite = useMemo(() => parseInvite(typeof location !== "undefined" ? location.search : ""), []);
  const [panel, setPanelRaw] = useState<Panel>(() => (invite.room || invite.join ? "lobby" : "main"));
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("gameplay");
  const setPanel = useCallback((p: Panel) => { uiSound(p === "main" ? "back" : "open"); setPanelRaw(p); }, []);
  const [mobile] = useState(() => touchOnly());
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [name, setName] = useState(settings.nickname || "");
  const [roomName, setRoomName] = useState(() => invite.room || store.get("fb_room") || "");
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    if (invite.mode) return invite.mode;
    const m = store.get("fb_mode");
    return m === "ffa" || m === "dom" || m === "bomb" ? m : "tdm";
  });
  const pickMode = (m: GameMode) => { uiSound("click"); setGameMode(m); store.set("fb_mode", m); };
  const [botCount, setBotCount] = useState(() => Math.max(0, Math.min(MAX_BOTS, Number(store.get("fb_bots") ?? 0) || 0)));
  const [botLevel, setBotLevel] = useState<BotLevel>(() => { const l = store.get("fb_botlevel"); return l === "easy" || l === "hard" ? l : "normal"; });
  const pickBots = (n: number, l: BotLevel) => { setBotCount(n); setBotLevel(l); store.set("fb_bots", String(n)); store.set("fb_botlevel", l); };
  const bots = { count: botCount, level: botLevel };
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const nameOk = name.trim().length >= 2;
  const shared = typeof location !== "undefined" && isSharedOrigin(location);

  // The profile is written by the game at the whistle; re-read it whenever the menu comes back.
  useEffect(() => { setProfile(loadProfile()); }, [panel]);

  // Server line: on the main and online panels, every 5 s.
  useEffect(() => {
    if (panel !== "main" && panel !== "online" && panel !== "lobby") return;
    let alive = true;
    const url = defaultServerUrl();
    const probe = async () => { const s = await Connection.health(url); if (alive) setStatus({ ...s, url }); };
    void probe();
    const id = window.setInterval(probe, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [panel]);

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

  // A `?join=<roomId>` link goes straight to that room once there is a nickname.
  useEffect(() => {
    if (!invite.join || !nameOk || connecting) return;
    const r = rooms?.find((x) => x.roomId === invite.join);
    if (r) { history.replaceState(null, "", location.pathname); onPlay(commitName(), "", "join", r.roomId, r.metadata?.mode ?? "tdm", bots); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const commitName = () => {
    const n = name.trim().slice(0, MAX_NAME_LENGTH);
    if (n !== settings.nickname) onSettings({ ...settings, nickname: n });
    return n;
  };
  const play = (mode: "auto" | "create") => {
    uiSound("click");
    store.set("fb_room", roomName.trim());
    onPlay(commitName(), roomName.trim(), mode, undefined, gameMode, bots);
  };
  const link = typeof location !== "undefined" ? inviteLink(location.href, roomName, gameMode) : "";

  return (
    <div className={`menu ${panel === "main" ? "" : "sub"}`} data-testid="menu" data-panel={panel}>
      {!mobile && <MenuCover dim={panel !== "main"} />}
      <div className={`menu-inner ${panel === "main" ? "" : "wide"}`}>
        <header className={`brand ${panel === "main" ? "" : "row"}`}>
          {panel === "main" ? (
            <><div className="wordmark">BARBERSTRIKE</div><div className="subtitle">AFTER HOURS</div></>
          ) : (
            <>
              <button className="link back" onClick={() => setPanel("main")} data-testid="btn-back">← MENU</button>
              <div className="wordmark small">BARBERSTRIKE</div>
              <h2>{TITLES_OF[panel]}</h2>
            </>
          )}
        </header>

        {error && <div className="notice error" role="alert">{error}</div>}

        {mobile && (
          <div className="notice" data-testid="mobile-notice">
            BARBERSTRIKE is a desktop game — it needs a mouse and keyboard. Open it on a computer in Chrome or Chromium.
          </div>
        )}

        {panel === "main" && !mobile && (
          <div className="main-grid">
            <nav className="menu-list">
              {NAV.map((n, i) => (
                <button key={n.id} className={`menu-btn ${i === 0 ? "primary" : ""}`} onClick={() => setPanel(n.id)} data-testid={n.testid}>
                  {n.label}<small>{n.blurb}</small>
                </button>
              ))}
            </nav>
            <aside className="side">
              <LevelCard profile={profile} compact />
              <DailyChallenges profile={profile} />
              <ServerLine status={status} />
              {shared && <button className="menu-btn small" onClick={() => setPanel("online")} data-testid="btn-invite-main">INVITE FRIENDS</button>}
            </aside>
          </div>
        )}

        {panel === "lobby" && (
          <section className="panel lobby">
            <div className="lobby-grid">
              <div>
                <label className="field">
                  <span>NICKNAME</span>
                  <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} placeholder="2–16 characters" autoFocus data-testid="input-name" />
                </label>
                <label className="field">
                  <span>ROOM NAME <em className="muted">optional · the code your friends type</em></span>
                  <div className="row tight">
                    <input value={roomName} maxLength={24} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. late-shift" data-testid="input-room" />
                    <button type="button" className="shop-btn ghost" title="Suggest a room name" onClick={() => { uiSound("click"); setRoomName(suggestRoomName()); }} data-testid="btn-suggest-room">RANDOM</button>
                    <button type="button" className={`shop-btn ${showInvite ? "" : "ghost"}`} onClick={() => { uiSound("click"); setShowInvite((v) => !v); }} data-testid="btn-invite">INVITE</button>
                  </div>
                </label>
                {showInvite && (
                  <div className="invite-box" data-testid="invite-box">
                    <CopyRow value={link} testid="invite-link" />
                    <small className="muted">{shared ? "Whoever opens this lands in your room." : "This address only works on this computer — see PLAY ONLINE to host for friends."}</small>
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
                  <small className="muted">Bots fill the room so a match starts with one human. They buy, throw and talk back.</small>
                </div>
                <div className="row">
                  <button className="menu-btn primary" disabled={!nameOk || connecting} onClick={() => play("auto")} data-testid="btn-quickplay">
                    {connecting ? "CONNECTING…" : "QUICK PLAY"}
                  </button>
                  <button className="menu-btn" disabled={!nameOk || connecting} onClick={() => play("create")} data-testid="btn-create">
                    CREATE MATCH
                  </button>
                </div>
                {!nameOk && <small className="muted">Enter a nickname of at least two characters to play.</small>}
              </div>
              <div className="rooms">
                <div className="rooms-head"><span>OPEN MATCHES</span>{listError ? <span className="muted">{listError}</span> : <ServerLine status={status} />}</div>
                {rooms && rooms.length === 0 && <div className="muted">No open matches. Create one — or press QUICK PLAY and be the first.</div>}
                {rooms?.map((r) => (
                  <button key={r.roomId} className="room-row" disabled={!nameOk || connecting || r.clients >= r.maxClients} onClick={() => { uiSound("click"); onPlay(commitName(), "", "join", r.roomId, r.metadata?.mode ?? "tdm", bots); }}>
                    <span className={`room-mode m-${r.metadata?.mode ?? "tdm"}`}>{MODES[r.metadata?.mode ?? "tdm"].short}</span>
                    <span className="room-name">{r.metadata?.name || r.roomId}{(r.metadata?.bots ?? 0) > 0 && <span className="room-bots"> · {r.metadata?.bots} bots</span>}</span>
                    <span className="room-map">{r.metadata?.map ?? "Night District"}</span>
                    <span className="room-count">{r.clients}/{r.maxClients}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {panel === "armoury" && <section className="panel"><Armoury weapons={profile.weapons} /></section>}
        {panel === "profile" && <section className="panel"><ProfilePanel profile={profile} onChange={setProfile} /></section>}
        {panel === "online" && <section className="panel"><Online status={status} room={roomName.trim()} mode={gameMode} /></section>}
        {panel === "howto" && <section className="panel"><HowToPlay settings={settings} onControls={() => { setSettingsTab("controls"); setPanel("settings"); }} /></section>}
        {panel === "settings" && (
          <section className="panel">
            <SettingsPanel key={settingsTab} settings={settings} onChange={onSettings} initialTab={settingsTab} />
          </section>
        )}
      </div>
      <footer className="menu-foot"><span data-testid="version">v{GAME_VERSION}</span> · Desktop only · Chrome / Chromium recommended</footer>
    </div>
  );
}
