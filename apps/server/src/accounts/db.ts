/**
 * Accounts persistence (V / drop H, P4): the one SQLite handle and the schema.
 *
 * SQLite via `better-sqlite3` (owner's pick, D6): one file, one process, synchronous — a backup is
 * a copy of the file. Everything about accounts lives OUTSIDE the game loop (L6): this is a REST
 * store on the existing Express server, never a Colyseus room and never a replicated schema field.
 *
 * Six tables (V_SPEC 4.1). `sessions` stores the SHA-256 of the token, never the token itself
 * (graft from project A): a database leak does not hand an attacker live sessions. `login_attempts`
 * is the rate-limit ledger keyed by (login, ip), which blocks both enumeration and a distributed
 * guess — not a counter on the account row.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

let db: DB | null = null;

/** Where the file lives. `data/accounts.db` under the server working directory, or `:memory:` in tests. */
function resolveDbPath(): string {
  const override = process.env.ACCOUNTS_DB;
  if (override) return override;
  return path.resolve(process.cwd(), "data", "accounts.db");
}

/** The DDL for all six tables. Idempotent — `IF NOT EXISTS` so opening an existing file is a no-op. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  account_id INTEGER PRIMARY KEY,
  profile_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  ended_at INTEGER NOT NULL,
  size INTEGER NOT NULL,
  winner_login TEXT NOT NULL,
  bracket_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trophies (
  account_id INTEGER NOT NULL,
  tournament_id TEXT NOT NULL,
  place INTEGER NOT NULL,
  awarded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  login TEXT NOT NULL,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_trophies_account ON trophies(account_id);
CREATE INDEX IF NOT EXISTS idx_attempts_key ON login_attempts(login, ip, ts);
`;

/** Open (once) and migrate the database. Creates the `data/` directory for the file when needed. */
export function openDb(dbPath = resolveDbPath()): DB {
  if (db) return db;
  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }
  const handle = new Database(dbPath);
  handle.pragma("journal_mode = WAL");
  handle.pragma("foreign_keys = ON");
  handle.exec(SCHEMA);
  db = handle;
  return db;
}

/** The open handle, opening it lazily on first use. */
export function getDb(): DB {
  return db ?? openDb();
}

/** Point the store at a fresh in-memory database. Tests use this to stay isolated. */
export function useTestDb(): DB {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
  }
  db = null;
  return openDb(":memory:");
}

/** Close the handle (tests, shutdown). The next `getDb` reopens. */
export function closeDb(): void {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
    db = null;
  }
}
