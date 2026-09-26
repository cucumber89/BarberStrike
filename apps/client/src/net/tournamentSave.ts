import { parseBracket, type TournamentRecord } from "@frankibarber/shared";
import { loadProfile, saveProfile } from "../game/progression/profile";
import { lobby } from "./lobbyStore";
import { account } from "./account";

/**
 * Tournament save — the client half of the trophy write (drop V, P7).
 *
 * When a lobby reports `phase="koniec"`, the tournament is over: this appends a `TournamentRecord` to
 * the local `Profile.tournaments[]` (the trophy shelf, D7) through the one save chokepoint
 * (`saveProfile`), which — for a signed-in player — also debounces it up to the cloud (P6). The server
 * keeps its own authoritative rows for the public hall of fame (`TournamentLobbyRoom` → account store,
 * P7); this is the player-facing history that follows their profile, guest or not (L1).
 *
 * It also lets a signed-in player IDENTIFY to a lobby (`identifyLobby`) so the server can hang a
 * trophy on the right account. The browser holds its session only in an HttpOnly cookie it cannot
 * read, so it claims its login; the server verifies a token when it has one and treats a bare login as
 * a soft, cosmetic attribution (see `tournamentFinish.ts`).
 */

/** The champion's display name from a bracket string, or "" when it is not finished / unreadable. */
export function championName(bracket: string): string {
  const view = parseBracket(bracket);
  if (!view || !view.matches.length) return "";
  // The bracket is over when `at` has walked past the last match; the final is the last match and its
  // `winner` side names the champion.
  if (view.at < view.matches.length) return "";
  const final = view.matches[view.matches.length - 1];
  return final.winner === "a" ? final.a : final.winner === "b" ? final.b : "";
}

/** Build the record a finished bracket becomes on the shelf. Returns null when it is not decided. */
export function recordFromBracket(bracket: string, id: string, now = Date.now()): TournamentRecord | null {
  const view = parseBracket(bracket);
  if (!view) return null;
  const winner = championName(bracket);
  if (!winner) return null;
  return { id, endedAt: now, size: view.size, winner };
}

/**
 * Append a finished tournament to the local profile once. De-duplicated by `id`, so a re-entered
 * „koniec” (a re-render, a reconnect) cannot double the shelf. Written through `saveProfile`, the one
 * chokepoint, so a signed-in player's shelf also rides up to the cloud.
 */
export function saveTournamentRecord(rec: TournamentRecord): void {
  const p = loadProfile();
  if (p.tournaments.some((t) => t.id === rec.id)) return;
  saveProfile({ ...p, tournaments: [...p.tournaments, rec] });
}

/**
 * Tell a lobby who we are, if we are signed in, so the server can award a trophy to our account. A
 * guest sends nothing. `room.send` is used directly (the identify message is out-of-band from the
 * typed lobby API); a closed room swallows the send.
 */
export function identifyLobby(room: { send(type: string, payload: unknown): void }): void {
  const who = account.get().account;
  if (!who) return;
  try { room.send("lobby:identify", { login: who.login }); } catch { /* room gone: nothing to attribute */ }
}

/**
 * Subscribe to the lobby store and persist a `TournamentRecord` the moment a tournament ends.
 *
 * Called once on client boot (App). It watches for the `poczekalnia`/`trwa` → `koniec` edge and, on
 * it, reads the final bracket and writes the record. The lobby's roomId is not in the store, so the
 * record id is derived from the bracket + the end time — stable within one finish, and the local
 * de-dup key only needs to be unique per this client's own shelf.
 */
export function installTournamentSave(): () => void {
  let lastPhase = lobby.get().phase;
  return lobby.subscribe(() => {
    const s = lobby.get();
    if (s.phase === "koniec" && lastPhase !== "koniec") {
      const id = `local-${s.bracket.length}-${championName(s.bracket)}-${new Date().toISOString().slice(0, 10)}`;
      const rec = recordFromBracket(s.bracket, id);
      if (rec) saveTournamentRecord(rec);
    }
    lastPhase = s.phase;
  });
}
