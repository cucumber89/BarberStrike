import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOYS_CLASSES, BOYS, BUILDS, OUTFITS, buildDef, outfitDef, HAIRCUTS, WEAPONS, BOT_LEVELS, BOT_PRESETS, DEFAULT_MAP_ID, DUEL_MAP_ID, GAME_VERSION, MAPS, MAX_BOTS, MAX_NAME_LENGTH, MAX_PLAYERS, MODES, MODE_ORDER, TOURNAMENT, isGameMode, isOpenMode, type BotLevel, type GameMode } from "@frankibarber/shared";
import { equippedBuild, equippedHaircut, equippedOutfit, ownedCuts } from "../game/progression/profile";
import { copyText, inviteLink, isLobbyInvite, isMapId, mapChoices, parseInvite } from "./invite";
import { Lobby, LOBBY_SIZES, isLobbySize } from "./lobby";
import type { TournamentSize } from "@frankibarber/shared";
import { Connection, defaultServerUrl, type RoomListing } from "../game/net/Connection";
import type { Settings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";
import { MODE_ART, NAV_ART, mapArt } from "./menuArt";
import { Armoury } from "./Armoury";
import { Crates } from "./Crates";
import { Account } from "./Account";
import { Welcome } from "./onboarding/Welcome";
import { loadOnboard } from "./onboarding/tutorialRules";
import { tutorial } from "./onboarding/tutorialStore";
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

type Panel = "main" | "lobby" | "settings" | "controls" | "armoury" | "tournament" | "account";

/** Touch-only devices (phones/tablets) cannot play: no pointer lock, no keyboard. */
const touchOnly = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;

/** How the mode reads on its card, in two words: who is on your side, and what ends the match. */
/** Matches the front page lists before it sends you to the full browser. Six fills the rail. */
const MAIN_ROWS = 6;

const modeTag = (m: GameMode): string => `${MODES[m].teams ? "DRUŻYNY" : "SOLO"} · DO ${MODES[m].scoreLimit}`;

/** The map's real footprint, from its own bounds — a picker that says "34 × 18 m" says something. */
const mapSize = (id: string): string => {
  const b = MAPS[id]?.bounds;
  if (!b) return "";
  return `${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxZ - b.minZ)} m`;
};

export function Menu({ settings, onSettings, connecting, error, onPlay }: Props) {
  // Drop D, join by link: what `/r/<room>?mode=…` asks for, read once at load.
  const invite = useMemo(() => parseInvite(typeof location !== "undefined" ? location.search : "", typeof location !== "undefined" ? location.pathname : ""), []);
  // Drop V (P5): a `mode=lobby` link opens straight into the tournament waiting-room join flow. It is
  // read from the raw query (parseInvite drops `lobby`, which is not a game mode), and the room it
  // names is the lobby to join. A guest joins by room name; the host reaches this panel via the
  // ZAŁÓŻ TURNIEJ button, which sets a size.
  const lobbyInvite = useMemo(() => typeof location !== "undefined" && isLobbyInvite(location.search), []);
  const [panel, setPanel] = useState<Panel>(() => (lobbyInvite ? "tournament" : invite.room ? "lobby" : "main"));
  // The tournament the host is setting up (or "" for the join flow from a link). `null` until the
  // host presses ZAŁÓŻ TURNIEJ and picks a size — a guest arriving by link has no size.
  const [tournSize, setTournSize] = useState<TournamentSize | null>(() => {
    try { const s = Number(localStorage.getItem("fb_tourn_size")); return isLobbySize(s) ? s : 8; } catch { return 8; }
  });
  const [inLobby, setInLobby] = useState(false);
  const pickTournSize = (n: TournamentSize) => { setTournSize(n); try { localStorage.setItem("fb_tourn_size", String(n)); } catch { /* private mode */ } };
  // A link was sent by a friend, so the lobby asks for a nickname and nothing else — the room and
  // the mode are the link's. CHANGE opens the full lobby.
  const [linkJoin, setLinkJoin] = useState(invite.viaLink && invite.room.length > 0);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobile] = useState(() => touchOnly());
  const [name, setName] = useState(settings.nickname || "");
  // P8b onboarding: the welcome shows once (localStorage `bs_onboard_v1`), over the menu, and only
  // when a match was not opened by a link (a friend's invite is not a first-run moment). It never
  // appears on a touch device, where the game cannot be played at all.
  const [welcome, setWelcome] = useState(() => !mobile && !invite.room && !loadOnboard().welcomed);
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
  const [outfit, setOutfit] = useState(() => equippedOutfit());
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
  // A duel has two seats: at most one of them a bot, and none unless asked for. A tournament holds
  // the whole draw and may be filled with bots to play a bracket out — but never the last seat.
  const botMax = gameMode === "duel" ? 1 : gameMode === "turniej" ? TOURNAMENT.maxSize - 1 : MAX_BOTS;
  const bots = { count: Math.min(botMax, botCount), level: botLevel };
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
      setListError("Serwer nieosiągalny");
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
   * Drop V (P5), D9: the warmup a player fires from the tournament waiting-room. It is an ordinary
   * `play("create")` on the duel arena filled with one bot — NOT a tournament arena — so somebody
   * waiting for the bracket to fill can shoot something. It goes through the same `onPlay` the menu
   * uses everywhere, so the room is created and joined exactly as a normal duel create would be.
   */
  const startWarmup = () => onPlay(commitName(), "", "create", undefined, "duel", { count: 1, level: botLevel }, DUEL_MAP_ID);
  /**
   * P8b onboarding: SAMOUCZEK and TRENING both open a duel against one bot through the existing
   * `play("create")` path (D9 — reuse `onPlay` with `bots>0`, no new room, no new schema). The
   * tutorial additionally arms the overlay store, which the app-root `TutorialMount` renders over
   * the match once it is live. A nickname is not required to train — a fresh player has not typed
   * one — so we fall back to a friendly default.
   */
  const startOnboarding = (kind: "tutorial" | "training") => {
    if (kind === "tutorial") tutorial.start();
    const n = (name.trim() || settings.nickname || "NOWY").slice(0, MAX_NAME_LENGTH);
    if (n !== settings.nickname) onSettings({ ...settings, nickname: n });
    onPlay(n, "", "create", undefined, "duel", { count: 1, level: "easy" }, DUEL_MAP_ID);
  };
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
        ? <span>{rooms.length === 0 ? "BRAK OTWARTYCH MECZÓW" : `${rooms.length} ${rooms.length === 1 ? "MECZ" : "MECZE"}`} · {playersOnline} {playersOnline === 1 ? "GRACZ" : "GRACZY"}</span>
        : <span>{listError ?? "ŁĄCZENIE Z SERWEREM…"}</span>}
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
    if (listError) return <div className="srv-empty err">{listError}.{short ? "" : " Lista odświeży się sama, gdy serwer wróci."}</div>;
    if (listed === null) return <div className="srv-empty">Szukam meczów…</div>;
    if (listed.length === 0) {
      return (
        <div className="srv-empty">
          <b>Nikt jeszcze nie gra.</b>
          <span>{short ? "Wpisz ksywkę i załóż mecz." : "Załóż mecz SZYBKĄ GRĄ albo nazwij pokój i wyślij komuś link."}</span>
        </div>
      );
    }
    return null;
  };

  const nickField = (autoFocus: boolean) => (
    <label className="mm-field nick">
      <span>KSYWKA</span>
      <input
        ref={nickRef} value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)}
        placeholder="twoja ksywka" autoFocus={autoFocus} data-testid="input-name"
        onKeyDown={(e) => { if (e.key === "Enter" && nameOk && !connecting) play("auto"); }}
      />
    </label>
  );

  return (
    <div className="menu" data-testid="menu">
      <div className="mm-bg" aria-hidden="true" />

      {/* P8b onboarding (disjoint block, §7.0): the one-time welcome over the menu. Picking any of
          the three options marks the player welcomed; SAMOUCZEK / TRENING launch a duel with a bot. */}
      {welcome && (
        <Welcome
          onStart={(kind) => { setWelcome(false); startOnboarding(kind); }}
          onSkip={() => setWelcome(false)}
        />
      )}

      {panel === "main" && (
        <div className="mm-title">
          <div className="mm-title-grid">
            <div className="mm-title-left">
              <header className="mm-hero" data-testid="mm-hero">
                <div className="mm-hero-bg" data-testid="mm-hero-bg" aria-hidden="true" />
                <div>
                  <div className="mm-kicker"><span /> NOCNA DZIELNICA / PO GODZINACH</div>
                  <h1 className="wordmark"><span>BARBER</span><strong>STRIKE</strong></h1>
                  <div className="mm-brand-rule" aria-hidden="true"><i /><b>✂</b><i /></div>
                  <p className="mm-tagline">Dzielnica zamknięta. Fotele puste.<br />Nikt tu nie przyszedł się ostrzyc.</p>
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
                    <b>GRAJ</b><em>Wybierz tryb i mecz</em><span className="mm-nav-go">▸</span>
                  </button>
                  <button className="mm-nav-btn" onClick={() => setPanel("settings")} data-testid="btn-settings">
                    <i className="mm-nav-no">02</i><span className="mm-nav-art"><NAV_ART.settings /></span>
                    <b>USTAWIENIA</b><em>Celownik, obraz, dźwięk, klawisze</em><span className="mm-nav-go">▸</span>
                  </button>
                  <button className="mm-nav-btn" onClick={() => setPanel("controls")} data-testid="btn-controls">
                    <i className="mm-nav-no">03</i><span className="mm-nav-art"><NAV_ART.controls /></span>
                    <b>STEROWANIE</b><em>Wszystkie klawisze na jednej karcie</em><span className="mm-nav-go">▸</span>
                  </button>
                  <button className="mm-nav-btn" onClick={() => setPanel("armoury")} data-testid="btn-armoury">
                    <i className="mm-nav-no">04</i><span className="mm-nav-art"><NAV_ART.armoury /></span>
                    <b>SZAFA</b><em>Strój, sylwetka, skiny i skrzynki</em><span className="mm-nav-go">▸</span>
                  </button>
                  {/* Drop V (P6): KONTO — own block, disjoint from the tournament entry (P5) and the
                      title block (:219-257). Sign in to carry progress between browsers. */}
                  <button className="mm-nav-btn" onClick={() => setPanel("account")} data-testid="btn-account">
                    <i className="mm-nav-no">05</i><span className="mm-nav-art"><NAV_ART.armoury /></span>
                    <b>KONTO</b><em>Zaloguj się i zabierz postępy ze sobą</em><span className="mm-nav-go">▸</span>
                  </button>
                </nav>
              )}
              {/* Drop V (P5): the way into the tournament waiting-room. A new, disjoint block below
                  the nav (never the titlebar/NAV_ART owned by P8a) — its own entry, its own handler. */}
              {!mobile && (
                <button className="mm-tourn-entry" onClick={() => setPanel("tournament")} data-testid="turniej-zaloz">
                  <b>ZAŁÓŻ TURNIEJ</b><em>Drabinka 1 v 1 · zaproś ekipę linkiem</em><span className="mm-nav-go">▸</span>
                </button>
              )}
            </div>

            {/* "Is anyone playing?" is the first question, so it is answered on the front page.
                It used to be answered and nothing more: the rows were `div.srv-row.static`, so a
                player who could SEE a match running still had to press GRAJ, scroll a lobby column
                and find the same row again to get into it. They are buttons now — the one thing
                between a click and the match is a nickname, so the field for it sits right here
                rather than two screens away. */}
            <div className="mm-front">
            <aside className="mm-live" data-testid="live-matches">
              <div className="srv-head">
                <h2 className="lb-h">MECZE NA ŻYWO</h2>
                <button type="button" className={`srv-refresh ${refreshing ? "busy" : ""}`} onClick={() => void refresh()} data-testid="btn-refresh-main" title="Odśwież listę">⟳</button>
              </div>
              <div className="mm-live-list" data-testid="room-list-main">
                {emptyList(true)}
                {listed?.slice(0, MAIN_ROWS).map((r) => {
                  const full = r.clients >= r.maxClients;
                  return (
                    <button
                      type="button" key={r.roomId} className={`srv-row ${full ? "full" : ""}`} data-testid={`room-${r.roomId}`}
                      disabled={connecting || full || mobile} onClick={() => joinRoom(r)}
                      title={full ? "Ten mecz jest pełny" : !nameOk ? "Najpierw wpisz ksywkę" : `Dołącz do ${r.metadata?.name || r.roomId}`}
                    >
                      {roomLine(r)}
                      <span className="srv-go">{full ? "PEŁNY" : "WEJDŹ ▸"}</span>
                    </button>
                  );
                })}
              </div>
              {!mobile && (
                <div className="mm-live-foot">
                  {nickField(false)}
                  <button type="button" className="mm-btn small primary" disabled={connecting} onClick={() => { if (!nameOk) { nickRef.current?.focus(); nickRef.current?.select(); return; } play("auto"); }} data-testid="btn-quickplay-main">
                    {listed && listed.length > 0 ? "SZYBKA GRA" : "ZAŁÓŻ MECZ"}
                  </button>
                  <button type="button" className="mm-link" onClick={() => setPanel("lobby")}>
                    {listed && listed.length > MAIN_ROWS ? `WSZYSTKIE (${listed.length}) ▸` : "WIĘCEJ OPCJI ▸"}
                  </button>
                </div>
              )}
            </aside>

            {/* The crate was four clicks away — SZAFA, then the SKRZYNKI tab — which is a strange
                place to hide the one thing a player comes back the next day for. The same component
                as the wardrobe's, in its compact form: one counter, one case, and the same reel. */}
            {!mobile && <Crates compact onProfile={() => { setHaircut(equippedHaircut()); setBuild(equippedBuild()); setOutfit(equippedOutfit()); }} />}
            </div>
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
            <button className="mm-back" onClick={() => setPanel("main")} data-testid="btn-back">◂ WSTECZ</button>
            <div className="mm-bar-brand"><b>BARBERSTRIKE</b><span>{panel === "lobby" ? "LOBBY" : panel === "tournament" ? "TURNIEJ" : panel === "settings" ? "USTAWIENIA" : panel === "armoury" ? "SZAFA" : panel === "account" ? "KONTO" : "STEROWANIE"}</span></div>
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
                    {/* A 1 v 1 is played on the arena built for it, so the picker says so instead of
                        offering a choice the server overrides. */}
                    {gameMode === "duel" && (
                      <p className="mm-hint" data-testid="map-fixed">Pojedynek zawsze na {MAPS[DUEL_MAP_ID].name} — arenie zrobionej pod 1 v 1 ({mapSize(DUEL_MAP_ID)}).</p>
                    )}
                    <div className="map-grid" role="radiogroup" aria-label="Map" data-testid="map-picker">
                      {(gameMode === "duel" ? maps.filter((m) => m.id === DUEL_MAP_ID) : maps).map((m) => {
                        const Plan = mapArt(m.id);
                        return (
                          <button
                            key={m.id} role="radio" aria-checked={gameMode === "duel" || mapId === m.id} className={`map-card ${gameMode === "duel" || mapId === m.id ? "on" : ""}`}
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
                    <h2 className="lb-h"><em>{gameMode === "boys" ? "04" : "03"}</em> BOTY <span data-testid="bots-count">{bots.count === 0 ? "BRAK" : `${bots.count} · ${BOT_PRESETS[botLevel].name}`}</span></h2>
                    <div className="bots-row">
                      <input type="range" min={0} max={botMax} step={1} value={bots.count} onChange={(e) => pickBots(Number(e.target.value), botLevel)} data-testid="bots-range" aria-label="Bots" />
                      <b className="bots-num">{bots.count}</b>
                    </div>
                    <div className="seg" role="radiogroup" aria-label="Bot level">
                      {BOT_LEVELS.map((l) => (
                        <button key={l} role="radio" aria-checked={botLevel === l} className={`seg-btn ${botLevel === l ? "on" : ""}`} disabled={botCount === 0} onClick={() => pickBots(botCount, l)} data-testid={`bots-${l}`}>
                          {BOT_PRESETS[l].name}
                        </button>
                      ))}
                    </div>
                    {/* The seat rule, where the choice is made. In deathmatch the bots are extra
                        bodies and the room still fills with people; everywhere else each bot is one
                        of the twelve, and somebody who picks eight should know that before they do.
                        No number for the open cap: it is the host's (`FB_MAX_PLAYERS`) and the room
                        browser prints the real one. */}
                    <small className="bots-seats" data-testid="bots-seats">
                      {isOpenMode(gameMode)
                        ? "Boty nie zajmują miejsc — w deathmatchu dołącza do nich cała ekipa."
                        : gameMode === "duel" ? "Pojedynek to dwa miejsca: ty i bot albo ty i rywal."
                        : `Ten tryb to ${MAX_PLAYERS} postaci razem — każdy bot to jedno miejsce mniej dla gracza.`}
                    </small>
                  </div>

                  <div className="lb-block wide lobby-look" data-testid="haircut-picker">
                    <div><h2 className="lb-h">WYGLĄD POSTACI</h2><b>{outfitDef(outfit).name} · {buildDef(build).name} · {HAIRCUTS.find(h=>h.id===haircut)?.name}</b><small>{BUILDS.length} sylwetek · {OUTFITS.length} strojów · {owned.size}/{HAIRCUTS.length} fryzur · wybór zapisany dla nowego pokoju</small></div>
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
            <div className="mm-content armoury-content"><Armoury onHaircut={setHaircut} onBuild={setBuild} onOutfit={setOutfit} /></div>
          )}

          {/* Drop V (P5): the tournament waiting-room. Two states: the host sets a draw size and a
              map and presses ZAŁÓŻ, or — arriving by a `mode=lobby` link — the join flow enters the
              lobby straight away with the room from the address. The Lobby component owns the socket. */}
          {panel === "tournament" && (
            (inLobby || lobbyInvite) ? (
              <div className="mm-content">
                <Lobby
                  name={name.trim().slice(0, MAX_NAME_LENGTH) || "GRACZ"}
                  size={inLobby ? tournSize ?? undefined : undefined}
                  map={gameMode === "duel" ? DUEL_MAP_ID : mapId}
                  room={roomName.trim() || invite.room || undefined}
                  onWarmup={startWarmup}
                  onLeave={() => { setInLobby(false); setPanel("main"); }}
                />
              </div>
            ) : (
              <section className="mm-content" data-testid="tournament-setup">
                <div className="lb-block wide">
                  <h2 className="lb-h"><em>01</em> LICZBA MIEJSC</h2>
                  <div className="seg" role="radiogroup" aria-label="Draw size" data-testid="tourn-size">
                    {LOBBY_SIZES.map((n) => (
                      <button
                        key={n} role="radio" aria-checked={tournSize === n} className={`seg-btn ${tournSize === n ? "on" : ""}`}
                        onClick={() => pickTournSize(n)} data-testid={`tourn-size-${n}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <small className="mm-hint">Drabinka 1 v 1 na eliminacje. Puste miejsca dostają wolny los.</small>
                </div>

                <div className="lb-block">
                  <h2 className="lb-h"><em>02</em> MAPA (ROZGRZEWKA)</h2>
                  <div className="map-grid" role="radiogroup" aria-label="Map" data-testid="tourn-map-picker">
                    {maps.map((m) => {
                      const Plan = mapArt(m.id);
                      return (
                        <button
                          key={m.id} role="radio" aria-checked={mapId === m.id} className={`map-card ${mapId === m.id ? "on" : ""}`}
                          onClick={() => pickMap(m.id)} data-testid={`tourn-map-${m.id}`} title={m.name}
                        >
                          <span className="map-plan"><Plan /></span>
                          <b>{m.name}</b>
                          <span className="map-size">{mapSize(m.id)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <small className="mm-hint">Pary turnieju grają zawsze na arenie 1 v 1; ta mapa dotyczy rozgrzewki.</small>
                </div>

                <footer className="lb-launch">
                  {nickField(true)}
                  <div className="lb-launch-read">
                    <span className="lb-launch-mode">TURNIEJ · {tournSize} MIEJSC</span>
                    <span className="lb-launch-sub">Zaproś graczy linkiem po założeniu</span>
                  </div>
                  <div className="lb-launch-btns">
                    <button
                      className="mm-btn primary big" disabled={!nameOk || !tournSize} onClick={() => { commitName(); setInLobby(true); }}
                      data-testid="tourn-create"
                    >
                      ZAŁÓŻ POCZEKALNIĘ ▸
                    </button>
                  </div>
                  {!nameOk && <small className="mm-hint launch-hint">Wpisz ksywkę (min. 2 znaki), żeby założyć turniej.</small>}
                </footer>
              </section>
            )
          )}

          {/* Drop V (P6): the account panel — sign in / up / out and the migration banner. */}
          {panel === "account" && (
            <div className="mm-content account-content">
              <Account />
              <p className="acc-hof-link">Zobacz <a href="/stats" data-testid="link-stats">tablicę sławy ▸</a></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
