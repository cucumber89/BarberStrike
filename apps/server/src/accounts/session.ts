/**
 * Sessions (V / drop H, P4): a 32-byte random token, of which the database keeps only the SHA-256.
 *
 * The plaintext token goes to the client (cookie `bs_sess`, and localStorage as a fallback the WS
 * `joinById` can read). The server stores `sha256(token)` (graft from A): a leak of the sessions
 * table does not reveal any live token. TTL is 30 days; a session is revocable by deleting its row.
 */
import { randomBytes, createHash } from "node:crypto";
import { getDb } from "./db";

/** Thirty days in milliseconds — the session lifetime. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

/** The SHA-256 (hex) of a token — the key we actually store and look up. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a session for `accountId`, store its hash, and return the plaintext token for the client. */
export function createSession(accountId: number, now = Date.now()): string {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = now + SESSION_TTL_MS;
  getDb()
    .prepare("INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, accountId, expiresAt, now);
  return token;
}

/**
 * Resolve a token to its account id, or `null` when it is unknown or expired. An expired row is
 * swept as it is found so the table does not grow without bound.
 */
export function verifySession(token: string | undefined | null, now = Date.now()): number | null {
  if (!token || typeof token !== "string") return null;
  const tokenHash = hashToken(token);
  const db = getDb();
  const row = db
    .prepare("SELECT account_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { account_id: number; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  return row.account_id;
}

/** Revoke a single session (logout). No-op when the token is unknown. */
export function revokeSession(token: string | undefined | null): void {
  if (!token || typeof token !== "string") return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}
