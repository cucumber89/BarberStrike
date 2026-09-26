import { isValidLogin, type AccountDTO, type TournamentRecord, type Trophy } from "@frankibarber/shared";
import { defaultServerUrl, httpUrl } from "../game/net/Connection";
import { setProfileSync, type Profile } from "../game/progression/profile";
import { account } from "./account";

/**
 * The client half of the accounts REST contract — drop V (P6).
 *
 * Every call goes to `/api/*` on the game server (same origin in production, `:2567` in dev), with
 * `credentials: "include"` so the HttpOnly `bs_sess` cookie the server sets on login rides along on
 * every subsequent request. The server is authoritative for sessions; the client keeps no token of
 * its own here — the cookie is the session.
 *
 * The pure pieces (`apiUrl`, `readError`, `PROFILE_MAX_BYTES`, `profileTooBig`) are exported so the
 * unit test can pin the contract without a live backend; the `fetch` wrappers are the thin I/O layer
 * P6's e2e (`account.mjs`, `profile.mjs`) drives against the real P4 server.
 */

/** The REST base beside the WebSocket server, e.g. `http://localhost:2567`. */
export const apiBase = (): string => httpUrl(defaultServerUrl());

/** Joins the API base and a path, tolerating a leading slash on the path. */
export const apiUrl = (path: string): string => `${apiBase()}/api/${path.replace(/^\/+/, "")}`;

/** `PUT /api/profile` rejects blobs over 64 kB (spec 4.3); the client checks first to fail fast. */
export const PROFILE_MAX_BYTES = 64 * 1024;

/** True when a profile serialises to more than the server will accept — a guard before the request. */
export function profileTooBig(profile: Profile): boolean {
  try {
    return new Blob([JSON.stringify(profile)]).size > PROFILE_MAX_BYTES;
  } catch {
    // No Blob (old runtime / node test): fall back to the UTF-16-ish byte count, which only ever
    // over-estimates, so a borderline profile errs on the side of "too big" rather than a 413.
    return JSON.stringify(profile).length > PROFILE_MAX_BYTES;
  }
}

/** One place that turns any thrown value into a Polish message for `account-error`. */
export function readError(e: unknown): string {
  if (e instanceof AuthError) return e.message;
  return "Serwer nieosiągalny — spróbuj ponownie.";
}

/** A REST failure that already carries a human message and the HTTP status behind it. */
export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AuthError";
  }
}

/** The Polish sentence for each status the auth routes return, keyed by the route it came from. */
function messageFor(status: number, kind: "register" | "login" | "profile" | "migrate"): string {
  if (status === 409 && kind === "register") return "Ta ksywka jest już zajęta.";
  if (status === 409 && kind === "migrate") return "Konto ma już zapisany postęp — migracja pominięta.";
  if (status === 401) return "Zła ksywka albo hasło.";
  if (status === 429) return "Za dużo prób. Odczekaj chwilę i spróbuj znów.";
  if (status === 413) return "Profil jest za duży, żeby go zapisać.";
  if (status >= 500) return "Serwer ma problem. Spróbuj później.";
  return "Coś poszło nie tak.";
}

async function req(path: string, init: RequestInit, kind: "register" | "login" | "profile" | "migrate"): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { credentials: "include", ...init });
  } catch {
    throw new AuthError("Serwer nieosiągalny — spróbuj ponownie.", 0);
  }
  if (!res.ok) throw new AuthError(messageFor(res.status, kind), res.status);
  return res;
}

const jsonInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** `POST /api/register` — creates the account and signs it in (cookie). Returns who is signed in. */
export async function register(login: string, password: string): Promise<AccountDTO> {
  if (!isValidLogin(login)) throw new AuthError("Ksywka: 3–20 znaków, małe litery, cyfry i _.", 0);
  await req("register", jsonInit({ login, password }), "register");
  return me();
}

/** `POST /api/login` — 200 + cookie on success. Returns who is signed in. */
export async function login(loginName: string, password: string): Promise<AccountDTO> {
  if (!isValidLogin(loginName)) throw new AuthError("Ksywka: 3–20 znaków, małe litery, cyfry i _.", 0);
  await req("login", jsonInit({ login: loginName, password }), "login");
  return me();
}

