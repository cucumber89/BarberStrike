import type { GameMode } from "@frankibarber/shared";

/**
 * Invite links (2.1): the room name and mode in the page URL.
 *
 * "Everyone types the same room name" was the whole join flow, and it is where friends lose each
 * other: one types `late shift`, one `lateshift`, one `late-shift`. A link carries the name for
 * them. The link is the page's own address plus a query, so it works wherever the page is served
 * from — a tunnel, a hosted deployment, a LAN address — because the origin IS the server.
 */

export interface Invite { room: string; mode: GameMode | null; join: string | null }

const MODES = new Set<GameMode>(["tdm", "ffa", "dom", "bomb"]);

/** What the URL asks for. Unknown or empty parts are simply absent; nothing here throws. */
export function parseInvite(search: string): Invite {
  const q = new URLSearchParams(search);
  const room = (q.get("room") ?? "").trim().slice(0, 24);
  const mode = q.get("mode");
  const join = (q.get("join") ?? "").trim();
  return { room, mode: mode && MODES.has(mode as GameMode) ? (mode as GameMode) : null, join: join || null };
}

/** The link to share for a named room (the mode rides along so the matchmaker lands everyone in the same room). */
export function inviteLink(base: string, room: string, mode: GameMode): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  const q = new URLSearchParams();
  if (room.trim()) q.set("room", room.trim());
  q.set("mode", mode);
  url.search = q.toString();
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
