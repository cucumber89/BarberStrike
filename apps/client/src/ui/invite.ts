import { DEFAULT_MAP_ID, isGameMode, MAP_ORDER, MAPS, type GameMode } from "@frankibarber/shared";

/**
 * Invite links (2.1): the room name and mode in the page URL.
 *
 * "Everyone types the same room name" was the whole join flow, and it is where friends lose each
 * other: one types `late shift`, one `lateshift`, one `late-shift`. A link carries the name for
 * them. The link is the page's own address plus a query, so it works wherever the page is served
 * from — a tunnel, a hosted deployment, a LAN address — because the origin IS the server.
 */

/**
 * `viaLink` is true when the room came from the address itself — `/r/<room>` (Drop D) — which is
 * the "I was sent here" case: the lobby then asks for a nickname and nothing else.
 */
export interface Invite { room: string; mode: GameMode | null; map: string | null; join: string | null; viaLink: boolean }

const ROOM_MAX = 24;

/** A map id the build actually has. An unknown one is not an error: the lobby falls back to its default. */
export const isMapId = (id: string | null | undefined): id is string => !!id && Object.hasOwn(MAPS, id);

/** What the lobby's map picker offers, in the shared order, each with the name the map calls itself. */
export function mapChoices(): { id: string; name: string }[] {
  return MAP_ORDER.filter(isMapId).map((id) => ({ id, name: MAPS[id].name }));
}

/** The room a `/r/<room>` path names, or "" for any other path. Percent-encoding is undone; garbage is not. */
export function roomFromPath(pathname: string): string {
  const m = /^\/r\/([^/]+)\/?$/.exec(pathname ?? "");
  if (!m) return "";
  let seg = m[1];
  try { seg = decodeURIComponent(seg); } catch { /* a stray %: keep it as typed */ }
  return seg.trim().slice(0, ROOM_MAX);
}

/**
 * What the URL asks for. The room is the `/r/<room>` path (Drop D, join by link) or the older
 * `?room=` query; the mode and the map (Drop G) always ride in the query. Unknown or empty parts
 * are simply absent; nothing here throws.
 */
export function parseInvite(search: string, pathname = ""): Invite {
  const q = new URLSearchParams(search);
  const fromPath = roomFromPath(pathname);
  const room = fromPath || (q.get("room") ?? "").trim().slice(0, ROOM_MAX);
  const mode = q.get("mode");
  const map = q.get("map");
  const join = (q.get("join") ?? "").trim();
  return { room, mode: isGameMode(mode) ? mode : null, map: isMapId(map) ? map : null, join: join || null, viaLink: fromPath.length > 0 };
}

/**
 * The link to share for a named room: `<origin>/r/<room>?mode=<mode>&map=<map>` (mode and map ride
 * along so the matchmaker lands everyone in the same room — two people on one room name but
 * different maps are two rooms). Without a room it is the page with only those two, so quick play
 * still matches anyone.
 */
export function inviteLink(base: string, room: string, mode: GameMode, map: string = DEFAULT_MAP_ID): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  const name = room.trim();
  url.pathname = name ? `/r/${encodeURIComponent(name)}` : "/";
  url.search = new URLSearchParams({ mode, map: isMapId(map) ? map : DEFAULT_MAP_ID }).toString();
  return url.toString();
}

/** A room name nobody will collide with by accident: two words and a number, readable out loud. */
export function suggestRoomName(rand: () => number = Math.random): string {
  const a = ["late", "night", "fresh", "sharp", "razor", "velvet", "brass", "neon", "quiet", "loud"];
  const b = ["shift", "fade", "taper", "cut", "shave", "trim", "pole", "chair", "mirror", "comb"];
  const pick = (xs: string[]) => xs[Math.floor(rand() * xs.length) % xs.length];
  return `${pick(a)}-${pick(b)}-${Math.floor(rand() * 90 + 10)}`;
}

/** Copies text; resolves false where the clipboard is unavailable (plain http on a LAN address, for one). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Whether this page is reachable by other people as it is. A hosted deployment or a tunnel is;
 * `localhost` and the dev port are not — those need the hosting steps.
 */
export function isSharedOrigin(loc: { protocol: string; hostname: string; port: string }): boolean {
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(loc.hostname)) return false;
  if (loc.port === "5174") return false; // the Vite dev server, which talks to :2567 on this machine
  return true;
}
