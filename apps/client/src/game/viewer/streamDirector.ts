import type { RoomListing } from "../net/Connection";

/**
 * `/viewer?stream=1` — the page a stream PC leaves open all evening (owner's brief 2026-09-27:
 * "instrukcja dla kolegi który będzie streamować … najlepiej jakby samo się robiło").
 *
 * Nobody sits at that machine, so the two things a person does on `/viewer` — pick a room and
 * point the camera — have to be decided here instead. Both are pure: the room is a choice over the
 * `/rooms` listing, the camera is a choice over who is alive and for how long we have been on them.
 * Keeping them out of React and Babylon is what lets the rules be tested without a browser.
 */

/** How long one player holds the shot before the camera moves on, while they stay alive. */
export const HOLD_MS = 12_000;
/** After the followed player dies, stay on the spot this long so the stream sees the kill. */
export const DEATH_LINGER_MS = 2_500;
/** With nobody alive to follow, each map viewpoint gets this long. */
export const SPOT_MS = 8_000;
/** A room with no players in it for this long is abandoned for a livelier one. */
export const EMPTY_ROOM_MS = 20_000;
/** How often the waiting screen asks the server what is running. */
export const POLL_MS = 5_000;

/**
 * The room to broadcast. A named room (`&room=`) is the only candidate — the organiser asked for it
 * — and is taken as soon as it exists. Otherwise the fullest room with somebody in it; a room of
 * nothing but watchers is not a show.
 */
export function pickStreamRoom(rooms: readonly RoomListing[], wanted = ""): RoomListing | undefined {
  if (wanted) return rooms.find((r) => r.metadata?.name === wanted || r.roomId === wanted);
  let best: RoomListing | undefined;
  for (const r of rooms) if (r.clients > 0 && (!best || r.clients > best.clients)) best = r;
  return best;
}

export interface DirectorPlayer { id: string; alive: boolean; score: number }

/** What the camera is doing: riding behind a player, or parked at a map viewpoint. */
export type Shot = { kind: "follow"; id: string } | { kind: "spot"; id: string } | { kind: "none" };

export interface DirectorState {
  shot: Shot;
  /** When the current shot began. */
  since: number;
  /** When the followed player was first seen dead (0 while they live). */
  diedAt: number;
}

export const initialDirector = (now: number): DirectorState => ({ shot: { kind: "none" }, since: now, diedAt: 0 });

/**
 * The next player after `current`, in a stable order, skipping the dead. Ordered by score so the
 * first pick of a match is whoever is doing best, and walked round-robin from there so a stream of
 * a 5 v 5 shows everybody instead of the same leader every twelve seconds.
 */
function nextAlive(players: readonly DirectorPlayer[], current: string): string {
  const order = players.filter((p) => p.alive).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  if (order.length === 0) return "";
  const at = order.findIndex((p) => p.id === current);
  return order[(at + 1) % order.length].id;
}

/**
 * One step of the automatic camera. Returns the same object when nothing should change, so the
 * caller can compare by reference and only touch the scene on a real cut.
 *
 * - Following someone alive: keep them for `HOLD_MS`, then cut to the next alive player.
 * - They died: linger `DEATH_LINGER_MS` on the spot, then cut.
 * - Nobody alive (warm-up, result screen, an empty map): tour the map's viewpoints.
 */
export function direct(s: DirectorState, players: readonly DirectorPlayer[], spots: readonly string[], now: number): DirectorState {
  const anyAlive = players.some((p) => p.alive);

  if (s.shot.kind === "follow") {
    const id = s.shot.id;
    const who = players.find((p) => p.id === id);
    if (who?.alive) {
      if (now - s.since < HOLD_MS) return s;
      const next = nextAlive(players, id);
      return next && next !== id ? { shot: { kind: "follow", id: next }, since: now, diedAt: 0 } : { ...s, since: now };
    }
    // Gone or dead: hold the frame long enough to see why, then move on.
    const diedAt = s.diedAt || now;
    if (now - diedAt < DEATH_LINGER_MS) return s.diedAt ? s : { ...s, diedAt };
  } else if (s.shot.kind === "spot" && !anyAlive && now - s.since < SPOT_MS) {
    return s;
  }

  if (anyAlive) {
    const current = s.shot.kind === "follow" ? s.shot.id : "";
    return { shot: { kind: "follow", id: nextAlive(players, current) }, since: now, diedAt: 0 };
  }
  if (spots.length === 0) return s.shot.kind === "none" ? s : { shot: { kind: "none" }, since: now, diedAt: 0 };
  const at = s.shot.kind === "spot" ? spots.indexOf(s.shot.id) : -1;
  return { shot: { kind: "spot", id: spots[(at + 1) % spots.length] }, since: now, diedAt: 0 };
}
