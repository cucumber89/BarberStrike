import { TOURNAMENT_SIZES, TOURNAMENT_MAX_ENTRANTS, parseBracket, roundName, type EntrantShape, type TournamentSize } from "@frankibarber/shared";

/**
 * The pure rules the waiting-room screen reads — drop V (P5).
 *
 * Everything the lobby UI decides that does NOT need a socket or the DOM lives here, so the START
 * gate, the "am I the host" question, the ready count and the live-bracket labels are testable
 * without a browser (the client's tests run in node — `vitest.config.ts`). `Lobby.tsx` is then only
 * wiring: it holds no rule of its own.
 */

/** The draw sizes a host may pick, straight from the shared list (D5: 4 / 8 / 16 / 32). */
export const LOBBY_SIZES: readonly TournamentSize[] = TOURNAMENT_SIZES;

/** Is `size` one the build actually offers? Guards the size read from a URL or storage. */
export function isLobbySize(n: number): n is TournamentSize {
  return (TOURNAMENT_SIZES as readonly number[]).includes(n);
}

/** How many entrants have flipped themselves ready. */
export function readyCount(entrants: readonly EntrantShape[]): number {
  return entrants.reduce((n, e) => n + (e.ready ? 1 : 0), 0);
}

/**
 * START may be pressed only by the host, and only once at least two people are ready — a bracket of
 * one is not a tournament, and the server enforces the same (P2). The phase must still be the
 * waiting room: once it says „trwa” the arenas are up and there is nothing left to start.
 */
export function canStart(args: { selfId: string; hostId: string; phase: string; entrants: readonly EntrantShape[] }): boolean {
  return isHost(args.selfId, args.hostId) && args.phase === "poczekalnia" && readyCount(args.entrants) >= 2;
}

/** Am I the one who created this lobby? Only the host sees START and the size picker. */
export function isHost(selfId: string, hostId: string): boolean {
  return selfId !== "" && selfId === hostId;
}

/** My own entry on the roster, if I am on it — the ready toggle reads its current state from here. */
export function selfEntrant(entrants: readonly EntrantShape[], selfId: string): EntrantShape | undefined {
  return entrants.find((e) => e.id === selfId);
}

/** Am I ready right now? False when I am not even on the roster (a spectator, before joining). */
export function amReady(entrants: readonly EntrantShape[], selfId: string): boolean {
  return selfEntrant(entrants, selfId)?.ready === true;
}

/**
 * One live arena as the "watch a match" list draws it: the pair's names from the bracket string, the
 * room to open in the viewer, and whether it is still being played. The bracket and the arena map are
 * two separate replicated things (`matchIndex` is the key that joins them), so this pairs them up.
 */
export interface WatchRow {
  matchIndex: number;
  roomId: string;
  live: boolean;
  /** „ALFA vs BRAVO”, or the round name when the pair's names are not in the string yet. */
  label: string;
}

/** The live arenas paired with their bracket names, in match order, for the OGLĄDAJ list. */
export function watchRows(bracket: string, arenas: readonly { matchIndex: number; roomId: string; live: boolean }[]): WatchRow[] {
  const view = parseBracket(bracket);
  return [...arenas]
    .sort((a, b) => a.matchIndex - b.matchIndex)
    .map((a) => {
      const m = view?.matches[a.matchIndex];
      const label = m && m.a && m.b ? `${m.a} vs ${m.b}` : matchStage(bracket, a.matchIndex);
      return { matchIndex: a.matchIndex, roomId: a.roomId, live: a.live, label };
    });
}

/** The round a given match sits in, named the way the bracket panel names it („PÓŁFINAŁ” …). "" when unknown. */
export function matchStage(bracket: string, matchIndex: number): string {
  const view = parseBracket(bracket);
  const m = view?.matches[matchIndex];
  if (!view || !m) return "";
  const total = view.matches.reduce((n, x) => Math.max(n, x.round), 0) + 1;
  return roundName(total - m.round);
}

/**
 * The warmup room's join arguments (D9): a 1 v 1 `duel` filled with one bot, on the duel's own arena.
 * It is an ordinary `tdm mode=duel` create — NOT a tournament arena — so a player waiting for the
 * bracket to fill can shoot something in the meantime. `bots` is at least one and never the last
 * seat (a duel is two seats, so exactly one bot).
 */
export function warmupOptions(): { mode: "create"; gameMode: "duel"; bots: number } {
  return { mode: "create", gameMode: "duel", bots: 1 };
}

/** A short, human summary of the roster for the header: „3 / 8 · 2 gotowych”. */
export function rosterSummary(entrants: readonly EntrantShape[], size: number): string {
  const cap = isLobbySize(size) ? size : TOURNAMENT_MAX_ENTRANTS;
  return `${entrants.length} / ${cap} · ${readyCount(entrants)} gotowych`;
}
