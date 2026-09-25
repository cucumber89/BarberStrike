import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LOBBY_CHAT_MAX_LEN, MAPS, type TournamentSize } from "@frankibarber/shared";
import { useLobby } from "../../net/lobbyStore";
import { copyText, lobbyLink } from "../invite";
import { BracketPanel } from "../Bracket";
import { LobbyConnection, type LobbyJoinOptions } from "./lobbyNet";
import {
  amReady, canStart, isHost, LOBBY_SIZES, rosterSummary, warmupOptions, watchRows,
} from "./lobbyLogic";
import "./lobby.css";

/**
 * The tournament waiting-room screen — drop V (P5), Polish.
 *
 * It shows who is in, lets each player flip ready and chat, gives the host START (only at ≥ 2 ready)
 * and a copyable invite link, offers a bot warmup while the bracket fills, and — once the arenas are
 * up — the live bracket with an OGLĄDAJ button per pair that opens the shared `/viewer?room=<id>`.
 * Every rule it obeys is in `lobbyLogic.ts`; this file is the wiring and the markup.
 *
 * It talks to the `tournament-lobby` room through `LobbyConnection` (P5) and reads the roster from
 * `lobbyStore` (P0). The arenas themselves are ordinary `tdm` duels reached by their own pages, so
 * nothing here touches the game protocol (L6).
 */

export interface LobbyProps {
  /** The nickname to enter under (from the menu's field). */
  name: string;
  /** Host: create a lobby of this size. Guest (from a link): omit it and pass `roomId`/`room`. */
  size?: TournamentSize;
  map?: string;
  room?: string;
  roomId?: string;
  /** Start a warmup match: the menu's `play("create")` with a bot duel (D9). */
  onWarmup: () => void;
  /** Leave the lobby back to the menu. */
  onLeave: () => void;
}

