import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LOBBY_SEATS, MAPS, MatchPhase } from "@frankibarber/shared";
import { Connection, defaultServerUrl, httpUrl, type RoomListing } from "../game/net/Connection";
import { viewpointsFor, ViewerScene, type ViewerStats } from "../game/viewer/ViewerScene";
import { Lobby } from "./lobby";
import { apiUrl } from "../net/accountApi";

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
 */

const roomsUrl = () => `${httpUrl(defaultServerUrl())}/rooms`;

export function Viewer() {
  const wanted = useMemo(() => new URLSearchParams(location.search).get("room") ?? "", []);
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState<{ conn: Connection; roomId: string } | null>(null);
  // Drop V follow-up (owner): /viewer is also the tournament ADMIN console. A password (the server's
  // ADMIN_PASSWORD; open in dev) unlocks a create card — a seat slider and a host name — that raises
  // a `tournament-lobby` and drops the full waiting room in. Spectating below stays open to everyone.
  const [adminAuthed, setAdminAuthed] = useState(() => { try { return sessionStorage.getItem("bs_admin_ok") === "1"; } catch { return false; } });
  const [adminKey, setAdminKey] = useState(() => { try { return sessionStorage.getItem("bs_admin_key") ?? ""; } catch { return ""; } });
  const [adminPw, setAdminPw] = useState("");
  const [adminErr, setAdminErr] = useState("");
  const [seats, setSeats] = useState(8);
  const [hostName, setHostName] = useState("ADMIN");
  const [hosting, setHosting] = useState(false);

  const enterAdmin = useCallback(async () => {
    setAdminErr("");
    try {
      const res = await fetch(apiUrl("admin/verify"), {
        method: "POST", headers: { "content-type": "application/json" },
        credentials: "include", body: JSON.stringify({ password: adminPw }),
      });
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

  useEffect(() => { void refresh(); }, [refresh]);

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
          adminKey={adminKey}
          hideWarmup
          onWarmup={() => { /* no game canvas on /viewer */ }}
          onLeave={() => { setHosting(false); void refresh(); }}
        />
      </main>
    );
  }

  return (
    <main className="viewer-pick" data-testid="viewer-pick">
      <header>
        <span>BARBERSTRIKE</span>
        <h1>WIDOWNIA</h1>
        <p>Wejdź na mecz jako widz: bez ciała, bez miejsca w drużynie, bez wpływu na rundę. Latasz gdzie chcesz.</p>
      </header>

      {/* Tournament admin console (owner): unlock with the admin password, then raise a tournament. */}
      <section className="viewer-admin" data-testid="viewer-admin">
        {!adminAuthed ? (
          <div className="va-lock">
            <h2>PANEL TURNIEJU</h2>
            <p>Wpisz hasło admina, żeby założyć turniej i zaprosić graczy linkiem.</p>
            <form className="va-row" onSubmit={(e) => { e.preventDefault(); void enterAdmin(); }}>
              <input type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)}
                placeholder="hasło admina" data-testid="admin-pw" aria-label="Hasło admina" />
              <button type="submit" className="mm-btn primary" data-testid="admin-enter">WEJDŹ</button>
            </form>
            {adminErr && <p className="viewer-error" data-testid="admin-error">{adminErr}</p>}
          </div>
        ) : (
          <div className="va-create" data-testid="admin-create">
            <h2>ZAŁÓŻ TURNIEJ</h2>
            <label className="va-field">
              <span>LICZBA MIEJSC: <b data-testid="admin-seats-val">{seats}</b></span>
              <input type="range" min={LOBBY_SEATS.min} max={LOBBY_SEATS.max} step={LOBBY_SEATS.step}
                value={seats} onChange={(e) => setSeats(Number(e.target.value))}
                data-testid="admin-seats" aria-label="Liczba miejsc" />
              <small>Drabinka 1 v 1 na eliminacje. Puste miejsca dostają wolny los.</small>
            </label>
            <label className="va-field">
              <span>TWOJA KSYWKA</span>
              <input value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={16}
                data-testid="admin-host-name" aria-label="Ksywka organizatora" />
            </label>
            <button type="button" className="mm-btn primary big" onClick={() => setHosting(true)} data-testid="admin-create-go">
              ZAŁÓŻ POCZEKALNIĘ ▸
            </button>
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
