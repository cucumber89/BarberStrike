import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LOBBY_SEATS, MAPS, MatchPhase, BOT_PRESETS, type BotLevel, type GameMode } from "@frankibarber/shared";
import { Connection, defaultServerUrl, httpUrl, type RoomListing } from "../game/net/Connection";
import { viewpointsFor, ViewerScene, type ViewerStats } from "../game/viewer/ViewerScene";
import { Lobby } from "./lobby";
import { apiUrl } from "../net/accountApi";
import { copyText, lobbyLink, suggestRoomName } from "./invite";
import {
  ADMIN_REFRESH_MS, adminHeaders, botLevelChoices, botMaxFor, defaultQuickMap, duelMapChoices, healthRows, mapLabel,
  modeLabel, occupancyLabel, phaseLabel, quickMapChoices, quickMatchBody, quickMatchLink, quickModeChoices,
  type AdminRoomRow, type HealthInfo,
} from "./adminConsole";

/**
 * `/viewer` — watch a live match, and look at the map.
 *
 * Two jobs in one page, and they want the same thing: a camera that goes where you point it and a
 * connection that changes nothing. A viewer joins with `spectator: true`, which makes the room skip
 * building a `PlayerState` for it — so it takes no seat, has no body, appears on no scoreboard, and
 * could not affect a round if it tried. That is what makes it safe to hand the link to anybody
 * during a tournament, and what makes it usable as a map tool during a match nobody wants disturbed.
 *
 * The link carries the room: `/viewer?room=<name>` walks straight in, which is the form to paste
 * into a Discord channel. With no room it lists what is running.
 *
 * It is also the tournament ADMIN console (owner's brief 2026-09-27, "w panelu admina dużo
 * możliwości daj"): behind the server's `ADMIN_PASSWORD` (open in dev) four cards — TURNIEJ (raise a
 * waiting room), SZYBKI MECZ (raise an ordinary match for other people), MECZE (every room with its
 * phase, watch it or end it) and SERWER (`/health`). The cards only arrange what `adminConsole.ts`
 * decides; every action is a request to `/api/admin/*`, which checks the same password again, so
 * the UI gate is a convenience and never the security.
 */

const roomsUrl = () => `${httpUrl(defaultServerUrl())}/rooms`;
const healthUrl = () => `${httpUrl(defaultServerUrl())}/health`;

/** What ZAŁÓŻ MECZ made: enough to print the link and to open the viewer on it. */
interface QuickCreated { roomId: string; room: string; mode: GameMode; map: string }

