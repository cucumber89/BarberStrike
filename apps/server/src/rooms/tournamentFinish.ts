/**
 * Tournament finish — the trophy + hall-of-fame write (drop V, P7).
 *
 * The lobby room (`TournamentLobbyRoom`, P2) dirigates the draw and the arenas; this module owns the
 * ONE thing that happens when the final is over: it turns a finished `Bracket` into the rows the
 * account store keeps for the public hall of fame (`tournaments`) and for each signed-in player's
 * trophy shelf (`trophies`). It is deliberately a pure planner (`planFinish`) plus a thin persister
 * (`persistFinish`), so the write can be unit-tested against an in-memory database without a socket.
 *
 * Identity is by entrant id (the Colyseus `sessionId`): the `Bracket` carries ids in every slot and
 * a `names` map from id → nick, so the champion's id (`champion(bracket)`) resolves both to a display
 * name and — when the player was signed in — to their account. A guest champion is still recorded in
 * the hall of fame under their nick; only signed-in players receive a trophy row (there is no account
 * to hang it on otherwise). L1 holds: a trophy is cosmetic history, never a gate.
 */
import { champion, isDone, type Bracket } from "@frankibarber/shared";
import type { TournamentRecord } from "@frankibarber/shared";
import { accountById, accountByLogin, awardTrophy, recordTournament } from "../accounts/store";
import { verifySession } from "../accounts/session";

/** What a signed-in player carries into the lobby: their login and the account row it maps to. */
export interface LobbyIdentity {
  login: string;
  accountId: number;
}

/** One planned trophy: the account that earns it and the place it took (1 = champion). */
export interface PlannedTrophy {
  accountId: number;
  login: string;
  place: number;
}

/** The full plan for a finished tournament: the hall-of-fame row and every trophy to award. */
export interface FinishPlan {
  record: TournamentRecord;
  bracketJson: string;
  trophies: PlannedTrophy[];
}

/**
 * The place an entrant finished in a knockout draw, from the round they lost in.
 *
 * The champion is 1. A player who lost in the final is 2; the two who lost in the semi-finals share
 * 3, the four who lost in the quarters share 5, and so on — the standard bracket tiering where a
 * tier's place is the count of players who finished ABOVE it, plus one. A player who never lost a
 * match they played (they went out on a bye that never resolved, an edge case) counts as champion's
 * peer only if they are the champion; otherwise the last real match they lost decides it.
 */
export function placeOf(b: Bracket, id: string): number {
  if (!id) return 0;
  if (champion(b) === id) return 1;
  // The round the player lost in: the highest-round match where they appear but did not go through.
  let lostRound = -1;
  for (const m of b.matches) {
    if ((m.a === id || m.b === id) && m.winner && m.winner !== id) {
      if (m.round > lostRound) lostRound = m.round;
    }
  }
  if (lostRound < 0) return 0; // never lost a played match and is not champion → not placed
  // Players still alive after `lostRound` fill the places above this tier. Each round halves the
  // field, so after round r there are size / 2^(r+1) survivors; this tier's place is that + 1.
  const survivorsAbove = b.size / 2 ** (lostRound + 1);
  return survivorsAbove + 1;
}

/**
 * Plan the finish of a bracket: the hall-of-fame record plus the trophies for every signed-in
 * entrant. Pure — it reads the bracket and the identity map and returns rows; it writes nothing.
 * Returns `null` when the bracket is not actually over, so a stray call cannot record a half-draw.
 */
export function planFinish(
  tournamentId: string,
  b: Bracket,
  identities: Map<string, LobbyIdentity>,
  bracketJson: string,
  now = Date.now(),
): FinishPlan | null {
  if (!isDone(b) || !b.matches.length) return null;
  const championId = champion(b);
  const championName = b.names[championId] ?? "";
  // The hall-of-fame winner is the champion's login when signed in, else their nick (a guest win is
  // still worth recording; the trophy shelf just has nowhere to hang it).
  const winner = identities.get(championId)?.login || championName || "gość";

  const record: TournamentRecord = { id: tournamentId, endedAt: now, size: b.size, winner };

  // A trophy per signed-in entrant, at the place their run reached. Only ids that both carry an
  // identity AND took a real place get a row — a guest, or a player who never played, gets none.
  const trophies: PlannedTrophy[] = [];
  const seen = new Set<number>();
  for (const [id, who] of identities) {
    const place = placeOf(b, id);
    if (place <= 0) continue;
    if (seen.has(who.accountId)) continue; // one trophy per account per tournament
    seen.add(who.accountId);
    trophies.push({ accountId: who.accountId, login: who.login, place });
  }
  return { record, bracketJson, trophies };
}

/**
 * Persist a finish plan through the account store: one `tournaments` row and one `trophies` row per
 * signed-in placer. Idempotent on the tournament id (the store's INSERT OR REPLACE), so a re-run
 * after a lobby restart overwrites rather than duplicates the hall-of-fame row.
 */
export function persistFinish(plan: FinishPlan, now = Date.now()): void {
  recordTournament(plan.record, plan.bracketJson);
  for (const t of plan.trophies) awardTrophy(t.accountId, plan.record.id, t.place, now);
}

/**
 * Resolve a session token to a lobby identity, or `null` for a guest / bad / expired token. Kept here
 * so the lobby's `lobby:identify` handler (P7) stays a one-liner and the account lookup lives with the
 * rest of the finish logic — it reuses `verifySession` (P4), so a lobby identity is exactly as valid
 * as an authenticated REST call. A missing or unknown token is a guest, silently (L1).
 */
export function resolveIdentity(token: string | undefined | null): LobbyIdentity | null {
  const accountId = verifySession(token);
  if (accountId === null) return null;
  const acct = accountById(accountId);
  return acct ? { login: acct.login, accountId: acct.id } : null;
}

/**
 * Resolve a *claimed* login (no token) to a lobby identity, or `null` when no such account exists.
 *
 * The browser holds its session only in an HttpOnly cookie it cannot read, so a signed-in player in
 * the UI cannot hand the lobby a token over a WS message — it hands its login instead. This is a soft
 * attribution: it is enough to hang a COSMETIC trophy (L1) on the right shelf, and it cannot forge a
 * login that has never registered. The token path (`resolveIdentity`) remains the strong one, used by
 * the arena/REST seam; a claim only ever attributes a trophy, never grants access to anything.
 */
export function resolveClaim(login: string | undefined | null): LobbyIdentity | null {
  if (typeof login !== "string" || !login) return null;
  const acct = accountByLogin(login);
  return acct ? { login: acct.login, accountId: acct.id } : null;
}
