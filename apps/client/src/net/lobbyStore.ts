import { useSyncExternalStore } from "react";
import type {
  ArenaShape, EntrantShape, LobbyChatLine, LobbyPhase, TournamentLobbyStateShape,
} from "@frankibarber/shared";

/**
 * The client's thin view of the tournament waiting-room — drop V (P0).
 *
 * A tiny external store, the same shape as `game/store.ts`'s `HudStore`: the Colyseus room's
 * `onStateChange` writes the roster / bracket / arenas here with `set`, and React reads with
 * `useLobby`. It holds only lobby meta — nothing about the game loop, which stays in the arena's own
 * store. P2/P5 fill it from the wire; P0 provides the plumbing and the setters.
 */

export interface LobbyState {
  /** True once we are in a lobby room (P5 flips it on join). */
  joined: boolean;
  hostId: string;
  /** Our own Colyseus sessionId, so the UI can tell "am I the host?". */
  selfId: string;
  phase: LobbyPhase;
  entrants: EntrantShape[];
  bracket: string;
  arenas: ArenaShape[];
  chat: LobbyChatLine[];
}

const initialLobby: LobbyState = {
  joined: false,
  hostId: "",
  selfId: "",
  phase: "poczekalnia",
  entrants: [],
  bracket: "",
  arenas: [],
  chat: [],
};

type Listener = () => void;

class LobbyStore {
  private state: LobbyState = initialLobby;
  private listeners = new Set<Listener>();

  get = (): LobbyState => this.state;

  set(patch: Partial<LobbyState>): void {
    let changed = false;
    for (const k in patch) {
      const key = k as keyof LobbyState;
      if (this.state[key] !== patch[key]) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  /** Replace the whole roster/bracket/arenas from one replicated snapshot. */
  fromSnapshot(s: TournamentLobbyStateShape): void {
    this.set({
      hostId: s.hostId,
      phase: s.phase,
      bracket: s.bracket,
      entrants: Object.values(s.entrants).sort((a, b) => a.seat - b.seat),
      arenas: Object.values(s.arenas).sort((a, b) => a.matchIndex - b.matchIndex),
    });
  }

  /** Append a sanitised chat line the server pushed. */
  pushChat(line: LobbyChatLine): void {
    this.set({ chat: [...this.state.chat, line].slice(-100) });
  }

  reset(): void {
    this.state = initialLobby;
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const lobby = new LobbyStore();

export function useLobby(): LobbyState {
  return useSyncExternalStore(lobby.subscribe, lobby.get, lobby.get);
}

export function useLobbySlice<T>(selector: (s: LobbyState) => T): T {
  return useSyncExternalStore(lobby.subscribe, () => selector(lobby.get()), () => selector(lobby.get()));
}