export function Viewer() {
  const wanted = useMemo(() => new URLSearchParams(location.search).get("room") ?? "", []);
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState<{ conn: Connection; roomId: string } | null>(null);
  // The admin gate. The key is kept for the session so a reload does not ask again; every request
  // carries it, and a 401 on any of them locks the console (the password changed under us).
  const [adminAuthed, setAdminAuthed] = useState(() => { try { return sessionStorage.getItem("bs_admin_ok") === "1"; } catch { return false; } });
  const [adminKey, setAdminKey] = useState(() => { try { return sessionStorage.getItem("bs_admin_key") ?? ""; } catch { return ""; } });
  const [adminPw, setAdminPw] = useState("");
  const [adminErr, setAdminErr] = useState("");
  // TURNIEJ card.
  const duelMaps = useMemo(() => duelMapChoices(), []);
  const [seats, setSeats] = useState(8);
  const [hostName, setHostName] = useState("ADMIN");
  const [tourMap, setTourMap] = useState(() => duelMapChoices()[0]?.id ?? "");
  const [tourRoom, setTourRoom] = useState(() => suggestRoomName());
  const [hosting, setHosting] = useState(false);
  // SZYBKI MECZ card.
  const quickModes = useMemo(() => quickModeChoices(), []);
  const [qMode, setQMode] = useState<GameMode>("tdm");
  const [qMap, setQMap] = useState(() => defaultQuickMap("tdm"));
  const [qBots, setQBots] = useState(0);
  const [qLevel, setQLevel] = useState<BotLevel>("normal");
  const [qRoom, setQRoom] = useState(() => suggestRoomName());
  const [qBusy, setQBusy] = useState(false);
  const [qErr, setQErr] = useState("");
  const [qCreated, setQCreated] = useState<QuickCreated | null>(null);
  // MECZE + SERWER.
  const [adminRooms, setAdminRooms] = useState<AdminRoomRow[] | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [ending, setEnding] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState("");

  const lockAdmin = useCallback((why: string) => {
    setAdminAuthed(false); setAdminErr(why);
    try { sessionStorage.removeItem("bs_admin_ok"); sessionStorage.removeItem("bs_admin_key"); } catch { /* private mode */ }
  }, []);

  const enterAdmin = useCallback(async () => {
    setAdminErr("");
    try {
      const res = await fetch(apiUrl("admin/verify"), { method: "POST", headers: adminHeaders(adminPw), body: JSON.stringify({ password: adminPw }) });
      if (!res.ok) { setAdminErr("Złe hasło admina."); return; }
      setAdminAuthed(true); setAdminKey(adminPw);
      try { sessionStorage.setItem("bs_admin_ok", "1"); sessionStorage.setItem("bs_admin_key", adminPw); } catch { /* private mode */ }
    } catch { setAdminErr("Serwer nieosiągalny — sprawdź, czy gra działa."); }
  }, [adminPw]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(roomsUrl());
      setRooms((await res.json()) as RoomListing[]);
      setError("");
    } catch {
      setError("Nie widać serwera. Sprawdź, czy gra działa.");
      setRooms([]);
    }
  }, []);

  /** The admin table and the health block, read together on the console's cadence. */
  const refreshAdmin = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("admin/rooms"), { headers: adminHeaders(adminKey) });
      if (res.status === 401) { lockAdmin("Klucz admina przestał działać — wpisz hasło jeszcze raz."); return; }
      const body = (await res.json()) as { rooms?: AdminRoomRow[] };
      setAdminRooms(Array.isArray(body.rooms) ? body.rooms : []);
    } catch { setAdminRooms([]); }
    try { setHealth((await (await fetch(healthUrl())).json()) as HealthInfo); } catch { setHealth(null); }
  }, [adminKey, lockAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Auto-refresh while the console is open and on this screen — not while hosting or on the stage,
  // where nothing here is visible and the polling would only cost the server.
  useEffect(() => {
    if (!adminAuthed || hosting || joined) return;
    void refreshAdmin(); void refresh();
    const t = window.setInterval(() => { void refreshAdmin(); void refresh(); }, ADMIN_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [adminAuthed, hosting, joined, refreshAdmin, refresh]);

  const watch = useCallback(async (roomId: string, roomName = "") => {
    setError("");
    try {
      const conn = await Connection.connect({
        url: defaultServerUrl(), name: "WIDZ", spectator: true,
        mode: roomId ? "join" : "auto", roomId: roomId || undefined, roomName,
      });
      setJoined({ conn, roomId: roomId || conn.room.roomId });
    } catch (e) {
      setError(e instanceof Error && /full/i.test(e.message) ? "Komplet widzów w tym pokoju." : "Nie udało się wejść jako widz.");
    }
  }, []);

  const createQuick = useCallback(async () => {
    setQBusy(true); setQErr(""); setQCreated(null);
    try {
      const res = await fetch(apiUrl("admin/rooms"), { method: "POST", headers: adminHeaders(adminKey), body: JSON.stringify(quickMatchBody(qMode, qMap, qRoom, qBots, qLevel)) });
      if (res.status === 401) { lockAdmin("Klucz admina przestał działać — wpisz hasło jeszcze raz."); return; }
      if (!res.ok) { setQErr("Serwer nie założył meczu — sprawdź tryb i mapę."); return; }
      const body = (await res.json()) as QuickCreated;
      setQCreated(body);
      setQRoom(suggestRoomName()); // the next one gets its own name; a repeat would land in this room
      void refreshAdmin();
    } catch { setQErr("Serwer nieosiągalny — sprawdź, czy gra działa."); }
    finally { setQBusy(false); }
  }, [adminKey, qMode, qMap, qRoom, qBots, qLevel, lockAdmin, refreshAdmin]);

  const endRoom = useCallback(async (roomId: string) => {
    setEnding((e) => ({ ...e, [roomId]: true }));
    try {
      const res = await fetch(apiUrl(`admin/rooms/${encodeURIComponent(roomId)}/end`), { method: "POST", headers: adminHeaders(adminKey), body: "{}" });
      if (res.status === 401) { lockAdmin("Klucz admina przestał działać — wpisz hasło jeszcze raz."); return; }
      if (res.status === 404) { setError("Tego pokoju już nie ma."); }
      if (qCreated?.roomId === roomId) setQCreated(null);
      await refreshAdmin();
    } catch { setError("Nie udało się zakończyć meczu."); }
    finally { setEnding((e) => { const n = { ...e }; delete n[roomId]; return n; }); }
  }, [adminKey, lockAdmin, refreshAdmin, qCreated]);

  const copy = useCallback((text: string, tag: string) => {
    void copyText(text).then((ok) => { if (ok) { setCopied(tag); window.setTimeout(() => setCopied(""), 1500); } });
  }, []);

  const pickQuickMode = (m: GameMode) => { setQMode(m); setQMap(defaultQuickMap(m)); setQBots((b) => Math.min(b, botMaxFor(m))); };

  // A room in the address is an instruction, not a suggestion: go in without asking.
  useEffect(() => {
    if (!wanted || joined || !rooms) return;
    const hit = rooms.find((r) => r.metadata?.name === wanted || r.roomId === wanted);
    if (hit) void watch(hit.roomId);
    else if (rooms.length === 0) setError(`Nie ma pokoju „${wanted}".`);
  }, [wanted, rooms, joined, watch]);

  useEffect(() => () => { void joined?.conn.leave(); }, [joined]);

  if (joined) return <Stage conn={joined.conn} onLeave={() => { void joined.conn.leave(); setJoined(null); void refresh(); }} />;

  if (hosting) {
    return (
      <main className="viewer-pick viewer-host" data-testid="viewer-admin-host">
        <Lobby
          name={hostName.trim() || "ADMIN"}
          size={seats}
          map={tourMap}
          room={tourRoom.trim() || undefined}
          adminKey={adminKey}
          hideWarmup
          onWarmup={() => { /* no game canvas on /viewer */ }}
          onLeave={() => { setHosting(false); setTourRoom(suggestRoomName()); void refresh(); }}
        />
      </main>
    );
  }

  const base = typeof location !== "undefined" ? location.href : "http://localhost/";
  const tourLink = lobbyLink(base, tourRoom, tourMap);
  const quickLink = qCreated ? quickMatchLink(base, qCreated.room, qCreated.mode, qCreated.map) : "";
  const qMaps = quickMapChoices(qMode);
  const qBotMax = botMaxFor(qMode);

  return (
    <main className="viewer-pick" data-testid="viewer-pick">
      <header>
        <span>BARBERSTRIKE</span>
        <h1>WIDOWNIA</h1>
        <p>Wejdź na mecz jako widz: bez ciała, bez miejsca w drużynie, bez wpływu na rundę. Latasz gdzie chcesz.</p>
      </header>

      {/* The admin console: unlock with the admin password, then run the evening from here. */}
      <section className="viewer-admin" data-testid="viewer-admin">
        {!adminAuthed ? (
          <div className="va-lock">
            <h2>PANEL ADMINA</h2>
            <p>Wpisz hasło admina, żeby zakładać turnieje i mecze, kończyć je i patrzeć na serwer.</p>
            <form className="va-row" onSubmit={(e) => { e.preventDefault(); void enterAdmin(); }}>
              <input type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)}
                placeholder="hasło admina" data-testid="admin-pw" aria-label="Hasło admina" />
              <button type="submit" className="mm-btn primary" data-testid="admin-enter">WEJDŹ</button>
            </form>
            {adminErr && <p className="viewer-error" data-testid="admin-error">{adminErr}</p>}
          </div>
        ) : (
          <div className="va-console" data-testid="admin-console">
            <div className="va-head">
              <h2>PANEL ADMINA</h2>
              <button type="button" className="va-link" onClick={() => lockAdmin("")} data-testid="admin-logout">ZAMKNIJ PANEL</button>
            </div>

            <div className="va-grid">
              {/* ------------------------------------------------------------- TURNIEJ */}
              <div className="va-card va-create" data-testid="admin-create">
                <h3>TURNIEJ</h3>
                <label className="va-field">
                  <span>LICZBA MIEJSC: <b data-testid="admin-seats-val">{seats}</b></span>
                  <input type="range" min={LOBBY_SEATS.min} max={LOBBY_SEATS.max} step={LOBBY_SEATS.step}
                    value={seats} onChange={(e) => setSeats(Number(e.target.value))}
                    data-testid="admin-seats" aria-label="Liczba miejsc" />
                  <small>Drabinka 1 v 1 na eliminacje. Puste miejsca dostają wolny los.</small>
                </label>
                <div className="va-field">
                  <span>ARENA</span>
                  <div className="va-seg" role="radiogroup" aria-label="Arena turnieju">
                    {duelMaps.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={tourMap === m.id} className={`va-seg-btn${tourMap === m.id ? " on" : ""}`}
                        onClick={() => setTourMap(m.id)} data-testid={`admin-tour-map-${m.id}`}>
                        {m.name}<small>{m.size}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="va-field">
                  <span>TWOJA KSYWKA</span>
                  <input value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={16}
                    data-testid="admin-host-name" aria-label="Ksywka organizatora" />
                </label>
                <label className="va-field">
                  <span>NAZWA POKOJU</span>
                  <input value={tourRoom} onChange={(e) => setTourRoom(e.target.value)} maxLength={24} placeholder="pusta = wylosowana"
                    data-testid="admin-tour-room" aria-label="Nazwa pokoju turnieju" />
                </label>
                <div className="va-field">
                  <span>LINK ZAPROSZENIA</span>
                  <div className="va-row">
                    <input readOnly value={tourLink} data-testid="admin-tour-link" onFocus={(e) => e.currentTarget.select()} aria-label="Link do poczekalni" />
                    <button type="button" onClick={() => copy(tourLink, "tour")} data-testid="admin-tour-copy">{copied === "tour" ? "SKOPIOWANO" : "KOPIUJ"}</button>
                  </div>
                  <small>Kto otworzy ten link, trafi do poczekalni. Boty nie grają w turnieju — drabinka jest dla ludzi.</small>
                </div>
                <button type="button" className="mm-btn primary big" onClick={() => setHosting(true)} data-testid="admin-create-go">
                  ZAŁÓŻ POCZEKALNIĘ ▸
                </button>
              </div>

              {/* ------------------------------------------------------------- SZYBKI MECZ */}
              <div className="va-card va-create" data-testid="admin-quick">
                <h3>SZYBKI MECZ</h3>
                <label className="va-field">
                  <span>TRYB</span>
                  <select value={qMode} onChange={(e) => pickQuickMode(e.target.value as GameMode)} data-testid="admin-quick-mode" aria-label="Tryb meczu">
                    {quickModes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="va-field">
                  <span>MAPA</span>
                  <select value={qMap} onChange={(e) => setQMap(e.target.value)} data-testid="admin-quick-map" aria-label="Mapa meczu">
                    {qMaps.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.size}</option>)}
                  </select>
                </label>
                <label className="va-field">
                  <span>BOTY: <b data-testid="admin-quick-bots-val">{qBots === 0 ? "BRAK" : `${qBots} · ${BOT_PRESETS[qLevel].name}`}</b></span>
                  <input type="range" min={0} max={qBotMax} step={1} value={Math.min(qBots, qBotMax)} onChange={(e) => setQBots(Number(e.target.value))}
                    data-testid="admin-quick-bots" aria-label="Liczba botów" />
                  <div className="va-seg" role="radiogroup" aria-label="Poziom botów">
                    {botLevelChoices.map((l) => (
                      <button key={l} type="button" role="radio" aria-checked={qLevel === l} className={`va-seg-btn${qLevel === l ? " on" : ""}`}
                        disabled={qBots === 0} onClick={() => setQLevel(l)} data-testid={`admin-quick-level-${l}`}>{BOT_PRESETS[l].name}</button>
                    ))}
                  </div>
                </label>
                <label className="va-field">
                  <span>NAZWA POKOJU</span>
                  <input value={qRoom} onChange={(e) => setQRoom(e.target.value)} maxLength={24} placeholder="pusta = wylosowana"
                    data-testid="admin-quick-room" aria-label="Nazwa pokoju meczu" />
                </label>
                <button type="button" className="mm-btn primary big" onClick={() => void createQuick()} disabled={qBusy} data-testid="admin-quick-go">
                  {qBusy ? "ZAKŁADAM…" : "ZAŁÓŻ MECZ ▸"}
                </button>
                {qErr && <p className="viewer-error" data-testid="admin-quick-error">{qErr}</p>}
                {qCreated && (
                  <div className="va-field va-made" data-testid="admin-quick-made">
                    <span>MECZ STOI — LINK ZAPROSZENIA</span>
                    <div className="va-row">
                      <input readOnly value={quickLink} data-testid="admin-quick-link" onFocus={(e) => e.currentTarget.select()} aria-label="Link do meczu" />
                      <button type="button" onClick={() => copy(quickLink, "quick")} data-testid="admin-quick-copy">{copied === "quick" ? "SKOPIOWANO" : "KOPIUJ"}</button>
                    </div>
                    <div className="va-row">
                      <button type="button" onClick={() => void watch(qCreated.roomId)} data-testid="admin-quick-watch">OBSERWUJ</button>
                      <button type="button" onClick={() => void endRoom(qCreated.roomId)} data-testid="admin-quick-end">ZAKOŃCZ</button>
                    </div>
                    <small>Pokój czeka na pierwszego gracza 10 minut; potem znika sam, jeśli nikt nie wszedł.</small>
                  </div>
                )}
              </div>

              {/* ------------------------------------------------------------- MECZE */}
              <div className="va-card va-wide" data-testid="admin-matches">
                <div className="va-head">
                  <h3>MECZE</h3>
                  <small>odświeża się co {ADMIN_REFRESH_MS / 1000} s</small>
                </div>
                <table className="va-table" data-testid="admin-rooms">
                  <thead>
                    <tr><th>TRYB</th><th>MAPA</th><th>POKÓJ</th><th>GRACZE</th><th>FAZA</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(adminRooms ?? []).map((r) => (
                      <tr key={r.roomId} data-testid={`admin-room-${r.roomId}`} className={r.locked ? "locked" : ""}>
                        <td>{modeLabel(r)}</td>
                        <td>{mapLabel(r.map)}</td>
                        <td><b>{r.name || r.roomId}</b>{r.bots > 0 && <small> · {r.bots} bot.</small>}{r.locked && <small> · zamknięty</small>}</td>
                        <td>{occupancyLabel(r)}</td>
                        <td data-testid={`admin-room-phase-${r.roomId}`}>{phaseLabel(r.phase)}</td>
                        <td className="va-actions">
                          {r.kind === "tdm" && <button type="button" onClick={() => void watch(r.roomId)} data-testid={`admin-watch-${r.roomId}`}>OBSERWUJ</button>}
                          <button type="button" className="danger" disabled={!!ending[r.roomId]} onClick={() => void endRoom(r.roomId)} data-testid={`admin-end-${r.roomId}`}>
                            {ending[r.roomId] ? "…" : "ZAKOŃCZ"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {adminRooms !== null && adminRooms.length === 0 && <tr className="empty" data-testid="admin-rooms-empty"><td colSpan={6}>Nic teraz nie gra.</td></tr>}
                    {adminRooms === null && <tr className="empty"><td colSpan={6}>Szukam pokoi…</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* ------------------------------------------------------------- SERWER */}
              <div className="va-card" data-testid="admin-server">
                <h3>SERWER</h3>
                <dl className="va-health" data-testid="admin-health">
                  {healthRows(health).map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
                </dl>
                <small>{health ? "Serwer odpowiada." : "Serwer nie odpowiada na /health."}</small>
              </div>
            </div>
          </div>
        )}
      </section>
      {error && <p className="viewer-error" data-testid="viewer-error">{error}</p>}
      <ul data-testid="viewer-rooms">
        {(rooms ?? []).map((r) => (
          <li key={r.roomId}>
            <b>{r.metadata?.name || r.roomId}</b>
            <small>{r.metadata?.mode?.toUpperCase() ?? "—"} · {MAPS[r.metadata?.map ?? ""]?.name ?? r.metadata?.map ?? "—"} · {r.clients} os.</small>
            <button data-testid={`viewer-watch-${r.roomId}`} onClick={() => void watch(r.roomId)}>OGLĄDAJ</button>
          </li>
        ))}
        {rooms !== null && rooms.length === 0 && <li className="empty" data-testid="viewer-empty">Nic teraz nie gra.</li>}
        {rooms === null && <li className="empty">Szukam pokoi…</li>}
      </ul>
      <footer>
        <button data-testid="viewer-refresh" onClick={() => void refresh()}>ODŚWIEŻ</button>
        <button data-testid="viewer-empty-map" onClick={() => void watch("")}>SAMA MAPA</button>
        <a href="/">← DO GRY</a>
      </footer>
    </main>
  );
}

/** The canvas, the overlay, and everything that only exists once we are in a room. */
function Stage({ conn, onLeave }: { conn: Connection; onLeave(): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ViewerScene | null>(null);
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [names, setNames] = useState<{ id: string; name: string; team: number; alive: boolean }[]>([]);
  const [followed, setFollowed] = useState("");
  const [panel, setPanel] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new ViewerScene(canvasRef.current, conn);
    sceneRef.current = scene;
    const tick = window.setInterval(() => {
      setStats(scene.stats());
      setFollowed(scene.followed);
      setNames([...conn.state.players.entries()].map(([id, p]) => ({ id, name: p.name, team: p.team, alive: p.alive })));
    }, 250);
    return () => { window.clearInterval(tick); scene.dispose(); sceneRef.current = null; };
  }, [conn]);

  const phase = conn.state.phase;
  return (
    <div className="viewer-stage" data-testid="viewer-stage">
      <canvas ref={canvasRef} data-testid="viewer-canvas" />
      <button className="viewer-toggle" data-testid="viewer-toggle" onClick={() => setPanel(!panel)}>{panel ? "‹" : "›"}</button>
      {panel && (
        <aside data-testid="viewer-panel">
          <div className="viewer-head">
            <b>{conn.state.roomName || "POKÓJ"}</b>
            <small>{MAPS[conn.state.mapId]?.name ?? conn.state.mapId} · {conn.state.scoreA} : {conn.state.scoreB}{phase === MatchPhase.Playing ? " · GRA" : ""}</small>
          </div>

          <h2>MIEJSCA</h2>
          <div className="viewer-spots" data-testid="viewer-spots">
            {viewpointsFor(conn.state.mapId).map((v, i) => (
              <button key={v.id} data-testid={`viewer-go-${v.id}`} onClick={() => sceneRef.current?.go(v.id)}>
                <i>{i + 1}</i>{v.label}
              </button>
            ))}
            <button data-testid="viewer-go-A" onClick={() => sceneRef.current?.go("A")}>SITE A</button>
            <button data-testid="viewer-go-B" onClick={() => sceneRef.current?.go("B")}>SITE B</button>
          </div>

          <h2>GRACZE</h2>
          <div className="viewer-players" data-testid="viewer-players">
            {names.map((p) => (
              <button key={p.id} aria-pressed={followed === p.id} data-testid={`viewer-follow-${p.id}`}
                className={`t${p.team}${p.alive ? "" : " dead"}`}
                onClick={() => sceneRef.current?.follow(followed === p.id ? "" : p.id)}>
                {p.name}
              </button>
            ))}
            {names.length === 0 && <span className="empty">Pusto — sama mapa.</span>}
          </div>

          <h2>LICZBY</h2>
          <dl data-testid="viewer-stats">
            <div><dt>fps</dt><dd>{stats?.fps ?? "—"}</dd></div>
            <div><dt>draw calls</dt><dd>{stats?.drawCalls ?? "—"}</dd></div>
            <div><dt>siatki</dt><dd>{stats?.meshes ?? "—"}</dd></div>
            <div><dt>pozycja</dt><dd>{stats ? `${stats.x}, ${stats.y}, ${stats.z}` : "—"}</dd></div>
          </dl>

          <p className="viewer-help">
            Klik = złap mysz · <b>WSAD</b> lot · <b>Spacja</b> w górę · <b>Ctrl</b> w dół ·
            <b>Shift</b> szybciej · <b>Alt</b> wolniej · <b>1–9</b> miejsca · kliknij gracza, by lecieć za nim.
          </p>
          <button className="viewer-leave" data-testid="viewer-leave" onClick={onLeave}>WYJDŹ</button>
        </aside>
      )}
    </div>
  );
}
