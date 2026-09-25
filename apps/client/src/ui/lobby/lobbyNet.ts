import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import type {
  ArenaShape, EntrantShape, LobbyChatLine, LobbyGotoMsg, LobbyPhase, TournamentSize,
} from "@frankibarber/shared";
import { lobby } from "../../net/lobbyStore";
import { defaultServerUrl } from "../../game/net/Connection";

/**
 * The client side of the tournament waiting-room wire — drop V (P5).
 *
 * A thin wrapper over the `tournament-lobby` Colyseus room (server: P2), the lobby's counterpart to
 * `game/net/Connection.ts` for the arenas. It does one job: keep `net/lobbyStore.ts` (the store P0
 * built) in step with the replicated roster / bracket / arenas, and expose the four C2S messages the
 * screen sends (ready, start, chat, spectate). It carries NO game protocol — the arenas are ordinary
 * `tdm` duels and are joined through their own `Connection` / `Viewer`, untouched (L6).
 *
 * The state shape here mirrors the server's `LobbyState` schema; the SDK hands it back as schema
 * instances, so the replicated collections are read through `getStateCallbacks` and copied into the
 * plain-object store the React tree reads.
 */

/** The replicated lobby state as the SDK surfaces it (schema instances; we only read it). */
interface LobbyRoomState {
  hostId: string;
  phase: LobbyPhase;
  bracket: string;
  entrants: { forEach(cb: (e: EntrantShape, key: string) => void): void };
  arenas: { forEach(cb: (a: ArenaShape, key: string) => void): void };
}

export interface LobbyJoinOptions {
  url?: string;
  name: string;
  /** Host-only: the draw size to create the lobby with (4 / 8 / 16 / 32). Omitted when joining one. */
  size?: TournamentSize;
  map?: string;
  /** The room name to create/join by (from the invite link, `mode=lobby`). */
  room?: string;
  /** Join an existing lobby by its id (a shared link resolved to a room). */
  roomId?: string;
  /** Watch only — takes a spectator seat, never an entrant slot. */
  spectator?: boolean;
}

/**
 * A live lobby connection. Its constructor is private: use `LobbyConnection.create` /
 * `LobbyConnection.join`, which resolve once the room is bound to the store.
 */
export class LobbyConnection {
  readonly room: Room<LobbyRoomState>;
  readonly sessionId: string;
  private disposed = false;

  private constructor(room: Room<LobbyRoomState>) {
    this.room = room;
    this.sessionId = room.sessionId;
    this.bind();
  }

  /** Host: make a new lobby of `size`, become its host, and land in the waiting room. */
  static async create(opts: LobbyJoinOptions & { size: TournamentSize }): Promise<LobbyConnection> {
    const client = new Client(opts.url ?? defaultServerUrl());
    const room = await client.create<LobbyRoomState>("tournament-lobby", joinPayload(opts));
    return new LobbyConnection(room);
  }

  /** Guest: join a lobby that already exists, by name (joinOrCreate) or by id (an opened link). */
  static async join(opts: LobbyJoinOptions): Promise<LobbyConnection> {
    const client = new Client(opts.url ?? defaultServerUrl());
    const room = opts.roomId
      ? await client.joinById<LobbyRoomState>(opts.roomId, joinPayload(opts))
      : await client.joinOrCreate<LobbyRoomState>("tournament-lobby", joinPayload(opts));
    return new LobbyConnection(room);
  }

  /** Wires the replicated state + the two out-of-band messages into `lobbyStore`. */
  private bind(): void {
    const write = () => lobby.set({
      joined: true,
      selfId: this.sessionId,
      hostId: this.room.state.hostId,
      phase: this.room.state.phase,
      bracket: this.room.state.bracket,
      entrants: collect<EntrantShape>(this.room.state.entrants).sort((a, b) => a.seat - b.seat),
      arenas: collect<ArenaShape>(this.room.state.arenas).sort((a, b) => a.matchIndex - b.matchIndex),
    });
    // A wildcard keeps the SDK quiet about messages the screen does not consume.
    this.room.onMessage("*", () => {});
    this.room.onMessage<LobbyChatLine>("lobby:chat", (line) => lobby.pushChat(line));
    // „lobby:goto” is the server telling a client which arena to open; the screen also derives this
    // from the arena map, so here it is a hook the caller may listen to but the store already has it.
    this.room.onMessage<LobbyGotoMsg>("lobby:goto", (msg) => { for (const cb of this.gotoHandlers) cb(msg); });
    this.room.onStateChange(write);
    // Some SDK builds surface schema children only after the first per-field callback is armed.
    try { getStateCallbacks(this.room); } catch { /* first snapshot still writes through onStateChange */ }
    write();
    this.room.onLeave(() => { if (!this.disposed) lobby.set({ joined: false }); });
  }

  private gotoHandlers: ((msg: LobbyGotoMsg) => void)[] = [];
  onGoto(cb: (msg: LobbyGotoMsg) => void): void { this.gotoHandlers.push(cb); }

  /** Flip (or set) my readiness. Omitting `ready` toggles it, matching the protocol. */
  setReady(ready?: boolean): void { this.send("lobby:ready", ready === undefined ? {} : { ready }); }
  /** Host-only: draw the bracket and raise the round-one arenas. Ignored server-side from anyone else. */
  start(): void { this.send("lobby:start", {}); }
  /** Send a chat line; the server truncates, rate-limits and escapes it (§3.3). */
  chat(text: string): void { this.send("lobby:chat", { text }); }
  /** Ask which arena to watch by its match index (the server may answer with `lobby:goto`). */
  spectate(matchIndex: number): void { this.send("lobby:spectate", { matchIndex }); }

  private send(type: string, payload: unknown): void {
    if (this.disposed) return;
    try { this.room.send(type, payload); } catch { /* room already gone */ }
  }

  async leave(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.gotoHandlers.length = 0;
    lobby.reset();
    try { await this.room.leave(true); } catch { /* already closed */ }
  }
}

/** The join arguments the lobby room reads. Kept small and always-present so a proxy cannot drop a key. */
function joinPayload(opts: LobbyJoinOptions): Record<string, unknown> {
  return {
    name: opts.name,
    room: opts.room ?? "",
    map: opts.map ?? "",
    size: opts.size ?? 0,
    spectator: opts.spectator === true,
  };
}

/** A schema map or the SDK's proxy of it, flattened to a plain array the store can hold. */
function collect<T>(map: { forEach(cb: (v: T, key: string) => void): void } | undefined): T[] {
  const out: T[] = [];
  map?.forEach((v) => out.push(shallow(v)));
  return out;
}

/** A plain copy of a schema instance's own enumerable fields — the store must not hold live schema. */
function shallow<T>(v: T): T {
  if (v && typeof v === "object") return { ...(v as Record<string, unknown>) } as T;
  return v;
}