export function Lobby({ name, size, map, room, roomId, onWarmup, onLeave }: LobbyProps) {
  const state = useLobby();
  const [conn, setConn] = useState<LobbyConnection | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Connect once, on mount: host creates, a guest joins by id/name. The store is written by the
  // connection's `onStateChange`; React reads it through `useLobby`.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let live: LobbyConnection | null = null;
    const opts: LobbyJoinOptions = { name, map, room, roomId };
    const p = size ? LobbyConnection.create({ ...opts, size }) : LobbyConnection.join(opts);
    p.then((c) => { live = c; setConn(c); }).catch(() => setError("Nie udało się wejść do poczekalni. Sprawdź, czy serwer działa."));
    return () => { void live?.leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the chat pinned to the newest line.
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: "end" }); }, [state.chat.length]);

  const host = isHost(state.selfId, state.hostId);
  const ready = amReady(state.entrants, state.selfId);
  const startable = canStart({ selfId: state.selfId, hostId: state.hostId, phase: state.phase, entrants: state.entrants });
  const rows = useMemo(() => watchRows(state.bracket, state.arenas), [state.bracket, state.arenas]);
  const inLobby = state.phase === "poczekalnia";

  const link = typeof location !== "undefined" ? lobbyLink(location.href, room ?? "", map ?? "") : "";

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || !conn) return;
    conn.chat(text);
    setDraft("");
  }, [draft, conn]);

  const watch = useCallback((roomId: string) => {
    if (!roomId) return;
    // The shared spectator page (Viewer.tsx): a watcher takes no seat and cannot affect the round.
    window.open(`/viewer?room=${encodeURIComponent(roomId)}`, "_blank", "noopener");
  }, []);

  return (
    <section className="lobby" data-testid="lobby">
      <header className="lobby-head">
        <div>
          <h2 className="lb-h">POCZEKALNIA TURNIEJU</h2>
          <span className="lobby-sub" data-testid="lobby-phase">
            {state.phase === "poczekalnia" ? "Czekamy na graczy" : state.phase === "trwa" ? "Turniej trwa" : "Turniej zakończony"}
            {" · "}{rosterSummary(state.entrants, size ?? state.entrants.length)}
          </span>
        </div>
        <button type="button" className="mm-btn small" onClick={onLeave} data-testid="lobby-leave">WYJDŹ</button>
      </header>

      {error && <div className="mm-notice error" role="alert" data-testid="lobby-error">{error}</div>}

      <div className="lobby-grid2">
        {/* -------------------------------------------------------------- roster + controls */}
        <div className="lobby-col">
          <div className="lb-block">
            <h3 className="lb-h">GRACZE</h3>
            <ul className="lobby-roster" data-testid="lobby-roster">
              {state.entrants.length === 0 && <li className="lobby-empty">Jeszcze nikogo tu nie ma.</li>}
              {state.entrants.map((e) => (
                <li
                  key={e.id}
                  className={`lobby-entrant ${e.ready ? "ready" : ""} ${e.connected ? "" : "gone"} ${e.id === state.selfId ? "me" : ""}`}
                  data-testid="lobby-entrant"
                >
                  <b>{e.name}{e.id === state.hostId ? " ★" : ""}</b>
                  <span className="lobby-tag">
                    {!e.connected ? "ROZŁĄCZONY" : e.ready ? "GOTOWY" : "CZEKA"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lobby-controls">
            <button
              type="button"
              className={`mm-btn ${ready ? "on" : "primary"}`}
              disabled={!conn || !inLobby}
              onClick={() => conn?.setReady()}
              data-testid="lobby-ready-toggle"
              aria-pressed={ready}
            >
              {ready ? "GOTOWY ✓ — KLIKNIJ, BY COFNĄĆ" : "JESTEM GOTOWY"}
            </button>

            {host && (
              <button
                type="button"
                className="mm-btn primary big"
                disabled={!startable}
                onClick={() => conn?.start()}
                data-testid="lobby-start"
                title={startable ? "Rozpocznij turniej" : "Potrzeba co najmniej 2 gotowych graczy"}
              >
                START TURNIEJU ▸
              </button>
            )}

            <button type="button" className="mm-btn" onClick={onWarmup} data-testid="lobby-warmup" title="Zagraj z botem, czekając na turniej">
              ROZGRZEWKA Z BOTEM
            </button>
          </div>

          {/* --------------------------------------------------------------------- invite */}
          <div className="lb-block lobby-invite" data-testid="lobby-invite">
            <h3 className="lb-h">ZAPROŚ GRACZY</h3>
            <div className="row tight">
              <input readOnly value={link} data-testid="turniej-link" onFocus={(e) => e.currentTarget.select()} aria-label="Link zaproszenia" />
              <button
                type="button" className="mm-btn small"
                onClick={() => { void copyText(link).then((ok) => { setCopied(ok); window.setTimeout(() => setCopied(false), 1500); }); }}
              >
                {copied ? "SKOPIOWANO" : "KOPIUJ"}
              </button>
            </div>
            <small className="mm-hint">Kto otworzy ten link, trafi prosto do tej poczekalni.</small>
          </div>
        </div>

        {/* --------------------------------------------------------- bracket / matches / chat */}
        <div className="lobby-col">
          {state.bracket && (
            <div className="lb-block">
              <h3 className="lb-h">DRABINKA</h3>
              <BracketPanel bracket={state.bracket} compact />
            </div>
          )}

          {rows.length > 0 && (
            <div className="lb-block">
              <h3 className="lb-h">MECZE NA ŻYWO</h3>
              <ul className="lobby-matches" data-testid="lobby-matches">
                {rows.map((r) => (
                  <li key={r.matchIndex} className={`lobby-match ${r.live ? "live" : ""}`} data-testid="lobby-match">
                    <b>{r.label}</b>
                    <button
                      type="button" className="mm-btn small"
                      disabled={!r.roomId}
                      onClick={() => watch(r.roomId)}
                      data-testid="watch-match"
                    >
                      OGLĄDAJ ▸
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="lb-block lobby-chat-block">
            <h3 className="lb-h">CZAT</h3>
            <div className="lobby-chat" data-testid="lobby-chat">
              {state.chat.length === 0 && <div className="lobby-empty">Cisza. Napisz coś.</div>}
              {state.chat.map((l) => (
                <div key={l.id} className="lobby-chat-line" data-testid="lobby-chat-line">
                  <span className="lobby-chat-name">{l.name}</span>{" "}
                  <span className="lobby-chat-text">{l.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="row tight" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input
                value={draft} maxLength={LOBBY_CHAT_MAX_LEN} placeholder="Napisz… Enter wysyła"
                onChange={(e) => setDraft(e.target.value)} data-testid="lobby-chat-input"
                disabled={!conn}
              />
              <button type="submit" className="mm-btn small" disabled={!conn || !draft.trim()} data-testid="lobby-chat-send">WYŚLIJ</button>
            </form>
          </div>
        </div>
      </div>

      {map && MAPS[map] && <span className="sr-only" data-testid="lobby-map">{MAPS[map].name}</span>}
    </section>
  );
}

/** The warmup room's join arguments (D9), re-exported so the menu can build the `play` call the same way. */
export { warmupOptions };
