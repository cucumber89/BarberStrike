/**
 * Accounts store (V / drop H, P4): the CRUD over accounts, profiles, tournaments and trophies.
 *
 * The profile is an opaque JSON blob — the client rules its shape (V_SPEC 4.1), so the server only
 * stores and returns the string and enforces the ≤ 64 kB ceiling. The tournament + trophy tables
 * feed the public hall of fame (`GET /api/tournaments`) and per-account trophies (`GET /api/trophies`).
 */
import type { TournamentRecord, Trophy } from "@frankibarber/shared";
import { getDb } from "./db";

/** Cap on a stored profile blob (V_SPEC 4.3): 64 kB. */
export const PROFILE_MAX_BYTES = 64 * 1024;

export interface AccountRow {
  id: number;
  login: string;
  pass_hash: string;
  created_at: number;
}

/** Insert a new account. Throws (UNIQUE) when the login is taken — the route maps that to 409. */
export function createAccount(login: string, passHash: string, now = Date.now()): number {
  const info = getDb()
    .prepare("INSERT INTO accounts (login, pass_hash, created_at) VALUES (?, ?, ?)")
    .run(login, passHash, now);
  return Number(info.lastInsertRowid);
}

/** True when a login already exists (before insert, so the 409 is a clean check not an exception). */
export function loginExists(login: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM accounts WHERE login = ?").get(login);
  return row !== undefined;
}

/** The account for a login, or `null`. */
export function accountByLogin(login: string): AccountRow | null {
  return (getDb().prepare("SELECT * FROM accounts WHERE login = ?").get(login) as AccountRow | undefined) ?? null;
}

/** The account for an id, or `null`. */
export function accountById(id: number): AccountRow | null {
  return (getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined) ?? null;
}

/** The stored profile JSON for an account, or `null` when none has been written yet. */
export function getProfile(accountId: number): string | null {
  const row = getDb()
    .prepare("SELECT profile_json FROM profiles WHERE account_id = ?")
    .get(accountId) as { profile_json: string } | undefined;
  return row ? row.profile_json : null;
}

/** True when the account has no profile blob yet — the gate the hard `migrate` contract checks. */
export function profileIsEmpty(accountId: number): boolean {
  return getProfile(accountId) === null;
}

/** Upsert the profile blob. Rejects a blob over the ceiling; returns false when it does. */
export function saveProfile(accountId: number, profileJson: string, now = Date.now()): boolean {
  if (Buffer.byteLength(profileJson, "utf8") > PROFILE_MAX_BYTES) return false;
  getDb()
    .prepare(
      `INSERT INTO profiles (account_id, profile_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`,
    )
    .run(accountId, profileJson, now);
  return true;
}

/** Record a finished tournament for the hall of fame. */
export function recordTournament(rec: TournamentRecord, bracketJson: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO tournaments (id, ended_at, size, winner_login, bracket_json) VALUES (?, ?, ?, ?, ?)")
    .run(rec.id, rec.endedAt, rec.size, rec.winner, bracketJson);
}

/** The most recent tournaments, newest first, capped by `limit`. */
export function listTournaments(limit = 50): TournamentRecord[] {
  const rows = getDb()
    .prepare("SELECT id, ended_at, size, winner_login FROM tournaments ORDER BY ended_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(500, limit))) as { id: string; ended_at: number; size: number; winner_login: string }[];
  return rows.map((r) => ({ id: r.id, endedAt: r.ended_at, size: r.size, winner: r.winner_login }));
}

/** Award a trophy to an account for a tournament. */
export function awardTrophy(accountId: number, tournamentId: string, place: number, now = Date.now()): void {
  getDb()
    .prepare("INSERT INTO trophies (account_id, tournament_id, place, awarded_at) VALUES (?, ?, ?, ?)")
    .run(accountId, tournamentId, place, now);
}

/** The trophies on an account, newest first. */
export function trophiesForLogin(login: string): Trophy[] {
  const rows = getDb()
    .prepare(
      `SELECT t.tournament_id, t.place, t.awarded_at
       FROM trophies t JOIN accounts a ON a.id = t.account_id
       WHERE a.login = ? ORDER BY t.awarded_at DESC`,
    )
    .all(login) as { tournament_id: string; place: number; awarded_at: number }[];
  return rows.map((r) => ({ tournamentId: r.tournament_id, place: r.place, awardedAt: r.awarded_at }));
}
