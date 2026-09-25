/**
 * Login rate limit (V / drop H, P4): five attempts per fifteen minutes per (login, ip).
 *
 * The key is the full (login, ip) pair (graft from A): a counter on the account row would let an
 * attacker lock a victim out by spamming their login, and would not slow a distributed guess spread
 * across many logins from one IP. Keyed by both, neither attack gets a free pass. Attempts live in
 * the `login_attempts` table; old rows outside the window are swept as the check runs.
 */
import { getDb } from "./db";

/** The window: fifteen minutes. */
export const RATE_WINDOW_MS = 15 * 60 * 1000;
/** How many failures inside the window trip the limit. The sixth is refused with 429. */
export const RATE_MAX_ATTEMPTS = 5;

/**
 * True when (login, ip) has already used up its attempts inside the window. Call BEFORE checking the
 * password; when it returns true the route answers 429 without touching the hash.
 */
export function isRateLimited(login: string, ip: string, now = Date.now()): boolean {
  const db = getDb();
  const since = now - RATE_WINDOW_MS;
  db.prepare("DELETE FROM login_attempts WHERE ts < ?").run(since);
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE login = ? AND ip = ? AND ts >= ?")
    .get(login, ip, since) as { n: number };
  return row.n >= RATE_MAX_ATTEMPTS;
}

/** Record one failed attempt for (login, ip). Only failures count toward the limit. */
export function recordFailedAttempt(login: string, ip: string, now = Date.now()): void {
  getDb().prepare("INSERT INTO login_attempts (login, ip, ts) VALUES (?, ?, ?)").run(login, ip, now);
}

/** Clear the ledger for (login, ip) — called on a successful login so a good password resets the count. */
export function clearAttempts(login: string, ip: string): void {
  getDb().prepare("DELETE FROM login_attempts WHERE login = ? AND ip = ?").run(login, ip);
}
