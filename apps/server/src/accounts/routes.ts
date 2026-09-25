/**
 * Accounts REST (V / drop H, P4): the Express router mounted under `/api`, BEFORE the SPA fallback.
 *
 * Every account concern lives here, off the game loop (L6): register / login / logout / me /
 * profile / migrate, plus the two public reads (hall of fame, trophies). The login validator is the
 * shared one (`isValidLogin`) so this handler rejects exactly the strings the sign-up form does.
 *
 * The session token rides in an HttpOnly cookie `bs_sess` (SameSite=Strict, Secure in production)
 * and is also returned in the body so the client can keep it in localStorage as a WS-join fallback.
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { isValidLogin } from "@frankibarber/shared";
import { hashPassword, verifyPassword } from "./hash";
import { createSession, revokeSession, verifySession, SESSION_TTL_MS } from "./session";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "./rateLimit";
import {
  accountById, accountByLogin, createAccount, getProfile, listTournaments, loginExists,
  profileIsEmpty, saveProfile, trophiesForLogin, PROFILE_MAX_BYTES,
} from "./store";

const COOKIE = "bs_sess";
/** Max password length we hash — a guard so no request forces an unbounded scrypt. */
const PASSWORD_MAX = 200;
const PASSWORD_MIN = 6;

/** The best guess at the caller's IP for the (login, ip) rate-limit key. */
function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

/** Read one cookie by name without pulling in a cookie parser. */
function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** Set the session cookie. Secure only in production so local http dev still receives it. */
function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  const attrs = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

/** Clear the session cookie (logout). */
function clearSessionCookie(res: Response): void {
  res.append("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

/** The token as this request carries it: cookie first, then an `Authorization: Bearer` fallback. */
function tokenFromRequest(req: Request): string | undefined {
  const cookie = readCookie(req, COOKIE);
  if (cookie) return cookie;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return undefined;
}

/** Build the router. Body parsing is scoped to this router so the rest of the server is untouched. */
export function accountRoutes(): Router {
  const router = Router();
  router.use(express.json({ limit: "128kb" }));

  // POST /api/register {login,password} -> 201 + cookie / 400 / 409
  router.post("/register", (req, res) => {
    const { login, password } = req.body ?? {};
    if (!isValidLogin(login) || typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: "invalid" });
    }
    if (loginExists(login)) return res.status(409).json({ error: "taken" });
    const id = createAccount(login, hashPassword(password));
    const token = createSession(id);
    setSessionCookie(res, token);
    return res.status(201).json({ login, token });
  });

  // POST /api/login {login,password} -> 200 + cookie / 401 / 429
  router.post("/login", (req, res) => {
    const { login, password } = req.body ?? {};
    const ip = clientIp(req);
    if (typeof login !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "invalid" });
    }
    if (isRateLimited(login, ip)) return res.status(429).json({ error: "too_many" });
    const acct = accountByLogin(login);
    if (!acct || !verifyPassword(password, acct.pass_hash)) {
      recordFailedAttempt(login, ip);
      return res.status(401).json({ error: "bad_credentials" });
    }
    clearAttempts(login, ip);
    const token = createSession(acct.id);
    setSessionCookie(res, token);
    return res.status(200).json({ login: acct.login, token });
  });

  // POST /api/logout -> 204
  router.post("/logout", (req, res) => {
    revokeSession(tokenFromRequest(req));
    clearSessionCookie(res);
    return res.status(204).end();
  });

  // GET /api/me -> {login, profile} / 401
  router.get("/me", (req, res) => {
    const accountId = verifySession(tokenFromRequest(req));
    if (accountId === null) return res.status(401).json({ error: "unauthenticated" });
    const acct = accountById(accountId);
    if (!acct) return res.status(401).json({ error: "unauthenticated" });
    const profileJson = getProfile(accountId);
    return res.status(200).json({ login: acct.login, profile: profileJson ? JSON.parse(profileJson) : null });
  });

  // PUT /api/profile {profile} -> 200 / 401 / 413
  router.put("/profile", (req, res) => {
    const accountId = verifySession(tokenFromRequest(req));
    if (accountId === null) return res.status(401).json({ error: "unauthenticated" });
    const { profile } = req.body ?? {};
    if (profile === undefined || profile === null) return res.status(400).json({ error: "invalid" });
    const json = JSON.stringify(profile);
    if (Buffer.byteLength(json, "utf8") > PROFILE_MAX_BYTES) return res.status(413).json({ error: "too_large" });
    saveProfile(accountId, json);
    return res.status(200).json({ ok: true });
  });

  // POST /api/migrate {profile} -> 200 / 401 / 409 (hard contract: only when server profile is empty)
  router.post("/migrate", (req, res) => {
    const accountId = verifySession(tokenFromRequest(req));
    if (accountId === null) return res.status(401).json({ error: "unauthenticated" });
    if (!profileIsEmpty(accountId)) return res.status(409).json({ error: "not_empty" });
    const { profile } = req.body ?? {};
    if (profile === undefined || profile === null) return res.status(400).json({ error: "invalid" });
    const json = JSON.stringify(profile);
    if (Buffer.byteLength(json, "utf8") > PROFILE_MAX_BYTES) return res.status(413).json({ error: "too_large" });
    saveProfile(accountId, json);
    return res.status(200).json({ ok: true });
  });

  // GET /api/tournaments?limit=50 -> hall of fame (public)
  router.get("/tournaments", (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    return res.status(200).json({ tournaments: listTournaments(Number.isFinite(limit) ? limit : 50) });
  });

  // GET /api/trophies?login= -> trophies on an account (public)
  router.get("/trophies", (req, res) => {
    const login = req.query.login;
    if (typeof login !== "string" || !isValidLogin(login)) return res.status(400).json({ error: "invalid" });
    return res.status(200).json({ login, trophies: trophiesForLogin(login) });
  });

  return router;
}