/** `POST /api/logout` — drops the session server-side; the cookie is cleared by the response. */
export async function logout(): Promise<void> {
  await req("logout", { method: "POST" }, "login");
}

/**
 * `GET /api/me` — who is signed in, and their stored profile.
 *
 * Returns `null` for a guest (401) rather than throwing, because "not signed in" is the ordinary
 * boot state, not an error the panel should show.
 */
export async function me(): Promise<AccountDTO> {
  const res = await req("me", { method: "GET" }, "login");
  const body = (await res.json()) as { login: string; createdAt?: number; profile?: Profile };
  return { login: body.login, createdAt: body.createdAt ?? 0 };
}

/** Like `me`, but a signed-out server (401) is the answer `null`, not a throw — used on boot. */
export async function fetchMe(): Promise<{ account: AccountDTO; profile: Profile | null } | null> {
  try {
    const res = await fetch(apiUrl("me"), { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as { login: string; createdAt?: number; profile?: Profile | null };
    return { account: { login: body.login, createdAt: body.createdAt ?? 0 }, profile: body.profile ?? null };
  } catch {
    return null;
  }
}

/** `PUT /api/profile` — overwrite the stored profile. Refuses locally if it is over 64 kB. */
export async function putProfile(profile: Profile): Promise<void> {
  if (profileTooBig(profile)) throw new AuthError("Profil jest za duży, żeby go zapisać.", 413);
  await req("profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile }) }, "profile");
}

/**
 * `POST /api/migrate` — copy the local profile up, but only onto an empty server profile.
 *
 * A 409 (the server already has progress) is the documented "no" of this route, not a crash: the
 * caller shows "already has progress" and moves on, so migrating from a second device cannot clobber
 * the cloud.
 */
export async function migrate(profile: Profile): Promise<void> {
  await req("migrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile }) }, "migrate");
}

/** `GET /api/tournaments?limit=` — the public hall of fame, newest first. */
export async function fetchTournaments(limit = 50): Promise<TournamentRecord[]> {
  const res = await fetch(apiUrl(`tournaments?limit=${encodeURIComponent(String(limit))}`), { credentials: "include" });
  if (!res.ok) return [];
  // The route answers `{ tournaments: [...] }` (routes.ts); tolerate a bare array too.
  const body = (await res.json()) as TournamentRecord[] | { tournaments?: TournamentRecord[] };
  return Array.isArray(body) ? body : body.tournaments ?? [];
}

/** `GET /api/trophies?login=` — the trophies on one account, public. */
export async function fetchTrophies(login: string): Promise<Trophy[]> {
  const res = await fetch(apiUrl(`trophies?login=${encodeURIComponent(login)}`), { credentials: "include" });
  if (!res.ok) return [];
  // The route answers `{ login, trophies: [...] }` (routes.ts); tolerate a bare array too.
  const body = (await res.json()) as Trophy[] | { trophies?: Trophy[] };
  return Array.isArray(body) ? body : body.trophies ?? [];
}

/**
 * The boot probe: ask the server who we are, and reflect it into the store.
 *
 * Called once on client start. A guest (or an unreachable server) leaves the store's `account` as
 * `null`, which is exactly the guest state the UI already renders.
 */
export async function refreshMe(): Promise<void> {
  const who = await fetchMe();
  account.setAccount(who?.account ?? null);
}

/** How long `saveProfile` coalesces cloud writes before one `PUT /api/profile` goes out. */
export const PROFILE_PUSH_DEBOUNCE_MS = 1500;

/**
 * Wires `profile.ts`'s save chokepoint to the account store and the cloud.
 *
 * Called once on client boot. From then on a signed-in player's `saveProfile` also schedules a
 * debounced `PUT /api/profile`; a guest's does nothing here. A failed push is swallowed — the local
 * save already succeeded, and the next save will try again.
 */
export function installProfileSync(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: Profile | null = null;
  setProfileSync({
    isLoggedIn: () => account.isLoggedIn(),
    push: (p: Profile) => {
      latest = p;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const p2 = latest;
        latest = null;
        if (p2 && account.isLoggedIn()) void putProfile(p2).catch(() => { /* offline / 413: local copy stands */ });
      }, PROFILE_PUSH_DEBOUNCE_MS);
    },
  });
}
