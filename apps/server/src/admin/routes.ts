/**
 * The tournament ADMIN console's REST (owner's brief 2026-09-27, "w panelu admina dużo możliwości
 * daj"): everything the `/viewer` console may do to the server, in one router mounted under `/api`.
 *
 * WHY a REST router and not room messages: the console has no seat in any room and must act on
 * rooms it is not in (end a match it only watches, raise a match for other people). The matchmaker
 * is the one place that can reach every room in the process (`matchMaker.remoteRoomCall`), so the
 * console talks to it over HTTP and the rooms learn nothing new — no schema field, no message type
 * a forged client could send without the key (MAP_1_REWORK §3).
 *
 * WHY one gate: the same `ADMIN_PASSWORD` that `TournamentLobbyRoom.onCreate` checks. With no
 * password on the server (dev) the console is open, exactly as `/admin/verify` has always said;
 * with one set, every mutating route here demands it, as a header (`x-admin-key`) or in the body.
 * The UI gate alone would be theatre: a `curl` skips the UI.
 */
import { Router, type Request, type RequestHandler } from "express";
import express from "express";
import { matchMaker, type IRoomCache } from "@colyseus/core";
import { MAPS, MATCH, MAX_BOTS, isBotLevel, isGameMode, type BotLevel, type GameMode } from "@frankibarber/shared";

/**
 * The console sends its key as `Authorization: Bearer <key>` — the one custom-ish header the
 * Colyseus transport's own CORS preflight lets through from the Vite origin (its allow-list is
 * fixed: Origin, X-Requested-With, Content-Type, Accept, Authorization; Express's `cors` never sees
 * the OPTIONS). `x-admin-key` and a body field are read too, for curl and the verify form.
 */
export const ADMIN_KEY_HEADER = "x-admin-key";

/**
 * How long a match the console raised waits for its first player before Colyseus disposes it. The
 * matchmaker's own grace is the seat-reservation time (15 s): fine for a room somebody is joining
 * this second, useless for a link that is about to be pasted into a Discord channel. Ten minutes
 * is long enough to gather people and short enough that a forgotten room does not live all night —
 * once anybody has joined, the ordinary "empty → dispose" rule takes over.
 */
export const ADMIN_ROOM_GRACE_S = 600;

/** The key a request carries: the bearer header (the console), then `x-admin-key`, then the body. */
export function adminKeyOf(req: Pick<Request, "headers" | "body">): string {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const h = req.headers[ADMIN_KEY_HEADER];
  if (typeof h === "string" && h.length) return h;
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.adminKey === "string") return body.adminKey;
  if (typeof body.password === "string") return body.password;
  return "";
}

/** Open when the server has no password; otherwise the key must match it exactly. */
export function adminAllowed(key: string, password: string | undefined = process.env.ADMIN_PASSWORD): boolean {
  const admin = password ?? "";
  return !admin || key === admin;
}

/** What `POST /api/admin/rooms` creates: the same options `TdmRoom.onCreate` reads from the menu's ZAŁÓŻ. */
export interface QuickRoomOptions {
  mode: GameMode;
  map: string;
  room: string;
  bots: number;
  botLevel: BotLevel;
}

const ROOM_NAME_MAX = 24;

/**
 * Validate a quick-match request into room options, or `null` when it asks for something the
 * server would not build. A tournament (`turniej`) is not a quick match — the waiting room raises
 * those — and a map the build does not have is refused rather than silently defaulted, because
 * the console shows the link with the map in it and the link must say the truth.
 */
export function quickRoomOptions(body: unknown): QuickRoomOptions | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const mode = b.mode;
  if (!isGameMode(mode) || mode === "turniej") return null;
  const map = typeof b.map === "string" ? b.map : "";
  if (!Object.hasOwn(MAPS, map)) return null;
  const rawRoom = typeof b.room === "string" ? b.room.trim().slice(0, ROOM_NAME_MAX) : "";
  const room = rawRoom || `mecz-${Date.now().toString(36).slice(-4)}`;
  const botsRaw = typeof b.bots === "number" ? b.bots : Number(b.bots ?? 0);
  const bots = Number.isFinite(botsRaw) ? Math.max(0, Math.min(MAX_BOTS, Math.round(botsRaw))) : 0;
  const botLevel: BotLevel = isBotLevel(b.botLevel) ? b.botLevel : "normal";
  return { mode, map, room, bots, botLevel };
}

/** One row of the console's MECZE table: a matchmaker listing plus the phase only the room knows. */
export interface AdminRoomRow {
  roomId: string;
  /** `tdm` (a match) or `tournament-lobby` (a waiting room). */
  kind: string;
  name: string;
  mode: string;
  map: string;
  players: number;
  slots: number;
  watching: number;
  bots: number;
  locked: boolean;
  phase: string;
}

