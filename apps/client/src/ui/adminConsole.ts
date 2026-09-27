import {
  BOT_LEVELS, DUEL_MAP_IDS, MAPS, MAX_BOTS, MODES, MODE_ORDER, MatchPhase, type BotLevel, type GameMode,
} from "@frankibarber/shared";
import { inviteLink, mapChoices } from "./invite";

/**
 * The pure half of the `/viewer` admin console (owner's brief 2026-09-27, "w panelu admina dużo
 * możliwości daj"): what the cards offer, how a row and a number are printed, and the request
 * shape the server's `admin/routes.ts` reads. Kept out of `Viewer.tsx` so the client's node vitest
 * (no jsdom) can pin every choice list and every label without a browser — the React tree only
 * arranges what is decided here.
 */

/**
 * The request headers for an admin call: the key rides as `Authorization: Bearer <key>`, because
 * the Colyseus transport answers the CORS preflight from the Vite origin with a fixed allow-list
 * (Origin, X-Requested-With, Content-Type, Accept, Authorization) — a custom header never gets
 * through it. An empty key is still sent: the server is open then anyway.
 */
export function adminHeaders(key: string): Record<string, string> {
  return { "content-type": "application/json", authorization: `Bearer ${key}` };
}

/** A map's footprint from its own bounds ("64 × 70 m"), so a picker never hard-codes a size. */
export function mapFootprint(id: string): string {
  const b = MAPS[id]?.bounds;
  if (!b) return "";
  return `${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxZ - b.minZ)} m`;
}

export interface MapChoice { id: string; name: string; size: string }

/** The arenas a tournament pair may be played on (Drop W P1: DOLNA by default, GÓRA on request). */
export function duelMapChoices(): MapChoice[] {
  return DUEL_MAP_IDS.filter((id) => Object.hasOwn(MAPS, id)).map((id) => ({ id, name: MAPS[id].name, size: mapFootprint(id) }));
}

/**
 * The modes the SZYBKI MECZ card offers: everything the menu's ZAŁÓŻ can raise. A tournament is
 * not a quick match — the TURNIEJ card raises those through the waiting room — so it is left out.
 */
export function quickModeChoices(): { id: GameMode; name: string }[] {
  return MODE_ORDER.filter((m) => m !== "turniej").map((m) => ({ id: m, name: MODES[m].name }));
}

/** The maps for a quick match of `mode`: a duel picks among its arenas, everything else the shared order. */
export function quickMapChoices(mode: GameMode): MapChoice[] {
  if (mode === "duel") return duelMapChoices();
  return mapChoices().map((m) => ({ ...m, size: mapFootprint(m.id) }));
}

/** The first map the picker should stand on when the mode changes, so a stale pick never rides along. */
export function defaultQuickMap(mode: GameMode): string {
  return quickMapChoices(mode)[0]?.id ?? "";
}

/** The most bots a quick match of `mode` may be filled with — the menu's own rule (a duel: one). */
export function botMaxFor(mode: GameMode): number {
  return mode === "duel" ? 1 : MAX_BOTS;
}

/** The bot levels, in the shared order, for the level picker. */
export const botLevelChoices: readonly BotLevel[] = BOT_LEVELS;

/** The body `POST /api/admin/rooms` reads. Clamped here too, so the UI never sends what the server refuses. */
export function quickMatchBody(mode: GameMode, map: string, room: string, bots: number, botLevel: BotLevel): Record<string, unknown> {
  return { mode, map, room: room.trim().slice(0, 24), bots: Math.max(0, Math.min(botMaxFor(mode), Math.round(bots))), botLevel };
}

/** The link to paste for a quick match: the menu's own invite link, so the opener lands in that room. */
export function quickMatchLink(base: string, room: string, mode: GameMode, map: string): string {
  return inviteLink(base, room, mode, map);
}

/** A room row as `GET /api/admin/rooms` returns it (mirrors the server's `AdminRoomRow`). */
export interface AdminRoomRow {
  roomId: string;
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

/** The Polish word for a phase the table prints — a match's or a waiting room's. */
export function phaseLabel(phase: string): string {
  switch (phase) {
    case MatchPhase.Waiting: return "CZEKA";
    case MatchPhase.Countdown: return "ODLICZANIE";
    case MatchPhase.Playing: return "GRA";
    case MatchPhase.Prep: return "PRZERWA";
    case MatchPhase.Ended: return "KONIEC";
    case "poczekalnia": return "POCZEKALNIA";
    case "trwa": return "TRWA";
    case "koniec": return "KONIEC";
    default: return phase ? phase.toUpperCase() : "—";
  }
}

/** The mode column: the mode's short name, or the room kind when it is a waiting room. */
export function modeLabel(row: Pick<AdminRoomRow, "kind" | "mode">): string {
  if (row.kind === "tournament-lobby") return "TURNIEJ";
  const m = row.mode as GameMode;
  return MODES[m]?.short ?? row.mode.toUpperCase() ?? "—";
}

/** The map column: the map's own name, or the id when the build does not know it. */
export function mapLabel(id: string): string {
  return MAPS[id]?.name ?? id ?? "—";
}

/** "3 / 12" with the watchers appended when there are any ("3 / 12 · 2 widzów"). */
export function occupancyLabel(row: Pick<AdminRoomRow, "players" | "slots" | "watching">): string {
  const base = `${row.players} / ${row.slots}`;
  return row.watching > 0 ? `${base} · ${row.watching} ${row.watching === 1 ? "widz" : "widzów"}` : base;
}

/** Seconds of uptime as "2 d 03:04:05" / "03:04:05". */
export function uptimeLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hms = [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
  return d > 0 ? `${d} d ${hms}` : hms;
}

/** What `/health` says, as the SERWER block reads it. Missing pieces print as dashes, never throw. */
export interface HealthInfo {
  ok?: boolean;
  version?: string;
  uptime?: number;
  players?: number;
  rooms?: number;
  tick?: { maxMs?: number; meanMs?: number; ticks?: number };
}

/** The SERWER block's rows, in order, from a `/health` body (or none). */
export function healthRows(h: HealthInfo | null): { label: string; value: string }[] {
  const num = (v: unknown, unit = "") => (typeof v === "number" && Number.isFinite(v) ? `${v}${unit}` : "—");
  return [
    { label: "gracze", value: num(h?.players) },
    { label: "pokoje", value: num(h?.rooms) },
    { label: "tick max", value: num(h?.tick?.maxMs, " ms") },
    { label: "tick średni", value: num(h?.tick?.meanMs, " ms") },
    { label: "uptime", value: h && typeof h.uptime === "number" ? uptimeLabel(h.uptime) : "—" },
    { label: "wersja", value: h?.version ?? "—" },
  ];
}

/** The console's refresh cadence: the table and the health block re-read together. */
export const ADMIN_REFRESH_MS = 5000;
