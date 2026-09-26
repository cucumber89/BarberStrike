import { afterEach, describe, expect, it } from "vitest";
import { closeDb, useTestDb } from "./db";
import { hashPassword, verifyPassword } from "./hash";
import { createSession, verifySession, revokeSession, hashToken, SESSION_TTL_MS } from "./session";
import { isRateLimited, recordFailedAttempt, clearAttempts, RATE_MAX_ATTEMPTS } from "./rateLimit";
import {
  accountByLogin, awardTrophy, createAccount, getProfile, listTournaments, loginExists,
  profileIsEmpty, recordTournament, saveProfile, trophiesForLogin, PROFILE_MAX_BYTES,
} from "./store";

afterEach(() => closeDb());

describe("db schema", () => {
  it("creates exactly the six tables from V_SPEC 4.1", () => {
    const db = useTestDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(
      ["accounts", "login_attempts", "profiles", "sessions", "tournaments", "trophies"].sort(),
    );
    expect(names.length).toBe(6);
  });
});

describe("password hash (scrypt)", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const stored = hashPassword("correct horse");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("wrong horse", stored)).toBe(false);
  });
  it("rejects a malformed stored string", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$$")).toBe(false);
  });
  it("salts each hash so equal passwords hash differently", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("sessions", () => {
  it("stores only the token hash and resolves a valid token to the account", () => {
    const db = useTestDb();
    const id = createAccount("player_one", hashPassword("pw123456"));
    const token = createSession(id);
    expect(verifySession(token)).toBe(id);
    // The plaintext token is never in the table — only its SHA-256 is a stored key.
    const row = db.prepare("SELECT token_hash FROM sessions WHERE account_id = ?").get(id) as { token_hash: string };
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
  });

  it("rejects an unknown, expired or revoked token", () => {
    useTestDb();
    const id = createAccount("player_two", hashPassword("pw123456"));
    const token = createSession(id, Date.now());
    expect(verifySession("nope")).toBe(null);
    expect(verifySession(undefined)).toBe(null);
    // Expired: verify with a clock past the TTL.
    expect(verifySession(token, Date.now() + SESSION_TTL_MS + 1)).toBe(null);
    // The expired sweep removed it, so even a fresh clock now fails.
    expect(verifySession(token)).toBe(null);
    // Revoke a fresh token.
    const t2 = createSession(id);
    revokeSession(t2);
    expect(verifySession(t2)).toBe(null);
  });

  it("hashToken is deterministic sha-256 hex", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("rate limit (login+ip)", () => {
  it("allows five failures then trips on the sixth, and resets on clear", () => {
    useTestDb();
    const login = "victim", ip = "1.2.3.4";
    for (let i = 0; i < RATE_MAX_ATTEMPTS; i++) {
      expect(isRateLimited(login, ip)).toBe(false);
      recordFailedAttempt(login, ip);
    }
    expect(isRateLimited(login, ip)).toBe(true);
    clearAttempts(login, ip);
    expect(isRateLimited(login, ip)).toBe(false);
  });

  it("keys on both login and ip", () => {
    useTestDb();
    for (let i = 0; i < RATE_MAX_ATTEMPTS; i++) recordFailedAttempt("a", "ip1");
    expect(isRateLimited("a", "ip1")).toBe(true);
    expect(isRateLimited("a", "ip2")).toBe(false);
    expect(isRateLimited("b", "ip1")).toBe(false);
  });
});

describe("store CRUD", () => {
  it("creates accounts, flags duplicates, and looks them up", () => {
    useTestDb();
    const id = createAccount("dupe_me", hashPassword("pw123456"));
    expect(loginExists("dupe_me")).toBe(true);
    expect(accountByLogin("dupe_me")?.id).toBe(id);
    expect(() => createAccount("dupe_me", "x")).toThrow();
  });

  it("treats a fresh account profile as empty and saves/reads a blob", () => {
    useTestDb();
    const id = createAccount("saver", hashPassword("pw123456"));
    expect(profileIsEmpty(id)).toBe(true);
    expect(getProfile(id)).toBe(null);
    expect(saveProfile(id, JSON.stringify({ xp: 42 }))).toBe(true);
    expect(profileIsEmpty(id)).toBe(false);
    expect(JSON.parse(getProfile(id)!).xp).toBe(42);
  });

  it("rejects a profile blob over the 64 kB ceiling", () => {
    useTestDb();
    const id = createAccount("big", hashPassword("pw123456"));
    const big = JSON.stringify({ blob: "x".repeat(PROFILE_MAX_BYTES) });
    expect(saveProfile(id, big)).toBe(false);
  });

  it("records tournaments and trophies for the hall of fame", () => {
    useTestDb();
    const id = createAccount("champ", hashPassword("pw123456"));
    recordTournament({ id: "t1", endedAt: 1000, size: 8, winner: "champ" }, "[[a,b]]");
    awardTrophy(id, "t1", 1);
    const hof = listTournaments();
    expect(hof.length).toBe(1);
    expect(hof[0].winner).toBe("champ");
    const trophies = trophiesForLogin("champ");
    expect(trophies.length).toBe(1);
    expect(trophies[0].place).toBe(1);
  });
});