/** The row for a listing. Pure, so the shape the console reads is pinned by a test without a server. */
export function adminRoomRow(r: IRoomCache, phase: string): AdminRoomRow {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const players = typeof meta.players === "number" ? meta.players : r.clients;
  return {
    roomId: r.roomId,
    kind: r.name,
    name: typeof meta.name === "string" ? meta.name : "",
    mode: typeof meta.mode === "string" ? meta.mode : r.name === "tournament-lobby" ? "turniej" : "",
    map: typeof meta.map === "string" ? meta.map : "",
    players,
    slots: typeof meta.slots === "number" ? meta.slots : r.maxClients,
    watching: Math.max(0, r.clients - players),
    bots: typeof meta.bots === "number" ? meta.bots : 0,
    locked: r.locked === true,
    phase,
  };
}

/**
 * `remoteRoomCall` is typed against `Room`'s public keys; `endMatch` is the match's own (private in
 * TypeScript, plain at runtime — the call goes by name, over IPC when the room is elsewhere).
 */
type RoomByName = Record<string, unknown>;

/** The replicated phase of a room in THIS process, or "" for one we cannot see (another process). */
function phaseOf(roomId: string): string {
  const room = matchMaker.getLocalRoomById(roomId) as { state?: { phase?: unknown } } | undefined;
  const phase = room?.state?.phase;
  return typeof phase === "string" ? phase : "";
}

/**
 * How ZAKOŃCZ ends a room: a match with people in it gets its result screen (the same `endMatch`
 * the clock and `dev:endmatch` reach) and closes after it; an empty room, or a waiting room, closes
 * now. Pure — the timing rule is what a test pins.
 */
export function endPlan(kind: string, clients: number): { endMatch: boolean; closeInMs: number } {
  const isMatch = kind === "tdm";
  return { endMatch: isMatch, closeInMs: isMatch && clients > 0 ? MATCH.endedMs : 0 };
}

/** Build the router. Body parsing is scoped here, like the accounts router's, so nothing else changes. */
export function adminRoutes(): Router {
  const router = Router();
  router.use(express.json({ limit: "16kb" }));

  // POST /api/admin/verify {password} -> 200 {ok, open} / 401 — the console's gate. With no
  // ADMIN_PASSWORD on the server (dev) the console is open and says so (`open: true`).
  router.post("/admin/verify", (req, res) => {
    const open = !(process.env.ADMIN_PASSWORD ?? "");
    if (adminAllowed(adminKeyOf(req))) return res.json({ ok: true, open });
    return res.status(401).json({ ok: false });
  });

  // Every route below needs the key when one is set. The check is per request, not cached, so a
  // password set after boot is honoured on the next call.
  const gate: RequestHandler = (req, res, next) => {
    if (adminAllowed(adminKeyOf(req))) return next();
    return res.status(401).json({ error: "admin_key" });
  };

  // GET /api/admin/rooms -> {rooms: AdminRoomRow[]}: every match AND waiting room, locked or not,
  // with its phase. `/rooms` stays the public browser (unlocked tdm only); the console sees all.
  router.get("/admin/rooms", gate, async (_req, res) => {
    try {
      const [matches, lobbies] = await Promise.all([matchMaker.query({ name: "tdm" }), matchMaker.query({ name: "tournament-lobby" })]);
      const rows = [...matches, ...lobbies].map((r) => adminRoomRow(r, phaseOf(r.roomId)));
      return res.json({ rooms: rows });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/admin/rooms {mode,map,room,bots,botLevel} -> 201 {roomId,...}: an ordinary open match,
  // created through the matchmaker with the options the menu's ZAŁÓŻ sends, held open for a while.
  router.post("/admin/rooms", gate, async (req, res) => {
    const opts = quickRoomOptions(req.body);
    if (!opts) return res.status(400).json({ error: "invalid" });
    try {
      const listing = await matchMaker.createRoom("tdm", { ...opts });
      // Colyseus keeps `resetAutoDisposeTimeout` private in its typings; by name it is the same call
      // `_onCreate` just made with the 15 s default, and it works over IPC for a room elsewhere.
      await matchMaker.remoteRoomCall<RoomByName>(listing.roomId, "resetAutoDisposeTimeout", [ADMIN_ROOM_GRACE_S]);
      return res.status(201).json({ roomId: listing.roomId, ...opts });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  // POST /api/admin/rooms/:id/end -> 200 {ok, closesInMs} / 404: end the match through the room's own
  // `endMatch` (result screen, tournament result publish — the path `dev:endmatch` reaches on the
  // next tick), lock it so nobody new walks in, and close it once the result screen has been seen.
  router.post("/admin/rooms/:id/end", gate, async (req, res) => {
    const roomId = String(req.params.id ?? "");
    const listing = (await matchMaker.query({ roomId }))[0];
    if (!listing) return res.status(404).json({ error: "no_room" });
    const local = matchMaker.getLocalRoomById(roomId);
    const plan = endPlan(listing.name, local?.clients.length ?? listing.clients);
    try {
      if (plan.endMatch) await matchMaker.remoteRoomCall<RoomByName>(roomId, "endMatch");
      await matchMaker.remoteRoomCall<RoomByName>(roomId, "lock");
      const close = () => matchMaker.remoteRoomCall<RoomByName>(roomId, "disconnect").catch(() => { /* already gone */ });
      if (plan.closeInMs > 0) setTimeout(() => void close(), plan.closeInMs).unref?.();
      else await close();
      return res.json({ ok: true, roomId, closesInMs: plan.closeInMs });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
