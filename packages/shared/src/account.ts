/**
 * Accounts (drop H / V): the shared shapes and the one login validator that the client and the
 * server must agree on.
 *
 * Everything about persistence — SQLite, scrypt, the REST routes — lives server-side (P4); this
 * file is only the DTOs that cross the wire and the login rule, kept here so the sign-up form and
 * the `POST /api/register` handler reject exactly the same strings.
 */

/** A login: 3–20 characters of lowercase letters, digits and underscore. Nothing else. */
export const LOGIN_RE = /^[a-z0-9_]{3,20}$/;

/** True when `s` is a login this build will accept. The same gate on both sides of the wire. */
export function isValidLogin(s: string): boolean {
  return typeof s === "string" && LOGIN_RE.test(s);
}

/** A session token as the client holds it (opaque string). The server stores only its SHA-256. */
export type SessionToken = string;

/** The account as `GET /api/me` returns it — identity only, never the password hash. */
export interface AccountDTO {
  login: string;
  /** Epoch ms the account was created. */
  createdAt: number;
}

/** One row of the hall of fame: a finished tournament and who won it. */
export interface TournamentRecord {
  id: string;
  /** Epoch ms the tournament ended. */
  endedAt: number;
  /** The draw size (4 / 8 / 16 / 32). */
  size: number;
  /** The champion's login, or a guest nickname when the winner was not signed in. */
  winner: string;
}

/** A trophy on an account: the tournament it came from and the place taken (1 = champion). */
export interface Trophy {
  tournamentId: string;
  place: number;
  /** Epoch ms the trophy was awarded. */
  awardedAt: number;
}
