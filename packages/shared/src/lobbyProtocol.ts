/**
 * The wire between the tournament waiting-room (`tournament-lobby`) and its clients — drop V.
 *
 * The lobby is a coordinator with no bodies and no physics: it holds the roster, readiness, the chat,
 * the bracket string and the map of pairs to arena rooms, and it dirigates the START. This file is
 * the SHAPE of that traffic (message names and the state clients see) plus the few constants the
 * server enforces. It carries no schema classes — those live server-side in
 * `apps/server/src/rooms/LobbyState.ts` — and no game protocol: the arenas are ordinary `tdm`
 * duels and speak the game's own messages, untouched (L6).
 */

/** The three states a tournament passes through, as the roster screen names them. */
export type LobbyPhase = "poczekalnia" | "trwa" | "koniec";

// ----------------------------------------------------------------- the limits (D8, §2)

/**
 * Hard production caps for the VPS (2 vCPU / 4 GB, owner 2026-09-25). Thirty-two entrants is sixteen
 * round-one arenas; ninety-six spectators is those sixteen arenas × six seats each. Enforced in the
 * lobby server; the final gate re-confirms `tick.maxMs < 8 ms` at sixteen arenas or drops to 16/48.
 */
export const TOURNAMENT_MAX_ENTRANTS = 32;
export const TOURNAMENT_MAX_SPECTATORS_TOTAL = 96;

/**
 * Chat safety (§3.3), authoritative server-side. A line longer than this is truncated; a second line
 * inside the interval is dropped silently.
 */
export const LOBBY_CHAT_MAX_LEN = 200;
export const LOBBY_CHAT_MIN_INTERVAL_MS = 1000;

// ----------------------------------------------------------------- C2S (client → lobby)

/** The message names a client may send the lobby. Nothing here touches the game protocol. */
export type LobbyC2SType = "lobby:ready" | "lobby:start" | "lobby:chat" | "lobby:spectate";

/** Toggle my readiness. `ready` omitted means "flip it". */
export interface LobbyReadyMsg { ready?: boolean }
/** Host-only: draw the bracket and raise the round-one arenas. Ignored from anybody else. */
export type LobbyStartMsg = Record<string, never>;
/** A chat line, before the server truncates and sanitises it. */
export interface LobbyChatMsg { text: string }
/** Ask which arena to watch, by its match index in the bracket. */
export interface LobbySpectateMsg { matchIndex: number }

/** The typed payload for each C2S message name. */
export interface LobbyC2S {
  "lobby:ready": LobbyReadyMsg;
  "lobby:start": LobbyStartMsg;
  "lobby:chat": LobbyChatMsg;
  "lobby:spectate": LobbySpectateMsg;
}

// ----------------------------------------------------------------- S2C (lobby → client)

/** The message names the lobby may push a client outside the replicated state. */
export type LobbyS2CType = "lobby:chat" | "lobby:goto";

/** A chat line as it reaches clients: already truncated, sanitised and stamped. */
export interface LobbyChatLine { id: string; name: string; text: string; at: number }
/** "Go watch / play this room" — the client opens `/viewer?room=<roomId>` or joins it. */
export interface LobbyGotoMsg { roomId: string; matchIndex: number }

/** The typed payload for each S2C message name. */
export interface LobbyS2C {
  "lobby:chat": LobbyChatLine;
  "lobby:goto": LobbyGotoMsg;
}

// ----------------------------------------------------------------- the state clients see (D2/D3)

/**
 * One entrant on the roster. `seat` is the explicit slot number and `connected` the liveness flag
 * (both grafted from project A) so a player who drops is still named and seated through the grace.
 */
export interface EntrantShape {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  seat: number;
}

/** One running (or finished) arena: which pair, which room, and whether it is live. */
export interface ArenaShape {
  matchIndex: number;
  roomId: string;
  live: boolean;
}

/**
 * The lobby's replicated state, as the client reads it. The server's `TournamentLobbyState` schema
 * (Colyseus `MapSchema`) mirrors this shape; here the collections are plain records for the client.
 * `bracket` is the SAME wire format as `bracketString` (`tournament.ts`) — no new bracket protocol.
 */
export interface TournamentLobbyStateShape {
  hostId: string;
  phase: LobbyPhase;
  entrants: Record<string, EntrantShape>;
  bracket: string;
  arenas: Record<string, ArenaShape>;
}

// ----------------------------------------------------------------- chat sanitising (shared, §3.3)

/**
 * The one server-authoritative cleaner for a chat line, reused by the lobby room so the truncation
 * and escaping cannot drift from the constants above. Trims to `LOBBY_CHAT_MAX_LEN`, strips control
 * characters, and escapes `&`, `<`, `>` so the line is safe as plain text on the client (which
 * renders it as text, never `dangerouslySetInnerHTML`). Order matters: `&` is escaped first so the
 * entities it produces are not double-escaped.
 */
export function sanitizeChat(s: string): string {
  return String(s ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .slice(0, LOBBY_CHAT_MAX_LEN)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
